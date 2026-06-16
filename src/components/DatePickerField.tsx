import { colors, radius, spacing } from '@/constants/theme';
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  label?: string;
  compact?: boolean;
}

function toDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function DatePickerField({ value, onChange, label, compact = false }: Props) {
  const [show, setShow] = useState(false);

  const handleValueChange = (_: DateTimePickerChangeEvent, selected: Date) => {
    setShow(Platform.OS === 'ios');
    if (selected) onChange(toStr(selected));
  };

  const handleDismiss = () => {
    setShow(false);
  };

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity
        style={[styles.field, compact && styles.fieldCompact]}
        onPress={() => setShow(true)}
        activeOpacity={0.7}
      >
        <CalendarDays size={16} color={colors.textSecondary} />
        <Text style={[styles.dateText, compact && styles.dateTextCompact]}>{value}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={toDate(value)}
          mode="date"
          display="default"
          onValueChange={handleValueChange}
          onDismiss={handleDismiss}
          maximumDate={new Date(2099, 11, 31)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  field: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  fieldCompact: {
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
  },
  dateText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  dateTextCompact: {
    fontSize: 13,
  },
});
