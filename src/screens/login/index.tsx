import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import * as bcrypt from 'bcryptjs';
import NetInfo from '@react-native-community/netinfo';
import { getLocalTenants, findLocalUser, type Tenant } from '../../db/queries/auth';
import { useAuthStore } from '../../store/authStore';
import { syncEngine } from '../../sync/SyncEngine';
import { colors, spacing, radius } from '../../constants/theme';

export default function LoginScreen() {
  const setSession = useAuthStore((s) => s.setSession);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [showTenantPicker, setShowTenantPicker] = useState(false);

  useEffect(() => {
    const bootstrapTenants = async () => {
      try {
        await syncEngine.bootstrapTenants();
        const local = await getLocalTenants();
        setTenants(local);
      } catch {
        // silent — will retry when online
      }
    };

    const loadTenants = async (online: boolean) => {
      const local = await getLocalTenants();
      setTenants(local);
      if (online) {
        await bootstrapTenants();
      }
    };

    NetInfo.fetch().then((state) => {
      const online = !!state.isConnected;
      setIsOnline(online);
      loadTenants(online);
    });

    const unsub = NetInfo.addEventListener((s) => {
      const online = !!s.isConnected;
      setIsOnline(online);
      if (online) {
        bootstrapTenants();
      }
    });
    return unsub;
  }, []);

  const handleLogin = async () => {
    if (!selectedTenant) {
      Alert.alert('Select Tenant', 'Please select your pharmacy/business first.');
      return;
    }
    if (!phone.trim() || !password) {
      Alert.alert('Missing Fields', 'Enter your mobile number and password.');
      return;
    }

    setLoading(true);
    try {
      const user = await findLocalUser(selectedTenant.id, phone.trim());

      if (!user) {
        if (!isOnline) {
          Alert.alert(
            'Account Not Found',
            'Account not found for this tenant on this device. Go online to sync first.',
          );
          return;
        }
        // Try syncing users from cloud
        await syncEngine.syncUsers(selectedTenant.id);
        const retryUser = await findLocalUser(selectedTenant.id, phone.trim());
        if (!retryUser) {
          Alert.alert('Account Not Found', 'Account not found for this tenant on this device.');
          return;
        }
        const match = await bcrypt.compare(password, retryUser.password_hash);
        if (!match) {
          Alert.alert('Incorrect Password', 'The password you entered is incorrect.');
          return;
        }
        setSession(retryUser.id, retryUser.tenant_id, retryUser.default_store_id);
        router.replace('/');
        return;
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        Alert.alert('Incorrect Password', 'The password you entered is incorrect.');
        return;
      }

      setSession(user.id, user.tenant_id, user.default_store_id);
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };

  const connectivityLabel = isOnline ? 'Online' : tenants.length > 0 ? 'Offline Mode Ready' : 'Sync Required';
  const connectivityColor = isOnline ? colors.primary : tenants.length > 0 ? colors.primary : '#D97706';

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Text style={styles.appName}>Baki Rx Ledger</Text>
        <Text style={styles.tagline}>Pharmacy Credit Management</Text>
      </View>

      <View style={styles.connectivityBadge}>
        <View style={[styles.dot, { backgroundColor: connectivityColor }]} />
        <Text style={[styles.connectivityText, { color: connectivityColor }]}>{connectivityLabel}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionLabel}>Select Business</Text>
        <TouchableOpacity
          style={styles.tenantSelector}
          onPress={() => setShowTenantPicker(!showTenantPicker)}
        >
          <Text style={selectedTenant ? styles.tenantSelected : styles.tenantPlaceholder}>
            {selectedTenant ? selectedTenant.business_name : 'Select tenant…'}
          </Text>
          <Text style={styles.chevron}>{showTenantPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>

        {showTenantPicker && (
          <View style={styles.tenantList}>
            {tenants.length === 0 ? (
              <Text style={styles.noTenants}>
                {isOnline ? 'Loading…' : 'No tenants available offline.'}
              </Text>
            ) : (
              tenants.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.tenantOption}
                  onPress={() => {
                    setSelectedTenant(t);
                    setShowTenantPicker(false);
                  }}
                >
                  <Text style={styles.tenantOptionText}>{t.business_name}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>Mobile Number</Text>
        <TextInput
          style={[styles.input, !selectedTenant && styles.inputDisabled]}
          placeholder="01XXXXXXXXX"
          value={phone}
          onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 11))}
          keyboardType="phone-pad"
          editable={!!selectedTenant}
          returnKeyType="next"
        />

        <Text style={styles.sectionLabel}>Password / PIN</Text>
        <TextInput
          style={[styles.input, !selectedTenant && styles.inputDisabled]}
          placeholder="Enter password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!!selectedTenant}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={[styles.loginBtn, (loading || !selectedTenant) && styles.loginBtnDisabled]}
          onPress={handleLogin}
          disabled={loading || !selectedTenant}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginBtnText}>Sign In</Text>
          )}
        </TouchableOpacity>

        {isOnline && (
          <TouchableOpacity
            style={styles.tenantSyncBtn}
            onPress={() => router.push('/tenant-sync')}
          >
            <Text style={styles.tenantSyncText}>Sync New Business / Tenant</Text>
          </TouchableOpacity>
        )}
      </View>
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
  appName: { fontSize: 28, fontWeight: '800', color: colors.primary },
  tagline: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  connectivityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    gap: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  connectivityText: { fontSize: 12, fontWeight: '600' },
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
  sectionLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.md },
  tenantSelector: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
  },
  tenantSelected: { fontSize: 14, color: colors.textPrimary },
  tenantPlaceholder: { fontSize: 14, color: colors.textMuted },
  chevron: { fontSize: 10, color: colors.textSecondary },
  tenantList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  noTenants: { padding: spacing.md, color: colors.textMuted, fontSize: 13 },
  tenantOption: {
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tenantOptionText: { fontSize: 14, color: colors.textPrimary },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  inputDisabled: { opacity: 0.5 },
  loginBtn: {
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  tenantSyncBtn: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  tenantSyncText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
