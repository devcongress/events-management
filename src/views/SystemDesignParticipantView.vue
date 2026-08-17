<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import CelebrationConfetti from '@/src/components/CelebrationConfetti.vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import SystemDesignParticipantPageSkeleton from '@/src/components/ui/page-skeletons/SystemDesignParticipantPageSkeleton.vue';
import { getDeviceId } from '@/src/device';
import type { QuizStateResponse } from '@/types';

const route = useRoute();
const sessionId = ref<string | null>(null);
const userId = ref<string | null>(null);
const participantId = ref<string | null>(null);
const state = ref<QuizStateResponse | null>(null);
const joinError = ref<string | null>(null);
const joining = ref(true);
const nicknameInput = ref('');
const nameError = ref<string | null>(null);
const displayName = ref<string | null>(null);
const savingName = ref(false);
const nameSaved = ref(false);
const selectedAnswer = ref<number | null>(null);
const answerError = ref<string | null>(null);
const submitting = ref(false);
const now = ref(Date.now());

let pollTimer: number | undefined;
let clockTimer: number | undefined;
let pollInFlight = false;

const remaining = computed(() => {
  if (!state.value?.question_started_at || !state.value.current_question) {
    return state.value?.current_question?.time_limit_seconds ?? 20;
  }

  const elapsed = Math.floor((now.value - new Date(state.value.question_started_at).getTime()) / 1000);
  return Math.max(0, state.value.current_question.time_limit_seconds - elapsed);
});
const secondsUntilStart = computed(() => {
  if (!state.value?.question_started_at || state.value.session.question_phase !== 'answering') return null;
  return Math.max(0, Math.ceil((new Date(state.value.question_started_at).getTime() - now.value) / 1000));
});
const questionIsOpen = computed(() => secondsUntilStart.value === null || secondsUntilStart.value <= 0);

const progress = computed(() => {
  const limit = state.value?.current_question?.time_limit_seconds ?? 20;
  return (remaining.value / limit) * 100;
});
const playerStanding = computed(() => state.value?.player_standing ?? null);
const avatarSeed = computed(() => playerStanding.value?.avatar_seed ?? participantId.value ?? userId.value ?? displayName.value ?? 'participant');
const isTopFive = computed(() => Boolean(playerStanding.value && playerStanding.value.rank <= 5));

async function joinLearningRoom() {
  joining.value = true;
  joinError.value = null;
  nameError.value = null;

  const response = await fetch('/api/quiz/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      join_code: String(route.params.code).toUpperCase(),
      device_id: getDeviceId(),
      purpose: 'system_design_learning',
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    joinError.value = data.error || 'This System Design learning room is not available.';
    joining.value = false;
    return;
  }

  const data = await response.json();
  sessionId.value = data.session_id;
  userId.value = data.user_id;
  participantId.value = data.participant_id;
  displayName.value = data.display_name;
  nicknameInput.value = data.display_name;
  joining.value = false;
  await pollState();
  pollTimer = window.setInterval(pollState, 2000);
}

