import { getDatabase } from '../schema';

export interface StoreRow {
  id: string;
  tenant_id: string;
  store_name: string;
  location: string | null;
  created_at: string;
}

export const storeQueries = {
  async upsertStores(rows: StoreRow[]): Promise<void> {
    const db = getDatabase();
    for (const r of rows) {
      await db.runAsync(
        `INSERT OR REPLACE INTO stores (id, tenant_id, store_name, location, created_at) VALUES (?, ?, ?, ?, ?);`,
        [r.id, r.tenant_id, r.store_name, r.location, r.created_at]
      );
    }
  },

  async getStoresByTenant(tenantId: string): Promise<StoreRow[]> {
    const db = getDatabase();
    return db.getAllAsync<StoreRow>(
      `SELECT id, tenant_id, store_name, location, created_at FROM stores WHERE tenant_id = ?;`,
      [tenantId]
    );
  }
};
