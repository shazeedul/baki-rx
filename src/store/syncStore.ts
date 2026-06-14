import { create } from 'zustand';

interface SyncState {
  dirtyCount: number;
  lastSyncedAt: string | null;
  lastUserSyncedAt: string | null;
  isSyncing: boolean;
  setDirtyCount: (count: number) => void;
  setLastSyncedAt: (ts: string) => void;
  setLastUserSyncedAt: (ts: string) => void;
  setIsSyncing: (v: boolean) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  dirtyCount: 0,
  lastSyncedAt: null,
  lastUserSyncedAt: null,
  isSyncing: false,

  setDirtyCount: (count) => set({ dirtyCount: count }),
  setLastSyncedAt: (ts) => set({ lastSyncedAt: ts }),
  setLastUserSyncedAt: (ts) => set({ lastUserSyncedAt: ts }),
  setIsSyncing: (v) => set({ isSyncing: v }),
}));
