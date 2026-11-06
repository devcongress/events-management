<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminPath } from '@/src/admin-routes';
import { fetchAdminSession } from '@/src/lib/api';

const STORAGE_KEY = 'event-submission-slack-link';
const LINK_PATH = '/slack/event-submissions/link';
const status = ref<'checking' | 'confirm' | 'busy' | 'done' | 'error'>('checking');
const message = ref('');
const email = ref('');

onMounted(async () => {
  const fragment = window.location.hash.slice(1);

  if (fragment) {
    history.replaceState(history.state, '', LINK_PATH);
    if (/^[a-f0-9]{64}$/.test(fragment)) sessionStorage.setItem(STORAGE_KEY, fragment);
  }
  if (!sessionStorage.getItem(STORAGE_KEY)) {
    message.value = 'This link is invalid or has already been used. Run /allow-me again in Slack.';
    status.value = 'error';

    return;
  }
  try {
    const session = await fetchAdminSession();

    if (!session.authenticated) {
      window.location.replace(`${adminPath('login')}?redirect=${encodeURIComponent(LINK_PATH)}`);

      return;
    }
    email.value = session.user?.email ?? '';
    status.value = 'confirm';
  } catch {
    message.value = 'Unable to check your organizer session. Please try again.';
    status.value = 'error';
  }
});

async function chooseAccount() {
  status.value = 'busy';
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });

    if (!response.ok) throw new Error('Logout failed');
    window.location.replace(`${adminPath('login')}?redirect=${encodeURIComponent(LINK_PATH)}`);
  } catch {
    message.value = 'Unable to sign out. Please try again.';
    status.value = 'confirm';
  }
}

async function confirmLink() {
  const token = sessionStorage.getItem(STORAGE_KEY);

  if (!token) return;
  status.value = 'busy';
  try {
    const response = await fetch('/api/slack/event-submissions/link/confirm', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    sessionStorage.removeItem(STORAGE_KEY);
    if (!response.ok) {
      message.value = 'This link is invalid, expired, or already associated with another account. Run /allow-me again in Slack or contact an owner.';
      status.value = 'error';

      return;
    }
    status.value = 'done';
  } catch {
    message.value = 'Unable to connect your account. Please try again.';
    status.value = 'confirm';
  }
}
</script>

<template>
  <main class="link-page">
    <section class="link-card">
      <p class="eyebrow">DevCongress · Organizer access</p>
      <h1>Connect Slack moderation</h1>
      <p v-if="status === 'checking'">Checking your organizer session…</p>
      <template v-else-if="status === 'confirm' || status === 'busy'">
        <p>Connect the Slack account that requested this link to your organizer account<span v-if="email"> ({{ email }})</span>. You can then approve or reject community event submissions in Slack.</p>
        <p v-if="message" role="alert">{{ message }}</p>
        <button type="button" :disabled="status === 'busy'" @click="confirmLink">
          {{ status === 'busy' ? 'Connecting…' : 'Confirm connection' }}
        </button>
        <button class="secondary" type="button" :disabled="status === 'busy'" @click="chooseAccount">Use another account</button>
      </template>
      <p v-else-if="status === 'done'" role="status">Your accounts are connected. You can return to Slack.</p>
      <p v-else role="alert">{{ message }}</p>
    </section>
  </main>
</template>

<style scoped>
.link-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #1c1c1c; color: #e5e5e5; }
.link-card { width: min(100%, 480px); padding: 32px; border: 1px solid #444; border-radius: 12px; }
.eyebrow { color: #a1a1a1; font-size: 14px; }
h1 { font-size: 28px; margin: 16px 0; }
p { line-height: 1.5; }
button { margin-top: 24px; padding: 12px 18px; background: #e5e5e5; color: #1c1c1c; border: 0; border-radius: 8px; cursor: pointer; }
.secondary { margin-left: 12px; background: transparent; color: #e5e5e5; border: 1px solid #777; }
button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
button:disabled { opacity: 0.6; cursor: wait; }
</style>
