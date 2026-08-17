<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { notify } from '@/src/lib/notify';
import { systemDesignPresenterPath } from '@/src/system-design-presenter-route';
import type { Question, QuizSession } from '@/types';

type SessionWithQuestions = QuizSession & {
  questions: Question[];
  participantCount: number;
  system_design_archived?: boolean;
};
type QuestionForm = {
  question_text: string;
  explanation: string;
  options: string[];
  correct_index: number;
  time_limit_seconds: number;
  difficulty: 'foundational' | 'intermediate' | 'advanced';
  category: string;
};

const props = defineProps<{
  eventId: string;
  sourceTitle: string;
  sourceUrl: string;
  embedded?: boolean;
}>();

const router = useRouter();
const session = ref<SessionWithQuestions | null>(null);
const loading = ref(true);
const generating = ref(false);
const openingPresenter = ref(false);
const saving = ref(false);
const savingTimerQuestionId = ref<string | null>(null);
const movingQuestionId = ref<string | null>(null);
const deletingQuestionId = ref<string | null>(null);
const pendingDeleteQuestionId = ref<string | null>(null);
const addingQuestion = ref(false);
const showQuestionReview = ref(false);
const editingQuestionId = ref<string | null>(null);
const error = ref('');
const editForm = reactive<QuestionForm>({
  question_text: '',
  explanation: '',
  options: ['', '', '', ''],
  correct_index: 0,
  time_limit_seconds: 20,
  difficulty: 'intermediate',
  category: '',
});
const correctAnswerOptions = [
  { value: 0, label: 'A correct' },
  { value: 1, label: 'B correct' },
  { value: 2, label: 'C correct' },
  { value: 3, label: 'D correct' },
];
const difficultyOptions = [
  { value: 'foundational', label: 'Foundational' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
const timerOptions = [10, 15, 20, 30, 45, 60, 90].map((seconds) => ({
  value: seconds,
  label: `${seconds} seconds`,
}));

function showWorkspaceError(message: string) {
  if (/system design session is archived/i.test(message)) {
    if (session.value) session.value = { ...session.value, system_design_archived: true };
    error.value = '';
    notify.warning(message);
    return;
  }
  error.value = message;
}

function timerOptionsFor(seconds: number) {
  if (timerOptions.some((option) => option.value === seconds)) return timerOptions;
  return [...timerOptions, { value: seconds, label: `${seconds} seconds` }]
    .sort((left, right) => left.value - right.value);
}

const questions = computed(() => session.value?.questions ?? []);
const systemDesignArchived = computed(() => Boolean(session.value?.system_design_archived));
const canPresent = computed(() => questions.value.length > 0 && !systemDesignArchived.value);
const generatedCount = computed(() => session.value?.generated_question_count ?? questions.value.filter((question) => question.authoring_source === 'generated').length);
const generateLabel = computed(() => {
  const remaining = Math.max(0, 10 - generatedCount.value);
  if (generating.value) return 'Generating...';
  if (questions.value.length === 0) return `Generate up to ${remaining} questions`;
  return `Generate up to ${remaining} more`;
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
    showWorkspaceError(payload.error ?? 'Unable to prepare learning questions for this session.');
    return null;
  }

  session.value = { ...payload, questions: [], participantCount: 0 };
  return session.value;
}

async function generateQuestions() {
  if (generating.value || generatedCount.value >= 10 || systemDesignArchived.value) return;
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
    showWorkspaceError(payload.error ?? 'Could not generate questions from the linked System Design source.');
  } else {
    await fetchSession();
    showQuestionReview.value = true;
  }
  generating.value = false;
}

async function openPresenter() {
  if (!session.value || !canPresent.value || openingPresenter.value) return;
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
    showWorkspaceError(payload.error ?? 'Unable to open the presentation view.');
    presenterWindow.close();
    openingPresenter.value = false;
    return;
  }
  const presenterUrl = new URL(router.resolve(systemDesignPresenterPath(session.value.id)).href, window.location.origin);
  presenterWindow.location.replace(presenterUrl.href);
  openingPresenter.value = false;
}

function beginEditQuestion(question: Question) {
  if (systemDesignArchived.value) return;
  editingQuestionId.value = question.id;
  editForm.question_text = question.question_text;
  editForm.explanation = question.explanation ?? '';
  editForm.options = [...question.options];
  editForm.correct_index = question.correct_index;
  editForm.time_limit_seconds = question.time_limit_seconds;
  editForm.difficulty = question.difficulty ?? 'intermediate';
  editForm.category = question.category ?? '';
  error.value = '';
}

