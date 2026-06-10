# AGENTS.md — Baki Rx Ledger

AI coding agents working on this codebase must read this file in full before making any change.
This file is the single source of truth for architecture decisions, conventions, and constraints.

---

## 1. Project Identity

**App Name:** Baki Rx Ledger
**Type:** Multi-tenant, local-first SaaS — Android (React Native / Expo)
**Domain:** Pharmacy credit (baki) management across multiple branch users
**Core Constraint:** The app must function 100% offline. The internet is optional, never a dependency.

---

## 2. Tech Stack

| Layer              | Technology                                      |
|--------------------|-------------------------------------------------|
| Framework          | React Native (Expo SDK, targeting Android)      |
| Local DB           | `expo-sqlite` (primary) or WatermelonDB         |
| Cloud DB           | Supabase (PostgreSQL)                           |
| Auth               | Supabase Auth (online) + SQLite hash (offline)  |
| Network Detection  | `@react-native-community/netinfo`               |
| HTTP Client        | Supabase JS SDK — swappable with `fetch`/`axios`|
| State Management   | Zustand (preferred) or React Context            |
| Navigation         | React Navigation v6 (Stack + Drawer + Bottom Tab)|
| Environment Vars   | `EXPO_PUBLIC_` prefixed `.env` via Expo config  |

---

## 3. Repository Structure

```
/
├── src/
|   ├── app/                    # Expo Router screens (if using file-based routing)
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
│   │   ├── authStore.ts        # Zustand: session, store_id, tenant_id
│   │   └── syncStore.ts        # Zustand: dirty count, last synced at
│   ├── services/
│   │   └── cloudAdapter.ts     # Supabase ↔ future custom API abstraction
│   └── constants/
│       └── theme.ts            # Colors, typography, spacing tokens
├── .env                        # Never committed — see Section 9
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
- Triggered by `NetInfo` `isConnected` state change to `true`
- Also runs on app foreground resume
- Pushes all `is_dirty = 1` ledger rows as delta payloads (not full balance snapshots)
- Pulls rows from cloud where `created_at > last_pull_timestamp` (per store)
- Must be written so `supabase.from().upsert()` can be replaced with a plain `fetch()` POST with zero logic changes — see Section 6

### Delta Math Rule
**Never sync a computed balance.** Sync only raw transaction deltas:
```json
{ "type": "debit", "amount": 2500 }   // sale
{ "type": "credit", "amount": 1000 }  // collection
```
The running balance is always derived locally by summing ledger deltas for a customer.

 
### User Sync & Authentication Flow
 
Users are synced from the cloud database during the Tenant Setup & Sync step, not eagerly on every login. Login is a purely offline local-first lookup, and the app does not make network requests during login attempts.
 
#### Login Auth Flow
 
```
User submits: mobile number + PIN + store selection
        │
        ▼
Query local users table:
  SELECT * FROM users
  WHERE phone = ? AND store_id = ?
        │
        ├─ ROW FOUND ──────────────────────────────────────────────────────────►
        │    Verify PIN: compare entered PIN against stored pin_hash             │
        │         ├─ MATCH   → populate authStore → navigate to Home            │
        │         └─ MISMATCH → show "Incorrect PIN" error. Stop.               │
        │                                                                        │
        └─ ROW NOT FOUND ──────────────────────────────────────────────────────►
             Show error:
             "User not found on this device.
              Please check your credentials or sync user data."
```
 
#### `SyncEngine.syncUsers()` Contract
 
```typescript
// src/sync/SyncEngine.ts
 
