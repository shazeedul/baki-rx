import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { storeQueries, StoreRow } from '../db/queries/stores';
import { tenantQueries } from '../db/queries/tenants';
import { terminalQueries, TerminalRow } from '../db/queries/terminals';
import { initDatabase } from '../db/schema';
import { clearLocalSession, getLocalSession, saveLocalSession } from '../storage/auth-storage';
import { supabase } from '../sync/supabase-client';
import { syncEngineInstance } from '../sync/SyncEngine';

import { cloudAdapter } from '../services/cloudAdapter';
import { verifyPin, simpleSHA256, LOCAL_CRYPT_SALT } from '../services/crypto';

type AuthContextType = {
  isLoggedIn: boolean;
  selectedBranch: string;
  mobileNumber: string;
  storeId: string;
  tenantId: string;
  isOfflineMode: boolean;
  isLoading: boolean;
  terminals: TerminalRow[];
  stores: StoreRow[];
  refreshTerminals: () => Promise<TerminalRow[]>;
  syncTerminals: () => Promise<number>;
  syncTenantByName: (tenantName: string) => Promise<boolean>;
  login: (storeId: string, mobile: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function isNetworkConnected(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && navigator.onLine;
  }
  const state = await NetInfo.fetch();
  return !!state.isConnected;
}

async function getActiveTenantId(): Promise<string> {
  try {
    const list = await tenantQueries.getAllTenants();
    if (list && list.length > 0) {
      return list[0].id;
    }
  } catch (e) {
    console.warn('Failed to read local tenants:', e);
  }
  return process.env.EXPO_PUBLIC_TENANT_ID || '00000000-0000-0000-0000-000000000000';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('Choose your terminal');
  const [mobileNumber, setMobileNumber] = useState('');
  const [storeId, setStoreId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [terminals, setTerminals] = useState<TerminalRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);

  const refreshTerminals = async (): Promise<TerminalRow[]> => {
    try {
      await initDatabase();
      const list = await terminalQueries.getAllTerminals();
      setTerminals(list);

      const activeTenantId = await getActiveTenantId();
      const storeList = await storeQueries.getStoresByTenant(activeTenantId);
      setStores(storeList);

      return list;
    } catch (err) {
      console.warn('Failed to load terminals from database:', err);
      return [];
    }
  };

  // Restore session and load terminals on startup
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        let list = await refreshTerminals();

        const activeTenantId = await getActiveTenantId();
        const localTenants = await tenantQueries.getAllTenants();
        const localStores = await storeQueries.getStoresByTenant(activeTenantId);

        // Auto-sync tenants, stores, and terminals on launch if local DB has no stores & tenants data, and device is online
        if (localTenants.length === 0 && localStores.length === 0) {
          const connected = await isNetworkConnected();
          if (connected) {
            try {
              await syncEngineInstance.syncTenants();
              await syncEngineInstance.syncStores(activeTenantId);
              await syncEngineInstance.syncTerminals(activeTenantId);
              list = await refreshTerminals();
            } catch (syncErr) {
              console.warn('Auto initial configuration sync from cloud failed:', syncErr);
            }
          }
        }

        const session = await getLocalSession();
        if (session) {
          setSelectedBranch(session.branch);
          setMobileNumber(session.mobile);
          setStoreId(session.storeId);
          setTenantId(session.tenantId);
          setIsLoggedIn(true);

          const connected = await isNetworkConnected();
          setIsOfflineMode(!connected);
        }
      } catch (err) {
        console.warn('Failed to restore offline session:', err);
      } finally {
        setIsLoading(false);
      }
    })();

    // Listen to network changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOfflineMode(!state.isConnected);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const login = async (loginStoreId: string, mobile: string, pin: string): Promise<boolean> => {
    if (!loginStoreId || mobile.length < 8 || pin.length !== 4) {
      return false;
    }

    const inputPinHash = simpleSHA256(pin + LOCAL_CRYPT_SALT);

    // 1. Query local terminals table
    let terminal = await terminalQueries.getTerminalByPhoneAndStore(mobile, loginStoreId);
    console.log('Local terminal lookup result:', terminal);

    if (terminal) {
      // Verify PIN
      if (verifyPin(pin, terminal.pin_hash)) {
        const branchDisplay = `${terminal.branch_name} (${terminal.store_name})`;
        await saveLocalSession({
          branch: branchDisplay,
          mobile,
          storeId: terminal.store_id,
          tenantId: terminal.tenant_id,
          pinHash: inputPinHash,
        });
        setSelectedBranch(branchDisplay);
        setMobileNumber(mobile);
        setStoreId(terminal.store_id);
        setTenantId(terminal.tenant_id);
        setIsLoggedIn(true);
        const connected = await isNetworkConnected();
        setIsOfflineMode(!connected);
        return true;
      } else {
        Alert.alert('Incorrect PIN', 'Please try again.');
        return false;
      }
    } else {
      Alert.alert(
        'Authentication Error',
        'Terminal not found on this device. Please check your credentials or sync terminal data.'
      );
      return false;
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut().catch(() => undefined);
      await clearLocalSession();
    } catch (e) {
      console.warn('Clear session error', e);
    }
    setIsLoggedIn(false);
    setSelectedBranch('Choose your terminal');
    setMobileNumber('');
    setStoreId('');
    setTenantId('');
    setIsOfflineMode(false);
  };

  const syncTerminals = async (): Promise<number> => {
    try {
      const activeTenantId = await getActiveTenantId();
      await syncEngineInstance.syncTenants();
      await syncEngineInstance.syncStores(activeTenantId);
      await syncEngineInstance.syncTerminals(activeTenantId);
      const list = await refreshTerminals();
      return list.length;
    } catch (err) {
      console.error('Failed to sync remote terminals:', err);
      throw err;
    }
  };

  const syncTenantByName = async (tenantName: string): Promise<boolean> => {
    try {
      const tenant = await cloudAdapter.getTenantByName(tenantName);
      if (!tenant) {
        return false;
      }

      // Clear any old tenant configuration dynamically if switching
      const db = require('../db/schema').getDatabase();
      await db.runAsync('DELETE FROM tenants;');
      await db.runAsync('DELETE FROM stores;');
      await db.runAsync('DELETE FROM terminals;');

      // Upsert the tenant locally
      await tenantQueries.upsertTenants([{
        id: tenant.id,
        business_name: tenant.business_name,
        created_at: tenant.created_at || new Date().toISOString()
      }]);

      // Sync stores and terminals for this tenant id
      await syncEngineInstance.syncStores(tenant.id);
      console.log(`All stores after upsert:`, await storeQueries.getStoresByTenant(tenant.id));
      await syncEngineInstance.syncTerminals(tenant.id);

      // Refresh terminals so dropdown has them
      await refreshTerminals();
      return true;
    } catch (err) {
      console.error('Failed to sync tenant by name:', err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        selectedBranch,
        mobileNumber,
        storeId,
        tenantId,
        isOfflineMode,
        isLoading,
        terminals,
        stores,
        refreshTerminals,
        syncTerminals,
        syncTenantByName,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

