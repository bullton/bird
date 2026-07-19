import { create } from 'zustand';
import type { User } from '../types';
import { authApi } from '../api';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  load: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  initialized: false,

  load: async () => {
    set({ loading: true });
    try {
      const me = await authApi.me();
      set({
        user: {
          id: me.id,
          username: me.username ?? '',
          displayName: me.displayName ?? null,
          role: me.role,
          mustChangePassword: me.mustChangePassword,
        },
        loading: false,
        initialized: true,
      });
    } catch {
      set({ user: null, loading: false, initialized: true });
    }
  },

  login: async (username, password) => {
    set({ loading: true });
    try {
      const me = await authApi.login(username, password);
      set({
        user: {
          id: me.id,
          username: me.username ?? '',
          displayName: me.displayName ?? null,
          role: me.role,
          mustChangePassword: me.mustChangePassword,
        },
        loading: false,
      });
    } catch (err) {
      set({ loading: false });
      throw err;
    }
  },

  logout: async () => {
    await authApi.logout();
    set({ user: null });
  },

  refresh: async () => {
    try {
      const me = await authApi.me();
      set({
        user: {
          id: me.id,
          username: me.username ?? '',
          displayName: me.displayName ?? null,
          role: me.role,
          mustChangePassword: me.mustChangePassword,
        },
      });
    } catch {
      set({ user: null });
    }
  },
}));