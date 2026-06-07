import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { syncEngineInstance, SyncEngine, SyncEngineStatus } from '../sync/SyncEngine';
import { useAuth } from './auth-context';

type SyncContextType = {
  engine: SyncEngine;
  status: SyncEngineStatus;
  syncAll: () => Promise<void>;
  syncTerminals: (tenantId: string) => Promise<void>;
};

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { isLoggedIn, storeId } = useAuth();
  const [status, setStatus] = useState<SyncEngineStatus>(syncEngineInstance.getStatus());

  // 1. Initialize Sync Engine and subscribe to status changes
  useEffect(() => {
    // Start the engine
    syncEngineInstance.start(storeId || undefined).catch(err => {
      console.warn('Failed to start sync engine:', err);
    });

    // Subscribe to status changes
    const unsubscribe = syncEngineInstance.on((s) => {
      setStatus(s);
    });

    return () => {
      unsubscribe();
      syncEngineInstance.stop().catch(() => undefined);
    };
  }, [storeId]);

  // 2. Trigger Initial Sync on Login
  useEffect(() => {
    if (isLoggedIn && storeId) {
      // Immediately run sync cycle upon login activation
      syncEngineInstance.syncAll(storeId).catch((e) => {
        console.warn('Initial background sync failed:', e);
      });
    }
  }, [isLoggedIn, storeId]);

  // 3. Setup Network Listener to trigger Sync Loops on Connection Restored
  useEffect(() => {
    if (!isLoggedIn || !storeId) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        console.log('SyncContext: Network connected, triggering push/pull');
        syncEngineInstance.syncAll(storeId).catch((e) => {
          console.warn('Sync push/pull failed on connection restore:', e);
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isLoggedIn, storeId]);

  const syncAll = async () => {
    if (storeId) {
      await syncEngineInstance.syncAll(storeId);
    }
  };

  const syncTerminals = async (tenantId: string) => {
    await syncEngineInstance.syncTerminals(tenantId);
  };

  const value = useMemo(() => ({
    engine: syncEngineInstance,
    status,
    syncAll,
    syncTerminals
  }), [status]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

