import NetInfo from '@react-native-community/netinfo';

import { customerQueries } from '../db/queries/customers';
import { ledgerQueries } from '../db/queries/ledger';
import { storeQueries } from '../db/queries/stores';
import { tenantQueries } from '../db/queries/tenants';
import { userQueries } from '../db/queries/users';
import { initDatabase } from '../db/schema';
import { cloudAdapter } from '../services/cloudAdapter';

type SyncCallback = (status: SyncEngineStatus) => void;

export interface SyncEngineStatus {
  dirtyCount: number;
  lastSyncedAt: string | null;
  lastUserSyncedAt: string | null;
  running: boolean;
  syncing: boolean;
}

export class SyncEngine {
  private running = false;
  private syncing = false;
  private intervalId: any = null;
  private listeners = new Set<SyncCallback>();

  // Sync state stored in memory (and synced from/to SQLite or storage)
  private dirtyCount = 0;
  private lastSyncedAt: string | null = null;
  private lastUserSyncedAt: string | null = null;

  constructor() {
    this.lastSyncedAt = null;
    this.lastUserSyncedAt = null;
  }

  async start(storeId?: string): Promise<void> {
    if (this.running) return;

    // Ensure database and tables exist
    await initDatabase();

    this.running = true;
    await this.calculateDirtyCount();

    this.emitStatus();
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.emitStatus();
  }

  async calculateDirtyCount(): Promise<number> {
    try {
      const dirtyCustomers = await customerQueries.getDirtyCustomers();
      const dirtyLedger = await ledgerQueries.getDirtyLedgerEntries();
      this.dirtyCount = dirtyCustomers.length + dirtyLedger.length;
      this.emitStatus();
      return this.dirtyCount;
    } catch (err) {
      console.warn('Failed to calculate dirty count:', err);
      return 0;
    }
  }

  getStatus(): SyncEngineStatus {
    return {
      dirtyCount: this.dirtyCount,
      lastSyncedAt: this.lastSyncedAt,
      lastUserSyncedAt: this.lastUserSyncedAt,
      running: this.running,
      syncing: this.syncing
    };
  }

