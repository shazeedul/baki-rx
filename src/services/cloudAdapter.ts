import { supabase } from '../sync/supabase-client';

const MODE = process.env.EXPO_PUBLIC_API_MODE || 'supabase';
const FUTURE_API_URL = process.env.EXPO_PUBLIC_FUTURE_API_URL || 'https://api.bakirxledger.com/v1';

export interface CloudCustomer {
  id: string;
  store_id: string;
  name: string;
  phone: string;
  updated_at: string;
  created_at?: string;
}

export interface CloudLedgerEntry {
  id: string;
  store_id: string;
  customer_id: string;
  entry_type: 'sale' | 'collection' | 'debit' | 'credit' | 'baki' | 'payment'; // supabase uses sale/collection or baki/payment. Let's map accordingly.
  total_amount: number;
  paid_amount: number;
  note: string | null;
  created_at: string;
}

export interface CloudTerminal {
  id: string;
  tenant_id: string;
  store_id: string;
  store_name: string;
  branch_name: string;
  phone: string;
  pin_hash: string;
  created_at: string;
}

export const cloudAdapter = {
  async pullTerminals(tenantId: string): Promise<CloudTerminal[]> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/terminals?tenant_id=${encodeURIComponent(tenantId)}`);
        if (!response.ok) throw new Error(`Custom API pullTerminals status ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Custom API pullTerminals failed:', err);
        throw err;
      }
    } else {
      const { data, error } = await supabase
        .from('terminals')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('Supabase pullTerminals failed:', error);
        throw error;
      }
      return data || [];
    }
  },

  async upsertCustomers(rows: CloudCustomer[]): Promise<void> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/customers/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rows),
        });
        if (!response.ok) throw new Error(`Custom API upsertCustomers status ${response.status}`);
      } catch (err) {
        console.error('Custom API upsertCustomers failed:', err);
        throw err;
      }
    } else {
      const { error } = await supabase
        .from('customers')
        .upsert(rows, { onConflict: 'id' });

      if (error) {
        console.error('Supabase upsertCustomers failed:', error);
        throw error;
      }
    }
  },

  async pullCustomersSince(storeId: string, since: string): Promise<CloudCustomer[]> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/customers?store_id=${encodeURIComponent(storeId)}&since=${encodeURIComponent(since)}`);
        if (!response.ok) throw new Error(`Custom API pullCustomersSince status ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Custom API pullCustomersSince failed:', err);
        throw err;
      }
    } else {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('store_id', storeId)
        .gt('updated_at', since);

      if (error) {
        console.error('Supabase pullCustomersSince failed:', error);
        throw error;
      }
      return data || [];
    }
  },

  async upsertLedgerEntries(rows: CloudLedgerEntry[]): Promise<void> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/ledger/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rows),
        });
        if (!response.ok) throw new Error(`Custom API upsertLedgerEntries status ${response.status}`);
      } catch (err) {
        console.error('Custom API upsertLedgerEntries failed:', err);
        throw err;
      }
    } else {
      // Supabase PG schema uses 'sale' / 'collection' for entry_type (Section 5b)
      // but SQLite local uses 'baki' / 'payment' (Section 5a). Let's map it:
      const mappedRows = rows.map(r => ({
        ...r,
        entry_type: r.entry_type === 'baki' ? 'sale' : (r.entry_type === 'payment' ? 'collection' : r.entry_type)
      }));

      const { error } = await supabase
        .from('ledger_entries')
        .upsert(mappedRows, { onConflict: 'id' });

      if (error) {
        console.error('Supabase upsertLedgerEntries failed:', error);
        throw error;
      }
    }
  },

  async pullLedgerSince(storeId: string, since: string): Promise<CloudLedgerEntry[]> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/ledger?store_id=${encodeURIComponent(storeId)}&since=${encodeURIComponent(since)}`);
        if (!response.ok) throw new Error(`Custom API pullLedgerSince status ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Custom API pullLedgerSince failed:', err);
        throw err;
      }
    } else {
      const { data, error } = await supabase
        .from('ledger_entries')
        .select('*')
        .eq('store_id', storeId)
        .gt('created_at', since);

      if (error) {
        console.error('Supabase pullLedgerSince failed:', error);
        throw error;
      }

      // Map back cloud 'sale' / 'collection' to local 'baki' / 'payment'
      const mappedData = (data || []).map(r => ({
        ...r,
        entry_type: r.entry_type === 'sale' ? 'baki' : (r.entry_type === 'collection' ? 'payment' : r.entry_type)
      }));

      return mappedData as CloudLedgerEntry[];
    }
  }
};
