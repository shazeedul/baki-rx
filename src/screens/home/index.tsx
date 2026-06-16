import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '@/store/authStore';
import { useSyncStore } from '@/store/syncStore';
import { getTotalDue, getTodayCollection, getTopDefaulters, countDirty, type TopDefaulter } from '@/db/queries/ledger';
import { getStore, type Store } from '@/db/queries/stores';
import { syncEngine } from '@/sync/SyncEngine';
import SummaryCards from '@/screens/home/components/SummaryCards';
import TopDefaultersList from '@/screens/home/components/TopDefaultersList';
import AddCustomerDrawer from '@/components/AddCustomerDrawer';
import SyncStatusBadge from '@/components/SyncStatusBadge';
import CustomersTab from '@/screens/home/components/CustomersTab';
import ReportScreen from '@/screens/report';
import SyncTab from '@/screens/home/components/SyncTab';
import { colors, spacing, radius } from '@/constants/theme';

export default function HomeScreen() {
  const storeId = useAuthStore((s) => s.storeId)!;
  const tenantId = useAuthStore((s) => s.tenantId)!;
  const clearSession = useAuthStore((s) => s.clearSession);
  const setDirtyCount = useSyncStore((s) => s.setDirtyCount);

  const [store, setStore] = useState<Store | null>(null);
  const [totalDue, setTotalDue] = useState(0);
  const [todayCollection, setTodayCollection] = useState(0);
  const [defaulters, setDefaulters] = useState<TopDefaulter[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'customers' | 'reports' | 'sync'>('home');

  const loadData = useCallback(async () => {
    const [storeInfo, due, collection, tops, dirty] = await Promise.all([
      getStore(storeId),
      getTotalDue(storeId),
      getTodayCollection(storeId),
      getTopDefaulters(storeId),
      countDirty(storeId),
    ]);
    setStore(storeInfo);
    setTotalDue(due);
    setTodayCollection(collection);
    setDefaulters(tops);
    setDirtyCount(dirty);
  }, [storeId, setDirtyCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        syncEngine.sync(storeId, tenantId);
        syncEngine.syncStores(tenantId);
      }
    });
    return unsub;
  }, [storeId, tenantId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleLogout = () => {
    clearSession();
    router.replace('/login');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'customers':
        return <CustomersTab storeId={storeId} />;
      case 'reports':
        return <ReportScreen isTab />;
      case 'sync':
        return <SyncTab />;
      case 'home':
      default:
        return (
          <ScrollView
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
          >
            <SummaryCards totalDue={totalDue} todayCollection={todayCollection} />

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/entry')}>
                <Text style={styles.primaryBtnText}>+ New Baki Entry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setDrawerVisible(true)}>
                <Text style={styles.secondaryBtnText}>+ Add Customer</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.reportLink} onPress={() => setActiveTab('reports')}>
              <Text style={styles.reportLinkText}>View Reports →</Text>
            </TouchableOpacity>

            <TopDefaultersList defaulters={defaulters} />
          </ScrollView>
        );
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.storeName}>{store?.store_name ?? 'My Branch'}</Text>
          <Text style={styles.storeLocation}>{store?.location ?? ''}</Text>
        </View>
        <View style={styles.topBarRight}>
          <SyncStatusBadge />
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mainContent}>
        {renderTabContent()}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('home')}>
          <Text style={[styles.tabIcon, activeTab === 'home' && styles.tabActiveText]}>🏠</Text>
          <Text style={[styles.tabLabel, activeTab === 'home' && styles.tabActiveText]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('customers')}>
          <Text style={[styles.tabIcon, activeTab === 'customers' && styles.tabActiveText]}>👥</Text>
          <Text style={[styles.tabLabel, activeTab === 'customers' && styles.tabActiveText]}>Customers</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('reports')}>
          <Text style={[styles.tabIcon, activeTab === 'reports' && styles.tabActiveText]}>📊</Text>
          <Text style={[styles.tabLabel, activeTab === 'reports' && styles.tabActiveText]}>Reports</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => setActiveTab('sync')}>
          <Text style={[styles.tabIcon, activeTab === 'sync' && styles.tabActiveText]}>🔄</Text>
          <Text style={[styles.tabLabel, activeTab === 'sync' && styles.tabActiveText]}>Sync</Text>
        </TouchableOpacity>
      </View>

      <AddCustomerDrawer
        visible={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        onAdded={loadData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    paddingTop: spacing.xl + 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  storeName: { fontSize: 17, fontWeight: '800', color: colors.textPrimary },
  storeLocation: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  topBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoutBtn: { padding: spacing.sm },
  logoutText: { fontSize: 13, color: colors.textSecondary },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  primaryBtn: {
    flex: 1,
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    flex: 1,
    height: 52,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  reportLink: { alignSelf: 'flex-end', marginBottom: spacing.lg, padding: spacing.xs },
  reportLinkText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  mainContent: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 4,
    paddingTop: 6,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  tabIcon: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  tabLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  tabActiveText: {
    color: colors.primary,
    fontWeight: '700',
  },
});