  // Pre-auth fallback sync of users
  async syncUsers(tenantId: string): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      throw new Error('No internet connection to sync users.');
    }

    if (this.syncing) return;
    this.syncing = true;
    this.emitStatus();

    try {
      const rows = await cloudAdapter.pullUsers(tenantId);
      if (rows && rows.length > 0) {
        // Map any field conversions if needed. SQLite table:
        // id, store_id, tenant_id, store_name, branch_name, pin_hash, jwt_cache, created_at
        const mappedRows = rows.map((r: any) => ({
          id: r.id,
          store_id: r.store_id,
          tenant_id: r.tenant_id,
          store_name: r.store_name || r.business_name || 'Baki Pharmacy',
          branch_name: r.branch_name || 'Main Branch',
          phone: r.phone || '01711111111',
          pin_hash: r.pin_hash,
          jwt_cache: r.jwt_cache || null,
          created_at: r.created_at || new Date().toISOString()
        }));

        await userQueries.upsertUsers(mappedRows);
      }
      this.lastUserSyncedAt = new Date().toISOString();
      this.emitStatus();
    } catch (err) {
      console.error('syncUsers error:', err);
      throw err;
    } finally {
      this.syncing = false;
      this.emitStatus();
    }
  }

  async syncTenants(): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      throw new Error('No internet connection to sync tenants.');
    }

    const wasSyncing = this.syncing;
    if (!wasSyncing) {
      this.syncing = true;
      this.emitStatus();
    }

    try {
      const rows = await cloudAdapter.pullTenants();
      if (rows && rows.length > 0) {
        const mappedRows = rows.map((r: any) => ({
          id: r.id,
          business_name: r.business_name,
          created_at: r.created_at || new Date().toISOString()
        }));
        await tenantQueries.upsertTenants(mappedRows);
      }
    } catch (err) {
      console.error('syncTenants error:', err);
      throw err;
    } finally {
      if (!wasSyncing) {
        this.syncing = false;
        this.emitStatus();
      }
    }
  }

  async syncStores(tenantId: string): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      throw new Error('No internet connection to sync stores.');
    }

    const wasSyncing = this.syncing;
    if (!wasSyncing) {
      this.syncing = true;
      this.emitStatus();
    }

    try {
      const rows = await cloudAdapter.pullStores(tenantId);
      if (rows && rows.length > 0) {
        const mappedRows = rows.map((r: any) => ({
          id: r.id,
          tenant_id: r.tenant_id,
          store_name: r.store_name,
          location: r.location || null,
          created_at: r.created_at || new Date().toISOString()
        }));
        await storeQueries.upsertStores(mappedRows);
      }
    } catch (err) {
      console.error('syncStores error:', err);
      throw err;
    } finally {
      if (!wasSyncing) {
        this.syncing = false;
        this.emitStatus();
      }
    }
  }

  // Background sync push & pull
  async syncAll(storeId: string): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) return;

    if (this.syncing) return;
    this.syncing = true;
    this.emitStatus();

    try {
      // 1. Push dirty data
      await this.pushPending();

      // 2. Pull remote data
      await this.pullRemote(storeId);

      this.lastSyncedAt = new Date().toISOString();
      await this.calculateDirtyCount();
    } catch (err) {
      console.warn('syncAll error:', err);
    } finally {
      this.syncing = false;
      this.emitStatus();
    }
  }

  async pushPending(): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) return;

    try {
      console.log('SyncEngine.pushPending: Starting push cycle');

      // 1. Fetch dirty customers and push
      let dirtyCustomers;
      try {
        console.log('SyncEngine.pushPending: Calling getDirtyCustomers');
        dirtyCustomers = await customerQueries.getDirtyCustomers();
        console.log('SyncEngine.pushPending: getDirtyCustomers returned', dirtyCustomers.length, 'records');
      } catch (err: any) {
        console.error('SyncEngine.pushPending: getDirtyCustomers failed with:', err?.message || err);
        throw err;
      }

      if (dirtyCustomers.length > 0) {
        const cloudCusts = dirtyCustomers.map(c => ({
          id: c.id,
          store_id: c.store_id,
          name: c.name,
          phone: c.phone,
          updated_at: c.updated_at
        }));

        try {
          console.log('SyncEngine.pushPending: Pushing customers to cloud');
          await cloudAdapter.upsertCustomers(cloudCusts);
        } catch (err: any) {
          console.error('SyncEngine.pushPending: Cloud customer upsert failed:', err?.message || err);
          throw err;
        }

        for (const c of dirtyCustomers) {
          try {
            console.log('SyncEngine.pushPending: Marking customer synced:', c.id);
            await customerQueries.markSynced(c.id);
          } catch (err: any) {
            console.error('SyncEngine.pushPending: markSynced failed for customer', c.id, ':', err?.message || err);
            throw err;
          }
        }
      }

      // 2. Fetch dirty ledger entries and push
      let dirtyLedger;
      try {
        console.log('SyncEngine.pushPending: Calling getDirtyLedgerEntries');
        dirtyLedger = await ledgerQueries.getDirtyLedgerEntries();
        console.log('SyncEngine.pushPending: getDirtyLedgerEntries returned', dirtyLedger.length, 'records');
      } catch (err: any) {
        console.error('SyncEngine.pushPending: getDirtyLedgerEntries failed with:', err?.message || err);
        throw err;
      }

      if (dirtyLedger.length > 0) {
        const cloudLedger = dirtyLedger.map(le => ({
          id: le.id,
          store_id: le.store_id,
          customer_id: le.customer_id,
          entry_type: le.entry_type,
          total_amount: le.total_amount,
          paid_amount: le.paid_amount,
          note: le.note,
          created_at: le.created_at
        }));

        try {
          console.log('SyncEngine.pushPending: Pushing ledger entries to cloud');
          await cloudAdapter.upsertLedgerEntries(cloudLedger);
        } catch (err: any) {
          console.error('SyncEngine.pushPending: Cloud ledger upsert failed:', err?.message || err);
          throw err;
        }

        for (const le of dirtyLedger) {
          try {
            console.log('SyncEngine.pushPending: Marking ledger entry synced:', le.id);
            await ledgerQueries.markSynced(le.id);
          } catch (err: any) {
            console.error('SyncEngine.pushPending: markSynced failed for ledger entry', le.id, ':', err?.message || err);
            throw err;
          }
        }
      }

      try {
        console.log('SyncEngine.pushPending: Recalculating dirty count');
        await this.calculateDirtyCount();
      } catch (err: any) {
        console.error('SyncEngine.pushPending: calculateDirtyCount failed:', err?.message || err);
        throw err;
      }
    } catch (err) {
      console.error('pushPending failed:', err);
      throw err;
    }
  }

  async pullRemote(storeId: string): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) return;

    try {
      const sinceDate = this.lastSyncedAt || new Date(0).toISOString();

      // 1. Pull remote customers
      const remoteCustomers = await cloudAdapter.pullCustomersSince(storeId, sinceDate);
      for (const rc of remoteCustomers) {
        // Read local copy to apply Last-Write-Wins (Section 12)
        const local = await customerQueries.getCustomerById(storeId, rc.id);
        const incomingTime = new Date(rc.updated_at).getTime();
        const localTime = local ? new Date(local.updated_at).getTime() : 0;

        if (!local || incomingTime >= localTime) {
          await customerQueries.upsertCustomer({
            id: rc.id,
            store_id: rc.store_id,
            name: rc.name,
            phone: rc.phone,
            is_dirty: 0,
            created_at: rc.created_at || rc.updated_at,
            updated_at: rc.updated_at
          });
        }
      }

      // 2. Pull remote ledger entries (Append-only so no conflicts, upsert DO NOTHING/OVERWRITE)
      const remoteLedger = await cloudAdapter.pullLedgerSince(storeId, sinceDate);
      for (const rl of remoteLedger) {
        await ledgerQueries.upsertLedgerEntry({
          id: rl.id,
          store_id: rl.store_id,
          customer_id: rl.customer_id,
          entry_type: rl.entry_type as 'sale' | 'collection',
          total_amount: rl.total_amount,
          paid_amount: rl.paid_amount,
          note: rl.note,
          is_dirty: 0,
          created_at: rl.created_at
        });
      }
    } catch (err) {
      console.error('pullRemote failed:', err);
      throw err;
    }
  }

  private async checkConnection(): Promise<boolean> {
    const isWeb = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
    if (isWeb) {
      return typeof navigator !== 'undefined' && navigator.onLine;
    }
    try {
      const state = await NetInfo.fetch();
      return !!state.isConnected;
    } catch (e) {
      return false;
    }
  }

  on(cb: SyncCallback): () => void {
    this.listeners.add(cb);
    cb(this.getStatus());
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emitStatus() {
    const status = this.getStatus();
    this.listeners.forEach(cb => cb(status));
  }
}

// Single active instance
export const syncEngineInstance = new SyncEngine();
export default syncEngineInstance;
