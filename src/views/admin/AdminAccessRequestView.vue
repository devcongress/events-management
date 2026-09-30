<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminPath } from '@/src/admin-routes';

interface AccessRequestStatus {
  identity: { email: string; display_name: string };
  request: { id: string; display_name: string; reason: string | null; status: 'pending' | 'approved' | 'declined'; created_at: string } | null;
}

const router = useRouter();
const loading = ref(true);
const submitting = ref(false);
const error = ref('');
const status = ref<AccessRequestStatus | null>(null);
const form = reactive({ display_name: '', reason: '' });
const canSubmit = computed(() => form.display_name.trim().length > 0 && form.display_name.trim().length <= 120 && form.reason.length <= 1000 && !submitting.value);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/auth/admin/access-request', { credentials: 'include' });

    if (response.status === 401) {
      await router.replace(adminPath('login'));

      return;
    }
    if (!response.ok) throw new Error('Unable to load your access request.');
    status.value = await response.json() as AccessRequestStatus;
    form.display_name = status.value.request?.display_name ?? status.value.identity.display_name;
    form.reason = status.value.request?.reason ?? '';
  } catch (caught) {
    status.value = null;
    error.value = caught instanceof Error ? caught.message : 'Unable to load your access request.';
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/auth/admin/access-request', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: form.display_name, reason: form.reason || undefined }) });

    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Unable to submit your request.');
    await load();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to submit your request.';
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <main class="access-page">
    <section class="access-card" aria-labelledby="access-title">
      <header class="access-header">
        <img src="/brand/dev-con-logo.png" alt="DevCongress">
        <svg viewBox="0 0 88 64" aria-hidden="true">
          <path d="M7 55h74M20 55V35h48v20" fill="#f5e642" stroke="currentColor" stroke-width="3" />
          <circle cx="44" cy="24" r="14" fill="#e8117f" stroke="currentColor" stroke-width="3" />
          <path d="M39 23h2m8 0h2m-12 7c3 2 6 2 9 0" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        </svg>
      </header>

      <div class="access-card-heading">
        <p class="access-kicker">Organizer desk / Request access</p>
        <h1 id="access-title">Ask to join the work.</h1>
        <p>Tell us a little about how you’d like to contribute to DevCongress.</p>
      </div>

      <div class="access-note">
        <span aria-hidden="true">i</span>
        <p>No email is sent and access is never automatic. A DevCongress owner reviews every request.</p>
      </div>

      <p v-if="error" class="access-error" role="alert">{{ error }}</p>

      <div v-if="loading" class="access-loading">Checking your request session…</div>

      <div v-else-if="error && !status" class="access-state">
        <h2>We could not confirm your session.</h2>
        <button type="button" class="access-button" @click="load">Try again</button>
      </div>

      <template v-else-if="status?.request?.status === 'pending'">
        <div class="access-state access-state--yellow">
          <h2>Your request is in the room.</h2>
          <p>An owner will review it. Come back here any time to check in.</p>
          <button type="button" class="access-link" @click="load">Refresh status</button>
        </div>
      </template>

      <template v-else-if="status?.request?.status === 'approved'">
        <div class="access-state access-state--approved">
          <h2>You’re approved.</h2>
          <p>Sign in again with this Google account to enter the organizer console.</p>
        </div>
        <RouterLink class="access-button access-button--spaced" :to="adminPath('login')">Sign in</RouterLink>
      </template>

      <template v-else>
        <div v-if="status?.request?.status === 'declined'" class="access-state">
          <h2>Not approved this time.</h2>
          <p>You can send a new request if your details have changed.</p>
        </div>

        <form class="access-form" @submit.prevent="submit">
          <p class="access-email">Requesting as <strong>{{ status?.identity.email }}</strong></p>

          <label>
            <span>Your name</span>
            <input v-model="form.display_name" class="editorial-input" maxlength="120" autocomplete="name">
          </label>

          <label>
            <span>How would you like to contribute? <em>Optional</em></span>
            <textarea v-model="form.reason" class="editorial-input" maxlength="1000" rows="4" />
          </label>

          <button class="access-button" :disabled="!canSubmit">
            {{ submitting ? 'Submitting request…' : status?.request?.status === 'declined' ? 'Submit new request' : 'Submit request' }}
          </button>
        </form>
      </template>
    </section>
  </main>
</template>

<style scoped>
.access-page {
  display: grid;
  min-height: 100dvh;
  place-items: center;
  padding: clamp(1rem, 3vw, 2.5rem);
  background: #f5f2e8;
  color: #111;
}

.access-card {
  width: min(100%, 38rem);
  padding: clamp(1.75rem, 6vw, 3rem);
  border: 1px solid #ded8cd;
  border-radius: 12px;
  background: #fffdf9;
  box-shadow: 0 12px 32px rgb(17 17 17 / 8%);
}

.access-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid #e4ded4;
}

