<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ADMIN_OAUTH_REDIRECT_STORAGE_KEY, adminPath } from '@/src/admin-routes';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { fetchAdminSession } from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

const PROGRAMME_COVER = {
  eyebrow: 'Organizer desk / Private',
  titleLines: ['Ideas need', 'a room.'],
  lede: 'Rooms need an organizer.',
  accessLabel: 'Organizer sign-in',
  accessTitle: 'Back to the work.',
  footerLeft: 'DevCongress · Event operations',
  footerRight: 'Programme 2026',
} as const;

const route = useRoute();
const router = useRouter();
const authConfigured = ref(false);
const authResolved = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const redirectTo = computed(() => String(route.query.redirect ?? route.query.next ?? adminPath('events')));
const LOCAL_GOOGLE_OAUTH_ORIGIN = 'http://localhost:5173';
const logoSrc = '/brand/dev-con-logo.png';

const accessDescription = computed(() => {
  if (!authResolved.value) {
    return 'Confirming how this organizer workspace is secured.';
  }

  return authConfigured.value
    ? 'Continue with an approved Google account.'
    : 'Google organizer sign-in is not configured in this environment.';
});

const actionLabel = computed(() => {
  if (!authResolved.value) return 'Checking access…';
  if (loading.value) return 'Opening Google…';
  return 'Continue with Google';
});

const accessNote = computed(() => {
  if (!authResolved.value) return 'Your destination will be preserved while we check.';
  if (!authConfigured.value) return 'Ask an owner to configure Supabase organizer access.';
  return 'Access is limited to approved DevCongress organizers.';
});

function isLocalBrowserOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

async function login() {
  if (!authResolved.value || !authConfigured.value) return;

  loading.value = true;
  error.value = null;

  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      error.value = 'Google organizer sign-in is not configured yet.';
      return;
    }

    if (isLocalBrowserOrigin(window.location.origin) && window.location.origin !== LOCAL_GOOGLE_OAUTH_ORIGIN) {
      error.value = `Google sign-in only works on ${LOCAL_GOOGLE_OAUTH_ORIGIN} locally. Restart there.`;
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
    }
  } catch {
    error.value = 'Unable to sign in. Please check your connection and try again.';
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  const callbackError = route.query.error;
  if (typeof callbackError === 'string' && callbackError) {
    notify.error(callbackError);
    await router.replace({
      query: {
        ...route.query,
        error: undefined,
      },
    });
  }

  try {
    const session = await fetchAdminSession();
    authConfigured.value = session.auth_configured;
    if (session.authenticated) {
      await router.replace(redirectTo.value);
    } else if (!session.auth_configured) {
      error.value = 'Google organizer sign-in is not configured in this environment.';
    }
  } catch {
    authConfigured.value = false;
    error.value = 'Unable to verify organizer access. Please check the local server and try again.';
  } finally {
    authResolved.value = true;
  }
});
</script>

