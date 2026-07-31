<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { Question, QuizSession, QuizStateResponse } from '@/types';

type SessionWithQuestions = QuizSession & { questions: Question[]; participantCount: number };

const route = useRoute();
const session = ref<SessionWithQuestions | null>(null);
const liveState = ref<QuizStateResponse | null>(null);
const qrCodeUrl = ref<string | null>(null);
const loading = ref(true);
const actionPending = ref(false);
const error = ref('');
let pollTimer: number | undefined;

const sessionId = computed(() => String(route.params.sessionId ?? ''));
const playUrl = computed(() => session.value ? `${window.location.origin}/play/${session.value.join_code}` : '');
const currentQuestion = computed(() => session.value?.questions.find((question) => (
  question.order_index === session.value?.current_question_index
)) ?? null);
const participantsCount = computed(() => liveState.value?.participants_count ?? session.value?.participantCount ?? 0);
const releasedCount = computed(() => session.value?.released_question_ids?.length ?? 0);
const allQuestionsReleased = computed(() => Boolean(session.value && releasedCount.value >= session.value.questions.length));

async function fetchPresenterState() {
  const response = await fetch(`/api/quiz/sessions/${sessionId.value}`);
  if (!response.ok) {
    error.value = response.status === 401 ? 'Organizer access is required for this presentation.' : 'Unable to load this presentation.';
    loading.value = false;
    return;
  }

  session.value = await response.json();
  const stateResponse = await fetch(`/api/quiz/state?sessionId=${sessionId.value}&presenter=true`);
  if (stateResponse.ok) liveState.value = await stateResponse.json();
  if (!qrCodeUrl.value && session.value) await buildQrCode();
  loading.value = false;
}

async function buildQrCode() {
  if (!playUrl.value) return;
  const { toDataURL } = await import('qrcode');
  qrCodeUrl.value = await toDataURL(playUrl.value, {
    margin: 1,
    width: 320,
    color: { dark: '#0b0b0d', light: '#f9e15e' },
  });
}

