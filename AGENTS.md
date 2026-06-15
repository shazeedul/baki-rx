# AGENTS.md — Baki Rx Ledger

**Single source of truth for AI agents. Read in full before changes.**

---

## 1. Project Identity

- **App Name:** Baki Rx Ledger
- **Type:** Multi-tenant, local-first SaaS
- **Platform:** Android (React Native / Expo SDK)
- **Domain:** Pharmacy credit (baki/due) management across multiple branch users
- **Core Constraint:** The app must function 100% offline. The internet is optional, never a dependency.

---

## 2. Tech Stack

| Layer                 | Technology                                               |
| --------------------- | -------------------------------------------------------- |
| **Framework**         | React Native (Expo SDK, targeting Android)               |
| **Local DB**          | `expo-sqlite` (Primary execution layer)                  |
| **Cloud DB**          | Supabase (PostgreSQL)                                    |
| **Auth**              | Local Bcrypt (Offline) — Supabase anon key for sync only |
| **Network Detection** | `@react-native-community/netinfo`                        |
| **HTTP Client**       | Supabase JS SDK — Swappable with native `fetch`/`axios`  |
| **State Management**  | Zustand (Global persistence core)                        |
| **Navigation**        | React Navigation v6 (Stack + Drawer + Bottom Tab)        |

---

## 3. Repository Structure

