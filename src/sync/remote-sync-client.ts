import { RemoteClient, ChangeRecord } from '../types/sync';
import { supabase } from './supabase-client';

const API_MODE = process.env.EXPO_PUBLIC_API_MODE || 'supabase';
const FUTURE_API_URL = process.env.EXPO_PUBLIC_FUTURE_API_URL || 'https://api.bakirxledger.com/v1';

export class RemoteSyncClient implements RemoteClient {
  private storeId: string;

  constructor(storeId: string) {
    this.storeId = storeId;
  }

  async push(changes: ChangeRecord[]): Promise<{ successIds: number[]; conflicts?: Array<{ changeId: number; reason: string }> }> {
    if (API_MODE === 'custom') {
      return this.pushCustom(changes);
    } else {
      return this.pushSupabase(changes);
    }
  }

  async pull(since?: number): Promise<{ changes: ChangeRecord[]; lastAt?: number }> {
    if (API_MODE === 'custom') {
      return this.pullCustom(since);
    } else {
      return this.pullSupabase(since);
    }
  }

  private async pushSupabase(changes: ChangeRecord[]): Promise<{ successIds: number[]; conflicts?: Array<{ changeId: number; reason: string }> }> {
    const successIds: number[] = [];
    const conflicts: Array<{ changeId: number; reason: string }> = [];

    for (const change of changes) {
      try {
        const id = change.id;
        if (!id) continue;

        if (change.type === 'delete') {
          if (change.entityId.startsWith('customer:')) {
            const customerId = change.entityId.replace('customer:', '');
            const { error } = await supabase.from('customers').delete().eq('id', customerId);
            if (error) throw error;
          } else if (change.entityId.startsWith('ledger_entry:')) {
            const entryId = change.entityId.replace('ledger_entry:', '');
            const { error } = await supabase.from('ledger_entries').delete().eq('id', entryId);
            if (error) throw error;
          }
          successIds.push(id);
        } else if (change.data) {
          if (change.entityId.startsWith('customer:')) {
            const customerId = change.entityId.replace('customer:', '');
            const payload = {
              id: customerId,
              store_id: this.storeId,
              name: change.data.name as string,
              phone: change.data.phone as string,
              updated_at: new Date(change.createdAt).toISOString(),
            };

            const { error } = await supabase.from('customers').upsert(payload, { onConflict: 'id' });
            if (error) throw error;
            successIds.push(id);
          } else if (change.entityId.startsWith('ledger_entry:')) {
            const entryId = change.entityId.replace('ledger_entry:', '');
            const payload = {
              id: entryId,
              store_id: this.storeId,
              customer_id: change.data.customer_id as string,
              total_amount: change.data.total_amount as number,
              paid_amount: change.data.paid_amount as number,
              due_amount: change.data.due_amount as number,
              entry_type: change.data.entry_type as string,
              created_at: new Date(change.createdAt).toISOString(),
            };

            const { error } = await supabase.from('ledger_entries').upsert(payload, { onConflict: 'id' });
            if (error) throw error;
            successIds.push(id);
          }
        }
      } catch (err: any) {
        console.error(`Supabase push failed for change ${change.id}:`, err);
        conflicts.push({ changeId: change.id!, reason: err.message || 'Supabase push failed' });
      }
    }

    return { successIds, conflicts };
  }

  private async pullSupabase(since?: number): Promise<{ changes: ChangeRecord[]; lastAt?: number }> {
    const changes: ChangeRecord[] = [];
    const sinceDate = since ? new Date(since).toISOString() : new Date(0).toISOString();
    const lastAt = Date.now();

    try {
      const { data: remoteCustomers, error: custError } = await supabase
        .from('customers')
        .select('*')
        .eq('store_id', this.storeId)
        .gt('updated_at', sinceDate);

      if (custError) throw custError;

      if (remoteCustomers) {
        for (const rc of remoteCustomers) {
          changes.push({
            entityId: `customer:${rc.id}`,
            type: 'update',
            data: {
              id: rc.id,
              store_id: rc.store_id,
              name: rc.name,
              phone: rc.phone,
              updated_at: new Date(rc.updated_at).getTime(),
            },
            createdAt: new Date(rc.updated_at).getTime(),
          });
        }
      }

      const { data: remoteEntries, error: entryError } = await supabase
        .from('ledger_entries')
        .select('*')
        .eq('store_id', this.storeId)
        .gt('created_at', sinceDate);

      if (entryError) throw entryError;

      if (remoteEntries) {
        for (const re of remoteEntries) {
          changes.push({
            entityId: `ledger_entry:${re.id}`,
            type: 'update',
            data: {
              id: re.id,
              store_id: re.store_id,
              customer_id: re.customer_id,
              total_amount: re.total_amount,
              paid_amount: re.paid_amount,
              due_amount: re.due_amount,
              entry_type: re.entry_type,
              created_at: new Date(re.created_at).getTime(),
            },
            createdAt: new Date(re.created_at).getTime(),
          });
        }
      }
    } catch (err) {
      console.warn('pullSupabase offline or error, skipped pull:', err);
    }

    return { changes, lastAt };
  }

  private async pushCustom(changes: ChangeRecord[]): Promise<{ successIds: number[]; conflicts?: Array<{ changeId: number; reason: string }> }> {
    const successIds: number[] = [];
    const conflicts: Array<{ changeId: number; reason: string }> = [];

    try {
      const response = await fetch(`${FUTURE_API_URL}/sync/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: this.storeId, changes }),
      });

      if (!response.ok) {
        throw new Error(`Custom API push responded with status ${response.status}`);
      }

      const resData = await response.json();
      return {
        successIds: resData.successIds || [],
        conflicts: resData.conflicts || [],
      };
    } catch (err: any) {
      console.error('Custom API push failed:', err);
      for (const change of changes) {
        if (change.id) {
          conflicts.push({ changeId: change.id, reason: err.message || 'Custom API push failed' });
        }
      }
    }

    return { successIds, conflicts };
  }

  private async pullCustom(since?: number): Promise<{ changes: ChangeRecord[]; lastAt?: number }> {
    try {
      const url = `${FUTURE_API_URL}/sync/pull?storeId=${encodeURIComponent(this.storeId)}` + (since ? `&since=${since}` : '');
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Custom API pull responded with status ${response.status}`);
      }

      const resData = await response.json();
      return {
        changes: resData.changes || [],
        lastAt: resData.lastAt || Date.now(),
      };
    } catch (err: any) {
      console.error('Custom API pull failed, returning empty list:', err);
      return { changes: [], lastAt: since ?? Date.now() };
    }
  }
}
