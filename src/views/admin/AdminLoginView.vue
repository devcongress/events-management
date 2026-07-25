<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ADMIN_OAUTH_REDIRECT_STORAGE_KEY, adminPath } from '@/src/admin-routes';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { fetchAdminSession, queryKeys } from '@/src/lib/api';
import { queryClient } from '@/src/lib/query';
import { notify } from '@/src/lib/notify';

const route = useRoute();
const router = useRouter();
const password = ref('');
const authMode = ref<'supabase' | 'local'>('supabase');
const loading = ref(false);
const error = ref<string | null>(null);
const redirectTo = computed(() => String(route.query.redirect ?? route.query.next ?? adminPath('events')));
const ADMIN_LOGIN_TOAST_ID = 'admin-login-toast';
const LOCAL_GOOGLE_OAUTH_ORIGIN = 'http://localhost:5173';
const logoSrc = '/brand/dev-con-logo.png';

function notifyAdminLogin(kind: 'success' | 'info' | 'error', message: string, duration: number) {
  notify[kind](message, {
    id: ADMIN_LOGIN_TOAST_ID,
    duration,
  });
}

function isLocalBrowserOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

async function login() {
  loading.value = true;
  error.value = null;

  try {
    if (authMode.value === 'supabase') {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        notifyAdminLogin('error', 'Google organizer sign-in is not configured yet.', 7000);
        return;
      }

      if (isLocalBrowserOrigin(window.location.origin) && window.location.origin !== LOCAL_GOOGLE_OAUTH_ORIGIN) {
        const message = `Google sign-in only works on ${LOCAL_GOOGLE_OAUTH_ORIGIN} locally. Restart there.`;
        error.value = message;
        notifyAdminLogin('error', message, 7000);
        return;
      }

      const callbackUrl = new URL('/api/auth/admin/callback', window.location.origin);
      callbackUrl.searchParams.set('next', redirectTo.value);

      window.sessionStorage.setItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY, redirectTo.value);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          scopes: 'email profile',
          queryParams: { prompt: 'select_account' },
        },
      });

      if (oauthError) {
        error.value = 'Unable to start Google sign-in. Please try again.';
        notifyAdminLogin('error', error.value, 7000);
      }
      return;
    }

    const response = await fetch('/api/auth/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    });

    if (!response.ok) {
      error.value = 'The admin password was not accepted.';
      notifyAdminLogin('error', error.value, 7000);
      return;
    }

    await queryClient.fetchQuery({
      queryKey: queryKeys.adminSession,
      queryFn: fetchAdminSession,
      staleTime: 0,
    });
    await router.push(redirectTo.value);
  } catch {
    error.value = 'Unable to sign in. Please check your connection and try again.';
    notifyAdminLogin('error', error.value, 7000);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const callbackError = route.query.error;
  if (typeof callbackError === 'string' && callbackError) {
    error.value = callbackError;
  }

  try {
    const session = await fetchAdminSession();
    authMode.value = session.auth_mode;
    if (session.authenticated) {
      await router.replace(redirectTo.value);
    }
  } catch {
    authMode.value = 'local';
  }
});
</script>

<template>
  <div class="login-pass-page">
    <form class="login-pass-card" aria-labelledby="organizer-login-title" @submit.prevent="login">
      <section class="login-pass-story">
        <div class="login-pass-brand-row">
          <img :src="logoSrc" alt="DevCongress" class="login-pass-logo" />
          <span class="login-pass-private">Private</span>
        </div>

        <div class="login-pass-number" aria-hidden="true">01</div>

        <div class="login-pass-copy">
          <p class="login-pass-kicker">Organizer console</p>
          <h1 id="organizer-login-title">Your event,<br>under control.</h1>
          <p>Open the tools for planning, people, and the follow-up that matters.</p>
        </div>

        <div class="login-pass-credential" aria-label="DevCongress organizer credential">
          <span>DevCongress</span>
          <span>Organizer credential</span>
        </div>
      </section>

      <section class="login-pass-action">
        <div>
          <p class="login-pass-kicker">Access checkpoint</p>
          <h2>{{ authMode === 'supabase' ? 'Come on in.' : 'Welcome back.' }}</h2>
          <p class="login-pass-description">
            {{ authMode === 'supabase' ? 'Use your Google account to continue.' : 'Use the local administrator password to continue.' }}
          </p>
        </div>

        <div class="login-pass-control">
          <label v-if="authMode === 'local'" class="block">
            <span class="editorial-label">Password</span>
            <input
              v-model="password"
              autofocus
              required
              class="editorial-input mt-2"
              :disabled="loading"
              type="password"
              autocomplete="current-password"
              placeholder="Admin password"
            >
          </label>

          <div v-if="error" class="login-pass-error" role="alert">{{ error }}</div>

          <button type="submit" :disabled="loading" class="login-pass-submit motion-press">
            <span>{{ loading ? 'Signing in…' : authMode === 'supabase' ? 'Continue with Google' : 'Sign in' }}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </form>
  </div>
</template>

