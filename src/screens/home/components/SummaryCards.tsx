import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius } from '@/constants/theme';

interface Props {
  totalDue: number;
  todayCollection: number;
}

function formatAmount(n: number): string {
  return '৳' + n.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function SummaryCards({ totalDue, todayCollection }: Props) {
  return (
    <View style={styles.row}>
      <View style={[styles.card, styles.dueCard]}>
        <Text style={styles.cardLabel}>Total Baki</Text>
        <Text style={[styles.cardAmount, { color: colors.danger }]}>{formatAmount(totalDue)}</Text>
      </View>
      <View style={[styles.card, styles.collectionCard]}>
        <Text style={styles.cardLabel}>Today&apos;s Collection</Text>
        <Text style={[styles.cardAmount, { color: colors.primary }]}>{formatAmount(todayCollection)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  card: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  dueCard: { backgroundColor: colors.dangerBg },
  collectionCard: { backgroundColor: colors.successBg },
  cardLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: spacing.xs, fontWeight: '600', textTransform: 'uppercase' },
  cardAmount: { fontSize: 22, fontWeight: '700' },
});
