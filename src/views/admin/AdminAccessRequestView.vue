<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
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
  <main class="editorial-page">
    <div class="editorial-wrap max-w-3xl">
      <header class="mb-8" aria-labelledby="access-title">
        <img :src="DEVCONGRESS_LOGO_PATH" alt="DevCongress" class="w-32 sm:w-40">
        <p class="editorial-eyebrow mt-8">Organizer desk / Request access</p>
        <h1 id="access-title" class="editorial-title">Ask to join the work.</h1>
        <p class="editorial-subtitle">Tell us a little about how you’d like to contribute to DevCongress.</p>
        <p class="editorial-subtitle mt-2">A DevCongress owner reviews every request. Access is never automatic, and no email is sent.</p>
      </header>

      <p v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{{ error }}</p>

      <section v-if="loading" class="editorial-panel p-6" role="status">
        <p class="text-base leading-7 text-dc-gray">Checking your request session…</p>
      </section>

      <section v-else-if="error && !status" class="editorial-panel p-6">
        <h2 class="text-2xl font-bold tracking-tight text-dc-ink">We could not confirm your session.</h2>
        <button type="button" class="editorial-secondary-action mt-5" @click="load">Try again</button>
      </section>

      <section v-else-if="status?.request?.status === 'pending'" class="editorial-panel bg-dc-yellow p-6">
        <h2 class="text-2xl font-bold tracking-tight text-dc-ink">Your request is in the room.</h2>
        <p class="mt-3 max-w-2xl text-base leading-7 text-dc-ink">An owner will review it. Come back here any time to check in.</p>
        <button type="button" class="editorial-secondary-action mt-5" @click="load">Refresh status</button>
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
