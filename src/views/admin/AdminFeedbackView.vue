<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminFeedbackPageSkeleton from '@/src/components/ui/page-skeletons/AdminFeedbackPageSkeleton.vue';
import { adminPath } from '@/src/admin-routes';
import { buildEventFeedbackCsv } from '@/lib/event-feedback-export';
import { buildEventFeedbackReport } from '@/lib/event-feedback-report';
import { MONTHLY_FEEDBACK_WINDOW_MS } from '@/lib/event-feedback-window';
import { resolveEventSeriesType } from '@/lib/event-series';
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

interface SaveCampaignOptions {
  overrideStatus?: FeedbackCampaign['status'];
  overrideOpensAt?: string | null;
  overrideClosesAt?: string | null;
  successMessage?: string;
}

const FEEDBACK_WINDOW_FORMATTER = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const route = useRoute();
const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const removing = ref(false);
const error = ref('');
const isOpen = ref(false);
const publicUrl = ref('');
const copyState = ref<'idle' | 'copying' | 'copied'>('idle');
const feedbackWindow = ref<FeedbackCampaignResponse['feedback_window']>({ opens_at: null, closes_at: null });
const submissions = ref<EventFeedbackSubmission[]>([]);
const event = ref<CommunityEvent | null>(null);
const talks = ref<Talk[]>([]);
const activities = ref<FeedbackActivityDraft[]>([]);
const activitiesHydrated = ref(false);
const lastGeneratedActivitySignature = ref<string | null>(null);
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
const isMonthlyEvent = computed(() => (
  event.value ? resolveEventSeriesType(event.value) === 'monthly' : false
));
const feedbackWindowHasExpired = computed(() => (
  Boolean(
    feedbackWindow.value.closes_at
    && new Date(feedbackWindow.value.closes_at).getTime() < Date.now(),
  )
));
const feedbackWindowHasNotOpened = computed(() => (
  Boolean(
    feedbackWindow.value.opens_at
    && new Date(feedbackWindow.value.opens_at).getTime() > Date.now(),
  )
));
const statusLabel = computed(() => {
  if (isOpen.value) return form.status === 'active' ? 'Open' : 'Open automatically';
  if (form.status === 'closed') return 'Closed';
  if (feedbackWindowHasNotOpened.value) return 'Scheduled';
  if (form.status === 'active' || feedbackWindowHasExpired.value) return 'Auto-closed';
  return form.auto_open_on_event_completion ? 'Scheduled' : 'Draft';
});
const completionRateCopy = computed(() => `${submissions.value.length} response${submissions.value.length === 1 ? '' : 's'}`);
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
  if (form.status === 'closed') {
    return 'Closed manually · reopen when needed';
  }

  if (feedbackWindow.value.closes_at) {
    const closeLabel = FEEDBACK_WINDOW_FORMATTER.format(new Date(feedbackWindow.value.closes_at));
    return isOpen.value ? `Closes ${closeLabel}` : `Closed ${closeLabel}`;
  }

  if (feedbackWindow.value.opens_at) {
    return `Opens ${FEEDBACK_WINDOW_FORMATTER.format(new Date(feedbackWindow.value.opens_at))}`;
  }

  return isOpen.value ? 'Open until manually closed' : 'Not open yet';
});
const publishedCampaign = computed(() => form.status === 'active' || form.status === 'closed');
const responsesMode = computed(() => publishedCampaign.value || route.query.view === 'responses');
const attendeeAccessTitle = computed(() => (
  isOpen.value
    ? 'Share the live form'
    : publishedCampaign.value
      ? 'Feedback window closed'
      : 'Feedback form is not open'
));
const attendeeAccessCopy = computed(() => {
  if (isOpen.value && feedbackWindow.value.closes_at) {
    return `Attendees can submit until ${FEEDBACK_WINDOW_FORMATTER.format(new Date(feedbackWindow.value.closes_at))}. You can close it sooner if needed.`;
  }

  if (isOpen.value) {
    return 'Preview exactly what attendees see, copy the live form link, or open a clean QR screen for a shared display.';
  }

  if (isMonthlyEvent.value) {
    return 'Monthly feedback closes 24 hours after the meetup. Reopen it for one more day when an attendee needs a little extra time.';
  }

  return 'Reopen the form for 24 hours when attendees need another chance to respond.';
});
const defaultAccessCopy = computed(() => (
  isMonthlyEvent.value
    ? 'Auto-open at meetup end and close 24 hours later'
    : 'Auto-open when the event is completed'
));
const copyLinkLabel = computed(() => {
  if (copyState.value === 'copying') return 'Copying…';
  if (copyState.value === 'copied') return 'Copied';
  return 'Copy attendee link';
});
const feedbackReport = computed(() => buildEventFeedbackReport(form.questions, submissions.value));
const primaryBinaryInsight = computed(() => feedbackReport.value.binaryQuestions[0] ?? null);
const ratingDistributionMaxCount = computed(() => Math.max(
  0,
  ...feedbackReport.value.ratingDistribution.map((item) => item.count),
));

