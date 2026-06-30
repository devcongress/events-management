<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getDeviceId } from '@/src/device';
import type { QuizStateResponse } from '@/types';

const route = useRoute();
const sessionId = ref<string | null>(null);
const userId = ref<string | null>(null);
const state = ref<QuizStateResponse | null>(null);
const nickname = ref(localStorage.getItem('quiz-nickname') ?? '');
const nicknameInput = ref('');
const joinError = ref<string | null>(null);
const joining = ref(true);
const showNicknamePrompt = ref(false);
const selectedAnswer = ref<number | null>(null);
const submitting = ref(false);
const now = ref(Date.now());
const quizPaused = true;

let pollTimer: number | undefined;
let clockTimer: number | undefined;

const remaining = computed(() => {
  if (!state.value?.question_started_at || !state.value.current_question) return state.value?.current_question?.time_limit_seconds ?? 20;
  const elapsed = Math.floor((now.value - new Date(state.value.question_started_at).getTime()) / 1000);
  return Math.max(0, state.value.current_question.time_limit_seconds - elapsed);
});

const progress = computed(() => {
  const limit = state.value?.current_question?.time_limit_seconds ?? 20;
  return (remaining.value / limit) * 100;
});

async function joinQuiz(name: string) {
  joining.value = true;
  joinError.value = null;

  const response = await fetch('/api/quiz/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      join_code: String(route.params.code).toUpperCase(),
      nickname: name,
      device_id: getDeviceId(),
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    joinError.value = data.error || 'Invalid quiz code or quiz not available';
    joining.value = false;
    return;
  }

  const data = await response.json();
  sessionId.value = data.session_id;
  userId.value = data.user_id;
  joining.value = false;
  await pollState();
  pollTimer = window.setInterval(pollState, 1500);
}

function submitNickname() {
  const name = nicknameInput.value.trim();
  if (!name) return;
  localStorage.setItem('quiz-nickname', name);
  nickname.value = name;
  showNicknamePrompt.value = false;
  void joinQuiz(name);
}

async function pollState() {
  if (!sessionId.value || !userId.value) return;

  await fetch('/api/quiz/state/advance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId.value }),
  });

  const response = await fetch(`/api/quiz/state?sessionId=${sessionId.value}&userId=${userId.value}`);
  if (response.ok) {
    state.value = await response.json();
    return;
  }

  if (response.status === 404) {
    joinError.value = 'Session ended';
  }
}

async function submitAnswer(answerIndex: number) {
  if (!sessionId.value || !userId.value || submitting.value || state.value?.player_result) return;
  submitting.value = true;
  selectedAnswer.value = answerIndex;

  await fetch('/api/quiz/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId.value,
      user_id: userId.value,
      answer_index: answerIndex,
    }),
  });

  submitting.value = false;
  await pollState();
}

onMounted(async () => {
  if (quizPaused) {
    joining.value = false;
    return;
  }

  clockTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 250);

  const activeResponse = await fetch('/api/quiz/active');
  const active = await activeResponse.json();
  if (!active.has_active_quiz) {
    joinError.value = 'No live quiz is available right now';
    joining.value = false;
    return;
  }

  if (!nickname.value) {
    showNicknamePrompt.value = true;
    joining.value = false;
    return;
  }

  await joinQuiz(nickname.value);
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
  if (clockTimer) window.clearInterval(clockTimer);
});
</script>

