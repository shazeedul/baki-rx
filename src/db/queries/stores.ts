import { getDb } from '@/db/schema';

export interface Store {
  id: string;
  tenant_id: string;
  store_name: string;
  location: string | null;
  created_at: string;
}

export async function getStore(storeId: string): Promise<Store | null> {
  const db = await getDb();
  return db.getFirstAsync<Store>(`SELECT * FROM stores WHERE id = ?`, [storeId]);
}

export async function upsertStore(store: Store): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO stores (id, tenant_id, store_name, location, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       store_name = excluded.store_name,
       location   = excluded.location`,
    [store.id, store.tenant_id, store.store_name, store.location ?? null, store.created_at],
  );
}
