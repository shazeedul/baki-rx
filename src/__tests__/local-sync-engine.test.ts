import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalSyncEngine } from '../sync/local-sync-engine';
import { MemoryAdapter } from '../storage/memory-adapter';

describe('LocalSyncEngine with in-memory adapter', () => {
  let adapter: MemoryAdapter;
  let engine: LocalSyncEngine;

  beforeEach(async () => {
    adapter = new MemoryAdapter();
    engine = new LocalSyncEngine(adapter, { pullIntervalMs: 10000, batchSize: 10 });
    await engine.start();
  });

  it('enqueueLocalChange persists and applies locally', async () => {
    const change = { entityId: 'u1', type: 'create' as const, data: { name: 'Bob' }, createdAt: Date.now() };
    await engine.enqueueLocalChange(change);
    const got = await adapter.get('u1');
    expect(got).not.toBeNull();
    expect(got?.data).toEqual({ name: 'Bob' });
  });

  it('pushPending with no remote marks applied (no remote)', async () => {
    const change = { entityId: 'u2', type: 'create' as const, data: { name: 'Carol' }, createdAt: Date.now() };
    await engine.enqueueLocalChange(change);
    const res = await engine.pushPending();
    expect(res.pushed).toBeGreaterThanOrEqual(1);
    const pending = await adapter.getPendingChanges(10);
    expect(pending.every((p) => p.applied)).toBe(true);
  });
});

