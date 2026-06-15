import { getDb } from '../schema';

export interface Customer {
  id: string;
  store_id: string;
  name: string;
  phone: string;
  is_dirty: number;
  created_at: string;
  updated_at: string;
}

export async function getCustomerById(customerId: string, storeId: string): Promise<Customer | null> {
  const db = await getDb();
  return db.getFirstAsync<Customer>(
    `SELECT * FROM customers WHERE id = ? AND store_id = ?`,
    [customerId, storeId],
  );
}

export async function insertCustomer(customer: Omit<Customer, 'created_at' | 'updated_at'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO customers (id, store_id, name, phone, is_dirty) VALUES (?, ?, ?, ?, 1)`,
    [customer.id, customer.store_id, customer.name, customer.phone],
  );
}

export async function searchCustomers(
  storeId: string,
  query: string,
  limit = 20,
  offset = 0,
): Promise<Customer[]> {
  const db = await getDb();
  const pattern = `%${query}%`;
  return db.getAllAsync<Customer>(
    `SELECT * FROM customers
     WHERE store_id = ?
       AND (name LIKE ? OR phone LIKE ?)
     ORDER BY name
     LIMIT ? OFFSET ?`,
    [storeId, pattern, pattern, limit, offset],
  );
}

export async function listCustomers(storeId: string, limit = 20, offset = 0): Promise<Customer[]> {
  const db = await getDb();
  return db.getAllAsync<Customer>(
    `SELECT * FROM customers WHERE store_id = ? ORDER BY name LIMIT ? OFFSET ?`,
    [storeId, limit, offset],
  );
}

export async function getDirtyCustomers(storeId: string): Promise<Customer[]> {
  const db = await getDb();
  return db.getAllAsync<Customer>(
    `SELECT * FROM customers WHERE store_id = ? AND is_dirty = 1`,
    [storeId],
  );
}

export async function markCustomersSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE customers SET is_dirty = 0 WHERE id IN (${placeholders})`,
    ids,
  );
}

export async function upsertCustomerFromCloud(customer: Omit<Customer, 'is_dirty'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO customers (id, store_id, name, phone, is_dirty, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       phone = excluded.phone,
       updated_at = excluded.updated_at,
       is_dirty = 0`,
    [customer.id, customer.store_id, customer.name, customer.phone, customer.created_at, customer.updated_at],
  );
}

export interface CustomerBalance {
  id: string;
  name: string;
  phone: string;
  total_due: number;
}

export async function getCustomerBalances(storeId: string, search?: string): Promise<CustomerBalance[]> {
  const db = await getDb();
  let query = `
    SELECT c.id, c.name, c.phone,
           COALESCE(SUM(le.total_amount - le.paid_amount), 0) AS total_due
    FROM customers c
    LEFT JOIN ledger_entries le ON le.customer_id = c.id
    WHERE c.store_id = ?
  `;
  const params: (string | number)[] = [storeId];
  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ?)`;
    const p = `%${search}%`;
    params.push(p, p);
  }
  query += `
    GROUP BY c.id
    ORDER BY c.name
  `;
  return db.getAllAsync<CustomerBalance>(query, params);
}
