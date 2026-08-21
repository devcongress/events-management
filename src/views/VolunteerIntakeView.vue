<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import TurnstileWidget from '@/src/components/TurnstileWidget.vue';
import SubmissionProgressLabel from '@/src/components/ui/SubmissionProgressLabel.vue';
import { preflightPublicEmail } from '@/src/lib/api';
import { turnstileEnabled } from '@/src/lib/turnstile';
import { VOLUNTEER_INTAKE_TURNSTILE_ACTION } from '@/lib/turnstile';

const DEVCONGRESS_LOGO_PATH = '/brand/dev-con-logo.png';

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
const submissionStage = ref<'checking' | 'submitting' | null>(null);
const submitted = ref(false);
const error = ref('');
const turnstileActive = turnstileEnabled();

const canSubmit = computed(() => (
  form.name.trim().length > 0
  && form.email.trim().length > 0
  && (!turnstileActive || turnstileToken.value.length > 0)
));

async function submitApplication() {
  if (!canSubmit.value || submitting.value) return;

  submitting.value = true;
  submissionStage.value = 'checking';
  error.value = '';

  try {
    const emailCheck = await preflightPublicEmail(form.email);
    form.email = emailCheck.normalized_email;
    submissionStage.value = 'submitting';
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
  } catch (caught) {
    error.value = caught instanceof Error
      ? caught.message
      : 'We could not save your details. Please check your connection and try again.';
  } finally {
    submitting.value = false;
    submissionStage.value = null;
  }
}
</script>

<template>
  <main class="volunteer-intake-page">
    <section class="volunteer-intake-shell" aria-labelledby="volunteer-intake-title">
      <div class="volunteer-intake-intro">
        <a
          class="volunteer-intake-logo"
          href="https://devcongress.org"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit DevCongress"
        >
          <img :src="DEVCONGRESS_LOGO_PATH" alt="DevCongress">
        </a>
        <p class="editorial-eyebrow">DevCongress volunteers</p>
        <h1 id="volunteer-intake-title">Volunteer with DevCongress.</h1>
        <p>Help us create welcoming, well-run community events. Share your details and we’ll contact you when there’s an opportunity to get involved.</p>
      </div>

      <Transition name="volunteer-intake-state" mode="out-in">
        <section v-if="submitted" key="receipt" class="volunteer-intake-receipt" aria-live="polite">
          <p class="editorial-eyebrow">You’re on the list</p>
          <h2>Thanks, {{ form.name }}.</h2>
          <p>We’ve received your details. We’ll contact you when there’s a volunteer opportunity.</p>
        </section>

        <form v-else key="form" class="volunteer-intake-form" @submit.prevent="submitApplication">
          <header class="volunteer-intake-form-header">
            <p class="editorial-eyebrow">Contact details</p>
            <p>Share the best way to reach you. X and Slack are optional.</p>
          </header>

          <div class="volunteer-intake-fields">
            <label>
              <span>Full name</span>
              <input v-model="form.name" name="name" autocomplete="name" maxlength="120" required>
            </label>
            <label>
              <span>Email address</span>
              <input v-model="form.email" name="email" type="email" autocomplete="email" maxlength="254" required>
            </label>
            <label>
              <span>X handle (optional)</span>
              <input v-model="form.x_handle" name="x-handle" autocomplete="off" placeholder="@yourhandle" maxlength="100">
            </label>
            <label>
              <span>DevCongress Slack name (optional)</span>
              <input v-model="form.slack_name" name="slack-name" autocomplete="nickname" placeholder="Your display name" maxlength="120">
            </label>
          </div>

          <p v-if="error || turnstileError" class="volunteer-intake-error" role="alert">{{ error || turnstileError }}</p>

          <div class="volunteer-intake-actions">
            <TurnstileWidget
              v-if="turnstileActive"
              ref="turnstileWidget"
              :action="VOLUNTEER_INTAKE_TURNSTILE_ACTION"
              @token-change="turnstileToken = $event"
              @error="turnstileError = $event ?? ''"
            />

            <button
              class="volunteer-intake-submit motion-press"
              type="submit"
              :disabled="!canSubmit || submitting"
              :aria-busy="submitting"
            >
              <SubmissionProgressLabel v-if="submissionStage" :stage="submissionStage" />
              <template v-else>Join the volunteer list</template>
            </button>
          </div>
        </form>
      </Transition>
    </section>
  </main>
</template>
