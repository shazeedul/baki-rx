import { getDatabase } from '../schema';

export interface LedgerEntryRow {
  id: string;
  store_id: string;
  customer_id: string;
  entry_type: 'sale' | 'collection';
  total_amount: number;
  paid_amount: number;
  due_amount: number; // generated virtual column or computed
  note: string | null;
  is_dirty: number;
  created_at: string;
}

export interface DefaulterRow {
  customer_id: string;
  name: string;
  phone: string;
  total_due: number;
}

export interface ReportRow extends LedgerEntryRow {
  name: string;
  phone: string;
}

export const ledgerQueries = {
  async getTotalBaki(storeId: string): Promise<number> {
    const db = getDatabase();
    const row = await db.getFirstAsync<{ total_due: number }>(
      `SELECT SUM(total_amount - paid_amount) as total_due FROM ledger_entries WHERE store_id = ?;`,
      [storeId]
    );
    return row?.total_due || 0;
  },

  async getTodayCollection(storeId: string): Promise<number> {
    const db = getDatabase();
    const row = await db.getFirstAsync<{ total_collected: number }>(
      `SELECT SUM(paid_amount) as total_collected 
       FROM ledger_entries 
       WHERE store_id = ? AND date(created_at) = date('now');`,
      [storeId]
    );
    return row?.total_collected || 0;
  },

  async getTopDefaulters(storeId: string, limit = 20): Promise<DefaulterRow[]> {
    const db = getDatabase();
    return db.getAllAsync<DefaulterRow>(
      `SELECT le.customer_id, c.name, c.phone, SUM(le.total_amount - le.paid_amount) as total_due
       FROM ledger_entries le
       JOIN customers c ON c.id = le.customer_id
       WHERE le.store_id = ?
       GROUP BY le.customer_id
       HAVING total_due > 0
       ORDER BY total_due DESC
       LIMIT ?;`,
      [storeId, limit]
    );
  },

  async createLedgerEntry(entry: Omit<LedgerEntryRow, 'due_amount' | 'is_dirty' | 'created_at'> & { is_dirty?: number; created_at?: string }): Promise<void> {
    const db = getDatabase();
    const isDirty = entry.is_dirty ?? 1;
    const createdAt = entry.created_at ?? new Date().toISOString();

    await db.runAsync(
      `INSERT INTO ledger_entries (id, store_id, customer_id, entry_type, total_amount, paid_amount, note, is_dirty, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [entry.id, entry.store_id, entry.customer_id, entry.entry_type, entry.total_amount, entry.paid_amount, entry.note ?? null, isDirty, createdAt]
    );
  },

  async upsertLedgerEntry(entry: Omit<LedgerEntryRow, 'due_amount'>): Promise<void> {
    const db = getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO ledger_entries (id, store_id, customer_id, entry_type, total_amount, paid_amount, note, is_dirty, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [entry.id, entry.store_id, entry.customer_id, entry.entry_type, entry.total_amount, entry.paid_amount, entry.note ?? null, entry.is_dirty, entry.created_at]
    );
  },

  async getDirtyLedgerEntries(): Promise<LedgerEntryRow[]> {
    const db = getDatabase();
    return db.getAllAsync<LedgerEntryRow>(
      `SELECT id, store_id, customer_id, entry_type, total_amount, paid_amount, (total_amount - paid_amount) as due_amount, note, is_dirty, created_at 
       FROM ledger_entries 
       WHERE is_dirty = 1;`
    );
  },

  async markSynced(id: string): Promise<void> {
    const db = getDatabase();
    await db.runAsync(`UPDATE ledger_entries SET is_dirty = 0 WHERE id = ?;`, [id]);
  },

  async getCustomerTransactions(storeId: string, customerId: string): Promise<LedgerEntryRow[]> {
    const db = getDatabase();
    return db.getAllAsync<LedgerEntryRow>(
      `SELECT id, store_id, customer_id, entry_type, total_amount, paid_amount, (total_amount - paid_amount) as due_amount, note, is_dirty, created_at 
       FROM ledger_entries 
       WHERE store_id = ? AND customer_id = ?
       ORDER BY created_at DESC;`,
      [storeId, customerId]
    );
  },

  async getReportEntries(
    storeId: string,
    filters: {
      fromDate: string | null;
      toDate: string | null;
      entryType: 'all' | 'sale' | 'collection';
      customerSearch: string;
    },
    limit = 30,
    offset = 0
  ): Promise<ReportRow[]> {
    const db = getDatabase();

    const fromDateNull = filters.fromDate ? 0 : 1;
    const fromDate = filters.fromDate || '';

    const toDateNull = filters.toDate ? 0 : 1;
    const toDate = filters.toDate || '';

    const typeNull = filters.entryType === 'all' ? 1 : 0;
    const entryType = filters.entryType === 'all' ? '' : filters.entryType;

    const searchNull = filters.customerSearch ? 0 : 1;
    const searchPattern = filters.customerSearch ? `%${filters.customerSearch}%` : '';

    return db.getAllAsync<ReportRow>(
      `SELECT le.id, le.store_id, le.customer_id, le.entry_type, le.total_amount, le.paid_amount, 
              (le.total_amount - le.paid_amount) as due_amount, le.note, le.is_dirty, le.created_at, 
              c.name, c.phone
       FROM ledger_entries le
       JOIN customers c ON c.id = le.customer_id
       WHERE le.store_id = ?
         AND (? = 1 OR date(le.created_at) >= ?)
         AND (? = 1 OR date(le.created_at) <= ?)
         AND (? = 1 OR le.entry_type = ?)
         AND (? = 1 OR c.name LIKE ? OR c.phone LIKE ?)
       ORDER BY le.created_at DESC
       LIMIT ? OFFSET ?;`,
      [
        storeId,
        fromDateNull, fromDate,
        toDateNull, toDate,
        typeNull, entryType,
        searchNull, searchPattern, searchPattern,
        limit, offset
      ]
    );
  }
};
