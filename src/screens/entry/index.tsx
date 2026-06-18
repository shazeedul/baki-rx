import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '@/store/authStore';
import { insertLedgerEntry } from '@/db/queries/ledger';
import { type Customer } from '@/db/queries/customers';
import CustomerSearchDropdown from '@/components/CustomerSearchDropdown';
import AddCustomerDrawer from '@/components/AddCustomerDrawer';
import DatePickerField from '@/components/DatePickerField';
import { colors, spacing, radius } from '@/constants/theme';

export default function EntryScreen() {
  const storeId = useAuthStore((s) => s.storeId)!;

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [totalBill, setTotalBill] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
  const [note, setNote] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [saving, setSaving] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const total = parseFloat(totalBill) || 0;
  const paid = parseFloat(paidAmount) || 0;
  const due = total - paid;

  const isValid = selectedCustomer !== null && total > 0 && paid >= 0 && paid <= total;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      const id = Crypto.randomUUID();
      await insertLedgerEntry({
        id,
        store_id: storeId,
        customer_id: selectedCustomer!.id,
        entry_type: 'sale',
        total_amount: total,
        paid_amount: paid,
        note: note.trim() || null,
        transaction_date: transactionDate,
        is_dirty: 1,
      });
      Alert.alert('Saved', 'Sale entry recorded successfully.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Baki Entry</Text>
        <View style={styles.placeholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Customer *</Text>
          <CustomerSearchDropdown
            key={refreshKey}
            selectedCustomer={selectedCustomer}
            onSelect={setSelectedCustomer}
            onAddNew={() => setDrawerVisible(true)}
          />

          <DatePickerField
            label="Transaction Date"
            value={transactionDate}
            onChange={setTransactionDate}
          />

          <Text style={styles.label}>Total Bill *</Text>
          <TextInput
            style={styles.input}
            value={totalBill}
            onChangeText={setTotalBill}
            placeholder="0"
            keyboardType="numeric"
          />

          <Text style={styles.label}>Paid Amount</Text>
          <TextInput
            style={styles.input}
            value={paidAmount}
            onChangeText={setPaidAmount}
            placeholder="0"
            keyboardType="numeric"
          />

          <View style={styles.dueRow}>
            <Text style={styles.dueLabel}>Due Balance</Text>
            <Text style={[styles.dueValue, due > 0 && styles.duePositive, due < 0 && styles.dueNegative]}>
              ৳{due.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={note}
            onChangeText={setNote}
            placeholder="Add a note…"
            multiline
            numberOfLines={2}
          />

          <TouchableOpacity
            style={[styles.saveBtn, (!isValid || saving) && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={!isValid || saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save (Offline Safe)'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <AddCustomerDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onAdded={(newCustomer) => {
          if (newCustomer) {
            setSelectedCustomer(newCustomer);
          }
          setRefreshKey((k) => k + 1);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingTop: spacing.xl + 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { minWidth: 60 },
  backText: { color: colors.primary, fontSize: 14 },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  placeholder: { minWidth: 60 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md, fontWeight: '600' },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  noteInput: { height: 72, paddingTop: spacing.sm, textAlignVertical: 'top' },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  dueLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  dueValue: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  duePositive: { color: colors.danger },
  dueNegative: { color: colors.primary },
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
