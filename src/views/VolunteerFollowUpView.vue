<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import TurnstileWidget from "@/src/components/TurnstileWidget.vue";
import { turnstileEnabled } from "@/src/lib/turnstile";
import {
  VOLUNTEER_FOLLOW_UP_TEST_TURNSTILE_ACTION,
  VOLUNTEER_FOLLOW_UP_TURNSTILE_ACTION,
} from "@/lib/turnstile";
import {
  canSubmitVolunteerFollowUpForm,
  volunteerFollowUpWordCount,
} from "@/lib/volunteer-follow-up";
import { annualConferencePath } from "@/src/annual-conference";

const DEVCONGRESS_LOGO_PATH = "/brand/dev-con-logo.png";

const props = withDefaults(
  defineProps<{
    previewMode?: boolean;
    testMode?: boolean;
    embeddedPreview?: boolean;
    previewSeed?: string | null;
  }>(),
  {
    previewMode: false,
    testMode: false,
    embeddedPreview: false,
    previewSeed: null,
  },
);

type FormState = {
  name: string;
  submitted: boolean;
  expired: boolean;
  response_deadline: string | null;
};

const route = useRoute();
const recipientId = computed(() => String(route.params.id ?? ""));
const privateToken = computed(() => route.hash.replace(/^#/, ""));
const state = ref<FormState | null>(null);
const loading = ref(true);
const submitting = ref(false);
const error = ref("");
const motivation = ref("");
const canAttendAccra = ref<boolean | null>(null);
const turnstileToken = ref("");
const turnstileError = ref("");
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const turnstileActive = turnstileEnabled();
const turnstileAction = computed(() =>
  props.testMode
    ? VOLUNTEER_FOLLOW_UP_TEST_TURNSTILE_ACTION
    : VOLUNTEER_FOLLOW_UP_TURNSTILE_ACTION,
);
const disabledPreview = computed(
  () => props.previewMode && !props.testMode,
);
const narrowTurnstileViewport = ref(
  typeof window !== "undefined" && window.matchMedia("(max-width: 360px)").matches,
);
const turnstileSize = computed(() =>
  narrowTurnstileViewport.value ? "compact" : "flexible",
);
const campaignPath = annualConferencePath("volunteers", "2026");
const wordCount = computed(() => volunteerFollowUpWordCount(motivation.value));
const canSubmit = computed(() =>
  canSubmitVolunteerFollowUpForm(
    disabledPreview.value,
    !submitting.value &&
      motivation.value.trim().length > 0 &&
      wordCount.value <= 120 &&
      canAttendAccra.value !== null &&
      (!turnstileActive || Boolean(turnstileToken.value)),
  ),
);
const responseDeadlineLabel = computed(() =>
  state.value?.response_deadline
    ? new Intl.DateTimeFormat("en-GH", {
        timeZone: "Africa/Accra",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(state.value.response_deadline))
    : "the response deadline",
);

let turnstileViewportQuery: MediaQueryList | null = null;

function updateTurnstileViewport() {
  narrowTurnstileViewport.value = turnstileViewportQuery?.matches ?? false;
}

onMounted(async () => {
  turnstileViewportQuery = window.matchMedia("(max-width: 360px)");
  updateTurnstileViewport();
  turnstileViewportQuery.addEventListener("change", updateTurnstileViewport);

  if (props.previewMode) {
    if (props.previewSeed) {
      state.value = createPreviewFormState(props.previewSeed);
      motivation.value =
        "I would love to help create a welcoming experience for the community and support the team on event day.";
      canAttendAccra.value = true;
      loading.value = false;

      return;
    }

    try {
      const response = await fetch(
        "/api/annual-conference/2026/volunteer-follow-up/preview",
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as {
        response_deadline?: string;
        error?: string;
      };

      if (!response.ok || !payload.response_deadline)
        throw new Error(
          payload.error ??
            "This preview is available to the campaign owner only.",
        );
      state.value = createPreviewFormState(payload.response_deadline);
      motivation.value =
        "I would love to help create a welcoming experience for the community and support the team on event day.";
      canAttendAccra.value = true;
    } catch (caught) {
      error.value =
        caught instanceof Error
          ? caught.message
          : "Unable to open the form preview.";
    } finally {
      loading.value = false;
    }

    return;
  }

  if (props.testMode) {
    try {
      const response = await fetch(
        "/api/annual-conference/2026/volunteer-follow-up/test",
        {
          credentials: "include",
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as {
        response_deadline?: string;
        error?: string;
      };

      if (!response.ok || !payload.response_deadline)
        throw new Error(
          payload.error ?? "Unable to open the test form.",
        );
      state.value = createTestFormState(payload.response_deadline);
    } catch (caught) {
      error.value =
        caught instanceof Error
          ? caught.message
          : "Unable to open the test form.";
    } finally {
      loading.value = false;
    }

    return;
  }

  if (!privateToken.value) {
    error.value = "This private form link is incomplete.";
    loading.value = false;

    return;
  }

  try {
    const response = await fetch(
      `/api/volunteer-follow-up/${encodeURIComponent(recipientId.value)}`,
      {
        headers: { "x-follow-up-token": privateToken.value },
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as FormState & { error?: string };

    if (!response.ok)
      throw new Error(payload.error ?? "Unable to open this form.");
    state.value = payload;
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : "Unable to open this form.";
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  turnstileViewportQuery?.removeEventListener("change", updateTurnstileViewport);
});

function createPreviewFormState(responseDeadline: string): FormState {
  return {
    name: "Ama Mensah",
    submitted: false,
    expired: false,
    response_deadline: responseDeadline,
  };
}

function createTestFormState(responseDeadline: string): FormState {
  return {
    name: "Ama Mensah",
    submitted: false,
    expired: false,
    response_deadline: responseDeadline,
  };
}

async function submit() {
  if (disabledPreview.value) return;
  if (!canSubmit.value || !state.value) return;

  submitting.value = true;
  error.value = "";

  try {
    const response = await fetch(
      props.testMode
        ? "/api/annual-conference/2026/volunteer-follow-up/test"
        : `/api/volunteer-follow-up/${encodeURIComponent(recipientId.value)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(props.testMode
            ? {}
            : { "x-follow-up-token": privateToken.value }),
        },
        body: JSON.stringify({
          motivation: motivation.value.trim(),
          can_attend_accra: canAttendAccra.value,
          turnstile_action: turnstileActive ? turnstileAction.value : undefined,
          turnstile_token: turnstileActive ? turnstileToken.value : undefined,
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok)
      throw new Error(payload.error ?? "Unable to save your answers.");
    state.value = { ...state.value, submitted: true };
  } catch (caught) {
    error.value =
      caught instanceof Error ? caught.message : "Unable to save your answers.";
    turnstileToken.value = "";
    turnstileWidget.value?.reset();
  } finally {
    submitting.value = false;
  }
}

</script>

<template>
  <main
    class="volunteer-follow-up-page"
    :class="{ 'volunteer-follow-up-page--embedded-preview': embeddedPreview }"
  >
    <div
      v-if="previewMode && !embeddedPreview"
      class="volunteer-follow-up-preview-banner"
      role="status"
    >
      <span><strong>Preview only</strong><span aria-hidden="true"> · </span>Example answers · Submission is disabled</span>
      <a :href="campaignPath">Back to campaign</a>
    </div>
    <section
      class="volunteer-follow-up-shell"
      aria-labelledby="volunteer-follow-up-title"
    >
      <div class="volunteer-follow-up-layout">
        <header class="volunteer-follow-up-intro">
          <a
            class="volunteer-follow-up-logo"
            href="https://devcongress.org"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit DevCongress"
          >
            <img :src="DEVCONGRESS_LOGO_PATH" alt="DevCongress" />
          </a>
          <p class="volunteer-follow-up-context">
            DevCongress <span aria-hidden="true">/</span> Volunteer team
          </p>
          <h1 id="volunteer-follow-up-title">One more step, together.</h1>
          <p>Help us understand your interest and confirm your availability for 19 December.</p>
        </header>

        <section
          class="volunteer-follow-up-form-stage"
          aria-label="Volunteer follow-up form"
        >
          <div v-if="loading" class="volunteer-follow-up-state" role="status">
            Loading your form…
          </div>
          <div
            v-else-if="error && !state"
            class="volunteer-follow-up-state"
            role="alert"
          >
            <p class="editorial-eyebrow">Link unavailable</p>
            <h2>We couldn’t open this form.</h2>
            <p>{{ error }}</p>
          </div>
          <div
            v-else-if="state?.submitted"
            class="volunteer-follow-up-state"
            aria-live="polite"
          >
            <p class="editorial-eyebrow">Received</p>
            <h2>Thank you, {{ state.name }}.</h2>
            <p>
              Your answers are saved. The volunteering team will review them
              after the response window closes.
            </p>
          </div>
          <div v-else-if="state?.expired" class="volunteer-follow-up-state">
            <p class="editorial-eyebrow">Response window closed</p>
            <h2>This form has closed.</h2>
            <p>The deadline was {{ responseDeadlineLabel }}.</p>
          </div>
          <form
            v-else-if="state"
            class="volunteer-follow-up-form"
            @submit.prevent="submit"
          >
            <header class="volunteer-follow-up-form-header">
              <div class="volunteer-follow-up-form-heading">
                <p class="editorial-eyebrow">Your volunteer application</p>
                <span>{{ previewMode ? "Example response" : "Two questions · one final submission" }}</span>
              </div>
              <h2>Hi {{ state.name }}.</h2>
              <p>Please share your answers by <strong>{{ responseDeadlineLabel }}</strong>.</p>
            </header>

            <div class="volunteer-follow-up-fields">
              <section class="volunteer-follow-up-question">
                <fieldset class="volunteer-follow-up-question-fields">
                  <legend>
                    Why would you like to volunteer?
                    <span class="volunteer-follow-up-required">Required</span>
                  </legend>
                  <p>Tell us what interests you about helping at the meetup.</p>
                <textarea
                  v-model="motivation"
                  id="volunteer-follow-up-motivation"
                  class="volunteer-follow-up-textarea app-form-control"
                  name="motivation"
                  maxlength="2000"
                  rows="5"
                  aria-describedby="volunteer-follow-up-word-count"
                  :disabled="disabledPreview"
                  required
                />
                <div
                  id="volunteer-follow-up-word-count"
                  class="volunteer-follow-up-counter"
                  :class="{ 'volunteer-follow-up-counter--over-limit': wordCount > 120 }"
                >
                  <span>Maximum 120 words</span>
                  <span aria-live="polite">{{ wordCount }} / 120 words</span>
                </div>
                </fieldset>
              </section>

              <section class="volunteer-follow-up-question">
                <fieldset
                  class="volunteer-follow-up-question-fields"
                  aria-describedby="volunteer-follow-up-attendance-help"
                >
                  <legend>
                    Can you come to Accra and volunteer on 19 December?
                    <span class="volunteer-follow-up-required">Required</span>
                  </legend>
                  <p id="volunteer-follow-up-attendance-help">We do not have travel grants or sponsorship.</p>
                  <div class="volunteer-follow-up-choices">
                    <label
                      v-for="choice in [
                        { label: 'Yes, I can attend', value: true },
                        { label: 'No, I cannot attend', value: false },
                      ]"
                      :key="choice.label"
                      class="volunteer-follow-up-choice"
                    >
                      <input
                        v-model="canAttendAccra"
                        type="radio"
                        name="can-attend-accra"
                        :value="choice.value"
                        :disabled="disabledPreview"
                        required
                      />
                      <span>{{ choice.label }}</span>
                    </label>
                  </div>
                </fieldset>
              </section>
            </div>

            <p
              v-if="error || turnstileError"
              class="volunteer-follow-up-error"
              role="alert"
            >
              {{ error || turnstileError }}
            </p>

            <div class="volunteer-follow-up-actions">
              <div
                v-if="turnstileActive && !disabledPreview"
                class="volunteer-follow-up-verification"
              >
                <span>Quick human check</span>
                <TurnstileWidget
                  :key="turnstileSize"
                  ref="turnstileWidget"
                  :size="turnstileSize"
                  :action="turnstileAction"
                  @token-change="turnstileToken = $event"
                  @error="turnstileError = $event ?? ''"
                />
              </div>
              <div
                v-else-if="disabledPreview"
                class="volunteer-follow-up-verification volunteer-follow-up-verification--preview"
              >
                <span>Human verification</span>
                <p>Turnstile appears here on the live form.</p>
              </div>
              <button
                class="volunteer-follow-up-submit motion-press"
                type="submit"
                :disabled="disabledPreview || !canSubmit"
                :aria-busy="submitting"
              >
                {{
                  disabledPreview
                    ? "Submission disabled in preview"
                    : submitting
                      ? "Saving your answers…"
                      : "Submit final answers"
                }}
              </button>
              <p class="volunteer-follow-up-final-note">
                You cannot edit these answers after submitting.
              </p>
            </div>
          </form>
        </section>
      </div>
    </section>
  </main>
</template>
