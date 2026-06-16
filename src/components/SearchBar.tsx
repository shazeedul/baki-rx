import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { colors, spacing, radius } from '@/constants/theme';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onFocus?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
}

export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search…',
  onFocus,
  autoFocus,
  compact = false,
}: Props) {
  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Search size={compact ? 15 : 17} color={colors.textSecondary} />
      <TextInput
        style={[styles.input, compact && styles.inputCompact]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onFocus={onFocus}
        autoFocus={autoFocus}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={8}>
          <X size={15} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  containerCompact: {
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    padding: 0,
  },
  inputCompact: {
    fontSize: 13,
  },
});
