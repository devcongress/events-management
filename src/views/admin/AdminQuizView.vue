<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import QRCode from 'qrcode';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppNumberStepper from '@/src/components/AppNumberStepper.vue';
import AdminQuizPageSkeleton from '@/src/components/ui/page-skeletons/AdminQuizPageSkeleton.vue';
import type { GeneratedQuizFromPaperSummary, Question, QuizSession } from '@/types';
import { adminPath } from '@/src/admin-routes';

type SessionWithQuestions = QuizSession & { questions: Question[]; participantCount: number };
type QuestionForm = {
  question_text: string;
  options: string[];
  correct_index: number;
  time_limit_seconds: number;
  points: number;
};

const route = useRoute();
const session = ref<SessionWithQuestions | null>(null);
const loading = ref(true);
const saving = ref(false);
const liveState = ref<any>(null);
const qrCodeUrl = ref<string | null>(null);
const form = reactive<QuestionForm>({
  question_text: '',
  options: ['', '', '', ''],
  correct_index: 0,
  time_limit_seconds: 20,
  points: 1000,
});
const editForm = reactive<QuestionForm>({
  question_text: '',
  options: ['', '', '', ''],
  correct_index: 0,
  time_limit_seconds: 20,
  points: 1000,
});
const editingQuestionId = ref<string | null>(null);
const builderError = ref('');
const paperFile = ref<File | null>(null);
const paperFileInput = ref<HTMLInputElement | null>(null);
const paperQuestionCount = ref(5);
const generatingPaperQuiz = ref(false);
const paperError = ref('');
const paperSuccess = ref('');
const paperSummary = ref<GeneratedQuizFromPaperSummary | null>(null);
const PAPER_FILE_MAX_BYTES = 5 * 1024 * 1024;
const correctAnswerOptions = [
  { value: 0, label: 'A correct' },
  { value: 1, label: 'B correct' },
  { value: 2, label: 'C correct' },
  { value: 3, label: 'D correct' },
];

function eventQuizRoute(section = 'quiz') {
  const eventId = Array.isArray(route.params.eventId) ? route.params.eventId[0] : route.params.eventId;
  const from = route.query.from;
  const path = adminPath(`events/${eventId}/${section}`);

  if (from === 'attendance' || from === 'feedback') {
    return { path, query: { from } };
  }

  return path;
}

const liveMode = computed(() => route.path.endsWith('/live'));
const quizPaused = true;
const playUrl = computed(() => {
  if (!session.value) return '';
  return `${window.location.origin}/play/${session.value.join_code}`;
});
let pollTimer: number | undefined;

async function fetchSession() {
  const sessionsResponse = await fetch(`/api/quiz/sessions?eventId=${route.params.eventId}`);
  if (!sessionsResponse.ok) {
    loading.value = false;
    return;
  }
  const sessions: QuizSession[] = await sessionsResponse.json();
  if (sessions.length === 0) {
    session.value = null;
    loading.value = false;
    return;
  }
  const response = await fetch(`/api/quiz/sessions/${sessions[0].id}`);
  if (response.ok) {
    session.value = await response.json();
    await refreshQrCode();
    await fetchLiveState();
  }
  loading.value = false;
}

async function refreshQrCode() {
  if (!session.value) {
    qrCodeUrl.value = null;
    return;
  }
  qrCodeUrl.value = await QRCode.toDataURL(playUrl.value, {
    margin: 1,
    width: 280,
    color: {
      dark: '#0b0b0d',
      light: '#f9e15e',
    },
  });
}

async function fetchLiveState() {
  if (!session.value) return;
  await fetch('/api/quiz/state/advance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: session.value.id }),
  });
  const response = await fetch(`/api/quiz/state?sessionId=${session.value.id}`);
  if (response.ok) liveState.value = await response.json();
}

async function createSession() {
  const response = await fetch('/api/quiz/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: route.params.eventId }),
  });
  if (response.ok) await fetchSession();
}

