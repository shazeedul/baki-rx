import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../constants/theme';
import { useAuth } from '../../context/auth-context';

export default function LoginScreen() {
  const { stores, terminals, refreshTerminals, syncTerminals, syncTenantByName, login, isLoggedIn } = useAuth();
  const router = useRouter();

  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobile, setMobile] = useState('');

  // 4 separate PIN digit states
  const [pin, setPin] = useState(['', '', '', '']);
  const pinRefs = [
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
    useRef<TextInput>(null),
  ];

  const [loading, setLoading] = useState(false);

  // Tenant screen states
  const [view, setView] = useState<'login' | 'tenant'>('login');
  const [tenantName, setTenantName] = useState('');
  const [syncingTenant, setSyncingTenant] = useState(false);

  // Load terminals on mount and set initial view based on data availability
  useEffect(() => {
    (async () => {
      const list = await refreshTerminals();
      if (list.length === 0) {
        setView('tenant');
      } else {
        setView('login');
      }
    })();
  }, []);

  // Redirect if logged in
  useEffect(() => {
    if (isLoggedIn) {
      router.replace('/(tabs)/home');
    }
  }, [isLoggedIn]);

  const handlePinChange = (text: string, index: number) => {
    // Only accept numbers
    const cleanText = text.replace(/[^0-9]/g, '');
    const newPin = [...pin];
    newPin[index] = cleanText;
    setPin(newPin);

    if (cleanText.length > 0 && index < 3) {
      // Auto focus next input
      pinRefs[index + 1].current?.focus();
    }
  };

  const handlePinKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && pin[index] === '' && index > 0) {
      // Focus previous input on backspace if current is empty
      pinRefs[index - 1].current?.focus();
    }
  };

  const handleLoginSubmit = async () => {
    if (!selectedStoreId) {
      Alert.alert('Selection Required', 'Please select a branch store.');
      return;
    }
    if (mobile.length < 8) {
      Alert.alert('Invalid Input', 'Please enter a valid mobile number.');
      return;
    }

    const fullPin = pin.join('');
    if (fullPin.length !== 4) {
      Alert.alert('Invalid PIN', 'Please enter a 4-digit security PIN.');
      return;
    }

    setLoading(true);
    try {
      const success = await login(selectedStoreId, mobile, fullPin);
      if (success) {
        router.replace('/(tabs)/home');
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Determine offline badge status (green if offline-ready/has terminals, amber if first-time/no terminals)
  const isOfflineReady = terminals.length > 0;
  const badgeColor = isOfflineReady ? colors.success : '#f39c12';
  const badgeBg = isOfflineReady ? colors.successBg : '#fef5e7';
  const badgeLabel = isOfflineReady ? 'Offline Mode Ready' : 'Online Initial Setup Needed';

  // Find selected terminal details
  const activeStore = stores.find(s => s.id === selectedStoreId);
  const dropdownLabel = activeStore
    ? `${activeStore.store_name}`
    : 'Choose your store';

  if (view === 'tenant') {
    const handleTenantSync = async () => {
      if (!tenantName.trim()) {
        Alert.alert('Name Required', 'Please enter your pharmacy tenant name.');
        return;
      }
      setSyncingTenant(true);
      try {
        const success = await syncTenantByName(tenantName.trim());
        if (success) {
          Alert.alert('Sync Success', 'Pharmacy branches and terminals synced successfully.');
          setView('login');
        } else {
          Alert.alert('Tenant Not Found', 'No pharmacy found with that name. Please check spelling & try again.');
        }
      } catch (err) {
        Alert.alert('Sync Failed', 'Failed to reach cloud database. Please check your internet connection.');
      } finally {
        setSyncingTenant(false);
      }
    };

    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

            <View style={styles.header}>
              <Text style={styles.title}>Baki Rx Ledger</Text>
              <Text style={styles.subtitle}>Tenant Setup & Initialization</Text>
            </View>

            <View style={styles.formCard}>
              <Text style={styles.tenantLabel}>Find Your Pharmacy</Text>
              <Text style={styles.tenantHint}>
                Enter the exact pharmacy business name registered in the admin console.
              </Text>

              <TextInput
                style={styles.input}
                placeholder="e.g. Baki Pharmacy"
                placeholderTextColor={colors.textMuted}
                value={tenantName}
                onChangeText={setTenantName}
                autoCapitalize="words"
              />

              <TouchableOpacity
                style={styles.primaryButton}
                activeOpacity={0.8}
                onPress={handleTenantSync}
                disabled={syncingTenant}
              >
                {syncingTenant ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Search & Sync Data</Text>
                )}
              </TouchableOpacity>

              {terminals.length > 0 && (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  activeOpacity={0.8}
                  onPress={() => setView('login')}
                  disabled={syncingTenant}
                >
                  <Text style={styles.secondaryButtonText}>Back to Login</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                🌐 Online Sync: Downloads configuration from cloud databases.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

          {/* Header branding */}
          <View style={styles.header}>
            <Text style={styles.title}>Baki Rx Ledger</Text>
            <Text style={styles.subtitle}>Pharmacy Credit & Baki Management</Text>
          </View>

          {/* Form Card */}
          <View style={styles.formCard}>

            {/* Offline Badge */}
            <View style={[styles.badge, { backgroundColor: badgeBg }]}>
              <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
              <Text style={[styles.badgeText, { color: badgeColor }]}>
                {badgeLabel}
              </Text>
            </View>

            {/* Dropdown Selector */}
            <Text style={styles.label}>Select Branch Store</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              activeOpacity={0.8}
              onPress={() => setDropdownOpen(!dropdownOpen)}
            >
              <Text style={{ color: selectedStoreId ? colors.textPrimary : colors.textMuted, fontSize: 14 }}>
                {dropdownLabel}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>▼</Text>
            </TouchableOpacity>

            {/* Dropdown Options */}
            {dropdownOpen && (
              <View style={styles.dropdownList}>
                {stores.length === 0 ? (
                  <View style={styles.emptyDropdown}>
                    <Text style={styles.emptyDropdownText}>No stores synced.</Text>
                    <TouchableOpacity
                      style={styles.syncBtn}
                      onPress={async () => {
                        setLoading(true);
                        try {
                          const count = await syncTerminals();
                          if (count === 0) {
                            Alert.alert(
                              'Sync Failed',
                              'No terminals found for this tenant. Please register terminals in the admin panel.'
                            );
                          } else {
                            Alert.alert('Sync Complete', `${count} store terminal(s) synced successfully.`);
                          }
                        } catch (err) {
                          Alert.alert('Sync Failed', 'Please connect to the internet to sync terminals.');
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      <Text style={styles.syncBtnText}>Tap to Sync Terminals</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  stores.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={styles.dropdownOption}
                      onPress={() => {
                        setSelectedStoreId(s.id);
                        setDropdownOpen(false);
                      }}
                    >
                      <Text style={styles.optionText}>
                        <Text style={styles.optionSubText}>{s.store_name}</Text>
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* Mobile Input */}
            <Text style={[styles.label, { marginTop: spacing.lg }]}>Clerk Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 01712345678"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              value={mobile}
              onChangeText={setMobile}
            />

            {/* 4-digit PIN input boxes */}
            <Text style={[styles.label, { marginTop: spacing.lg }]}>4-Digit Security PIN</Text>
            <View style={styles.pinContainer}>
              {pin.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={pinRefs[index]}
                  style={styles.pinBox}
                  maxLength={1}
                  keyboardType="number-pad"
                  secureTextEntry={true}
                  value={digit}
                  onChangeText={(text) => handlePinChange(text, index)}
                  onKeyPress={(e) => handlePinKeyPress(e, index)}
                />
              ))}
            </View>

            {/* Activate Button */}
            <TouchableOpacity
              style={styles.primaryButton}
              activeOpacity={0.8}
              onPress={handleLoginSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryButtonText}>Activate Terminal</Text>
              )}
            </TouchableOpacity>

            {/* Switch Tenant option */}
            <TouchableOpacity onPress={() => setView('tenant')}>
              <Text style={styles.switchTenantText}>Switch Tenant / Pharmacy</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              🔒 Local-First: Data remains on device & syncs in background.
            </Text>
          </View>
        </ScrollView>
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
  scrollContent: {
    padding: spacing.xl,
    justifyContent: 'center',
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.sm,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  dropdownButton: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginTop: spacing.xs,
    overflow: 'hidden',
    elevation: 3,
  },
  dropdownOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  optionSubText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyDropdown: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyDropdownText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  syncBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  syncBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
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
  pinContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing.xs,
  },
  pinBox: {
    width: 60,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  primaryButton: {
    height: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  secondaryButton: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.md,
    backgroundColor: colors.background,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  tenantLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  tenantHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    lineHeight: 18,
  },
  switchTenantText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.lg,
    textDecorationLine: 'underline',
  },
});
