import { getDatabase } from '../schema';

export interface UserRow {
  id: string;
  store_id: string;
  tenant_id: string;
  store_name: string;
  branch_name: string;
  phone: string;
  pin_hash: string;
  jwt_cache: string | null;
  created_at: string;
}

export const userQueries = {
  async getUserByPhoneAndStore(phone: string, storeId: string): Promise<UserRow | null> {
    const db = getDatabase();
    return db.getFirstAsync<UserRow>(
      `SELECT id, store_id, tenant_id, store_name, branch_name, phone, pin_hash, jwt_cache, created_at 
       FROM users 
       WHERE phone = ? AND store_id = ?;`,
      [phone, storeId]
    );
  },

  async upsertUsers(users: UserRow[]): Promise<void> {
    const db = getDatabase();
    for (const t of users) {
      await db.runAsync(
        `INSERT OR REPLACE INTO users (id, store_id, tenant_id, store_name, branch_name, phone, pin_hash, jwt_cache, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [t.id, t.store_id, t.tenant_id, t.store_name, t.branch_name, t.phone, t.pin_hash, t.jwt_cache ?? null, t.created_at]
      );
    }
  },

  async getAllUsers(): Promise<UserRow[]> {
    const db = getDatabase();
    return db.getAllAsync<UserRow>(
      `SELECT id, store_id, tenant_id, store_name, branch_name, phone, pin_hash, jwt_cache, created_at 
       FROM users;`
    );
  }
};
