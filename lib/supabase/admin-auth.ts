import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { envValue } from '@/server/env';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import type { Database, Json } from '@/types/supabase';

export const ADMIN_SESSION_COOKIE = 'devcon_admin';
const LOCAL_ADMIN_COOKIE_PREFIX = 'local:';
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type AdminRole = 'owner' | 'organizer';

export interface AdminSession {
  authenticated: true;
  mode: 'supabase' | 'local';
  user_id: string | null;
  membership_id: string | null;
  email: string | null;
  display_name: string | null;
  role: AdminRole;
}

export interface AnonymousAdminSession {
  authenticated: false;
}

export type AdminSessionResult = AdminSession | AnonymousAdminSession;

type BrowserSafeSupabaseClient = ReturnType<typeof createClient<Database, 'public'>>;
let browserSafeClient: BrowserSafeSupabaseClient | null = null;

function adminPassword(c: Context): string {
  return envValue('ADMIN_PASSWORD', c) ?? 'devcon-admin';
}

function adminSessionSecret(c: Context): string {
  return envValue('ADMIN_SESSION_SECRET', c) ?? 'devcon-local-session';
}

function isProduction(c: Context): boolean {
  return envValue('NODE_ENV', c) === 'production';
}

function cookieSameSite(c: Context): 'Lax' | 'None' {
  return configuredFrontendOrigins(c).size > 0 ? 'None' : 'Lax';
}

function isSecureCookie(c: Context): boolean {
  return isProduction(c) || configuredFrontendOrigins(c).size > 0;
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function sessionCookieOptions(c: Context) {
  return {
    httpOnly: true,
    sameSite: cookieSameSite(c),
    secure: isSecureCookie(c),
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  } as const;
}

export function configuredFrontendOrigins(c: Context): Set<string> {
  return new Set([
    envValue('PUBLIC_FRONTEND_ORIGIN', c),
    envValue('PUBLIC_APP_URL', c),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value)));
}

export function isSupabaseAdminAuthConfigured(c: Context): boolean {
  return Boolean(
    isSupabaseServerConfigured(c)
    && envValue('VITE_SUPABASE_ANON_KEY', c)
    && envValue('VITE_SUPABASE_URL', c),
  );
}

function getBrowserSafeSupabaseClient(c: Context): BrowserSafeSupabaseClient {
  const supabaseUrl = envValue('VITE_SUPABASE_URL', c);
  const anonKey = envValue('VITE_SUPABASE_ANON_KEY', c);

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase auth config is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }

  browserSafeClient ??= createClient<Database, 'public'>(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return browserSafeClient;
}

function adminEventsPath(c: Context): string {
  const basePath = `/${(envValue('VITE_ADMIN_BASE_PATH', c) ?? 'organizer-console').replace(/^\/+|\/+$/g, '')}`;
  return `${basePath}/events`;
}

function adminLoginPath(c: Context): string {
  const basePath = `/${(envValue('VITE_ADMIN_BASE_PATH', c) ?? 'organizer-console').replace(/^\/+|\/+$/g, '')}`;
  return `${basePath}/login`;
}

export function defaultAdminRedirectPath(c: Context): string {
  return adminEventsPath(c);
}

