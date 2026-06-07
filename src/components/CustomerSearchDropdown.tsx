import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { colors, spacing, radius } from '../constants/theme';
import { useAuth } from '../context/auth-context';
import { customerQueries, CustomerRow } from '../db/queries/customers';

interface CustomerSearchDropdownProps {
  onSelect: (customer: CustomerRow) => void;
  onAddNewCustomer: () => void;
}

export const CustomerSearchDropdown: React.FC<CustomerSearchDropdownProps> = ({
  onSelect,
  onAddNewCustomer,
}) => {
  const { storeId } = useAuth();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const dropdownOpen = useRef(false);

  // 1. Debounce search query by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [search]);

  // 2. Query customers from database when debounced search or offset changes
  const fetchCustomers = useCallback(async (query: string, currentOffset: number) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const limit = 20;
      const rows = await customerQueries.getCustomers(storeId, query, limit, currentOffset);
      
      if (currentOffset === 0) {
        setResults(rows);
      } else {
        setResults(prev => [...prev, ...rows]);
      }
      
      // If rows count matches limit, there could be more pages
      setHasMore(rows.length === limit);
    } catch (err) {
      console.warn('Failed to query customers for dropdown:', err);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId) {
      fetchCustomers(debouncedSearch, offset);
    }
  }, [debouncedSearch, offset, fetchCustomers, storeId]);

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      setOffset(prev => prev + 20);
    }
  };

  const handleSelectCustomer = (customer: CustomerRow) => {
    onSelect(customer);
    setSearch('');
    dropdownOpen.current = false;
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          placeholder="Search by name or mobile..."
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={(val) => {
            setSearch(val);
            dropdownOpen.current = true;
          }}
          onFocus={() => {
            dropdownOpen.current = true;
          }}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {dropdownOpen.current && (search.length > 0 || results.length > 0) && (
        <View style={styles.dropdownList}>
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.rowItem}
                onPress={() => handleSelectCustomer(item)}
              >
                <View>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowPhone}>{item.phone}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No customer found</Text>
                <TouchableOpacity style={styles.addBtn} onPress={onAddNewCustomer}>
                  <Text style={styles.addBtnText}>+ Tap to add customer</Text>
                </TouchableOpacity>
              </View>
            )}
            ListFooterComponent={() => {
              if (loading) {
                return (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                );
              }
              if (hasMore) {
                return (
                  <TouchableOpacity style={styles.loadMoreBtn} onPress={handleLoadMore}>
                    <Text style={styles.loadMoreText}>Load more</Text>
                  </TouchableOpacity>
                );
              }
              return null;
            }}
            keyboardShouldPersistTaps="handled"
            style={styles.scrollList}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
    width: '100%',
  },
  searchBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  searchIcon: {
    fontSize: 16,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
    height: '100%',
  },
  clearIcon: {
    fontSize: 14,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xs,
  },
  dropdownList: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    maxHeight: 250,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    zIndex: 999,
  },
  scrollList: {
    borderRadius: radius.md,
  },
  rowItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowPhone: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  addBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
  },
  addBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContainer: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  loadMoreBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomLeftRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  loadMoreText: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
});
export default CustomerSearchDropdown;
