import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Modal,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/context/auth-context';
import { useSync } from '@/context/sync-context';
import { BottomTabInset, Spacing } from '@/constants/theme';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Custom lightweight SVG/Shape Icons for universal platform support
const SyncedIcon = ({ color }: { color: string }) => (
  <View style={[styles.syncedDot, { backgroundColor: color }]} />
);

const BackIcon = ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 20, fontWeight: '700', marginRight: Spacing.two }}>←</Text>
);

const ChevronRight = ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 16, fontWeight: '600' }}>›</Text>
);

const SearchIcon = ({ color }: { color: string }) => (
  <Text style={{ color, fontSize: 16, marginRight: Spacing.two }}>🔍</Text>
);

const WhatsAppIcon = () => (
  <View style={styles.whatsappLogoContainer}>
    <Text style={styles.whatsappText}>💬</Text>
  </View>
);

interface Transaction {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  outstanding: number;
  transactions: Transaction[];
}

export default function HomeScreen() {
  const { isLoggedIn, selectedBranch, mobileNumber, login, logout, storeId, isOfflineMode } = useAuth();
  const { engine, status } = useSync();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // Navigation State inside the tab screen (to handle multiple sub-views seamlessly)
  // 'dashboard' | 'add-transaction' | 'customer-ledger'
  const [currentScreen, setCurrentScreen] = useState<'dashboard' | 'add-transaction' | 'customer-ledger'>('dashboard');

  // SQLite loaded state
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Dynamic Delta Math data loader
  const loadData = useCallback(async () => {
    if (!engine) return;
    try {
      const adapter = (engine as any).adapter;
      if (!adapter) return;

      const customerEntities = await adapter.getAll('customer:');
      const entryEntities = await adapter.getAll('ledger_entry:');

      const allTx = entryEntities.map((e: any) => {
        const d = e.data;
        return {
          id: e.id.replace('ledger_entry:', ''),
          customerId: d.customer_id,
          date: new Date(d.created_at || e.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          description: d.entry_type === 'debit' ? 'Medicine Purchase' : 'Payment Received',
          debit: d.entry_type === 'debit' ? (d.total_amount || 0) : 0,
          credit: d.entry_type === 'credit' ? (d.paid_amount || 0) : (d.paid_amount || 0),
          timestamp: d.created_at || e.updatedAt,
        };
      });

      const customerList: Customer[] = customerEntities.map((c: any) => {
        const d = c.data;
        const custId = c.id.replace('customer:', '');

        // Sort chronologically to compute running balance (Delta Math)
        const custTx = allTx
          .filter((tx: any) => tx.customerId === custId)
          .sort((a: any, b: any) => a.timestamp - b.timestamp);

        let runningBalance = 0;
        const transactionsWithBalance = custTx.map((tx: any) => {
          runningBalance += (tx.debit - tx.credit);
          return {
            ...tx,
            balance: runningBalance,
          };
        });

        // Reserve chronological sequence for displaying recent on top
        const displayTx = [...transactionsWithBalance].reverse();

        return {
          id: custId,
          name: d.name,
          phone: d.phone,
          outstanding: runningBalance,
          transactions: displayTx,
        };
      });

      setCustomers(customerList);
    } catch (err) {
      console.warn('Error loading data from local SQLite database:', err);
    }
  }, [engine]);

  // Load local data on mount and engine load
  useEffect(() => {
    loadData();
  }, [loadData, isLoggedIn]);

  // Re-run database fetch on sync completion events
  useEffect(() => {
    if (!engine) return;
    const handleSync = () => {
      loadData();
    };
    engine.on('sync', handleSync);
    return () => {
      engine.off('sync', handleSync);
    };
  }, [engine, loadData]);

  // Computed today's collections from local ledger entries
  const todayCollections = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startTimestamp = startOfToday.getTime();

    let total = 0;
    for (const c of customers) {
      for (const tx of c.transactions) {
        if ((tx as any).timestamp >= startTimestamp) {
          total += tx.credit;
        }
      }
    }
    return total;
  }, [customers]);

  // Computed Total Outstanding
  const totalBaki = useMemo(() => {
    return customers.reduce((sum, c) => sum + c.outstanding, 0);
  }, [customers]);

  // Login Screen Input State
  const [loginBranch, setLoginBranch] = useState('Choose your terminal');
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const [loginMobile, setLoginMobile] = useState('');
  const [loginPin, setLoginPin] = useState('');

  // Selected Customer in Ledger
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // New Transaction Form State
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [txSelectedCustomerId, setTxSelectedCustomerId] = useState<string | null>(null);
  const [txBillAmount, setTxBillAmount] = useState('');
  const [txPaidAmount, setTxPaidAmount] = useState('');

  // Add Customer Overlay Modal State
  const [addCustModalVisible, setAddCustModalVisible] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  // Dashboard customer filter (Search recent defaulters)
  const [dashboardSearchQuery, setDashboardSearchQuery] = useState('');

  // Colors customized to match screenshots
  const sageGreen = '#8ac0af';
  const forestGreen = '#158160';
  const alertRedBg = '#fae9e9';
  const alertRedText = '#c23b3b';

  // 1 & 2. LOGIN SCREENS IMPLEMENTATION
  if (!isLoggedIn) {
    const handleLoginSubmit = () => {
      if (loginBranch === 'Choose your terminal') {
        Alert.alert('Selection Required', 'Please select a branch terminal.');
        return;
      }
      if (loginMobile.length < 8) {
        Alert.alert('Invalid Input', 'Please enter a valid mobile number.');
        return;
      }
      if (loginPin.length !== 4) {
        Alert.alert('Invalid PIN', 'Please enter a 4-digit security PIN.');
        return;
      }

      login(loginBranch, loginMobile, loginPin);
    };

    const branches = [
      'Dhanmondi Branch Terminal',
      'Gulshan Branch Terminal',
      'Uttara Branch Terminal',
      'Mirpur Branch Terminal',
    ];

    return (
      <View style={[styles.loginContainer, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.loginSafeArea}>
          <ScrollView contentContainerStyle={styles.loginScrollContent}>
            {/* Header branding */}
            <View style={styles.loginHeader}>
              <Text style={[styles.loginTitle, { color: forestGreen }]}>Baki Rx Ledger</Text>
              <Text style={[styles.loginSubtitle, { color: theme.textSecondary }]}>Pharmacy Credit Management</Text>
            </View>

            {/* Form */}
            <View style={styles.loginFormCard}>
              {/* Dropdown Selector */}
              <Text style={[styles.inputLabel, { color: theme.text }]}>Select Branch Terminal</Text>
              <TouchableOpacity
                style={[styles.dropdownButton, { borderColor: theme.backgroundSelected }]}
                activeOpacity={0.8}
                onPress={() => setBranchDropdownOpen(!branchDropdownOpen)}
              >
                <Text style={{ color: loginBranch === 'Choose your terminal' ? theme.textSecondary : theme.text, fontSize: 15 }}>
                  {loginBranch}
                </Text>
                <Text style={{ color: theme.textSecondary }}>▼</Text>
              </TouchableOpacity>

              {/* Branch Selector Options */}
              {branchDropdownOpen && (
                <View style={[styles.dropdownList, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
                  {branches.map((b) => (
                    <TouchableOpacity
                      key={b}
                      style={styles.dropdownOption}
                      onPress={() => {
                        setLoginBranch(b);
                        setBranchDropdownOpen(false);
                      }}
                    >
                      <Text style={{ color: theme.text, fontSize: 14 }}>{b}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Mobile Input */}
              <Text style={[styles.inputLabel, { color: theme.text, marginTop: Spacing.three }]}>Mobile Number</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                placeholder="+880 17XX"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={loginMobile}
                onChangeText={setLoginMobile}
              />

              {/* PIN Input */}
              <Text style={[styles.inputLabel, { color: theme.text, marginTop: Spacing.three }]}>PIN</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                placeholder="Enter 4-digit PIN"
                placeholderTextColor={theme.textSecondary}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={4}
                value={loginPin}
                onChangeText={setLoginPin}
              />

              {/* Activate Button */}
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: sageGreen, marginTop: Spacing.five }]}
                activeOpacity={0.8}
                onPress={handleLoginSubmit}
              >
                <Text style={styles.primaryButtonText}>Activate Terminal</Text>
              </TouchableOpacity>
            </View>

            {/* Offline indicator */}
            <View style={styles.loginFooter}>
              <Text style={[styles.offlineText, { color: theme.textSecondary }]}>
                🔒 Network Safe: Offline Mode Ready
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // Active Customer data retrieval
  const activeCustomer = customers.find((c) => c.id === selectedCustomerId);

  // 3. HOME SCREEN (DASHBOARD)
  if (currentScreen === 'dashboard') {
    const filteredCustomers = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(dashboardSearchQuery.toLowerCase()) ||
        c.phone.includes(dashboardSearchQuery)
    );

    return (
      <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea}>
          {/* Top Bar */}
          <View style={styles.topBar}>
            <View>
              <Text style={[styles.branchTitle, { color: theme.text }]}>
                {selectedBranch.replace(' Terminal', '')}
              </Text>
              <Text style={[styles.terminalSubtitle, { color: theme.textSecondary }]}>Terminal - 1</Text>
            </View>
            <View style={styles.syncedContainer}>
              <SyncedIcon color={isOfflineMode ? "#f39c12" : (status?.pendingChanges && status.pendingChanges > 0 ? "#3498db" : "#2ecc71")} />
              <Text style={[styles.syncedText, { color: isOfflineMode ? "#e67e22" : forestGreen, fontSize: 13, fontWeight: '600' }]}>
                {isOfflineMode
                  ? (status?.pendingChanges && status.pendingChanges > 0 ? `Offline (${status.pendingChanges} pending)` : 'Offline')
                  : (status?.pendingChanges && status.pendingChanges > 0 ? `Syncing (${status.pendingChanges})` : 'Synced')
                }
              </Text>
              <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
                <Text style={{ fontSize: 12, color: theme.textSecondary }}>Log out</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four }}
          >
            {/* KPI Cards Row */}
            <View style={styles.kpiRow}>
              {/* Total Outstanding Card */}
              <View style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Total Baki Outstanding</Text>
                <Text style={[styles.kpiValue, { color: alertRedText }]}>
                  ৳ {totalBaki.toLocaleString()}
                </Text>
              </View>

              {/* Today's Collections Card */}
              <View style={[styles.kpiCard, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.kpiLabel, { color: theme.textSecondary }]}>Today's Collections</Text>
                <Text style={[styles.kpiValue, { color: forestGreen }]}>
                  ৳ {todayCollections.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Quick Action Buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtnSolid, { backgroundColor: sageGreen }]}
                activeOpacity={0.8}
                onPress={() => {
                  setTxSelectedCustomerId(null);
                  setTxSearchQuery('');
                  setTxBillAmount('');
                  setTxPaidAmount('');
                  setCurrentScreen('add-transaction');
                }}
              >
                <Text style={styles.actionBtnSolidText}>New Baki Entry</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtnOutline, { borderColor: sageGreen }]}
                activeOpacity={0.8}
                onPress={() => setAddCustModalVisible(true)}
              >
                <Text style={[styles.actionBtnOutlineText, { color: forestGreen }]}>Add Customer</Text>
              </TouchableOpacity>
            </View>

            {/* Recent Defaulters Header */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent Defaulters</Text>
              <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                {customers.length} customers
              </Text>
            </View>

            {/* Dashboard Search */}
            <View style={[styles.searchContainer, { backgroundColor: theme.backgroundElement }]}>
              <SearchIcon color={theme.textSecondary} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Search by name or phone"
                placeholderTextColor={theme.textSecondary}
                value={dashboardSearchQuery}
                onChangeText={setDashboardSearchQuery}
              />
            </View>

            {/* Defaulter List */}
            <View style={styles.defaulterList}>
              {filteredCustomers.map((cust) => {
                const initials = cust.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase();

                // Determine avatar bg color dynamically
                const avatarColors = ['#f5cd79', '#f78fb3', '#3dc1d3', '#e15f41', '#786fa6', '#778beb'];
                const avatarBg = avatarColors[parseInt(cust.id) % avatarColors.length];

                return (
                  <TouchableOpacity
                    key={cust.id}
                    style={[styles.customerRow, { borderBottomColor: theme.backgroundSelected }]}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedCustomerId(cust.id);
                      setCurrentScreen('customer-ledger');
                    }}
                  >
                    {/* Avatar initials */}
                    <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>

                    {/* Info */}
                    <View style={styles.customerInfo}>
                      <Text style={[styles.customerName, { color: theme.text }]}>{cust.name}</Text>
                      <Text style={[styles.customerPhone, { color: theme.textSecondary }]}>{cust.phone}</Text>
                    </View>

                    {/* Outstanding Balance */}
                    <View style={styles.customerOutstanding}>
                      <Text style={[styles.outstandingAmount, { color: alertRedText }]}>
                        ৳ {cust.outstanding.toLocaleString()}
                      </Text>
                      <ChevronRight color={theme.textSecondary} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* 5. ADD CUSTOMER MODAL / OVERLAY */}
          <Modal
            animationType="slide"
            transparent={true}
            visible={addCustModalVisible}
            onRequestClose={() => setAddCustModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.four }]}>
                <View style={[styles.drawerHandle, { backgroundColor: theme.backgroundSelected }]} />
                <Text style={[styles.modalTitle, { color: theme.text }]}>Add New Customer</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Enter customer details to create new account
                </Text>

                {/* Form fields */}
                <Text style={[styles.inputLabel, { color: theme.text }]}>Customer Name</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                  placeholder="Customer Name"
                  placeholderTextColor={theme.textSecondary}
                  value={newCustName}
                  onChangeText={setNewCustName}
                />

                <Text style={[styles.inputLabel, { color: theme.text, marginTop: Spacing.three }]}>Phone Number</Text>
                <TextInput
                  style={[styles.textInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                  placeholder="e.g., +880 1712-345678"
                  placeholderTextColor={theme.textSecondary}
                  value={newCustPhone}
                  onChangeText={setNewCustPhone}
                  keyboardType="numeric"
                />

                {/* Buttons */}
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: sageGreen, marginTop: Spacing.five }]}
                  activeOpacity={0.8}
                  onPress={async () => {
                    if (!newCustName || !newCustPhone) {
                      Alert.alert('Missing Fields', 'Please enter customer name and phone number.');
                      return;
                    }
                    if (!engine) {
                      Alert.alert('System Error', 'Database/Sync engine is not initialized yet.');
                      return;
                    }
                    try {
                      const customerId = generateUUID();
                      const change = {
                        entityId: `customer:${customerId}`,
                        type: 'create' as const,
                        data: {
                          id: customerId,
                          store_id: storeId,
                          name: newCustName,
                          phone: newCustPhone,
                          updated_at: Date.now(),
                        },
                        createdAt: Date.now(),
                      };

                      await engine.enqueueLocalChange(change);
                      await loadData();

                      setNewCustName('');
                      setNewCustPhone('');
                      setAddCustModalVisible(false);
                      Alert.alert('Success', 'Customer added successfully! (Offline Safe)');
                    } catch (err) {
                      console.error('Add customer error:', err);
                      Alert.alert('Error', 'Failed to save customer locally.');
                    }
                  }}
                >
                  <Text style={styles.primaryButtonText}>Add Customer</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.textButton, { marginTop: Spacing.three }]}
                  onPress={() => {
                    setNewCustName('');
                    setNewCustPhone('');
                    setAddCustModalVisible(false);
                  }}
                >
                  <Text style={[styles.textButtonText, { color: theme.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </SafeAreaView>
      </View>
    );
  }

  // 4. ADD TRANSACTION SCREEN
  if (currentScreen === 'add-transaction') {
    // Math helpers for dynamic display
    const bill = parseFloat(txBillAmount) || 0;
    const paid = parseFloat(txPaidAmount) || 0;
    const due = Math.max(0, bill - paid);

    // Search and filter customer selection list
    const autocompleteCustomers = txSearchQuery
      ? customers.filter(
          (c) =>
            c.name.toLowerCase().includes(txSearchQuery.toLowerCase()) ||
            c.phone.includes(txSearchQuery)
        )
      : [];

    const selectedCust = customers.find((c) => c.id === txSelectedCustomerId);

    const handleSaveTransaction = async () => {
      if (!txSelectedCustomerId) {
        Alert.alert('No Customer', 'Please select a customer for this entry.');
        return;
      }
      if (bill <= 0) {
        Alert.alert('Invalid Amount', 'Please enter a valid bill amount greater than 0.');
        return;
      }
      if (!engine) {
        Alert.alert('System Error', 'Database/Sync engine is not initialized yet.');
        return;
      }

      try {
        const entryId = generateUUID();

        const change = {
          entityId: `ledger_entry:${entryId}`,
          type: 'create' as const,
          data: {
            id: entryId,
            store_id: storeId,
            customer_id: txSelectedCustomerId,
            total_amount: bill,
            paid_amount: paid,
            due_amount: due,
            entry_type: 'debit',
            created_at: Date.now(),
          },
          createdAt: Date.now(),
        };

        await engine.enqueueLocalChange(change);
        await loadData();

        Alert.alert('Success', 'Credit entry saved successfully! (Offline Safe)');
        setCurrentScreen('dashboard');
      } catch (err) {
        console.error('Save transaction error:', err);
        Alert.alert('Error', 'Failed to save entry locally.');
      }
    };

    return (
      <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setCurrentScreen('dashboard')} style={styles.backButton}>
              <BackIcon color={theme.text} />
              <Text style={[styles.headerTitle, { color: theme.text }]}>New Baki Entry</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.formContainer}>
            {/* Customer Search Selector */}
            <Text style={[styles.inputLabel, { color: theme.text }]}>Select Customer</Text>
            {selectedCust ? (
              <View style={[styles.selectedCustCard, { backgroundColor: theme.backgroundElement, borderColor: sageGreen }]}>
                <View>
                  <Text style={[styles.selectedCustName, { color: theme.text }]}>{selectedCust.name}</Text>
                  <Text style={[styles.selectedCustPhone, { color: theme.textSecondary }]}>{selectedCust.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => setTxSelectedCustomerId(null)}>
                  <Text style={{ color: alertRedText, fontWeight: '600' }}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ zIndex: 10 }}>
                <View style={[styles.searchContainer, { backgroundColor: theme.backgroundElement }]}>
                  <SearchIcon color={theme.textSecondary} />
                  <TextInput
                    style={[styles.searchInput, { color: theme.text }]}
                    placeholder="Search customer by name or phone"
                    placeholderTextColor={theme.textSecondary}
                    value={txSearchQuery}
                    onChangeText={setTxSearchQuery}
                  />
                </View>

                {/* Autocomplete List */}
                {txSearchQuery.length > 0 && autocompleteCustomers.length > 0 && (
                  <View style={[styles.autocompleteContainer, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}>
                    {autocompleteCustomers.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.autocompleteItem, { borderBottomColor: theme.backgroundSelected }]}
                        onPress={() => {
                          setTxSelectedCustomerId(c.id);
                          setTxSearchQuery('');
                        }}
                      >
                        <Text style={[styles.autocompleteText, { color: theme.text }]}>
                          {c.name} ({c.phone})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Transaction Details */}
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: Spacing.four, marginBottom: Spacing.two }]}>
              Transaction Details
            </Text>

            <View style={[styles.transactionDetailsCard, { backgroundColor: theme.backgroundElement }]}>
              {/* Bill Amount */}
              <Text style={[styles.inputLabel, { color: theme.text }]}>Total Bill Amount (৳)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.background, color: theme.text, marginTop: Spacing.one }]}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={txBillAmount}
                onChangeText={setTxBillAmount}
              />

              {/* Paid Amount */}
              <Text style={[styles.inputLabel, { color: theme.text, marginTop: Spacing.three }]}>Paid Amount (৳)</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: theme.background, color: theme.text, marginTop: Spacing.one }]}
                placeholder="0.00"
                placeholderTextColor={theme.textSecondary}
                keyboardType="numeric"
                value={txPaidAmount}
                onChangeText={setTxPaidAmount}
              />

              {/* Due Balance Calculation */}
              <View style={[styles.dueBalanceCard, { backgroundColor: alertRedBg }]}>
                <Text style={{ color: alertRedText, fontWeight: '600' }}>Due Balance</Text>
                <Text style={{ color: alertRedText, fontWeight: '700', fontSize: 20 }}>
                  ৳ {due.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </Text>
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: sageGreen, marginTop: Spacing.five }]}
              activeOpacity={0.8}
              onPress={handleSaveTransaction}
            >
              <Text style={styles.primaryButtonText}>💾 Save Entry (Offline Safe)</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // 6. CUSTOMER LEDGER DETAIL SCREEN
  if (currentScreen === 'customer-ledger') {
    if (!activeCustomer) {
      setCurrentScreen('dashboard');
      return null;
    }

    const initials = activeCustomer.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const handleCollectCash = () => {
      Alert.prompt(
        'Collect Cash',
        `Enter cash amount collected from ${activeCustomer.name}:`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Collect',
            onPress: async (val?: string) => {
              const amount = parseFloat(val || '0');
              if (isNaN(amount) || amount <= 0) {
                Alert.alert('Error', 'Please enter a valid amount.');
                return;
              }
              if (!engine) {
                Alert.alert('System Error', 'Database/Sync engine is not initialized yet.');
                return;
              }

              try {
                const entryId = generateUUID();

                const change = {
                  entityId: `ledger_entry:${entryId}`,
                  type: 'create' as const,
                  data: {
                    id: entryId,
                    store_id: storeId,
                    customer_id: activeCustomer.id,
                    total_amount: 0,
                    paid_amount: amount,
                    due_amount: 0,
                    entry_type: 'credit',
                    created_at: Date.now(),
                  },
                  createdAt: Date.now(),
                };

                await engine.enqueueLocalChange(change);
                await loadData();

                Alert.alert('Collected', `Successfully collected ৳ ${amount.toLocaleString()}! (Offline Safe)`);
              } catch (err) {
                console.error('Collect cash error:', err);
                Alert.alert('Error', 'Failed to save payment locally.');
              }
            },
          },
        ],
        'plain-text',
        '',
        'number-pad'
      );
    };

    const handleWhatsAppShare = () => {
      const msg = `Hello ${activeCustomer.name}, your total outstanding dues at ${selectedBranch.replace(' Terminal', '')} is ৳ ${activeCustomer.outstanding.toLocaleString()}. Please clear it as soon as possible. Thank you.`;
      if (Platform.OS === 'web') {
        window.open(`https://wa.me/${activeCustomer.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
      } else {
        Alert.alert('WhatsApp Reminder Generated', msg);
      }
    };

    return (
      <View style={[styles.mainContainer, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.safeArea}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setCurrentScreen('dashboard')} style={styles.backButton}>
              <BackIcon color={theme.text} />
              <Text style={[styles.headerTitle, { color: theme.text }]}>Back</Text>
            </TouchableOpacity>
          </View>

          {/* Profile Summary Card */}
          <View style={[styles.profileCard, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.profileMainRow}>
              {/* Initials Avatar */}
              <View style={[styles.avatarLarge, { backgroundColor: sageGreen }]}>
                <Text style={styles.avatarLargeText}>{initials}</Text>
              </View>

              <View style={styles.profileDetails}>
                <Text style={[styles.profileName, { color: theme.text }]}>{activeCustomer.name}</Text>
                <Text style={[styles.profilePhone, { color: theme.textSecondary }]}>{activeCustomer.phone}</Text>
              </View>
            </View>

            {/* Total Due Amount box */}
            <View style={[styles.dueBox, { backgroundColor: alertRedBg }]}>
              <Text style={[styles.dueLabel, { color: alertRedText }]}>Total Due</Text>
              <Text style={[styles.dueAmountLarge, { color: alertRedText }]}>
                ৳ {activeCustomer.outstanding.toLocaleString()}
              </Text>
            </View>

            {/* Action Row */}
            <View style={styles.ledgerActionRow}>
              <TouchableOpacity
                style={[styles.whatsappBtn, { borderColor: '#2ecc71' }]}
                activeOpacity={0.8}
                onPress={handleWhatsAppShare}
              >
                <WhatsAppIcon />
                <Text style={styles.whatsappBtnText}>WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.collectCashBtn, { backgroundColor: sageGreen }]}
                activeOpacity={0.8}
                onPress={handleCollectCash}
              >
                <Text style={styles.collectCashBtnText}>Collect Cash</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Transaction History Section */}
          <Text style={[styles.sectionTitle, { color: theme.text, marginHorizontal: Spacing.four, marginTop: Spacing.four }]}>
            Transaction History
          </Text>

          {/* Ledger Table Headers */}
          <View style={[styles.tableHeader, { borderBottomColor: theme.backgroundSelected }]}>
            <Text style={[styles.colHeader, { flex: 1.5, color: theme.textSecondary }]}>Date</Text>
            <Text style={[styles.colHeader, { flex: 3.5, color: theme.textSecondary }]}>Description</Text>
            <Text style={[styles.colHeader, { flex: 2, textAlign: 'right', color: theme.textSecondary }]}>Debit</Text>
            <Text style={[styles.colHeader, { flex: 2, textAlign: 'right', color: theme.textSecondary }]}>Credit</Text>
            <Text style={[styles.colHeader, { flex: 2.5, textAlign: 'right', color: theme.textSecondary }]}>Balance</Text>
          </View>

          {/* Ledger History List */}
          <ScrollView contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four }}>
            {activeCustomer.transactions.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={{ color: theme.textSecondary }}>No transactions found.</Text>
              </View>
            ) : (
              activeCustomer.transactions.map((tx) => (
                <View key={tx.id} style={[styles.tableRow, { borderBottomColor: theme.backgroundSelected }]}>
                  {/* Date */}
                  <Text style={[styles.rowText, { flex: 1.5, color: theme.text }]}>{tx.date}</Text>

                  {/* Description */}
                  <Text style={[styles.rowText, { flex: 3.5, color: theme.text }]} numberOfLines={1}>
                    {tx.description}
                  </Text>

                  {/* Debit (+) */}
                  <Text style={[styles.rowText, { flex: 2, textAlign: 'right', color: tx.debit > 0 ? alertRedText : theme.textSecondary }]}>
                    {tx.debit > 0 ? `+${tx.debit.toLocaleString()}` : '-'}
                  </Text>

                  {/* Credit (-) */}
                  <Text style={[styles.rowText, { flex: 2, textAlign: 'right', color: tx.credit > 0 ? forestGreen : theme.textSecondary }]}>
                    {tx.credit > 0 ? `-${tx.credit.toLocaleString()}` : '-'}
                  </Text>

                  {/* Running Balance */}
                  <Text style={[styles.rowText, { flex: 2.5, textAlign: 'right', fontWeight: '600', color: theme.text }]}>
                    {tx.balance.toLocaleString()}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  // Global Styles
  mainContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },

  // 1 & 2. Login Screen styles
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    bottom: -150, // Overlays tab navigator to block touch events completely
    left: 0,
    right: 0,
    zIndex: 10000,
  },
  loginSafeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
  },
  loginScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.five,
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  loginSubtitle: {
    fontSize: 15,
    marginTop: Spacing.half,
  },
  loginFormCard: {
    alignSelf: 'stretch',
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.one,
  },
  textInput: {
    height: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 15,
    fontWeight: '500',
  },
  dropdownButton: {
    height: 48,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownList: {
    marginTop: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownOption: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  primaryButton: {
    height: 48,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  textButton: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  textButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  loginFooter: {
    alignItems: 'center',
    marginTop: Spacing.five,
  },
  offlineText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // 3. Home Screen / Dashboard Styles
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  branchTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  terminalSubtitle: {
    fontSize: 12,
    marginTop: Spacing.half,
  },
  syncedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.one,
  },
  syncedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  logoutBtn: {
    marginLeft: Spacing.two,
    padding: Spacing.one,
  },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  kpiCard: {
    flex: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: Spacing.one,
  },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  actionBtnSolid: {
    flex: 1,
    height: 44,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnSolidText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  actionBtnOutline: {
    flex: 1,
    height: 44,
    borderRadius: Spacing.two,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnOutlineText: {
    fontWeight: '700',
    fontSize: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.five,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.four,
    marginTop: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  defaulterList: {
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  avatarText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  customerPhone: {
    fontSize: 12,
    marginTop: Spacing.half,
  },
  customerOutstanding: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  outstandingAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginRight: Spacing.two,
  },

  // 4. Add Transaction Screen Styles
  formContainer: {
    padding: Spacing.four,
  },
  selectedCustCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1.5,
    marginTop: Spacing.one,
  },
  selectedCustName: {
    fontSize: 15,
    fontWeight: '700',
  },
  selectedCustPhone: {
    fontSize: 12,
    marginTop: Spacing.half,
  },
  autocompleteContainer: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    marginTop: Spacing.one,
    overflow: 'hidden',
  },
  autocompleteItem: {
    padding: Spacing.three,
    borderBottomWidth: 1,
  },
  autocompleteText: {
    fontSize: 14,
    fontWeight: '500',
  },
  transactionDetailsCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  dueBalanceCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Spacing.two,
    marginTop: Spacing.four,
  },

  // 5. Add Customer Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 600,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  drawerHandle: {
    width: 40,
    height: 5,
    borderRadius: 2.5,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 13,
    marginTop: Spacing.one,
    marginBottom: Spacing.four,
  },

  // 6. Customer Ledger Styles
  profileCard: {
    margin: Spacing.four,
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  profileMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarLarge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
  },
  avatarLargeText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  profileDetails: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
  },
  profilePhone: {
    fontSize: 13,
    marginTop: Spacing.half,
  },
  dueBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    height: 48,
    borderRadius: Spacing.two,
    marginTop: Spacing.four,
  },
  dueLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  dueAmountLarge: {
    fontSize: 18,
    fontWeight: '700',
  },
  ledgerActionRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: Spacing.four,
  },
  whatsappBtn: {
    flex: 1,
    height: 40,
    borderRadius: Spacing.two,
    borderWidth: 1.5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
  },
  whatsappLogoContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  whatsappText: {
    fontSize: 16,
  },
  whatsappBtnText: {
    color: '#2ecc71',
    fontWeight: '700',
    fontSize: 14,
  },
  collectCashBtn: {
    flex: 1,
    height: 40,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectCashBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    marginTop: Spacing.two,
  },
  colHeader: {
    fontSize: 12,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  rowText: {
    fontSize: 13,
    fontWeight: '500',
  },
  emptyContainer: {
    padding: Spacing.six,
    alignItems: 'center',
  },
});
