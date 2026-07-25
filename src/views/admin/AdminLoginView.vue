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
          queryParams: {
            prompt: 'select_account',
          },
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
  <div class="admin-login-page">
    <main class="admin-login-shell" aria-labelledby="organizer-login-title">
      <section class="admin-login-intro">
        <p class="admin-login-kicker">DevCongress</p>
        <div>
          <p class="editorial-eyebrow">private workspace</p>
          <h1 id="organizer-login-title" class="admin-login-title">Organizer console.</h1>
          <p class="admin-login-lede">Run the event behind the scenes—from the first draft to the final follow-up.</p>
        </div>
        <ul class="admin-login-points" aria-label="Organizer console capabilities">
          <li>Event setup, talks, speakers, and attendance</li>
          <li>Feedback operations and organizer audit history</li>
          <li>Access limited to approved organizer accounts</li>
        </ul>
      </section>

      <form class="admin-login-card" @submit.prevent="login">
        <div class="admin-login-card-heading">
          <p class="editorial-eyebrow">secure sign-in</p>
          <h2 class="mt-3 text-3xl font-black tracking-tight text-dc-ink">Welcome back.</h2>
          <p class="mt-3 text-sm leading-6 text-dc-gray">
            {{ authMode === 'supabase' ? 'Continue with the Google account an organizer has approved for you.' : 'Enter the local administrator password to continue.' }}
          </p>
        </div>

        <label v-if="authMode === 'local'" class="mt-8 block">
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

        <div v-if="error" class="admin-login-error mt-6" role="alert">
          <span aria-hidden="true">!</span>
          <p>{{ error }}</p>
        </div>

        <button type="submit" :disabled="loading" class="admin-login-submit mt-7 w-full disabled:opacity-60">
          <svg v-if="authMode === 'supabase'" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.23-.19-1.77H12v3.4h5.52c-.11.85-.72 2.13-2.08 2.99l-.02.11 3.02 2.28.21.02c1.92-1.73 3.03-4.27 3.03-7.03Z" />
            <path fill="#34A853" d="M12 21.75c2.71 0 4.99-.87 6.65-2.37l-3.21-2.41c-.86.59-2.01 1-3.44 1-2.65 0-4.9-1.73-5.71-4.12l-.11.01-3.14 2.37-.04.1A10.01 10.01 0 0 0 12 21.75Z" />
            <path fill="#FBBC05" d="M6.29 13.85A5.95 5.95 0 0 1 5.97 12c0-.64.11-1.26.31-1.85l-.01-.12-3.18-2.41-.1.05A9.75 9.75 0 0 0 2 12c0 1.55.37 3.02.99 4.33l-3.3-2.48c-.1-.37-.14-.75-.14-1.14 0-.4.05-.78.15-1.15l3.3-2.48.1.05c.62-1.31 1.64-2.42 2.93-3.2Z" />
            <path fill="#EA4335" d="M12 6.03c1.8 0 3.02.76 3.71 1.4l2.71-2.58C16.98 3.54 14.71 2.25 12 2.25a10.01 10.01 0 0 0-9.01 5.42l3.3 2.48C7.1 7.76 9.35 6.03 12 6.03Z" />
          </svg>
          <span>{{ loading ? 'Signing in…' : authMode === 'supabase' ? 'Continue with Google' : 'Sign in' }}</span>
        </button>

        <p class="admin-login-footnote">Access is checked after Google sign-in. A valid Google account alone does not grant organizer access.</p>
      </form>
    </main>
  </div>
</template>

<style scoped>
.admin-login-page {
  min-height: calc(100vh - 4rem);
  background:
    radial-gradient(circle at 12% 16%, rgba(232, 17, 127, 0.12), transparent 26rem),
    linear-gradient(135deg, #fffdf8 0%, #f5f0e7 100%);
  -webkit-font-smoothing: antialiased;
}

.admin-login-shell {
  display: grid;
  min-height: calc(100vh - 4rem);
  max-width: 1120px;
  margin: 0 auto;
  align-items: center;
  gap: 4rem;
  padding: 3rem 1.5rem;
}

.admin-login-intro {
  display: grid;
  gap: 2rem;
  max-width: 33rem;
}

.admin-login-kicker {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #e8117f;
}

.admin-login-title {
  max-width: 8ch;
  margin: 0.6rem 0 0;
  color: #111111;
  font-size: clamp(3.25rem, 7vw, 5.75rem);
  font-weight: 900;
  letter-spacing: -0.065em;
  line-height: 0.91;
  text-wrap: balance;
}

.admin-login-lede {
  max-width: 29rem;
  margin: 1.35rem 0 0;
  color: #555;
  font-size: 1.1rem;
  line-height: 1.65;
  text-wrap: pretty;
}

.admin-login-points {
  display: grid;
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  color: #444;
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.45;
  list-style: none;
}

.admin-login-points li {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
}

.admin-login-points li::before {
  width: 0.55rem;
  height: 0.55rem;
  flex: 0 0 auto;
  margin-top: 0.36rem;
  background: #e8117f;
  content: '';
  transform: rotate(45deg);
}

.admin-login-card {
  width: 100%;
  max-width: 29rem;
  justify-self: end;
  padding: clamp(1.75rem, 4vw, 2.75rem);
  border: 1px solid rgba(17, 17, 17, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px rgba(24, 18, 8, 0.06), 0 24px 64px rgba(24, 18, 8, 0.12);
}

.admin-login-error {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(185, 28, 28, 0.28);
  border-radius: 10px;
  background: #fff1f1;
  color: #b91c1c;
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.45;
}

.admin-login-error span {
  display: grid;
  width: 1.2rem;
  height: 1.2rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 999px;
  background: #b91c1c;
  color: #fff;
  font-size: 0.75rem;
}

.admin-login-error p { margin: 0; }

.admin-login-submit {
  display: inline-flex;
  min-height: 3.25rem;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  padding: 0.75rem 1rem;
  border: 1px solid #111;
  border-radius: 10px;
  background: #111;
  box-shadow: 0 3px 0 #e8117f;
  color: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.84rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  transition-property: transform, box-shadow, background-color;
  transition-duration: 160ms;
  transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}

.admin-login-submit svg { width: 1.15rem; height: 1.15rem; }
.admin-login-submit:active { transform: scale(0.96); }
.admin-login-submit:focus-visible { outline: 3px solid rgba(232, 17, 127, 0.4); outline-offset: 3px; }
.admin-login-submit:disabled { cursor: wait; }

.admin-login-footnote {
  margin: 1.5rem 0 0;
  color: #707070;
  font-size: 0.76rem;
  line-height: 1.55;
  text-wrap: pretty;
}

@media (hover: hover) and (pointer: fine) {
  .admin-login-submit:not(:disabled):hover {
    background: #2a2a2a;
    box-shadow: 0 5px 0 #e8117f;
    transform: translateY(-2px);
  }
}

@media (min-width: 768px) {
  .admin-login-shell { grid-template-columns: minmax(0, 1fr) minmax(24rem, 29rem); }
}

@media (max-width: 767px) {
  .admin-login-shell { gap: 2.5rem; padding-block: 2.25rem; }
  .admin-login-intro { gap: 1.4rem; }
  .admin-login-points { display: none; }
  .admin-login-card { justify-self: stretch; }
}

@media (prefers-reduced-motion: reduce) {
  .admin-login-submit { transition: none; }
}
</style>
