import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '../sync/supabase-client';
import { saveLocalSession, getLocalSession, clearLocalSession } from '../storage/auth-storage';
import { terminalQueries, TerminalRow } from '../db/queries/terminals';
import { syncEngineInstance } from '../sync/SyncEngine';
import { initDatabase } from '../db/schema';

const LOCAL_CRYPT_SALT = process.env.EXPO_PUBLIC_LOCAL_CRYPT_SALT || 'baki-rx-secure-salt-value-12938102';

type AuthContextType = {
  isLoggedIn: boolean;
  selectedBranch: string;
  mobileNumber: string;
  storeId: string;
  tenantId: string;
  isOfflineMode: boolean;
  isLoading: boolean;
  terminals: TerminalRow[];
  refreshTerminals: () => Promise<void>;
  login: (storeId: string, mobile: string, pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Pure JS/TS SHA-256 for cross-platform stability (Android, iOS, Web)
function simpleSHA256(str: string): string {
  const chrsz = 8;
  const hexcase = 0;
  function safe_add(x: number, y: number) {
    const lsw = (x & 0xFFFF) + (y & 0xFFFF);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xFFFF);
  }
  function S(X: number, n: number) { return (X >>> n) | (X << (32 - n)); }
  function R(X: number, n: number) { return (X >>> n); }
  function Ch(x: number, y: number, z: number) { return ((x & y) ^ (~x & z)); }
  function Maj(x: number, y: number, z: number) { return ((x & y) ^ (x & z) ^ (y & z)); }
  function Sigma0256(x: number) { return (S(x, 2) ^ S(x, 13) ^ S(x, 22)); }
  function Sigma1256(x: number) { return (S(x, 6) ^ S(x, 11) ^ S(x, 25)); }
  function gamma0256(x: number) { return (S(x, 7) ^ S(x, 18) ^ R(x, 3)); }
  function gamma1256(x: number) { return (S(x, 17) ^ S(x, 19) ^ R(x, 10)); }
  function core_sha256(m: number[], l: number) {
    const K = [
      0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
      0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
      0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
      0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
      0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
      0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
      0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
      0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
    ];
    const HASH = [
      0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19
    ];
    const W = new Array(64);
    let a, b, c, d, e, f, g, h, i, j;
    let T1, T2;
    m[l >> 5] |= 0x80 << (24 - l % 32);
    m[((l + 64 >> 9) << 4) + 15] = l;
    for (i = 0; i < m.length; i += 16) {
      a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3]; e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];
      for (j = 0; j < 64; j++) {
        if (j < 16) W[j] = m[j + i];
        else W[j] = safe_add(safe_add(safe_add(gamma1256(W[j - 2]), W[j - 7]), gamma0256(W[j - 15])), W[j - 16]);
        T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
        T2 = safe_add(Sigma0256(a), Maj(a, b, c));
        h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
      }
      HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
      HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
    }
    return HASH;
  }
  function str2binb(str: string) {
    const bin: number[] = [];
    const mask = (1 << chrsz) - 1;
    for (let i = 0; i < str.length * chrsz; i += chrsz) {
      bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
    }
    return bin;
  }
  function binb2hex(binarray: number[]) {
    const hex_tab = hexcase ? '0123456789ABCDEF' : '0123456789abcdef';
    let str = '';
    for (let i = 0; i < binarray.length * 4; i++) {
      str += hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) +
        hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
    }
    return str;
  }
  return binb2hex(core_sha256(str2binb(str), str.length * chrsz));
}

async function isNetworkConnected(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' && navigator.onLine;
  }
  const state = await NetInfo.fetch();
  return !!state.isConnected;
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

  const refreshTerminals = async () => {
    try {
      await initDatabase();
      const list = await terminalQueries.getAllTerminals();
      setTerminals(list);
      
      // Auto seed mock terminals if none exist (for development/web ease)
      const isMockSupabase = !process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL.includes('mock');
      if (list.length === 0 && isMockSupabase) {
        const mockTerminals: TerminalRow[] = [
          { id: 't1', store_id: 'dhanmondi-store-id', tenant_id: 'baki-tenant-id', store_name: 'Baki Rx Dhanmondi', branch_name: 'Dhanmondi Terminal', pin_hash: simpleSHA256('1234' + LOCAL_CRYPT_SALT), jwt_cache: null, created_at: new Date().toISOString() },
          { id: 't2', store_id: 'gulshan-store-id', tenant_id: 'baki-tenant-id', store_name: 'Baki Rx Gulshan', branch_name: 'Gulshan Terminal', pin_hash: simpleSHA256('1234' + LOCAL_CRYPT_SALT), jwt_cache: null, created_at: new Date().toISOString() },
          { id: 't3', store_id: 'uttara-store-id', tenant_id: 'baki-tenant-id', store_name: 'Baki Rx Uttara', branch_name: 'Uttara Terminal', pin_hash: simpleSHA256('1234' + LOCAL_CRYPT_SALT), jwt_cache: null, created_at: new Date().toISOString() },
          { id: 't4', store_id: 'mirpur-store-id', tenant_id: 'baki-tenant-id', store_name: 'Baki Rx Mirpur', branch_name: 'Mirpur Terminal', pin_hash: simpleSHA256('1234' + LOCAL_CRYPT_SALT), jwt_cache: null, created_at: new Date().toISOString() }
        ];
        await terminalQueries.upsertTerminals(mockTerminals);
        const updated = await terminalQueries.getAllTerminals();
        setTerminals(updated);
      }
    } catch (err) {
      console.warn('Failed to load terminals from database:', err);
    }
  };

  // Restore session and load terminals on startup
  useEffect(() => {
    (async () => {
      try {
        await initDatabase();
        await refreshTerminals();
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
    
    if (terminal) {
      // Verify PIN
      if (inputPinHash === terminal.pin_hash) {
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
    }

    // 2. Terminal ROW NOT FOUND - check connectivity
    const connected = await isNetworkConnected();
    if (!connected) {
      Alert.alert(
        'Offline Mode Error',
        'Terminal not found on this device.\nConnect to internet to sync your terminal data. Please try again to login.'
      );
      return false;
    }

    // 3. ONLINE - call SyncEngine.syncTerminals(tenantId)
    try {
      const activeTenantId = process.env.EXPO_PUBLIC_TENANT_ID || 'baki-tenant-id';
      await syncEngineInstance.syncTerminals(activeTenantId);
      await refreshTerminals();

      // Retry local lookup
      terminal = await terminalQueries.getTerminalByPhoneAndStore(mobile, loginStoreId);
      if (terminal) {
        // Verify PIN
        if (inputPinHash === terminal.pin_hash) {
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
          setIsOfflineMode(false);
          return true;
        } else {
          Alert.alert('Incorrect PIN', 'Please try again.');
          return false;
        }
      } else {
        Alert.alert(
          'Authentication Error',
          'Terminal not registered. Contact your administrator.'
        );
        return false;
      }
    } catch (err) {
      Alert.alert(
        'Connection Error',
        'Could not reach server. Please try again.'
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
        refreshTerminals,
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

