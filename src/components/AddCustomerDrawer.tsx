import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '@/store/authStore';
import { insertCustomer } from '@/db/queries/customers';
import { colors, spacing, radius } from '@/constants/theme';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';

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
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const phoneRef = useRef<any>(null);

  const reset = () => {
    setName('');
    setPhone('');
  };

  useEffect(() => {
    if (visible) {
      bottomSheetModalRef.current?.present();
    } else {
      bottomSheetModalRef.current?.dismiss();
    }
  }, [visible]);

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
      bottomSheetModalRef.current?.dismiss();
    } catch {
      Alert.alert('Error', 'Failed to save customer. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      index={0}
      snapPoints={['55%']}
      backdropComponent={renderBackdrop}
      onDismiss={handleClose}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.sheetContent}>
        <Text style={styles.title}>Add Customer</Text>

        <Text style={styles.label}>Name</Text>
        <BottomSheetTextInput
          style={[styles.input, nameFocused && styles.inputFocused]}
          placeholder="Customer name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => phoneRef.current?.focus()}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
        />

        <Text style={styles.label}>Phone</Text>
        <BottomSheetTextInput
          ref={phoneRef}
          style={[styles.input, phoneFocused && styles.inputFocused]}
          placeholder="01XXXXXXXXX"
          value={phone}
          onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 11))}
          keyboardType="phone-pad"
          returnKeyType="done"
          onSubmitEditing={handleSave}
          onFocus={() => setPhoneFocused(true)}
          onBlur={() => setPhoneFocused(false)}
        />

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Customer</Text>
          )}
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  handleIndicator: {
    width: 48,
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 2.5,
  },
  sheetContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl + 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    letterSpacing: -0.3,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  saveBtn: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl + 4,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

