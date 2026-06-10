import * as Crypto from 'expo-crypto';
import { Redirect, useRouter, useFocusEffect } from 'expo-router';
import { RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddCustomerDrawer } from '@/components/AddCustomerDrawer';
import { BottomTabInset, colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useSync } from '@/context/sync-context';
import { customerQueries, CustomerRow } from '@/db/queries/customers';
import { DefaulterRow, LedgerEntryRow, ledgerQueries } from '@/db/queries/ledger';
import { useTheme } from '@/hooks/use-theme';

// Custom icons
const SyncedIcon = ({ color }: { color: string }) => (
  <View style={[styles.syncedDot, { backgroundColor: color }]} />
);

const ChevronRight = ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 16, fontWeight: '600' }}>›</Text>
);

const SearchIcon = ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 16, marginRight: spacing.sm }}>🔍</Text>
);

export default function HomeScreen() {
  const { isLoggedIn, selectedBranch, storeId, isOfflineMode, logout } = useAuth();
  const { status, syncAll } = useSync();
  const theme = useTheme();
  const router = useRouter();

  // Local Database States
  const [totalDue, setTotalDue] = useState(0);
  const [todayCollection, setTodayCollection] = useState(0);
  const [defaulters, setDefaulters] = useState<DefaulterRow[]>([]);
  const [dashboardSearch, setDashboardSearch] = useState('');

  // Modals / Drawers
  const [addCustomerVisible, setAddCustomerVisible] = useState(false);

  // Load KPI metrics and Defaulters list from SQLite
  const loadDashboardData = useCallback(async () => {
    if (!storeId) return;
    try {
      const dueSum = await ledgerQueries.getTotalDue(storeId);
      const collectionSum = await ledgerQueries.getTodayCollection(storeId);
      const topDefaultersList = await ledgerQueries.getTopDefaulters(storeId, 20);

      setTotalDue(dueSum);
      setTodayCollection(collectionSum);
      setDefaulters(topDefaultersList);
    } catch (err) {
      console.warn('Failed to load dashboard data from SQLite:', err);
    }
  }, [storeId]);

  // Initial Load and Auto-Refresh on focus/actions
  useFocusEffect(
    useCallback(() => {
      loadDashboardData();
    }, [loadDashboardData, status.dirtyCount])
  );

  // Filter defaulters list locally by search query
  const filteredDefaulters = useMemo(() => {
    return defaulters.filter(
      (d) =>
        d.name.toLowerCase().includes(dashboardSearch.toLowerCase()) ||
        d.phone.includes(dashboardSearch)
    );
  }, [defaulters, dashboardSearch]);

  // Redirect to login if not logged in (moved here to satisfy Rules of Hooks)
  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  // 2. DASHBOARD / HOME VIEW
  const statusColor = isOfflineMode ? '#f39c12' : (status.dirtyCount > 0 ? '#3498db' : '#2ecc71');

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>

        {/* Top Info Header */}
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.branchTitle, { color: theme.text }]}>
              {selectedBranch.split(' (')[0]}
            </Text>
            <Text style={[styles.userSubtitle, { color: theme.textSecondary }]}>Local Credit Ledger User</Text>
          </View>
          <View style={styles.syncedContainer}>
            <SyncedIcon color={statusColor} />
            <TouchableOpacity onPress={syncAll} style={{ padding: 4, marginRight: 4 }}>
              {status.syncing ? (
                <ActivityIndicator size="small" color={isOfflineMode ? '#e67e22' : colors.primary} style={{ transform: [{ scale: 0.8 }] }} />
              ) : (
                <RefreshCw size={15} color={isOfflineMode ? '#e67e22' : colors.primary} />
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
              <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>Log out</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: BottomTabInset + spacing.lg }}
        >
          {/* KPI Dashboard Dues Row */}
          <View style={styles.kpiRow}>
            {/* Total Outstanding Card (Red) */}
            <View style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Total Due Outstanding</Text>
              <Text style={[styles.kpiValue, { color: colors.danger }]}>
                ৳ {totalDue.toLocaleString()}
              </Text>
            </View>

            {/* Today's Collection Card (Green) */}
            <View style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Today's Collection</Text>
              <Text style={[styles.kpiValue, { color: colors.primary }]}>
                ৳ {todayCollection.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Quick Action Navigation Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtnSolid, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/entry' as any)}
            >
              <Text style={styles.actionBtnSolidText}>New Sale Entry</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: colors.primary }]}
              activeOpacity={0.8}
              onPress={() => setAddCustomerVisible(true)}
            >
              <Text style={[styles.actionBtnOutlineText, { color: colors.primary }]}>Add Customer</Text>
            </TouchableOpacity>
          </View>

          {/* Defaulter Title Header */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Top Defaulters</Text>
            <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
              {filteredDefaulters.length} active
            </Text>
          </View>

          {/* Search Defaulters */}
          <View style={[styles.searchContainer, { backgroundColor: theme.backgroundElement }]}>
            <SearchIcon color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search defaulters by name or phone..."
              placeholderTextColor={theme.textSecondary}
              value={dashboardSearch}
              onChangeText={setDashboardSearch}
            />
          </View>

          {/* Defaulters Rows List */}
          <View style={styles.defaulterList}>
            {filteredDefaulters.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={{ color: theme.textSecondary }}>No defaulters found.</Text>
              </View>
            ) : (
              filteredDefaulters.map((d, index) => {
                const initials = d.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase();

                // Color badges for rank
                const rankColor = index === 0 ? '#d35400' : (index === 1 ? '#e67e22' : (index === 2 ? '#f39c12' : colors.textSecondary));

                return (
                  <TouchableOpacity
                    key={d.customer_id}
                    style={[styles.customerRow, { borderBottomColor: colors.border }]}
                    activeOpacity={0.7}
                    onPress={() => {
                      router.push(`/(tabs)/customer-ledger?id=${d.customer_id}` as any);
                    }}
                  >
                    {/* Rank Indicator and Avatar */}
                    <View style={[styles.avatar, { backgroundColor: rankColor }]}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>

                    {/* Customer Info */}
                    <View style={styles.customerInfo}>
                      <Text style={[styles.customerName, { color: theme.text }]}>{d.name}</Text>
                      <Text style={[styles.customerPhone, { color: theme.textSecondary }]}>{d.phone}</Text>
                    </View>

                    {/* Due Amount (Red) */}
                    <View style={styles.customerOutstanding}>
                      <Text style={[styles.outstandingAmount, { color: colors.danger }]}>
                        ৳ {d.total_due.toLocaleString()}
                      </Text>
                      <ChevronRight color={theme.textSecondary} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

        </ScrollView>
      </SafeAreaView>

      {/* Add Customer Modal Drawer Component */}
      <AddCustomerDrawer
        visible={addCustomerVisible}
        onClose={() => setAddCustomerVisible(false)}
        onSaveSuccess={loadDashboardData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  branchTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  userSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  syncedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  syncedText: {
    fontSize: 13,
  },
  logoutBtn: {
    marginLeft: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
  },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  kpiCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  actionBtnSolid: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnSolidText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  actionBtnOutline: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnOutlineText: {
    fontWeight: '700',
    fontSize: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xl,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  defaulterList: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '700',
  },
  customerPhone: {
    fontSize: 12,
    marginTop: 2,
  },
  customerOutstanding: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  outstandingAmount: {
    fontSize: 14,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  profileCard: {
    margin: spacing.xl,
    borderRadius: radius.lg,
    padding: spacing.xl,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  },
  profileMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarLarge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarLargeText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
  },
  profilePhone: {
    fontSize: 12,
    marginTop: 2,
  },
  dueBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 48,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  dueLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  dueAmountLarge: {
    fontSize: 16,
    fontWeight: '800',
  },
  ledgerActionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  whatsappBtn: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  whatsappLogoContainer: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappText: {
    fontSize: 14,
  },
  whatsappBtnText: {
    color: '#26d366',
    fontWeight: '700',
    fontSize: 13,
  },
  collectCashBtn: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectCashBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: spacing.md,
  },
  colHeader: {
    fontSize: 11,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: {
    fontSize: 12,
  },
  emptyHistory: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
});
