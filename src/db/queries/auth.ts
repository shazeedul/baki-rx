import { getDb } from '@/db/schema';

export interface User {
  id: string;
  tenant_id: string;
  phone: string;
  password_hash: string;
  default_store_id: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  business_name: string;
  created_at: string;
}

export interface UserStore {
  user_id: string;
  store_id: string;
  tenant_id: string;
}

export async function getLocalTenants(): Promise<Tenant[]> {
  const db = await getDb();
  return db.getAllAsync<Tenant>(`SELECT * FROM tenants ORDER BY business_name`);
}

export async function findLocalUser(tenantId: string, phone: string): Promise<User | null> {
  const db = await getDb();
  return db.getFirstAsync<User>(
    `SELECT * FROM users WHERE tenant_id = ? AND phone = ?`,
    [tenantId, phone],
  );
}

export async function upsertTenant(tenant: Tenant): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO tenants (id, business_name, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET business_name = excluded.business_name`,
    [tenant.id, tenant.business_name, tenant.created_at],
  );
}

export async function upsertUser(user: User): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO users (id, tenant_id, phone, password_hash, default_store_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       phone = excluded.phone,
       password_hash = excluded.password_hash,
       default_store_id = excluded.default_store_id`,
    [user.id, user.tenant_id, user.phone, user.password_hash, user.default_store_id, user.created_at],
  );
}

export async function clearAndRebuildUserStores(tenantId: string, userStores: UserStore[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM user_stores WHERE tenant_id = ?`,
      [tenantId],
    );
    for (const us of userStores) {
      await db.runAsync(
        `INSERT OR IGNORE INTO user_stores (user_id, store_id, tenant_id) VALUES (?, ?, ?)`,
        [us.user_id, us.store_id, us.tenant_id || tenantId],
      );
    }
  });
}

export async function getUserStores(userId: string): Promise<UserStore[]> {
  const db = await getDb();
  return db.getAllAsync<UserStore>(
    `SELECT * FROM user_stores WHERE user_id = ?`,
    [userId],
  );
}

