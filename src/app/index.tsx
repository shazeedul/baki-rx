import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddCustomerDrawer } from '../components/AddCustomerDrawer';
import { BottomTabInset, colors, radius, spacing } from '../constants/theme';
import { useAuth } from '../context/auth-context';
import { useSync } from '../context/sync-context';
import { customerQueries, CustomerRow } from '../db/queries/customers';
import { DefaulterRow, LedgerEntryRow, ledgerQueries } from '../db/queries/ledger';
import { useTheme } from '../hooks/use-theme';
import LoginScreen from './(auth)/login';

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

const WhatsAppIcon = () => (
  <View style={styles.whatsappLogoContainer}>
    <Text style={styles.whatsappText}>💬</Text>
  </View>
);

export default function HomeScreen() {
  const { isLoggedIn, selectedBranch, storeId, isOfflineMode, logout } = useAuth();
  const { status, syncAll } = useSync();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Active View State: 'dashboard' | 'customer-ledger'
  const [currentView, setCurrentView] = useState<'dashboard' | 'customer-ledger'>('dashboard');

  // Local Database States
  const [totalBaki, setTotalBaki] = useState(0);
  const [todayCollection, setTodayCollection] = useState(0);
  const [defaulters, setDefaulters] = useState<DefaulterRow[]>([]);
  const [dashboardSearch, setDashboardSearch] = useState('');

  // Selected Customer Ledger States
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [customerTx, setCustomerTx] = useState<LedgerEntryRow[]>([]);

  // Modals / Drawers
  const [addCustVisible, setAddCustVisible] = useState(false);

  // Load KPI metrics and Defaulters list from SQLite
  const loadDashboardData = useCallback(async () => {
    if (!storeId) return;
    try {
      const bakiSum = await ledgerQueries.getTotalBaki(storeId);
      const collectionSum = await ledgerQueries.getTodayCollection(storeId);
      const topDefaultersList = await ledgerQueries.getTopDefaulters(storeId, 20);

      setTotalBaki(bakiSum);
      setTodayCollection(collectionSum);
      setDefaulters(topDefaultersList);
    } catch (err) {
      console.warn('Failed to load dashboard data from SQLite:', err);
    }
  }, [storeId]);

  // Load selected customer profile and transaction history
  const loadCustomerLedger = useCallback(async (customerId: string) => {
    if (!storeId) return;
    try {
      const cust = await customerQueries.getCustomerById(storeId, customerId);
      const txs = await ledgerQueries.getCustomerTransactions(storeId, customerId);
      setSelectedCustomer(cust);
      setCustomerTx(txs);
    } catch (err) {
      console.warn('Failed to load customer ledger:', err);
    }
  }, [storeId]);

  // Initial Load and Auto-Refresh on focus/actions
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData, status.dirtyCount]);

  useEffect(() => {
    if (selectedCustomerId) {
      loadCustomerLedger(selectedCustomerId);
    }
  }, [selectedCustomerId, loadCustomerLedger]);

  // Trigger Cash Collection Dialog (Section 7b / 7c)
  const handleCollectCash = () => {
    if (!selectedCustomer) return;

    Alert.prompt(
      'Collect Cash',
      `Enter payment amount collected from ${selectedCustomer.name}:`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Collect',
          onPress: async (val?: string) => {
            const amount = parseFloat(val || '0');
            if (isNaN(amount) || amount <= 0) {
              Alert.alert('Invalid Input', 'Please enter a valid amount.');
              return;
            }
            try {
              const entryId = Crypto.randomUUID();
              await ledgerQueries.createLedgerEntry({
                id: entryId,
                store_id: storeId,
                customer_id: selectedCustomer.id,
                entry_type: 'collection', // payment received is a credit entry
                total_amount: 0,
                paid_amount: amount,
                note: 'Cash collection payment',
                is_dirty: 1 // mandatory dirty flag
              });

              Alert.alert('Success', `Collected ৳${amount.toLocaleString()}! (Offline Safe)`);

              // Refresh data
              if (selectedCustomerId) {
                await loadCustomerLedger(selectedCustomerId);
              }
              await loadDashboardData();
            } catch (err) {
              console.error('Collect cash database error:', err);
              Alert.alert('Database Error', 'Failed to save cash payment.');
            }
          }
        }
      ],
      'plain-text',
      '',
      'number-pad'
    );
  };

  // WhatsApp reminder sharing (Section 8 rules)
  const handleWhatsAppShare = () => {
    if (!selectedCustomer) return;

    // Compute total outstanding from transaction list
    const outstanding = customerTx.reduce((sum, tx) => sum + (tx.total_amount - tx.paid_amount), 0);
    const msg = `Hello ${selectedCustomer.name}, your total outstanding dues at ${selectedBranch.split(' (')[0]} is ৳${outstanding.toLocaleString()}. Please clear it as soon as possible. Thank you.`;
    const cleanPhone = selectedCustomer.phone.replace(/[^0-9]/g, '');

    if (Platform.OS === 'web') {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      Linking.openURL(`whatsapp://send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`).catch(() => {
        // Fallback if whatsapp not installed on native
        Alert.alert('WhatsApp Reminder Generated', msg);
      });
    }
  };

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
    return <LoginScreen />;
  }

  // --- RENDERING VIEWS ---

  // 1. CUSTOMER LEDGER DETAIL SUB-SCREEN
  if (currentView === 'customer-ledger' && selectedCustomer) {
    // Compute running balance chronologically
    const computedTxList = [...customerTx]
      .reverse() // Sort oldest first to calculate running balance
      .reduce((acc: any[], tx) => {
        const lastBal = acc.length > 0 ? acc[acc.length - 1].balance : 0;
        const currentBal = lastBal + (tx.total_amount - tx.paid_amount);
        acc.push({
          ...tx,
          date: new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          description: tx.entry_type === 'sale' ? 'Medicine Purchase' : 'Payment Received',
          debit: tx.entry_type === 'sale' ? tx.total_amount : 0,
          credit: tx.paid_amount,
          balance: currentBal
        });
        return acc;
      }, []);

    // Reverse back to newest first for list view
    const displayTxList = [...computedTxList].reverse();
    const currentOutstanding = computedTxList.length > 0 ? computedTxList[computedTxList.length - 1].balance : 0;

    const initials = selectedCustomer.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    return (
      <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setCurrentView('dashboard')} style={styles.backButton}>
              <Text style={[styles.headerTitle, { color: theme.text }]}>← Back to Dashboard</Text>
            </TouchableOpacity>
          </View>

          {/* Profile Card */}
          <View style={[styles.profileCard, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.profileMainRow}>
              <View style={[styles.avatarLarge, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarLargeText}>{initials}</Text>
              </View>
              <View style={styles.profileDetails}>
                <Text style={[styles.profileName, { color: theme.text }]}>{selectedCustomer.name}</Text>
                <Text style={[styles.profilePhone, { color: theme.textSecondary }]}>{selectedCustomer.phone}</Text>
              </View>
            </View>

            {/* Outstanding Box */}
            <View style={[styles.dueBox, { backgroundColor: colors.dangerBg }]}>
              <Text style={[styles.dueLabel, { color: colors.danger }]}>Total Outstanding Dues</Text>
              <Text style={[styles.dueAmountLarge, { color: colors.danger }]}>
                ৳ {currentOutstanding.toLocaleString()}
              </Text>
            </View>

            {/* Action Row */}
            <View style={styles.ledgerActionRow}>
              <TouchableOpacity
                style={[styles.whatsappBtn, { borderColor: '#26d366' }]}
                activeOpacity={0.8}
                onPress={handleWhatsAppShare}
              >
                <WhatsAppIcon />
                <Text style={styles.whatsappBtnText}>Send Reminder</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.collectCashBtn, { backgroundColor: colors.primary }]}
                activeOpacity={0.8}
                onPress={handleCollectCash}
              >
                <Text style={styles.collectCashBtnText}>Collect Cash</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Transaction History */}
          <Text style={[styles.sectionTitle, { marginHorizontal: spacing.xl, marginTop: spacing.md }]}>
            Ledger Transaction History
          </Text>

          {/* Table Headers */}
          <View style={styles.tableHeader}>
            <Text style={[styles.colHeader, { flex: 1.5, color: theme.textSecondary }]}>Date</Text>
            <Text style={[styles.colHeader, { flex: 3.5, color: theme.textSecondary }]}>Details</Text>
            <Text style={[styles.colHeader, { flex: 2, textAlign: 'right', color: theme.textSecondary }]}>Debit</Text>
            <Text style={[styles.colHeader, { flex: 2, textAlign: 'right', color: theme.textSecondary }]}>Credit</Text>
            <Text style={[styles.colHeader, { flex: 2.5, textAlign: 'right', color: theme.textSecondary }]}>Balance</Text>
          </View>

          {/* History Scroll List */}
          <ScrollView contentContainerStyle={{ paddingBottom: BottomTabInset + spacing.lg }}>
            {displayTxList.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={{ color: theme.textSecondary }}>No transactions recorded yet.</Text>
              </View>
            ) : (
              displayTxList.map((tx) => (
                <View key={tx.id} style={styles.tableRow}>
                  <Text style={[styles.rowText, { flex: 1.5, color: theme.text }]}>{tx.date}</Text>
                  <Text style={[styles.rowText, { flex: 3.5, color: theme.text }]} numberOfLines={1}>
                    {tx.description}
                  </Text>
                  <Text style={[styles.rowText, { flex: 2, textAlign: 'right', color: tx.debit > 0 ? colors.danger : theme.textSecondary }]}>
                    {tx.debit > 0 ? `+${tx.debit}` : '-'}
                  </Text>
                  <Text style={[styles.rowText, { flex: 2, textAlign: 'right', color: tx.credit > 0 ? colors.primary : theme.textSecondary }]}>
                    {tx.credit > 0 ? `-${tx.credit}` : '-'}
                  </Text>
                  <Text style={[styles.rowText, { flex: 2.5, textAlign: 'right', fontWeight: '700', color: theme.text }]}>
                    {tx.balance.toLocaleString()}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // 2. DASHBOARD / HOME VIEW
  const statusColor = isOfflineMode ? '#f39c12' : (status.dirtyCount > 0 ? '#3498db' : '#2ecc71');
  const syncLabel = isOfflineMode
    ? (status.dirtyCount > 0 ? `Offline (${status.dirtyCount} pending)` : 'Offline')
    : (status.dirtyCount > 0 ? `Syncing (${status.dirtyCount})` : 'Synced');

  return (
    <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>

        {/* Top Info Header */}
        <View style={styles.topBar}>
          <View>
            <Text style={[styles.branchTitle, { color: theme.text }]}>
              {selectedBranch.split(' (')[0]}
            </Text>
            <Text style={[styles.terminalSubtitle, { color: theme.textSecondary }]}>Local Credit Ledger Terminal</Text>
          </View>
          <View style={styles.syncedContainer}>
            <SyncedIcon color={statusColor} />
            <TouchableOpacity onPress={syncAll}>
              <Text style={[styles.syncedText, { color: isOfflineMode ? '#e67e22' : colors.primary, fontSize: 13, fontWeight: '700' }]}>
                {syncLabel}
              </Text>
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
              <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Total Baki Outstanding</Text>
              <Text style={[styles.kpiValue, { color: colors.danger }]}>
                ৳ {totalBaki.toLocaleString()}
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
              onPress={() => router.push('/entry' as any)}
            >
              <Text style={styles.actionBtnSolidText}>New Sale Entry</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: colors.primary }]}
              activeOpacity={0.8}
              onPress={() => setAddCustVisible(true)}
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
                      setSelectedCustomerId(d.customer_id);
                      setCurrentView('customer-ledger');
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
        visible={addCustVisible}
        onClose={() => setAddCustVisible(false)}
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
  terminalSubtitle: {
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
