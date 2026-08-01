import { createClient } from '@supabase/supabase-js';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { envValue } from '@/server/env';
import { securitySafeRequestPath } from '@/server/security-log';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import type { Database, Json } from '@/types/supabase';

export const ADMIN_SESSION_COOKIE = 'devcon_admin';
const HOST_ADMIN_SESSION_COOKIE = '__Host-devcon_admin';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const ADMIN_SESSION_IDLE_TIMEOUT_SECONDS = 60 * 30;
// Bump last_seen_at at most once per interval so normal organizer work does
// not create a database write for every request.
const ADMIN_SESSION_LAST_SEEN_THROTTLE_MS = 60_000;

export type AdminRole = 'owner' | 'organizer';

export interface AdminSession {
  authenticated: true;
  mode: 'supabase';
  expires_at: string;
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

export function isAdminSessionIdle(lastSeenAt: string | null, nowMs = Date.now()): boolean {
  if (!lastSeenAt) return true;
  const lastSeenAtMs = new Date(lastSeenAt).getTime();
  return !Number.isFinite(lastSeenAtMs)
    || nowMs - lastSeenAtMs >= ADMIN_SESSION_IDLE_TIMEOUT_SECONDS * 1000;
}

function isProduction(c: Context): boolean {
  return envValue('NODE_ENV', c) === 'production';
}

function cookieSameSite(): 'Lax' {
  // The deployed Pages Worker proxies /api/* on the same browser origin.
  // Cross-site cookies are deliberately unsupported.
  return 'Lax';
}

function isSecureCookie(c: Context): boolean {
  return isProduction(c) || new URL(c.req.url).protocol === 'https:';
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function sessionCookieOptions(c: Context) {
  return {
    httpOnly: true,
    sameSite: cookieSameSite(),
    secure: isSecureCookie(c),
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  } as const;
}

function sessionCookieName(c: Context): string {
  return isSecureCookie(c) ? HOST_ADMIN_SESSION_COOKIE : ADMIN_SESSION_COOKIE;
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

  setCookie(c, sessionCookieName(c), sessionToken, sessionCookieOptions(c));
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

export async function getAdminSession(c: Context): Promise<AdminSessionResult> {
  const token = getCookie(c, sessionCookieName(c));
  if (!token) return { authenticated: false };

  if (!isSupabaseAdminAuthConfigured(c)) {
    return { authenticated: false };
  }

  const { data, error } = await getSupabaseAdminClient(c)
    .from('admin_sessions')
    .select('id, user_id, membership_id, email, role, expires_at, revoked_at, last_seen_at, admin_memberships!inner(display_name, role, status)')
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

  if (isAdminSessionIdle(data.last_seen_at)) {
    return { authenticated: false };
  }

  const lastSeenAtMs = data.last_seen_at ? new Date(data.last_seen_at).getTime() : 0;
  if (Date.now() - lastSeenAtMs > ADMIN_SESSION_LAST_SEEN_THROTTLE_MS) {
    void getSupabaseAdminClient(c)
      .from('admin_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(() => undefined, () => undefined);
  }

  return {
    authenticated: true,
    mode: 'supabase',
    expires_at: data.expires_at,
    user_id: data.user_id,
    membership_id: data.membership_id,
    email: data.email,
    display_name: membership.display_name,
    role: membership.role,
  };
}

export async function revokeAdminSession(c: Context): Promise<void> {
  const cookieName = sessionCookieName(c);
  const token = getCookie(c, cookieName);
  if (token && isSupabaseAdminAuthConfigured(c)) {
    await getSupabaseAdminClient(c)
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', await sessionTokenHash(token));
  }

  deleteCookie(c, cookieName, {
    path: '/',
    secure: cookieName === HOST_ADMIN_SESSION_COOKIE,
  });
  if (cookieName !== ADMIN_SESSION_COOKIE) {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' });
  }
}

export async function revokeAdminSessionsForMembership(c: Context, membershipId: string): Promise<void> {
  const { error } = await getSupabaseAdminClient(c)
    .from('admin_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('membership_id', membershipId)
    .is('revoked_at', null);

  if (error) {
    throw new Error('Unable to revoke organizer sessions');
  }
}

export function assertAdminOrigin(c: Context): globalThis.Response | null {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
    return null;
  }

  const origin = c.req.header('origin');
  if (!origin) {
    return c.json({ error: 'Request origin is required' }, 403);
  }

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
    console.error(JSON.stringify({
      event: 'admin_audit_write_failed',
      action: input.action,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      error_code: error.code ?? null,
    }));
  }
}

export async function requireAdmin(c: Context, roles: AdminRole[] = ['owner', 'organizer']): Promise<globalThis.Response | null> {
  // The /api/* middleware resolves the session once per request; handlers that
  // re-check roles reuse it instead of paying for another Supabase round trip.
  const cached = c.get('adminSession') as AdminSession | undefined;
  const session = cached ?? await getAdminSession(c);
  if (!session.authenticated) {
    console.warn(JSON.stringify({
      event: 'admin_access_denied',
      reason: 'session_required',
      method: c.req.method,
      path: securitySafeRequestPath(c.req.path),
    }));
    return c.json({ error: 'Admin session required' }, 401);
  }

  const originError = assertAdminOrigin(c);
  if (originError) return originError;

  if (!roles.includes(session.role)) {
    console.warn(JSON.stringify({
      event: 'admin_access_denied',
      reason: 'role_required',
      role: session.role,
      method: c.req.method,
      path: securitySafeRequestPath(c.req.path),
    }));
    return c.json({ error: 'Owner access required' }, 403);
  }

  if (!cached) c.set('adminSession', session);
  return null;
}
