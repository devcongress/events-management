<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { adminPath } from '@/src/admin-routes';

const route = useRoute();
const router = useRouter();
const password = ref('');
const loading = ref(false);
const error = ref<string | null>(null);

async function login() {
  loading.value = true;
  error.value = null;

  const response = await fetch('/api/auth/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password.value }),
  });

  if (!response.ok) {
    const data = await response.json();
    error.value = data.error || 'Unable to sign in';
    loading.value = false;
    return;
  }

  await router.push(String(route.query.redirect ?? adminPath('events')));
}
</script>

<template>
  <div class="editorial-page">
    <div class="flex min-h-[calc(100vh-6rem)] items-center justify-center px-4 py-12">
      <form class="editorial-panel w-full max-w-md p-8 sm:p-10" @submit.prevent="login">
        <p class="editorial-eyebrow">organizer access</p>
        <h1 class="mt-3 text-4xl font-black tracking-tight text-white">Admin Sign In</h1>
        <p class="mt-3 text-sm leading-6 text-dc-gray-light">
          Use the local admin password to manage events, talks, speakers, and live quiz sessions.
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

        <div v-if="error" class="mt-4 border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {{ error }}
        </div>

        <button type="submit" :disabled="loading" class="editorial-action mt-6 w-full justify-center disabled:opacity-60">
          {{ loading ? 'Signing in...' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>