function hydrateCampaign(data: FeedbackCampaignResponse) {
  const shouldGenerateFromActivities = isDefaultCampaignDraft(data.campaign);

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

  if (shouldGenerateFromActivities && selectedActivityCount.value > 0) {
    generateQuestionsFromActivities();
  }
}

async function fetchCampaign() {
  loading.value = true;
  error.value = '';

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/feedback-campaign`);
    if (response.ok) {
      hydrateCampaign(await response.json());
    } else {
      const payload = await response.json().catch(() => ({}));
      error.value = payload.error ?? `Unable to load feedback campaign (${response.status})`;
    }
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Unable to load feedback campaign';
  }

  loading.value = false;
}

async function saveCampaign(options: SaveCampaignOptions = {}) {
  saving.value = true;
  error.value = '';

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/feedback-campaign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        intro: form.intro,
        status: options.overrideStatus ?? form.status,
        auto_open_on_event_completion: form.auto_open_on_event_completion,
        opens_at: options.overrideOpensAt !== undefined ? options.overrideOpensAt : form.opens_at,
        closes_at: options.overrideClosesAt !== undefined ? options.overrideClosesAt : form.closes_at,
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
  } catch {
    error.value = 'Unable to save the feedback campaign. Check your connection and try again.';
  } finally {
    saving.value = false;
  }
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

function isDefaultCampaignDraft(campaign: FeedbackCampaign): boolean {
  if (campaign.status !== 'draft') return false;
  if (campaign.title !== 'How was the meetup?') return false;
  if (campaign.intro !== 'Tell us what landed, what dragged, and what should change next month.') return false;

  const labels = campaign.questions.map((question) => question.label);
  return labels.length === 4
    && labels.includes('How would you rate today\'s event?')
    && labels.includes('Which talk or session was most useful?')
    && labels.includes('Would you attend the next DevCongress community event?')
    && labels.includes('Other comments');
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
  form.intro = 'For sessions you attended, rate 1 (extremely unsatisfied) to 5 (extremely satisfied). Choose Did not attend for anything you missed.';
  form.questions = [
    ...selectedActivities.map((label, index) => ({
      id: crypto.randomUUID(),
      type: 'rating' as const,
      label,
      required: true,
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

function ratingBarHeight(count: number): string {
  if (count === 0 || ratingDistributionMaxCount.value === 0) return '0%';
  return `${Math.max(8, Math.round((count / ratingDistributionMaxCount.value) * 100))}%`;
}

function ratingBarColor(rating: number): string {
  if (rating >= 4) return '#e8117f';
  if (rating === 3) return '#f4df34';
  return '#111111';
}

function questionRatingWidth(average: number | null): string {
  return average === null ? '0%' : `${Math.round((average / 5) * 100)}%`;
}

function downloadResponsesCsv() {
  if (submissions.value.length === 0) return;

  const csv = buildEventFeedbackCsv(form.questions, submissions.value);
  const blobUrl = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  const eventLabel = (event.value?.name ?? 'event-feedback')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  link.href = blobUrl;
  link.download = `${eventLabel || 'event-feedback'}-responses.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(blobUrl);
  notify.success(`Downloaded ${submissions.value.length} response${submissions.value.length === 1 ? '' : 's'}.`);
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
    // The saved campaign remains available as the fallback preview.
  }

  window.open(`/feedback/${route.params.eventId}?preview=1`, '_blank', 'noopener,noreferrer');
}

async function copyPublicUrl() {
  if (!publicUrl.value || !isOpen.value || copyState.value !== 'idle') return;

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
    error.value = 'Unable to copy the attendee link. Open the QR display and scan it instead.';
  }
}

function openFeedbackDisplay() {
  if (!isOpen.value) return;
  window.open(adminPath(`feedback-display/${route.params.eventId}`), '_blank', 'noopener,noreferrer');
}

