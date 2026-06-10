import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { storeQueries, StoreRow } from '../db/queries/stores';
import { tenantQueries } from '../db/queries/tenants';
import { userQueries, UserRow } from '../db/queries/users';
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
  users: UserRow[];
  stores: StoreRow[];
  refreshUsers: () => Promise<UserRow[]>;
  syncUsers: () => Promise<number>;
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
  const [selectedBranch, setSelectedBranch] = useState('Choose your user');
  const [mobileNumber, setMobileNumber] = useState('');
  const [storeId, setStoreId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);

  const refreshUsers = async (): Promise<UserRow[]> => {
    try {
      await initDatabase();
      const list = await userQueries.getAllUsers();
      setUsers(list);

      const activeTenantId = await getActiveTenantId();
      const storeList = await storeQueries.getStoresByTenant(activeTenantId);
      setStores(storeList);

      return list;
    } catch (err) {
      console.warn('Failed to load users from database:', err);
      return [];
    }
  };

  // Restore session and load users on startup
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        let list = await refreshUsers();

        const activeTenantId = await getActiveTenantId();
        const localTenants = await tenantQueries.getAllTenants();
        const localStores = await storeQueries.getStoresByTenant(activeTenantId);

        // Auto-sync tenants, stores, and users on launch if local DB has no stores & tenants data, and device is online
        if (localTenants.length === 0 && localStores.length === 0) {
          const connected = await isNetworkConnected();
          if (connected) {
            try {
              await syncEngineInstance.syncTenants();
              await syncEngineInstance.syncStores(activeTenantId);
              await syncEngineInstance.syncUsers(activeTenantId);
              list = await refreshUsers();
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

    // 1. Query local users table
    let user = await userQueries.getUserByPhoneAndStore(mobile, loginStoreId);
    console.log('Local user lookup result:', user);

    if (user) {
      // Verify PIN
      if (verifyPin(pin, user.pin_hash)) {
        const branchDisplay = `${user.branch_name} (${user.store_name})`;
        await saveLocalSession({
          branch: branchDisplay,
          mobile,
          storeId: user.store_id,
          tenantId: user.tenant_id,
          pinHash: inputPinHash,
        });
        setSelectedBranch(branchDisplay);
        setMobileNumber(mobile);
        setStoreId(user.store_id);
        setTenantId(user.tenant_id);
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
        'User not found on this device. Please check your credentials or sync user data.'
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
    setSelectedBranch('Choose your user');
    setMobileNumber('');
    setStoreId('');
    setTenantId('');
    setIsOfflineMode(false);
  };

  const syncUsers = async (): Promise<number> => {
    try {
      const activeTenantId = await getActiveTenantId();
      await syncEngineInstance.syncTenants();
      await syncEngineInstance.syncStores(activeTenantId);
      await syncEngineInstance.syncUsers(activeTenantId);
      const list = await refreshUsers();
      return list.length;
    } catch (err) {
      console.error('Failed to sync remote users:', err);
      throw err;
    }
  };

  const syncTenantByName = async (tenantName: string): Promise<boolean> => {
    try {
      console.log('syncTenantByName: starting sync for', tenantName);
      
      // Ensure database is initialized and migrated
      try {
        await initDatabase();
        console.log('syncTenantByName: db init/migration complete');
      } catch (dbInitErr) {
        console.error('syncTenantByName: initDatabase failed:', dbInitErr);
        throw dbInitErr;
      }

      const tenant = await cloudAdapter.getTenantByName(tenantName);
      if (!tenant) {
        console.log('syncTenantByName: tenant not found in cloud');
        return false;
      }
      console.log('syncTenantByName: found tenant:', tenant);

      const db = require('../db/schema').getDatabase();

      // Clear any old tenant configuration dynamically if switching
      try {
        console.log('syncTenantByName: clearing tenants table');
        await db.runAsync('DELETE FROM tenants;');
      } catch (err: any) {
        console.error('syncTenantByName: DELETE FROM tenants failed:', err);
        console.error('Details:', err?.message || err);
        throw err;
      }

      try {
        console.log('syncTenantByName: clearing stores table');
        await db.runAsync('DELETE FROM stores;');
      } catch (err: any) {
        console.error('syncTenantByName: DELETE FROM stores failed:', err);
        console.error('Details:', err?.message || err);
        throw err;
      }

      try {
        console.log('syncTenantByName: clearing users table');
        await db.runAsync('DELETE FROM users;');
      } catch (err: any) {
        console.error('syncTenantByName: DELETE FROM users failed:', err);
        console.error('Details:', err?.message || err);
        throw err;
      }

      // Upsert the tenant locally
      try {
        console.log('syncTenantByName: upserting tenant locally');
        await tenantQueries.upsertTenants([{
          id: tenant.id,
          business_name: tenant.business_name,
          created_at: tenant.created_at || new Date().toISOString()
        }]);
      } catch (err: any) {
        console.error('syncTenantByName: upsertTenants failed:', err);
        console.error('Details:', err?.message || err);
        throw err;
      }

      // Sync stores and users for this tenant id
      try {
        console.log('syncTenantByName: syncing stores from cloud');
        await syncEngineInstance.syncStores(tenant.id);
      } catch (err: any) {
        console.error('syncTenantByName: syncStores failed:', err);
        console.error('Details:', err?.message || err);
        throw err;
      }

      try {
        console.log('syncTenantByName: checking stores in local DB');
        console.log(`All stores after upsert:`, await storeQueries.getStoresByTenant(tenant.id));
      } catch (err: any) {
        console.warn('syncTenantByName: getStoresByTenant check failed:', err);
      }

      try {
        console.log('syncTenantByName: syncing users from cloud');
        await syncEngineInstance.syncUsers(tenant.id);
      } catch (err: any) {
        console.error('syncTenantByName: syncUsers failed:', err);
        console.error('Details:', err?.message || err);
        throw err;
      }

      // Refresh users so dropdown has them
      try {
        console.log('syncTenantByName: refreshing local users list');
        await refreshUsers();
      } catch (err: any) {
        console.error('syncTenantByName: refreshUsers failed:', err);
        console.error('Details:', err?.message || err);
        throw err;
      }

      console.log('syncTenantByName: successfully completed sync');
      return true;
    } catch (err: any) {
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
        users,
        stores,
        refreshUsers,
        syncUsers,
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

