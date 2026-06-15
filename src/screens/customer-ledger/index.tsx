import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '../../store/authStore';
import { getCustomerById, type Customer } from '../../db/queries/customers';
import {
  getCustomerTotalDue,
  getCustomerLedgerHistory,
  insertLedgerEntry,
  type CustomerLedgerEntry,
} from '../../db/queries/ledger';
import { colors, spacing, radius } from '../../constants/theme';

function fmt(n: number) {
  return '৳' + Math.abs(n).toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function fmtDate(d: string) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const parts = d.split('-');
  if (parts.length < 3) return d;
  return `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}`;
}

export default function CustomerLedgerScreen() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const storeId = useAuthStore((s) => s.storeId)!;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [totalDue, setTotalDue] = useState(0);
  const [history, setHistory] = useState<CustomerLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectVisible, setCollectVisible] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    const [cust, due, hist] = await Promise.all([
      getCustomerById(customerId, storeId),
      getCustomerTotalDue(customerId, storeId),
      getCustomerLedgerHistory(customerId, storeId),
    ]);
    setCustomer(cust);
    setTotalDue(due);
    setHistory(hist);
    setLoading(false);
  }, [customerId, storeId]);

  useEffect(() => { load(); }, [load]);

  const handleCall = () => {
    if (!customer?.phone) return;
    Linking.openURL(`tel:${customer.phone}`);
  };

  const handleWhatsApp = () => {
    if (!customer?.phone) return;
    const number = customer.phone.startsWith('0')
      ? '88' + customer.phone
      : customer.phone;
    Linking.openURL(`https://wa.me/${number}`);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ color: colors.textSecondary }}>Customer not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Customer Profile */}
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(customer.name)}</Text>
              </View>
              <Text style={styles.customerName}>{customer.name}</Text>
              <Text style={styles.customerPhone}>{customer.phone}</Text>
              <Text style={styles.dueLabel}>Total Due</Text>
              <Text style={[styles.dueAmount, totalDue > 0 && styles.duePositive]}>
                {fmt(totalDue)}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleWhatsApp}>
                <Text style={styles.actionIcon}>💬</Text>
                <Text style={styles.actionLabel}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={handleCall}>
                <Text style={styles.actionIcon}>📞</Text>
                <Text style={styles.actionLabel}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.collectBtn]}
                onPress={() => setCollectVisible(true)}
              >
                <Text style={styles.actionIcon}>💰</Text>
                <Text style={[styles.actionLabel, { color: '#fff' }]}>Collect Cash</Text>
              </TouchableOpacity>
            </View>

            {/* Table Header */}
            {history.length > 0 && (
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { width: 60 }]}>Date</Text>
                <Text style={[styles.th, { flex: 1 }]}>Description</Text>
                <Text style={[styles.th, styles.thRight, { width: 72 }]}>Debit</Text>
                <Text style={[styles.th, styles.thRight, { width: 72 }]}>Credit</Text>
                <Text style={[styles.th, styles.thRight, { width: 72 }]}>Balance</Text>
              </View>
            )}
          </>
        }
        renderItem={({ item }) => {
          const isSale = item.entry_type === 'sale';
          const description = item.note || (isSale ? 'Medicine Purchase' : 'Payment Received');
          const debit = isSale ? item.total_amount - item.paid_amount : null;
          const credit = !isSale ? item.paid_amount : null;
          return (
            <View style={styles.tableRow}>
              <Text style={[styles.td, { width: 60 }]}>{fmtDate(item.transaction_date)}</Text>
              <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{description}</Text>
              <Text style={[styles.td, styles.tdRight, { width: 72, color: colors.danger }]}>
                {debit != null ? `+${fmt(debit)}` : '—'}
              </Text>
              <Text style={[styles.td, styles.tdRight, { width: 72, color: colors.success }]}>
                {credit != null ? `-${fmt(credit)}` : '—'}
              </Text>
              <Text style={[styles.td, styles.tdRight, { width: 72, fontWeight: '700' }]}>
                {fmt(item.running_balance)}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No transactions yet.</Text>
          </View>
        }
      />

      <CollectCashModal
        visible={collectVisible}
        customerName={customer.name}
        customerId={customer.id}
        storeId={storeId}
        onClose={() => setCollectVisible(false)}
        onSaved={() => { setCollectVisible(false); load(); }}
      />
    </View>
  );
}

interface CollectProps {
  visible: boolean;
  customerName: string;
  customerId: string;
  storeId: string;
  onClose: () => void;
  onSaved: () => void;
}

function CollectCashModal({ visible, customerName, customerId, storeId, onClose, onSaved }: CollectProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setAmount(''); setNote(''); };

  const handleSave = async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) {
      Alert.alert('Invalid Amount', 'Enter a valid collection amount.');
      return;
    }
    setSaving(true);
    try {
      await insertLedgerEntry({
        id: Crypto.randomUUID(),
        store_id: storeId,
        customer_id: customerId,
        entry_type: 'collection',
        total_amount: n,
        paid_amount: n,
        note: note.trim() || null,
        transaction_date: new Date().toISOString().slice(0, 10),
        is_dirty: 1,
      });
      reset();
      onSaved();
    } catch {
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => { reset(); onClose(); }} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.sheetWrapper}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Collect Cash</Text>
          <Text style={styles.sheetSubtitle}>{customerName}</Text>

          <Text style={styles.fieldLabel}>Amount Collected (৳) *</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            keyboardType="numeric"
            autoFocus
          />

          <Text style={styles.fieldLabel}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Cash payment"
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Record Collection'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: spacing.xl + 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { padding: spacing.xs },
  backText: { color: colors.primary, fontSize: 14 },
  listContent: { paddingBottom: spacing.xxl },
  profileCard: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary + '22',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.primary },
  customerName: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  customerPhone: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.md },
  dueLabel: { fontSize: 12, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  dueAmount: { fontSize: 28, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },
  duePositive: { color: colors.danger },
  actionRow: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    gap: 4,
  },
  collectBtn: {
    flex: 1.4,
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  actionIcon: { fontSize: 18 },
  actionLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: spacing.md,
  },
  th: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase' },
  thRight: { textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  td: { fontSize: 12, color: colors.textPrimary },
  tdRight: { textAlign: 'right' },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrapper: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl + 16,
  },
  sheetHandle: {
    width: 40, height: 4, backgroundColor: colors.border,
    borderRadius: 2, alignSelf: 'center', marginBottom: spacing.lg,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  sheetSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: spacing.lg, marginTop: 2 },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md, fontWeight: '600' },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  saveBtn: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
