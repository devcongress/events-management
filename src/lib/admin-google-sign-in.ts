import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { ADMIN_OAUTH_REDIRECT_STORAGE_KEY, adminPath, safeInternalAppPath } from '@/src/admin-routes';

const LOCAL_GOOGLE_OAUTH_ORIGIN = 'http://localhost:5173';

export async function startAdminGoogleSignIn(input: {
  redirectTo: string;
  loginHint?: string | null;
  recovery?: boolean;
  chooseAccount?: boolean;
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) throw new Error('Google organizer sign-in is not configured yet.');

  const { origin, hostname } = window.location;

  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname) && origin !== LOCAL_GOOGLE_OAUTH_ORIGIN) {
    throw new Error(`Google sign-in only works on ${LOCAL_GOOGLE_OAUTH_ORIGIN} locally. Restart there.`);
  }

  const redirectTo = safeInternalAppPath(input.redirectTo) ?? adminPath('events');
  const callbackUrl = new URL('/api/auth/admin/callback', origin);

  // Recovery state stays in sessionStorage, never in the provider redirect URL.
  if (!input.recovery) callbackUrl.searchParams.set('next', redirectTo);
  window.sessionStorage.setItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY, redirectTo);

  const queryParams: Record<string, string> = !input.recovery || input.chooseAccount
    ? { prompt: 'select_account' }
    : {};

  if (input.recovery && !input.chooseAccount && input.loginHint) queryParams.login_hint = input.loginHint;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl.toString(),
      scopes: 'email profile',
      queryParams,
    },
  });

  if (error) throw new Error('Unable to start Google sign-in. Please try again.');
}