async function addQuestion() {
  if (!session.value) return;
  saving.value = true;
  builderError.value = '';
  const response = await fetch('/api/quiz/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quiz_session_id: session.value.id,
      question_text: form.question_text,
      options: form.options,
      correct_index: Number(form.correct_index),
      order_index: nextQuestionOrderIndex(),
      time_limit_seconds: Number(form.time_limit_seconds),
      points: Number(form.points),
    }),
  });
  if (response.ok) {
    form.question_text = '';
    form.options = ['', '', '', ''];
    form.correct_index = 0;
    await fetchSession();
  } else {
    const payload = await response.json().catch(() => ({}));
    builderError.value = payload.error ?? 'Failed to add question';
  }
  saving.value = false;
}

async function deleteExistingQuestion(questionId: string) {
  const response = await fetch(`/api/quiz/questions/${questionId}`, { method: 'DELETE' });
  if (response.ok) await fetchSession();
}

function nextQuestionOrderIndex() {
  if (!session.value || session.value.questions.length === 0) return 0;
  return Math.max(...session.value.questions.map((question) => question.order_index)) + 1;
}

function handlePaperFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  paperError.value = '';
  paperSuccess.value = '';
  paperSummary.value = null;

  if (!file) {
    paperFile.value = null;
    return;
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    paperFile.value = null;
    paperError.value = 'Upload a PDF file.';
    return;
  }

  if (file.size > PAPER_FILE_MAX_BYTES) {
    paperFile.value = null;
    paperError.value = 'PDF must be 5MB or smaller.';
    return;
  }

  paperFile.value = file;
}

async function generatePaperQuiz() {
  if (!session.value || !paperFile.value) return;

  generatingPaperQuiz.value = true;
  paperError.value = '';
  paperSuccess.value = '';
  paperSummary.value = null;

  const formData = new FormData();
  formData.append('file', paperFile.value);
  formData.append('question_count', String(paperQuestionCount.value));

  const response = await fetch(`/api/quiz/sessions/${session.value.id}/questions/from-paper`, {
    method: 'POST',
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));

  if (response.ok) {
    paperSummary.value = payload.summary;
    paperSuccess.value = `Generated ${payload.summary?.created_question_count ?? 0} prototype questions. Review and edit them before opening the lobby.`;
    paperFile.value = null;
    if (paperFileInput.value) {
      paperFileInput.value.value = '';
    }
    await fetchSession();
  } else {
    paperError.value = payload.error ?? 'Failed to generate questions from this PDF.';
  }

  generatingPaperQuiz.value = false;
}

function beginEditQuestion(question: Question) {
  editingQuestionId.value = question.id;
  editForm.question_text = question.question_text;
  editForm.options = [...question.options];
  editForm.correct_index = question.correct_index;
  editForm.time_limit_seconds = question.time_limit_seconds;
  editForm.points = question.points;
  builderError.value = '';
}

function cancelEditQuestion() {
  editingQuestionId.value = null;
  editForm.question_text = '';
  editForm.options = ['', '', '', ''];
  editForm.correct_index = 0;
  editForm.time_limit_seconds = 20;
  editForm.points = 1000;
}

