<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import TurnstileWidget from "@/src/components/TurnstileWidget.vue";
import { turnstileEnabled } from "@/src/lib/turnstile";
import { VOLUNTEER_FOLLOW_UP_TURNSTILE_ACTION } from "@/lib/turnstile";
import {
  canSubmitVolunteerFollowUpForm,
  volunteerFollowUpWordCount,
} from "@/lib/volunteer-follow-up";
import { annualConferencePath } from "@/src/annual-conference";

const DEVCONGRESS_LOGO_PATH = "/brand/dev-con-logo.png";

const props = withDefaults(
  defineProps<{
    previewMode?: boolean;
    embeddedPreview?: boolean;
    previewSeed?: string | null;
  }>(),
  {
  previewMode: false,
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
const campaignPath = annualConferencePath("volunteers", "2026");
const wordCount = computed(() => volunteerFollowUpWordCount(motivation.value));
const canSubmit = computed(() =>
  canSubmitVolunteerFollowUpForm(
    props.previewMode,
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

onMounted(async () => {
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

function createPreviewFormState(responseDeadline: string): FormState {
  return {
    name: "Ama Mensah",
    submitted: false,
    expired: false,
    response_deadline: responseDeadline,
  };
}

async function submit() {
  if (props.previewMode) return;
  if (!canSubmit.value || !state.value) return;

  submitting.value = true;
  error.value = "";

  try {
    const response = await fetch(
      `/api/volunteer-follow-up/${encodeURIComponent(recipientId.value)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-follow-up-token": privateToken.value,
        },
        body: JSON.stringify({
          motivation: motivation.value.trim(),
          can_attend_accra: canAttendAccra.value,
          turnstile_action: turnstileActive
            ? VOLUNTEER_FOLLOW_UP_TURNSTILE_ACTION
            : undefined,
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
    class="volunteer-intake-page"
    :class="{ 'volunteer-intake-page--embedded-preview': embeddedPreview }"
  >
    <div
      v-if="previewMode && !embeddedPreview"
      class="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b-2 border-dc-ink bg-dc-yellow px-4 py-3 text-sm text-dc-ink sm:px-8"
      role="status"
    >
      <span
        ><strong>Preview only</strong> · Example answers · Submission is
        disabled</span
      >
      <a :href="campaignPath" class="font-semibold underline underline-offset-4"
        >Back to campaign</a
      >
    </div>
    <section
      class="volunteer-intake-shell"
      aria-labelledby="volunteer-follow-up-title"
    >
      <div class="volunteer-intake-layout">
        <div class="volunteer-intake-intro">
          <a
            class="volunteer-intake-logo"
            href="https://devcongress.org"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Visit DevCongress"
          >
            <img :src="DEVCONGRESS_LOGO_PATH" alt="DevCongress" />
          </a>
          <p class="volunteer-intake-context">
            DevCongress <span aria-hidden="true">/</span> Volunteer team
          </p>
          <h1 id="volunteer-follow-up-title">
            One more step, together.
          </h1>
          <p class="volunteer-intake-lead">
            Help us understand your interest and availability for 19 December.
          </p>
          <p class="volunteer-intake-support">
            Two questions. Once you submit, your answers are final.
          </p>
          <p class="volunteer-intake-manifesto">Make the room better.</p>
        </div>

        <section
          class="volunteer-intake-form-stage"
          aria-label="Volunteer follow-up form"
        >
          <div v-if="loading" class="volunteer-intake-receipt" role="status">
            Loading your form…
          </div>
          <div
            v-else-if="error && !state"
            class="volunteer-intake-receipt"
            role="alert"
          >
            <p class="editorial-eyebrow">Link unavailable</p>
            <h2>We couldn’t open this form.</h2>
            <p>{{ error }}</p>
          </div>
          <div
            v-else-if="state?.submitted"
            class="volunteer-intake-receipt"
            aria-live="polite"
          >
            <p class="editorial-eyebrow">Received</p>
            <h2>Thank you, {{ state.name }}.</h2>
            <p>
              Your answers are saved. The volunteering team will review them
              after the response window closes.
            </p>
          </div>
          <div v-else-if="state?.expired" class="volunteer-intake-receipt">
            <p class="editorial-eyebrow">Response window closed</p>
            <h2>This form has closed.</h2>
            <p>The deadline was {{ responseDeadlineLabel }}.</p>
          </div>
          <form
            v-else-if="state"
            class="volunteer-intake-form"
            @submit.prevent="submit"
          >
            <header class="volunteer-intake-form-header">
              <div class="volunteer-intake-form-heading">
                <p class="editorial-eyebrow">Your volunteer application</p>
                <span>{{
                  previewMode
                    ? "Example response · Preview only"
                    : "Two questions · one final submission"
                }}</span>
              </div>
              <h2>Hi {{ state.name }}.</h2>
              <p>Please respond by {{ responseDeadlineLabel }}.</p>
            </header>

            <div class="volunteer-intake-fields">
              <label>
                <span>Why would you like to volunteer?</span>
                <textarea
                  v-model="motivation"
                  class="app-form-control min-h-36"
                  name="motivation"
                  maxlength="2000"
                  aria-describedby="volunteer-follow-up-word-count"
                  :disabled="previewMode"
                  required
                />
                <small
                  id="volunteer-follow-up-word-count"
                  class="app-form-help"
                  :class="wordCount > 120 ? 'text-red-700' : ''"
                  >{{ wordCount }} / 120 words</small
                >
              </label>

              <fieldset
                class="rounded-lg border border-dc-border bg-white p-4 sm:p-5"
              >
                <legend class="px-1 text-sm font-semibold text-dc-ink">
                  Can you come to Accra and volunteer on 19 December?
                </legend>
                <p class="mb-4 mt-2 text-sm leading-6 text-dc-gray">
                  We do not have travel grants or sponsorship.
                </p>
                <div class="flex flex-wrap gap-3">
                  <label
                    v-for="choice in [
                      { label: 'Yes, I can attend', value: true },
                      { label: 'No, I cannot attend', value: false },
                    ]"
                    :key="choice.label"
                    class="flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-dc-border px-4 py-2 text-sm font-medium text-dc-ink has-[:checked]:border-dc-ink has-[:checked]:bg-dc-yellow"
                  >
                    <input
                      v-model="canAttendAccra"
                      type="radio"
                      name="can-attend-accra"
                      :value="choice.value"
                      :disabled="previewMode"
                      required
                    />
                    <span>{{ choice.label }}</span>
                  </label>
                </div>
              </fieldset>
            </div>

            <p
              v-if="error || turnstileError"
              class="volunteer-intake-error"
              role="alert"
            >
              {{ error || turnstileError }}
            </p>

            <div class="volunteer-intake-actions">
              <div
                v-if="turnstileActive && !previewMode"
                class="volunteer-intake-verification"
              >
                <span>Quick human check</span>
                <TurnstileWidget
                  ref="turnstileWidget"
                  size="flexible"
                  :action="VOLUNTEER_FOLLOW_UP_TURNSTILE_ACTION"
                  @token-change="turnstileToken = $event"
                  @error="turnstileError = $event ?? ''"
                />
              </div>
              <div
                v-else-if="previewMode"
                class="volunteer-intake-verification volunteer-intake-verification--preview"
              >
                <span>Human verification</span>
                <p>Turnstile appears here on the live form.</p>
              </div>
              <button
                class="volunteer-intake-submit motion-press"
                type="submit"
                :disabled="previewMode || !canSubmit"
                :aria-busy="submitting"
              >
                {{
                  previewMode
                    ? "Submission disabled in preview"
                    : submitting
                      ? "Saving your answers…"
                      : "Submit final answers"
                }}
              </button>
              <p class="app-form-help">
                You cannot edit these answers after submitting.
              </p>
            </div>
          </form>
        </section>
      </div>
    </section>
  </main>
</template>
