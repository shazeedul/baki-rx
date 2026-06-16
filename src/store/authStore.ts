import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { getDb } from '../db/schema';

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  storeId: string | null;
  isAuthenticated: boolean;
  setSession: (userId: string, tenantId: string, storeId: string) => void;
  setStoreId: (storeId: string) => void;
  clearSession: () => void;
}

const sqliteStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM kv_store WHERE key = ?`,
        [name]
      );
      return row?.value ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const db = await getDb();
      await db.runAsync(
        `INSERT INTO kv_store (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [name, value]
      );
    } catch {
      // silent
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      const db = await getDb();
      await db.runAsync(`DELETE FROM kv_store WHERE key = ?`, [name]);
    } catch {
      // silent
    }
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      tenantId: null,
      storeId: null,
      isAuthenticated: false,

      setSession: (userId, tenantId, storeId) =>
        set({ userId, tenantId, storeId, isAuthenticated: true }),

      setStoreId: (storeId) => set({ storeId }),

      clearSession: () =>
        set({ userId: null, tenantId: null, storeId: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sqliteStorage),
    }
  )
);