Aligned with official [Expo Folder Structure Best Practices](https://expo.dev/blog/expo-app-folder-structure-best-practices):

```text
/
├── src/
│   ├── app/                    # Expo Router minimal entry points ONLY
│   │   ├── _layout.tsx         # Root layout (Auth guarding & primary navigation wrapper)
│   │   ├── index.tsx           # Imports and returns Home screen
│   │   ├── login.tsx           # Imports and returns Login screen
│   │   ├── entry.tsx           # Imports and returns Entry screen
│   │   ├── report.tsx          # Imports and returns Report screen
│   │   └── tenant-sync.tsx     # Imports and returns Tenant Sync screen
│   ├── screens/                # UI Screens (isolates components from router)
│   │   ├── home/
│   │   │   ├── index.tsx
│   │   │   └── components/     # Home-specific colocated components
│   │   ├── login/
│   │   │   └── index.tsx
│   │   ├── entry/
│   │   │   └── index.tsx
│   │   ├── report/
│   │   │   └── index.tsx
│   │   ├── customer-ledger/
│   │   │   └── index.tsx
│   │   └── tenant-sync/
│   │       └── index.tsx
│   ├── components/             # Reusable global UI components
│   │   ├── AddCustomerDrawer.tsx
│   │   ├── CustomerSearchDropdown.tsx
│   │   └── SyncStatusBadge.tsx
│   ├── db/
│   │   ├── schema.ts           # SQLite schema generation scripts
│   │   ├── migrations/         # Upward/Downward version tracking files
│   │   └── queries/            # Isolated database statement wrappers
│   ├── sync/
│   │   └── SyncEngine.ts       # Non-blocking state replication worker
│   ├── store/
│   │   ├── authStore.ts        # Session data: token, user_id, store_id, tenant_id
│   │   └── syncStore.ts        # Performance state: metrics, timing, item counts
│   ├── services/
│   │   └── cloudAdapter.ts     # Abstraction barrier separating Supabase SDK
│   └── constants/
│       └── theme.ts            # Layout parameters and style palette tokens
├── .env                        # Non-committed environment config values
├── .env.example                # Safe version tracking template indicators
├── package.json
└── AGENTS.md                   # This instruction file
```

---

## 4. Architecture: Local-First Hybrid

### The Golden Rule

**The UI never awaits a network response to render.** All application data reads target the local SQLite storage engine exclusively.

### Non-Blocking Write Cycle

**Write Flow:**

```
User Action
→ Write mutation directly to SQLite with is_dirty = 1
→ Update visual interface states instantly (0ms network delay)
→ SyncEngine background worker picks up rows marking active dirty flags
→ Push delta payloads up to cloud environment targets
→ On verified 200 OK receipt: flip target row is_dirty values back to 0
```

### Authentication & Multi-Store Flow

All credential verification happens offline against local SQLite. The cloud is never consulted during login. Supabase is used only for background sync via the anon key — data isolation is enforced by explicit `store_id`/`tenant_id` filters in every query, not by RLS.

```plaintext
Step 1: User selects Tenant from dropdown (populated from locally synced tenants)
                         │
                         ▼
Step 2: User enters Mobile Number + Password/PIN
                         │
                         ▼
             Query local SQLite users table:
    SELECT * FROM users WHERE tenant_id = ? AND phone = ?
                         │
        ┌────────────────┴────────────────┐
        ▼                                 ▼
   [ ROW FOUND ]                   [ ROW NOT FOUND ]
        │                                 │
  Verify Password/PIN offline against     Show error: "Account not found
  local password_hash (Bcrypt format)     for this tenant on this device."
        │
  ┌─────┴──────────────┐
  ▼                    ▼
[ MATCH ]         [ MISMATCH ] → Show "Incorrect Password" error
  │
  ▼
Session Initialization:
1. Read user.default_store_id as the primary active session
2. Populate authStore:
   {
     tenant_id: user.tenant_id,
     store_id:  user.default_store_id,
     user_id:   user.id
   }
3. Direct UI routing to Home Dashboard immediately (0ms network delay)
4. SyncEngine runs in background using the Supabase anon key
```

#### Multi-Store Session Flipping

Because access configurations map through the local `user_stores` join table, users switch active branches inside application navigation drawers without triggering secondary logout actions. Overwriting `authStore.store_id` updates all localized transactional filters instantly.

#### `SyncEngine.syncUsers()` Protocol

```typescript
async syncUsers(tenantId: string): Promise<void> {
  const { users, userStores } = await cloudAdapter.pullTenantRoster(tenantId);
  if (!users || users.length === 0) return;

  await db.transaction(async (tx) => {
    // Overwrite profile details unconditionally during bootstrap routines
    await tx.upsertUsers(users);
    await tx.clearAndRebuildUserStores(tenantId, userStores);
  });

  syncStore.setState({ lastUserSyncedAt: new Date().toISOString() });
}
```

### Delta Math Tracking

Never push computed summary values across network layers. Sync raw transactional entries independently:

```json
{ "entry_type": "sale", "total_amount": 1500 }
{ "entry_type": "collection", "paid_amount": 500 }
```

Balances compute responsively inside local queries by aggregating matching delta paths.

---

## 5. Database Schema

### 5a. SQLite (Local)

```sql
CREATE TABLE IF NOT EXISTS tenants (
  id            TEXT PRIMARY KEY,   -- Cloud-matched UUID string identifier
  business_name TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone            TEXT NOT NULL,
  password_hash    TEXT NOT NULL,       -- Bcrypt hash synced from cloud public.users
  default_store_id TEXT NOT NULL,
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_stores (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id  TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  is_dirty    INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id               TEXT PRIMARY KEY,
  store_id         TEXT NOT NULL,
  customer_id      TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  entry_type       TEXT NOT NULL CHECK(entry_type IN ('sale','collection')),
  total_amount     REAL NOT NULL,
  paid_amount      REAL NOT NULL DEFAULT 0,
  due_amount       REAL GENERATED ALWAYS AS (total_amount - paid_amount) VIRTUAL,
  note             TEXT,
  transaction_date TEXT NOT NULL,       -- User picked operational window (YYYY-MM-DD)
  is_dirty         INTEGER DEFAULT 1,
  created_at       TEXT DEFAULT (datetime('now')) -- Absolute structural machine log time
);

CREATE INDEX idx_users_lookup       ON users(tenant_id, phone);
CREATE INDEX idx_user_stores_map    ON user_stores(user_id);
CREATE INDEX idx_customers_branch   ON customers(store_id);
CREATE INDEX idx_ledger_sync        ON ledger_entries(store_id, is_dirty);
CREATE INDEX idx_ledger_timeline    ON ledger_entries(customer_id, transaction_date DESC);
```

### 5b. Supabase (Cloud)

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  store_name  TEXT NOT NULL,
  location    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY stores_tenant_isolation ON public.stores
  FOR SELECT USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);

