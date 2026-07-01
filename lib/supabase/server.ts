import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import { envValue } from '@/server/env';
import type { Database } from '@/types/supabase';

type ServerSupabaseClient = ReturnType<typeof createClient<Database, 'public'>>;

const adminClients = new Map<string, ServerSupabaseClient>();

function normalizedDataSource(c?: Context): 'local-json' | 'supabase' {
  const configured = envValue('APP_DATA_SOURCE', c)?.trim().toLowerCase();

  if (configured === 'supabase') return 'supabase';
  if (configured === 'local-json' || configured === 'json' || configured === 'local') return 'local-json';

  return envValue('NODE_ENV', c) === 'production' ? 'supabase' : 'local-json';
}

export function isSupabaseRuntimeEnabled(c?: Context): boolean {
  return normalizedDataSource(c) === 'supabase';
}

export function isSupabaseServerConfigured(c?: Context): boolean {
  return Boolean(
    isSupabaseRuntimeEnabled(c)
    && envValue('VITE_SUPABASE_URL', c)
    && envValue('SUPABASE_SERVICE_ROLE_KEY', c),
  );
}

export function getSupabaseAdminClient(c?: Context): ServerSupabaseClient {
  const supabaseUrl = envValue('VITE_SUPABASE_URL', c);
  const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY', c);

  if (!isSupabaseRuntimeEnabled(c)) {
    throw new Error('Supabase server config is disabled for this runtime. Set APP_DATA_SOURCE=supabase to enable it.');
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server config is missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const cacheKey = `${supabaseUrl}:${serviceRoleKey.slice(0, 10)}`;
  const cached = adminClients.get(cacheKey);
  if (cached) {
    return cached;
  }

  const adminClient = createClient<Database, 'public'>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  adminClients.set(cacheKey, adminClient);

  return adminClient;
}
