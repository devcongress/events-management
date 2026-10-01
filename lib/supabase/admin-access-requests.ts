import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { envValue } from '@/server/env';

export const ADMIN_ACCESS_REQUEST_COOKIE = 'devcon_access_request';
const REQUEST_SESSION_SECONDS = 30 * 60;

export interface AccessRequestIdentity { userId: string; email: string; displayName: string; }
export interface AccessRequestSession extends AccessRequestIdentity { expiresAt: string; }

function secure(c: Context) {
  return envValue('NODE_ENV', c) === 'production' || new URL(c.req.url).protocol === 'https:';
}

function cookieName(c: Context) {
  return secure(c) ? '__Host-devcon_access_request' : ADMIN_ACCESS_REQUEST_COOKIE;
}

function token() {
  const bytes = new Uint8Array(32);

  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function createAccessRequestSession(c: Context, identity: AccessRequestIdentity) {
  const rawToken = token();
  const expiresAt = new Date(Date.now() + REQUEST_SESSION_SECONDS * 1000).toISOString();
  const { error } = await getSupabaseAdminClient(c).from('admin_access_request_sessions').insert({ token_hash: await hash(rawToken), user_id: identity.userId, email: identity.email, display_name: identity.displayName, expires_at: expiresAt });

  if (error) throw error;
  setCookie(c, cookieName(c), rawToken, { httpOnly: true, sameSite: 'Lax', secure: secure(c), path: '/', maxAge: REQUEST_SESSION_SECONDS });
}

export async function getAccessRequestSession(c: Context): Promise<AccessRequestSession | null> {
  const rawToken = getCookie(c, cookieName(c));

  if (!rawToken) return null;
  const { data, error } = await getSupabaseAdminClient(c).from('admin_access_request_sessions').select('user_id, email, display_name, expires_at').eq('token_hash', await hash(rawToken)).is('revoked_at', null).maybeSingle();

  const expiresAtMs = data ? new Date(data.expires_at).getTime() : Number.NaN;

  if (error || !data || !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return null;

  return { userId: data.user_id, email: data.email, displayName: data.display_name, expiresAt: data.expires_at };
}

export async function revokeAccessRequestSession(c: Context) {
  const name = cookieName(c);
  const rawToken = getCookie(c, name);

  try {
    if (rawToken) {
      const { error } = await getSupabaseAdminClient(c)
        .from('admin_access_request_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token_hash', await hash(rawToken));

      if (error) throw new Error('Unable to revoke access request session');
    }
  } finally {
    deleteCookie(c, name, { path: '/', secure: name.startsWith('__Host-') });
  }
}
