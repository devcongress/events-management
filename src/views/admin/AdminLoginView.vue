<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminPath } from '@/src/admin-routes';
import { fetchAdminSession } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const route = useRoute();
const router = useRouter();
const email = ref('');
const password = ref('');
const authMode = ref<'supabase' | 'local'>('supabase');
const loading = ref(false);
const error = ref<string | null>(null);
const redirectTo = computed(() => String(route.query.redirect ?? route.query.next ?? adminPath('events')));
const cooldownUntil = ref(0);
const nowMs = ref(Date.now());
let cooldownTimer: number | undefined;
const ADMIN_LOGIN_TOAST_ID = 'admin-login-toast';
const ADMIN_LOGIN_COOLDOWN_STORAGE_KEY = 'devcon-admin-login-cooldown-until';

const cooldownRemainingMs = computed(() => Math.max(0, cooldownUntil.value - nowMs.value));
const cooldownRemainingSeconds = computed(() => Math.ceil(cooldownRemainingMs.value / 1000));
const resendDisabled = computed(() => authMode.value === 'supabase' && cooldownRemainingMs.value > 0);

async function readResponsePayload(response: Response): Promise<{ message: string; retryAfterMs: number | null }> {
  try {
    const data = await response.json();
    return {
      message: typeof data.error === 'string' ? data.error : 'Unable to sign in',
      retryAfterMs: typeof data.retry_after_ms === 'number' ? data.retry_after_ms : null,
    };
  } catch {
    return {
      message: 'Unable to sign in. Please check your connection and try again.',
      retryAfterMs: null,
    };
  }
}

function startCooldown(retryAfterMs: number) {
  cooldownUntil.value = Date.now() + retryAfterMs;
  nowMs.value = Date.now();
  window.localStorage.setItem(ADMIN_LOGIN_COOLDOWN_STORAGE_KEY, String(cooldownUntil.value));

  if (cooldownTimer !== undefined) {
    window.clearInterval(cooldownTimer);
  }

  cooldownTimer = window.setInterval(() => {
    nowMs.value = Date.now();
    if (Date.now() >= cooldownUntil.value) {
      if (cooldownTimer !== undefined) {
        window.clearInterval(cooldownTimer);
        cooldownTimer = undefined;
      }
      window.localStorage.removeItem(ADMIN_LOGIN_COOLDOWN_STORAGE_KEY);
    }
  }, 1000);
}

function notifyAdminLogin(kind: 'success' | 'info' | 'error', message: string, duration: number) {
  notify[kind](message, {
    id: ADMIN_LOGIN_TOAST_ID,
    duration,
  });
}

async function login() {
  if (resendDisabled.value) {
    notifyAdminLogin(
      'info',
      `Please wait about ${cooldownRemainingSeconds.value} second${cooldownRemainingSeconds.value === 1 ? '' : 's'} before sending another sign-in link.`,
      5000,
    );
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    const response = await fetch('/api/auth/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authMode.value === 'supabase'
        ? { email: email.value, redirect_to: redirectTo.value }
        : { password: password.value }),
    });

    if (!response.ok) {
      const { message, retryAfterMs } = await readResponsePayload(response);
      if (retryAfterMs) {
        startCooldown(retryAfterMs);
      }
      notifyAdminLogin('error', message, 7000);
      return;
    }

    if (authMode.value === 'supabase') {
      const payload = await response.json() as { retry_after_ms?: number; message?: string };
      if (typeof payload.retry_after_ms === 'number') {
        startCooldown(payload.retry_after_ms);
      }
      email.value = '';
      notifyAdminLogin(
        'success',
        payload.message ?? 'If this email is allowed, a secure organizer sign-in link has been sent.',
        9000,
      );
      return;
    }

    await router.push(redirectTo.value);
  } catch {
    notifyAdminLogin('error', 'Unable to sign in. Please check your connection and try again.', 7000);
  } finally {
    loading.value = false;
  }
}

function clearAuthHash() {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

async function exchangeSupabaseHash(): Promise<boolean> {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashError = hashParams.get('error_description') || hashParams.get('error');
  const accessToken = hashParams.get('access_token');

  if (hashError) {
    error.value = hashError;
    clearAuthHash();
    return true;
  }

  if (!accessToken) return false;

  loading.value = true;
  error.value = null;

  try {
    const response = await fetch('/api/auth/admin/exchange', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    });

    clearAuthHash();

    if (!response.ok) {
      const { message } = await readResponsePayload(response);
      error.value = message;
      return true;
    }

    await router.replace(redirectTo.value);
    return true;
  } catch {
    clearAuthHash();
    error.value = 'Unable to finish sign in. Please request a new link.';
    return true;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const storedCooldownUntil = Number(window.localStorage.getItem(ADMIN_LOGIN_COOLDOWN_STORAGE_KEY) ?? '0');
  if (Number.isFinite(storedCooldownUntil) && storedCooldownUntil > Date.now()) {
    cooldownUntil.value = storedCooldownUntil;
    nowMs.value = Date.now();
    startCooldown(storedCooldownUntil - Date.now());
  } else {
    window.localStorage.removeItem(ADMIN_LOGIN_COOLDOWN_STORAGE_KEY);
  }

  const callbackError = route.query.error;
  if (typeof callbackError === 'string' && callbackError) {
    error.value = callbackError;
  }

  if (window.location.hash && await exchangeSupabaseHash()) {
    return;
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

onUnmounted(() => {
  if (cooldownTimer !== undefined) {
    window.clearInterval(cooldownTimer);
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
          {{ authMode === 'supabase' ? 'Use your organizer email to receive a secure sign-in link.' : 'Use the local admin password to manage events, talks, speakers, attendance, and feedback.' }}
        </p>

        <label v-if="authMode === 'supabase'" class="mt-8 block">
          <span class="editorial-label">Organizer email</span>
          <input
            v-model="email"
            autofocus
            required
            class="editorial-input mt-2"
            type="email"
            autocomplete="email"
            placeholder="organizer@devcongress.org"
          >
        </label>

        <label v-else class="mt-8 block">
          <span class="editorial-label">Password</span>
          <input
            v-model="password"
            autofocus
            required
            class="editorial-input mt-2"
            type="password"
            autocomplete="current-password"
            placeholder="Admin password"
          >
        </label>

        <div v-if="error" class="admin-login-error mt-4 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {{ error }}
        </div>

        <button type="submit" :disabled="loading || resendDisabled" class="admin-login-submit editorial-action mt-6 w-full justify-center disabled:opacity-60">
          {{
            loading
              ? 'Signing in...'
              : authMode === 'supabase' && resendDisabled
                ? `Send again in ${cooldownRemainingSeconds}s`
                : authMode === 'supabase'
                  ? 'Send Sign-In Link'
                  : 'Sign In'
          }}
        </button>
      </form>
    </div>
  </div>
</template>
