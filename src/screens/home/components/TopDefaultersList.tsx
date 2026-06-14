import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import type { TopDefaulter } from '../../../db/queries/ledger';
import { colors, spacing, radius } from '../../../constants/theme';

interface Props {
  defaulters: TopDefaulter[];
}

function formatAmount(n: number): string {
  return '৳' + n.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function TopDefaultersList({ defaulters }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Top Defaulters</Text>
      {defaulters.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No outstanding balances</Text>
        </View>
      ) : (
        <FlatList
          data={defaulters}
          keyExtractor={(item) => item.customer_id}
          scrollEnabled={false}
          renderItem={({ item, index }) => (
            <View style={styles.row}>
              <View style={styles.rankBadge}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phone}</Text>
              </View>
              <Text style={styles.due}>{formatAmount(item.total_due)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  empty: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  phone: { fontSize: 12, color: colors.textSecondary },
  due: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
