import { createClient } from '@supabase/supabase-js';
import type { Customer } from '../db/queries/customers';
import type { LedgerEntry } from '../db/queries/ledger';
import type { User, Tenant, UserStore } from '../db/queries/auth';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
const MODE = process.env.EXPO_PUBLIC_API_MODE ?? 'supabase';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export interface TenantRoster {
  users: User[];
  userStores: UserStore[];
}

export const cloudAdapter = {
  async signIn(phone: string, password: string): Promise<string | null> {
    if (MODE !== 'supabase') return null;
    const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
    if (error || !data.session) return null;
    return data.session.access_token;
  },

  async pullTenants(): Promise<Tenant[]> {
    if (MODE !== 'supabase') return [];
    const { data, error } = await supabase.from('tenants').select('*');
    if (error || !data) return [];
    return data as Tenant[];
  },

  async pullTenantRoster(tenantId: string): Promise<TenantRoster> {
    if (MODE !== 'supabase') return { users: [], userStores: [] };
    const [usersRes, storesRes] = await Promise.all([
      supabase.from('users').select('*').eq('tenant_id', tenantId),
      supabase.from('user_stores').select('*'),
    ]);
    return {
      users: (usersRes.data ?? []) as User[],
      userStores: (storesRes.data ?? []) as UserStore[],
    };
  },

  async upsertCustomers(rows: Customer[]): Promise<void> {
    if (MODE !== 'supabase' || rows.length === 0) return;
    await supabase.from('customers').upsert(
      rows.map(({ is_dirty: _d, ...r }) => r),
      { onConflict: 'id' },
    );
  },

  async upsertLedgerEntries(rows: LedgerEntry[]): Promise<void> {
    if (MODE !== 'supabase' || rows.length === 0) return;
    await supabase.from('ledger_entries').upsert(
      rows.map(({ is_dirty: _d, ...r }) => r),
      { onConflict: 'id' },
    );
  },

  async pullLedgerSince(storeId: string, since: string): Promise<LedgerEntry[]> {
    if (MODE !== 'supabase') return [];
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('store_id', storeId)
      .gt('created_at', since);
    if (error || !data) return [];
    return data as LedgerEntry[];
  },

  async pullCustomersSince(storeId: string, since: string): Promise<Customer[]> {
    if (MODE !== 'supabase') return [];
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('store_id', storeId)
      .gt('updated_at', since);
    if (error || !data) return [];
    return data as Customer[];
  },
};
