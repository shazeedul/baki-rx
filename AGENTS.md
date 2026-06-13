# AGENTS.md — Baki Rx Ledger

AI coding agents working on this codebase must read this file in full before making any change. This file is the single source of truth for architecture decisions, conventions, and constraints.

---

## 1. Project Identity

* **App Name:** Baki Rx Ledger


* **Type:** Multi-tenant, local-first SaaS — Android (React Native / Expo)

* **Domain:** Pharmacy credit (baki) management across multiple branch users

* **Core Constraint:** The app must function 100% offline. The internet is optional, never a dependency.

---

## 2. Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | React Native (Expo SDK, targeting Android) |
| **Local DB** | `expo-sqlite` (primary) or WatermelonDB |
| **Cloud DB** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth (`auth.users`) + Local Bcrypt lookup (offline) |
| **Network Detection** | `@react-native-community/netinfo`<br> |
| **HTTP Client** | Supabase JS SDK — swappable with `fetch`/`axios`<br> |
| **State Management** | Zustand (preferred) or React Context |
| **Navigation** | React Navigation v6 (Stack + Drawer + Bottom Tab) |
| **Environment Vars** | `EXPO_PUBLIC_` prefixed `.env` via Expo config |

---

## 3. Repository Structure

```
/
├── src/
|   ├── app/                    # Expo Router screens
|   |   ├── (tabs)/
|   |   │   ├── index.tsx           # Home / Dashboard
|   |   │   ├── entry.tsx           # New Sale Entry
|   |   │   ├── report.tsx          # Reports
|   │   ├── (auth)/
|   │   │   └── login.tsx
|   |   ├── index.tsx 
|   |   ├── +not-found.tsx
|   │   └── _layout.tsx
│   ├── components/
│   │   ├── AddCustomerDrawer.tsx
│   │   ├── CustomerSearchDropdown.tsx
│   │   ├── DueBalanceCard.tsx
│   │   └── SyncStatusBadge.tsx
│   ├── db/
│   │   ├── schema.ts           # SQLite table definitions
│   │   ├── migrations/         # Versioned migration files
│   │   └── queries/
│   │       ├── customers.ts
│   │       └── ledger.ts
│   ├── sync/
│   │   └── SyncEngine.ts       # Background sync — the API boundary layer
│   ├── store/
│   │   ├── authStore.ts        # Zustand: session, user_id, store_id, tenant_id
│   │   └── syncStore.ts        # Zustand: dirty count, last synced at
│   ├── services/
│   │   └── cloudAdapter.ts     # Supabase ↔ future custom API abstraction
│   └── constants/
│       └── theme.ts            # Colors, typography, spacing tokens
├── .env                        # Never committed
├── .env.example                # Committed — safe placeholder values
└── AGENTS.md                   # This file
```

---

## 4. Architecture: Local-First Hybrid

### Golden Rule

**The UI never awaits a network response to render.** Every read operation targets the local SQLite database.

### Write Flow

```
User Action
  → Write to SQLite with is_dirty = 1
  → Update local UI immediately
  → SyncEngine picks up dirty rows in background
  → Push to Supabase / cloud API
  → On 200 OK: reset is_dirty = 0

```

### Sync Engine (`src/sync/SyncEngine.ts`)

* Triggered by `NetInfo` `isConnected` state change to `true`.

* Also runs on app foreground resume.

* Pushes all `is_dirty = 1` ledger rows as delta payloads (not full balance snapshots).

* Pulls rows from cloud where `created_at > last_pull_timestamp` (per store).

* Must be written so `supabase.from().upsert()` can be replaced with a plain `fetch()` POST with zero logic changes.

### Delta Math Rule

**Never sync a computed balance.** Sync only raw transaction deltas:

```json
{ "type": "debit", "amount": 2500 }   // sale
{ "type": "credit", "amount": 1000 }  // collection

```

The running balance is always derived locally by summing ledger deltas for a customer.

### User Sync & Authentication Flow

Authentication operates on a disconnected, local-first strategy. The cloud source of truth lives securely inside Supabase Auth (`auth.users`), but accounts are mirrored to the public schema and synced locally to support full offline lookup workflows. Users are unique across a tenant but can be explicitly mapped to multiple stores, booting by default into an assigned primary branch.

