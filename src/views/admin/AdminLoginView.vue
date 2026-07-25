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
  <div class="editorial-page flex min-h-full items-center justify-center p-4 sm:p-6">
    <form class="editorial-panel grid w-full max-w-5xl overflow-hidden lg:min-h-[30rem] lg:grid-cols-[1.15fr_0.85fr]" aria-labelledby="organizer-login-title" @submit.prevent="login">
      <section class="flex flex-col border-b-2 border-dc-ink bg-dc-ink px-6 py-7 text-dc-paper sm:px-9 sm:py-9 lg:border-b-0 lg:border-r-2 lg:px-12 lg:py-11">
        <div class="flex items-center justify-between gap-4">
          <img :src="logoSrc" alt="DevCongress" class="h-7 w-auto max-w-[12rem] object-contain" />
          <span class="inline-flex min-h-9 items-center rounded-md border-2 border-dc-paper bg-dc-yellow px-3 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-dc-ink">Private</span>
        </div>
        <div class="mt-10 lg:mt-auto">
          <p class="font-mono text-xs font-bold uppercase tracking-[0.24em] text-dc-pink">Organizer console</p>
          <h1 id="organizer-login-title" class="mt-4 max-w-[10ch] text-4xl font-black leading-[0.94] tracking-tight text-dc-paper sm:text-5xl">Keep the event moving.</h1>
          <p class="mt-5 max-w-md text-base leading-7 text-dc-paper/75">
            Plan the programme, coordinate speakers, manage attendance, and close the feedback loop.
          </p>
        </div>
        <div class="mt-8 flex flex-wrap gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-dc-paper/75 lg:mt-10">
          <span class="border border-dc-paper/35 px-2 py-1">Events</span>
          <span class="border border-dc-paper/35 px-2 py-1">People</span>
          <span class="border border-dc-paper/35 px-2 py-1">Follow-up</span>
        </div>
      </section>

      <section class="flex flex-col bg-dc-paper px-6 py-7 sm:px-9 sm:py-9 lg:px-10 lg:py-11">
        <div>
          <p class="editorial-eyebrow">Organizer access</p>
          <h2 class="mt-4 text-3xl font-black leading-[0.98] tracking-tight text-dc-ink sm:text-4xl">Ready when you are.</h2>
          <p class="mt-4 text-sm leading-6 text-dc-gray">
            {{ authMode === 'supabase' ? 'Use your Google account to continue.' : 'Use the local admin password to continue.' }}
          </p>
        </div>

        <div class="mt-8 lg:mt-auto">
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

          <div v-if="error" class="mt-5 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700" role="alert">
            {{ error }}
          </div>

          <button type="submit" :disabled="loading" class="editorial-action mt-6 min-h-14 w-full justify-center disabled:opacity-60">
            {{ loading ? 'Signing in...' : authMode === 'supabase' ? 'Continue with Google' : 'Sign in' }}
          </button>
        </div>
      </section>
    </form>
  </div>
</template>