async syncUsers(tenantId: string): Promise<void> {
  const rows = await cloudAdapter.pullUsers(tenantId);
  if (!rows || rows.length === 0) return;
 
  // Users are cloud-authoritative. Unconditional overwrite — no is_dirty flag.
  await db.upsertUsers(rows);
 
  syncStore.setState({ lastUserSyncedAt: new Date().toISOString() });
}
```
 
**Upsert rule:** `INSERT OR REPLACE` keyed on `id`. The `users` table has no `is_dirty` flag. Every pulled row overwrites the local copy unconditionally.
 
**`syncStore` additions for this feature:**
 
```typescript
interface SyncStore {
  dirtyCount:           number;
  lastSyncedAt:         string | null;
  lastUserSyncedAt: string | null;  // set after syncUsers() succeeds
}
```
 
---

## 5. Database Schema

### 5a. SQLite (Local — `expo-sqlite`)

```sql
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  store_id    TEXT NOT NULL,
  tenant_id   TEXT NOT NULL,
  store_name  TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,       -- bcrypt/SHA-256 of PIN for offline auth
  jwt_cache   TEXT,               -- last valid Supabase JWT, used while online
  created_at  TEXT DEFAULT (datetime('now'))
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
-- Top-level owner. One row per pharmacy business.
-- No RLS needed — rows are only accessed via
-- service-role key during onboarding, never by
-- the app client directly.
-- ─────────────────────────────────────────────
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
 
-- ─────────────────────────────────────────────
-- STORES (branches)
-- Each tenant can have multiple branches.
-- ─────────────────────────────────────────────
CREATE TABLE stores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_name  TEXT NOT NULL,
  location    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
 
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
 
-- A clerk can only see the store their JWT belongs to.
CREATE POLICY stores_tenant_isolation ON stores
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);
 
-- ─────────────────────────────────────────────
-- USERS (formerly users)
-- One row per physical device/clerk per branch.
-- Holds the PIN hash used for offline auth.
-- ─────────────────────────────────────────────
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  store_name  TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  phone       TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
 
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
 
-- Clerks can read all users belonging to their tenant
-- (needed so the login screen can pull branch options).
CREATE POLICY users_tenant_read ON users
  FOR SELECT
  USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::uuid);
 
-- Only service-role can insert/update users (admin action, not clerk action).
-- No INSERT / UPDATE / DELETE policy for authenticated users.
 
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
```
 
#### JWT Claim Shape (required by all RLS policies above)
 
Every authenticated user's JWT `user_metadata` must contain:
 
```json
{
  "tenant_id": "uuid-of-their-tenant",
  "store_id":  "uuid-of-their-branch-store"
}
```
 
These are set at the time a user/clerk account is created (service-role operation). The RLS policies on `stores`, `users`, `customers`, and `ledger_entries` all read from these claims — if either claim is missing, all queries return zero rows.

#### Table Ownership Summary
 
| Table | Created by | Readable by clerk JWT | Writable by clerk JWT |
|---|---|---|---|
| `tenants` | Service role (onboarding) | No | No |
| `stores` | Service role (onboarding) | Yes (own tenant only) | No |
| `users` | Service role (admin) | Yes (own tenant only) | No |
| `customers` | App via sync push | Yes (own store only) | Yes (own store only) |
| `ledger_entries` | App via sync push | Yes (own store only) | Yes (own store only) |
 
**RLS must be enabled on every table a clerk JWT can touch.** `tenants` is the only table exempt — it is never queried by the app client.
 
---

## 6. Cloud Adapter — The API Abstraction Layer

`src/services/cloudAdapter.ts` is the **only** file that knows about Supabase. All sync operations route through it. This makes migration to a custom API VM a one-file change.

```typescript
// src/services/cloudAdapter.ts

const MODE = process.env.EXPO_PUBLIC_API_MODE; // 'supabase' | 'custom'