export function adminLoginErrorPath(c: Context, error: string): string {
  return `${adminLoginPath(c)}?error=${encodeURIComponent(error)}`;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function newSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function sessionTokenHash(token: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

function requestIp(c: Context): string | null {
  return c.req.header('cf-connecting-ip')
    ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    ?? null;
}

async function findActiveMembershipByEmail(c: Context, email: string) {
  const { data, error } = await getSupabaseAdminClient(c)
    .from('admin_memberships')
    .select('id, email, display_name, role, status')
    .eq('email', email)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function createAdminSessionForUser(c: Context, input: { userId: string; email: string }) {
  const email = normalizeEmail(input.email);
  const membership = await findActiveMembershipByEmail(c, email);
  if (!membership) {
    return { ok: false as const, status: 403, error: 'This account is not allowed to access the organizer console.' };
  }

  const sessionToken = newSessionToken();
  const tokenHash = await sessionTokenHash(sessionToken);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  const adminClient = getSupabaseAdminClient(c);
  const { error: insertError } = await adminClient
    .from('admin_sessions')
    .insert({
      token_hash: tokenHash,
      user_id: input.userId,
      membership_id: membership.id,
      email,
      role: membership.role,
      expires_at: expiresAt,
      user_agent: c.req.header('user-agent') ?? null,
      ip_address: requestIp(c),
    });

  if (insertError) {
    return { ok: false as const, status: 500, error: 'Unable to create organizer session.' };
  }

  await adminClient
    .from('admin_memberships')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', membership.id);

  await recordAdminAudit(c, {
    actor_user_id: input.userId,
    actor_email: email,
    actor_role: membership.role,
    action: 'admin.login',
    target_type: 'admin_membership',
    target_id: membership.id,
  });

  setCookie(c, ADMIN_SESSION_COOKIE, sessionToken, sessionCookieOptions(c));
  return { ok: true as const };
}

export async function completeSupabaseAdminToken(c: Context, accessToken: string) {
  const { data, error } = await getBrowserSafeSupabaseClient(c).auth.getUser(accessToken);

  if (error || !data.user?.email) {
    return { ok: false as const, status: 401, error: 'Google organizer sign-in could not be completed. Please try again.' };
  }

  return createAdminSessionForUser(c, {
    userId: data.user.id,
    email: data.user.email,
  });
}

export function startLocalAdminSession(c: Context, password: unknown): boolean {
  if (String(password ?? '') !== adminPassword(c)) return false;
  setCookie(c, ADMIN_SESSION_COOKIE, `${LOCAL_ADMIN_COOKIE_PREFIX}${adminSessionSecret(c)}`, sessionCookieOptions(c));
  return true;
}

export async function getAdminSession(c: Context): Promise<AdminSessionResult> {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) return { authenticated: false };

  if (token === `${LOCAL_ADMIN_COOKIE_PREFIX}${adminSessionSecret(c)}`) {
    return {
      authenticated: true,
      mode: 'local',
      user_id: null,
      membership_id: null,
      email: 'local-admin@devcongress.local',
      display_name: 'Local admin',
      role: 'owner',
    };
  }

  if (!isSupabaseAdminAuthConfigured(c)) {
    return { authenticated: false };
  }

  const { data, error } = await getSupabaseAdminClient(c)
    .from('admin_sessions')
    .select('id, user_id, membership_id, email, role, expires_at, revoked_at, admin_memberships!inner(display_name, status)')
    .eq('token_hash', await sessionTokenHash(token))
    .is('revoked_at', null)
    .maybeSingle();

  if (error || !data || new Date(data.expires_at).getTime() <= Date.now()) {
    return { authenticated: false };
  }

  const membership = Array.isArray(data.admin_memberships) ? data.admin_memberships[0] : data.admin_memberships;
  if (!membership || membership.status !== 'active') {
    return { authenticated: false };
  }

  await getSupabaseAdminClient(c)
    .from('admin_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    authenticated: true,
    mode: 'supabase',
    user_id: data.user_id,
    membership_id: data.membership_id,
    email: data.email,
    display_name: membership.display_name,
    role: data.role,
  };
}

export async function revokeAdminSession(c: Context): Promise<void> {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (token && !token.startsWith(LOCAL_ADMIN_COOKIE_PREFIX) && isSupabaseAdminAuthConfigured(c)) {
    await getSupabaseAdminClient(c)
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', await sessionTokenHash(token));
  }

  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' });
}

export function assertAdminOrigin(c: Context): globalThis.Response | null {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
    return null;
  }

  const origin = c.req.header('origin');
  if (!origin) return null;

  const requestOrigin = new URL(c.req.url).origin;
  if (origin === requestOrigin || configuredFrontendOrigins(c).has(origin)) {
    return null;
  }

  return c.json({ error: 'Invalid request origin' }, 403);
}

export async function recordAdminAudit(c: Context, input: {
  actor_user_id?: string | null;
  actor_email?: string | null;
  actor_role?: AdminRole | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!isSupabaseServerConfigured(c)) return;

  const requestUrl = new URL(c.req.url);
  const { error } = await getSupabaseAdminClient(c)
    .from('admin_audit_log')
    .insert({
      actor_user_id: input.actor_user_id ?? null,
      actor_email: input.actor_email ?? null,
      actor_role: input.actor_role ?? null,
      action: input.action,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      metadata: (input.metadata ?? {}) as Json,
      ip_address: requestIp(c),
      user_agent: c.req.header('user-agent') ?? null,
      request_method: c.req.method,
      request_path: requestUrl.pathname,
    });

  if (error) {
    console.warn('Failed to record admin audit log:', error.message);
  }
}

export async function requireAdmin(c: Context, roles: AdminRole[] = ['owner', 'organizer']): Promise<globalThis.Response | null> {
  const originError = assertAdminOrigin(c);
  if (originError) return originError;

  const session = await getAdminSession(c);
  if (!session.authenticated) {
    return c.json({ error: 'Admin session required' }, 401);
  }

  if (!roles.includes(session.role)) {
    return c.json({ error: 'Owner access required' }, 403);
  }

  c.set('adminSession', session);
  return null;
}
