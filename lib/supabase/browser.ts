import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

type BrowserSupabaseClient = ReturnType<typeof createClient<Database, 'public'>>;

let browserClient: BrowserSupabaseClient | null = null;

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
      },
    },
  );

  return browserClient;
}
