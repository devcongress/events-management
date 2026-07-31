<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { systemDesignPresenterPath } from '@/src/system-design-presenter-route';
import type { Question, QuizSession } from '@/types';

type SessionWithQuestions = QuizSession & { questions: Question[]; participantCount: number };
type QuestionForm = {
  question_text: string;
  explanation: string;
  options: string[];
  correct_index: number;
  time_limit_seconds: number;
};

const props = defineProps<{
  eventId: string;
  sourceTitle: string;
  sourceUrl: string;
}>();

const router = useRouter();
const session = ref<SessionWithQuestions | null>(null);
const loading = ref(true);
const generating = ref(false);
const openingPresenter = ref(false);
const saving = ref(false);
const savingTimerQuestionId = ref<string | null>(null);
const showQuestionReview = ref(false);
const editingQuestionId = ref<string | null>(null);
const error = ref('');
const editForm = reactive<QuestionForm>({
  question_text: '',
  explanation: '',
  options: ['', '', '', ''],
  correct_index: 0,
  time_limit_seconds: 20,
});
const correctAnswerOptions = [
  { value: 0, label: 'A correct' },
  { value: 1, label: 'B correct' },
  { value: 2, label: 'C correct' },
  { value: 3, label: 'D correct' },
];
const timerOptions = [10, 15, 20, 30, 45, 60, 90].map((seconds) => ({
  value: seconds,
  label: `${seconds} seconds`,
}));

function timerOptionsFor(seconds: number) {
  if (timerOptions.some((option) => option.value === seconds)) return timerOptions;
  return [...timerOptions, { value: seconds, label: `${seconds} seconds` }]
    .sort((left, right) => left.value - right.value);
}

const questions = computed(() => session.value?.questions ?? []);
const hasCompleteQuestionSet = computed(() => questions.value.length === 5);
const generateLabel = computed(() => {
  const remaining = Math.max(0, 5 - questions.value.length);
  if (generating.value) return 'Generating...';
  if (questions.value.length === 0) return 'Generate 5 questions';
  return `Generate ${remaining} more question${remaining === 1 ? '' : 's'}`;
});

async function fetchSession() {
  error.value = '';
  const sessionsResponse = await fetch(`/api/quiz/sessions?eventId=${props.eventId}&purpose=system_design_learning`);
  if (!sessionsResponse.ok) {
    error.value = 'Unable to load the learning questions.';
    loading.value = false;
    return;
  }

  const sessions: QuizSession[] = await sessionsResponse.json();
  if (sessions.length === 0) {
    session.value = null;
    loading.value = false;
    return;
  }

  const response = await fetch(`/api/quiz/sessions/${sessions[0]!.id}`);
  if (response.ok) {
    session.value = await response.json();
  } else {
    error.value = 'Unable to load the learning questions.';
  }
  loading.value = false;
}

async function ensureSession(): Promise<SessionWithQuestions | null> {
  if (session.value) return session.value;
  const response = await fetch('/api/quiz/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: props.eventId, purpose: 'system_design_learning' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    error.value = payload.error ?? 'Unable to prepare learning questions for this scenario.';
    return null;
  }

  session.value = { ...payload, questions: [], participantCount: 0 };
  return session.value;
}

