import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAdapter } from '../storage/memory-adapter';
import { LocalSyncEngine } from '../sync/local-sync-engine';

describe('Integration: adapter + engine', () => {
  let adapter: MemoryAdapter;
  let engine: LocalSyncEngine;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    engine = new LocalSyncEngine(adapter, { pullIntervalMs: 10000 });
    await engine.start();
  });

  it('enqueue then push clears pending changes', async () => {
    const change = { entityId: 'i1', type: 'create' as const, data: { a: 1 }, createdAt: Date.now() };
    await engine.enqueueLocalChange(change);
    let pending = await adapter.getPendingChanges(20);
    expect(pending.length).toBeGreaterThanOrEqual(1);
    await engine.pushPending();
    pending = await adapter.getPendingChanges(20);
    expect(pending.every((p) => p.applied)).toBe(true);
  });
});