export const cloudAdapter = {
  async upsertLedgerEntries(rows: LedgerEntry[]) {
    if (MODE === 'supabase') {
      return supabase.from('ledger_entries').upsert(rows);
    }
    // Future: return fetch(`${API_URL}/ledger/batch`, { method:'POST', body: JSON.stringify(rows) });
  },

  async pullLedgerSince(storeId: string, since: string) {
    if (MODE === 'supabase') {
      return supabase.from('ledger_entries')
        .select('*')
        .eq('store_id', storeId)
        .gt('created_at', since);
    }
    // Future: return fetch(`${API_URL}/ledger?store_id=${storeId}&since=${since}`);
  },

  // ... upsertCustomers, pullCustomersSince
};
```

**Agent rule:** Never call `supabase.*` directly from a component or SyncEngine. Always go through `cloudAdapter`.

---

## 7. Screen Map & Component Contracts

### 7a. Login Screen — `(auth)/login.tsx`
**Purpose:** User activation (online or offline)

| Element                  | Behavior                                                       |
|--------------------------|----------------------------------------------------------------|
| Branch User dropdown | Populated from local `users` table                         |
| Mobile number input      | `keyboardType="phone-pad"`                                     |
| 4-digit PIN input        | 4 separate single-char inputs; `secureTextEntry`; auto-focus-next |
| Offline Mode badge       | Always visible; green if offline-ready, amber if first-time setup |
| Log In button            | Online: validate via Supabase Auth → cache JWT. Offline: compare PIN hash from local `users` table |

**Post-login:** Store `store_id`, `tenant_id`, `branch_name` in `authStore`. Navigate to Home.

---

### 7b. Home / Dashboard — `(app)/index.tsx`
**Purpose:** Operational overview and primary action hub

| Element                   | Data Source                                                             |
|---------------------------|-------------------------------------------------------------------------|
| Total Baki card (Red)     | `SUM(due_amount)` across all `ledger_entries` for this `store_id`       |
| Today's Collection (Green)| `SUM(paid_amount)` WHERE `date(created_at) = date('now')`               |
| New Sale Entry button      | Navigate to `/entry`                                                    |
| Add Customer button        | Open `AddCustomerDrawer` (bottom sheet)                                 |
| Top 20 Defaulters list     | `SELECT customer_id, SUM(due_amount) as total_due FROM ledger_entries GROUP BY customer_id ORDER BY total_due DESC LIMIT 20` — joined with `customers` |

**Top 20 list row:** Rank badge · Customer name · Phone · Due amount (red, bold) · tap → Customer Profile (future screen).

---

### 7c. Add Customer Drawer — `src/components/AddCustomerDrawer.tsx`
**Purpose:** Quick customer registration without leaving the home screen

- Implemented as a bottom sheet (use `@gorhom/bottom-sheet` or `react-native-modal`)
- Fields: Customer Name (`autoCapitalize="words"`), Phone Number (`keyboardType="phone-pad"`)
- On Save: generate a local UUID, insert into SQLite with `is_dirty = 1`, dismiss drawer, show success toast
- Validation: name required; phone must be 11 digits (BD format)
- Do not navigate away — the drawer closes and the home list refreshes in place

---

### 7d. New Sale Entry — `(app)/entry.tsx`
**Purpose:** Record a credit/baki transaction

| Element                     | Behavior                                                                         |
|-----------------------------|----------------------------------------------------------------------------------|
| Customer Select             | See `CustomerSearchDropdown` contract below                                      |
| Total Bill Amount           | `keyboardType="numeric"`; required                                               |
| Paid Amount                 | `keyboardType="numeric"`; default `0`                                           |
| Due Balance (auto-calc)     | `due = totalBill - paidAmount`; displayed in red; recalculates on every keystroke |
| Save (Offline Safe) button  | Disabled until customer selected + total > 0; inserts into SQLite with `is_dirty = 1` |

**`CustomerSearchDropdown` Component Contract (`src/components/CustomerSearchDropdown.tsx`):**
- Input: `onSelect: (customer: Customer) => void`
- Search field with `placeholder="Search by name or mobile…"`
- Queries SQLite: `SELECT * FROM customers WHERE store_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 20 OFFSET ?`
- Pagination: load 20 rows; "Load more" appears at list bottom if results = 20
- Debounce search input by 300ms
- Empty state: "No customer found — tap + to add" with shortcut to open `AddCustomerDrawer`
- Renders as an in-component FlatList dropdown (not a native modal) so it works offline

---

### 7e. Report Screen — `(app)/report.tsx`
**Purpose:** Transaction history with multi-axis filtering

**Filter Controls (all stored in local component state):**

| Filter         | Type            | Options / Behavior                                               |
|----------------|-----------------|------------------------------------------------------------------|
| Date Range     | Date picker pair | From / To; defaults to current month                           |
| Customer       | Search input    | Same debounced SQLite search as Entry screen                     |
| Entry Type     | Segmented control | All · Sale · Collection                                           |
| Sort           | Dropdown        | Newest first (default) · Oldest first · Highest due · Lowest due |

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

**Tap target minimum:** 48×48px for all interactive elements.
**Numeric inputs:** Always `keyboardType="numeric"` for amounts; `keyboardType="phone-pad"` for phone numbers.
**Due amounts:** Always render in `colors.danger` (#D92D20). Never use red for anything else.
**Collection amounts:** Always render in `colors.primary` (#218868). Never use green for unrelated UI.

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

- Every SQLite query that touches `customers` or `ledger_entries` must include `WHERE store_id = ?` bound to `authStore.storeId`
- Never derive `store_id` from UI state — always read from `authStore`
- On Supabase, RLS handles cloud-side isolation automatically via JWT claim; do not add manual `WHERE store_id` filters to cloud queries (RLS is the source of truth there)
- A user logged into Branch A must be physically incapable of reading Branch B data, at both the local DB layer and the cloud layer

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

| Scenario                            | Resolution                                                  |
|-------------------------------------|-------------------------------------------------------------|
| Same record pushed twice            | `ON CONFLICT DO NOTHING` (Supabase upsert by `id`)          |
| Two devices create entries offline  | Both are valid; they sync independently; balance recalculates |
| Customer name edited offline        | `updated_at` timestamp wins (last-write-wins on `customers`) |
| Network failure mid-sync            | `is_dirty` remains `1`; retry on next connectivity event    |

---

## 13. Future API VM Migration Checklist

When switching `EXPO_PUBLIC_API_MODE` from `supabase` to `custom`:

- [ ] Custom API must return a JWT with `store_id` and `tenant_id` in `user_metadata` claims (same shape as Supabase JWT)
- [ ] Implement `POST /ledger/batch` accepting an array of `LedgerEntry` objects
- [ ] Implement `GET /ledger?store_id=&since=` for delta pulls
- [ ] Implement `POST /customers/batch` and `GET /customers?store_id=&since=`
- [ ] Implement `POST /auth/login` returning the JWT
- [ ] Update only `src/services/cloudAdapter.ts` — zero other files should change
- [ ] Recommended backend stack: Go (high-concurrency) or Laravel (rapid MVC development)
- [ ] Local SQLite session management is **unchanged** — it already stores only `store_id`, `tenant_id`, and a cached JWT string

---

## 14. Agent Coding Rules

1. **Offline first, always.** Before writing any data-fetching code, ask: "what does this screen show when there is no internet?" It must still show data.
2. **Never read from the cloud in a render path.** All screen data comes from SQLite. Cloud is write-target only (via SyncEngine).
3. **All SQL queries must be parameterized.** No string interpolation in SQL. Use `executeSqlAsync(sql, [params])`.
4. **`store_id` filter is mandatory** on every local query touching `customers` or `ledger_entries`.
5. **Never hardcode `store_id`, `tenant_id`, or branch names.** Always read from `authStore`.
6. **Due balance is always computed, never stored as a raw field in UI state.** Derive it from `total_amount - paid_amount`.
7. **`cloudAdapter.ts` is the API boundary.** Never import or call `supabase` outside of that file.
8. **Drawer and modals must not block.** `AddCustomerDrawer` dismisses and refreshes the parent list in-place without a navigation event.
9. **Customer search must be debounced** (300ms) and paginated (20 per page) in both Entry and Report screens.
10. **`is_dirty` must be set to `1` on every local write** before the function returns. The sync loop will handle it asynchronously.