async function saveEditedQuestion() {
  if (!editingQuestionId.value) return;

  saving.value = true;
  builderError.value = '';

  const response = await fetch(`/api/quiz/questions/${editingQuestionId.value}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question_text: editForm.question_text,
      options: editForm.options,
      correct_index: Number(editForm.correct_index),
      time_limit_seconds: Number(editForm.time_limit_seconds),
      points: Number(editForm.points),
    }),
  });

  if (response.ok) {
    cancelEditQuestion();
    await fetchSession();
  } else {
    const payload = await response.json().catch(() => ({}));
    builderError.value = payload.error ?? 'Failed to update question';
  }

  saving.value = false;
}

async function patchSession(updates: Record<string, unknown>) {
  if (!session.value) return;
  await fetch(`/api/quiz/sessions/${session.value.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  await fetchSession();
}

async function openLobby() {
  await patchSession({ status: 'waiting' });
}

async function startQuiz() {
  await patchSession({
    status: 'active',
    current_question_index: 0,
    question_phase: 'answering',
    started_at: new Date().toISOString(),
    question_started_at: new Date().toISOString(),
    phase_started_at: new Date().toISOString(),
  });
}

async function showScoreboard() {
  await patchSession({ question_phase: 'scoreboard', phase_started_at: new Date().toISOString() });
}

async function nextQuestion() {
  if (!session.value) return;
  const nextIndex = session.value.current_question_index + 1;
  if (nextIndex >= session.value.questions.length) {
    await patchSession({ status: 'finished', question_phase: null, finished_at: new Date().toISOString() });
    return;
  }
  await patchSession({
    current_question_index: nextIndex,
    question_phase: 'answering',
    question_started_at: new Date().toISOString(),
    phase_started_at: new Date().toISOString(),
  });
}

onMounted(async () => {
  await fetchSession();
  if (liveMode.value && !quizPaused) {
    pollTimer = window.setInterval(fetchSession, 1500);
  }
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AdminQuizPageSkeleton v-if="loading" />

      <div v-else-if="!session" class="editorial-panel relative overflow-hidden p-12 text-center">
        <div class="absolute right-0 top-0 size-16 border-b-2 border-l-2 border-dc-yellow/20" />
        <p class="mb-8 font-mono text-dc-gray">No quiz has been created for this event yet.</p>
        <button class="editorial-secondary-action" @click="createSession">Create Quiz</button>
      </div>

      <template v-else-if="liveMode">
        <section class="coming-soon-banner">
          <div>
            <p class="editorial-eyebrow">coming soon</p>
            <h1 class="text-4xl font-black tracking-tight text-dc-ink sm:text-6xl">Live quiz room is paused.</h1>
            <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">
              The lobby and host controls are being held back until the realtime plan is worth funding. For now, keep using Events, Talks, Speakers, Attendance, and Feedback.
            </p>
            <div class="mt-6 flex flex-wrap gap-3">
              <RouterLink :to="eventQuizRoute()" class="editorial-secondary-action">Back to Quiz Notes</RouterLink>
              <RouterLink :to="eventQuizRoute('attendance')" class="editorial-action">Attendance</RouterLink>
            </div>
          </div>
        </section>
        <div class="hidden">
        <div v-if="session.status === 'waiting' || session.status === 'draft'" class="quiz-stage-shell flex min-h-[70vh] items-center justify-center p-6 sm:p-8">
          <div class="relative z-10 w-full max-w-5xl text-center">
            <p class="mb-4 font-mono text-xs font-bold uppercase tracking-[0.28em] text-dc-yellow">Host lobby</p>
            <h1 class="mb-8 text-5xl font-black uppercase tracking-tight text-white sm:text-7xl">Join the quiz</h1>
            <div class="mb-8 inline-block rounded-xl border-2 border-dc-yellow bg-dc-yellow px-8 py-7 shadow-[6px_6px_0_rgba(232,17,127,0.85)] sm:px-12">
              <p class="mb-2 font-mono text-sm font-bold uppercase tracking-[0.22em] text-dc-ink/70">Join code</p>
              <p class="font-mono text-6xl font-black tracking-[0.16em] text-dc-ink sm:text-8xl">{{ session.join_code }}</p>
            </div>
            <div v-if="qrCodeUrl" class="mx-auto mb-10 grid max-w-3xl gap-6 rounded-xl border border-white/15 bg-white/[0.06] p-5 md:grid-cols-[220px_1fr] md:items-center md:text-left">
              <img :src="qrCodeUrl" alt="Quiz join QR code" class="mx-auto size-[220px] rounded-lg border-2 border-dc-yellow bg-dc-yellow p-3" />
              <div>
                <p class="font-mono text-sm font-bold uppercase tracking-[0.2em] text-dc-yellow">Scan to join</p>
                <p class="mt-3 break-all text-lg leading-7 text-white/72">{{ playUrl }}</p>
              </div>
            </div>
            <div class="mb-10 text-3xl text-white sm:text-4xl">
              <span class="font-black text-dc-yellow">{{ liveState?.participants_count ?? session.participantCount }}</span>
              <span class="uppercase text-white/60"> players joined</span>
            </div>
            <button class="motion-press rounded-lg border-2 border-dc-yellow bg-dc-pink px-12 py-5 font-mono text-2xl font-bold uppercase tracking-wide text-white shadow-[4px_4px_0_#f5e642] disabled:cursor-not-allowed disabled:opacity-40 sm:px-16 sm:text-3xl" :disabled="(liveState?.participants_count ?? session.participantCount) === 0" @click="startQuiz">START QUIZ</button>
          </div>
        </div>

        <div v-else-if="session.status === 'finished'" class="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section class="quiz-stage-shell min-h-[420px] p-8 sm:p-10">
            <div class="relative z-10 max-w-3xl">
              <p class="mb-4 font-mono text-xs font-bold uppercase tracking-[0.28em] text-dc-yellow">Session complete</p>
              <h1 class="text-5xl font-black tracking-tight text-white sm:text-6xl">Quiz wrapped.</h1>
              <p class="mt-4 max-w-xl text-lg leading-8 text-[#E5E5E5]">The room is finished. Review the leaderboard, then create or edit questions from the builder before opening another lobby.</p>
              <div class="mt-8 flex flex-wrap gap-3">
                <RouterLink :to="eventQuizRoute()" class="editorial-secondary-action">Back to Builder</RouterLink>
              </div>
            </div>
          </section>

          <aside class="ops-panel p-5">
            <h2 class="mb-4 font-mono text-xl font-bold text-dc-pink">FINAL BOARD</h2>
            <div class="space-y-3">
              <div v-for="entry in liveState?.leaderboard ?? []" :key="entry.user_id" class="flex justify-between border-b border-dc-border pb-3 font-mono text-sm">
                <span class="text-dc-ink">#{{ entry.rank }} {{ entry.nickname }}</span>
                <span class="font-bold text-dc-ink">{{ entry.total_score }}</span>
              </div>
            </div>
          </aside>
        </div>

        <div v-else class="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section class="quiz-live-card">
            <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div class="inline-flex rounded-md border border-white/20 bg-white/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.18em] text-dc-yellow">{{ session.status }}</div>
              <div class="font-mono text-xs font-bold uppercase tracking-[0.18em] text-white/55">Code {{ session.join_code }}</div>
            </div>
            <h1 class="mb-4 font-mono text-4xl font-bold text-white">
              Question {{ session.current_question_index + 1 }}
            </h1>
            <p class="mb-6 max-w-4xl text-2xl font-black leading-tight text-white">{{ session.questions[session.current_question_index]?.question_text ?? 'No active question' }}</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <div v-for="(option, index) in session.questions[session.current_question_index]?.options ?? []" :key="option" class="rounded-lg border border-white/12 bg-white/[0.06] p-4 font-mono text-white">
                <span class="mr-2 text-dc-yellow">{{ ['A', 'B', 'C', 'D'][index] }}.</span>{{ option }}
              </div>
            </div>
            <div class="mt-8 flex flex-wrap gap-3">
              <button class="editorial-secondary-action" @click="showScoreboard">SHOW SCOREBOARD</button>
              <button class="editorial-secondary-action" @click="nextQuestion">NEXT QUESTION</button>
              <button class="motion-press rounded-md border-2 border-red-500 bg-red-50 px-6 py-3 font-mono font-bold uppercase text-red-700" @click="patchSession({ status: 'finished', question_phase: null, finished_at: new Date().toISOString() })">END QUIZ</button>
            </div>
          </section>

          <aside class="ops-panel p-5">
            <h2 class="mb-4 font-mono text-xl font-bold text-dc-pink">LEADERBOARD</h2>
            <div class="space-y-3">
              <div v-for="entry in liveState?.leaderboard ?? []" :key="entry.user_id" class="flex justify-between border-b border-dc-border pb-3 font-mono text-sm">
                <span class="text-dc-ink">#{{ entry.rank }} {{ entry.nickname }}</span>
                <span class="font-bold text-dc-ink">{{ entry.total_score }}</span>
              </div>
            </div>
          </aside>
        </div>
        </div>
      </template>

      <template v-else>
        <section class="coming-soon-banner mb-8">
          <div>
            <p class="editorial-eyebrow">coming soon</p>
            <h2 class="text-2xl font-black tracking-tight text-dc-ink">Quiz is paused for the low-cost launch.</h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-dc-gray">
              We are preserving the builder path, but live quiz rooms, leaderboard scoring, and PDF generation should wait until DevCon is ready to fund or harden realtime infrastructure.
            </p>
          </div>
        </section>

        <div class="editorial-header flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p class="editorial-eyebrow">live game</p>
            <h1 class="editorial-title">Quiz Builder</h1>
            <p class="editorial-subtitle">Coming soon. Keep event operations moving now; bring this back when the quiz has a funded/realtime plan.</p>
          </div>
          <div class="flex flex-wrap gap-3">
            <div class="rounded-lg border-2 border-dc-border bg-dc-paper-warm px-4 py-3 opacity-70">
              <p class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-dc-ink/65">Join code</p>
              <p class="font-mono text-2xl font-black tracking-[0.12em] text-dc-ink">{{ session.join_code }}</p>
            </div>
            <button v-if="session.questions.length > 0 && session.status === 'draft'" class="editorial-secondary-action disabled:cursor-not-allowed disabled:opacity-50" disabled @click="openLobby">OPEN LOBBY</button>
            <RouterLink v-if="session.status === 'waiting'" :to="eventQuizRoute('quiz/live')" class="editorial-secondary-action opacity-50">LOBBY PAUSED</RouterLink>
          </div>
        </div>

        <section class="quiz-builder-panel coming-soon-muted mb-6">
          <div class="mb-5 flex flex-col gap-2 border-b border-dc-border bg-dc-paper-warm px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="editorial-eyebrow">prototype generator</p>
              <h2 class="text-2xl font-black tracking-tight text-dc-ink">Create Questions From Paper</h2>
              <p class="mt-2 max-w-3xl text-sm text-dc-gray">Paused for now. When this returns, uploads stay small and draft-only so we avoid storage and processing pressure.</p>
            </div>
            <span class="inline-flex rounded-full border border-dc-border bg-dc-paper px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-dc-pink">PDF only / 5MB max</span>
          </div>

          <div class="grid gap-4 px-5 pb-5 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-end">
            <label class="block">
              <span class="mb-2 block font-mono text-xs uppercase tracking-wide text-dc-gray">Paper PDF</span>
              <input ref="paperFileInput" type="file" accept="application/pdf,.pdf" class="quiz-file-input block w-full rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-3 text-sm text-dc-ink file:mr-4 file:rounded-sm file:border-0 file:bg-dc-yellow file:px-4 file:py-2 file:font-mono file:font-bold file:uppercase file:text-dc-ink" @change="handlePaperFileChange" />
            </label>
            <AppNumberStepper
              v-model="paperQuestionCount"
              label="Questions"
              :min="1"
              :max="8"
            />
            <button type="button" disabled class="editorial-secondary-action disabled:cursor-not-allowed disabled:opacity-40" @click="generatePaperQuiz">
              {{ generatingPaperQuiz ? 'GENERATING...' : 'GENERATE DRAFTS' }}
            </button>
          </div>

          <p v-if="paperFile" class="mx-5 mb-5 rounded-md border border-dc-border bg-dc-paper-warm px-3 py-2 font-mono text-xs text-dc-gray">Selected: {{ paperFile.name }}</p>
          <p v-if="paperError" class="mx-5 mb-5 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ paperError }}</p>
          <div v-if="paperSuccess" class="mx-5 mb-5 rounded-md border border-dc-success bg-dc-success-soft px-4 py-3 text-sm font-semibold text-dc-success">
            <p>{{ paperSuccess }}</p>
            <p v-if="paperSummary" class="mt-2 font-mono text-xs text-dc-gray">{{ paperSummary.generation_note }} Extracted {{ paperSummary.extracted_character_count.toLocaleString() }} characters from {{ paperSummary.source_file_name }}.</p>
            <p v-for="warning in paperSummary?.warnings ?? []" :key="warning" class="mt-2 text-xs text-dc-pink">{{ warning }}</p>
          </div>
        </section>

        <p v-if="builderError" class="mb-4 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{{ builderError }}</p>

        <form class="quiz-builder-panel coming-soon-muted mb-6 space-y-4 p-5" @submit.prevent="addQuestion">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="editorial-eyebrow">manual question</p>
              <h2 class="text-2xl font-black tracking-tight text-dc-ink">Add New Question</h2>
            </div>
            <span class="rounded-full border border-dc-border bg-dc-paper-warm px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">A-D answers</span>
          </div>
          <input v-model="form.question_text" required placeholder="Question text" class="editorial-input" />
          <div class="grid gap-3 sm:grid-cols-2">
            <label v-for="(_, index) in form.options" :key="index" class="quiz-option-input">
              <span>{{ ['A', 'B', 'C', 'D'][index] }}</span>
              <input v-model="form.options[index]" required :placeholder="`Option ${index + 1}`" />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <AppDropdown
              :model-value="form.correct_index"
              label="Correct"
              :options="correctAnswerOptions"
              @update:model-value="form.correct_index = Number($event)"
            />
            <AppNumberStepper
              v-model="form.time_limit_seconds"
              :min="5"
              :step="5"
              suffix="sec"
            />
            <AppNumberStepper
              v-model="form.points"
              :min="100"
              :step="100"
              suffix="pts"
            />
          </div>
          <button type="submit" disabled class="editorial-action w-full disabled:cursor-not-allowed disabled:opacity-50">{{ saving ? 'ADDING...' : '+ Add Question' }}</button>
        </form>

        <div class="coming-soon-muted space-y-4">
          <article v-for="(question, index) in session.questions" :key="question.id" class="quiz-question-card p-5 sm:p-6">
            <form v-if="editingQuestionId === question.id" class="space-y-4" @submit.prevent="saveEditedQuestion">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <span class="font-mono text-sm font-bold text-dc-pink">Q{{ index + 1 }}</span>
                  <h3 class="font-mono text-lg font-bold text-dc-ink">Edit Question</h3>
                </div>
                <button type="button" class="font-mono text-sm font-bold text-dc-gray hover:text-dc-ink" @click="cancelEditQuestion">CANCEL</button>
              </div>
              <input v-model="editForm.question_text" required placeholder="Question text" class="editorial-input" />
              <div class="grid gap-3 sm:grid-cols-2">
                <input v-for="(_, optionIndex) in editForm.options" :key="optionIndex" v-model="editForm.options[optionIndex]" required :placeholder="`Option ${optionIndex + 1}`" class="editorial-input" />
              </div>
              <div class="grid gap-3 sm:grid-cols-3">
                <AppDropdown
                  :model-value="editForm.correct_index"
                  label="Correct"
                  :options="correctAnswerOptions"
                  @update:model-value="editForm.correct_index = Number($event)"
                />
                <AppNumberStepper
                  v-model="editForm.time_limit_seconds"
                  :min="5"
                  :step="5"
                  suffix="sec"
                />
                <AppNumberStepper
                  v-model="editForm.points"
                  :min="100"
                  :step="100"
                  suffix="pts"
                />
              </div>
              <button type="submit" :disabled="saving" class="editorial-action w-full">{{ saving ? 'SAVING...' : 'Save Changes' }}</button>
            </form>

            <div v-else class="mb-4 flex items-start justify-between gap-4">
              <div class="min-w-0">
                <span class="inline-flex rounded-md border border-dc-pink bg-dc-pink px-2 py-1 font-mono text-xs font-semibold text-white">Q{{ index + 1 }}</span>
                <h3 class="mt-3 max-w-5xl text-base font-semibold leading-7 text-dc-ink sm:text-lg">
                  {{ question.question_text }}
                </h3>
                <p class="mt-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ question.time_limit_seconds }} sec / {{ question.points }} pts</p>
              </div>
              <div class="flex shrink-0 gap-3 pt-1">
                <button class="font-mono text-xs font-semibold uppercase tracking-wide text-dc-ink underline decoration-dc-yellow decoration-2 underline-offset-4 hover:text-dc-pink" @click="beginEditQuestion(question)">Edit</button>
                <button class="font-mono text-xs font-semibold uppercase tracking-wide text-red-600 hover:text-red-700" @click="deleteExistingQuestion(question.id)">Delete</button>
              </div>
            </div>
            <div v-if="editingQuestionId !== question.id" class="grid gap-2.5 sm:grid-cols-2">
              <div
                v-for="(option, optionIndex) in question.options"
                :key="option"
                class="rounded-md border px-3.5 py-3 text-sm leading-6"
                :class="optionIndex === question.correct_index ? 'border-dc-ink bg-dc-yellow text-dc-ink' : 'border-dc-border bg-dc-paper-warm text-dc-gray'"
              >
                <span class="font-medium text-dc-ink">{{ ['A', 'B', 'C', 'D'][optionIndex] }}.</span>
                {{ option }}
              </div>
            </div>
          </article>
        </div>
      </template>
    </div>
  </div>
</template>