.access-header img {
  width: 8.25rem;
  height: auto;
  object-fit: contain;
}

.access-header svg {
  width: 5.5rem;
  height: 4rem;
  color: #111;
}

.access-card-heading p:last-child {
  max-width: 30rem;
  color: #67635d;
  line-height: 1.55;
}

.access-card h2 {
  margin: 0 0 .45rem;
  font-size: 1.15rem;
  line-height: .98;
  letter-spacing: -.02em;
}

.access-card h1 {
  margin: .55rem 0 .7rem;
  font-size: clamp(2.15rem, 7vw, 3.25rem);
  line-height: .98;
  letter-spacing: -.055em;
}

.access-kicker {
  margin: 1.5rem 0 .35rem;
  color: #6d675e;
  font-family: var(--font-mono);
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.access-note,
.access-state,
.access-error {
  display: flex;
  gap: .75rem;
  margin-top: 1.5rem;
  border: 1px solid #d8d4cc;
  border-radius: 8px;
  padding: 1rem;
  background: #fbfaf7;
  font-size: .88rem;
  line-height: 1.45;
}

.access-note span {
  display: grid;
  width: 1.35rem;
  height: 1.35rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #f5e642;
  font-family: var(--font-mono);
  font-weight: 700;
}

.access-note {
  border-color: #e7d85c;
  background: #fff9cf;
}

.access-note p,
.access-state p {
  margin: 0;
}

.access-error {
  border-color: #d92d20;
  color: #9b1c14;
}

.access-state {
  display: block;
}

.access-state--yellow { border-color: #d2bd00; background: #fff9ca; }
.access-state--approved { border-color: #9fcfa7; background: #edfff0; }

.access-form {
  display: grid;
  gap: 1.1rem;
  margin-top: 2rem;
}

.access-email {
  margin: 0;
  border-bottom: 1px solid #dfdbd4;
  padding-bottom: 1rem;
  color: #69645e;
  font-size: .85rem;
}

.access-email strong { overflow-wrap: anywhere; color: #111; }

.access-form label {
  display: grid;
  gap: .5rem;
  font-family: var(--font-mono);
  font-size: .7rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.access-form em { color: #716c65; font-style: normal; font-weight: 400; }

.access-form input,
.access-form textarea {
  width: 100%;
  border: 1px solid #beb9b0;
  border-radius: 6px;
  padding: .8rem .9rem;
  background: #fff;
  color: #111;
  font: 400 .95rem/1.45 var(--font-sans);
  letter-spacing: 0;
  text-transform: none;
}

.access-form textarea { resize: vertical; }

.access-form input:focus-visible,
.access-form textarea:focus-visible,
.access-button:focus-visible,
.access-link:focus-visible { outline: 3px solid #e8117f; outline-offset: 3px; }

.access-button {
  display: inline-flex;
  min-height: 3.25rem;
  align-items: center;
  justify-content: center;
  border: 1px solid #9f0755;
  border-radius: 8px;
  padding: .75rem 1.1rem;
  background: #c71069;
  color: #fff;
  font-family: var(--font-mono);
  font-size: .74rem;
  font-weight: 700;
  letter-spacing: .08em;
  text-decoration: none;
  text-transform: uppercase;
  transition:
    transform 140ms cubic-bezier(.4, 0, .2, 1),
    opacity 140ms cubic-bezier(.4, 0, .2, 1);
}

.access-button:active {
  transform: scale(.97);
}

.access-button:disabled {
  cursor: not-allowed;
  opacity: .5;
}

.access-button--spaced {
  margin-top: 1rem;
}

.access-link {
  min-height: 2.75rem;
  margin-top: .5rem;
  border: 0;
  background: transparent;
  color: #111;
  font: 700 .75rem var(--font-mono);
  text-decoration: underline;
}

.access-loading {
  margin-top: 1.5rem;
  color: #69645e;
  font-size: .9rem;
}

@media (max-width: 760px) {
  .access-page {
    display: block;
    padding: 1rem;
  }

  .access-card {
    width: 100%;
    padding: 1.5rem;
  }

  .access-card h1 {
    font-size: 2.45rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .access-button {
    transition: none;
  }

  .access-button:active {
    transform: none;
  }
}
</style>
