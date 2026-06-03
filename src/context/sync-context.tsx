import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { LocalSyncEngine } from '../sync/local-sync-engine';
import { MemoryAdapter } from '../storage/memory-adapter';
import { SqliteAdapter } from '../storage/sqlite-adapter';
import { RemoteSyncClient } from '../sync/remote-sync-client';
import { useAuth } from './auth-context';
import type { SyncEngine, SyncStatus } from '../types/sync';

const SyncContext = createContext<{ engine?: SyncEngine; status?: SyncStatus }>({});

export const SyncProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [engine, setEngine] = useState<SyncEngine | undefined>(undefined);
  const [status, setStatus] = useState<SyncStatus>({ running: false, pendingChanges: 0 });
  const { isLoggedIn, storeId } = useAuth();

  // 1. Initialize Sync Engine and Database Adapter
  useEffect(() => {
    let mounted = true;
    let createdEngine: SyncEngine | undefined;

    (async () => {
      let adapter: any;
      try {
        if (Platform.OS === 'web') {
          adapter = new MemoryAdapter();
        } else {
          let hasExpoSqlite = false;
          try {
            require.resolve('expo-sqlite');
            hasExpoSqlite = true;
          } catch (e) {
            hasExpoSqlite = false;
          }

          if (hasExpoSqlite) {
            adapter = new SqliteAdapter();
          } else {
            adapter = new MemoryAdapter();
          }
        }
      } catch (err) {
        console.warn('Failed to instantiate preferred SQLite adapter, falling back to memory', err);
        adapter = new MemoryAdapter();
      }

      createdEngine = new LocalSyncEngine(adapter, { pullIntervalMs: 10000 });
      createdEngine.on('status', (s: any) => mounted && setStatus(s));
      createdEngine.on('error', (e: any) => console.warn('Sync engine error:', e));

      try {
        await createdEngine.start();
        if (mounted) setEngine(createdEngine);
      } catch (e) {
        console.warn('Failed to start engine, falling back to memory adapter', e);
        if (!(adapter instanceof MemoryAdapter)) {
          const mem = new MemoryAdapter();
          createdEngine = new LocalSyncEngine(mem, { pullIntervalMs: 10000 });
          createdEngine.on('status', (s: any) => mounted && setStatus(s));
          createdEngine.on('error', (e: any) => console.warn('Sync engine error:', e));
          await createdEngine.start().catch(() => undefined);
          if (mounted) setEngine(createdEngine);
        }
      }
    })();

    return () => {
      mounted = false;
      if (createdEngine) createdEngine.stop().catch(() => undefined);
    };
  }, []);

  // 2. Attach Remote Client and Trigger Initial Sync on Login
  useEffect(() => {
    if (!engine) return;

    if (isLoggedIn && storeId) {
      const remote = new RemoteSyncClient(storeId);
      engine.setRemote(remote);

      // Immediately run sync cycle upon login activation
      engine.pushPending().catch((e) => console.warn('Initial pushPending failed', e));
      engine.pullRemote().catch((e) => console.warn('Initial pullRemote failed', e));
    }
  }, [engine, isLoggedIn, storeId]);

  // 3. Setup Network Listener to trigger Sync Loops on Connection Restored
  useEffect(() => {
    if (!engine || !isLoggedIn || !storeId) return;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        console.log('Network connected: triggering background sync loop');
        engine.pushPending().catch((e) => console.warn('Sync push fail on connection restore', e));
        engine.pullRemote().catch((e) => console.warn('Sync pull fail on connection restore', e));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [engine, isLoggedIn, storeId]);

  const value = useMemo(() => ({ engine, status }), [engine, status]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export function useSync() {
  return useContext(SyncContext);
}
