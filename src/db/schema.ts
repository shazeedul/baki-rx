let SQLite: any = null;
try {
  SQLite = require('expo-sqlite');
} catch (e) {
  SQLite = null;
}

// Web mock database implementation
class WebSqlDatabase {
  private terminals: any[] = [];
  private customers: any[] = [];
  private ledger_entries: any[] = [];
  private tenants: any[] = [];
  private stores: any[] = [];

  constructor() {
    this.loadFromLocalStorage();
  }

  private isWebEnvironment(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private loadFromLocalStorage() {
    if (this.isWebEnvironment()) {
      try {
        this.terminals = JSON.parse(localStorage.getItem('baki_terminals') || '[]');
        this.customers = JSON.parse(localStorage.getItem('baki_customers') || '[]');
        this.ledger_entries = JSON.parse(localStorage.getItem('baki_ledger_entries') || '[]');
        this.tenants = JSON.parse(localStorage.getItem('baki_tenants') || '[]');
        this.stores = JSON.parse(localStorage.getItem('baki_stores') || '[]');
      } catch (e) {
        console.error('Failed to load DB from localStorage', e);
      }
    }
  }

  private saveToLocalStorage() {
    if (this.isWebEnvironment()) {
      try {
        localStorage.setItem('baki_terminals', JSON.stringify(this.terminals));
        localStorage.setItem('baki_customers', JSON.stringify(this.customers));
        localStorage.setItem('baki_ledger_entries', JSON.stringify(this.ledger_entries));
        localStorage.setItem('baki_tenants', JSON.stringify(this.tenants));
        localStorage.setItem('baki_stores', JSON.stringify(this.stores));
      } catch (e) {
        console.error('Failed to save DB to localStorage', e);
      }
    }
  }

  async execAsync(sql: string): Promise<void> {
    // Schema creation is a no-op on web mock, tables are pre-initialized arrays
    return;
  }

  async runAsync(sql: string, ...params: any[]): Promise<{ lastInsertRowId: number; changes: number }> {
    const query = sql.trim().replace(/\s+/g, ' ');
    const actualParams = Array.isArray(params[0]) ? params[0] : params;

    // 1. Terminals INSERT OR REPLACE
    if (query.startsWith('INSERT OR REPLACE INTO terminals')) {
      const [id, store_id, tenant_id, store_name, branch_name, phone, pin_hash, jwt_cache, created_at] = actualParams;
      const index = this.terminals.findIndex(t => t.id === id);
      const row = { id, store_id, tenant_id, store_name, branch_name, phone, pin_hash, jwt_cache, created_at };
      if (index >= 0) {
        this.terminals[index] = row;
      } else {
        this.terminals.push(row);
      }
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 2. Customers INSERT OR REPLACE
    if (query.startsWith('INSERT OR REPLACE INTO customers')) {
      const [id, store_id, name, phone, is_dirty, created_at, updated_at] = actualParams;
      const index = this.customers.findIndex(c => c.id === id);
      const row = { id, store_id, name, phone, is_dirty, created_at, updated_at };
      if (index >= 0) {
        this.customers[index] = row;
      } else {
        this.customers.push(row);
      }
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 3. Customers INSERT
    if (query.startsWith('INSERT INTO customers')) {
      const [id, store_id, name, phone, is_dirty, created_at, updated_at] = actualParams;
      const row = { id, store_id, name, phone, is_dirty, created_at, updated_at };
      this.customers.push(row);
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 4. Customers UPDATE
    if (query.startsWith('UPDATE customers SET name')) {
      const [name, phone, is_dirty, updated_at, id] = actualParams;
      const index = this.customers.findIndex(c => c.id === id);
      if (index >= 0) {
        this.customers[index] = { ...this.customers[index], name, phone, is_dirty, updated_at };
      }
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 5. Customers Set dirty = 0
    if (query.startsWith('UPDATE customers SET is_dirty = 0')) {
      const [id] = actualParams;
      const index = this.customers.findIndex(c => c.id === id);
      if (index >= 0) {
        this.customers[index].is_dirty = 0;
      }
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 6. Ledger entries INSERT OR REPLACE
    if (query.startsWith('INSERT OR REPLACE INTO ledger_entries')) {
      const [id, store_id, customer_id, entry_type, total_amount, paid_amount, note, is_dirty, created_at] = actualParams;
      const index = this.ledger_entries.findIndex(l => l.id === id);
      const row = { id, store_id, customer_id, entry_type, total_amount, paid_amount, due_amount: total_amount - paid_amount, note, is_dirty, created_at };
      if (index >= 0) {
        this.ledger_entries[index] = row;
      } else {
        this.ledger_entries.push(row);
      }
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 7. Ledger entries INSERT
    if (query.startsWith('INSERT INTO ledger_entries')) {
      const [id, store_id, customer_id, entry_type, total_amount, paid_amount, note, is_dirty, created_at] = actualParams;
      const row = { id, store_id, customer_id, entry_type, total_amount, paid_amount, due_amount: total_amount - paid_amount, note, is_dirty, created_at };
      this.ledger_entries.push(row);
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 8. Ledger entries Set dirty = 0
    if (query.startsWith('UPDATE ledger_entries SET is_dirty = 0')) {
      const [id] = actualParams;
      const index = this.ledger_entries.findIndex(l => l.id === id);
      if (index >= 0) {
        this.ledger_entries[index].is_dirty = 0;
      }
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 9. Tenants INSERT OR REPLACE
    if (query.startsWith('INSERT OR REPLACE INTO tenants')) {
      const [id, business_name, created_at] = actualParams;
      const index = this.tenants.findIndex(t => t.id === id);
      const row = { id, business_name, created_at };
      if (index >= 0) {
        this.tenants[index] = row;
      } else {
        this.tenants.push(row);
      }
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    // 10. Stores INSERT OR REPLACE
    if (query.startsWith('INSERT OR REPLACE INTO stores')) {
      const [id, tenant_id, store_name, location, created_at] = actualParams;
      const index = this.stores.findIndex(s => s.id === id);
      const row = { id, tenant_id, store_name, location, created_at };
      if (index >= 0) {
        this.stores[index] = row;
      } else {
        this.stores.push(row);
      }
      this.saveToLocalStorage();
      return { lastInsertRowId: 1, changes: 1 };
    }

    console.warn('Web DB Unrecognized runAsync SQL:', sql);
    return { lastInsertRowId: 0, changes: 0 };
  }

  async getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]> {
    const query = sql.trim().replace(/\s+/g, ' ');
    const actualParams = Array.isArray(params[0]) ? params[0] : params;

    // 0. Select all terminals (no filter)
    if (query.includes('FROM terminals') && !query.includes('WHERE')) {
      return this.terminals as T[];
    }

    // 1. Select all terminals matching phone and store
    if (query.includes('FROM terminals WHERE phone = ? AND store_id = ?')) {
      const [phone, store_id] = actualParams;
      return this.terminals.filter(t => t.phone === phone && t.store_id === store_id) as T[];
    }

    // 2. Select customers with search
    if (query.includes('FROM customers WHERE store_id = ? AND (name LIKE ? OR phone LIKE ?)')) {
      const [store_id, nameLike, phoneLike, limit, offset] = actualParams;
      const namePattern = nameLike.replace(/%/g, '').toLowerCase();
      const phonePattern = phoneLike.replace(/%/g, '');
      const filtered = this.customers.filter(c =>
        c.store_id === store_id &&
        (c.name.toLowerCase().includes(namePattern) || c.phone.includes(phonePattern))
      );
      // Sort by name
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      const off = offset ?? 0;
      const lim = limit ?? 20;
      return filtered.slice(off, off + lim) as T[];
    }

    // 3. Select dirty customers
    if (query.includes('FROM customers WHERE is_dirty = 1')) {
      return this.customers.filter(c => c.is_dirty === 1) as T[];
    }

    // 4. Select dirty ledger entries
    if (query.includes('FROM ledger_entries WHERE is_dirty = 1')) {
      return this.ledger_entries.filter(l => l.is_dirty === 1) as T[];
    }

    // 4a. Select all tenants
    if (query.includes('FROM tenants')) {
      return this.tenants as T[];
    }

    // 4b. Select stores by tenant
    if (query.includes('FROM stores WHERE tenant_id = ?')) {
      const [tenant_id] = actualParams;
      return this.stores.filter(s => s.tenant_id === tenant_id) as T[];
    }

    // 5. Select defaulters
    if (query.includes('GROUP BY le.customer_id') || query.includes('HAVING total_due > 0')) {
      const [store_id, limit] = actualParams;
      const storeEntries = this.ledger_entries.filter(l => l.store_id === store_id);
      const dueMap: Record<string, number> = {};
      storeEntries.forEach(le => {
        dueMap[le.customer_id] = (dueMap[le.customer_id] || 0) + (le.total_amount - le.paid_amount);
      });
      const list = Object.keys(dueMap)
        .map(cid => {
          const cust = this.customers.find(c => c.id === cid);
          return {
            customer_id: cid,
            name: cust ? cust.name : '',
            phone: cust ? cust.phone : '',
            total_due: dueMap[cid],
          };
        })
        .filter(c => c.total_due > 0);
      list.sort((a, b) => b.total_due - a.total_due);
      return list.slice(0, limit ?? 20) as T[];
    }

    // 6. Select ledger reports join
    if (query.includes('FROM ledger_entries le JOIN customers c ON c.id = le.customer_id')) {
      const [store_id, fromDateNull, fromDate, toDateNull, toDate, typeNull, entryType, searchNull, searchName, searchPhone, limit, offset] = actualParams;
      const filtered = this.ledger_entries.filter(le => {
        if (le.store_id !== store_id) return false;

        // Find joined customer
        const cust = this.customers.find(c => c.id === le.customer_id);
        if (!cust) return false;

        // Date range filters (assuming ISO strings or parseable string format)
        const leDate = new Date(le.created_at).toISOString().split('T')[0];
        if (!fromDateNull && fromDate && leDate < fromDate) return false;
        if (!toDateNull && toDate && leDate > toDate) return false;

        // Type filter
        if (!typeNull && entryType && le.entry_type !== entryType) return false;

        // Customer Search
        if (!searchNull && searchName) {
          const searchPattern = searchName.replace(/%/g, '').toLowerCase();
          const nameMatch = cust.name.toLowerCase().includes(searchPattern);
          const phoneMatch = cust.phone.includes(searchPattern);
          if (!nameMatch && !phoneMatch) return false;
        }

        return true;
      });

      // Join data
      const joined = filtered.map(le => {
        const cust = this.customers.find(c => c.id === le.customer_id)!;
        return {
          ...le,
          name: cust.name,
          phone: cust.phone,
        };
      });

      // Sort by created_at DESC
      joined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      const off = offset ?? 0;
      const lim = limit ?? 30;
      return joined.slice(off, off + lim) as T[];
    }

    console.warn('Web DB Unrecognized getAllAsync SQL:', sql);
    return [];
  }

  async getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null> {
    const query = sql.trim().replace(/\s+/g, ' ');
    const actualParams = Array.isArray(params[0]) ? params[0] : params;

    // 1. Query local terminals table (retry lookup)
    if (query.includes('FROM terminals WHERE phone = ? AND store_id = ?')) {
      const [phone, store_id] = actualParams;
      const row = this.terminals.find(t => t.phone === phone && t.store_id === store_id);
      return (row as T) || null;
    }

    // 2. Query single customer
    if (query.includes('FROM customers WHERE store_id = ? AND id = ?')) {
      const [store_id, id] = actualParams;
      const row = this.customers.find(c => c.store_id === store_id && c.id === id);
      return (row as T) || null;
    }

    // 3. Query total baki outstanding
    if (query.includes('SELECT SUM(total_amount - paid_amount)')) {
      const [store_id] = actualParams;
      const total = this.ledger_entries
        .filter(l => l.store_id === store_id)
        .reduce((sum, l) => sum + (l.total_amount - l.paid_amount), 0);
      return { total_due: total } as any as T;
    }

    // 4. Query today's collection
    if (query.includes("SELECT SUM(paid_amount) FROM ledger_entries WHERE store_id = ? AND date(created_at) = date('now')")) {
      const [store_id] = actualParams;
      const todayStr = new Date().toISOString().split('T')[0];
      const total = this.ledger_entries
        .filter(l => l.store_id === store_id && new Date(l.created_at).toISOString().split('T')[0] === todayStr)
        .reduce((sum, l) => sum + l.paid_amount, 0);
      return { total_collected: total } as any as T;
    }

    console.warn('Web DB Unrecognized getFirstAsync SQL:', sql);
    return null;
  }

  clearDatabase() {
    this.terminals = [];
    this.customers = [];
    this.ledger_entries = [];
    this.tenants = [];
    this.stores = [];
  }
}

export interface AppDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, ...params: any[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: any[]): Promise<T | null>;
}

let nativeDb: any = null;
let webDb: WebSqlDatabase | null = null;

export function getDatabase(): AppDatabase {
  const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  const isNodeTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';

  if (isWeb || isNodeTest) {
    if (!webDb) {
      webDb = new WebSqlDatabase();
    }
    return webDb;
  }

  if (!nativeDb) {
    if (SQLite) {
      nativeDb = SQLite.openDatabaseSync('baki_local.db');
    } else {
      // Fallback if expo-sqlite is not available (e.g. testing in Node without mocks)
      if (!webDb) {
        webDb = new WebSqlDatabase();
      }
      return webDb;
    }
  }
  return nativeDb;
}

export async function initDatabase() {
  const db = getDatabase();
  if (db instanceof WebSqlDatabase) {
    const isNodeTest = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
    if (isNodeTest) {
      db.clearDatabase();
    }
    return;
  }

  try {
    await db.execAsync(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS tenants (
        id            TEXT PRIMARY KEY,
        business_name TEXT NOT NULL,
        created_at    TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS stores (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        store_name  TEXT NOT NULL,
        location    TEXT,
        created_at  TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS terminals (
        id          TEXT PRIMARY KEY,
        store_id    TEXT NOT NULL,
        tenant_id   TEXT NOT NULL,
        store_name  TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        phone       TEXT NOT NULL,
        pin_hash    TEXT NOT NULL,
        jwt_cache   TEXT,
        created_at  TEXT DEFAULT (datetime('now'))
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
        id            TEXT PRIMARY KEY,
        store_id      TEXT NOT NULL,
        customer_id   TEXT NOT NULL REFERENCES customers(id),
        entry_type    TEXT NOT NULL CHECK(entry_type IN ('sale','collection')),
        total_amount  REAL NOT NULL,
        paid_amount   REAL NOT NULL DEFAULT 0,
        note          TEXT,
        is_dirty      INTEGER DEFAULT 1,
        created_at    TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_customers_store    ON customers(store_id);
      CREATE INDEX IF NOT EXISTS idx_customers_phone    ON customers(phone);
      CREATE INDEX IF NOT EXISTS idx_ledger_customer    ON ledger_entries(customer_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_dirty       ON ledger_entries(is_dirty);
      CREATE INDEX IF NOT EXISTS idx_ledger_created     ON ledger_entries(created_at DESC);
    `);
  } catch (err) {
    console.error('Failed to initialize local SQLite database schema:', err);
    throw err;
  }
}