async function publishCampaign() {
  syncQuestionsToLatestSelection();
  await saveCampaign({
    overrideStatus: 'active',
    successMessage: 'Feedback form published.',
  });
}

async function reopenCampaignForOneDay() {
  const opensAt = new Date();
  const closesAt = new Date(opensAt.getTime() + MONTHLY_FEEDBACK_WINDOW_MS);

  await saveCampaign({
    overrideStatus: 'active',
    overrideOpensAt: opensAt.toISOString(),
    overrideClosesAt: closesAt.toISOString(),
    successMessage: 'Feedback form reopened for 24 hours.',
  });
}

async function closeCampaignNow() {
  await saveCampaign({
    overrideStatus: 'closed',
    overrideClosesAt: new Date().toISOString(),
    successMessage: 'Feedback form closed.',
  });
}

async function removeFeedbackForm() {
  if (!event.value || removing.value) return;

  const confirmed = window.confirm(`Remove the feedback form for ${event.value.name}? Existing responses stay in the reports, but this form and its questions will be removed.`);
  if (!confirmed) return;

  removing.value = true;
  error.value = '';

  try {
    const response = await fetch(`/api/events/${route.params.eventId}/feedback-campaign`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      error.value = payload.error ?? 'Unable to remove feedback form';
      return;
    }

    notify.success('Feedback form removed.', {
      description: 'Existing responses were kept for reporting.',
    });
    await router.push(adminPath('feedback'));
  } catch {
    error.value = 'Unable to remove feedback form';
  } finally {
    removing.value = false;
  }
}

onMounted(fetchCampaign);

onBeforeUnmount(() => {
  if (copyResetTimer) clearTimeout(copyResetTimer);
});

