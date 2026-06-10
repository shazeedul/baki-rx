import * as Crypto from 'expo-crypto';
import { Redirect, useRouter, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useSync } from '@/context/sync-context';
import { customerQueries, CustomerRow } from '@/db/queries/customers';
import { LedgerEntryRow, ledgerQueries } from '@/db/queries/ledger';
import { useTheme } from '@/hooks/use-theme';
import { syncEngineInstance } from '@/sync/SyncEngine';

const WhatsAppIcon = () => (
  <View style={styles.whatsappLogoContainer}>
    <Text style={styles.whatsappText}>💬</Text>
  </View>
);

export default function CustomerLedgerScreen() {
  const { isLoggedIn, selectedBranch, storeId, isOfflineMode } = useAuth();
  const { status } = useSync();
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const customerId = params.id;

  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [customerTx, setCustomerTx] = useState<LedgerEntryRow[]>([]);

  // Load selected customer profile and transaction history
  const loadCustomerLedger = useCallback(async (cId: string) => {
    if (!storeId) return;
    try {
      const customer = await customerQueries.getCustomerById(storeId, cId);
      const txs = await ledgerQueries.getCustomerTransactions(storeId, cId);
      setSelectedCustomer(customer);
      setCustomerTx(txs);
    } catch (err) {
      console.warn('Failed to load customer ledger:', err);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (customerId) {
      loadCustomerLedger(customerId);
    } else {
      setLoading(false);
    }
  }, [customerId, loadCustomerLedger, status.dirtyCount]);

  // Trigger Cash Collection Dialog (Section 7b / 7c)
  const handleCollectCash = () => {
    if (!selectedCustomer || !storeId) return;

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

              // Recalculate dirty count to trigger status updates
              await syncEngineInstance.calculateDirtyCount();

              Alert.alert('Success', `Collected ৳${amount.toLocaleString()}! (Offline Safe)`);

              // Refresh data
              if (customerId) {
                await loadCustomerLedger(customerId);
              }
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

  // Redirect to login if not logged in
  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  if (loading) {
    return (
      <View style={[styles.mainContainer, styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!selectedCustomer) {
    return (
      <View style={[styles.mainContainer, styles.centered, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>Customer not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={[styles.collectCashBtn, { backgroundColor: colors.primary, marginTop: spacing.md, paddingHorizontal: spacing.lg }]}>
            <Text style={styles.collectCashBtnText}>Go Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

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
        <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: theme.backgroundElement }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>← Back</Text>
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
        <Text style={[styles.sectionTitle, { marginHorizontal: spacing.xl, marginTop: spacing.md, color: theme.text }]}>
          Ledger Transaction History
        </Text>

        {/* Table Headers */}
        <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
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
              <View key={tx.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
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

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
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
  },
  rowText: {
    fontSize: 12,
  },
  emptyHistory: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
});
