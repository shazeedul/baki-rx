import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { cloudAdapter } from '@/services/cloudAdapter';
import { syncEngine } from '@/sync/SyncEngine';
import { upsertTenant, type Tenant } from '@/db/queries/auth';
import { colors, spacing, radius } from '@/constants/theme';

export default function TenantSyncScreen({ isTab = false }: { isTab?: boolean }) {
  const [isOnline, setIsOnline] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [foundTenant, setFoundTenant] = useState<Tenant | null>(null);
  const [syncProgress, setSyncProgress] = useState('');
  const [syncSuccess, setSyncSuccess] = useState(false);

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsOnline(!!s.isConnected));
    return unsub;
  }, []);

  const handleCheckTenant = async () => {
    const name = searchName.trim();
    if (!name) {
      Alert.alert('Validation Error', 'Please enter a tenant business name.');
      return;
    }

    if (!isOnline) {
      Alert.alert('Offline Mode', 'Internet connection is required to check online tenants.');
      return;
    }

    setChecking(true);
    setFoundTenant(null);
    setSyncSuccess(false);

    try {
      const tenant = await cloudAdapter.findTenantByName(name);
      if (!tenant) {
        Alert.alert(
          'Not Found',
          `Could not find any business named "${name}" online. Please double-check spelling.`
        );
      } else {
        setFoundTenant(tenant);
      }
    } catch {
      Alert.alert('Error', 'Failed to communicate with cloud services. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleSyncTenant = async () => {
    if (!foundTenant) return;

    if (!isOnline) {
      Alert.alert('Offline Mode', 'Internet connection is required to perform data sync.');
      return;
    }

    setSyncing(true);
    setSyncProgress('Syncing business profile...');

    try {
      // 1. Register business profile locally in SQLite
      setSyncProgress('Registering business profile locally...');
      await upsertTenant(foundTenant);

      // 2. Perform full sync for all stores, users, user_stores, and customers
      setSyncProgress('Downloading users, branches, and rosters...');
      await syncEngine.syncTenantFull(foundTenant.id);

      setSyncProgress('Syncing completed successfully!');
      setSyncSuccess(true);
      setSearchName('');
      setFoundTenant(null);

      Alert.alert(
        'Sync Complete',
        `All roster data and customer lists for "${foundTenant.business_name}" have been downloaded to this device.`,
        [{ text: 'OK' }]
      );
    } catch {
      Alert.alert('Sync Error', 'An error occurred during sync. Please try again.');
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        {!isTab && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back to Login</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.appName}>Tenant Sync</Text>
        <Text style={styles.tagline}>Download profiles and rosters for offline use</Text>
      </View>

      {!isOnline && (
        <View style={styles.offlineAlert}>
          <Text style={styles.offlineText}>
            You are currently offline. Please connect to the internet to verify and sync new business profiles.
          </Text>
        </View>
      )}

      {syncSuccess ? (
        <View style={styles.card}>
          <View style={styles.successIconWrapper}>
            <Text style={styles.successCheck}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Sync Successful!</Text>
          <Text style={styles.successMsg}>
            The business database has been downloaded. You can now go back to the login screen and sign in.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.primaryBtnText}>Go to Login</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.textBtn}
            onPress={() => setSyncSuccess(false)}
          >
            <Text style={styles.textBtnLabel}>Sync another business</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>Business / Pharmacy Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Care Pharmacy"
            value={searchName}
            onChangeText={setSearchName}
            editable={!checking && !syncing}
            returnKeyType="search"
            onSubmitEditing={handleCheckTenant}
          />

          <TouchableOpacity
            style={[styles.primaryBtn, (checking || syncing || !isOnline) && styles.btnDisabled]}
            onPress={handleCheckTenant}
            disabled={checking || syncing || !isOnline}
          >
            {checking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Check Tenant Online</Text>
            )}
          </TouchableOpacity>

          {foundTenant && (
            <View style={styles.resultsWrapper}>
              <View style={styles.divider} />
              <Text style={styles.foundLabel}>Matching Business Found:</Text>
              <View style={styles.tenantInfoCard}>
                <Text style={styles.tenantName}>{foundTenant.business_name}</Text>
                <Text style={styles.tenantIdLabel}>ID: {foundTenant.id}</Text>
              </View>

              {syncing ? (
                <View style={styles.progressContainer}>
                  <ActivityIndicator color={colors.primary} style={{ marginBottom: spacing.sm }} />
                  <Text style={styles.progressText}>{syncProgress}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.syncBtn}
                  onPress={handleSyncTenant}
                  disabled={syncing}
                >
                  <Text style={styles.syncBtnText}>Download & Sync Data</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  backBtn: { alignSelf: 'flex-start', marginBottom: spacing.md, paddingVertical: spacing.xs },
  backText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  appName: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  tagline: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'center' },
  offlineAlert: {
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  offlineText: { color: '#B45309', fontSize: 12, fontWeight: '600', textAlign: 'center' },
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
  sectionLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  resultsWrapper: { marginTop: spacing.sm },
  foundLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, fontWeight: '600' },
  tenantInfoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  tenantName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  tenantIdLabel: { fontSize: 11, color: colors.textSecondary, marginTop: spacing.xs },
  syncBtn: {
    height: 52,
    backgroundColor: colors.textPrimary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  progressContainer: { alignItems: 'center', padding: spacing.md },
  progressText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  successIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  successCheck: { fontSize: 32, color: colors.primary, fontWeight: '800' },
  successTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.md },
  successMsg: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20 },
  textBtn: { alignItems: 'center', marginTop: spacing.md, padding: spacing.sm },
  textBtnLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