function cancelEditQuestion() {
  editingQuestionId.value = null;
}

async function saveEditedQuestion() {
  if (!editingQuestionId.value || saving.value || systemDesignArchived.value) return;
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
      difficulty: editForm.difficulty,
      category: editForm.category,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showWorkspaceError(payload.error ?? 'Unable to update this question.');
  } else {
    cancelEditQuestion();
    await fetchSession();
  }
  saving.value = false;
}

function beginAddQuestion() {
  if (systemDesignArchived.value) return;
  showQuestionReview.value = true;
  editingQuestionId.value = '__new__';
  editForm.question_text = '';
  editForm.explanation = '';
  editForm.options = ['', '', '', ''];
  editForm.correct_index = 0;
  editForm.time_limit_seconds = 20;
  editForm.difficulty = 'intermediate';
  editForm.category = '';
}

async function saveManualQuestion() {
  if (!session.value || saving.value || systemDesignArchived.value) return;
  saving.value = true;
  const response = await fetch('/api/quiz/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    quiz_session_id: session.value.id, question_text: editForm.question_text, explanation: editForm.explanation,
    options: editForm.options, correct_index: editForm.correct_index, time_limit_seconds: editForm.time_limit_seconds,
    order_index: questions.value.length, difficulty: editForm.difficulty, category: editForm.category,
  }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) showWorkspaceError(payload.error ?? 'Unable to add the question.');
  else { cancelEditQuestion(); await fetchSession(); }
  saving.value = false;
}

