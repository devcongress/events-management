<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import QRCode from 'qrcode';
import type { Question, QuizSession } from '@/types';
import AdminEventTabs from '@/src/components/AdminEventTabs.vue';

type SessionWithQuestions = QuizSession & { questions: Question[]; participantCount: number };

const route = useRoute();
const session = ref<SessionWithQuestions | null>(null);
const loading = ref(true);
const saving = ref(false);
const liveState = ref<any>(null);
const qrCodeUrl = ref<string | null>(null);
const form = reactive({
  question_text: '',
  options: ['', '', '', ''],
  correct_index: 0,
  time_limit_seconds: 20,
  points: 1000,
});

const liveMode = computed(() => route.path.endsWith('/live'));
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
  const response = await fetch('/api/quiz/questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quiz_session_id: session.value.id,
      question_text: form.question_text,
      options: form.options,
      correct_index: Number(form.correct_index),
      order_index: session.value.questions.length,
      time_limit_seconds: Number(form.time_limit_seconds),
      points: Number(form.points),
    }),
  });
  if (response.ok) {
    form.question_text = '';
    form.options = ['', '', '', ''];
    form.correct_index = 0;
    await fetchSession();
  }
  saving.value = false;
}

async function deleteExistingQuestion(questionId: string) {
  const response = await fetch(`/api/quiz/questions/${questionId}`, { method: 'DELETE' });
  if (response.ok) await fetchSession();
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
  if (liveMode.value) {
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
      <RouterLink :to="`/admin/events/${route.params.eventId}`" class="mb-6 inline-flex items-center gap-2 font-mono text-dc-yellow hover:text-dc-yellow-glow">
        <span>&larr;</span> BACK TO EVENT
      </RouterLink>
      <AdminEventTabs :event-id="String(route.params.eventId)" />

      <div v-if="loading" class="py-12 text-center font-mono text-white">LOADING...</div>

      <div v-else-if="!session" class="editorial-panel relative overflow-hidden p-12 text-center">
        <div class="absolute right-0 top-0 size-16 border-b-2 border-l-2 border-dc-yellow/20" />
        <p class="mb-8 font-mono text-dc-gray">No quiz has been created for this event yet.</p>
        <button class="bg-dc-yellow px-8 py-4 font-bold uppercase tracking-wide text-dc-dark transition-shadow hover:shadow-glow" @click="createSession">Create Quiz</button>
      </div>

      <template v-else-if="liveMode">
        <div v-if="session.status === 'waiting' || session.status === 'draft'" class="flex min-h-[70vh] items-center justify-center p-8">
          <div class="w-full max-w-4xl text-center">
            <h1 class="mb-12 font-mono text-6xl font-bold uppercase tracking-tight text-white sm:text-7xl"><span class="text-dc-yellow">$</span> JOIN_THE_QUIZ</h1>
            <div class="mb-10 inline-block border-4 border-dc-yellow bg-dc-dark-1 p-10 shadow-glow">
              <p class="mb-3 font-mono text-xl uppercase tracking-wide text-dc-gray-light">Join Code:</p>
              <p class="animate-pulse-glow font-mono text-8xl font-bold tracking-widest text-dc-yellow">{{ session.join_code }}</p>
            </div>
            <div v-if="qrCodeUrl" class="mx-auto mb-10 grid max-w-3xl gap-6 md:grid-cols-[280px_1fr] md:items-center md:text-left">
              <img :src="qrCodeUrl" alt="Quiz join QR code" class="mx-auto size-[280px] border-4 border-dc-yellow bg-dc-yellow p-3 shadow-glow" />
              <div>
                <p class="font-mono text-sm font-bold uppercase tracking-[0.2em] text-dc-yellow">Scan to join</p>
                <p class="mt-3 break-all text-xl text-dc-gray-light">{{ playUrl }}</p>
              </div>
            </div>
            <div class="mb-10 text-4xl text-white">
              <span class="font-bold text-dc-yellow">{{ liveState?.participants_count ?? session.participantCount }}</span>
              <span class="uppercase text-dc-gray-light"> players joined</span>
            </div>
            <button class="bg-dc-yellow px-16 py-6 font-mono text-3xl font-bold uppercase tracking-wide text-dc-dark transition-all hover:shadow-glow-lg" :disabled="(liveState?.participants_count ?? session.participantCount) === 0" @click="startQuiz">START QUIZ</button>
          </div>
        </div>

        <div v-else class="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section class="border-2 border-dc-dark-3 bg-dc-dark-1 p-6">
            <div class="mb-6 inline-block bg-dc-yellow px-4 py-2 font-mono text-sm font-bold uppercase text-dc-dark">{{ session.status }}</div>
            <h1 class="mb-4 font-mono text-4xl font-bold text-white">
              Question {{ session.current_question_index + 1 }}
            </h1>
            <p class="mb-6 text-xl text-white">{{ session.questions[session.current_question_index]?.question_text ?? 'No active question' }}</p>
            <div class="grid gap-3 sm:grid-cols-2">
              <div v-for="(option, index) in session.questions[session.current_question_index]?.options ?? []" :key="option" class="border-2 border-dc-dark-3 bg-dc-dark-2 p-4 font-mono text-white">
                {{ ['A', 'B', 'C', 'D'][index] }}. {{ option }}
              </div>
            </div>
            <div class="mt-8 flex flex-wrap gap-3">
              <button class="bg-dc-yellow px-6 py-3 font-mono font-bold uppercase text-dc-dark" @click="showScoreboard">SHOW SCOREBOARD</button>
              <button class="bg-green-900/30 px-6 py-3 font-mono font-bold uppercase text-green-400" @click="nextQuestion">NEXT QUESTION</button>
              <button class="bg-red-900/30 px-6 py-3 font-mono font-bold uppercase text-red-400" @click="patchSession({ status: 'finished', question_phase: null, finished_at: new Date().toISOString() })">END QUIZ</button>
            </div>
          </section>

          <aside class="border-2 border-dc-dark-3 bg-dc-dark-1 p-6">
            <h2 class="mb-4 font-mono text-xl font-bold text-dc-yellow">LEADERBOARD</h2>
            <div class="space-y-3">
              <div v-for="entry in liveState?.leaderboard ?? []" :key="entry.user_id" class="flex justify-between border-b border-dc-dark-3 pb-3 font-mono text-sm">
                <span class="text-white">#{{ entry.rank }} {{ entry.nickname }}</span>
                <span class="text-dc-yellow">{{ entry.total_score }}</span>
              </div>
            </div>
          </aside>
        </div>
      </template>

      <template v-else>
        <div class="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p class="editorial-eyebrow">live game</p>
            <h1 class="editorial-title">Quiz Builder</h1>
            <p class="mt-2 text-dc-gray-light">Join Code: <span class="text-xl font-bold text-dc-yellow">{{ session.join_code }}</span></p>
          </div>
          <div class="flex gap-3">
            <button v-if="session.questions.length > 0 && session.status === 'draft'" class="border-2 border-green-400/30 bg-green-900/30 px-6 py-3 font-bold uppercase tracking-wide text-green-400" @click="openLobby">OPEN LOBBY</button>
            <RouterLink v-if="session.status === 'waiting'" :to="`/admin/events/${route.params.eventId}/quiz/live`" class="border-2 border-green-400/30 bg-green-900/30 px-6 py-3 font-bold uppercase tracking-wide text-green-400">GO TO LOBBY</RouterLink>
          </div>
        </div>

        <form class="editorial-panel mb-6 space-y-4 p-6" @submit.prevent="addQuestion">
          <h2 class="text-2xl font-black tracking-tight text-white">Add New Question</h2>
          <input v-model="form.question_text" required placeholder="Question text" class="editorial-input" />
          <div class="grid gap-3 sm:grid-cols-2">
            <input v-for="(_, index) in form.options" :key="index" v-model="form.options[index]" required :placeholder="`Option ${index + 1}`" class="editorial-input" />
          </div>
          <div class="grid gap-3 sm:grid-cols-3">
            <select v-model="form.correct_index" class="border-2 border-dc-dark-3 bg-dc-dark-2 px-4 py-3 text-white"><option :value="0">A correct</option><option :value="1">B correct</option><option :value="2">C correct</option><option :value="3">D correct</option></select>
            <input v-model="form.time_limit_seconds" type="number" min="5" class="border-2 border-dc-dark-3 bg-dc-dark-2 px-4 py-3 text-white" />
            <input v-model="form.points" type="number" min="100" class="border-2 border-dc-dark-3 bg-dc-dark-2 px-4 py-3 text-white" />
          </div>
          <button type="submit" :disabled="saving" class="editorial-action w-full">{{ saving ? 'ADDING...' : '+ Add Question' }}</button>
        </form>

        <div class="space-y-4">
          <article v-for="(question, index) in session.questions" :key="question.id" class="editorial-panel p-6">
            <div class="mb-3 flex items-start justify-between">
              <div>
                <span class="font-mono text-sm font-bold text-dc-yellow">Q{{ index + 1 }}</span>
                <h3 class="font-mono text-lg font-bold text-white">{{ question.question_text }}</h3>
              </div>
              <button class="font-mono text-sm font-bold text-red-400" @click="deleteExistingQuestion(question.id)">DELETE</button>
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <div v-for="(option, optionIndex) in question.options" :key="option" class="border border-dc-dark-3 bg-dc-dark-2 px-3 py-2 text-sm text-white" :class="optionIndex === question.correct_index ? 'border-dc-yellow text-dc-yellow' : ''">
                {{ ['A', 'B', 'C', 'D'][optionIndex] }}. {{ option }}
              </div>
            </div>
          </article>
        </div>
      </template>
    </div>
  </div>
</template>