#### Login Flow Diagram

```
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
4. Async: If online, background authenticates against Supabase Auth 
   via phone + password to acquire a fresh JWT token for the session cache.

```

#### Multi-Store Session Flipping

Because alternative branch privileges are maintained inside the local `user_stores` junction table, a logged-in user can change their active working branch directly from an in-app profile menu or sidebar. Switching branches overrides `authStore.store_id` dynamically, resetting all local dashboard ledger query filters instantly.

#### `SyncEngine.syncUsers()` Contract

```typescript
// src/sync/SyncEngine.ts

async syncUsers(tenantId: string): Promise<void> {
  const { users, userStores } = await cloudAdapter.pullTenantRoster(tenantId);
  if (!users || users.length === 0) return;

  await db.transaction(async (tx) => {
    // Users are cloud-authoritative. Unconditional overwrite — no is_dirty flag.
    await tx.upsertUsers(users);
    await tx.clearAndRebuildUserStores(tenantId, userStores);
  });

  syncStore.setState({ lastUserSyncedAt: new Date().toISOString() });
}

```

---

## 5. Database Schema

### 5a. SQLite (Local — `expo-sqlite`)

```sql
CREATE TABLE users (
  id               TEXT PRIMARY KEY,    -- Matches Supabase auth.users.id UUID
  tenant_id        TEXT NOT NULL,
  phone            TEXT NOT NULL,
  password_hash    TEXT NOT NULL,       -- Synced Bcrypt string from auth.users
  default_store_id TEXT NOT NULL,       -- Primary/Fallback branch context
  jwt_cache        TEXT,                -- Last valid store-scoped JWT token
  created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE user_stores (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id    TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE customers (
  id          TEXT PRIMARY KEY,   -- UUID, generated locally
  store_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  is_dirty    INTEGER DEFAULT 1,  -- 1 = needs sync
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE ledger_entries (
  id            TEXT PRIMARY KEY, -- UUID, generated locally
  store_id      TEXT NOT NULL,
  customer_id   TEXT NOT NULL REFERENCES customers(id),
  entry_type    TEXT NOT NULL CHECK(entry_type IN ('sale','collection')),
  total_amount  REAL NOT NULL,
  paid_amount   REAL NOT NULL DEFAULT 0,
  due_amount    REAL GENERATED ALWAYS AS (total_amount - paid_amount) VIRTUAL,
  note          TEXT,
  is_dirty      INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_tenant_phone ON users(tenant_id, phone);
CREATE INDEX idx_user_stores_user   ON user_stores(user_id);
CREATE INDEX idx_customers_store    ON customers(store_id);
CREATE INDEX idx_customers_phone    ON customers(phone);
CREATE INDEX idx_ledger_customer    ON ledger_entries(customer_id);
CREATE INDEX idx_ledger_dirty       ON ledger_entries(is_dirty);
CREATE INDEX idx_ledger_created     ON ledger_entries(created_at DESC);

```

### 5b. Supabase (Cloud — PostgreSQL)

```sql
-- ─────────────────────────────────────────────
-- TENANTS
-- ─────────────────────────────────────────────
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- STORES (branches)
-- ─────────────────────────────────────────────
CREATE TABLE stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_name  TEXT NOT NULL,
  location    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY stores_tenant_isolation ON stores
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- PUBLIC USERS PROFILE
-- Mirrored directly from auth.users via database trigger to support offline sync.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE public.users (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone            TEXT NOT NULL,
  password_hash    TEXT NOT NULL, -- Mirrored encrypted password for offline fallback
  default_store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT       unique_tenant_phone UNIQUE (tenant_id, phone)
);

CREATE TABLE public.user_stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
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

-- ─────────────────────────────────────────────
-- CUSTOMERS
-- ─────────────────────────────────────────────
CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_store_isolation ON customers
  USING (store_id = (auth.jwt() -> 'user_metadata' ->> 'store_id')::uuid);

-- ─────────────────────────────────────────────
-- LEDGER ENTRIES
-- ─────────────────────────────────────────────
CREATE TABLE ledger_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  entry_type    TEXT NOT NULL CHECK (entry_type IN ('sale', 'collection')),
  total_amount  NUMERIC(12, 2) NOT NULL,
  paid_amount   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY ledger_store_isolation ON ledger_entries
  USING (store_id = (auth.jwt() -> 'user_metadata' ->> 'store_id')::uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUTOMATED AUTH BRIDGE (POSTGRES TRIGGER)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, tenant_id, phone, password_hash, default_store_id, created_at)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data ->> 'tenant_id')::uuid,
    NEW.phone,
    NEW.encrypted_password,
    (NEW.raw_user_meta_data ->> 'default_store_id')::uuid,
    NEW.created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    phone = EXCLUDED.phone,
    password_hash = EXCLUDED.password_hash,
    default_store_id = EXCLUDED.default_store_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_or_updated
  AFTER INSERT OR UPDATE OF encrypted_password, phone, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_sync();

```
---

