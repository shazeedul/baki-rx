import { getDatabase } from '../schema';

export interface TenantRow {
  id: string;
  business_name: string;
  created_at: string;
}

export const tenantQueries = {
  async upsertTenants(rows: TenantRow[]): Promise<void> {
    const db = getDatabase();
    for (const r of rows) {
      await db.runAsync(
        `INSERT OR REPLACE INTO tenants (id, business_name, created_at) VALUES (?, ?, ?);`,
        [r.id, r.business_name, r.created_at]
      );
    }
  },

  async getAllTenants(): Promise<TenantRow[]> {
    const db = getDatabase();
    return db.getAllAsync<TenantRow>(`SELECT id, business_name, created_at FROM tenants;`);
  }
};
