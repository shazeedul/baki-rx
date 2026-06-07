import { getDatabase } from '../schema';

export interface CustomerRow {
  id: string;
  store_id: string;
  name: string;
  phone: string;
  is_dirty: number;
  created_at: string;
  updated_at: string;
}

export const customerQueries = {
  async getCustomers(storeId: string, search = '', limit = 20, offset = 0): Promise<CustomerRow[]> {
    const db = getDatabase();
    const searchPattern = `%${search}%`;
    return db.getAllAsync<CustomerRow>(
      `SELECT id, store_id, name, phone, is_dirty, created_at, updated_at 
       FROM customers 
       WHERE store_id = ? AND (name LIKE ? OR phone LIKE ?) 
       ORDER BY name 
       LIMIT ? OFFSET ?;`,
      [storeId, searchPattern, searchPattern, limit, offset]
    );
  },

  async getCustomerById(storeId: string, id: string): Promise<CustomerRow | null> {
    const db = getDatabase();
    return db.getFirstAsync<CustomerRow>(
      `SELECT id, store_id, name, phone, is_dirty, created_at, updated_at 
       FROM customers 
       WHERE store_id = ? AND id = ?;`,
      [storeId, id]
    );
  },

  async createCustomer(cust: Omit<CustomerRow, 'is_dirty' | 'created_at' | 'updated_at'> & { is_dirty?: number; created_at?: string; updated_at?: string }): Promise<void> {
    const db = getDatabase();
    const isDirty = cust.is_dirty ?? 1;
    const nowStr = new Date().toISOString();
    const createdAt = cust.created_at ?? nowStr;
    const updatedAt = cust.updated_at ?? nowStr;
    
    await db.runAsync(
      `INSERT INTO customers (id, store_id, name, phone, is_dirty, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [cust.id, cust.store_id, cust.name, cust.phone, isDirty, createdAt, updatedAt]
    );
  },

  async updateCustomer(id: string, name: string, phone: string, isDirty = 1): Promise<void> {
    const db = getDatabase();
    const nowStr = new Date().toISOString();
    await db.runAsync(
      `UPDATE customers SET name = ?, phone = ?, is_dirty = ?, updated_at = ? WHERE id = ?;`,
      [name, phone, isDirty, nowStr, id]
    );
  },

  async upsertCustomer(cust: CustomerRow): Promise<void> {
    const db = getDatabase();
    await db.runAsync(
      `INSERT OR REPLACE INTO customers (id, store_id, name, phone, is_dirty, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [cust.id, cust.store_id, cust.name, cust.phone, cust.is_dirty, cust.created_at, cust.updated_at]
    );
  },

  async getDirtyCustomers(): Promise<CustomerRow[]> {
    const db = getDatabase();
    return db.getAllAsync<CustomerRow>(
      `SELECT id, store_id, name, phone, is_dirty, created_at, updated_at 
       FROM customers 
       WHERE is_dirty = 1;`
    );
  },

  async markSynced(id: string): Promise<void> {
    const db = getDatabase();
    await db.runAsync(`UPDATE customers SET is_dirty = 0 WHERE id = ?;`, [id]);
  }
};
