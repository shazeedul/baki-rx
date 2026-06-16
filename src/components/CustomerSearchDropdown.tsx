import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAuthStore } from '@/store/authStore';
import { searchCustomers, listCustomers, type Customer } from '@/db/queries/customers';
import { colors, spacing, radius } from '@/constants/theme';

interface Props {
  onSelect: (customer: Customer) => void;
  onAddNew?: () => void;
  selectedCustomer?: Customer | null;
}

export default function CustomerSearchDropdown({ onSelect, onAddNew, selectedCustomer }: Props) {
  const storeId = useAuthStore((s) => s.storeId)!;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (q: string, off = 0) => {
      setLoading(true);
      const rows =
        q.trim().length > 0
          ? await searchCustomers(storeId, q, 20, off)
          : await listCustomers(storeId, 20, off);
      setLoading(false);
      if (off === 0) {
        setResults(rows);
      } else {
        setResults((prev) => [...prev, ...rows]);
      }
      setHasMore(rows.length === 20);
      setOffset(off + rows.length);
    },
    [storeId],
  );

  const handleChangeText = (text: string) => {
    setQuery(text);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(text, 0), 300);
  };

  const handleFocus = () => {
    setOpen(true);
    if (results.length === 0) runSearch(query, 0);
  };

  const handleSelect = (customer: Customer) => {
    onSelect(customer);
    setQuery(customer.name);
    setOpen(false);
  };

  const loadMore = () => {
    if (!hasMore || loading) return;
    runSearch(query, offset);
  };

  return (
    <View style={styles.container}>
      {selectedCustomer && !open ? (
        <TouchableOpacity style={styles.selectedChip} onPress={() => setOpen(true)}>
          <View>
            <Text style={styles.selectedName}>{selectedCustomer.name}</Text>
            <Text style={styles.selectedPhone}>{selectedCustomer.phone}</Text>
          </View>
          <Text style={styles.changeBtn}>Change</Text>
        </TouchableOpacity>
      ) : (
        <TextInput
          style={styles.input}
          placeholder="Search by name or mobile…"
          value={query}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          autoCapitalize="none"
        />
      )}

      {open && (
        <View style={styles.dropdown}>
          {loading && <ActivityIndicator size="small" color={colors.primary} style={{ margin: spacing.md }} />}
          <ScrollView
            style={styles.scrollList}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {results.length === 0 ? (
              !loading && (
                <TouchableOpacity style={styles.emptyRow} onPress={onAddNew}>
                  <Text style={styles.emptyText}>No customer found — tap + to add</Text>
                </TouchableOpacity>
              )
            ) : (
              results.map((item) => (
                <TouchableOpacity key={item.id} style={styles.row} onPress={() => handleSelect(item)}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowPhone}>{item.phone}</Text>
                </TouchableOpacity>
              ))
            )}
            {hasMore && !loading && (
              <TouchableOpacity style={styles.loadMore} onPress={loadMore}>
                <Text style={styles.loadMoreText}>Load more</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', zIndex: 10 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    fontSize: 14,
    color: colors.textPrimary,
  },
  selectedChip: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  selectedName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  selectedPhone: { fontSize: 12, color: colors.textSecondary },
  changeBtn: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  dropdown: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    maxHeight: 220,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowName: { fontSize: 14, color: colors.textPrimary },
  rowPhone: { fontSize: 12, color: colors.textSecondary },
  emptyRow: { padding: spacing.lg, alignItems: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  loadMore: { padding: spacing.md, alignItems: 'center' },
  loadMoreText: { color: colors.primary, fontSize: 13 },
  scrollList: { flex: 1 },
});