</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AdminFeedbackPageSkeleton v-if="loading" />

      <template v-else>
        <header class="editorial-header flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div class="min-w-0">
            <p class="editorial-eyebrow">event feedback</p>
            <h1 class="editorial-title">{{ responsesMode ? 'Responses' : 'Feedback form' }}</h1>
            <p class="editorial-subtitle">{{ responsesMode ? 'See the patterns across every response. Download the full response file when individual answers are needed.' : 'Shape the form people see, then either publish it manually or leave it open by default.' }}</p>
          </div>
          <div class="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end">
            <button
              v-if="responsesMode && submissions.length > 0"
              type="button"
              class="feedback-export-button motion-press"
              @click="downloadResponsesCsv"
            >
              Download responses
            </button>
            <div class="editorial-panel p-4">
              <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">Status</p>
              <p class="mt-1 text-2xl font-black tracking-tight text-dc-ink">{{ statusLabel }}</p>
              <p class="mt-2 font-mono text-xs uppercase tracking-wide text-dc-pink">{{ completionRateCopy }}</p>
              <p class="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ windowCopy }}</p>
            </div>
          </div>
        </header>

        <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">{{ error }}</div>
        <template v-if="responsesMode">
          <section class="space-y-6">
            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <section class="editorial-panel bg-dc-paper p-5">
                <p class="editorial-eyebrow">responses</p>
                <p class="mt-2 text-4xl font-black tracking-tight text-dc-ink">{{ submissions.length }}</p>
              </section>
              <section class="editorial-panel bg-dc-paper-warm p-5">
                <p class="editorial-eyebrow">avg rating</p>
                <p class="mt-2 text-4xl font-black tracking-tight text-dc-ink">{{ feedbackReport.averageRating ?? '-' }}</p>
              </section>
              <section class="editorial-panel p-5">
                <p class="editorial-eyebrow">attend again</p>
                <p class="mt-2 text-4xl font-black tracking-tight text-dc-ink">{{ primaryBinaryInsight?.yesPercent === null || primaryBinaryInsight?.yesPercent === undefined ? '-' : `${primaryBinaryInsight.yesPercent}%` }}</p>
              </section>
              <section class="editorial-panel p-5">
                <p class="editorial-eyebrow">comments</p>
                <p class="mt-2 text-4xl font-black tracking-tight text-dc-ink">{{ feedbackReport.comments }}</p>
              </section>
              <section class="editorial-panel border-dc-yellow bg-dc-yellow/20 p-5">
                <p class="editorial-eyebrow">sessions missed</p>
                <p class="mt-2 text-4xl font-black tracking-tight text-dc-ink">{{ feedbackReport.notAttended }}</p>
              </section>
            </div>

            <section class="feedback-insights-grid" aria-labelledby="feedback-insights-title">
                <div class="feedback-insight-card feedback-insight-card--ratings">
                <div>
                  <p class="editorial-eyebrow">rating distribution</p>
                  <h2 id="feedback-insights-title" class="feedback-insight-title">How the room scored it</h2>
                  <p class="feedback-insight-copy">{{ feedbackReport.ratingCount }} session rating{{ feedbackReport.ratingCount === 1 ? '' : 's' }} across every response</p>
                </div>

                <div
                  v-if="feedbackReport.ratingCount > 0"
                  class="feedback-rating-chart"
                  role="img"
                  :aria-label="`Rating distribution from ${feedbackReport.ratingCount} ratings`"
                >
                  <div
                    v-for="item in feedbackReport.ratingDistribution"
                    :key="item.rating"
                    class="feedback-rating-column"
                  >
                    <span class="feedback-rating-count">{{ item.count }}</span>
                    <div class="feedback-rating-track" aria-hidden="true">
                      <span
                        class="feedback-rating-bar"
                        :style="{
                          height: ratingBarHeight(item.count),
                          backgroundColor: ratingBarColor(item.rating),
                        }"
                      />
                    </div>
                    <span class="feedback-rating-label">{{ item.rating }} star</span>
                    <span class="feedback-rating-percent">{{ item.percent }}%</span>
                  </div>
                </div>
                <p v-else class="feedback-insight-empty">Ratings will appear here as responses arrive.</p>
              </div>

                <div class="feedback-insight-card feedback-insight-card--return">
                <div>
                  <p class="editorial-eyebrow">return intent</p>
                  <h2 class="feedback-insight-title">Would they come back?</h2>
                  <p class="feedback-insight-copy">{{ primaryBinaryInsight?.label ?? 'No yes/no question configured' }}</p>
                </div>

                <div v-if="primaryBinaryInsight && primaryBinaryInsight.total > 0" class="feedback-return-chart">
                  <div
                    class="feedback-return-donut"
                    role="img"
                    :aria-label="`${primaryBinaryInsight.yesPercent}% yes and ${100 - (primaryBinaryInsight.yesPercent ?? 0)}% no`"
                    :style="{ background: `conic-gradient(#e8117f 0 ${primaryBinaryInsight.yesPercent ?? 0}%, #111111 ${primaryBinaryInsight.yesPercent ?? 0}% 100%)` }"
                  >
                    <div class="feedback-return-donut__center">
                      <strong>{{ primaryBinaryInsight.yesPercent }}%</strong>
                      <span>Yes</span>
                    </div>
                  </div>
                  <dl class="feedback-return-legend">
                    <div>
                      <dt><span class="feedback-return-dot feedback-return-dot--yes" /> Yes</dt>
                      <dd>{{ primaryBinaryInsight.yesCount }}</dd>
                    </div>
                    <div>
                      <dt><span class="feedback-return-dot feedback-return-dot--no" /> No</dt>
                      <dd>{{ primaryBinaryInsight.noCount }}</dd>
                    </div>
                  </dl>
                </div>
                <p v-else class="feedback-insight-empty">Yes/no answers will appear here as responses arrive.</p>
              </div>

                <div class="feedback-insight-card feedback-insight-card--sessions">
                <div>
                  <p class="editorial-eyebrow">session signals</p>
                  <h2 class="feedback-insight-title">What landed—and what did not</h2>
                  <p class="feedback-insight-copy">Average scores exclude attendees who marked a session as missed.</p>
                </div>

                <div v-if="feedbackReport.questionRatings.length > 0" class="feedback-session-chart">
                  <article
                    v-for="insight in feedbackReport.questionRatings"
                    :key="insight.questionId"
                    class="feedback-session-row"
                  >
                    <div class="feedback-session-row__heading">
                      <h3>{{ insight.label }}</h3>
                      <strong>{{ insight.average === null ? 'No score' : `${insight.average}/5` }}</strong>
                    </div>
                    <div class="feedback-session-track" aria-hidden="true">
                      <span :style="{ width: questionRatingWidth(insight.average) }" />
                    </div>
                    <p>
                      {{ insight.ratingCount }} rated
                      <span aria-hidden="true">·</span>
                      {{ insight.positivePercent === null ? 'No positive-rate data' : `${insight.positivePercent}% scored 4–5` }}
                      <span aria-hidden="true">·</span>
                      {{ insight.missedCount }} missed
                    </p>
                  </article>
                </div>
                <p v-else class="feedback-insight-empty">Session-level rating questions will appear here.</p>
                </div>
            </section>

            <section class="editorial-panel p-5">
              <p class="editorial-eyebrow">attendee access</p>
              <h2 class="mt-2 text-2xl font-black tracking-tight text-dc-ink">{{ attendeeAccessTitle }}</h2>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-dc-gray">{{ attendeeAccessCopy }}</p>
              <div class="feedback-link-actions mt-5">
                <span class="feedback-link-status" :class="isOpen ? 'border-dc-success bg-dc-success-soft text-dc-success' : 'border-dc-border bg-dc-paper-warm text-dc-gray'">
                  {{ isOpen ? 'Open' : 'Closed' }}
                </span>
                <button
                  type="button"
                  class="feedback-link-button feedback-link-button--preview motion-press"
                  :disabled="saving"
                  @click="openPreviewPublicForm"
                >
                  Preview form
                </button>
                <button
                  v-if="isOpen"
                  type="button"
                  class="feedback-link-button feedback-link-button--copy motion-press"
                  :disabled="saving || !isOpen || copyState !== 'idle'"
                  @click="copyPublicUrl"
                >
                  {{ copyLinkLabel }}
                </button>
                <button
                  v-if="isOpen"
                  type="button"
                  class="feedback-link-button feedback-link-button--qr motion-press"
                  :disabled="saving || !isOpen"
                  @click="openFeedbackDisplay"
                >
                  Show QR code
                </button>
                <button
                  v-if="isOpen"
                  type="button"
                  class="feedback-link-button feedback-link-button--close motion-press"
                  :disabled="saving"
                  @click="closeCampaignNow"
                >
                  {{ saving ? 'Closing...' : 'Close now' }}
                </button>
                <button
                  v-else
                  type="button"
                  class="feedback-link-button feedback-link-button--copy motion-press"
                  :disabled="saving"
                  @click="reopenCampaignForOneDay"
                >
                  {{ saving ? 'Reopening...' : 'Reopen for 24 hours' }}
                </button>
              </div>
            </section>

          </section>
        </template>

        <section v-else class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
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
                  <span class="editorial-label">Default access</span>
                  <label class="mt-2 flex min-h-[50px] items-center gap-3 rounded-md border-2 border-dc-border bg-dc-paper-warm px-4 py-3">
                    <input v-model="form.auto_open_on_event_completion" type="checkbox" class="size-5 shrink-0 accent-dc-pink" />
                    <span class="min-w-0 text-sm font-bold leading-5 text-dc-ink">{{ defaultAccessCopy }}</span>
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
              <button type="submit" class="editorial-action" :disabled="saving">{{ saving ? 'Publishing...' : 'Publish' }}</button>
            </div>
          </form>

          <aside class="space-y-6">
            <section class="editorial-panel p-5">
              <p class="editorial-eyebrow">organizer controls</p>
              <p class="text-sm leading-6 text-dc-gray">Preview the attendee form, copy its live link, or put its QR code on a shared screen. These controls stay inside the organizer console.</p>
              <div class="feedback-link-actions mt-4">
                <span class="feedback-link-status" :class="isOpen ? 'border-dc-success bg-dc-success-soft text-dc-success' : 'border-dc-border bg-dc-paper-warm text-dc-gray'">
                  {{ isOpen ? 'Open' : 'Not Open' }}
                </span>
                <button
                  type="button"
                  class="feedback-link-button feedback-link-button--preview motion-press"
                  :disabled="saving"
                  @click="openPreviewPublicForm"
                >
                  Preview form
                </button>
                <button
                  type="button"
                  class="feedback-link-button feedback-link-button--copy motion-press"
                  :disabled="saving || !isOpen || copyState !== 'idle'"
                  @click="copyPublicUrl"
                >
                  {{ copyLinkLabel }}
                </button>
                <button
                  type="button"
                  class="feedback-link-button feedback-link-button--qr motion-press"
                  :disabled="saving || !isOpen"
                  @click="openFeedbackDisplay"
                >
                  Show QR code
                </button>
                <button
                  type="button"
                  class="feedback-remove-action feedback-link-button feedback-link-button--remove motion-press"
                  :disabled="removing || saving"
                  @click="removeFeedbackForm"
                >
                  {{ removing ? 'Removing...' : 'Remove form' }}
                </button>
              </div>
            </section>

          </aside>
        </section>
      </template>
    </div>
  </div>
</template>
