import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock NetInfo before importing SyncEngine
vi.mock('@react-native-community/netinfo', () => {
  return {
    default: {
      fetch: vi.fn().mockResolvedValue({ isConnected: true }),
      addEventListener: vi.fn().mockReturnValue(() => {}),
    }
  };
});

import { syncEngineInstance } from '../sync/SyncEngine';
import { customerQueries } from '../db/queries/customers';
import { ledgerQueries } from '../db/queries/ledger';
import { initDatabase } from '../db/schema';
import { cloudAdapter } from '../services/cloudAdapter';

// Mock the cloudAdapter
vi.mock('../services/cloudAdapter', () => {
  return {
    cloudAdapter: {
      pullTerminals: vi.fn().mockResolvedValue([
        { id: 'cloud-t1', store_id: 'store-1', tenant_id: 'tenant-1', store_name: 'Store 1', branch_name: 'Branch 1', pin_hash: 'hash1', created_at: '2026-06-01T00:00:00Z' }
      ]),
      upsertCustomers: vi.fn().mockResolvedValue(undefined),
      pullCustomersSince: vi.fn().mockResolvedValue([]),
      upsertLedgerEntries: vi.fn().mockResolvedValue(undefined),
      pullLedgerSince: vi.fn().mockResolvedValue([])
    }
  };
});

describe('Relational SyncEngine tests', () => {
  beforeEach(async () => {
    await initDatabase();
    vi.clearAllMocks();
  });

  it('can sync terminals successfully', async () => {
    await syncEngineInstance.syncTerminals('tenant-1');
    expect(cloudAdapter.pullTerminals).toHaveBeenCalledWith('tenant-1');
    
    const status = syncEngineInstance.getStatus();
    expect(status.lastTerminalSyncedAt).not.toBeNull();
  });

  it('calculates dirty count correctly when dirty changes exist', async () => {
    const storeId = 'store-sync-1';
    
    // Add dirty customer
    await customerQueries.createCustomer({
      id: 'dc-1',
      store_id: storeId,
      name: 'Dirty Customer',
      phone: '01700000000',
      is_dirty: 1
    });

    const count = await syncEngineInstance.calculateDirtyCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('pushes pending changes and marks them clean', async () => {
    const storeId = 'store-sync-2';

    await customerQueries.createCustomer({
      id: 'dc-2',
      store_id: storeId,
      name: 'Push Customer',
      phone: '01711111111',
      is_dirty: 1
    });

    await ledgerQueries.createLedgerEntry({
      id: 'dl-2',
      store_id: storeId,
      customer_id: 'dc-2',
      entry_type: 'baki',
      total_amount: 100,
      paid_amount: 0,
      note: 'test entry',
      is_dirty: 1
    });

    // Run pushPending
    await syncEngineInstance.pushPending();

    expect(cloudAdapter.upsertCustomers).toHaveBeenCalled();
    expect(cloudAdapter.upsertLedgerEntries).toHaveBeenCalled();

    // Check dirty count is now 0 for these entries
    const c = await customerQueries.getCustomerById(storeId, 'dc-2');
    expect(c?.is_dirty).toBe(0);

    const dirtyLedger = await ledgerQueries.getDirtyLedgerEntries();
    expect(dirtyLedger.filter(l => l.id === 'dl-2').length).toBe(0);
  });
});