<template>
  <div class="login-studio">
    <form
      class="login-concept"
      :aria-busy="loading || !authResolved"
      aria-labelledby="organizer-login-title"
      @submit.prevent="login"
    >
      <header class="login-masthead">
        <img :src="logoSrc" alt="DevCongress" class="login-logo">
        <div class="login-private">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M7.75 10V7.75a4.25 4.25 0 0 1 8.5 0V10M6.5 10h11a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z" />
          </svg>
          <span>Organizer only</span>
        </div>
      </header>

      <main class="login-core">
        <div class="login-object" aria-hidden="true">
          <div class="programme-index">
            <span>Programme</span>
            <strong>2026</strong>
            <small>Organizer edition</small>
          </div>
        </div>

        <section class="login-statement">
          <p class="login-eyebrow">{{ PROGRAMME_COVER.eyebrow }}</p>
          <h1
            id="organizer-login-title"
            :aria-label="PROGRAMME_COVER.titleLines.join(' ')"
          >
            <span v-for="line in PROGRAMME_COVER.titleLines" :key="line">{{ line }}</span>
          </h1>
          <span class="programme-measure" aria-hidden="true" />
          <p class="login-lede">{{ PROGRAMME_COVER.lede }}</p>
        </section>

        <section class="login-access" aria-labelledby="organizer-access-title">
          <div class="login-access__intro">
            <p class="login-access__label">{{ PROGRAMME_COVER.accessLabel }}</p>
            <h2 id="organizer-access-title">
              {{ authResolved ? PROGRAMME_COVER.accessTitle : 'Checking access.' }}
            </h2>
            <p>{{ accessDescription }}</p>
          </div>

          <div class="login-control">
            <div
              v-if="error"
              id="organizer-login-error"
              class="login-error"
              role="alert"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 8v4.5M12 16.25v.01M20.25 12A8.25 8.25 0 1 1 3.75 12a8.25 8.25 0 0 1 16.5 0Z" />
              </svg>
              <span>{{ error }}</span>
            </div>

            <button
              type="submit"
              class="login-submit"
              :disabled="loading || !authResolved || !authConfigured"
              :aria-busy="loading || !authResolved"
              :aria-describedby="error ? 'organizer-login-error organizer-access-note' : 'organizer-access-note'"
            >
              <span class="login-submit__content">
                <svg
                  v-if="authResolved && authConfigured"
                  class="google-mark"
                  aria-hidden="true"
                  viewBox="0 0 18 18"
                >
                  <path fill="#EA4335" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.876 2.684-6.614Z" />
                  <path fill="#4285F4" d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.258c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.585-5.037-3.714H.955v2.333A9 9 0 0 0 9 18Z" />
                  <path fill="#FBBC05" d="M3.963 10.707A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.168.281-1.707V4.96H.955A9 9 0 0 0 0 9c0 1.452.347 2.827.955 4.04l3.008-2.333Z" />
                  <path fill="#34A853" d="M9 3.58c1.321 0 2.508.454 3.442 1.346l2.581-2.581C13.464.892 11.426 0 9 0A9 9 0 0 0 .955 4.96l3.008 2.333C4.672 5.165 6.656 3.58 9 3.58Z" />
                </svg>
                <span>{{ actionLabel }}</span>
              </span>
              <svg class="login-submit__arrow" aria-hidden="true" viewBox="0 0 24 24">
                <path d="m9 5 7 7-7 7M4 12h12" />
              </svg>
            </button>

            <p id="organizer-access-note" class="login-access-note">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M8.5 10V7.5a3.5 3.5 0 1 1 7 0V10M7 10h10a1 1 0 0 1 1 1v8H6v-8a1 1 0 0 1 1-1Z" />
              </svg>
              {{ accessNote }}
            </p>
          </div>
        </section>
      </main>

      <footer class="login-footer">
        <span>{{ PROGRAMME_COVER.footerLeft }}</span>
        <span>{{ PROGRAMME_COVER.footerRight }}</span>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.login-studio {
  --login-ink: #111111;
  --login-muted: #555555;
  --login-border: #e0ddd4;
  --login-paper: #ffffff;
  --login-cream: #f5f2e8;
  --login-yellow: #f5e642;
  --login-pink: #e8117f;
  position: absolute;
  inset: 0;
  width: 100%;
  height: auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--login-cream);
  color: var(--login-ink);
  overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
  -webkit-overflow-scrolling: touch;
}

.login-submit:focus-visible,
.login-field input:focus-visible {
  outline: 3px solid var(--login-pink);
  outline-offset: 3px;
}

.login-concept {
  display: flex;
  width: 100%;
  min-height: 100%;
  flex-direction: column;
  padding:
    max(2rem, env(safe-area-inset-top))
    max(clamp(1.25rem, 4vw, 4.5rem), env(safe-area-inset-right))
    max(1.5rem, env(safe-area-inset-bottom))
    max(clamp(1.25rem, 4vw, 4.5rem), env(safe-area-inset-left));
}

.login-masthead,
.login-footer {
  position: relative;
  z-index: 2;
  display: flex;
  width: 100%;
  max-width: 80rem;
  align-items: center;
  justify-content: space-between;
  margin-inline: auto;
}

