import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('bakirx.db');
  await initSchema(_db);
  return _db;
}

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS tenants (
      id            TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id               TEXT PRIMARY KEY,
      tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      phone            TEXT NOT NULL,
      password_hash    TEXT NOT NULL,
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
      note             TEXT,
      transaction_date TEXT NOT NULL,
      is_dirty         INTEGER DEFAULT 1,
      created_at       TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_users_lookup    ON users(tenant_id, phone);
    CREATE INDEX IF NOT EXISTS idx_user_stores_map ON user_stores(user_id);
    CREATE INDEX IF NOT EXISTS idx_customers_branch ON customers(store_id);
    CREATE INDEX IF NOT EXISTS idx_ledger_sync      ON ledger_entries(store_id, is_dirty);
    CREATE INDEX IF NOT EXISTS idx_ledger_customer  ON ledger_entries(customer_id, transaction_date DESC);
  `);
}
