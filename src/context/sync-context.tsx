// Sync context that holds a singleton sync engine and exposes useSync hook
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { LocalSyncEngine } from '../sync/local-sync-engine';
import { MemoryAdapter } from '../storage/memory-adapter';
import { SqliteAdapter } from '../storage/sqlite-adapter';
import type { SyncEngine } from '../types/sync';
import { Platform } from 'react-native';

const SyncContext = createContext<{ engine?: SyncEngine; status?: any }>({});

export const SyncProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [engine, setEngine] = useState<SyncEngine | undefined>(undefined);
  const [status, setStatus] = useState<any>({ running: false });

  useEffect(() => {
    let mounted = true;
    let createdEngine: SyncEngine | undefined;

    (async () => {
      // Prefer SQLite on native platforms; fall back to in-memory on web or when sqlite isn't available.
      let adapter: any;
      try {
        // If running on web, use memory adapter immediately.
        if (Platform.OS === 'web') {
          adapter = new MemoryAdapter();
        } else {
          // Check if expo-sqlite is available before creating SqliteAdapter so we don't attempt
          // to open it in environments (like web or certain CI) where it's absent.
          let hasExpoSqlite = false;
          try {
            // require.resolve works in Node/Electron and bundlers may inline; wrap in try/catch.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            require.resolve('expo-sqlite');
            hasExpoSqlite = true;
          } catch (e) {
            hasExpoSqlite = false;
          }

          if (hasExpoSqlite) {
            adapter = new SqliteAdapter();
          } else {
            // sqlite not available in this environment (e.g., web), use memory adapter.
            adapter = new MemoryAdapter();
          }
        }
      } catch (err) {
        console.warn('failed to instantiate preferred adapter, falling back to memory adapter', err);
        adapter = new MemoryAdapter();
      }

      createdEngine = new LocalSyncEngine(adapter, { pullIntervalMs: 5000 });
      createdEngine.on('status', (s: any) => mounted && setStatus(s));
      createdEngine.on('error', (e: any) => console.warn('sync engine error', e));
      try {
        await createdEngine.start();
        if (mounted) setEngine(createdEngine);
      } catch (e) {
        console.warn('failed to start engine, fallback to memory adapter', e);
        if (!(adapter instanceof MemoryAdapter)) {
          // try memory adapter as a safe fallback
          const mem = new MemoryAdapter();
          createdEngine = new LocalSyncEngine(mem, { pullIntervalMs: 5000 });
          createdEngine.on('status', (s: any) => mounted && setStatus(s));
          createdEngine.on('error', (e: any) => console.warn('sync engine error', e));
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

  const value = useMemo(() => ({ engine, status }), [engine, status]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export function useSync() {
  return useContext(SyncContext);
}
