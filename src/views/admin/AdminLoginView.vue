<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ADMIN_OAUTH_REDIRECT_STORAGE_KEY, adminPath } from '@/src/admin-routes';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { fetchAdminSession } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const route = useRoute();
const router = useRouter();
const password = ref('');
const authMode = ref<'supabase' | 'local'>('supabase');
const loading = ref(false);
const error = ref<string | null>(null);
const redirectTo = computed(() => String(route.query.redirect ?? route.query.next ?? adminPath('events')));
const ADMIN_LOGIN_TOAST_ID = 'admin-login-toast';

function notifyAdminLogin(kind: 'success' | 'info' | 'error', message: string, duration: number) {
  notify[kind](message, {
    id: ADMIN_LOGIN_TOAST_ID,
    duration,
  });
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
        notifyAdminLogin('error', 'Unable to start Google sign-in. Please try again.', 7000);
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
      notifyAdminLogin('error', 'Invalid admin password', 7000);
      return;
    }

    await router.push(redirectTo.value);
  } catch {
    notifyAdminLogin('error', 'Unable to sign in. Please check your connection and try again.', 7000);
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
  <div class="editorial-page">
    <div class="admin-login-wrap flex min-h-[calc(100vh-6rem)] items-center justify-center px-4 py-12">
      <form class="admin-login-card editorial-panel w-full max-w-md p-8 sm:p-10" @submit.prevent="login">
        <p class="editorial-eyebrow">organizer access</p>
        <h1 class="admin-login-title mt-3 text-4xl font-black tracking-tight text-dc-ink">Admin Sign In</h1>
        <p class="admin-login-copy mt-3 text-sm leading-6 text-dc-gray">
          {{ authMode === 'supabase' ? 'Use your approved Google account to open the organizer console.' : 'Use the local admin password to manage events, talks, speakers, attendance, and feedback.' }}
        </p>

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

        <div v-if="error" class="admin-login-error mt-4 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {{ error }}
        </div>

        <button type="submit" :disabled="loading" class="admin-login-submit editorial-action mt-6 w-full justify-center disabled:opacity-60">
          {{
            loading
              ? 'Signing in...'
              : authMode === 'supabase'
                ? 'Continue With Google'
                : 'Sign In'
          }}
        </button>
      </form>
    </div>
  </div>
</template>
