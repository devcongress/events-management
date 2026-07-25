<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import TurnstileWidget from '@/src/components/TurnstileWidget.vue';
import { turnstileEnabled } from '@/src/lib/turnstile';
import { VOLUNTEER_INTAKE_TURNSTILE_ACTION } from '@/lib/turnstile';

const form = reactive({
  name: '',
  email: '',
  x_handle: '',
  slack_name: '',
});
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const turnstileToken = ref('');
const turnstileError = ref('');
const submitting = ref(false);
const submitted = ref(false);
const error = ref('');
const turnstileActive = turnstileEnabled();

const canSubmit = computed(() => (
  form.name.trim().length > 0
  && form.email.trim().length > 0
  && form.x_handle.trim().length > 0
  && form.slack_name.trim().length > 0
  && (!turnstileActive || turnstileToken.value.length > 0)
));

async function submitApplication() {
  if (!canSubmit.value || submitting.value) return;

  submitting.value = true;
  error.value = '';

  try {
    const response = await fetch('/api/volunteer-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        turnstile_action: turnstileActive ? VOLUNTEER_INTAKE_TURNSTILE_ACTION : undefined,
        turnstile_token: turnstileActive ? turnstileToken.value : undefined,
      }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };

    if (!response.ok) {
      error.value = payload.error ?? 'We could not save your details. Please try again.';
      if (turnstileActive) {
        turnstileToken.value = '';
        turnstileWidget.value?.reset();
      }
      return;
    }

    submitted.value = true;
  } catch {
    error.value = 'We could not save your details. Please check your connection and try again.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="volunteer-intake-page">
    <section class="volunteer-intake-shell" aria-labelledby="volunteer-intake-title">
      <div class="volunteer-intake-intro">
        <p class="editorial-eyebrow">December Mega Meetup</p>
        <h1 id="volunteer-intake-title">Volunteer with DevCongress.</h1>
        <p>Leave your details and we will contact you about helping make the meetup happen.</p>
      </div>

      <section v-if="submitted" class="volunteer-intake-receipt" aria-live="polite">
        <p class="editorial-eyebrow">Application received</p>
        <h2>Thank you, {{ form.name }}.</h2>
        <p>We have your details and will be in touch.</p>
      </section>

      <form v-else class="volunteer-intake-form" @submit.prevent="submitApplication">
        <div class="volunteer-intake-fields">
          <label>
            <span>Name</span>
            <input v-model="form.name" name="name" autocomplete="name" maxlength="120" required>
          </label>
          <label>
            <span>Email</span>
            <input v-model="form.email" name="email" type="email" autocomplete="email" maxlength="254" required>
          </label>
          <label>
            <span>X (Twitter) handle</span>
            <input v-model="form.x_handle" name="x-handle" autocomplete="off" placeholder="@yourhandle" maxlength="100" required>
          </label>
          <label>
            <span>Slack name</span>
            <input v-model="form.slack_name" name="slack-name" autocomplete="nickname" maxlength="120" required>
          </label>
        </div>

        <TurnstileWidget
          v-if="turnstileActive"
          ref="turnstileWidget"
          :action="VOLUNTEER_INTAKE_TURNSTILE_ACTION"
          @token-change="turnstileToken = $event"
          @error="turnstileError = $event ?? ''"
        />

        <p v-if="error || turnstileError" class="volunteer-intake-error" role="alert">{{ error || turnstileError }}</p>

        <button class="volunteer-intake-submit motion-press" type="submit" :disabled="!canSubmit || submitting">
          {{ submitting ? 'Sending…' : 'Volunteer for the meetup' }}
        </button>
      </form>
    </section>
  </main>
</template>