async function generateQuestions() {
  if (generating.value || questions.value.length >= 5) return;
  generating.value = true;
  error.value = '';
  const preparedSession = await ensureSession();
  if (!preparedSession) {
    generating.value = false;
    return;
  }

  const response = await fetch(`/api/events/${props.eventId}/system-design/learning-room/questions/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: preparedSession.id }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    error.value = payload.error ?? 'Could not generate questions from the linked System Design source.';
  } else {
    await fetchSession();
    showQuestionReview.value = true;
  }
  generating.value = false;
}

async function openPresenter() {
  if (!session.value || !hasCompleteQuestionSet.value || openingPresenter.value) return;
  const presenterWindow = window.open('about:blank', '_blank');
  if (!presenterWindow) {
    error.value = 'Allow pop-ups for this site so the presentation can open in a new tab.';
    return;
  }
  presenterWindow.opener = null;
  presenterWindow.document.title = 'Preparing presentation...';
  openingPresenter.value = true;
  error.value = '';
  const response = await fetch(`/api/quiz/sessions/${session.value.id}/presentation`, { method: 'POST' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    error.value = payload.error ?? 'Unable to open the presentation view.';
    presenterWindow.close();
    openingPresenter.value = false;
    return;
  }
  const presenterUrl = new URL(router.resolve(systemDesignPresenterPath(session.value.id)).href, window.location.origin);
  presenterWindow.location.replace(presenterUrl.href);
  openingPresenter.value = false;
}

function beginEditQuestion(question: Question) {
  editingQuestionId.value = question.id;
  editForm.question_text = question.question_text;
  editForm.explanation = question.explanation ?? '';
  editForm.options = [...question.options];
  editForm.correct_index = question.correct_index;
  editForm.time_limit_seconds = question.time_limit_seconds;
  error.value = '';
}

function cancelEditQuestion() {
  editingQuestionId.value = null;
}

async function saveEditedQuestion() {
  if (!editingQuestionId.value || saving.value) return;
  saving.value = true;
  error.value = '';
  const response = await fetch(`/api/quiz/questions/${editingQuestionId.value}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question_text: editForm.question_text,
      explanation: editForm.explanation,
      options: editForm.options,
      correct_index: Number(editForm.correct_index),
      time_limit_seconds: Number(editForm.time_limit_seconds),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    error.value = payload.error ?? 'Unable to update this question.';
  } else {
    cancelEditQuestion();
    await fetchSession();
  }
  saving.value = false;
}

