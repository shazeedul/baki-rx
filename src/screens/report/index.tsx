import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { getLedgerEntries, getFilteredSummary, type LedgerRow } from '../../db/queries/ledger';
import { colors, spacing, radius } from '../../constants/theme';

type EntryTypeFilter = 'all' | 'sale' | 'collection';
type SortOrder = 'newest' | 'oldest';

const PAGE_SIZE = 30;

function fmt(n: number): string {
  return '৳' + n.toLocaleString('en-BD', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function firstDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportScreen({ isTab = false }: { isTab?: boolean }) {
  const storeId = useAuthStore((s) => s.storeId)!;

  const [fromDate, setFromDate] = useState(firstDay());
  const [toDate, setToDate] = useState(today());
  const [customerSearch, setCustomerSearch] = useState('');
  const [entryType, setEntryType] = useState<EntryTypeFilter>('all');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState({ totalBaki: 0, totalCollected: 0, netDue: 0 });

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadRows = useCallback(
    async (off = 0, replace = true) => {
      setLoading(true);
      const opts = {
        fromDate,
        toDate,
        customerSearch: customerSearch.trim() || undefined,
        entryType: entryType === 'all' ? undefined : entryType,
        sortOrder,
        limit: PAGE_SIZE,
        offset: off,
      };
      const [data, sum] = await Promise.all([
        getLedgerEntries(storeId, opts),
        off === 0 ? getFilteredSummary(storeId, {
          fromDate,
          toDate,
          entryType: entryType === 'all' ? undefined : entryType,
        }) : Promise.resolve(null),
      ]);
      if (replace) {
        setRows(data);
      } else {
        setRows((prev) => [...prev, ...data]);
      }
      if (off === 0 && sum) setSummary(sum);
      setHasMore(data.length === PAGE_SIZE);
      setOffset(off + data.length);
      setLoading(false);
    },
    [storeId, fromDate, toDate, customerSearch, entryType, sortOrder],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadRows(0, true), 300);
  }, [loadRows]);

  const loadMore = () => {
    if (!hasMore || loading) return;
    loadRows(offset, false);
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        {!isTab ? (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={styles.title}>Reports</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <View style={styles.dateRow}>
          <View style={styles.dateField}>
            <Text style={styles.filterLabel}>From</Text>
            <TextInput
              style={styles.dateInput}
              value={fromDate}
              onChangeText={setFromDate}
              placeholder="YYYY-MM-DD"
              maxLength={10}
            />
          </View>
          <View style={styles.dateField}>
            <Text style={styles.filterLabel}>To</Text>
            <TextInput
              style={styles.dateInput}
              value={toDate}
              onChangeText={setToDate}
              placeholder="YYYY-MM-DD"
              maxLength={10}
            />
          </View>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search customer…"
          value={customerSearch}
          onChangeText={setCustomerSearch}
        />

        <View style={styles.segmentRow}>
          {(['all', 'sale', 'collection'] as EntryTypeFilter[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.segment, entryType === t && styles.segmentActive]}
              onPress={() => setEntryType(t)}
            >
              <Text style={[styles.segmentText, entryType === t && styles.segmentTextActive]}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.segment, { marginLeft: 'auto' }]}
            onPress={() => setSortOrder((s) => (s === 'newest' ? 'oldest' : 'newest'))}
          >
            <Text style={styles.segmentText}>{sortOrder === 'newest' ? '↓ Newest' : '↑ Oldest'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary Bar */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Baki</Text>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>{fmt(summary.totalBaki)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Collected</Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>{fmt(summary.totalCollected)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Net Due</Text>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>{fmt(summary.netDue)}</Text>
        </View>
      </View>

      {/* Results */}
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <View style={styles.tableRow}>
            <Text style={styles.colDate}>{item.transaction_date}</Text>
            <View style={styles.colInfo}>
              <Text style={styles.customerName}>{item.name}</Text>
              <Text style={styles.customerPhone}>{item.phone}</Text>
            </View>
            <View style={styles.colAmounts}>
              <Text style={styles.billAmt}>{fmt(item.total_amount)}</Text>
              <Text style={styles.paidAmt}>Paid: {fmt(item.paid_amount)}</Text>
              <Text style={styles.dueAmt}>Due: {fmt(item.due_amount)}</Text>
            </View>
            <View style={[styles.typeBadge, item.entry_type === 'sale' ? styles.saleBadge : styles.collectionBadge]}>
              <Text style={styles.typeText}>{item.entry_type === 'sale' ? 'Sale' : 'Collect'}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No entries found for the selected filters.</Text>
            </View>
          ) : null
        }
        ListFooterComponent={loading ? <ActivityIndicator color={colors.primary} style={{ margin: spacing.lg }} /> : null}
      />
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
  backBtn: { minWidth: 60 },
  backText: { color: colors.primary, fontSize: 14 },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  placeholder: { minWidth: 60 },
  filters: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateField: { flex: 1 },
  filterLabel: { fontSize: 10, color: colors.textSecondary, marginBottom: 2 },
  dateInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  searchInput: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 13,
    backgroundColor: colors.background,
    color: colors.textPrimary,
  },
  segmentRow: { flexDirection: 'row', gap: spacing.xs },
  segment: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  segmentActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  segmentText: { fontSize: 12, color: colors.textSecondary },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: colors.textSecondary, textTransform: 'uppercase' },
  summaryValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  list: { padding: spacing.md, gap: spacing.sm },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
    gap: spacing.xs,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
  },
  colDate: { fontSize: 11, color: colors.textSecondary, width: 64 },
  colInfo: { flex: 1 },
  customerName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  customerPhone: { fontSize: 11, color: colors.textMuted },
  colAmounts: { alignItems: 'flex-end' },
  billAmt: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  paidAmt: { fontSize: 11, color: colors.primary },
  dueAmt: { fontSize: 11, color: colors.danger },
  typeBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  saleBadge: { backgroundColor: colors.dangerBg },
  collectionBadge: { backgroundColor: colors.successBg },
  typeText: { fontSize: 10, fontWeight: '700', color: colors.textPrimary },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13 },
});