## 6. Cloud Adapter — The API Abstraction Layer

`src/services/cloudAdapter.ts` is the **only** file that knows about Supabase. All sync operations route through it.

```typescript
// src/services/cloudAdapter.ts

const MODE = process.env.EXPO_PUBLIC_API_MODE; // 'supabase' | 'custom'

export const cloudAdapter = {
  async upsertLedgerEntries(rows: LedgerEntry[]) {
    if (MODE === 'supabase') {
      return supabase.from('ledger_entries').upsert(rows);
    }
  },

  async pullLedgerSince(storeId: string, since: string) {
    if (MODE === 'supabase') {
      return supabase.from('ledger_entries')
        .select('*')
        .eq('store_id', storeId)
        .gt('created_at', since);
    }
  },
};

```

**Agent rule:** Never call `supabase.*` directly from a component or SyncEngine. Always go through `cloudAdapter`.

---

## 7. Screen Map & Component Contracts

### 7a. Login Screen — `(auth)/login.tsx`

**Purpose:** Authenticate user context sequentially by tenant filtering before verifying credentials against the local cache.

| Element | Component Behavior / Constraints |
| --- | --- |
| **Tenant Selector Dropdown** | Step 1. Queries local SQLite `tenants` table to display registered tenant businesses. Must be selected before fields below unlock. |
| **Mobile Input** | Step 2. `keyboardType="phone-pad"`. Validates local country formatting rules. |
| **Password/PIN Input** | Step 3. Secure text mask. Fires local lookup when user presses submit or completes the credential field. |
| **Connectivity State** | Displays **"Offline Mode Ready" (Green)** if data is cached. Displays **"Sync Required" (Amber)** if the tenant profile roster hasn't been pulled yet during a bootstrapping event. |
| **Authentication Action** | Queries local parameterized SQLite table pairing `tenant_id` + `phone`. Verifies password text against the pulled `password_hash` using a lightweight local Bcrypt engine. Passes control immediately to the dashboard on a positive match. |

---

### 7b. Home / Dashboard — `(app)/index.tsx`

**Purpose:** Operational overview and primary action hub

| Element | Data Source |
| --- | --- |
| **Total Baki card (Red)** | `SUM(due_amount)` across all `ledger_entries` for this `store_id`<br> |
| **Today's Collection (Green)** | `SUM(paid_amount)` WHERE `date(created_at) = date('now')`<br> |
| **New Sale Entry button** | Navigate to `/entry`<br> |
| **Add Customer button** | Open `AddCustomerDrawer` (bottom sheet)

 |
| **Top 20 Defaulters list** | `SELECT customer_id, SUM(due_amount) as total_due FROM ledger_entries GROUP BY customer_id ORDER BY total_due DESC LIMIT 20` — joined with `customers`<br> |

**Top 20 list row:** Rank badge · Customer name · Phone · Due amount (red, bold) · tap → Customer Profile.

---

### 7c. Add Customer Drawer — `src/components/AddCustomerDrawer.tsx`

**Purpose:** Quick customer registration without leaving the home screen

