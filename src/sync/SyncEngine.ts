import NetInfo from '@react-native-community/netinfo';

import { customerQueries } from '../db/queries/customers';
import { ledgerQueries } from '../db/queries/ledger';
import { terminalQueries } from '../db/queries/terminals';
import { cloudAdapter } from '../services/cloudAdapter';
import { initDatabase } from '../db/schema';

type SyncCallback = (status: SyncEngineStatus) => void;

export interface SyncEngineStatus {
  dirtyCount: number;
  lastSyncedAt: string | null;
  lastTerminalSyncedAt: string | null;
  running: boolean;
}

export class SyncEngine {
  private running = false;
  private intervalId: any = null;
  private listeners = new Set<SyncCallback>();
  
  // Sync state stored in memory (and synced from/to SQLite or storage)
  private dirtyCount = 0;
  private lastSyncedAt: string | null = null;
  private lastTerminalSyncedAt: string | null = null;

  constructor() {
    this.lastSyncedAt = null;
    this.lastTerminalSyncedAt = null;
  }

  // Sourced from environment or passed down
  private getTenantId(): string {
    return process.env.EXPO_PUBLIC_TENANT_ID || 'baki-tenant-id';
  }

  async start(storeId?: string): Promise<void> {
    if (this.running) return;
    
    // Ensure database and tables exist
    await initDatabase();
    
    this.running = true;
    await this.calculateDirtyCount();

    // Start background polling loop for pushing/pulling if storeId is active
    if (storeId) {
      this.intervalId = setInterval(() => {
        this.syncAll(storeId).catch(err => {
          console.warn('Background sync failed:', err);
        });
      }, 15000); // Poll every 15 seconds
    }

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
      const dirtyCusts = await customerQueries.getDirtyCustomers();
      const dirtyLedger = await ledgerQueries.getDirtyLedgerEntries();
      this.dirtyCount = dirtyCusts.length + dirtyLedger.length;
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
      lastTerminalSyncedAt: this.lastTerminalSyncedAt,
      running: this.running
    };
  }

  // Pre-auth fallback sync of terminals
  async syncTerminals(tenantId: string): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) {
      throw new Error('No internet connection to sync terminals.');
    }

    try {
      const rows = await cloudAdapter.pullTerminals(tenantId);
      if (rows && rows.length > 0) {
        // Map any field conversions if needed. SQLite table:
        // id, store_id, tenant_id, store_name, branch_name, pin_hash, jwt_cache, created_at
        const mappedRows = rows.map((r: any) => ({
          id: r.id,
          store_id: r.store_id,
          tenant_id: r.tenant_id,
          store_name: r.store_name || r.business_name || 'Baki Pharmacy',
          branch_name: r.branch_name || 'Main Branch',
          pin_hash: r.pin_hash,
          jwt_cache: r.jwt_cache || null,
          created_at: r.created_at || new Date().toISOString()
        }));

        await terminalQueries.upsertTerminals(mappedRows);
      }
      this.lastTerminalSyncedAt = new Date().toISOString();
      this.emitStatus();
    } catch (err) {
      console.error('syncTerminals error:', err);
      throw err;
    }
  }

  // Background sync push & pull
  async syncAll(storeId: string): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) return;

    try {
      // 1. Push dirty data
      await this.pushPending();

      // 2. Pull remote data
      await this.pullRemote(storeId);
      
      this.lastSyncedAt = new Date().toISOString();
      await this.calculateDirtyCount();
    } catch (err) {
      console.warn('syncAll error:', err);
    }
  }

  async pushPending(): Promise<void> {
    const isConnected = await this.checkConnection();
    if (!isConnected) return;

    try {
      // 1. Fetch dirty customers and push
      const dirtyCusts = await customerQueries.getDirtyCustomers();
      if (dirtyCusts.length > 0) {
        const cloudCusts = dirtyCusts.map(c => ({
          id: c.id,
          store_id: c.store_id,
          name: c.name,
          phone: c.phone,
          updated_at: c.updated_at
        }));
        await cloudAdapter.upsertCustomers(cloudCusts);
        for (const c of dirtyCusts) {
          await customerQueries.markSynced(c.id);
        }
      }

      // 2. Fetch dirty ledger entries and push
      const dirtyLedger = await ledgerQueries.getDirtyLedgerEntries();
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
        await cloudAdapter.upsertLedgerEntries(cloudLedger);
        for (const le of dirtyLedger) {
          await ledgerQueries.markSynced(le.id);
        }
      }

      await this.calculateDirtyCount();
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
      const remoteCusts = await cloudAdapter.pullCustomersSince(storeId, sinceDate);
      for (const rc of remoteCusts) {
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
          entry_type: rl.entry_type as 'baki' | 'payment',
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
