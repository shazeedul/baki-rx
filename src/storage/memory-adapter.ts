// Minimal in-memory StorageAdapter implementation for tests and initial dev
import { StorageAdapter, EntityRecord, ChangeRecord } from '../types/sync';

export class MemoryAdapter implements StorageAdapter {
  private entities: Map<string, EntityRecord> = new Map();
  private changes: ChangeRecord[] = [];
  private nextChangeId = 1;
  private opened = false;

  async open(): Promise<void> {
    this.opened = true;
  }
  async close(): Promise<void> {
    this.opened = false;
  }

  async get(entityId: string): Promise<EntityRecord | null> {
    return this.entities.get(entityId) ?? null;
  }

  async put(entity: EntityRecord): Promise<void> {
    this.entities.set(entity.id, { ...entity });
  }

  async delete(entityId: string): Promise<void> {
    this.entities.delete(entityId);
  }

  async addChange(change: ChangeRecord): Promise<number> {
    const id = this.nextChangeId++;
    const copy = { ...change, id } as ChangeRecord;
    this.changes.push(copy);
    return id;
  }

  async getPendingChanges(limit = 100): Promise<ChangeRecord[]> {
    return this.changes.filter((c) => !c.applied).slice(0, limit);
  }

  async markChangeApplied(changeId: number): Promise<void> {
    const idx = this.changes.findIndex((c) => c.id === changeId);
    if (idx !== -1) this.changes[idx].applied = true;
  }

  async runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return fn(null);
  }
}

