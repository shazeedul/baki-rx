import { createClient } from '@supabase/supabase-js';
import type { Customer } from '@/db/queries/customers';
import type { LedgerEntry } from '@/db/queries/ledger';
import type { User, Tenant, UserStore } from '@/db/queries/auth';
import type { Store } from '@/db/queries/stores';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';
const MODE = process.env.EXPO_PUBLIC_API_MODE ?? 'supabase';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

export interface TenantRoster {
  users: User[];
  userStores: UserStore[];
}

export const cloudAdapter = {
  async pullStores(tenantId: string): Promise<Store[]> {
    if (MODE !== 'supabase') return [];
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('tenant_id', tenantId);
    if (error || !data) return [];
    return data as Store[];
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
      supabase.from('user_stores').select('*').in(
        'store_id',
        (await supabase.from('stores').select('id').eq('tenant_id', tenantId)).data?.map((s) => s.id) ?? [],
      ),
    ]);
    return {
      users: (usersRes.data ?? []) as User[],
      userStores: (storesRes.data ?? []) as UserStore[],
    };
  },

  async upsertCustomers(rows: Customer[]): Promise<void> {
    if (MODE !== 'supabase' || rows.length === 0) return;
    await supabase
      .from('customers')
      .upsert(
        rows.map(({ is_dirty: _d, ...r }) => r),
        { onConflict: 'id' },
      );
  },

  async upsertLedgerEntries(rows: LedgerEntry[]): Promise<void> {
    if (MODE !== 'supabase' || rows.length === 0) return;
    await supabase
      .from('ledger_entries')
      .upsert(
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

  async pullLedgerByDateRange(
    storeId: string,
    fromDate: string,
    toDate: string,
    limit: number,
    offset: number,
  ): Promise<LedgerEntry[]> {
    if (MODE !== 'supabase') return [];
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('*')
      .eq('store_id', storeId)
      .gte('transaction_date', fromDate)
      .lte('transaction_date', toDate)
      .order('transaction_date', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error || !data) return [];
    return data as LedgerEntry[];
  },

  async findTenantByName(name: string): Promise<Tenant | null> {
    if (MODE !== 'supabase') return null;
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .ilike('business_name', name)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    return data[0] as Tenant;
  },
};
