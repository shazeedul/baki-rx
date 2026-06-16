import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { router } from 'expo-router';
import type { TopDefaulter } from '@/db/queries/ledger';
import { colors, spacing, radius } from '@/constants/theme';

interface Props {
  defaulters: TopDefaulter[];
}

function fmt(n: number): string {
  return '৳' + n.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function TopDefaultersList({ defaulters }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Defaulters</Text>
        {defaulters.length > 0 && (
          <Text style={styles.count}>{defaulters.length} customers</Text>
        )}
      </View>
      {defaulters.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No outstanding balances</Text>
        </View>
      ) : (
        <FlatList
          data={defaulters}
          keyExtractor={(item) => item.customer_id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/customer?customerId=${item.customer_id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(item.name)}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.phone}>{item.phone}</Text>
              </View>
              <Text style={styles.due}>{fmt(item.total_due)}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    Linking.openURL(`tel:${item.phone}`);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.iconText}>📞</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    const number = item.phone.startsWith('0') ? '88' + item.phone : item.phone;
                    Linking.openURL(`https://wa.me/${number}`);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.iconText}>💬</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  count: { fontSize: 12, color: colors.textSecondary },
  empty: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  phone: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  due: { fontSize: 15, fontWeight: '700', color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.xs, marginLeft: spacing.xs },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { fontSize: 16 },
});
