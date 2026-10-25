<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { adminPath } from '@/src/admin-routes';

interface AccessRequestStatus {
  identity: { email: string; display_name: string };
  request: { id: string; display_name: string; reason: string | null; status: 'pending' | 'approved' | 'declined'; created_at: string } | null;
}

const router = useRouter();
const DEVCONGRESS_LOGO_PATH = '/brand/dev-con-logo.png';
const loading = ref(true);
const submitting = ref(false);
const refreshing = ref(false);
const lastChecked = ref('');
const resultHeading = ref<HTMLElement | null>(null);
const requestDate = computed(() => {
  const value = status.value?.request?.created_at;

  return value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(value)) : '';
});
const error = ref('');
const status = ref<AccessRequestStatus | null>(null);
const form = reactive({ display_name: '', reason: '' });
const canSubmit = computed(() => form.display_name.trim().length > 0 && form.display_name.trim().length <= 120 && form.reason.length <= 1000 && !submitting.value);

async function load() {
  if (refreshing.value) return;

  loading.value = !status.value;
  refreshing.value = true;
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
    lastChecked.value = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Unable to load your access request.';
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) return;
  submitting.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/auth/admin/access-request', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: form.display_name, reason: form.reason || undefined }) });

    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Unable to submit your request.');
    const result = await response.json() as { request: AccessRequestStatus['request'] };

    if (status.value) status.value = { ...status.value, request: result.request };
    await load();
    await nextTick();
    resultHeading.value?.focus();
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
  <main class="editorial-page">
    <div class="editorial-wrap max-w-3xl">
      <header class="mb-8" aria-labelledby="access-title">
        <img :src="DEVCONGRESS_LOGO_PATH" alt="DevCongress" class="w-32 sm:w-40">
        <p class="editorial-eyebrow mt-8">Organizer desk / Request access</p>
        <h1 id="access-title" class="editorial-title">{{ status?.request?.status === 'pending' || status?.request?.status === 'approved' ? 'Your access request' : 'Join the organizer team' }}</h1>
        <p v-if="!status?.request || status.request.status === 'declined'" class="editorial-subtitle">Tell us a little about how you’d like to contribute to DevCongress.</p>
        <p v-if="!status?.request || status.request.status === 'declined'" class="mt-3 text-sm leading-6 text-dc-gray">An owner reviews each request before granting access.</p>
      </header>

      <p v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{{ error }}</p>

      <section v-if="loading" class="editorial-panel p-6" role="status">
        <p class="text-base leading-7 text-dc-gray">Checking your request session…</p>
      </section>

      <section v-else-if="error && !status" class="editorial-panel p-6">
        <h2 class="text-2xl font-bold tracking-tight text-dc-ink">We could not confirm your session.</h2>
        <button type="button" class="editorial-secondary-action mt-5" @click="load">Try again</button>
      </section>

      <section v-else-if="status?.request?.status === 'pending'" class="rounded-xl border border-dc-border bg-dc-paper p-6 sm:p-8" aria-labelledby="request-result-title">
        <div class="flex items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dc-paper-warm text-dc-pink" aria-hidden="true"><svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 4 4L19 6" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          <span class="rounded-full border border-dc-border px-3 py-1 text-xs font-medium text-dc-gray">Awaiting review</span>
        </div>
        <h2 id="request-result-title" ref="resultHeading" tabindex="-1" class="mt-5 text-2xl font-semibold text-dc-ink focus:outline-none">Request received</h2>
        <p class="mt-2 text-sm leading-6 text-dc-gray">Thanks for offering to help shape DevCongress. An owner will review your request and decide on your access.</p>
        <dl class="mt-6 grid gap-4 border-y border-dc-border py-5 text-sm sm:grid-cols-[1fr_auto]">
          <div class="min-w-0"><dt class="text-xs text-dc-gray">Google account</dt><dd class="mt-1 break-all font-medium text-dc-ink">{{ status.identity.email }}</dd></div>
          <div><dt class="text-xs text-dc-gray">Submitted</dt><dd class="mt-1 text-dc-ink"><time :datetime="status.request.created_at">{{ requestDate }}</time></dd></div>
        </dl>
        <h3 class="mt-5 text-sm font-semibold text-dc-ink">What happens next?</h3>
        <p class="mt-2 text-sm leading-6 text-dc-gray">Check your status here. Once approved, sign in with this same Google account to enter the organizer workspace.</p>
        <p class="mt-2 text-xs leading-5 text-dc-gray">We don’t send email updates for access requests. If your session expires, choose Request access on the sign-in page to return here.</p>
        <div class="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" class="min-h-11 rounded-md bg-dc-pink px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="refreshing" :aria-busy="refreshing" @click="load">{{ refreshing ? 'Checking…' : 'Check status' }}</button>
          <p class="text-xs text-dc-gray" role="status" aria-live="polite">{{ refreshing ? 'Checking for an update…' : `Last checked at ${lastChecked}` }}</p>
        </div>
      </section>

      <section v-else-if="status?.request?.status === 'approved'" class="editorial-panel p-6">
        <h2 class="text-2xl font-bold tracking-tight text-dc-ink">You’re approved.</h2>
        <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">Sign in again with this Google account to enter the organizer console.</p>
        <RouterLink class="editorial-action mt-5" :to="adminPath('login')">Sign in</RouterLink>
      </section>

      <section v-else class="editorial-panel p-6 sm:p-8">
        <div v-if="status?.request?.status === 'declined'" class="mb-6 border-b border-dc-border pb-6">
          <h2 class="text-2xl font-bold tracking-tight text-dc-ink">Not approved this time.</h2>
          <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">You can send a new request if your details have changed.</p>
        </div>

        <form class="grid gap-6" @submit.prevent="submit">
          <p class="border-b border-dc-border pb-5 text-sm leading-6 text-dc-gray">Requesting as <strong class="break-all text-dc-ink">{{ status?.identity.email }}</strong></p>

          <label>
            <span class="editorial-label">Your name</span>
            <input v-model="form.display_name" class="editorial-input" maxlength="120" autocomplete="name">
          </label>

          <label>
            <span class="editorial-label">How would you like to contribute? <span class="font-normal text-dc-gray">Optional</span></span>
            <textarea v-model="form.reason" class="editorial-input" maxlength="1000" rows="4" />
          </label>

          <button type="submit" class="editorial-action w-full sm:w-fit" :disabled="!canSubmit" :aria-busy="submitting">
            {{ submitting ? 'Submitting request…' : status?.request?.status === 'declined' ? 'Submit new request' : 'Submit request' }}
          </button>
        </form>
      </section>
    </div>
  </main>
</template>
