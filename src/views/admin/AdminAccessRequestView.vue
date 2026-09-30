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
  <main class="min-h-dvh bg-dc-cream px-4 py-8 text-dc-ink sm:px-6 sm:py-14">
    <section class="mx-auto max-w-xl rounded-lg border border-dc-border bg-dc-paper p-5 shadow-sm sm:p-7">
      <p class="editorial-eyebrow">Organizer desk / Request access</p>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight">Ask to join the work.</h1>
      <p class="mt-3 text-sm leading-6 text-dc-gray">Confirm your request session, then submit an optional reason. This sends no email and does not grant access until a DevCongress owner decides.</p>
      <p v-if="error" class="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{{ error }}</p>
      <div v-if="loading" class="mt-6 text-sm text-dc-gray">Checking your request…</div>
      <div v-else-if="error && !status" class="mt-6 rounded-md border border-dc-border bg-dc-paper-warm p-4">
        <p class="font-semibold">We could not confirm your request session.</p>
        <button type="button" class="editorial-action mt-4" @click="load">Try again</button>
      </div>
      <template v-else-if="status?.request?.status === 'pending'">
        <div class="mt-6 rounded-md border border-dc-yellow bg-dc-yellow/20 p-4">
          <p class="font-semibold">Request pending</p>
          <p class="mt-1 text-sm leading-5 text-dc-gray">An owner will review your request. You can return here after they decide.</p>
          <button type="button" class="motion-press mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-dc-ink underline" @click="load">Refresh status</button>
        </div>
      </template>
      <template v-else-if="status?.request?.status === 'approved'">
        <div class="mt-6 rounded-md border border-dc-success/30 bg-dc-success/10 p-4">
          <p class="font-semibold">Access approved</p>
          <p class="mt-1 text-sm text-dc-gray">Sign in again with this Google account to open the organizer console.</p>
        </div>
        <RouterLink class="editorial-action mt-5 inline-flex" :to="adminPath('login')">Sign in</RouterLink>
      </template>
      <template v-else-if="status?.request?.status === 'declined'">
        <div class="mt-6 rounded-md border border-dc-border bg-dc-paper-warm p-4">
          <p class="font-semibold">Request not approved</p>
          <p class="mt-1 text-sm text-dc-gray">You may submit a new request if your role or details have changed.</p>
        </div>
        <form class="mt-5 grid gap-4" @submit.prevent="submit">
          <label><span class="editorial-label">Name</span><input v-model="form.display_name" maxlength="120" class="editorial-input mt-1.5" autocomplete="name"></label>
          <label><span class="editorial-label">Why would you like access? <em class="normal-case text-dc-gray">Optional</em></span><textarea v-model="form.reason" maxlength="1000" rows="4" class="editorial-input mt-1.5 resize-y" /></label>
          <button class="editorial-action justify-center disabled:opacity-50" :disabled="!canSubmit">{{ submitting ? 'Submitting…' : 'Submit new request' }}</button>
        </form>
      </template>
      <form v-else class="mt-6 grid gap-4" @submit.prevent="submit">
        <p class="text-sm text-dc-gray">Signed in as <strong class="break-all text-dc-ink">{{ status?.identity.email }}</strong></p>
        <label><span class="editorial-label">Name</span><input v-model="form.display_name" maxlength="120" class="editorial-input mt-1.5" autocomplete="name"></label>
        <label><span class="editorial-label">Why would you like access? <em class="normal-case text-dc-gray">Optional</em></span><textarea v-model="form.reason" maxlength="1000" rows="4" class="editorial-input mt-1.5 resize-y" /></label>
        <button class="editorial-action justify-center disabled:opacity-50" :disabled="!canSubmit">{{ submitting ? 'Submitting…' : 'Submit request' }}</button>
      </form>
    </section>
  </main>
</template>