<template>
  <div class="min-h-screen bg-dc-cream text-dc-ink">
    <div class="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <section class="coming-soon-banner">
        <div class="coming-soon-ribbon">Coming soon</div>
        <div>
          <h1 class="text-4xl font-black tracking-tight text-dc-ink sm:text-6xl">Live quiz is paused.</h1>
          <p class="mt-3 max-w-2xl text-base leading-7 text-dc-gray">
            This join-code route is kept for the future quiz rollout, but the first launch is focused on events, speaker slide links, attendance CSVs, and feedback.
          </p>
          <div class="mt-6 flex flex-wrap gap-3">
            <RouterLink to="/events" class="editorial-action">View Events</RouterLink>
            <RouterLink to="/" class="editorial-secondary-action">Home</RouterLink>
          </div>
        </div>
      </section>
    </div>
    <div class="hidden">
    <div v-if="showNicknamePrompt" class="flex min-h-screen items-center justify-center px-4">
      <form class="w-full max-w-md rounded-lg border-2 border-dc-ink bg-dc-paper p-8 shadow-[3px_3px_0_#111111] sm:p-12" @submit.prevent="submitNickname">
        <div class="mb-8 text-center">
          <h1 class="mb-2 text-3xl font-black text-dc-ink sm:text-4xl">Welcome to the <span class="text-dc-pink">Quiz</span></h1>
          <p class="text-dc-gray">Enter your nickname to join</p>
        </div>
        <label class="mb-2 block text-sm font-bold uppercase tracking-wide text-dc-ink">Your Nickname</label>
        <input v-model="nicknameInput" required maxlength="20" autofocus class="mb-6 w-full rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-4 text-xl text-dc-ink outline-none focus:border-dc-pink" />
        <button type="submit" class="w-full rounded-md border-2 border-dc-ink bg-dc-pink py-4 text-lg font-bold uppercase tracking-wide text-white shadow-[2px_2px_0_#111111]">Join Quiz</button>
      </form>
    </div>

    <div v-else-if="joinError" class="editorial-wrap flex min-h-[calc(100vh-6rem)] items-center py-10 lg:py-14">
      <div class="grid w-full gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
        <div>
          <p class="editorial-eyebrow">quiz room</p>
          <div class="mt-4 border-b-2 border-dc-ink pb-7">
            <h1 class="max-w-4xl text-5xl font-black leading-none tracking-tight text-dc-ink sm:text-6xl lg:text-7xl">
              This quiz is not open.
            </h1>
          </div>
          <p class="mt-6 max-w-2xl text-lg leading-8 text-dc-gray">
            {{ joinError }}. The host may not have opened the lobby yet, or this code may be from another meetup.
          </p>
          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <RouterLink to="/play" class="editorial-action">Try Another Code</RouterLink>
            <RouterLink to="/events" class="editorial-secondary-action">View Events</RouterLink>
          </div>
        </div>

        <aside class="overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]">
          <div class="border-b-2 border-dc-ink bg-dc-yellow px-5 py-4">
            <p class="font-mono text-xs font-black uppercase tracking-[0.22em] text-dc-ink">Quick check</p>
          </div>
          <div class="divide-y divide-dc-border">
            <div class="px-5 py-5">
              <p class="font-mono text-sm font-black uppercase tracking-wide text-dc-ink">Ask the host</p>
              <p class="mt-2 text-sm leading-6 text-dc-gray">The lobby must be open before players can join.</p>
            </div>
            <div class="px-5 py-5">
              <p class="font-mono text-sm font-black uppercase tracking-wide text-dc-ink">Check the code</p>
              <p class="mt-2 text-sm leading-6 text-dc-gray">Quiz codes are short and change per session.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>

    <div v-else-if="joining || !state" class="flex min-h-screen items-center justify-center p-4">
      <div class="text-center">
        <div class="motion-spinner mb-4 inline-block size-20 rounded-full border-4 border-dc-yellow border-t-transparent" />
        <p class="text-xl text-dc-ink">{{ joining ? 'Joining quiz...' : 'Connecting...' }}</p>
      </div>
    </div>

    <div v-else-if="state.session.status === 'waiting' || state.session.status === 'draft'" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-sm text-center">
        <div class="relative mb-12">
          <div class="mx-auto flex size-40 items-center justify-center rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]">
            <span class="font-mono text-6xl text-dc-pink">...</span>
          </div>
        </div>
        <h1 class="mb-8 font-mono text-5xl font-bold text-dc-ink">WAITING...</h1>
        <div class="mb-8 inline-block rounded-lg border-2 border-dc-ink bg-dc-yellow px-8 py-6 shadow-[3px_3px_0_#111111]">
          <div class="mb-2 font-mono text-sm uppercase tracking-wider text-dc-gray">Players Connected</div>
          <div class="font-mono text-6xl font-bold tabular-nums text-dc-ink">{{ state.participants_count }}</div>
        </div>
        <p class="font-mono text-dc-gray">Waiting for host to start</p>
      </div>
    </div>

    <div v-else-if="state.session.status === 'finished'" class="flex min-h-screen items-center justify-center p-4 py-12">
      <div class="w-full max-w-lg">
        <div class="mb-8 text-center">
          <div class="mb-8 inline-block rounded-md border-2 border-dc-ink bg-dc-yellow px-6 py-3 font-mono text-sm font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111]">Quiz Complete</div>
          <div class="mb-6 rounded-lg border-2 border-dc-ink bg-dc-paper p-10 shadow-[3px_3px_0_#111111]">
            <div class="mb-3 font-mono text-sm font-bold uppercase tracking-wider text-dc-gray">Final Score</div>
            <div class="font-mono text-6xl font-bold tabular-nums text-dc-ink">
              {{ state.leaderboard.find((entry) => entry.user_id === userId)?.total_score ?? 0 }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="state.session.question_phase === 'scoreboard'" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-lg">
        <div class="mb-8 text-center">
          <div class="mb-6 inline-block rounded-md border-2 border-dc-ink bg-dc-yellow px-6 py-3 font-mono text-sm font-bold uppercase tracking-wide text-dc-ink shadow-[2px_2px_0_#111111]">Scoreboard</div>
          <h2 class="mb-2 font-mono text-3xl font-bold text-dc-ink">RANKINGS</h2>
          <p class="font-mono text-sm text-dc-gray">After Question {{ state.session.current_question_index + 1 }}</p>
        </div>
        <div class="mb-6 rounded-lg border-2 border-dc-ink bg-dc-paper shadow-[3px_3px_0_#111111]">
          <div class="divide-y-2 divide-dc-border">
            <div v-for="(player, index) in state.leaderboard.slice(0, 5)" :key="player.user_id" class="flex items-center justify-between px-6 py-5" :class="player.user_id === userId ? 'bg-dc-yellow text-dc-ink' : 'bg-dc-paper text-dc-ink'">
              <div class="flex items-center gap-4">
                <span class="min-w-12 font-mono text-3xl font-bold tabular-nums">#{{ index + 1 }}</span>
                <span class="font-mono text-lg font-bold">{{ player.nickname }}</span>
              </div>
              <span class="font-mono text-2xl font-bold tabular-nums">{{ player.total_score }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="state.session.question_phase === 'revealing' && state.player_result" class="flex min-h-screen items-center justify-center p-6" :class="state.player_result.is_correct ? 'bg-green-600' : 'bg-red-600'">
      <div class="w-full max-w-lg text-center">
        <div class="mb-6 text-9xl">{{ state.player_result.is_correct ? '✓' : '✗' }}</div>
        <h1 class="mb-8 font-mono text-6xl font-bold text-white">{{ state.player_result.is_correct ? 'CORRECT!' : 'INCORRECT' }}</h1>
        <div v-if="state.player_result.is_correct" class="inline-block bg-white px-12 py-6 text-green-600">
          <div class="mb-2 font-mono text-sm font-bold uppercase tracking-wide">Points Earned</div>
          <div class="font-mono text-7xl font-bold tabular-nums">+{{ state.player_result.points_awarded }}</div>
        </div>
      </div>
    </div>

    <div v-else class="flex min-h-screen flex-col bg-dc-cream">
      <div class="h-4 border-b-2 border-dc-ink bg-dc-border">
        <div class="h-full" :class="progress > 50 ? 'bg-dc-yellow' : progress > 20 ? 'bg-orange-500' : 'bg-red-500'" :style="{ width: `${progress}%` }" />
      </div>

      <div class="flex flex-1 flex-col justify-center p-4 pb-6">
        <div class="mb-8 text-center">
          <div class="mb-6 inline-block rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-xs uppercase tracking-wide text-dc-gray shadow-[2px_2px_0_#111111]">
            Question {{ state.session.current_question_index + 1 }}
          </div>
          <div class="font-mono text-9xl font-bold tabular-nums text-dc-pink">{{ remaining }}</div>
          <div class="mt-2 font-mono text-sm uppercase tracking-wider text-dc-gray">Seconds Remaining</div>
        </div>

        <div v-if="state.player_result" class="mb-8 text-center">
          <div class="inline-block rounded-md border-2 border-dc-ink bg-dc-yellow px-8 py-5 font-mono text-2xl font-bold text-dc-ink shadow-[2px_2px_0_#111111]">ANSWER LOCKED IN</div>
          <div class="mt-4 font-mono text-sm text-dc-gray">{{ state.answers_count }} / {{ state.participants_count }} players answered</div>
        </div>

        <div class="mx-auto grid w-full max-w-2xl grid-cols-2 gap-4">
          <button
            v-for="(label, index) in ['A', 'B', 'C', 'D']"
            :key="label"
            class="quiz-answer-tile flex aspect-square min-h-[140px] items-center justify-center font-mono text-6xl font-bold text-white shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
            :class="[index === 0 ? 'bg-quiz-red' : index === 1 ? 'bg-quiz-blue' : index === 2 ? 'bg-quiz-yellow' : 'bg-quiz-green', selectedAnswer === index ? 'scale-95 ring-8 ring-white' : '']"
            :disabled="Boolean(state.player_result) || submitting || !state.current_question || index >= state.current_question.options.length"
            @click="submitAnswer(index)"
          >
            {{ label }}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>
