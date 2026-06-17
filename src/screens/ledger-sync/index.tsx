import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, CloudDownload, CheckCircle, AlertCircle } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '@/store/authStore';
import { syncEngine } from '@/sync/SyncEngine';
import DatePickerField from '@/components/DatePickerField';
import { colors, spacing, radius } from '@/constants/theme';

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type SyncState = 'idle' | 'syncing' | 'done' | 'error';

export default function LedgerSyncScreen() {
  const storeId = useAuthStore((s) => s.storeId)!;

  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(today());
  const [isOnline, setIsOnline] = useState(true);

  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalFetched, setTotalFetched] = useState(0);
  const [result, setResult] = useState<{ totalFetched: number; errors: number } | null>(null);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOnline(!!s.isConnected));
    return unsub;
  }, []);

  const handleSync = async () => {
    if (!isOnline || syncState === 'syncing') return;

    setSyncState('syncing');
    setCurrentBatch(0);
    setTotalFetched(0);
    setResult(null);

    try {
      const res = await syncEngine.syncLedgerByDateRange(
        storeId,
        fromDate,
        toDate,
        (batch, fetched) => {
          setCurrentBatch(batch);
          setTotalFetched(fetched);
        },
      );
      setResult(res);
      setSyncState(res.errors > 0 ? 'error' : 'done');
    } catch {
      setSyncState('error');
      setResult({ totalFetched, errors: 1 });
    }
  };

  const handleReset = () => {
    setSyncState('idle');
    setResult(null);
    setCurrentBatch(0);
    setTotalFetched(0);
  };

  const canSync = isOnline && syncState !== 'syncing';

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Ledger Sync</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Online Status */}
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: isOnline ? colors.primary : colors.danger }]} />
          <Text style={[styles.statusText, { color: isOnline ? colors.primary : colors.danger }]}>
            {isOnline ? 'Online — ready to sync' : 'Offline — connect to sync'}
          </Text>
        </View>

        {/* Date Range */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Date Range</Text>
          <Text style={styles.cardDesc}>
            Pull all ledger entries from cloud within this transaction date range.
          </Text>
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <DatePickerField label="From" value={fromDate} onChange={setFromDate} />
            </View>
            <View style={styles.dateField}>
              <DatePickerField label="To" value={toDate} onChange={setToDate} />
            </View>
          </View>
        </View>

        {/* Progress */}
        {syncState === 'syncing' && (
          <View style={styles.card}>
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.progressText}>Syncing in progress…</Text>
            </View>
            <Text style={styles.progressDetail}>
              Batch {currentBatch} · {totalFetched} entries written
            </Text>
            <Text style={styles.progressHint}>
              Each batch contains up to 500 entries. Do not close the app.
            </Text>
          </View>
        )}

        {/* Result */}
        {result !== null && syncState !== 'syncing' && (
          <View style={[styles.card, syncState === 'error' ? styles.cardError : styles.cardSuccess]}>
            <View style={styles.resultHeader}>
              {syncState === 'done' ? (
                <CheckCircle size={20} color={colors.primary} />
              ) : (
                <AlertCircle size={20} color={colors.danger} />
              )}
              <Text style={[styles.resultTitle, syncState === 'error' && styles.resultTitleError]}>
                {syncState === 'done' ? 'Sync Complete' : 'Sync Finished with Errors'}
              </Text>
            </View>
            <View style={styles.resultStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{result.totalFetched}</Text>
                <Text style={styles.statLabel}>Entries Pulled</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, result.errors > 0 && styles.errorText]}>
                  {result.errors}
                </Text>
                <Text style={styles.statLabel}>Errors</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{currentBatch}</Text>
                <Text style={styles.statLabel}>Batches</Text>
              </View>
            </View>
            <Text style={styles.resultNote}>
              Existing entries were skipped (INSERT OR IGNORE — no duplicates).
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        {syncState !== 'syncing' ? (
          <>
            <TouchableOpacity
              style={[styles.syncBtn, !canSync && styles.syncBtnDisabled]}
              onPress={handleSync}
              disabled={!canSync}
            >
              <CloudDownload size={18} color="#fff" />
              <Text style={styles.syncBtnText}>
                {syncState === 'idle' ? 'Start Sync' : 'Sync Again'}
              </Text>
            </TouchableOpacity>
            {syncState !== 'idle' && (
              <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
                <Text style={styles.resetBtnText}>Reset</Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={[styles.syncBtn, styles.syncBtnDisabled]}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.syncBtnText}>Syncing…</Text>
          </View>
        )}

        <Text style={styles.footerNote}>
          Pulls from cloud using transaction_date. Duplicate entries are safely skipped.
          Batches of 500 rows per network request.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingTop: spacing.xl + 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  placeholder: { width: 36 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardSuccess: { borderColor: colors.primary, backgroundColor: colors.successBg },
  cardError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  cardDesc: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  dateRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  dateField: { flex: 1 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressText: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  progressDetail: { fontSize: 20, fontWeight: '800', color: colors.primary },
  progressHint: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultTitle: { fontSize: 15, fontWeight: '700', color: colors.primary },
  resultTitleError: { color: colors.danger },
  resultStats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.sm },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textSecondary, textTransform: 'uppercase' },
  errorText: { color: colors.danger },
  resultNote: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  syncBtn: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  syncBtnDisabled: { opacity: 0.5 },
  syncBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  resetBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  footerNote: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: spacing.md,
  },
});
