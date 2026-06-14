# AGENTS.md — Baki Rx Ledger

**Single source of truth for AI agents. Read in full before changes.**

---

## 1. Quick Identity

- **App:** Baki Rx Ledger | **Type:** Multi-tenant, local-first SaaS | **Platform:** React Native/Expo/Android
- **Domain:** Pharmacy credit (baki) management | **Core:** 100% offline-capable

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| **Framework** | React Native (Expo) |
| **Local DB** | `expo-sqlite` |
| **Cloud DB** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth (`auth.users`) + local bcrypt lookup (offline) |
| **Network** | `@react-native-community/netinfo` |
| **State** | Zustand |
| **Navigation** | React Navigation v6 |

---

## 3. Repository Structure

```
/
├── app/
│   ├── (auth)/login.tsx
│   ├── (tabs)/index.tsx (Home), entry.tsx, report.tsx
│   └── _layout.tsx
├── src/
│   ├── components/ (AddCustomerDrawer, CustomerSearchDropdown, etc.)
│   ├── db/ (schema.ts, migrations/, queries/)
│   ├── sync/ (SyncEngine.ts)
│   ├── store/ (authStore.ts, syncStore.ts)
│   ├── services/ (cloudAdapter.ts)
│   └── constants/ (theme.ts)
├── .env (never commit) & .env.example
└── AGENTS.md
```

---

## 4. Architecture

**Golden Rule:** UI never awaits network. All reads from local SQLite.

**Write Flow:**
```
User action → Write SQLite (is_dirty=1) → Update UI → SyncEngine in background → Push cloud → Reset is_dirty=0
```

**Login Flow (Lazy Sync):**
1. User enters mobile + PIN + branch
2. Query local `users` table
3. If found: verify bcrypt hash → login (offline OK)
4. If not found + online: `await syncUsers()` → retry → login
5. If not found + offline: error

**Delta Math:** Never sync balances. Sync only transaction deltas (`entry_type`: 'baki'/'payment', `amount`). Balance = SUM(baki) - SUM(payment), computed at query time.

---

## 5. Database Schema

### 5a. SQLite (Local)

```sql
-- Users (synced from cloud, no is_dirty)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,        -- Bcrypt for offline PIN auth
  default_store_id TEXT NOT NULL,
  jwt_cache TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- User can access multiple stores
CREATE TABLE user_stores (
  user_id TEXT NOT NULL REFERENCES users(id),
  store_id TEXT NOT NULL,
  PRIMARY KEY (user_id, store_id)
);

-- Customers (is_dirty for sync)
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  is_dirty INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Ledger (append-only, is_dirty for sync)
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  store_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  entry_type TEXT CHECK(entry_type IN ('baki', 'payment')),
  amount REAL NOT NULL,
  note TEXT,
  is_dirty INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes on all tables (store_id, dirty, created_at)
```

### 5b. Supabase (Cloud)

**Tables mirror SQLite.** Clerks via JWT; RLS on `store_id` claims. Users/user_stores read-only (no clerk write).

**Key RLS:**
- `customers`: SELECT/INSERT/UPDATE by `store_id`
- `ledger_entries`: SELECT/INSERT by `store_id`
- `users`, `user_stores`: SELECT only (service-role provisions)

**JWT metadata:** `{ tenant_id, store_id, user_id }`

---

## 6. Cloud Adapter (API Boundary)

**File:** `src/services/cloudAdapter.ts`

Only file that imports Supabase. Everything routes through it for swappability to custom API.

```typescript
// Pseudo
async syncUsers(tenantId) → cloudAdapter.pullUsers(tenantId)
async pushDirty() → cloudAdapter.upsertLedger(dirtyRows)
async signIn(phone, pin) → cloudAdapter.signIn(phone, pin)
```

---

## 7. Screens

| Screen | Purpose | Key Data |
|---|---|---|
| **Login** | User + PIN + branch | Local users lookup → verify bcrypt hash → sync fallback if offline |
| **Home** | Dashboard | SUM(baki) - SUM(payment), today's collections, top 20 defaulters |
| **Entry** | New transaction | Customer search (paginated, debounced), amount, entry_type, auto-calc balance |
| **Report** | Ledger filtered | Date, customer, type, sort; paginated; summary totals |

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
EXPO_PUBLIC_SUPABASE_KEY=...
EXPO_PUBLIC_API_MODE=supabase  # Switch to 'custom' for VM migration
EXPO_PUBLIC_LOCAL_CRYPT_SALT=...
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
import * as Crypto from 'expo-crypto';
const id = Crypto.randomUUID(); // For client-generated records
```

---

## 12. Sync Conflict Resolution

**Append-only ledger** — no updates/deletes, only inserts.

| Scenario | Resolution |
|---|---|
| Same record pushed twice | `ON CONFLICT DO NOTHING` by `id` |
| Two devices offline | Both valid; sync independently; balance recalculates |
| Customer name edited | `updated_at` timestamp wins (last-write-wins) |
| Network failure mid-sync | `is_dirty` stays 1; retry on next connectivity |

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
6. **Balance always computed.** Never store raw balance. Use `SUM(baki) - SUM(payment)` at query time.
7. **`cloudAdapter.ts` = API boundary.** Never call `supabase` elsewhere.
8. **Drawers don't block.** Close in-place, refresh parent list.
9. **Customer search:** debounce 300ms, paginate 20 rows.
10. **`is_dirty = 1` on every local write** before function returns.
11. **Terminal/User sync is login fallback.** Only sync if local lookup fails AND online. If offline + not found, error.
