<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ADMIN_OAUTH_REDIRECT_STORAGE_KEY,
  adminPath,
  safeInternalAppPath,
} from '@/src/admin-routes';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  adminAuthFailureReasonForStatus,
  type AdminAuthFailureReason,
} from '@/src/lib/admin-auth-flow';
import { queryClient } from '@/src/lib/query';
import {
  beginAdminSessionTransition,
  refreshAdminSessionAfterTransition,
} from '@/src/lib/admin-session-transition';
import { matchesOrganizerPhoneViewport, organizerPostAuthLanding } from '@/src/organizer-viewport';
import AdminLoginView from './AdminLoginView.vue';

const route = useRoute();
const router = useRouter();
const redirectTo = computed(() => (
  safeInternalAppPath(route.query.next)
  ?? safeInternalAppPath(route.query.redirect)
  ?? adminPath('events')
));

async function redirectToLogin(reason?: AdminAuthFailureReason) {
  window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);

  const query: Record<string, string> = {
    redirect: redirectTo.value,
  };

  if (reason) query.auth_reason = reason;

  await router.replace({
    path: adminPath('login'),
    query,
  });
}

onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : '';
  const callbackError = typeof route.query.error === 'string' ? route.query.error : '';

  if (callbackError) {
    await redirectToLogin('oauth_failed');

    return;
  }

  if (code) {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      await redirectToLogin('service_unavailable');

      return;
    }

    try {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError || !data.session?.access_token) {
        await redirectToLogin('oauth_failed');

        return;
      }

      const response = await fetch('/api/auth/admin/exchange', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: data.session.access_token }),
      });

      if (!response.ok) {
        await beginAdminSessionTransition(queryClient);
        await redirectToLogin(adminAuthFailureReasonForStatus(response.status));

        return;
      }

      const exchange = await response.json() as { outcome?: 'authenticated' | 'access_request' };

      if (exchange.outcome === 'access_request') {
        await beginAdminSessionTransition(queryClient);
        window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);
        await router.replace({ path: '/access-request' });

        return;
      }

      const session = await refreshAdminSessionAfterTransition(queryClient);

      if (!session.authenticated) {
        await redirectToLogin('oauth_failed');

        return;
      }

      await router.replace(organizerPostAuthLanding(
        redirectTo.value,
        session.user?.role,
        matchesOrganizerPhoneViewport(),
      ));
      window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);

      return;
    } catch {
      await beginAdminSessionTransition(queryClient);
      await redirectToLogin('service_unavailable');

      return;
    } finally {
      await supabase.auth.signOut().catch(() => undefined);
    }
  }

  try {
    const session = await refreshAdminSessionAfterTransition(queryClient);

    if (session.authenticated) {
      await router.replace(organizerPostAuthLanding(
        redirectTo.value,
        session.user?.role,
        matchesOrganizerPhoneViewport(),
      ));

      return;
    }
  } catch {
    // Fall through to the login page when the hosted API/session check is unreachable.
  }

  await redirectToLogin();
});
</script>

<template>
  <AdminLoginView
    managed
    access-title="Confirming access."
    access-description="Google sign-in is complete. We are checking organizer approval."
    action-label="Confirming organizer access…"
    access-note="The protected workspace stays closed until this check succeeds."
    busy
    action-disabled
  />
</template>
