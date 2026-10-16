<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { fetchAdminSession, fetchJson, queryKeys } from '@/src/lib/api';

const props = defineProps<{
  decision: 'accepted' | 'not_selected';
  available: boolean;
}>();
const session = useQuery({ queryKey: queryKeys.adminSession, queryFn: fetchAdminSession });
const signedInEmail = computed(() => session.data.value?.user?.email ?? '');
const recipient = ref('');
const sending = ref(false);
const error = ref('');
const feedback = ref('');
const pendingRequests = new Map<string, string>();
const outcomeLabel = computed(() => props.decision === 'accepted' ? 'acceptance' : 'non-acceptance');

watch(signedInEmail, (email) => {
  if (!recipient.value) recipient.value = email;
}, { immediate: true });

watch([recipient, () => props.decision], () => {
  error.value = '';
  feedback.value = '';
});

async function sendTest() {
  if (sending.value || !props.available) return;

  sending.value = true;
  error.value = '';
  feedback.value = '';
  const signature = JSON.stringify([props.decision, recipient.value.trim().toLowerCase()]);
  const activeRequestId = pendingRequests.get(signature) ?? crypto.randomUUID();
  const label = outcomeLabel.value;

  pendingRequests.set(signature, activeRequestId);

  try {
    const result = await fetchJson<{ accepted: true; recipient: string }>(
      '/api/annual-conference/2026/volunteer-follow-up/outcomes/test',
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: props.decision,
          email: recipient.value.trim(),
          request_id: activeRequestId,
        }),
      },
    );

    feedback.value = `Your ${label} test was accepted by Resend for ${result.recipient}. Check your inbox and spam folder; delivery is not yet confirmed.`;
    pendingRequests.delete(signature);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Unable to confirm the test email. Check your inbox before retrying.';
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <form class="outcome-test" aria-labelledby="outcome-test-title" @submit.prevent="sendTest">
    <div>
      <h4 id="outcome-test-title">Try this email</h4>
      <p>Send yourself the saved {{ outcomeLabel }} email, with a sample applicant name and a [TEST] subject. Applicant decisions and the campaign queue stay unchanged.</p>
    </div>
    <fieldset :disabled="sending">
      <div class="outcome-test-recipient">
        <label for="outcome-test-email">Test recipient</label>
        <input id="outcome-test-email" v-model="recipient" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com" />
      </div>
      <button class="outcome-test-secondary" type="button" :disabled="!signedInEmail" @click="recipient = signedInEmail">Use my email</button>
      <button class="outcome-test-submit" type="submit" :disabled="!available || !recipient.trim()">
        {{ sending ? 'Sending test…' : `Send ${outcomeLabel} test` }}
      </button>
    </fieldset>
    <p v-if="!available">Save this message in Reviews to enable a test send.</p>
    <p v-if="error" class="outcome-test-error" role="alert">{{ error }}</p>
    <p v-if="feedback" class="outcome-test-feedback" role="status">{{ feedback }}</p>
  </form>
</template>

<style scoped>
.outcome-test {
  display: grid;
  gap: .85rem;
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid #dedbd4;
  border-radius: 8px;
  background: #fff;
}

h4 {
  margin: 0 0 .35rem;
  color: #25231f;
  font-size: .95rem;
}

p {
  margin: 0;
  color: #59564f;
  font-size: .82rem;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

fieldset {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: .6rem;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.outcome-test-recipient {
  display: grid;
  flex: 1 1 16rem;
  min-width: 0;
  gap: .35rem;
}

label {
  color: #59564f;
  font-size: .75rem;
  font-weight: 700;
}

input,
button {
  min-height: 2.75rem;
  padding: .65rem .8rem;
  border: 1px solid #d3d0c9;
  border-radius: 8px;
  background: #fff;
  color: #25231f;
  font: inherit;
  font-size: .82rem;
}

input {
  width: 100%;
  min-width: 0;
}

button {
  font-weight: 700;
  cursor: pointer;
  transition: transform 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.outcome-test-submit {
  border-color: #c80d68;
  color: #c80d68;
}

button:disabled,
fieldset:disabled button {
  opacity: .55;
  cursor: not-allowed;
}

button:enabled:active {
  transform: scale(.97);
}

input:focus-visible,
button:focus-visible {
  outline: 2px solid #c80d68;
  outline-offset: 3px;
}

.outcome-test-error {
  color: #a12a28;
}

.outcome-test-feedback {
  color: #25633e;
}

@media (max-width: 480px) {
  button {
    flex: 1 1 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  button {
    transition: none;
  }

  button:enabled:active {
    transform: none;
  }
}
</style>