CREATE TABLE IF NOT EXISTS public.users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone            TEXT NOT NULL,
  password_hash    TEXT NOT NULL,
  default_store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT       unique_tenant_phone UNIQUE (tenant_id, phone)
);

CREATE TABLE IF NOT EXISTS public.user_stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT  unique_user_store UNIQUE (user_id, store_id)
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_tenant_isolation ON public.users
  FOR SELECT USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);

CREATE POLICY user_stores_tenant_isolation ON public.user_stores
  FOR SELECT USING (store_id IN (
    SELECT id FROM public.stores WHERE tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid
  ));

CREATE TABLE IF NOT EXISTS public.customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_store_isolation ON public.customers
  USING (store_id = (auth.jwt() -> 'user_metadata' ->> 'store_id')::uuid);

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  customer_id      UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  entry_type       TEXT NOT NULL CHECK (entry_type IN ('sale', 'collection')),
  total_amount     NUMERIC(12, 2) NOT NULL,
  paid_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note             TEXT,
  transaction_date DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ledger_store_isolation ON public.ledger_entries
  USING (store_id = (auth.jwt() -> 'user_metadata' ->> 'store_id')::uuid);

-- Users are managed directly in public.users (no auth.users dependency).
-- Insert users via admin scripts or a dedicated onboarding API.
-- Passwords must be pre-hashed with bcrypt before inserting:
--   INSERT INTO public.users (tenant_id, phone, password_hash, default_store_id)
--   VALUES (..., ..., '$2b$10$...bcrypt_hash...', ...);
```

---

## 6. Cloud Adapter (API Boundary)

**File:** `src/services/cloudAdapter.ts`

Structural Rule: No file outside this module may reference the Supabase client or call `supabase.*` directly.
Payload Interception: All network transport is managed inside this layer. Swapping to a custom VM backend only requires changes here.

A single anon-key Supabase client is used for all operations. Data isolation is enforced by explicit `store_id`/`tenant_id` filters in every query — not by RLS.

```typescript
// Pseudo
cloudAdapter.pullTenants(); // fetch all tenants (bootstrap)
cloudAdapter.findTenantByName(name); // fetch tenant details by exact or partial name match online
cloudAdapter.pullTenantRoster(tenantId); // fetch users + user_stores for tenant
cloudAdapter.upsertCustomers(rows); // push dirty customers
cloudAdapter.upsertLedgerEntries(rows); // push dirty ledger entries
cloudAdapter.pullLedgerSince(storeId, since); // delta pull ledger
cloudAdapter.pullCustomersSince(storeId, since); // delta pull customers
```

---

## 7. App Screens & Component Contracts

7a. Login Screen — (auth)/login.tsx
Provides sequential organizational scope gating to credential fields.
Tenant Selector Dropdown: Pulls local tenants metadata records to display brand groups. Gated input fields block activity until this contains a target ID value.
Mobile Input: Targets specific country number parsing boundaries. Matches keyboardType="phone-pad".
Password Input: Uses masked security input fields (secureTextEntry). Evaluates plain strings against Bcrypt values matching the local SQLite device records cache instantly.

7b. Home / Dashboard — (tabs)/index.tsx
Displays aggregations derived from raw transactional items inside local records: SUM(total_amount) - SUM(paid_amount).
Renders the "Top 20 Defaulters" list responsively by joining tables locally.

7c. Transaction Entry Sheet — (tabs)/entry.tsx
Implements CustomerSearchDropdown querying local data via parameterized filters, with input entries debounced by 300ms.
Displays responsive due amounts using calculated fields: due = totalBill - paidAmount.

7d. Report Filter Matrix — (tabs)/report.tsx
Implements scrolling list managers handling multi-axis sorting matrices (Date Range, Customer filter, Entry Types).
Interrogates transactional dates (transaction_date) for business visualization logic while ignoring system creation sync timestamps.

7e. Tenant Sync Screen — tenant-sync.tsx
Allows online search of business/tenant names. Fetches database roster, stores, and customers for the matched tenant, saving them locally to SQLite for subsequent offline authentication and use.

**AddCustomerDrawer:** Bottom sheet, name + phone, insert with `is_dirty=1`.

---

## 8. Design System

```typescript
// src/constants/theme.ts
colors: {
  primary: '#218868',         // Green (buttons, positive)
  danger: '#D92D20',          // Red (due balance, errors ONLY)
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
}
spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }
radius: { sm: 6, md: 10, lg: 14, xl: 20 }
```

**Rules:** 48px min tap targets. `keyboardType="numeric"` for amounts, `"phone-pad"` for phones. Due in red only. Collection in green only.

---

## 9. Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=https://...
EXPO_PUBLIC_SUPABASE_KEY=...   # Anon (public) key only — never service role
EXPO_PUBLIC_API_MODE=supabase  # Switch to 'custom' for VM migration
```

