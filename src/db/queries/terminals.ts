import { getDatabase } from '../schema';

export interface TerminalRow {
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

export const terminalQueries = {
  async getTerminalByPhoneAndStore(phone: string, storeId: string): Promise<TerminalRow | null> {
    const db = getDatabase();
    return db.getFirstAsync<TerminalRow>(
      `SELECT id, store_id, tenant_id, store_name, branch_name, phone, pin_hash, jwt_cache, created_at 
       FROM terminals 
       WHERE phone = ? AND store_id = ?;`,
      [phone, storeId]
    );
  },

  async upsertTerminals(terminals: TerminalRow[]): Promise<void> {
    const db = getDatabase();
    for (const t of terminals) {
      await db.runAsync(
        `INSERT OR REPLACE INTO terminals (id, store_id, tenant_id, store_name, branch_name, phone, pin_hash, jwt_cache, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [t.id, t.store_id, t.tenant_id, t.store_name, t.branch_name, t.phone, t.pin_hash, t.jwt_cache ?? null, t.created_at]
      );
    }
  },

  async getAllTerminals(): Promise<TerminalRow[]> {
    const db = getDatabase();
    return db.getAllAsync<TerminalRow>(
      `SELECT id, store_id, tenant_id, store_name, branch_name, phone, pin_hash, jwt_cache, created_at 
       FROM terminals;`
    );
  }
};
