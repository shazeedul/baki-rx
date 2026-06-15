import { clearAndRebuildUserStores, upsertTenant, upsertUser } from '../db/queries/auth';
import { getDirtyCustomers, markCustomersSynced, upsertCustomerFromCloud } from '../db/queries/customers';
import { countDirty, getDirtyLedgerEntries, markLedgerEntriesSynced, upsertLedgerEntryFromCloud } from '../db/queries/ledger';
import { upsertStore } from '../db/queries/stores';
import { getDb } from '../db/schema';
import { cloudAdapter } from '../services/cloudAdapter';
import { useSyncStore } from '../store/syncStore';

class SyncEngine {
  private running = false;

  async sync(storeId: string, tenantId: string): Promise<void> {
    if (this.running) return;
    this.running = true;
    useSyncStore.getState().setIsSyncing(true);

    try {
      await this.pushDirtyCustomers(storeId);
      await this.pushDirtyLedger(storeId);
      await this.pullLedger(storeId);

      const dirty = await countDirty(storeId);
      useSyncStore.getState().setDirtyCount(dirty);
      useSyncStore.getState().setLastSyncedAt(new Date().toISOString());
    } catch {
      // Network failures are silent — is_dirty stays 1 and retries next connectivity event
    } finally {
      this.running = false;
      useSyncStore.getState().setIsSyncing(false);
    }
  }

  private async pushDirtyCustomers(storeId: string): Promise<void> {
    const dirty = await getDirtyCustomers(storeId);
    if (dirty.length === 0) return;
    await cloudAdapter.upsertCustomers(dirty);
    await markCustomersSynced(dirty.map((c) => c.id));
  }

  private async pushDirtyLedger(storeId: string): Promise<void> {
    const dirty = await getDirtyLedgerEntries(storeId);
    if (dirty.length === 0) return;
    await cloudAdapter.upsertLedgerEntries(dirty);
    await markLedgerEntriesSynced(dirty.map((e) => e.id));
  }

  private async pullLedger(storeId: string): Promise<void> {
    const since = useSyncStore.getState().lastSyncedAt ?? '1970-01-01T00:00:00.000Z';
    const entries = await cloudAdapter.pullLedgerSince(storeId, since);
    for (const entry of entries) {
      await upsertLedgerEntryFromCloud(entry);
    }
    const customers = await cloudAdapter.pullCustomersSince(storeId, since);
    for (const c of customers) {
      await upsertCustomerFromCloud(c);
    }
  }

  async syncUsers(tenantId: string): Promise<void> {
    const { users, userStores } = await cloudAdapter.pullTenantRoster(tenantId);
    if (!users || users.length === 0) return;

    console.log(`Syncing ${users.length} users for tenant ${tenantId}`);
    for (const user of users) {
      await upsertUser(user);
    }
    await clearAndRebuildUserStores(tenantId, userStores);
    useSyncStore.getState().setLastUserSyncedAt(new Date().toISOString());
  }

  async bootstrapTenants(): Promise<void> {
    const tenants = await cloudAdapter.pullTenants();
    for (const t of tenants) {
      await upsertTenant(t);
    }
  }

  async syncStores(tenantId: string): Promise<void> {
    const stores = await cloudAdapter.pullStores(tenantId);
    console.log(`Syncing ${stores.length} stores for tenant ${tenantId}`);
    for (const s of stores) {
      await upsertStore(s);
    }
  }

  async syncTenantFull(tenantId: string): Promise<void> {
    // 1. Pull and sync stores
    await this.syncStores(tenantId);

    // 2. Pull and sync users & user_stores
    await this.syncUsers(tenantId);

    // 3. Query all stores for the tenant to fetch their customers
    const db = await getDb();
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM stores WHERE tenant_id = ?`,
      [tenantId],
    );

    // 4. Pull and sync customers for each store
    for (const row of rows) {
      const customers = await cloudAdapter.pullCustomersSince(row.id, '1970-01-01T00:00:00.000Z');
      for (const c of customers) {
        await upsertCustomerFromCloud(c);
      }
    }
  }
}

export const syncEngine = new SyncEngine();