All client vars must have `EXPO_PUBLIC_` prefix.

---

## 10. Multi-Tenancy

- Every query on `customers`/`ledger_entries`: include `WHERE store_id = ?` from `authStore.storeId`
- Never hardcode `store_id`, `tenant_id`, branch names
- Cloud: RLS enforces isolation via JWT claims
- A user cannot read other branches unless granted via `user_stores`

---

## 11. UUID Generation

```typescript
import * as Crypto from "expo-crypto";
const id = Crypto.randomUUID(); // For client-generated records
```

---

## 12. Sync Conflict Resolution

**Append-only ledger** — no updates/deletes, only inserts.

| Scenario                 | Resolution                                           |
| ------------------------ | ---------------------------------------------------- |
| Same record pushed twice | `ON CONFLICT DO NOTHING` by `id`                     |
| Two devices offline      | Both valid; sync independently; balance recalculates |
| Customer name edited     | `updated_at` timestamp wins (last-write-wins)        |
| Network failure mid-sync | `is_dirty` stays 1; retry on next connectivity       |

---

## 13. Future API VM Migration

When switching to custom backend:

- [ ] Endpoint `POST /auth/login` (phone, pin) → JWT with tenant_id, store_id
- [ ] Endpoint `POST /ledger/batch` (array of entries)
- [ ] Endpoint `GET /ledger?store_id=&since=` (delta pull)
- [ ] Endpoint `POST/GET /customers/batch`
- [ ] Update **only** `cloudAdapter.ts`
- [ ] No other files change

---

## 14. Agent Coding Rules

1. **Offline first.** Every screen works without internet.
2. **Never await network in render.** All reads from SQLite. Cloud = write-target only.
3. **Parameterized SQL.** No string interpolation. Use `executeSqlAsync(sql, [params])`.
4. **`store_id` mandatory** on every `customers`/`ledger_entries` query.
5. **Never hardcode** `store_id`, `tenant_id`, branch names. Read from `authStore`.
6. **Balance always computed.** Never store raw balance. Use `SUM(sale) - SUM(collection)` at query time.
7. **`cloudAdapter.ts` = API boundary.** Never call `supabase` elsewhere.
8. **Drawers don't block.** Close in-place, refresh parent list.
9. **Customer search:** debounce 300ms, paginate 20 rows.
10. **`is_dirty = 1` on every local write** before function returns.
11. **Terminal/User sync is login fallback.** Only sync if local lookup fails AND online. If offline + not found, error.
12. **Never alter `created_at` for backdated transactions.** The `created_at` timestamp in both SQLite and Supabase must reflect real-world insertion time. Use the explicit `transaction_date` field for any custom, future, or backdated user selections. Cloud delta pulls rely entirely on chronological server-side `created_at` ordering.
13. Expo Folder Structure Best Practices. The src/app directory is strictly reserved for routing. Do not create (tabs) or (auth) group folders, as they can cause routing layout conflicts. Build all screen UIs and colocate their sub-components safely inside src/screens/, and simply import/export them from the src/app/ router files.
14. In src directory path ref '@'
