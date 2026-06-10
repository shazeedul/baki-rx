import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { syncEngineInstance, SyncEngine, SyncEngineStatus } from '../sync/SyncEngine';
import { useAuth } from './auth-context';

type SyncContextType = {
  engine: SyncEngine;
  status: SyncEngineStatus;
  syncAll: () => Promise<void>;
  syncUsers: (tenantId: string) => Promise<void>;
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



  const syncAll = async () => {
    if (storeId) {
      await syncEngineInstance.syncAll(storeId);
    }
  };

  const syncUsers = async (tenantId: string) => {
    await syncEngineInstance.syncUsers(tenantId);
  };

  const value = useMemo(() => ({
    engine: syncEngineInstance,
    status,
    syncAll,
    syncUsers
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

