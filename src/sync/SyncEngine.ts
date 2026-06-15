import { cloudAdapter } from '../services/cloudAdapter';
import { getDirtyCustomers, markCustomersSynced, upsertCustomerFromCloud } from '../db/queries/customers';
import { getDirtyLedgerEntries, markLedgerEntriesSynced, upsertLedgerEntryFromCloud, countDirty } from '../db/queries/ledger';
import { upsertUser, upsertTenant, clearAndRebuildUserStores } from '../db/queries/auth';
import { upsertStore } from '../db/queries/stores';
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
    } catch (_e) {
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
    for (const s of stores) {
      await upsertStore(s);
    }
  }
}

export const syncEngine = new SyncEngine();