<style scoped>
/* Login component tokens: derived from the established DevCongress ink, cream, yellow, and pink system. */
.login-pass-page {
  --login-canvas: #f1efe7;
  --login-paper: #fffdf8;
  --login-ticket: #e5d94b;
  --login-ticket-shade: #c8bb36;
  --login-ink: #1f1e1a;
  --login-muted: #656158;
  --login-accent: #d91a73;
  display: grid;
  min-height: 100%;
  place-items: center;
  overflow: hidden;
  padding: clamp(1rem, 3vw, 2.5rem);
  background: var(--login-canvas);
  color: var(--login-ink);
}

.login-pass-card {
  display: grid;
  grid-template-columns: minmax(0, 1.03fr) minmax(24rem, 0.97fr);
  width: min(100%, 70rem);
  min-height: min(38rem, calc(100svh - 5rem));
  overflow: hidden;
  border: 2px solid var(--login-ink);
  border-radius: 0.75rem;
  background: var(--login-paper);
  box-shadow: 5px 5px 0 var(--login-ink);
}

.login-pass-story,
.login-pass-action {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: clamp(1.75rem, 4vw, 4.25rem);
}

.login-pass-story {
  overflow: hidden;
  background: var(--login-ticket);
}

.login-pass-story::before {
  position: absolute;
  right: -4rem;
  bottom: -5rem;
  width: 15rem;
  height: 15rem;
  border: 2px solid var(--login-ink);
  border-radius: 50%;
  content: '';
}

.login-pass-brand-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.login-pass-logo {
  width: auto;
  height: 2rem;
  max-width: 13rem;
  object-fit: contain;
}

.login-pass-private {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  border: 2px solid var(--login-ink);
  border-radius: 0.35rem;
  background: var(--login-ink);
  padding: 0 0.7rem;
  color: var(--login-ticket);
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.login-pass-number {
  position: absolute;
  top: 8.3rem;
  right: 2rem;
  color: var(--login-ticket-shade);
  font-family: var(--font-mono);
  font-size: clamp(7rem, 16vw, 12.5rem);
  font-weight: 900;
  letter-spacing: -0.15em;
  line-height: 0.82;
}

.login-pass-copy {
  position: relative;
  z-index: 1;
  max-width: 27rem;
  margin-top: auto;
}

.login-pass-kicker {
  margin: 0;
  color: var(--login-accent);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.23em;
  text-transform: uppercase;
}

.login-pass-copy h1,
.login-pass-action h2,
.login-pass-copy p,
.login-pass-action p {
  margin: 0;
}

.login-pass-copy h1 {
  max-width: 8.5ch;
  margin-top: 1rem;
  font-size: clamp(3.25rem, 5vw, 5.2rem);
  font-weight: 900;
  letter-spacing: -0.07em;
  line-height: 0.89;
  text-wrap: balance;
}

.login-pass-copy > p:last-child {
  max-width: 29rem;
  margin-top: 1.4rem;
  color: rgba(31, 30, 26, 0.76);
  font-size: 1rem;
  line-height: 1.65;
}

.login-pass-credential {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 2.2rem;
  border-top: 2px solid var(--login-ink);
  padding-top: 0.85rem;
  font-family: var(--font-mono);
  font-size: 0.625rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.login-pass-action {
  justify-content: space-between;
  background: var(--login-paper);
}

.login-pass-action h2 {
  max-width: 8ch;
  margin-top: 1rem;
  font-size: clamp(2.8rem, 4vw, 4.2rem);
  font-weight: 900;
  letter-spacing: -0.065em;
  line-height: 0.9;
  text-wrap: balance;
}

.login-pass-description {
  max-width: 23rem;
  margin-top: 1.35rem !important;
  color: var(--login-muted);
  font-size: 1rem;
  line-height: 1.6;
}

.login-pass-control {
  width: min(100%, 25rem);
  margin-top: 3rem;
}

.login-pass-error {
  margin-top: 1.25rem;
  border-left: 4px solid #c0263d;
  background: #fff1f2;
  padding: 0.8rem 1rem;
  color: #a61b34;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.45;
}

.login-pass-submit {
  display: flex;
  width: 100%;
  min-height: 3.75rem;
  align-items: center;
  justify-content: space-between;
  margin-top: 1.5rem;
  border: 2px solid var(--login-ink);
  border-radius: 0.375rem;
  background: var(--login-ink);
  box-shadow: inset 0 -4px 0 var(--login-accent), 3px 3px 0 var(--login-ink);
  padding: 0 1.15rem 0.25rem;
  color: #ffffff;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.login-pass-submit:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  box-shadow: inset 0 -4px 0 var(--login-accent);
}

.login-pass-submit span:last-child {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 1.5rem;
  line-height: 1;
}

@media (hover: hover) and (pointer: fine) {
  .login-pass-submit:not(:disabled):hover {
    transform: translate3d(1px, 1px, 0);
    box-shadow: inset 0 -4px 0 var(--login-accent), 2px 2px 0 var(--login-ink);
  }
}

@media (max-width: 760px) {
  .login-pass-page {
    place-items: stretch;
    padding: 1rem;
  }

  .login-pass-card {
    min-height: calc(100svh - 2rem);
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .login-pass-story { min-height: 25rem; }
  .login-pass-action { min-height: 23rem; }
  .login-pass-number { top: 7rem; }
}

@media (prefers-reduced-motion: reduce) {
  .login-pass-submit { transition: none; }
}
</style>