async function updateQuestionTimer(questionId: string, value: string | number) {
  if (!session.value || savingTimerQuestionId.value) return;
  savingTimerQuestionId.value = questionId;
  error.value = '';
  const response = await fetch(`/api/quiz/questions/${questionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time_limit_seconds: Number(value) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    error.value = payload.error ?? 'Unable to update this question timer.';
  } else {
    session.value = {
      ...session.value,
      questions: session.value.questions.map((question) => question.id === questionId ? payload : question),
    };
  }
  savingTimerQuestionId.value = null;
}

async function deleteQuestion(questionId: string) {
  const response = await fetch(`/api/quiz/questions/${questionId}`, { method: 'DELETE' });
  if (response.ok) {
    await fetchSession();
  } else {
    const payload = await response.json().catch(() => ({}));
    error.value = payload.error ?? 'Unable to remove this question.';
  }
}

async function moveQuestion(questionId: string, direction: -1 | 1) {
  if (!session.value) return;
  const questionIds = questions.value.map((question) => question.id);
  const currentIndex = questionIds.indexOf(questionId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= questionIds.length) return;
  [questionIds[currentIndex], questionIds[nextIndex]] = [questionIds[nextIndex]!, questionIds[currentIndex]!];
  const response = await fetch('/api/quiz/questions/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: session.value.id, question_ids: questionIds }),
  });
  if (response.ok) await fetchSession();
}

onMounted(fetchSession);
</script>

<template>
  <article class="editorial-panel overflow-hidden">
    <div class="flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
      <div class="min-w-0">
        <p class="editorial-eyebrow">learning questions</p>
        <h2 class="mt-2 text-2xl font-bold tracking-tight text-dc-ink">Turn this scenario into a live room</h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
          Five questions are prepared from <a :href="sourceUrl" target="_blank" rel="noopener noreferrer" class="font-semibold text-dc-ink underline decoration-dc-yellow decoration-2 underline-offset-4">{{ sourceTitle }}</a>. Review the teaching sequence, then open a QR-first presenter view.
        </p>
      </div>

      <div v-if="!loading" class="flex shrink-0 flex-wrap gap-3">
        <button v-if="questions.length < 5" type="button" class="editorial-secondary-action" :disabled="generating" @click="generateQuestions">
          {{ generateLabel }}
        </button>
        <button v-if="questions.length > 0" type="button" class="editorial-secondary-action" @click="showQuestionReview = !showQuestionReview">
          {{ showQuestionReview ? 'Hide questions' : `Review ${questions.length} questions` }}
        </button>
        <button type="button" class="editorial-action" :disabled="!hasCompleteQuestionSet || openingPresenter" @click="openPresenter">
          {{ openingPresenter ? 'Opening...' : 'Open presentation view' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="border-t-2 border-dc-border px-6 py-5 sm:px-8">
      <div class="skeleton-line w-1/3" />
    </div>

    <p v-else-if="error" class="mx-6 mb-6 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-8">
      {{ error }}
    </p>

    <p v-else-if="questions.length !== 5" class="border-t-2 border-dc-border bg-dc-paper-warm px-6 py-4 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray sm:px-8">
      A complete set of five reviewed questions is required before presenting.
    </p>

    <div v-if="showQuestionReview" class="grid gap-4 border-t-2 border-dc-ink bg-dc-paper-warm p-5 sm:p-6">
      <article v-for="(question, index) in questions" :key="question.id" class="quiz-question-card p-5 sm:p-6">
        <form v-if="editingQuestionId === question.id" class="space-y-4" @submit.prevent="saveEditedQuestion">
          <div class="flex items-center justify-between gap-4">
            <div>
              <span class="font-mono text-sm font-semibold text-dc-pink">Q{{ index + 1 }}</span>
              <h3 class="font-mono text-lg font-semibold text-dc-ink">Edit question</h3>
            </div>
            <button type="button" class="font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray hover:text-dc-ink" @click="cancelEditQuestion">Cancel</button>
          </div>
          <input v-model="editForm.question_text" required placeholder="Question text" class="editorial-input" />
          <textarea v-model="editForm.explanation" required rows="3" placeholder="Reveal explanation" class="system-design-notes-textarea" />
          <div class="grid gap-3 sm:grid-cols-2">
            <label v-for="(_, optionIndex) in editForm.options" :key="optionIndex" class="quiz-option-input">
              <span>{{ ['A', 'B', 'C', 'D'][optionIndex] }}</span>
              <input v-model="editForm.options[optionIndex]" required :placeholder="`Option ${optionIndex + 1}`" />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-end">
            <AppDropdown :model-value="editForm.correct_index" label="Correct answer" :options="correctAnswerOptions" @update:model-value="editForm.correct_index = Number($event)" />
            <label>
              <span class="editorial-label">Answer time</span>
              <input v-model.number="editForm.time_limit_seconds" type="number" min="5" max="300" step="5" class="editorial-input mt-2" />
            </label>
          </div>
          <button type="submit" :disabled="saving" class="editorial-action w-full">{{ saving ? 'Saving...' : 'Save question' }}</button>
        </form>

        <template v-else>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <span class="inline-flex rounded-md border border-dc-pink bg-dc-pink px-2 py-1 font-mono text-xs font-semibold text-white">Q{{ index + 1 }}</span>
              <h3 class="mt-3 max-w-5xl text-base font-semibold leading-7 text-dc-ink sm:text-lg">{{ question.question_text }}</h3>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Reveal: {{ question.explanation }}</p>
              <div class="mt-4 w-36">
                <AppDropdown
                  :model-value="question.time_limit_seconds"
                  label="Answer timer"
                  :options="timerOptionsFor(question.time_limit_seconds)"
                  density="compact"
                  menu-align="left"
                  teleport
                  :disabled="savingTimerQuestionId !== null"
                  @update:model-value="updateQuestionTimer(question.id, $event)"
                />
                <p v-if="savingTimerQuestionId === question.id" class="mt-1 font-mono text-[11px] text-dc-gray">Saving...</p>
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-3">
              <button type="button" class="font-mono text-xs font-semibold uppercase text-dc-gray disabled:opacity-30" :disabled="index === 0" aria-label="Move question earlier" @click="moveQuestion(question.id, -1)">↑</button>
              <button type="button" class="font-mono text-xs font-semibold uppercase text-dc-gray disabled:opacity-30" :disabled="index === questions.length - 1" aria-label="Move question later" @click="moveQuestion(question.id, 1)">↓</button>
              <button type="button" class="font-mono text-xs font-semibold uppercase text-dc-ink underline decoration-dc-yellow decoration-2 underline-offset-4" @click="beginEditQuestion(question)">Edit</button>
              <button type="button" class="font-mono text-xs font-semibold uppercase text-red-600" @click="deleteQuestion(question.id)">Delete</button>
            </div>
          </div>
          <div class="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div v-for="(option, optionIndex) in question.options" :key="`${question.id}-${optionIndex}`" class="rounded-md border px-3.5 py-3 text-sm leading-6" :class="optionIndex === question.correct_index ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border bg-dc-paper text-dc-gray'">
              <span class="font-medium text-dc-ink">{{ ['A', 'B', 'C', 'D'][optionIndex] }}.</span> {{ option }}
            </div>
          </div>
        </template>
      </article>
    </div>
  </article>
</template>
