// Minimal LocalSyncEngine implementation following the SyncEngine contract
import { StorageAdapter, SyncEngine, SyncEngineOptions, ChangeRecord, SyncResult, SyncStatus, RemoteClient } from '../types/sync';

type Callback = (payload?: any) => void;

export class LocalSyncEngine implements SyncEngine {
  private adapter: StorageAdapter;
  private options: SyncEngineOptions;
  private running = false;
  private intervalId: any = null;
  private listeners: Map<string, Set<Callback>> = new Map();
  private lastSyncAt?: number;
  private pendingChangesCount = 0;

  constructor(adapter: StorageAdapter, options: SyncEngineOptions = {}) {
    this.adapter = adapter;
    this.options = { pullIntervalMs: 5000, batchSize: 25, ...options };
  }

  private async updatePendingCount(): Promise<void> {
    try {
      const pending = await this.adapter.getPendingChanges(99999);
      this.pendingChangesCount = pending.length;
      this.emit('status', this.getStatus());
    } catch (e) {
      console.warn('Failed to update pending count', e);
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    await this.adapter.open();
    this.running = true;
    await this.updatePendingCount();
    this.intervalId = setInterval(() => {
      this.pushPending().catch((err) => this.emit('error', err));
    }, this.options.pullIntervalMs);
    this.emit('status', this.getStatus());
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
    await this.adapter.close();
    this.emit('status', this.getStatus());
  }

  async enqueueLocalChange(change: ChangeRecord): Promise<void> {
    // persist the change and optimistically apply to local store if needed
    const id = await this.adapter.addChange(change);
    // try to apply locally if data present
    if (change.type !== 'delete' && change.data) {
      // read existing entity
      const existing = await this.adapter.get(change.entityId);
      const rev = (existing?.rev ?? 0) + 1;
      const updatedAt = Date.now();
      await this.adapter.put({ id: change.entityId, data: change.data, rev, updatedAt });
    } else if (change.type === 'delete') {
      await this.adapter.delete(change.entityId);
    }
    await this.updatePendingCount();
  }

  async pushPending(): Promise<SyncResult> {
    const pending = await this.adapter.getPendingChanges(this.options.batchSize);
    if (!pending.length) return { pushed: 0, pulled: 0, conflicts: [] };
    const remote: RemoteClient | undefined = this.options.remote;
    if (!remote) {
      // no-op remote: mark them applied locally
      for (const ch of pending) {
        if (ch.id) await this.adapter.markChangeApplied(ch.id);
      }
      this.lastSyncAt = Date.now();
      await this.updatePendingCount();
      this.emit('sync', { pushed: pending.length });
      return { pushed: pending.length, pulled: 0, conflicts: [] };
    }

    try {
      const resp = await remote.push(pending);
      const pushed = resp.successIds?.length ?? pending.length;
      for (const id of resp.successIds ?? []) {
        await this.adapter.markChangeApplied(id);
      }
      this.lastSyncAt = Date.now();
      await this.updatePendingCount();
      this.emit('sync', { pushed });
      return { pushed, pulled: 0, conflicts: resp.conflicts ? resp.conflicts.map((c) => ({ change: pending.find((p) => p.id === c.changeId)!, reason: c.reason })) : [] };
    } catch (err: any) {
      this.emit('error', err);
      return { pushed: 0, pulled: 0, conflicts: [], errors: [err] };
    }
  }

  async pullRemote(since?: number): Promise<SyncResult> {
    const remote: RemoteClient | undefined = this.options.remote;
    if (!remote) return { pushed: 0, pulled: 0, conflicts: [] };
    try {
      const resp = await remote.pull(since);
      let pulled = 0;
      for (const ch of resp.changes) {
        // apply change using LWW policy: use rev/updatedAt in data if present
        if (ch.type === 'delete') {
          await this.adapter.delete(ch.entityId);
        } else if (ch.data) {
          const existing = await this.adapter.get(ch.entityId);
          const incomingUpdatedAt = (ch.createdAt ?? Date.now());
          if (!existing || incomingUpdatedAt >= existing.updatedAt) {
            const rev = (existing?.rev ?? 0) + 1;
            await this.adapter.put({ id: ch.entityId, data: ch.data, rev, updatedAt: incomingUpdatedAt });
          }
        }
        pulled++;
      }
      this.lastSyncAt = Date.now();
      await this.updatePendingCount();
      this.emit('sync', { pulled });
      return { pushed: 0, pulled, conflicts: [] };
    } catch (err: any) {
      this.emit('error', err);
      return { pushed: 0, pulled: 0, conflicts: [], errors: [err] };
    }
  }

  getStatus(): SyncStatus {
    return { lastSyncAt: this.lastSyncAt, pendingChanges: this.pendingChangesCount, running: this.running };
  }

  setRemote(remote: RemoteClient): void {
    this.options.remote = remote;
  }

  on(event: 'sync' | 'error' | 'status', cb: Callback): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb);
    this.listeners.set(event, set);
  }
  off(event: 'sync' | 'error' | 'status', cb: Callback): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(cb);
  }

  private emit(event: string, payload?: any) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const cb of set) cb(payload);
  }
}
