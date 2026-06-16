<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();
const router = useRouter();
const password = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.error === 'string' ? data.error : 'Unable to sign in';
  } catch {
    return 'Unable to sign in. Please check your connection and try again.';
  }
}

async function login() {
  loading.value = true;
  error.value = null;

  try {
    const response = await fetch('/api/auth/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    });

    if (!response.ok) {
      error.value = await readErrorMessage(response);
      return;
    }

    await router.push(String(route.query.redirect ?? adminPath('events')));
  } catch {
    error.value = 'Unable to sign in. Please check your connection and try again.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="editorial-page">
    <div class="admin-login-wrap flex min-h-[calc(100vh-6rem)] items-center justify-center px-4 py-12">
      <form class="admin-login-card editorial-panel w-full max-w-md p-8 sm:p-10" @submit.prevent="login">
        <p class="editorial-eyebrow">organizer access</p>
        <h1 class="admin-login-title mt-3 text-4xl font-black tracking-tight text-dc-ink">Admin Sign In</h1>
        <p class="admin-login-copy mt-3 text-sm leading-6 text-dc-gray">
          Use the local admin password to manage events, talks, speakers, attendance, and feedback.
        </p>

        <label class="mt-8 block">
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

        <button type="submit" :disabled="loading" class="admin-login-submit editorial-action mt-6 w-full justify-center disabled:opacity-60">
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>