.login-masthead {
  min-height: 2.5rem;
}

.login-logo {
  width: auto;
  height: 1.75rem;
  max-width: 11rem;
  object-fit: contain;
}

.login-private {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  gap: 0.45rem;
  border: 1px solid currentColor;
  border-radius: 0.375rem;
  padding: 0 0.65rem;
  font-family: var(--font-mono);
  font-size: 0.6rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.login-private svg,
.login-access-note svg {
  width: 0.9rem;
  height: 0.9rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.login-core {
  position: relative;
  z-index: 1;
  width: 100%;
}

.login-eyebrow,
.login-access__label {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.login-statement h1,
.login-statement p,
.login-access h2,
.login-access p {
  margin: 0;
}

.login-statement h1 span {
  display: block;
}

.login-lede,
.login-access__intro > p:last-child {
  color: var(--login-muted);
}

.login-access__intro h2 {
  text-wrap: balance;
}

.login-control {
  width: 100%;
}

.login-field {
  display: grid;
  gap: 0.5rem;
  margin-bottom: 0.85rem;
}

.login-field > span {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.login-field input {
  width: 100%;
  min-height: 3.35rem;
  border: 1px solid var(--login-border);
  border-radius: 0.5rem;
  background: var(--login-paper);
  padding: 0.75rem 0.9rem;
  color: var(--login-ink);
  font: inherit;
}

.login-field input::placeholder {
  color: #8b887f;
}

.login-field input:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.login-error {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.65rem;
  align-items: start;
  margin-bottom: 0.85rem;
  border: 1px solid #e8117f;
  border-radius: 0.5rem;
  background: #ffffff;
  padding: 0.75rem 0.8rem;
  color: #a61b34;
  font-size: 0.8rem;
  font-weight: var(--font-weight-emphasis);
  line-height: 1.45;
}

.login-error svg {
  width: 1rem;
  height: 1rem;
  margin-top: 0.08rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.login-submit {
  display: flex;
  width: 100%;
  min-height: 3.5rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border: 1px solid var(--login-ink);
  border-radius: 0.5rem;
  background: var(--login-ink);
  padding: 0.75rem 1rem;
  color: #ffffff;
  font-family: var(--font-sans);
  font-size: 0.9rem;
  font-weight: var(--font-weight-label);
  line-height: 1.2;
  transition:
    background-color 180ms var(--motion-fast),
    color 180ms var(--motion-fast),
    border-color 180ms var(--motion-fast);
}

.login-submit:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.login-submit__content {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 0.7rem;
}

.google-mark {
  width: 1.1rem;
  height: 1.1rem;
  flex: 0 0 auto;
}

.login-submit__arrow {
  width: 1.25rem;
  height: 1.25rem;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  transition: transform 160ms var(--motion-spring);
}

.login-access-note {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  margin-top: 0.8rem !important;
  color: var(--login-muted);
  font-size: 0.72rem;
  line-height: 1.5;
}

.login-access-note svg {
  flex: 0 0 auto;
  margin-top: 0.08rem;
}

.login-footer {
  border-top: 1px solid var(--login-border);
  padding-top: 0.85rem;
  color: var(--login-muted);
  font-family: var(--font-mono);
  font-size: 0.58rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.login-concept {
  background: var(--login-cream);
}

.login-core {
  display: grid;
  flex: 1 0 auto;
  grid-template-columns: minmax(0, 1.7fr) minmax(19rem, 0.55fr);
  gap: clamp(3rem, 8vw, 8rem);
  max-width: 80rem;
  align-items: center;
  margin: 4.5rem auto 2.5rem;
  padding: clamp(3rem, 8vh, 6.5rem) 0 clamp(2rem, 5vh, 4rem);
}

.login-object {
  position: absolute;
  right: 36%;
  bottom: 1.5rem;
  color: rgba(17, 17, 17, 0.14);
}

.programme-index {
  display: grid;
  justify-items: end;
  font-family: var(--font-mono);
  text-transform: uppercase;
}

.programme-index span,
.programme-index small {
  font-size: 0.56rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.12em;
}

.programme-index strong {
  font-family: var(--font-sans);
  font-size: clamp(3.75rem, 6.5vw, 6rem);
  font-weight: var(--font-weight-display);
  letter-spacing: -0.065em;
  line-height: 0.78;
}

.login-statement {
  position: relative;
}

.login-eyebrow {
  margin-bottom: clamp(1.5rem, 3vh, 2.5rem);
}

.login-statement h1 {
  max-width: 8ch;
  font-size: clamp(4.6rem, 9.5vw, 8.5rem);
  font-weight: var(--font-weight-display);
  letter-spacing: -0.065em;
  line-height: 0.84;
  text-wrap: balance;
}

.programme-measure {
  display: block;
  width: clamp(6rem, 11vw, 10rem);
  height: 0.55rem;
  margin-top: 1.5rem;
  background: var(--login-yellow);
}

.login-lede {
  margin-top: 1.1rem;
  font-size: clamp(1rem, 1.5vw, 1.25rem);
  line-height: 1.5;
}

.login-access {
  align-self: end;
  border-top: 1px solid var(--login-ink);
  padding-top: 1.25rem;
}

.login-access__label {
  margin-bottom: 1rem;
}

.login-access h2 {
  max-width: 11ch;
  font-size: clamp(2rem, 3vw, 2.65rem);
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.04em;
  line-height: 1;
}

.login-access__intro > p:last-child {
  max-width: 28rem;
  margin-top: 0.9rem;
  font-size: 0.92rem;
  line-height: 1.55;
}

.login-control {
  margin-top: 1.6rem;
}

.login-submit {
  border-color: var(--login-ink);
  background: var(--login-paper);
  box-shadow: inset 0 -3px 0 var(--login-yellow);
  color: var(--login-ink);
}

@media (hover: hover) and (pointer: fine) {
  .login-submit:not(:disabled):hover .login-submit__arrow {
    transform: translate3d(0.2rem, 0, 0);
  }

  .login-submit:not(:disabled):hover {
    background: #fffdf4;
  }
}

@media (max-width: 960px) {
  .login-core {
    grid-template-columns: 1fr;
    gap: 3.5rem;
    align-items: start;
    margin-top: 4.5rem;
    padding-top: 4rem;
  }

  .login-statement h1 {
    max-width: 9ch;
    font-size: clamp(4.2rem, 12vw, 7rem);
  }

  .login-access {
    width: min(100%, 34rem);
  }

  .login-object {
    right: 0;
    bottom: auto;
    top: 3.5rem;
  }
}

@media (max-width: 720px) {
  .login-concept {
    min-height: 100%;
    padding:
      max(1.15rem, env(safe-area-inset-top))
      max(1.15rem, env(safe-area-inset-right))
      max(1.25rem, env(safe-area-inset-bottom))
      max(1.15rem, env(safe-area-inset-left));
  }

  .login-masthead {
    min-height: 2rem;
  }

  .login-logo {
    height: 1.45rem;
    max-width: 9.5rem;
  }

  .login-private {
    min-height: 1.8rem;
    padding-inline: 0.5rem;
    font-size: 0.52rem;
  }

  .login-private span {
    max-width: 6rem;
  }

  .login-footer {
    gap: 1rem;
    align-items: flex-end;
    font-size: 0.52rem;
  }

  .login-footer span:last-child {
    text-align: right;
  }

  .login-core {
    gap: 3rem;
    margin: 0 auto 2.25rem;
    padding: 4rem 0 2rem;
  }

  .login-statement h1 {
    font-size: clamp(3.65rem, 17vw, 5.3rem);
  }

  .login-object {
    top: 4.6rem;
  }

  .programme-index span,
  .programme-index small {
    display: none;
  }

  .programme-index strong {
    font-size: 3.25rem;
  }

  .login-submit {
    min-height: 3.35rem;
  }
}

@media (max-height: 720px) and (min-width: 721px) {
  .login-concept {
    min-height: 48rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-submit,
  .login-submit__arrow {
    transition: none;
  }

  .login-submit__arrow {
    transform: none;
  }
}
</style>
