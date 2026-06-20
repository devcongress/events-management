<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ADMIN_OAUTH_REDIRECT_STORAGE_KEY, adminPath } from '@/src/admin-routes';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { fetchAdminSession, queryKeys } from '@/src/lib/api';
import { queryClient } from '@/src/lib/query';

const route = useRoute();
const router = useRouter();
const error = ref<string | null>(null);
const loading = ref(true);
const redirectTo = computed(() => String(route.query.next ?? route.query.redirect ?? adminPath('events')));

async function redirectToLogin(message?: string) {
  window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);

  const query: Record<string, string> = {
    redirect: redirectTo.value,
  };

  if (message) {
    query.error = message;
  }

  await router.replace({
    path: adminPath('login'),
    query,
  });
}

onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : '';
  const callbackError = typeof route.query.error === 'string' ? route.query.error : '';

  if (callbackError) {
    await redirectToLogin(callbackError);
    return;
  }

  if (code) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      await redirectToLogin('Google organizer sign-in is not configured yet.');
      return;
    }

    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError || !data.session?.access_token) {
        console.warn('Organizer Google OAuth code exchange failed:', exchangeError?.message ?? 'Missing access token');
        await redirectToLogin('Google organizer sign-in could not be completed. Please try again.');
        return;
      }

      const response = await fetch('/api/auth/admin/exchange', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: data.session.access_token }),
      });

      await supabase.auth.signOut();

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        await redirectToLogin(payload?.error ?? 'Google organizer sign-in could not be completed. Please try again.');
        return;
      }

      const session = await queryClient.fetchQuery({
        queryKey: queryKeys.adminSession,
        queryFn: fetchAdminSession,
        staleTime: 0,
      });
      if (!session.authenticated) {
        await redirectToLogin('Google organizer sign-in could not be completed. Please try again.');
        return;
      }

      await router.replace(redirectTo.value);
      window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);
      return;
    } catch {
      await redirectToLogin('Google organizer sign-in could not be completed. Please try again.');
      return;
    }
  }

  try {
    const session = await fetchAdminSession();
    if (session.authenticated) {
      await router.replace(redirectTo.value);
      return;
    }
  } catch {
    // Fall through to the login page when the hosted API/session check is unreachable.
  }

  loading.value = false;
  error.value = 'Organizer sign-in now uses Google. Return to the sign-in page and continue with your approved account.';
});
</script>

<template>
  <div class="editorial-page">
    <div class="flex min-h-[calc(100vh-6rem)] items-center justify-center px-4 py-12">
      <div class="editorial-panel w-full max-w-md p-8 text-center sm:p-10">
        <p class="editorial-eyebrow">organizer access</p>
        <h1 class="mt-3 text-4xl font-black tracking-tight text-dc-ink">
          {{ loading ? 'Checking Session' : 'Use Google Sign-In' }}
        </h1>
        <p class="mt-3 text-sm leading-6 text-dc-gray">
          {{
            loading
              ? 'We are checking whether your organizer session is already active.'
              : error
          }}
        </p>

        <button
          v-if="!loading"
          type="button"
          class="editorial-action mt-6 w-full justify-center"
          @click="redirectToLogin()"
        >
          Back to Sign In
        </button>
      </div>
    </div>
  </div>
</template>
