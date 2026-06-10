import { AddCustomerDrawer } from '@/components/AddCustomerDrawer';
import { CustomerSearchDropdown } from '@/components/CustomerSearchDropdown';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { CustomerRow } from '@/db/queries/customers';
import { ledgerQueries } from '@/db/queries/ledger';
import * as Crypto from 'expo-crypto';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NewSaleEntryScreen() {
  const router = useRouter();
  const { isLoggedIn, storeId } = useAuth();

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [totalBill, setTotalBill] = useState('');
  const [paidAmount, setPaidAmount] = useState('0');
  const [note, setNote] = useState('');

  const [addCustomerVisible, setAddCustomerVisible] = useState(false);

  // Auto-calculated due balance
  const dueBalance = useMemo(() => {
    const bill = parseFloat(totalBill) || 0;
    const paid = parseFloat(paidAmount) || 0;
    return Math.max(0, bill - paid);
  }, [totalBill, paidAmount]);

  const handleSave = async () => {
    if (!selectedCustomer) {
      Alert.alert('Selection Required', 'Please select a customer.');
      return;
    }
    const bill = parseFloat(totalBill) || 0;
    if (bill <= 0) {
      Alert.alert('Validation Error', 'Total bill must be greater than 0.');
      return;
    }
    const paid = parseFloat(paidAmount) || 0;

    try {
      const entryId = Crypto.randomUUID();
      await ledgerQueries.createLedgerEntry({
        id: entryId,
        store_id: storeId,
        customer_id: selectedCustomer.id,
        entry_type: 'sale', // Medicine purchase (baki) is recorded as a sale entry
        total_amount: bill,
        paid_amount: paid,
        note: note.trim() || null,
        is_dirty: 1 // mandatory dirty flag
      });

      Alert.alert('Saved', 'Baki entry recorded successfully! (Offline Safe)');
      router.push('/(tabs)/home');
    } catch (err) {
      console.error('Failed to create ledger entry:', err);
      Alert.alert('Database Error', 'Failed to save transaction to local database.');
    }
  };

  const isSaveDisabled = !selectedCustomer || (parseFloat(totalBill) || 0) <= 0;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.push('/(tabs)/home')} style={styles.backBtn}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>New Baki Entry</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            {/* Customer Section */}
            <Text style={styles.label}>Select Customer</Text>
            {selectedCustomer ? (
              <View style={styles.selectedCustomerCard}>
                <View>
                  <Text style={styles.customerName}>{selectedCustomer.name}</Text>
                  <Text style={styles.customerPhone}>{selectedCustomer.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedCustomer(null)} style={styles.changeBtn}>
                  <Text style={styles.changeBtnText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.dropdownWrapper}>
                <CustomerSearchDropdown
                  onSelect={(c) => setSelectedCustomer(c)}
                  onAddNewCustomer={() => setAddCustomerVisible(true)}
                />
              </View>
            )}

            {/* Form Fields Card */}
            <View style={styles.formCard}>
              <Text style={styles.sectionTitle}>Transaction Details</Text>

              {/* Bill Amount */}
              <Text style={styles.inputLabel}>Total Bill Amount (৳)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={totalBill}
                onChangeText={setTotalBill}
              />

              {/* Paid Amount */}
              <Text style={styles.inputLabel}>Paid Amount (৳)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="numeric"
                value={paidAmount}
                onChangeText={setPaidAmount}
              />

              {/* Note */}
              <Text style={styles.inputLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g. Medicine purchase for 1 month"
                placeholderTextColor={colors.textMuted}
                multiline={true}
                numberOfLines={3}
                value={note}
                onChangeText={setNote}
              />

              {/* Due Balance Card (Red) */}
              <View style={styles.dueCard}>
                <Text style={styles.dueLabel}>Auto-calculated Due Balance</Text>
                <Text style={styles.dueValue}>
                  ৳ {dueBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveBtn, isSaveDisabled && styles.saveBtnDisabled]}
              activeOpacity={0.8}
              onPress={handleSave}
              disabled={isSaveDisabled}
            >
              <Text style={styles.saveBtnText}>💾 Save Entry (Offline Safe)</Text>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Add Customer Bottom Sheet Modal */}
      <AddCustomerDrawer
        visible={addCustomerVisible}
        onClose={() => setAddCustomerVisible(false)}
        onSaveSuccess={() => {
          // Drawer automatically alerts success, we just refresh selection if desired
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    paddingVertical: spacing.sm,
    width: 60,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  scrollContent: {
    padding: spacing.xl,
    flexGrow: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  dropdownWrapper: {
    marginBottom: spacing.lg,
  },
  selectedCustomerCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginBottom: spacing.lg,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  customerPhone: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  changeBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  changeBtnText: {
    color: colors.danger,
    fontWeight: '600',
    fontSize: 13,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.sm,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
  textArea: {
    height: 80,
    paddingVertical: spacing.sm,
    textAlignVertical: 'top',
  },
  dueCard: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  dueLabel: {
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
  },
  dueValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.danger,
    marginTop: spacing.xs,
  },
  saveBtn: {
    height: 50,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    backgroundColor: colors.primaryDark,
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
