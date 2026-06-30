import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type BrowserSupabaseClient = ReturnType<typeof createClient<Database, 'public'>>;
type SupabaseAuthStorage = {
  getItem: (key: string) => string | null | Promise<string | null>;
  setItem: (key: string, value: string) => void | Promise<void>;
  removeItem: (key: string) => void | Promise<void>;
};

let browserClient: BrowserSupabaseClient | null = null;
const fallbackAuthStorage = new Map<string, string>();

function getTabScopedAuthStorage(): SupabaseAuthStorage {
  const memoryStorage = {
    getItem: (key: string) => fallbackAuthStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      fallbackAuthStorage.set(key, value);
    },
    removeItem: (key: string) => {
      fallbackAuthStorage.delete(key);
    },
  };

  if (typeof window === 'undefined') {
    return memoryStorage;
  }

  return {
    getItem: (key) => {
      try {
        return window.sessionStorage.getItem(key);
      } catch {
        return memoryStorage.getItem(key);
      }
    },
    setItem: (key, value) => {
      try {
        window.sessionStorage.setItem(key, value);
      } catch {
        memoryStorage.setItem(key, value);
      }
    },
    removeItem: (key) => {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        memoryStorage.removeItem(key);
      }
    },
  };
}

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export function getSupabaseBrowserClient(): BrowserSupabaseClient | null {
  if (!isSupabaseBrowserConfigured()) {
    return null;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

  browserClient ??= createClient<Database, 'public'>(
    supabaseUrl,
    anonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'pkce',
        storage: getTabScopedAuthStorage(),
        storageKey: 'devcon-organizer-auth',
      },
    },
  );

  return browserClient;
}