async function updateQuestionTimer(questionId: string, value: string | number) {
  if (!session.value || savingTimerQuestionId.value || systemDesignArchived.value) return;
  savingTimerQuestionId.value = questionId;
  error.value = '';
  const response = await fetch(`/api/quiz/questions/${questionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time_limit_seconds: Number(value) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    showWorkspaceError(payload.error ?? 'Unable to update this question timer.');
  } else {
    session.value = {
      ...session.value,
      questions: session.value.questions.map((question) => question.id === questionId ? payload : question),
    };
  }
  savingTimerQuestionId.value = null;
}

async function deleteQuestion(questionId: string) {
  if (!session.value || deletingQuestionId.value || movingQuestionId.value || systemDesignArchived.value) return;

  const previousQuestions = session.value.questions;
  deletingQuestionId.value = questionId;
  pendingDeleteQuestionId.value = null;
  session.value = {
    ...session.value,
    questions: previousQuestions.filter((question) => question.id !== questionId),
  };

  try {
    const response = await fetch(`/api/quiz/questions/${questionId}`, { method: 'DELETE' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      session.value = { ...session.value, questions: previousQuestions };
      showWorkspaceError(payload.error ?? 'Unable to remove this question.');
      return;
    }
    notify.success('Question removed.');
  } catch {
    session.value = { ...session.value, questions: previousQuestions };
    showWorkspaceError('Unable to remove this question.');
  } finally {
    deletingQuestionId.value = null;
  }
}

async function moveQuestion(questionId: string, direction: -1 | 1) {
  if (!session.value || movingQuestionId.value || deletingQuestionId.value || systemDesignArchived.value) return;
  const questionIds = questions.value.map((question) => question.id);
  const currentIndex = questionIds.indexOf(questionId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= questionIds.length) return;
  [questionIds[currentIndex], questionIds[nextIndex]] = [questionIds[nextIndex]!, questionIds[currentIndex]!];
  const previousQuestions = session.value.questions;
  const orderedQuestions = questionIds.map((id) => previousQuestions.find((question) => question.id === id)!);
  movingQuestionId.value = questionId;
  session.value = { ...session.value, questions: orderedQuestions };

  try {
    const response = await fetch('/api/quiz/questions/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: session.value.id, question_ids: questionIds }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      session.value = { ...session.value, questions: previousQuestions };
      showWorkspaceError(payload.error ?? 'Unable to reorder this question.');
      return;
    }
    notify.success(`Moved question to position ${nextIndex + 1}.`);
  } catch {
    session.value = { ...session.value, questions: previousQuestions };
    showWorkspaceError('Unable to reorder this question.');
  } finally {
    movingQuestionId.value = null;
  }
}

onMounted(fetchSession);
</script>

<template>
  <component
    :is="embedded ? 'section' : 'article'"
    :class="embedded ? 'border-t-2 border-dc-ink' : 'editorial-panel overflow-hidden'"
    aria-label="Learning questions"
  >
    <div class="p-6 sm:p-8">
      <div class="min-w-0">
        <p class="editorial-eyebrow">learning questions</p>
        <h2 class="mt-2 text-2xl font-bold tracking-tight text-dc-ink">Prepare the live room</h2>
        <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
          Build a teaching sequence from <a :href="sourceUrl" target="_blank" rel="noopener noreferrer" class="font-semibold text-dc-ink underline decoration-dc-yellow decoration-2 underline-offset-4">the linked docs</a>. Generated questions are lifetime-capped at ten; add as many carefully authored questions as you need.
        </p>
      </div>

      <div v-if="!loading" class="mt-5 flex flex-wrap gap-3">
        <button v-if="!systemDesignArchived && generatedCount < 10" type="button" class="editorial-secondary-action" :disabled="generating" @click="generateQuestions">
          {{ generateLabel }}
        </button>
        <button v-if="!systemDesignArchived" type="button" class="editorial-secondary-action" :disabled="addingQuestion" @click="beginAddQuestion">Add question</button>
        <button v-if="questions.length > 0" type="button" class="editorial-secondary-action" @click="showQuestionReview = !showQuestionReview">
          {{ showQuestionReview ? 'Hide questions' : `Review ${questions.length} questions` }}
        </button>
        <button type="button" class="editorial-action" :disabled="!canPresent || openingPresenter" @click="openPresenter">
          {{ openingPresenter ? 'Opening...' : 'Open presentation view' }}
        </button>
        <button type="button" class="editorial-secondary-action" disabled :title="systemDesignArchived ? 'The event day has ended.' : 'This happens automatically at the end of the event day.'">
          {{ systemDesignArchived ? 'Archived after event day' : 'Locks after event day' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="border-t-2 border-dc-border px-6 py-5 sm:px-8">
      <div class="skeleton-line w-1/3" />
    </div>

    <p v-else-if="error" class="mx-6 mb-6 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-8">
      {{ error }}
    </p>

    <p v-else-if="systemDesignArchived" class="border-t-2 border-dc-border bg-dc-paper-warm px-6 py-4 font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray sm:px-8">
      Archived after the event day · {{ questions.length }} question{{ questions.length === 1 ? '' : 's' }} preserved in the public recap.
    </p>

    <div v-if="showQuestionReview" class="grid gap-4 border-t-2 border-dc-ink bg-dc-paper-warm p-5 sm:p-6">
      <form v-if="editingQuestionId === '__new__'" class="quiz-question-card space-y-4 p-5 sm:p-6" @submit.prevent="saveManualQuestion">
        <div class="flex items-center justify-between gap-4"><div><span class="font-mono text-sm font-semibold text-dc-pink">MANUAL</span><h3 class="font-mono text-lg font-semibold text-dc-ink">Add a teaching question</h3></div><button type="button" class="font-mono text-xs font-semibold uppercase tracking-wide text-dc-gray hover:text-dc-ink" @click="cancelEditQuestion">Cancel</button></div>
        <input v-model="editForm.question_text" required placeholder="Question text" class="editorial-input" />
        <textarea v-model="editForm.explanation" required rows="3" placeholder="Ideal answer and teaching rubric" class="system-design-notes-textarea" />
        <div class="grid gap-3 sm:grid-cols-2"><label v-for="(_, optionIndex) in editForm.options" :key="optionIndex" class="quiz-option-input"><span>{{ ['A', 'B', 'C', 'D'][optionIndex] }}</span><input v-model="editForm.options[optionIndex]" required :placeholder="`Option ${optionIndex + 1}`" /></label></div>
        <div class="grid gap-3 sm:grid-cols-3 sm:items-start">
          <AppDropdown class="w-full" :model-value="editForm.correct_index" label="Correct answer" :options="correctAnswerOptions" teleport @update:model-value="editForm.correct_index = Number($event)" />
          <AppDropdown class="w-full" :model-value="editForm.difficulty" label="Difficulty" :options="difficultyOptions" teleport @update:model-value="editForm.difficulty = String($event) as QuestionForm['difficulty']" />
          <label class="block"><span class="editorial-label">Category</span><input v-model="editForm.category" class="editorial-input min-h-[50px]" placeholder="e.g. Consistency" /></label>
        </div>
        <button type="submit" :disabled="saving" class="editorial-action w-full">{{ saving ? 'Saving...' : 'Add question' }}</button>
      </form>
      <TransitionGroup name="system-design-question-list" tag="div" class="grid gap-4">
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
          <div class="grid gap-3 sm:grid-cols-4 sm:items-start">
            <AppDropdown class="w-full" :model-value="editForm.correct_index" label="Correct answer" :options="correctAnswerOptions" teleport @update:model-value="editForm.correct_index = Number($event)" />
            <AppDropdown class="w-full" :model-value="editForm.difficulty" label="Difficulty" :options="difficultyOptions" teleport @update:model-value="editForm.difficulty = String($event) as QuestionForm['difficulty']" />
            <label><span class="editorial-label">Category</span><input v-model="editForm.category" class="editorial-input min-h-[50px]" placeholder="e.g. Consistency" /></label>
            <label>
              <span class="editorial-label">Answer time</span>
              <input v-model.number="editForm.time_limit_seconds" type="number" min="5" max="300" step="5" class="editorial-input min-h-[50px]" />
            </label>
          </div>
          <button type="submit" :disabled="saving" class="editorial-action w-full">{{ saving ? 'Saving...' : 'Save question' }}</button>
        </form>

        <template v-else>
          <div class="flex flex-col gap-4">
            <div class="min-w-0">
              <span class="inline-flex rounded-md border border-dc-pink bg-dc-pink px-2 py-1 font-mono text-xs font-semibold text-white">Q{{ index + 1 }}</span>
              <h3 class="mt-3 max-w-5xl text-base font-semibold leading-7 text-dc-ink sm:text-lg">{{ question.question_text }}</h3>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Reveal: {{ question.explanation }}</p>
              <div v-if="!systemDesignArchived" class="mt-4 w-36">
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
            <div v-if="!systemDesignArchived" class="question-card-controls" aria-label="Question controls">
              <div class="question-move-controls">
                <span class="question-control-label">Sequence</span>
                <button type="button" class="question-move-action motion-press" :disabled="index === 0 || movingQuestionId !== null || deletingQuestionId !== null" @click="moveQuestion(question.id, -1)">
                  <span aria-hidden="true">↑</span><span>Move up</span>
                </button>
                <button type="button" class="question-move-action motion-press" :disabled="index === questions.length - 1 || movingQuestionId !== null || deletingQuestionId !== null" @click="moveQuestion(question.id, 1)">
                  <span aria-hidden="true">↓</span><span>Move down</span>
                </button>
              </div>
              <div class="question-edit-controls">
                <button type="button" class="question-edit-action motion-press" :disabled="movingQuestionId !== null || deletingQuestionId !== null" @click="beginEditQuestion(question)">Edit question</button>
                <template v-if="pendingDeleteQuestionId === question.id">
                  <button type="button" class="question-delete-action motion-press" :disabled="deletingQuestionId !== null" @click="deleteQuestion(question.id)">{{ deletingQuestionId === question.id ? 'Removing...' : 'Remove now' }}</button>
                  <button type="button" class="question-cancel-action motion-press" :disabled="deletingQuestionId !== null" @click="pendingDeleteQuestionId = null">Keep</button>
                </template>
                <button v-else type="button" class="question-delete-action motion-press" :disabled="movingQuestionId !== null || deletingQuestionId !== null" @click="pendingDeleteQuestionId = question.id">Delete question</button>
              </div>
            </div>
            <span v-else class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">Locked</span>
          </div>
          <div class="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div v-for="(option, optionIndex) in question.options" :key="`${question.id}-${optionIndex}`" class="rounded-md border px-3.5 py-3 text-sm leading-6" :class="optionIndex === question.correct_index ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border bg-dc-paper text-dc-gray'">
              <span class="font-medium text-dc-ink">{{ ['A', 'B', 'C', 'D'][optionIndex] }}.</span> {{ option }}
            </div>
          </div>
          <p class="mt-3 font-mono text-[11px] uppercase tracking-wide text-dc-gray">{{ question.authoring_source === 'generated' ? 'Generated' : 'Manual' }} · {{ question.difficulty ?? 'intermediate' }}<span v-if="question.category"> · {{ question.category }}</span></p>
        </template>
      </article>
      </TransitionGroup>
    </div>
  </component>
</template>
