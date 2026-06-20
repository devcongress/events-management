<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminFeedbackPageSkeleton from '@/src/components/ui/page-skeletons/AdminFeedbackPageSkeleton.vue';
import { notify } from '@/src/lib/notify';
import type { Event as CommunityEvent, EventFeedbackSubmission, FeedbackCampaign, FeedbackQuestion, FeedbackQuestionType, PublicMeetupScheduleItem, Talk } from '@/types';

interface FeedbackCampaignResponse {
  event: CommunityEvent;
  campaign: FeedbackCampaign;
  submissions: EventFeedbackSubmission[];
  talks: Talk[];
  public_url: string;
  feedback_window: {
    opens_at: string | null;
    closes_at: string | null;
  };
  is_open: boolean;
}

interface FeedbackActivityDraft {
  id: string;
  label: string;
  source: 'schedule' | 'talk' | 'custom';
  enabled: boolean;
}

interface PreviewDraftPayload {
  title: string;
  intro: string | null;
  questions: FeedbackQuestion[];
}

const route = useRoute();
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const publicUrl = ref('');
const isOpen = ref(false);
const feedbackWindow = ref<FeedbackCampaignResponse['feedback_window']>({ opens_at: null, closes_at: null });
const submissions = ref<EventFeedbackSubmission[]>([]);
const event = ref<CommunityEvent | null>(null);
const talks = ref<Talk[]>([]);
const activities = ref<FeedbackActivityDraft[]>([]);
const activitiesHydrated = ref(false);
const lastGeneratedActivitySignature = ref<string | null>(null);
const copyState = ref<'idle' | 'copying' | 'copied'>('idle');
let copyResetTimer: ReturnType<typeof setTimeout> | null = null;
const form = reactive<FeedbackCampaign>({
  id: '',
  event_id: '',
  title: '',
  intro: '',
  status: 'draft',
  auto_open_on_event_completion: true,
  opens_at: null,
  closes_at: null,
  questions: [],
  created_at: '',
  updated_at: '',
});
const questionTypes: { value: FeedbackQuestionType; label: string }[] = [
  { value: 'rating', label: 'Rating' },
  { value: 'talk_select', label: 'Talk picker' },
  { value: 'text', label: 'Text' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'choice', label: 'Choice' },
];
const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
];
const statusLabel = computed(() => {
  if (form.status === 'active') return 'Open manually';
  if (form.status === 'closed') return 'Closed';
  return form.auto_open_on_event_completion ? 'Opens when event completes' : 'Draft';
});
const completionRateCopy = computed(() => `${submissions.value.length} response${submissions.value.length === 1 ? '' : 's'}`);
const copyLinkLabel = computed(() => {
  if (copyState.value === 'copying') return 'Copying...';
  if (copyState.value === 'copied') return 'Copied';
  return 'Copy Link';
});
const selectedActivityCount = computed(() => activities.value.filter((activity) => activity.enabled && activity.label.trim()).length);
const currentActivitySignature = computed(() => JSON.stringify(
  activities.value.map((activity) => ({
    label: activity.label.trim(),
    enabled: activity.enabled,
    source: activity.source,
  })),
));
const canGenerateQuestions = computed(() => (
  selectedActivityCount.value > 0
  && currentActivitySignature.value !== lastGeneratedActivitySignature.value
));
const windowCopy = computed(() => {
  if (form.status === 'active' && !feedbackWindow.value.closes_at) {
    return 'Manual testing window';
  }

  if (!feedbackWindow.value.opens_at || !feedbackWindow.value.closes_at) {
    return 'Auto window is set by the event date.';
  }

  const opens = new Date(feedbackWindow.value.opens_at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  const closes = new Date(feedbackWindow.value.closes_at).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return `${opens} to ${closes}`;
});

function hydrateCampaign(data: FeedbackCampaignResponse) {
  event.value = data.event;
  talks.value = data.talks;
  Object.assign(form, {
    ...data.campaign,
    questions: data.campaign.questions.map((question) => ({
      ...question,
      options: [...question.options],
    })),
  });
  submissions.value = data.submissions;
  publicUrl.value = data.public_url;
  feedbackWindow.value = data.feedback_window;
  isOpen.value = data.is_open;

  if (!activitiesHydrated.value) {
    activities.value = buildActivityDrafts(data.event, data.talks);
    activitiesHydrated.value = true;
  }
}

async function fetchCampaign() {
  loading.value = true;
  error.value = '';

  const response = await fetch(`/api/events/${route.params.eventId}/feedback-campaign`);
  if (response.ok) {
    hydrateCampaign(await response.json());
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Unable to load feedback campaign';
  }

  loading.value = false;
}

async function saveCampaign(options: { overrideStatus?: FeedbackCampaign['status']; successMessage?: string } = {}) {
  saving.value = true;
  error.value = '';

  const response = await fetch(`/api/events/${route.params.eventId}/feedback-campaign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: form.title,
      intro: form.intro,
      status: options.overrideStatus ?? form.status,
      auto_open_on_event_completion: form.auto_open_on_event_completion,
      opens_at: form.opens_at,
      closes_at: form.closes_at,
      questions: form.questions,
    }),
  });

  if (response.ok) {
    const data = await response.json();
    hydrateCampaign({ ...data, submissions: submissions.value });
    notify.success(options.successMessage ?? 'Feedback campaign saved.', { id: 'feedback-campaign-saved' });
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Unable to save feedback campaign';
  }

  saving.value = false;
}

function addQuestion(type: FeedbackQuestionType = 'text') {
  form.questions.push({
    id: crypto.randomUUID(),
    type,
    label: '',
    required: false,
    options: type === 'choice' ? [''] : [],
    order_index: form.questions.length,
  });
}

function activityLabelKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scheduleActivityLabel(item: PublicMeetupScheduleItem): string {
  const title = item.title.trim();
  const lead = item.lead?.trim();
  if (!lead || title.toLowerCase().includes(lead.toLowerCase())) {
    return title;
  }

  return `${title} by ${lead}`;
}

function isFeedbackActivity(item: PublicMeetupScheduleItem): boolean {
  const title = item.title.trim();
  if (!title) return false;
  if (item.type === 'break' || item.type === 'networking') return false;
  if (/^welcome\b/i.test(title)) return false;
  return true;
}

function buildActivityDrafts(sourceEvent: CommunityEvent, sourceTalks: Talk[]): FeedbackActivityDraft[] {
  const drafts: FeedbackActivityDraft[] = [];
  const seen = new Set<string>();

  function addActivity(label: string, source: FeedbackActivityDraft['source']) {
    const normalizedLabel = label.trim();
    const key = activityLabelKey(normalizedLabel);
    if (!normalizedLabel || seen.has(key)) return;
    seen.add(key);
    drafts.push({
      id: crypto.randomUUID(),
      label: normalizedLabel,
      source,
      enabled: true,
    });
  }

  for (const talk of sourceTalks) {
    addActivity(`${talk.title} by ${talk.speaker_name}`, 'talk');
  }

  for (const item of sourceEvent.schedule ?? []) {
    if (isFeedbackActivity(item)) {
      addActivity(scheduleActivityLabel(item), 'schedule');
    }
  }

  return drafts;
}

function addActivityDraft() {
  activities.value.push({
    id: crypto.randomUUID(),
    label: '',
    source: 'custom',
    enabled: true,
  });
}

function generateQuestionsFromActivities() {
  const selectedActivities = activities.value
    .filter((activity) => activity.enabled && activity.label.trim())
    .map((activity) => activity.label.trim());

  if (selectedActivities.length === 0) {
    error.value = 'Add at least one activity before generating questions.';
    return;
  }

  error.value = '';
  form.title = event.value ? `How was ${event.value.name}?` : 'How was the meetup?';
  form.intro = 'On a scale of 1 - 5, rate the sessions you joined where 1 is extremely unsatisfied and 5 is extremely satisfied.';
  form.questions = [
    ...selectedActivities.map((label, index) => ({
      id: crypto.randomUUID(),
      type: 'rating' as const,
      label,
      required: false,
      options: [],
      order_index: index,
    })),
    {
      id: crypto.randomUUID(),
      type: 'yes_no' as const,
      label: 'Would you attend another DevCongress meetup like this?',
      required: false,
      options: [],
      order_index: selectedActivities.length,
    },
    {
      id: crypto.randomUUID(),
      type: 'text' as const,
      label: 'Other comments',
      required: false,
      options: [],
      order_index: selectedActivities.length + 1,
    },
  ];
  lastGeneratedActivitySignature.value = currentActivitySignature.value;
}

function syncQuestionsToLatestSelection() {
  if (canGenerateQuestions.value) {
    generateQuestionsFromActivities();
  }
}

function removeQuestion(questionId: string) {
  form.questions = form.questions
    .filter((question) => question.id !== questionId)
    .map((question, index) => ({ ...question, order_index: index }));
}

function addOption(question: FeedbackQuestion) {
  question.options.push('');
}

function removeOption(question: FeedbackQuestion, index: number) {
  question.options.splice(index, 1);
}

function setQuestionType(question: FeedbackQuestion, type: FeedbackQuestionType) {
  question.type = type;
  if (type === 'choice' && question.options.length === 0) {
    question.options = [''];
  }
  if (type !== 'choice') {
    question.options = [];
  }
}

async function copyPublicUrl() {
  if (!publicUrl.value || copyState.value !== 'idle') return;

  copyState.value = 'copying';
  error.value = '';

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(publicUrl.value);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = publicUrl.value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    copyState.value = 'copied';

    copyResetTimer = setTimeout(() => {
      copyState.value = 'idle';
      copyResetTimer = null;
    }, 1600);
  } catch {
    copyState.value = 'idle';
    error.value = 'Unable to copy link. Select the URL and copy it manually.';
  }
}

function answerPreview(submission: EventFeedbackSubmission) {
  return submission.answers
    .map((answer) => {
      const question = form.questions.find((item) => item.id === answer.question_id);
      return `${question?.label ?? 'Question'}: ${String(answer.value ?? 'No answer')}`;
    })
    .join(' | ');
}

function previewDraftStorageKey() {
  return `devcon:event-feedback-preview:${String(route.params.eventId ?? '')}`;
}

function openPreviewPublicForm() {
  syncQuestionsToLatestSelection();

  try {
    const draft: PreviewDraftPayload = {
      title: form.title,
      intro: form.intro,
      questions: form.questions.map((question) => ({
        ...question,
        options: [...question.options],
      })),
    };
    window.localStorage.setItem(previewDraftStorageKey(), JSON.stringify(draft));
  } catch {
    // If storage is unavailable, fall back to the last saved campaign preview.
  }

  window.open(`/feedback/${route.params.eventId}?preview=1`, '_blank', 'noopener,noreferrer');
}

async function publishCampaign() {
  syncQuestionsToLatestSelection();
  await saveCampaign({
    overrideStatus: 'active',
    successMessage: 'Feedback form published.',
  });
}

onMounted(fetchCampaign);

onBeforeUnmount(() => {
  if (copyResetTimer) {
    clearTimeout(copyResetTimer);
  }
});
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AdminFeedbackPageSkeleton v-if="loading" />

      <template v-else>
        <header class="editorial-header flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p class="editorial-eyebrow">event feedback</p>
            <h1 class="editorial-title">Feedback form</h1>
            <p class="editorial-subtitle">Shape the form people see after the event, then open it manually or let it unlock when the event is completed.</p>
          </div>
          <div class="editorial-panel p-4">
            <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">Status</p>
            <p class="mt-1 text-2xl font-black tracking-tight text-dc-ink">{{ statusLabel }}</p>
            <p class="mt-2 font-mono text-xs uppercase tracking-wide text-dc-pink">{{ completionRateCopy }}</p>
            <p class="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ windowCopy }}</p>
          </div>
        </header>

        <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>
        <section class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <form class="space-y-6" @submit.prevent="publishCampaign()">
            <div class="editorial-panel p-5">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p class="editorial-eyebrow">final activity list</p>
                  <h2 class="text-2xl font-black tracking-tight text-dc-ink">What actually happened</h2>
                </div>
                <button type="button" class="editorial-secondary-action" @click="addActivityDraft">Add Activity</button>
              </div>

              <div class="mt-5 space-y-3">
                <div
                  v-for="activity in activities"
                  :key="activity.id"
                  class="grid gap-3 rounded-md border-2 border-dc-border bg-dc-paper px-3 py-3 md:grid-cols-[2.5rem_minmax(0,1fr)_6.5rem] md:items-center"
                >
                  <label class="flex items-center gap-3 md:justify-center">
                    <input v-model="activity.enabled" type="checkbox" class="size-5 accent-dc-pink" />
                    <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray md:hidden">Use</span>
                  </label>
                  <input v-model="activity.label" class="editorial-input min-h-11" type="text" placeholder="Activity name" />
                  <span class="rounded bg-dc-paper-warm px-2 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">{{ activity.source }}</span>
                </div>

                <div v-if="activities.length === 0" class="rounded-md border-2 border-dashed border-dc-border p-5 text-sm leading-6 text-dc-gray">
                  Add the final talks, sessions, demos, or discussions before generating questions.
                </div>
              </div>

              <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ selectedActivityCount }} selected</p>
                <button type="button" class="editorial-action" :disabled="!canGenerateQuestions" @click="generateQuestionsFromActivities">Generate Questions</button>
              </div>
            </div>

            <div class="editorial-panel p-5">
              <div class="grid gap-4 md:grid-cols-2">
                <label class="block md:col-span-2">
                  <span class="editorial-label">Form title</span>
                  <input v-model="form.title" required class="editorial-input" type="text" />
                </label>
                <label class="block md:col-span-2">
                  <span class="editorial-label">Intro</span>
                  <textarea v-model="form.intro" class="editorial-input min-h-24 resize-none" />
                </label>
                <AppDropdown v-model="form.status" label="Status" :options="statusOptions" />
                <div class="block">
                  <span class="editorial-label">Automation</span>
                  <label class="mt-2 flex min-h-[50px] items-center gap-3 rounded-md border-2 border-dc-border bg-dc-paper-warm px-4 py-3">
                    <input v-model="form.auto_open_on_event_completion" type="checkbox" class="size-5 shrink-0 accent-dc-pink" />
                    <span class="min-w-0 text-sm font-bold leading-5 text-dc-ink">Auto-open after event, close after 3 days</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p class="editorial-eyebrow">questions</p>
                  <h2 class="text-2xl font-black tracking-tight text-dc-ink">What attendees answer</h2>
                </div>
                <button type="button" class="editorial-secondary-action" @click="addQuestion()">Add Question</button>
              </div>

              <TransitionGroup name="feedback-question-list" tag="div" class="space-y-4">
              <div
                v-for="(question, index) in form.questions"
                :key="question.id"
                class="feedback-question-card editorial-panel p-5"
                :style="{ zIndex: form.questions.length - index }"
              >
                <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p class="font-mono text-xs font-bold uppercase tracking-wide text-dc-pink">Question {{ index + 1 }}</p>
                  <div class="flex w-full items-center justify-between gap-2 rounded-md border border-dc-border bg-dc-paper-warm p-1 sm:w-auto sm:justify-end">
                    <label class="motion-press flex min-h-9 cursor-pointer items-center gap-2 rounded px-3 py-2">
                      <input v-model="question.required" type="checkbox" class="size-4 accent-dc-pink" />
                      <span class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-ink">Required</span>
                    </label>
                    <span class="h-6 w-px bg-dc-border" aria-hidden="true" />
                    <button type="button" class="feedback-remove-action motion-press min-h-9 rounded px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide" @click="removeQuestion(question.id)">Remove</button>
                  </div>
                </div>
                <div class="grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
                  <AppDropdown
                    :model-value="question.type"
                    label="Type"
                    :options="questionTypes"
                    @update:model-value="setQuestionType(question, $event as FeedbackQuestionType)"
                  />
                  <label class="block">
                    <span class="editorial-label">Prompt</span>
                    <input v-model="question.label" required class="editorial-input" type="text" />
                  </label>
                </div>

                <div v-if="question.type === 'choice'" class="mt-4 space-y-3">
                  <div v-for="(_, optionIndex) in question.options" :key="optionIndex" class="flex gap-3">
                    <input v-model="question.options[optionIndex]" class="editorial-input" type="text" :placeholder="`Option ${optionIndex + 1}`" />
                    <button type="button" class="editorial-secondary-action px-3" @click="removeOption(question, optionIndex)">x</button>
                  </div>
                  <button type="button" class="font-mono text-xs font-bold uppercase tracking-wide text-dc-pink" @click="addOption(question)">Add option</button>
                </div>
              </div>
              </TransitionGroup>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row">
              <button
                v-if="publicUrl"
                type="button"
                class="editorial-secondary-action"
                @click="openPreviewPublicForm"
              >
                Preview
              </button>
              <button type="submit" class="editorial-action" :disabled="saving">{{ saving ? 'Publishing...' : 'Publish' }}</button>
            </div>
          </form>

          <aside class="space-y-6">
            <section class="editorial-panel p-5">
              <p class="editorial-eyebrow">community link</p>
              <p class="break-all font-mono text-sm font-bold text-dc-ink">{{ publicUrl }}</p>
              <div class="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  class="editorial-secondary-action min-w-[124px] overflow-hidden"
                  :class="copyState === 'copied' ? 'bg-dc-success-soft text-dc-success' : ''"
                  :disabled="copyState !== 'idle'"
                  :data-copy-state="copyState"
                  :aria-label="copyState === 'copied' ? 'Public feedback link copied' : 'Copy public feedback link'"
                  @click="copyPublicUrl"
                >
                  <Transition name="copy-label" mode="out-in">
                    <span :key="copyState" class="inline-block">{{ copyLinkLabel }}</span>
                  </Transition>
                </button>
                <span class="rounded-md border-2 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wide" :class="isOpen ? 'border-dc-success bg-dc-success-soft text-dc-success' : 'border-dc-border bg-dc-paper-warm text-dc-gray'">
                  {{ isOpen ? 'Open' : 'Not Open' }}
                </span>
              </div>
            </section>

            <section class="editorial-panel p-5">
              <p class="editorial-eyebrow">recent responses</p>
              <div v-if="submissions.length === 0" class="mt-4 rounded-md border-2 border-dashed border-dc-border p-5 text-sm leading-6 text-dc-gray">
                Responses will land here once people submit the event form.
              </div>
              <div v-else class="mt-4 divide-y-2 divide-dc-border">
                <article v-for="submission in submissions.slice(0, 6)" :key="submission.id" class="py-4">
                  <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ new Date(submission.created_at).toLocaleString() }}</p>
                  <p class="mt-2 text-sm leading-6 text-dc-ink">{{ answerPreview(submission) }}</p>
                </article>
              </div>
            </section>
          </aside>
        </section>
      </template>
    </div>
  </div>
</template>
