import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '../../../store/authStore';
import { useSyncStore } from '../../../store/syncStore';
import { syncEngine } from '../../../sync/SyncEngine';
import { colors, spacing, radius } from '../../../constants/theme';

function formatTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) + ' ' + d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return 'Never';
  }
}

export default function SyncTab() {
  const storeId = useAuthStore((s) => s.storeId)!;
  const tenantId = useAuthStore((s) => s.tenantId)!;
  const dirtyCount = useSyncStore((s) => s.dirtyCount);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const isSyncing = useSyncStore((s) => s.isSyncing);

  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOnline(!!s.isConnected));
    return unsub;
  }, []);

  const handleSyncNow = async () => {
    if (!isOnline) {
      Alert.alert(
        'Offline',
        'Cannot sync while offline. Please connect to the internet and try again.'
      );
      return;
    }

    try {
      await syncEngine.sync(storeId, tenantId);
    } catch {
      Alert.alert('Sync Error', 'An error occurred during synchronization.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Data Synchronization</Text>
      <Text style={styles.subtitle}>
        Sync sales, collections, and customers between local SQLite and cloud storage.
      </Text>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Connection Status</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.dot, { backgroundColor: isOnline ? colors.primary : colors.danger }]} />
            <Text style={[styles.statusText, { color: isOnline ? colors.primary : colors.danger }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.metricRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Pending Sync</Text>
            <Text style={[styles.metricValue, dirtyCount > 0 && styles.dirtyText]}>
              {dirtyCount}
            </Text>
            <Text style={styles.metricDesc}>Changes saved locally offline</Text>
          </View>

          <View style={styles.verticalDivider} />

          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Last Synced</Text>
            <Text style={styles.metricValueSmall}>
              {formatTime(lastSyncedAt)}
            </Text>
            <Text style={styles.metricDesc}>Last success timestamp</Text>
          </View>
        </View>

        {isSyncing ? (
          <View style={styles.syncingProgress}>
            <ActivityIndicator size="small" color={colors.primary} style={{ marginRight: spacing.sm }} />
            <Text style={styles.syncingText}>Syncing database records...</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.syncBtn, !isOnline && styles.syncBtnDisabled]}
            onPress={handleSyncNow}
            disabled={isSyncing}
          >
            <Text style={styles.syncBtnText}>Sync Now</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  verticalDivider: { width: 1, backgroundColor: colors.border, height: '80%' },
  metricRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: spacing.xl },
  metricItem: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  metricLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: spacing.xs },
  metricValue: { fontSize: 28, fontWeight: '800', color: colors.textPrimary },
  metricValueSmall: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginVertical: 8, textAlign: 'center' },
  metricDesc: { fontSize: 10, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
  dirtyText: { color: colors.danger },
  syncingProgress: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  syncingText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  syncBtn: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
