import { create } from 'zustand';

interface AuthState {
  userId: string | null;
  tenantId: string | null;
  storeId: string | null;
  isAuthenticated: boolean;
  setSession: (userId: string, tenantId: string, storeId: string) => void;
  setStoreId: (storeId: string) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  tenantId: null,
  storeId: null,
  isAuthenticated: false,

  setSession: (userId, tenantId, storeId) =>
    set({ userId, tenantId, storeId, isAuthenticated: true }),

  setStoreId: (storeId) => set({ storeId }),

  clearSession: () =>
    set({ userId: null, tenantId: null, storeId: null, isAuthenticated: false }),
}));