* Implemented as a bottom sheet (`@gorhom/bottom-sheet` or `react-native-modal`).
* Fields: Customer Name (`autoCapitalize="words"`), Phone Number (`keyboardType="phone-pad"`).
* On Save: generate a local UUID, insert into SQLite with `is_dirty = 1`, dismiss drawer, show success toast.
* Validation: name required; phone must be 11 digits (BD format).
* Do not navigate away — the drawer closes and the home list refreshes in place.

---

### 7d. New Sale Entry — `(app)/entry.tsx`

**Purpose:** Record a credit/baki transaction

| Element | Behavior |
| --- | --- |
| **Customer Select** | See `CustomerSearchDropdown` contract below

 |
| **Total Bill Amount** | `keyboardType="numeric"`; required

 |
| **Paid Amount** | `keyboardType="numeric"`; default `0`<br> |
| **Due Balance (auto-calc)** | `due = totalBill - paidAmount`; displayed in red; recalculates on every keystroke

 |
| **Save (Offline Safe) button** | Disabled until customer selected + total > 0; inserts into SQLite with `is_dirty = 1`<br> |

**`CustomerSearchDropdown` Component Contract (`src/components/CustomerSearchDropdown.tsx`):**

* Input: `onSelect: (customer: Customer) => void`
* Search field with `placeholder="Search by name or mobile…"`
* Queries SQLite: `SELECT * FROM customers WHERE store_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 20 OFFSET ?`
* Pagination: load 20 rows; "Load more" appears at list bottom if results = 20
* Debounce search input by 300ms
* Empty state: "No customer found — tap + to add" with shortcut to open `AddCustomerDrawer`
* Renders as an in-component FlatList dropdown (not a native modal) so it works offline

---

### 7e. Report Screen — `(app)/report.tsx`

**Purpose:** Transaction history with multi-axis filtering

**Filter Controls (all stored in local component state):**

| Filter | Type | Options / Behavior |
| --- | --- | --- |
| **Date Range** | Date picker pair | From / To; defaults to current month

 |
| **Customer** | Search input | Same debounced SQLite search as Entry screen

 |
| **Entry Type** | Segmented control | All · Sale · Collection

 |
| **Sort** | Dropdown | Newest first (default) · Oldest first · Highest due · Lowest due

 |

**Results Table columns:** Date · Customer Name · Bill · Paid · Due · Type badge

**Query pattern:**

```sql
SELECT le.*, c.name, c.phone
FROM ledger_entries le
JOIN customers c ON c.id = le.customer_id
WHERE le.store_id = ?
  AND (? IS NULL OR date(le.created_at) >= ?)     -- from date
  AND (? IS NULL OR date(le.created_at) <= ?)     -- to date
  AND (? IS NULL OR le.entry_type = ?)            -- type filter
  AND (? IS NULL OR c.name LIKE ? OR c.phone LIKE ?)  -- customer search
ORDER BY le.created_at DESC
LIMIT 30 OFFSET ?

```

Results are paginated (30 rows). Infinite scroll triggers next page load.

**Summary bar** (pinned above results): Total Baki · Total Collected · Net Due — all scoped to the active filters.

---

## 8. UI / Design System

```typescript
// src/constants/theme.ts

export const colors = {
  primary:        '#218868',   // Deep Healthcare Green — buttons, headers, positive states
  primaryDark:    '#1A6E54',   // Pressed state
  danger:         '#D92D20',   // Due balances, errors, overdue badges — ONLY for these
  background:     '#F8FAFC',   // Screen backgrounds
  surface:        '#FFFFFF',   // Cards, inputs
  border:         '#E2E8F0',   // Dividers, input borders
  textPrimary:    '#0F172A',
  textSecondary:  '#64748B',
  textMuted:      '#94A3B8',
  success:        '#16A34A',
  successBg:      '#DCFCE7',
  dangerBg:       '#FEF2F2',
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
};

export const radius = {
  sm: 6, md: 10, lg: 14, xl: 20,
};

export const typography = {
  financialAmount: { fontSize: 20, fontWeight: '700', fontFamily: 'Roboto_700Bold' },
  label:           { fontSize: 12, color: colors.textSecondary },
  body:            { fontSize: 14 },
};

```