async function saveName() {
  if (!participantId.value || savingName.value) return;
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    nameError.value = 'Enter the name you want to use in this room.';
    return;
  }

  savingName.value = true;
  nameError.value = null;
  nameSaved.value = false;
  const response = await fetch(`/api/quiz/participants/${participantId.value}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: getDeviceId(), nickname }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    nameError.value = data.error || 'Your name could not be updated.';
  } else {
    displayName.value = data.display_name;
    nicknameInput.value = data.display_name;
    nameSaved.value = true;
  }
  savingName.value = false;
}

async function pollState() {
  if (!sessionId.value || !userId.value || pollInFlight || document.hidden) return;
  pollInFlight = true;

  try {
    const stateQuery = new URLSearchParams({
      sessionId: sessionId.value,
      userId: userId.value,
    });
    const response = await fetch(`/api/quiz/state?${stateQuery.toString()}`, {
      headers: { 'X-Quiz-Device-ID': getDeviceId() },
    });
    if (response.ok) {
      const nextState = await response.json() as QuizStateResponse;
      if (state.value?.session.current_question_index !== nextState.session.current_question_index) {
        selectedAnswer.value = null;
        answerError.value = null;
      }
      state.value = nextState;
      return;
    }

    if (response.status === 404) joinError.value = 'This System Design learning room has ended.';
  } finally {
    pollInFlight = false;
  }
}

async function submitAnswer(answerIndex: number) {
  if (!sessionId.value || !userId.value || submitting.value || state.value?.player_result || remaining.value <= 0 || !questionIsOpen.value) return;

  submitting.value = true;
  answerError.value = null;

  const response = await fetch('/api/quiz/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId.value,
      user_id: userId.value,
      device_id: getDeviceId(),
      answer_index: answerIndex,
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    answerError.value = data.error || 'Your answer could not be submitted.';
  } else {
    selectedAnswer.value = answerIndex;
  }

  submitting.value = false;
  await pollState();
}

onMounted(async () => {
  clockTimer = window.setInterval(() => {
    now.value = Date.now();
  }, 250);

  await joinLearningRoom();
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
  if (clockTimer) window.clearInterval(clockTimer);
});
</script>

<template>
  <main class="min-h-screen bg-dc-cream text-dc-ink">
    <section v-if="joinError" class="flex min-h-screen items-center justify-center px-5 py-12">
      <div class="w-full max-w-lg rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111] sm:p-12">
        <p class="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-pink">System Design learning room</p>
        <h1 class="mt-4 text-4xl font-extrabold tracking-tight">This room is not open.</h1>
        <p class="mt-4 text-base leading-7 text-dc-gray">{{ joinError }}</p>
        <p class="mt-6 font-mono text-sm text-dc-gray">Ask the facilitator to open the room and scan the latest QR code.</p>
      </div>
    </section>

    <SystemDesignParticipantPageSkeleton v-else-if="joining || !state" />

    <section v-else-if="state.session.status === 'waiting' || state.session.status === 'draft'" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-md text-center">
        <NaviiAvatar :seed="avatarSeed" :title="`${displayName} avatar`" :size="128" class="mx-auto" />
        <p class="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-pink">Live learning room</p>
        <h1 class="mt-4 font-mono text-4xl font-bold">YOU'RE IN</h1>
        <p class="mt-3 text-sm leading-6 text-dc-gray">Your avatar is fixed for this room. Keep the name below or change it before the presentation starts.</p>
        <form class="mt-7 rounded-lg border-2 border-dc-ink bg-dc-paper p-5 text-left shadow-[3px_3px_0_#111111]" @submit.prevent="saveName">
          <label class="block">
            <span class="editorial-label">Your room name</span>
            <input v-model="nicknameInput" required maxlength="24" autocomplete="nickname" class="editorial-input mt-2" />
          </label>
          <p v-if="nameError" class="mt-3 text-sm font-semibold text-red-700">{{ nameError }}</p>
          <p v-else-if="nameSaved" class="mt-3 text-sm font-semibold text-green-700">Name saved.</p>
          <button type="submit" class="editorial-action mt-4 w-full" :disabled="savingName || nicknameInput.trim() === displayName">
            {{ savingName ? 'Saving...' : 'Save name' }}
          </button>
        </form>
        <p class="mt-5 font-mono text-dc-gray">Waiting for the facilitator to start</p>
      </div>
    </section>

    <section v-else-if="state.session.status === 'finished'" class="flex min-h-screen items-center justify-center p-5">
      <div class="relative w-full max-w-md overflow-hidden rounded-lg border-2 border-dc-ink bg-dc-paper p-8 text-center shadow-[3px_3px_0_#111111] sm:p-12">
        <CelebrationConfetti v-if="isTopFive" />
        <div class="relative z-10">
          <NaviiAvatar :seed="avatarSeed" :title="`${playerStanding?.nickname ?? displayName} avatar`" :size="112" class="mx-auto" />
          <h1 class="mt-6 text-4xl font-extrabold tracking-tight">{{ playerStanding?.nickname ?? displayName }}</h1>
          <p class="mt-5 font-mono text-sm font-semibold uppercase tracking-[0.2em] text-dc-gray">Your position</p>
          <p class="mt-2 font-mono text-6xl font-bold text-dc-pink">#{{ playerStanding?.rank ?? '—' }}</p>
          <p v-if="playerStanding" class="mt-2 font-mono text-sm text-dc-gray">of {{ playerStanding.participant_count }}</p>
        </div>
      </div>
    </section>

    <section v-else-if="state.session.question_phase === 'presenting'" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-md text-center">
        <NaviiAvatar :seed="avatarSeed" :title="`${displayName} avatar`" :size="112" class="mx-auto" />
        <p class="mt-7 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-pink">Question {{ state.session.current_question_index + 1 }}</p>
        <h1 class="mt-4 text-5xl font-extrabold tracking-tight">Look to the presenter.</h1>
        <p class="mt-4 text-base leading-7 text-dc-gray">The facilitator is introducing the next question. Your answer timer has not started.</p>
      </div>
    </section>

    <section v-else-if="state.session.question_phase === 'answering' && !questionIsOpen" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-md text-center">
        <NaviiAvatar :seed="avatarSeed" :title="`${displayName} avatar`" :size="112" class="mx-auto" />
        <p class="mt-7 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-pink">Question {{ state.session.current_question_index + 1 }}</p>
        <p class="mt-4 font-mono text-7xl font-bold tabular-nums">{{ secondsUntilStart }}</p>
        <p class="mt-1 font-mono text-xs uppercase tracking-wider text-dc-gray">starting together</p>
        <p class="mt-6 text-sm leading-6 text-dc-gray">Keep watching the shared screen. Answer choices will open when the question timer begins.</p>
      </div>
    </section>

    <section v-else-if="state.session.question_phase === 'revealing'" class="flex min-h-screen items-center justify-center p-5">
      <div class="w-full max-w-lg text-center">
        <p class="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-pink">Answer revealed</p>
        <p v-if="displayName" class="mt-3 font-mono text-sm font-semibold text-dc-gray">{{ displayName }}</p>
        <h1 class="mt-4 text-5xl font-extrabold tracking-tight">
          {{ state.player_result?.is_correct ? 'You got it.' : 'Keep thinking.' }}
        </h1>
        <div v-if="state.player_result" class="mt-8 rounded-lg border-2 border-dc-ink bg-dc-yellow p-7 shadow-[3px_3px_0_#111111]">
          <p class="font-mono text-sm font-semibold uppercase tracking-wide">Correct answer</p>
          <p class="mt-3 font-mono text-5xl font-bold">{{ ['A', 'B', 'C', 'D'][state.player_result.correct_index] }}</p>
        </div>
        <p v-if="state.reveal_explanation" class="mt-7 rounded-lg border-2 border-dc-ink bg-dc-paper p-6 text-left text-base leading-7 shadow-[3px_3px_0_#111111]">
          {{ state.reveal_explanation }}
        </p>
        <p class="mt-7 font-mono text-sm text-dc-gray">Follow the discussion on the shared screen.</p>
      </div>
    </section>

    <section v-else-if="state.session.question_phase === 'answering' && questionIsOpen && remaining <= 0" class="flex min-h-screen items-center justify-center p-6">
      <div class="w-full max-w-md text-center">
        <NaviiAvatar :seed="avatarSeed" :title="`${displayName} avatar`" :size="112" class="mx-auto" />
        <p class="mt-7 font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-pink">Question {{ state.session.current_question_index + 1 }}</p>
        <h1 class="mt-4 text-5xl font-extrabold tracking-tight">Time's up.</h1>
        <p class="mt-4 text-base leading-7 text-dc-gray">
          {{ selectedAnswer !== null ? 'Your answer is locked in.' : 'Answers are now closed.' }}
        </p>
        <div class="mt-8 rounded-lg border-2 border-dc-ink bg-dc-paper p-6 shadow-[3px_3px_0_#111111]">
          <p class="font-mono text-sm font-semibold uppercase tracking-wide text-dc-ink">Waiting for the facilitator</p>
          <p class="mt-2 text-sm leading-6 text-dc-gray">The answer will be revealed on this screen shortly.</p>
        </div>
      </div>
    </section>

    <section v-else class="flex min-h-screen flex-col">
      <div class="h-3 border-b-2 border-dc-ink bg-dc-border">
        <div class="h-full bg-dc-yellow" :style="{ width: `${progress}%` }" />
      </div>

      <div class="flex flex-1 flex-col justify-center p-5 pb-8">
        <div class="mb-8 text-center">
          <div class="mx-auto flex w-fit items-center gap-2">
            <NaviiAvatar :seed="avatarSeed" :title="`${displayName} avatar`" :size="32" />
            <p class="font-mono text-xs font-semibold uppercase tracking-[0.22em] text-dc-pink">{{ displayName }} · Question {{ state.session.current_question_index + 1 }}</p>
          </div>
          <p class="mt-3 font-mono text-7xl font-bold tabular-nums">{{ remaining }}</p>
          <p class="mt-1 font-mono text-xs uppercase tracking-wider text-dc-gray">seconds remaining</p>
        </div>

        <div v-if="selectedAnswer !== null" class="mb-7 text-center">
          <p class="inline-block rounded-md border-2 border-dc-ink bg-dc-yellow px-7 py-4 font-mono text-lg font-semibold shadow-[2px_2px_0_#111111]">ANSWER LOCKED IN</p>
          <p class="mt-3 font-mono text-sm text-dc-gray">{{ state.answers_count }} of {{ state.participants_count }} people answered</p>
        </div>

        <p v-if="answerError" class="mx-auto mb-5 w-full max-w-xl rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700">
          {{ answerError }}
        </p>

        <div class="mx-auto grid w-full max-w-xl grid-cols-2 gap-4">
          <button
            v-for="(label, index) in ['A', 'B', 'C', 'D']"
            :key="label"
            class="quiz-answer-tile flex aspect-square min-h-[132px] items-center justify-center border-2 border-dc-ink font-mono text-5xl font-bold text-white shadow-[3px_3px_0_#111111] disabled:cursor-not-allowed disabled:opacity-40"
            :class="[index === 0 ? 'bg-quiz-red' : index === 1 ? 'bg-quiz-blue' : index === 2 ? 'bg-quiz-yellow' : 'bg-quiz-green', selectedAnswer === index ? 'scale-95 ring-4 ring-dc-ink' : '']"
            :disabled="remaining <= 0 || !questionIsOpen || selectedAnswer !== null || submitting || state.session.question_phase !== 'answering' || !state.current_question || index >= state.current_question.options.length"
            @click="submitAnswer(index)"
          >
            {{ label }}
          </button>
        </div>
      </div>
    </section>
  </main>
</template>
