import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSyncStore } from '../store/syncStore';
import { colors, spacing, radius } from '../constants/theme';

export default function SyncStatusBadge() {
  const { dirtyCount, isSyncing } = useSyncStore();

  if (isSyncing) {
    return (
      <View style={[styles.badge, styles.syncing]}>
        <Text style={styles.text}>Syncing…</Text>
      </View>
    );
  }

  if (dirtyCount > 0) {
    return (
      <View style={[styles.badge, styles.pending]}>
        <Text style={styles.text}>{dirtyCount} pending</Text>
      </View>
    );
  }

  return (
    <View style={[styles.badge, styles.synced]}>
      <Text style={styles.text}>Synced</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.xl,
  },
  syncing: { backgroundColor: '#FEF3C7' },
  pending: { backgroundColor: '#FEF3C7' },
  synced: { backgroundColor: colors.successBg },
  text: { fontSize: 11, fontWeight: '600', color: colors.textPrimary },
});
