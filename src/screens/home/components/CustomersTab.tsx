import AddCustomerDrawer from '@/components/AddCustomerDrawer';
import SearchBar from '@/components/SearchBar';
import { colors, radius, spacing } from '@/constants/theme';
import { getCustomerBalances, type CustomerBalance } from '@/db/queries/customers';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

interface Props {
  storeId: string;
}

export default function CustomersTab({ storeId }: Props) {
  const [customers, setCustomers] = useState<CustomerBalance[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [drawerVisible, setDrawerVisible] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCustomerBalances(storeId, search.trim() || undefined);
      setCustomers(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [storeId, search]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      loadCustomers();
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [loadCustomers]);

  const fmt = (n: number): string => {
    return '৳' + n.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>All Customers</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setDrawerVisible(true)}>
          <Text style={styles.addBtnText}>+ Add Customer</Text>
        </TouchableOpacity>
      </View>

      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name or mobile…"
      />

      {loading && customers.length === 0 ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/customer?customerId=${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {item.name
                    .split(' ')
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase() ?? '')
                    .join('')}
                </Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phone}</Text>
              </View>
              <View style={styles.balanceContainer}>
                <Text style={styles.dueLabel}>Due Balance</Text>
                <Text style={[styles.due, item.total_due > 0 && styles.duePositive]}>
                  {fmt(item.total_due)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No customers found.</Text>
            </View>
          }
        />
      )}

      <AddCustomerDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onAdded={loadCustomers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  addBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  list: { paddingBottom: spacing.xxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  phone: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  balanceContainer: { alignItems: 'flex-end' },
  dueLabel: { fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase' },
  due: { fontSize: 14, fontWeight: '700', color: colors.textSecondary, marginTop: 2 },
  duePositive: { color: colors.danger },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
});
