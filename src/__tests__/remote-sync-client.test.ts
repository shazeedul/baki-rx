import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteSyncClient } from '../sync/remote-sync-client';
import { supabase } from '../sync/supabase-client';

// Mock supabase client methods
vi.mock('../sync/supabase-client', () => {
  const mockFrom = vi.fn();
  return {
    supabase: {
      from: mockFrom,
    },
  };
});

describe('RemoteSyncClient', () => {
  const storeId = 'test-store-123';
  let client: RemoteSyncClient;

  beforeEach(() => {
    client = new RemoteSyncClient(storeId);
    vi.clearAllMocks();
  });

  it('pushes customer changes to Supabase successfully', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = supabase.from as any;
    mockFrom.mockReturnValue({
      upsert: mockUpsert,
    });

    const changes = [
      {
        id: 1,
        entityId: 'customer:cust_abc',
        type: 'create' as const,
        data: { name: 'Test Customer', phone: '+123456789' },
        createdAt: 1680000000000,
      },
    ];

    const result = await client.push(changes);
    expect(result.successIds).toContain(1);
    expect(mockFrom).toHaveBeenCalledWith('customers');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cust_abc',
        store_id: storeId,
        name: 'Test Customer',
        phone: '+123456789',
      }),
      { onConflict: 'id' }
    );
  });

  it('pushes ledger entry changes to Supabase successfully', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockFrom = supabase.from as any;
    mockFrom.mockReturnValue({
      upsert: mockUpsert,
    });

    const changes = [
      {
        id: 2,
        entityId: 'ledger_entry:entry_xyz',
        type: 'create' as const,
        data: {
          customer_id: 'cust_abc',
          total_amount: 100,
          paid_amount: 20,
          due_amount: 80,
          entry_type: 'sale',
        },
        createdAt: 1680000000000,
      },
    ];

    const result = await client.push(changes);
    expect(result.successIds).toContain(2);
    expect(mockFrom).toHaveBeenCalledWith('ledger_entries');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'entry_xyz',
        store_id: storeId,
        customer_id: 'cust_abc',
        total_amount: 100,
        paid_amount: 20,
        due_amount: 80,
        entry_type: 'sale',
      }),
      { onConflict: 'id' }
    );
  });

  it('pulls remote changes correctly', async () => {
    const mockSelect = vi.fn();
    const mockEqCustomer = vi.fn();
    const mockGtCustomer = vi.fn();
    const mockEqEntry = vi.fn();
    const mockGtEntry = vi.fn();

    const mockFrom = supabase.from as any;

    // Setup chain mock for customers and ledger entries
    mockFrom.mockImplementation((table: string) => {
      if (table === 'customers') {
        return {
          select: mockSelect.mockReturnValue({
            eq: mockEqCustomer.mockReturnValue({
              gt: mockGtCustomer.mockResolvedValue({
                data: [
                  {
                    id: 'rc_1',
                    store_id: storeId,
                    name: 'Remote Cust',
                    phone: '999',
                    updated_at: '2026-06-03T18:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      } else if (table === 'ledger_entries') {
        return {
          select: mockSelect.mockReturnValue({
            eq: mockEqEntry.mockReturnValue({
              gt: mockGtEntry.mockResolvedValue({
                data: [
                  {
                    id: 're_1',
                    store_id: storeId,
                    customer_id: 'rc_1',
                    total_amount: 50,
                    paid_amount: 0,
                    due_amount: 50,
                    entry_type: 'sale',
                    created_at: '2026-06-03T18:05:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const result = await client.pull(1680000000000);
    expect(result.changes.length).toBe(2);
    expect(result.changes.some((c) => c.entityId === 'customer:rc_1')).toBe(true);
    expect(result.changes.some((c) => c.entityId === 'ledger_entry:re_1')).toBe(true);
  });
});
