import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { colors, spacing, radius } from '../constants/theme';
import { useAuth } from '../context/auth-context';
import { customerQueries } from '../db/queries/customers';

interface AddCustomerDrawerProps {
  visible: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
}

export const AddCustomerDrawer: React.FC<AddCustomerDrawerProps> = ({
  visible,
  onClose,
  onSaveSuccess,
}) => {
  const { storeId } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Customer name is required.');
      return;
    }

    // Clean phone number: remove non-digits
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Bangladesh mobile format validation: must be exactly 11 digits (e.g. 017xxxxxxxx)
    // or if they input with country code +88017..., cleanPhone would be 13 digits (88017...)
    // Let's accept exactly 11 digits, or 13 digits if it starts with 88
    const isValidBDPhone = (cleanPhone.length === 11 && cleanPhone.startsWith('01')) ||
                           (cleanPhone.length === 13 && cleanPhone.startsWith('8801'));

    if (!isValidBDPhone) {
      Alert.alert(
        'Validation Error',
        'Phone number must be a valid 11-digit Bangladeshi number (e.g., 01712345678).'
      );
      return;
    }

    // Standardize to 11 digit local format or keep full
    const finalPhone = cleanPhone.length === 13 ? '0' + cleanPhone.substring(2) : cleanPhone;

    setSaving(true);
    try {
      const id = Crypto.randomUUID();
      await customerQueries.createCustomer({
        id,
        store_id: storeId,
        name: name.trim(),
        phone: finalPhone,
        is_dirty: 1 // mandatory dirty flag
      });

      Alert.alert('Success', 'Customer added successfully! (Offline Safe)');
      setName('');
      setPhone('');
      onSaveSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to create customer:', err);
      Alert.alert('Database Error', 'Failed to save customer to local SQLite.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardContainer}
        >
          <View style={styles.sheetContainer}>
            {/* Handle bar */}
            <View style={styles.handle} />

            <Text style={styles.title}>Add New Customer</Text>
            <Text style={styles.subtitle}>
              Register a new customer for local credit ledger tracking.
            </Text>

            {/* Name Input */}
            <Text style={styles.label}>Customer Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Abul Kalam"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="words"
              value={name}
              onChangeText={setName}
            />

            {/* Phone Input */}
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 01712345678"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={15}
              value={phone}
              onChangeText={setPhone}
            />

            {/* Actions */}
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.disabledButton]}
              activeOpacity={0.8}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : 'Save Customer'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  keyboardContainer: {
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.xl,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
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
  saveButton: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  disabledButton: {
    backgroundColor: colors.primaryDark,
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelButton: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
});
export default AddCustomerDrawer;