* **Tap target minimum:** 48×48px for all interactive elements.
* **Numeric inputs:** Always `keyboardType="numeric"` for amounts; `keyboardType="phone-pad"` for phone numbers.
* **Due amounts:** Always render in `colors.danger` (#D92D20). Never use red for anything else.
* **Collection amounts:** Always render in `colors.primary` (#218868). Never use green for unrelated UI.

---

## 9. Environment Variables

```env
# .env  (never commit this file)

# Current: Supabase
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Future: Custom VM API (pre-wired, inactive)
EXPO_PUBLIC_FUTURE_API_URL=https://api.bakirxledger.com/v1
EXPO_PUBLIC_API_MODE=supabase     # Change to 'custom' when VM is ready

# Offline auth
EXPO_PUBLIC_LOCAL_CRYPT_SALT=your-secure-salt

```

All client-side env vars **must** have the `EXPO_PUBLIC_` prefix. Server-side secrets must never use this prefix.

---

## 10. Multi-Tenancy Rules

* Every SQLite query that touches `customers` or `ledger_entries` must include `WHERE store_id = ?` bound to `authStore.storeId`.
* Never derive `store_id` from UI state — always read from `authStore`.
* On Supabase, RLS handles cloud-side isolation automatically via JWT claims.
* A user logged into Branch A must be physically incapable of reading Branch B data unless granted explicitly via `user_stores`.

---

## 11. UUID Generation Strategy

All primary keys for locally-created records are **client-generated UUIDs** using `react-native-uuid` or `expo-crypto`.

```typescript
import * as Crypto from 'expo-crypto';
const id = Crypto.randomUUID(); // standard UUID v4

```

This allows offline record creation with globally unique IDs that safely merge into the cloud without collision.

---

## 12. Sync Conflict Resolution

This app uses an **Append-Only Ledger** — records are never updated or deleted, only inserted. This eliminates the most common sync conflicts.

| Scenario | Resolution |
| --- | --- |
| **Same record pushed twice** | `ON CONFLICT DO NOTHING` (Supabase upsert by `id`)

 |
| **Two devices create entries offline** | Both are valid; they sync independently; balance recalculates

 |
| **Customer name edited offline** | `updated_at` timestamp wins (last-write-wins on `customers`)

 |
| **Network failure mid-sync** | `is_dirty` remains `1`; retry on next connectivity event

 |

---

## 13. Future API VM Migration Checklist

When switching `EXPO_PUBLIC_API_MODE` from `supabase` to `custom`:

* [ ] Custom API must return a JWT with `store_id` and `tenant_id` in `user_metadata` claims
* [ ] Implement `POST /ledger/batch` accepting an array of `LedgerEntry` objects
* [ ] Implement `GET /ledger?store_id=&since=` for delta pulls
* [ ] Implement `POST /customers/batch` and `GET /customers?store_id=&since=`
* [ ] Implement `POST /auth/login` returning the JWT
* [ ] Update only `src/services/cloudAdapter.ts` — zero other files should change
* [ ] Recommended backend stack: Go or Laravel
* [ ] Local SQLite session management is **unchanged**
---

## 14. Agent Coding Rules

1. **Offline first, always.** Before writing any data-fetching code, ask: "what does this screen show when there is no internet?" It must still show data.
2. **Never read from the cloud in a render path.** All screen data comes from SQLite. Cloud is write-target only.
3. **All SQL queries must be parameterized.** No string interpolation in SQL. Use `executeSqlAsync(sql, [params])`.
4. **`store_id` filter is mandatory** on every local query touching `customers` or `ledger_entries`.
5. **Never hardcode `store_id`, `tenant_id`, or branch names.** Always read from `authStore`.
6. **Due balance is always computed, never stored as a raw field in UI state.** Derive it from `total_amount - paid_amount`.
7. **`cloudAdapter.ts` is the API boundary.** Never import or call `supabase` outside of that file.
8. **Drawer and modals must not block.** `AddCustomerDrawer` dismisses and refreshes the parent list in-place without a navigation event.
9. **Customer search must be debounced** (300ms) and paginated (20 per page) in both Entry and Report screens.
10. **`is_dirty` must be set to `1` on every local write** before the function returns. The sync loop will handle it asynchronously.