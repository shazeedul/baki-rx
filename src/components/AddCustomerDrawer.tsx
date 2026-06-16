import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '@/store/authStore';
import { insertCustomer } from '@/db/queries/customers';
import { colors, spacing, radius } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddCustomerDrawer({ visible, onClose, onAdded }: Props) {
  const storeId = useAuthStore((s) => s.storeId)!;
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const phoneRef = useRef<TextInput>(null);

  const reset = () => {
    setName('');
    setPhone('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSave = async () => {
    const trimName = name.trim();
    const trimPhone = phone.trim();

    if (!trimName) {
      Alert.alert('Validation', 'Customer name is required.');
      return;
    }
    if (trimPhone.length !== 11) {
      Alert.alert('Validation', 'Phone must be 11 digits (BD format).');
      return;
    }

    setSaving(true);
    try {
      const id = Crypto.randomUUID();
      await insertCustomer({ id, store_id: storeId, name: trimName, phone: trimPhone, is_dirty: 1 });
      reset();
      onAdded();
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to save customer. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetWrapper}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add Customer</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Customer name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            ref={phoneRef}
            style={styles.input}
            placeholder="01XXXXXXXXX"
            value={phone}
            onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 11))}
            keyboardType="phone-pad"
            returnKeyType="done"
            onSubmitEditing={handleSave}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Customer'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl + 16,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
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
  },
  saveBtn: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
