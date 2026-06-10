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
  entry_type: 'sale' | 'collection' | 'debit' | 'credit'; // supabase uses sale/collection. Let's map accordingly.
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

export interface CloudTenant {
  id: string;
  business_name: string;
  created_at: string;
}

export interface CloudStore {
  id: string;
  tenant_id: string;
  store_name: string;
  location: string | null;
  created_at: string;
}

export const cloudAdapter = {
  async getTenantByName(businessName: string): Promise<CloudTenant | null> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/tenants?business_name=${encodeURIComponent(businessName)}`);
        if (!response.ok) throw new Error(`Custom API getTenantByName status ${response.status}`);
        const data = await response.json();
        return data && data.length > 0 ? data[0] : null;
      } catch (err) {
        console.error('Custom API getTenantByName failed:', err);
        throw err;
      }
    } else {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .ilike('business_name', businessName)
        .limit(1);

      if (error) {
        console.error('Supabase getTenantByName failed:', error);
        throw error;
      }
      return data && data.length > 0 ? data[0] : null;
    }
  },

  async pullTenants(): Promise<CloudTenant[]> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/tenants`);
        if (!response.ok) throw new Error(`Custom API pullTenants status ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Custom API pullTenants failed:', err);
        throw err;
      }
    } else {
      const { data, error } = await supabase
        .from('tenants')
        .select('*');

      if (error) {
        console.error('Supabase pullTenants failed:', error);
        throw error;
      }
      return data || [];
    }
  },

  async pullStores(tenantId: string): Promise<CloudStore[]> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/stores?tenant_id=${encodeURIComponent(tenantId)}`);
        if (!response.ok) throw new Error(`Custom API pullStores status ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Custom API pullStores failed:', err);
        throw err;
      }
    } else {
      const { data, error } = await supabase
        .from('stores')
        .select('*')
        .eq('tenant_id', tenantId);
      console.log('Supabase pullStores result:', { data, error });

      if (error) {
        console.error('Supabase pullStores failed:', error);
        throw error;
      }
      return data || [];
    }
  },

  async pullTerminals(tenantId: string): Promise<CloudTerminal[]> {
    if (MODE === 'custom') {
      try {
        const response = await fetch(`${FUTURE_API_URL}/users?tenant_id=${encodeURIComponent(tenantId)}`);
        if (!response.ok) throw new Error(`Custom API pullTerminals status ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Custom API pullTerminals failed:', err);
        throw err;
      }
    } else {
      const { data, error } = await supabase
        .from('users')
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
      const { error } = await supabase
        .from('ledger_entries')
        .upsert(rows, { onConflict: 'id' });

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

      return (data || []) as CloudLedgerEntry[];
    }
  }
};
