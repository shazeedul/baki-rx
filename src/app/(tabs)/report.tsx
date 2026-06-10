import { colors, radius, spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { ledgerQueries, ReportRow } from '@/db/queries/ledger';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ReportScreen() {
  const router = useRouter();
  const { isLoggedIn, storeId } = useAuth();

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  // 1. Filter states
  const [fromDate, setFromDate] = useState(() => {
    // Default: first day of current month (e.g. YYYY-MM-01)
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });

  const [toDate, setToDate] = useState(() => {
    // Default: current date (YYYY-MM-DD)
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [entryType, setEntryType] = useState<'all' | 'sale' | 'collection'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest_due' | 'lowest_due'>('newest');

  // Pagination states
  const [data, setData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Debounce customer search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(customerSearch);
      setOffset(0);
    }, 300);
    return () => clearTimeout(handler);
  }, [customerSearch]);

  // Reset pagination on filter changes
  useEffect(() => {
    setOffset(0);
  }, [fromDate, toDate, entryType, sortBy]);

  // Fetch report entries
  const fetchReport = useCallback(async (currentOffset: number) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const limit = 30;
      const rows = await ledgerQueries.getReportEntries(
        storeId,
        {
          fromDate: fromDate || null,
          toDate: toDate || null,
          entryType,
          customerSearch: debouncedSearch,
        },
        limit,
        currentOffset
      );

      // Perform local sorting
      let sorted = [...rows];
      if (sortBy === 'newest') {
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else if (sortBy === 'oldest') {
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      } else if (sortBy === 'highest_due') {
        sorted.sort((a, b) => b.due_amount - a.due_amount);
      } else if (sortBy === 'lowest_due') {
        sorted.sort((a, b) => a.due_amount - b.due_amount);
      }

      if (currentOffset === 0) {
        setData(sorted);
      } else {
        setData((prev) => [...prev, ...sorted]);
      }
      setHasMore(rows.length === limit);
    } catch (err) {
      console.warn('Failed to fetch report rows:', err);
    } finally {
      setLoading(false);
    }
  }, [storeId, fromDate, toDate, entryType, debouncedSearch, sortBy]);

  useEffect(() => {
    fetchReport(offset);
  }, [offset, fetchReport]);

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      setOffset((prev) => prev + 30);
    }
  };

  // Scoped calculation for totals (Baki, Collected, Net Due) from active filtered data
  const summary = useMemo(() => {
    let totalBaki = 0;
    let totalCollected = 0;

    data.forEach((r) => {
      if (r.entry_type === 'sale') {
        totalBaki += r.total_amount;
        totalCollected += r.paid_amount;
      } else if (r.entry_type === 'collection') {
        totalCollected += r.paid_amount;
      }
    });

    return {
      totalBaki,
      totalCollected,
      netDue: Math.max(0, totalBaki - totalCollected),
    };
  }, [data]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.push('/(tabs)/home')} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transaction Report</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Filters Panel */}
        <View style={styles.filterCard}>
          {/* Date range inputs */}
          <View style={styles.row}>
            <View style={styles.flexHalf}>
              <Text style={styles.filterLabel}>From Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="2026-06-01"
                placeholderTextColor={colors.textMuted}
                value={fromDate}
                onChangeText={setFromDate}
              />
            </View>
            <View style={[styles.flexHalf, { marginLeft: spacing.md }]}>
              <Text style={styles.filterLabel}>To Date (YYYY-MM-DD)</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="2026-06-30"
                placeholderTextColor={colors.textMuted}
                value={toDate}
                onChangeText={setToDate}
              />
            </View>
          </View>

          {/* Customer Search */}
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.filterLabel}>Search Customer</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Filter by name or phone..."
              placeholderTextColor={colors.textMuted}
              value={customerSearch}
              onChangeText={setCustomerSearch}
            />
          </View>

          {/* Entry Type and Sort Row */}
          <View style={[styles.row, { marginTop: spacing.md }]}>
            <View style={styles.flexHalf}>
              <Text style={styles.filterLabel}>Entry Type</Text>
              <View style={styles.segmentedContainer}>
                {(['all', 'sale', 'collection'] as const).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.segmentBtn, entryType === t && styles.segmentBtnActive]}
                    onPress={() => setEntryType(t)}
                  >
                    <Text style={[styles.segmentText, entryType === t && styles.segmentTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.flexHalf, { marginLeft: spacing.md }]}>
              <Text style={styles.filterLabel}>Sort By</Text>
              <View style={styles.sortContainer}>
                {(['newest', 'oldest'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sortBtn, sortBy === s && styles.sortBtnActive]}
                    onPress={() => setSortBy(s)}
                  >
                    <Text style={[styles.sortText, sortBy === s && styles.sortTextActive]}>
                      {s === 'newest' ? 'Newest' : 'Oldest'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        {/* Summary Bar */}
        <View style={styles.summaryBar}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Total Baki</Text>
            <Text style={[styles.summaryVal, { color: colors.danger }]}>
              ৳ {summary.totalBaki.toLocaleString()}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Collected</Text>
            <Text style={[styles.summaryVal, { color: colors.primary }]}>
              ৳ {summary.totalCollected.toLocaleString()}
            </Text>
          </View>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryLabel}>Net Scoped Due</Text>
            <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>
              ৳ {summary.netDue.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Results List */}
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const isBaki = item.entry_type === 'sale';
            const dateStr = new Date(item.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: '2-digit',
            });
            return (
              <View style={styles.tableRow}>
                <View style={styles.dateCol}>
                  <Text style={styles.rowDate}>{dateStr}</Text>
                  <View style={[styles.badge, { backgroundColor: isBaki ? colors.dangerBg : colors.successBg }]}>
                    <Text style={[styles.badgeText, { color: isBaki ? colors.danger : colors.primary }]}>
                      {isBaki ? 'Baki' : 'Pay'}
                    </Text>
                  </View>
                </View>
                <View style={styles.customerCol}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowPhone}>{item.phone}</Text>
                </View>
                <View style={styles.amountsCol}>
                  <Text style={styles.rowBill}>Bill: ৳{item.total_amount}</Text>
                  <Text style={styles.rowPaid}>Paid: ৳{item.paid_amount}</Text>
                  <Text style={[styles.rowDue, { color: colors.danger, fontWeight: '700' }]}>
                    Due: ৳{item.due_amount}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No matching transaction records found.</Text>
            </View>
          )}
          ListFooterComponent={() => {
            if (loading) {
              return (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              );
            }
            if (hasMore) {
              return (
                <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                  <Text style={styles.loadMoreText}>Load More Transactions</Text>
                </TouchableOpacity>
              );
            }
            return null;
          }}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        />

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    paddingVertical: spacing.sm,
    width: 60,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  filterCard: {
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
  },
  flexHalf: {
    flex: 1,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dateInput: {
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  searchInput: {
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  segmentedContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    height: 34,
  },
  segmentBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  sortContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    height: 34,
  },
  sortBtn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  sortBtnActive: {
    backgroundColor: colors.primary,
  },
  sortText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sortTextActive: {
    color: '#ffffff',
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryCol: {
    flex: 1,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  dateCol: {
    width: 70,
    alignItems: 'center',
  },
  rowDate: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: 4,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  customerCol: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  rowPhone: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  amountsCol: {
    alignItems: 'flex-end',
    width: 100,
  },
  rowBill: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  rowPaid: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  rowDue: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    padding: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  footerLoader: {
    padding: spacing.md,
    alignItems: 'center',
  },
  loadMoreBtn: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  loadMoreText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
});
