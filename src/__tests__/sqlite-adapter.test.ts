import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryAdapter } from '../storage/memory-adapter';

describe('MemoryAdapter basic operations', () => {
  let adapter: MemoryAdapter;
  beforeEach(async () => {
    adapter = new MemoryAdapter();
    await adapter.open();
  });

  it('put and get an entity', async () => {
    const now = Date.now();
    await adapter.put({ id: 'c1', data: { name: 'Alice' }, rev: 1, updatedAt: now });
    const got = await adapter.get('c1');
    expect(got).not.toBeNull();
    expect(got?.data).toEqual({ name: 'Alice' });
    expect(got?.rev).toBeGreaterThanOrEqual(1);
  });

  it('addChange and getPendingChanges', async () => {
    const change = { entityId: 'c1', type: 'create' as const, data: { name: 'A' }, createdAt: Date.now() };
    const id = await adapter.addChange(change);
    expect(id).toBeGreaterThan(0);
    const pending = await adapter.getPendingChanges(10);
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending.some((p) => p.entityId === 'c1')).toBe(true);
  });
});