async function runAction(path: string, body?: Record<string, unknown>) {
  if (actionPending.value) return false;
  actionPending.value = true;
  error.value = '';
  const response = await fetch(path, {
    method: body ? 'PATCH' : 'POST',
    ...(body ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) error.value = payload.error ?? 'The presentation could not advance.';
  await fetchPresenterState();
  actionPending.value = false;
  return response.ok;
}

async function releaseQuestion() {
  await runAction(`/api/quiz/sessions/${sessionId.value}/release`);
}

async function revealAnswer() {
  await runAction(`/api/quiz/sessions/${sessionId.value}/reveal`);
}

async function finishRoom() {
  await runAction(`/api/quiz/sessions/${sessionId.value}`, {
    status: 'finished',
    question_phase: null,
    finished_at: new Date().toISOString(),
  });
}

onMounted(async () => {
  await fetchPresenterState();
  pollTimer = window.setInterval(fetchPresenterState, 1500);
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<template>
  <main class="min-h-[100svh] bg-[#1C1C1C] text-[#E5E5E5]">
    <div v-if="loading" class="flex min-h-[100svh] items-center justify-center p-8">
      <div class="text-center">
        <div class="motion-spinner mx-auto size-16 rounded-full border-4 border-dc-yellow border-t-transparent" />
        <p class="mt-5 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-[#A1A1A1]">Preparing presentation</p>
      </div>
    </div>

    <div v-else-if="!session" class="flex min-h-[100svh] items-center justify-center p-8">
      <section class="w-full max-w-xl rounded-xl border border-white/15 bg-black/20 p-8 text-center">
        <p class="font-mono text-xs font-semibold uppercase tracking-[0.24em] text-dc-yellow">Presentation unavailable</p>
        <h1 class="mt-4 text-4xl font-extrabold tracking-tight text-white">This room could not be opened.</h1>
        <p class="mt-4 text-base leading-7 text-[#A1A1A1]">{{ error }}</p>
      </section>
    </div>

    <section v-else-if="session.status === 'waiting' || session.status === 'draft'" class="quiz-stage-shell flex min-h-[100svh] items-center justify-center rounded-none border-0 p-6 sm:p-10">
      <div class="relative z-10 w-full max-w-5xl text-center">
        <p class="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-dc-yellow">Anonymous live learning</p>
        <h1 class="mt-5 text-5xl font-extrabold uppercase tracking-tight text-white sm:text-7xl lg:text-8xl">Scan to join</h1>
        <p class="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#A1A1A1] sm:text-xl">No names. No leaderboard. Answer from your phone as the room works through the scenario together.</p>

        <div class="mx-auto mt-10 grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <div class="rounded-xl border-2 border-dc-yellow bg-dc-yellow px-8 py-8 text-dc-ink shadow-[7px_7px_0_#e8117f] sm:px-12">
            <p class="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-dc-ink/65">Enter this code</p>
            <p class="mt-3 font-mono text-6xl font-bold tracking-[0.14em] sm:text-8xl">{{ session.join_code }}</p>
          </div>
          <div v-if="qrCodeUrl" class="flex justify-center rounded-xl border border-white/15 bg-white/[0.05] p-5">
            <img :src="qrCodeUrl" alt="Join this System Design learning room" class="size-[260px] rounded-lg bg-dc-yellow p-3" />
          </div>
        </div>

        <p class="mt-10 text-3xl font-semibold uppercase text-[#A1A1A1] sm:text-4xl">
          <span class="text-dc-yellow">{{ participantsCount }}</span> {{ participantsCount === 1 ? 'person' : 'people' }} joined
        </p>
        <button type="button" class="motion-press mt-9 rounded-lg border-2 border-dc-yellow bg-dc-pink px-10 py-4 font-mono text-xl font-semibold uppercase tracking-wide text-white shadow-[4px_4px_0_#f5e642] disabled:cursor-not-allowed disabled:opacity-40 sm:px-14 sm:py-5 sm:text-2xl" :disabled="participantsCount === 0 || actionPending" @click="releaseQuestion">
          {{ actionPending ? 'Starting...' : 'Start first question' }}
        </button>
        <p v-if="error" class="mx-auto mt-5 max-w-xl rounded-md border border-red-400/50 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-100">{{ error }}</p>
      </div>
    </section>

    <section v-else-if="session.status === 'finished'" class="quiz-stage-shell flex min-h-[100svh] items-center justify-center rounded-none border-0 p-8">
      <div class="relative z-10 max-w-3xl text-center">
        <p class="font-mono text-xs font-semibold uppercase tracking-[0.28em] text-dc-yellow">Session complete</p>
        <h1 class="mt-5 text-5xl font-extrabold tracking-tight text-white sm:text-7xl">That’s the room.</h1>
        <p class="mt-5 text-xl leading-8 text-[#A1A1A1]">Thanks for thinking it through together.</p>
      </div>
    </section>

    <section v-else class="quiz-stage-shell min-h-[100svh] rounded-none border-0 p-5 sm:p-8 lg:p-10">
      <div class="relative z-10 mx-auto grid min-h-[calc(100svh-5rem)] max-w-7xl gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div class="flex min-w-0 flex-col rounded-xl border border-white/15 bg-black/20 p-6 sm:p-8">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-dc-yellow">Question {{ releasedCount }} of {{ session.questions.length }}</span>
            <span class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-[#A1A1A1]">Code {{ session.join_code }}</span>
          </div>

          <h1 class="mt-8 max-w-5xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">{{ currentQuestion?.question_text ?? 'Preparing the next question' }}</h1>
          <div class="mt-8 grid gap-4 sm:grid-cols-2">
            <div v-for="(option, index) in currentQuestion?.options ?? []" :key="`${index}-${option}`" class="rounded-lg border p-5 text-lg font-semibold leading-7" :class="session.question_phase === 'revealing' && index === currentQuestion?.correct_index ? 'border-dc-yellow bg-dc-yellow text-dc-ink' : 'border-white/15 bg-white/[0.05] text-white'">
              <span class="mr-2 font-mono" :class="session.question_phase === 'revealing' && index === currentQuestion?.correct_index ? 'text-dc-pink' : 'text-dc-yellow'">{{ ['A', 'B', 'C', 'D'][index] }}.</span>{{ option }}
            </div>
          </div>

          <div v-if="session.question_phase === 'revealing'" class="mt-7 rounded-lg border border-dc-yellow/50 bg-dc-yellow/10 p-5">
            <p class="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-dc-yellow">Why this answer</p>
            <p class="mt-3 text-lg leading-8 text-[#E5E5E5]">{{ currentQuestion?.explanation }}</p>
          </div>

          <div class="mt-auto flex flex-wrap gap-3 pt-8">
            <button v-if="session.question_phase === 'answering'" type="button" class="editorial-secondary-action" :disabled="actionPending" @click="revealAnswer">{{ actionPending ? 'Revealing...' : 'Reveal answer' }}</button>
            <button v-else-if="!allQuestionsReleased" type="button" class="editorial-action" :disabled="actionPending" @click="releaseQuestion">{{ actionPending ? 'Releasing...' : 'Release next question' }}</button>
            <button v-else type="button" class="editorial-action" :disabled="actionPending" @click="finishRoom">Finish room</button>
            <button v-if="!allQuestionsReleased" type="button" class="rounded-md border border-red-400/60 bg-red-950/40 px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wide text-red-100" :disabled="actionPending" @click="finishRoom">End room</button>
          </div>
          <p v-if="error" class="mt-4 rounded-md border border-red-400/50 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-100">{{ error }}</p>
        </div>

        <aside class="rounded-xl border border-white/15 bg-white/[0.04] p-6 sm:p-7">
          <p class="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-pink">Room pulse</p>
          <p class="mt-3 text-4xl font-extrabold text-white">{{ liveState?.answers_count ?? 0 }} / {{ participantsCount }}</p>
          <p class="mt-1 text-sm text-[#A1A1A1]">people answered</p>
          <div class="mt-7 space-y-4">
            <div v-for="result in liveState?.answer_distribution ?? []" :key="result.option_index">
              <div class="flex items-center justify-between font-mono text-xs font-semibold uppercase tracking-wide">
                <span class="text-[#E5E5E5]">{{ ['A', 'B', 'C', 'D'][result.option_index] }}</span>
                <span class="text-dc-yellow">{{ result.percentage }}%</span>
              </div>
              <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div class="h-full rounded-full bg-dc-pink" :style="{ width: `${result.percentage}%` }" />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  </main>
</template>
