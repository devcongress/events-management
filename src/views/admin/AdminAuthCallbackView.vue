<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
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
import {
  createAdminAuthCallbackDeadline,
  AdminAuthCallbackTimeoutError,
  type AdminAuthCallbackDeadline,
  waitForAdminAuthCallbackStep,
} from '@/src/lib/admin-auth-callback-timeout';
import { exchangeAdminToken } from '@/src/lib/admin-auth-callback-exchange';
import { queryClient } from '@/src/lib/query';
import {
  beginAdminSessionTransition,
  refreshAdminSessionAfterTransition,
} from '@/src/lib/admin-session-transition';
import { matchesOrganizerPhoneViewport, organizerPostAuthLanding } from '@/src/organizer-viewport';
import AdminLoginView from './AdminLoginView.vue';

const route = useRoute();
const router = useRouter();
const recoveryRequired = ref(false);
const redirectTo = computed(() => (
  safeInternalAppPath(route.query.next)
  ?? safeInternalAppPath(route.query.redirect)
  ?? adminPath('events')
));

async function redirectToLogin(
  reason?: AdminAuthFailureReason,
  callbackDeadline?: AdminAuthCallbackDeadline,
) {
  window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);

  const query: Record<string, string> = {
    redirect: redirectTo.value,
  };

  if (reason) query.auth_reason = reason;

  const runStep = callbackDeadline?.run ?? waitForAdminAuthCallbackStep;

  await runStep(() => router.replace({
    path: adminPath('login'),
    query,
  }));
}

async function showRecovery() {
  recoveryRequired.value = true;
  window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);

  try {
    await waitForAdminAuthCallbackStep(() => beginAdminSessionTransition(queryClient));
  } catch {
    // The app session is server-authoritative. Keep the retry state visible if
    // cache cleanup itself is interrupted by an unavailable browser runtime.
  }
}

async function retrySignIn() {
  await redirectToLogin('service_unavailable');
}

onMounted(async () => {
  const callbackDeadline = createAdminAuthCallbackDeadline();
  const code = typeof route.query.code === 'string' ? route.query.code : '';
  const callbackError = typeof route.query.error === 'string' ? route.query.error : '';

  if (callbackError) {
    try {
      await redirectToLogin('oauth_failed', callbackDeadline);
    } catch (error) {
      if (error instanceof AdminAuthCallbackTimeoutError) {
        await showRecovery();
      } else {
        try {
          await redirectToLogin('service_unavailable', callbackDeadline);
        } catch {
          await showRecovery();
        }
      }
    }

    return;
  }

  if (code) {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      try {
        await redirectToLogin('service_unavailable');
      } catch {
        await showRecovery();
      }

      return;
    }

    try {
      const { data, error: exchangeError } = await callbackDeadline.run(
        () => supabase.auth.exchangeCodeForSession(code),
      );

      if (exchangeError || !data.session?.access_token) {
        await redirectToLogin('oauth_failed', callbackDeadline);

        return;
      }

      const response = await exchangeAdminToken(data.session.access_token, callbackDeadline);

      if (!response.ok) {
        await callbackDeadline.run(() => beginAdminSessionTransition(queryClient));
        await redirectToLogin(adminAuthFailureReasonForStatus(response.status), callbackDeadline);

        return;
      }

      const exchange = await callbackDeadline.run(
        () => response.json() as Promise<{ outcome?: 'authenticated' | 'access_request' }>,
      );

      if (exchange.outcome === 'access_request') {
        await callbackDeadline.run(() => beginAdminSessionTransition(queryClient));
        window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);
        await callbackDeadline.run(() => router.replace({ path: '/access-request' }));

        return;
      }

      const session = await callbackDeadline.run(
        () => refreshAdminSessionAfterTransition(queryClient),
      );

      if (!session.authenticated) {
        await redirectToLogin('oauth_failed', callbackDeadline);

        return;
      }

      await callbackDeadline.run(() => router.replace(organizerPostAuthLanding(
        redirectTo.value,
        session.user?.role,
        matchesOrganizerPhoneViewport(),
      )));
      window.sessionStorage.removeItem(ADMIN_OAUTH_REDIRECT_STORAGE_KEY);

      return;
    } catch (error) {
      if (error instanceof AdminAuthCallbackTimeoutError) {
        await showRecovery();
      } else {
        try {
          await redirectToLogin('service_unavailable', callbackDeadline);
        } catch {
          await showRecovery();
        }
      }

      return;
    } finally {
      await callbackDeadline.run(
        () => supabase.auth.signOut().catch(() => undefined),
      ).catch(() => undefined);
    }
  }

  try {
    const session = await callbackDeadline.run(
      () => refreshAdminSessionAfterTransition(queryClient),
    );

    if (session.authenticated) {
      await callbackDeadline.run(() => router.replace(organizerPostAuthLanding(
        redirectTo.value,
        session.user?.role,
        matchesOrganizerPhoneViewport(),
      )));

      return;
    }
  } catch {
    await showRecovery();

    return;
  }

  try {
    await redirectToLogin(undefined, callbackDeadline);
  } catch {
    await showRecovery();
  }
});
</script>

<template>
  <AdminLoginView
    managed
    :access-title="recoveryRequired ? 'We could not confirm access.' : 'Confirming access.'"
    :access-description="recoveryRequired
      ? 'Organizer sign-in took too long. We could not confirm access in this tab.'
      : 'Google sign-in is complete. We are checking organizer approval.'"
    :action-label="recoveryRequired ? 'Try Google sign-in again' : 'Confirming organizer access…'"
    :access-note="recoveryRequired
      ? 'Try again with an approved account. The protected workspace stays closed until a check succeeds.'
      : 'The protected workspace stays closed until this check succeeds.'"
    :error="recoveryRequired ? 'Organizer sign-in could not be completed.' : null"
    :busy="!recoveryRequired"
    :action-disabled="!recoveryRequired"
    secondary-action-label="Return to organizer sign-in"
    @primary="retrySignIn"
    @secondary="retrySignIn"
  />
</template>
