<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import { systemDesignParticipantPath } from '@/src/system-design-participant-route';
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
let clockTimer: number | undefined;
let pollInFlight = false;
const nowMs = ref(Date.now());

const sessionId = computed(() => String(route.params.sessionId ?? ''));
const playUrl = computed(() => session.value
  ? `${window.location.origin}${systemDesignParticipantPath(session.value.join_code)}`
  : '');
const currentQuestion = computed(() => session.value?.questions.find((question) => (
  question.order_index === session.value?.current_question_index
)) ?? null);
const participantsCount = computed(() => liveState.value?.participants_count ?? session.value?.participantCount ?? 0);
const releasedCount = computed(() => session.value?.released_question_ids?.length ?? 0);
const allQuestionsReleased = computed(() => Boolean(session.value && releasedCount.value >= session.value.questions.length));
const skippedQuestions = computed(() => session.value?.questions.filter((question) => (session.value?.skipped_question_ids ?? []).includes(question.id)) ?? []);
const secondsUntilStart = computed(() => {
  const activeSession = session.value;
  if (!activeSession || !['presenting', 'answering'].includes(activeSession.question_phase ?? '') || !activeSession.question_started_at) return null;
  return Math.max(0, Math.ceil((new Date(activeSession.question_started_at).getTime() - nowMs.value) / 1000));
});
const secondsRemaining = computed(() => {
  if (session.value?.question_phase !== 'answering' || !currentQuestion.value || !session.value.question_started_at) return null;
  if (secondsUntilStart.value && secondsUntilStart.value > 0) return currentQuestion.value.time_limit_seconds;
  const endsAt = new Date(session.value.question_started_at).getTime() + (currentQuestion.value.time_limit_seconds * 1000);
  return Math.max(0, Math.ceil((endsAt - nowMs.value) / 1000));
});
const presenterTimer = computed(() => {
  if (secondsRemaining.value === null) return null;
  const minutes = Math.floor(secondsRemaining.value / 60);
  return `${minutes}:${String(secondsRemaining.value % 60).padStart(2, '0')}`;
});
const answerDistribution = computed(() => Array.from({ length: 4 }, (_, optionIndex) => (
  liveState.value?.answer_distribution?.find((result) => result.option_index === optionIndex) ?? {
    option_index: optionIndex,
    count: 0,
    percentage: 0,
  }
)));
const answersRemaining = computed(() => Math.max(0, participantsCount.value - (liveState.value?.answers_count ?? 0)));
const answersComplete = computed(() => participantsCount.value > 0 && answersRemaining.value === 0);
const rankedLeaderboard = computed(() => {
  let scoredRank = 0;
  return (liveState.value?.leaderboard ?? []).map((entry) => {
    const scoreRank = entry.total_score > 0 ? ++scoredRank : null;
    return { ...entry, scoreRank };
  });
});

function medalForRank(rank: number | null): { label: string; symbol: string; tone: string } | null {
  if (rank === 1) return { label: 'Gold medal', symbol: '🥇', tone: 'gold' };
  if (rank === 2) return { label: 'Silver medal', symbol: '🥈', tone: 'silver' };
  if (rank === 3) return { label: 'Bronze medal', symbol: '🥉', tone: 'bronze' };
  return null;
}

async function fetchPresenterState() {
  if (pollInFlight || document.hidden) return;
  pollInFlight = true;
  try {
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
  } finally {
    pollInFlight = false;
  }
}

async function buildQrCode() {
  if (!playUrl.value) return;
  const { toDataURL } = await import('qrcode');
  qrCodeUrl.value = await toDataURL(playUrl.value, {
    margin: 1,
    width: 320,
    color: { dark: '#111111', light: '#FFFFFF' },
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

async function skipQuestion() {
  await runAction(`/api/quiz/sessions/${sessionId.value}/skip`);
}

async function reopenSkippedQuestion(questionId: string) {
  await runAction(`/api/quiz/sessions/${sessionId.value}/reopen-skipped/${questionId}`);
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
  clockTimer = window.setInterval(() => { nowMs.value = Date.now(); }, 250);
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
  if (clockTimer) window.clearInterval(clockTimer);
});
</script>

<template>
  <main class="presenter-screen">
    <div v-if="loading" class="presenter-centred-state">
      <div class="text-center">
        <div class="motion-spinner mx-auto size-16 rounded-full border-4 border-dc-pink border-t-transparent" />
        <p class="presenter-eyebrow mt-5">Preparing presentation</p>
      </div>
    </div>

    <div v-else-if="!session" class="presenter-centred-state">
      <section class="presenter-state-card">
        <p class="presenter-eyebrow">Presentation unavailable</p>
        <h1>This room could not be opened.</h1>
        <p>{{ error }}</p>
      </section>
    </div>

    <section v-else-if="session.status === 'waiting' || session.status === 'draft'" class="presenter-stage">
      <div class="presenter-frame presenter-frame--lobby">
        <header class="presenter-topbar">
          <div>
            <p class="presenter-eyebrow">System Design · Live learning room</p>
            <p class="presenter-topbar-title">DevCongress</p>
          </div>
          <span class="presenter-room-chip">Room {{ session.join_code }}</span>
        </header>

        <div class="presenter-lobby-grid">
          <div class="presenter-lobby-copy">
            <p class="presenter-kicker">Join from your phone</p>
            <h1>Scan to join.</h1>
            <p class="presenter-lede">Everyone receives a name and Navii avatar. Names can be edited before the room starts.</p>

            <div class="presenter-code-card">
              <p>Or enter this code</p>
              <strong>{{ session.join_code }}</strong>
            </div>

            <div class="presenter-lobby-actions">
              <div class="presenter-joined-count" aria-live="polite">
                <strong>{{ participantsCount }}</strong>
                <span>{{ participantsCount === 1 ? 'person joined' : 'people joined' }}</span>
              </div>
              <button type="button" class="editorial-action presenter-primary-action motion-press" :disabled="participantsCount === 0 || actionPending" @click="releaseQuestion">
                {{ actionPending ? 'Showing...' : 'Show first question' }}
              </button>
            </div>
            <p v-if="error" class="presenter-error">{{ error }}</p>
          </div>

          <div class="presenter-qr-card">
            <div class="presenter-qr-heading">
              <span>01</span>
              <p>Point your camera here</p>
            </div>
            <img v-if="qrCodeUrl" :src="qrCodeUrl" alt="Join this System Design learning room" />
            <p class="presenter-qr-footnote">No account. No leaderboard pressure while answering.</p>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="session.status === 'finished'" class="presenter-stage">
      <div class="presenter-frame">
        <header class="presenter-topbar">
          <div>
            <p class="presenter-eyebrow">System Design · Session complete</p>
            <p class="presenter-topbar-title">DevCongress</p>
          </div>
          <span class="presenter-room-chip">Room {{ session.join_code }}</span>
        </header>

        <div class="presenter-finish-heading">
          <p class="presenter-kicker">The room has decided</p>
          <h1>Final leaderboard.</h1>
          <p>The strongest decisions across the complete learning sequence.</p>
        </div>

        <aside class="presenter-score-summary" aria-label="How System Design points are calculated">
          <div class="presenter-score-summary-intro">
            <p class="presenter-eyebrow">Scoring</p>
            <p>Fast, correct answers move you up.</p>
          </div>
          <div class="presenter-score-rule">
            <span>Correct answer</span>
            <strong>50–100%</strong>
            <p>of the question’s points, based on speed.</p>
          </div>
          <div class="presenter-score-rule presenter-score-rule--streak">
            <span>Streak bonus</span>
            <div class="presenter-streak-scale" aria-label="Two correct answers in a row add 100 points, three add 200, four add 300, and five or more add 500.">
              <span><b>2</b> +100</span>
              <span><b>3</b> +200</span>
              <span><b>4</b> +300</span>
              <span><b>5+</b> +500</span>
            </div>
          </div>
        </aside>

        <div v-if="rankedLeaderboard.length" class="presenter-leaderboard">
          <div class="presenter-leaderboard-scroll" tabindex="0" aria-label="Final leaderboard. Scroll horizontally to view every column.">
            <div class="presenter-leaderboard-table">
              <div class="presenter-leaderboard-header" aria-hidden="true">
                <span>Rank</span><span>Participant</span><span>Correct / total</span><span>Points</span>
              </div>
              <div v-for="entry in rankedLeaderboard" :key="entry.user_id" class="presenter-leaderboard-row" :class="{ 'presenter-leaderboard-row--podium': entry.scoreRank !== null && entry.scoreRank <= 3 }">
                <span class="presenter-rank">
                  <template v-if="entry.scoreRank !== null">
                    <span v-if="medalForRank(entry.scoreRank)" class="presenter-medal" :class="`presenter-medal--${medalForRank(entry.scoreRank)?.tone}`" :aria-label="medalForRank(entry.scoreRank)?.label">
                      {{ medalForRank(entry.scoreRank)?.symbol }}
                    </span>
                    <span v-else>#{{ entry.scoreRank }}</span>
                  </template>
                  <span v-else class="presenter-rank--unscored">—</span>
                </span>
                <div class="presenter-player">
                  <NaviiAvatar :seed="entry.avatar_seed ?? entry.user_id" :title="`${entry.nickname} avatar`" :size="entry.scoreRank !== null && entry.scoreRank <= 3 ? 56 : 46" />
                  <span>{{ entry.nickname }}</span>
                </div>
                <span class="presenter-correct-count">{{ entry.correct_answers ?? 0 }} / {{ session.questions.length }}</span>
                <span class="presenter-score">{{ entry.total_score }} pts</span>
              </div>
            </div>
          </div>
        </div>
        <p v-else class="presenter-empty-state">No answers were submitted in this run.</p>
      </div>
    </section>

    <section v-else class="presenter-stage presenter-stage--question">
      <div class="presenter-frame">
        <header class="presenter-topbar">
          <div>
            <p class="presenter-eyebrow">System Design · Live learning room</p>
            <p class="presenter-topbar-title">Question {{ releasedCount }} of {{ session.questions.length }}</p>
          </div>
          <span class="presenter-room-chip">Room {{ session.join_code }}</span>
        </header>

        <div class="presenter-question-layout">
          <div class="presenter-question-heading">
            <div class="presenter-question-prompt">
              <p class="presenter-kicker">Think through the trade-off</p>
              <h1>{{ currentQuestion?.question_text ?? 'Preparing the next question' }}</h1>
            </div>
            <div v-if="secondsUntilStart !== null && secondsUntilStart > 0" class="presenter-timer" aria-live="polite">
              <span>Starting in</span>
              <strong>{{ secondsUntilStart }}</strong>
            </div>
            <div v-else-if="presenterTimer !== null" class="presenter-timer" :class="{ 'presenter-timer--urgent': secondsRemaining !== null && secondsRemaining <= 5 }" aria-live="off">
              <span>Time left</span>
              <strong>{{ presenterTimer }}</strong>
            </div>
          </div>

          <article class="presenter-question-panel">
            <div class="presenter-options">
              <div
                v-for="(option, index) in currentQuestion?.options ?? []"
                :key="`${index}-${option}`"
                class="presenter-option"
                :class="{ 'presenter-option--correct': session.question_phase === 'revealing' && index === currentQuestion?.correct_index }"
              >
                <span>{{ ['A', 'B', 'C', 'D'][index] }}</span>
                <p>{{ option }}</p>
              </div>
            </div>

            <div class="presenter-explanation" :class="{ 'presenter-explanation--revealed': session.question_phase === 'revealing' }">
              <p class="presenter-eyebrow">Why this answer</p>
              <p v-if="session.question_phase === 'revealing'">{{ currentQuestion?.explanation }}</p>
              <p v-else class="presenter-explanation-placeholder">The explanation will appear here when the answer is revealed.</p>
            </div>

            <footer class="presenter-controls">
              <template v-if="session.question_phase === 'presenting'">
                <p class="presenter-starting-note">The timer opens automatically after the shared three-second countdown.</p>
                <div class="presenter-control-actions">
                  <button type="button" class="editorial-secondary-action motion-press" :disabled="actionPending" @click="skipQuestion">Skip question</button>
                  <button v-if="!allQuestionsReleased" type="button" class="presenter-end-action motion-press" :disabled="actionPending" @click="finishRoom">End room</button>
                </div>
              </template>
              <template v-else-if="session.question_phase === 'answering'">
                <div class="presenter-control-actions">
                  <button type="button" class="editorial-action motion-press" :disabled="actionPending" @click="revealAnswer">{{ actionPending ? 'Revealing...' : 'Reveal answer' }}</button>
                  <button type="button" class="editorial-secondary-action motion-press" :disabled="actionPending" @click="skipQuestion">Skip question</button>
                  <button v-if="!allQuestionsReleased" type="button" class="presenter-end-action motion-press" :disabled="actionPending" @click="finishRoom">End room</button>
                </div>
              </template>
              <div v-else class="presenter-control-actions presenter-control-actions--solo">
                <button v-if="!allQuestionsReleased" type="button" class="editorial-action motion-press" :disabled="actionPending" @click="releaseQuestion">{{ actionPending ? 'Showing...' : 'Show next question' }}</button>
                <button v-else type="button" class="editorial-action motion-press" :disabled="actionPending" @click="finishRoom">Finish room</button>
                <button v-if="!allQuestionsReleased" type="button" class="presenter-end-action motion-press" :disabled="actionPending" @click="finishRoom">End room</button>
              </div>
            </footer>
            <p v-if="error" class="presenter-error">{{ error }}</p>
            <aside v-if="skippedQuestions.length" class="presenter-skipped-note" aria-live="polite">
              <p><strong>{{ skippedQuestions.length }} skipped question{{ skippedQuestions.length === 1 ? '' : 's' }}.</strong> Answers were discarded and will not score. Reopen one before ending if you want the room to try it.</p>
              <div class="presenter-skipped-actions"><button v-for="question in skippedQuestions" :key="question.id" type="button" class="editorial-secondary-action motion-press" :disabled="actionPending" @click="reopenSkippedQuestion(question.id)">Reopen Q{{ question.order_index + 1 }}</button></div>
            </aside>
          </article>

          <aside class="presenter-results-panel">
            <div class="presenter-results-heading">
              <div>
                <p class="presenter-eyebrow">Live room</p>
                <h2>{{ session.question_phase === 'revealing' ? 'How people answered' : 'Answer progress' }}</h2>
              </div>
              <div class="presenter-answer-count">
                <strong>{{ liveState?.answers_count ?? 0 }}</strong>
                <span>of {{ participantsCount }}</span>
              </div>
            </div>

            <div v-if="session.question_phase === 'revealing'" class="presenter-chart" role="img" :aria-label="`Vertical bar chart of ${liveState?.answers_count ?? 0} answers from ${participantsCount} participants`">
              <div v-for="result in answerDistribution" :key="result.option_index" class="presenter-chart-column">
                <div class="presenter-chart-value">
                  <strong>{{ result.percentage }}%</strong>
                  <span>{{ result.count }} {{ result.count === 1 ? 'person' : 'people' }}</span>
                </div>
                <div class="presenter-chart-track">
                  <div
                    class="presenter-chart-fill"
                    :class="{ 'presenter-chart-fill--correct': session.question_phase === 'revealing' && result.option_index === currentQuestion?.correct_index }"
                    :style="{ transform: `scaleY(${result.percentage / 100})` }"
                  />
                </div>
                <span class="presenter-chart-label">{{ ['A', 'B', 'C', 'D'][result.option_index] }}</span>
              </div>
            </div>

            <div v-else class="presenter-vote-progress" aria-live="polite">
              <div class="presenter-vote-progress-orbit" aria-hidden="true">
                <span>{{ liveState?.answers_count ?? 0 }}</span>
              </div>
              <p class="presenter-vote-progress-title">{{ answersComplete ? 'Everyone has voted.' : `${answersRemaining} ${answersRemaining === 1 ? 'person is' : 'people are'} still deciding.` }}</p>
              <p class="presenter-vote-progress-copy">Vote choices stay hidden until you reveal the answer.</p>
              <div class="presenter-vote-progress-rail" aria-hidden="true">
                <span :style="{ transform: `scaleX(${participantsCount ? (liveState?.answers_count ?? 0) / participantsCount : 0})` }" />
              </div>
            </div>

            <p class="presenter-chart-note">
              {{ session.question_phase === 'revealing' ? 'Answer revealed · use the explanation to discuss the trade-off.' : 'Live progress only · participant identities and choices stay private.' }}
            </p>
          </aside>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.presenter-screen {
  min-height: 100vh;
  min-height: 100svh;
  overflow: auto;
  overflow-x: clip;
  background: #f5f2e8;
  color: #111111;
}

.presenter-stage,
.presenter-centred-state {
  min-height: 100vh;
  min-height: 100svh;
  padding: clamp(1rem, 2.5vw, 2.5rem);
}

.presenter-stage {
  display: grid;
  align-items: stretch;
}

.presenter-centred-state {
  display: grid;
  place-items: center;
}

.presenter-frame {
  display: flex;
  width: min(100%, 100rem);
  min-height: calc(100svh - clamp(2rem, 5vw, 5rem));
  flex-direction: column;
  margin: 0 auto;
}

.presenter-topbar {
  display: flex;
  min-height: 4.5rem;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 2px solid #111111;
  padding: 0.75rem 0;
}

.presenter-eyebrow,
.presenter-kicker {
  margin: 0;
  color: #e8117f;
  font-family: var(--font-mono), monospace;
  font-size: clamp(0.65rem, 1vw, 0.78rem);
  font-weight: var(--font-weight-label);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.presenter-topbar-title {
  margin: 0.3rem 0 0;
  font-size: 1rem;
  font-weight: var(--font-weight-heading);
}

.presenter-room-chip {
  flex: 0 0 auto;
  border: 2px solid #111111;
  border-radius: 6px;
  padding: 0.55rem 0.8rem;
  background: #f5e642;
  box-shadow: 2px 2px 0 #111111;
  font-family: var(--font-mono), monospace;
  font-size: 0.75rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.presenter-lobby-grid {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1.2fr) minmax(22rem, 0.8fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: center;
  padding: clamp(2rem, 5vw, 5rem) 0;
}

.presenter-lobby-copy h1,
.presenter-finish-heading h1,
.presenter-question-panel h1,
.presenter-state-card h1 {
  margin: 0.65rem 0 0;
  color: #111111;
  font-size: clamp(3rem, 7vw, 7rem);
  font-weight: var(--font-weight-display);
  letter-spacing: -0.055em;
  line-height: 0.92;
}

.presenter-lede {
  max-width: 43rem;
  margin: 1.5rem 0 0;
  color: #555555;
  font-size: clamp(1rem, 1.6vw, 1.35rem);
  line-height: 1.6;
}

.presenter-code-card {
  width: min(100%, 42rem);
  margin-top: clamp(2rem, 4vw, 3rem);
  border: 2px solid #111111;
  border-radius: 12px;
  padding: clamp(1.25rem, 3vw, 2rem);
  background: #f5e642;
  box-shadow: 7px 7px 0 #e8117f;
}

.presenter-code-card p {
  margin: 0;
  font-family: var(--font-mono), monospace;
  font-size: 0.75rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.presenter-code-card strong {
  display: block;
  margin-top: 0.5rem;
  font-family: var(--font-mono), monospace;
  font-size: clamp(3.6rem, 8vw, 7rem);
  letter-spacing: 0.12em;
  line-height: 1;
}

.presenter-lobby-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  align-items: center;
  margin-top: 2.5rem;
}

.presenter-joined-count {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
}

.presenter-joined-count strong {
  color: #e8117f;
  font-size: 2.5rem;
  line-height: 1;
}

.presenter-joined-count span {
  color: #555555;
  font-weight: var(--font-weight-emphasis);
}

.presenter-primary-action {
  min-height: 3.5rem;
  padding-inline: 1.5rem;
}

.presenter-qr-card {
  border: 2px solid #111111;
  border-radius: 12px;
  padding: clamp(1.25rem, 3vw, 2rem);
  background: #ffffff;
  box-shadow: 5px 5px 0 #111111;
}

.presenter-qr-heading {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  border-bottom: 1px solid #e0ddd4;
  padding-bottom: 1rem;
}

.presenter-qr-heading span {
  display: grid;
  width: 2.3rem;
  height: 2.3rem;
  place-items: center;
  border-radius: 6px;
  background: #e8117f;
  color: #ffffff;
  font-family: var(--font-mono), monospace;
  font-size: 0.75rem;
  font-weight: var(--font-weight-label);
}

.presenter-qr-heading p {
  margin: 0;
  font-family: var(--font-mono), monospace;
  font-size: 0.78rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.presenter-qr-card img {
  display: block;
  width: min(100%, 22rem);
  margin: 1.5rem auto;
  border: 1rem solid #fefce8;
  border-radius: 8px;
}

.presenter-qr-footnote {
  margin: 0;
  color: #555555;
  font-size: 0.85rem;
  line-height: 1.5;
  text-align: center;
}

.presenter-question-layout {
  display: grid;
  flex: 1;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem);
  grid-template-rows: auto minmax(0, 1fr);
  gap: clamp(0.9rem, 1.6vw, 1.5rem);
  padding-top: clamp(0.9rem, 1.6vw, 1.5rem);
}

.presenter-question-panel,
.presenter-results-panel,
.presenter-state-card,
.presenter-leaderboard,
.presenter-empty-state {
  border: 2px solid #111111;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 4px 4px 0 #111111;
}

.presenter-question-panel {
  display: grid;
  min-width: 0;
  grid-template-rows: auto 10rem auto auto;
  align-content: start;
  gap: clamp(0.8rem, 1.4vw, 1.2rem);
  padding: clamp(1.25rem, 2.25vw, 2rem);
}

.presenter-question-heading h1 {
  margin: 0.55rem 0 0;
  color: #111111;
  max-width: none;
  font-family: var(--font-sans), system-ui, sans-serif;
  font-size: clamp(1.45rem, 2.2vw, 2.75rem);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.presenter-question-heading {
  display: flex;
  grid-column: 1 / -1;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;
  border-bottom: 1px solid #e0ddd4;
  padding-bottom: clamp(0.9rem, 1.4vw, 1.2rem);
}

.presenter-question-prompt {
  min-width: 0;
}

.presenter-timer {
  display: grid;
  flex: 0 0 auto;
  min-width: 6.5rem;
  justify-items: end;
  border: 2px solid #111111;
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  background: #f5e642;
  box-shadow: 2px 2px 0 #111111;
}

.presenter-timer span {
  font-family: var(--font-mono), monospace;
  font-size: 0.62rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.presenter-timer strong {
  margin-top: 0.15rem;
  font-family: var(--font-mono), monospace;
  font-size: 1.8rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.presenter-timer--urgent {
  background: #e8117f;
  color: #ffffff;
}

.presenter-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
  margin: 0;
}

.presenter-option {
  display: grid;
  min-height: 4.25rem;
  grid-template-columns: 2.75rem minmax(0, 1fr);
  align-items: stretch;
  overflow: hidden;
  border: 1px solid #e0ddd4;
  border-radius: 8px;
  background: #fefce8;
  transition:
    background-color 180ms var(--motion-fast),
    border-color 180ms var(--motion-fast),
    transform 180ms var(--motion-smooth);
}

.presenter-option > span {
  display: grid;
  place-items: center;
  border-right: 1px solid #e0ddd4;
  background: #f5e642;
  font-family: var(--font-mono), monospace;
  font-size: 1.1rem;
  font-weight: var(--font-weight-heading);
}

.presenter-option p {
  align-self: center;
  margin: 0;
  padding: 0.75rem 0.85rem;
  font-size: clamp(0.88rem, 1.15vw, 1.05rem);
  font-weight: var(--font-weight-emphasis);
  line-height: 1.45;
}

.presenter-option--correct {
  border-color: #111111;
  background: #f5e642;
  transform: translateY(-2px);
}

.presenter-option--correct > span {
  background: #e8117f;
  color: #ffffff;
}

.presenter-explanation {
  display: block;
  height: 10rem;
  min-height: 10rem;
  max-height: 10rem;
  flex-direction: column;
  margin: 0;
  overflow: auto;
  border: 2px solid #111111;
  border-radius: 8px;
  padding: 1rem 1.1rem;
  background: #fefce8;
  transition:
    background-color 180ms var(--motion-fast),
    border-color 180ms var(--motion-fast);
}

.presenter-explanation--revealed {
  background: #fff8c9;
}

.presenter-explanation > p:last-child {
  margin: 0.65rem 0 0;
  color: #555555;
  font-size: 1rem;
  line-height: 1.6;
}

.presenter-explanation-placeholder {
  color: #8c877d !important;
}

.presenter-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 0;
  padding-top: 0.2rem;
}

.presenter-control-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.presenter-control-actions--solo {
  margin-left: auto;
}

.presenter-starting-note {
  margin: 0;
  color: #5b5b5b;
  font-size: 0.95rem;
  line-height: 1.5;
}

.presenter-skipped-note {
  margin-top: 1rem;
  border: 1px solid var(--color-dc-border, #d7d0c2);
  border-left: 3px solid var(--color-dc-pink, #e8117f);
  background: rgba(255, 255, 255, 0.55);
  padding: 0.875rem 1rem;
  color: #4a463e;
  font-size: 0.875rem;
  line-height: 1.45;
}

.presenter-skipped-note p { margin: 0; }
.presenter-skipped-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.75rem; }
@media (prefers-reduced-motion: reduce) { .presenter-skipped-note { transition: none; } }

.presenter-end-action {
  min-height: 2.75rem;
  border: 0;
  padding: 0.65rem 0.9rem;
  color: #b42318;
  font-family: var(--font-mono), monospace;
  font-size: 0.7rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  transition:
    color 150ms var(--motion-fast),
    opacity 150ms var(--motion-fast),
    transform 100ms var(--motion-fast);
}

.presenter-results-panel {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: clamp(1.15rem, 1.75vw, 1.5rem);
  background: #fefce8;
}

.presenter-results-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #e0ddd4;
  padding-bottom: 1rem;
}

.presenter-results-heading h2 {
  margin: 0.4rem 0 0;
  font-size: 1.2rem;
  font-weight: var(--font-weight-heading);
}

.presenter-answer-count {
  display: grid;
  flex: 0 0 auto;
  justify-items: end;
}

.presenter-answer-count strong {
  color: #e8117f;
  font-size: 2rem;
  line-height: 1;
}

.presenter-answer-count span {
  margin-top: 0.25rem;
  color: #555555;
  font-family: var(--font-mono), monospace;
  font-size: 0.68rem;
  font-weight: var(--font-weight-label);
  text-transform: uppercase;
}

.presenter-chart {
  display: grid;
  min-height: 16.5rem;
  flex: 1;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(0.5rem, 1.2vw, 0.9rem);
  align-items: end;
  padding-top: 1.25rem;
}

.presenter-vote-progress {
  display: grid;
  min-height: 16.5rem;
  flex: 1;
  align-content: center;
  justify-items: center;
  padding: 2rem 1rem;
  text-align: center;
}

.presenter-vote-progress-orbit {
  display: grid;
  width: clamp(6.5rem, 10vw, 8.5rem);
  aspect-ratio: 1;
  place-items: center;
  border: 2px solid #111111;
  border-radius: 50%;
  background: #f5e642;
  box-shadow: 4px 4px 0 #e8117f;
}

.presenter-vote-progress-orbit span {
  font-family: var(--font-mono), monospace;
  font-size: clamp(2.25rem, 4vw, 3.5rem);
  font-weight: var(--font-weight-heading);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.presenter-vote-progress-title {
  margin: 1.5rem 0 0;
  font-size: 1.1rem;
  font-weight: var(--font-weight-heading);
}

.presenter-vote-progress-copy {
  max-width: 19rem;
  margin: 0.45rem 0 0;
  color: #555555;
  font-size: 0.85rem;
  line-height: 1.5;
}

.presenter-vote-progress-rail {
  width: min(100%, 18rem);
  height: 0.6rem;
  margin-top: 1.5rem;
  overflow: hidden;
  border: 1px solid #e0ddd4;
  border-radius: 999px;
  background: #f5f2e8;
}

.presenter-vote-progress-rail span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: #e8117f;
  transform-origin: left;
  transition: transform 220ms var(--motion-smooth);
}

.presenter-chart-column {
  display: grid;
  height: 100%;
  min-width: 0;
  grid-template-rows: auto minmax(9rem, 1fr) auto;
  gap: 0.65rem;
}

.presenter-chart-value {
  min-width: 0;
  text-align: center;
}

.presenter-chart-value strong,
.presenter-chart-value span {
  display: block;
}

.presenter-chart-value strong {
  font-family: var(--font-mono), monospace;
  font-size: clamp(1rem, 1.8vw, 1.35rem);
}

.presenter-chart-value span {
  margin-top: 0.2rem;
  overflow: hidden;
  color: #555555;
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.presenter-chart-track {
  position: relative;
  overflow: hidden;
  border: 1px solid #e0ddd4;
  border-radius: 8px 8px 4px 4px;
  background:
    linear-gradient(to top, rgba(17, 17, 17, 0.055) 1px, transparent 1px),
    #f5f2e8;
  background-size: 100% 25%;
}

.presenter-chart-fill {
  position: absolute;
  inset: 0;
  border-radius: 7px 7px 3px 3px;
  background: #e8117f;
  transform-origin: bottom;
  transition:
    background-color 180ms var(--motion-fast),
    transform 220ms var(--motion-smooth);
}

.presenter-chart-fill--correct {
  background: #f5e642;
  box-shadow: inset 0 0 0 2px #111111;
}

.presenter-chart-label {
  display: grid;
  min-height: 2.75rem;
  place-items: center;
  border: 2px solid #111111;
  border-radius: 6px;
  background: #111111;
  color: #ffffff;
  font-family: var(--font-mono), monospace;
  font-size: 1rem;
  font-weight: var(--font-weight-heading);
}

.presenter-chart-note {
  margin: 1rem 0 0;
  color: #555555;
  font-size: 0.75rem;
  line-height: 1.5;
}

.presenter-finish-heading {
  padding: clamp(2rem, 4vw, 3.5rem) 0 1.75rem;
}

.presenter-finish-heading h1 {
  font-size: clamp(3rem, 6vw, 6rem);
}

.presenter-finish-heading > p:last-child {
  margin: 1rem 0 0;
  color: #555555;
  font-size: 1.1rem;
}

.presenter-score-summary {
  display: grid;
  width: min(100%, 62rem);
  grid-template-columns: minmax(11rem, 0.8fr) minmax(10rem, 0.65fr) minmax(17rem, 1fr);
  gap: 1.25rem;
  align-items: stretch;
  margin: 0 0 1.5rem;
  border: 1px solid #e0ddd4;
  border-left: 4px solid #e8117f;
  padding: 1.15rem 1.25rem;
  background: rgba(255, 255, 255, 0.58);
}

.presenter-score-summary-intro p:last-child {
  margin: 0;
  color: #555555;
  font-size: 0.9rem;
  line-height: 1.5;
}

.presenter-score-summary-intro .presenter-eyebrow {
  margin-bottom: 0.35rem;
}

.presenter-score-rule {
  display: grid;
  align-content: start;
  gap: 0.18rem;
  border-left: 1px solid #e0ddd4;
  padding-left: 1.25rem;
}

.presenter-score-rule > span {
  color: #6b655c;
  font-family: var(--font-mono), monospace;
  font-size: 0.65rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.presenter-score-rule strong {
  color: #111111;
  font-family: var(--font-sans), system-ui, sans-serif;
  font-size: 1.5rem;
  font-weight: var(--font-weight-heading);
  letter-spacing: -0.03em;
  line-height: 1.1;
}

.presenter-score-rule p {
  margin: 0;
  color: #6b655c;
  font-size: 0.76rem;
  line-height: 1.4;
}

.presenter-streak-scale {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.3rem;
}

.presenter-streak-scale span {
  border: 1px solid #e0ddd4;
  border-radius: 999px;
  padding: 0.28rem 0.48rem;
  background: #fefce8;
  color: #555555;
  font-family: var(--font-mono), monospace;
  font-size: 0.68rem;
  white-space: nowrap;
}

.presenter-streak-scale b {
  color: #111111;
}

.presenter-leaderboard {
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.presenter-leaderboard-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-gutter: stable;
}

.presenter-leaderboard-scroll:focus-visible {
  outline: 3px solid #e8117f;
  outline-offset: 3px;
}

.presenter-leaderboard-table {
  min-width: 44rem;
}

.presenter-leaderboard-row {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) minmax(7rem, auto) minmax(7rem, auto);
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid #e0ddd4;
  padding: 0.85rem 1.25rem;
}

.presenter-leaderboard-header {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) minmax(7rem, auto) minmax(7rem, auto);
  gap: 1rem;
  border-bottom: 1px solid #e0ddd4;
  padding: 0.7rem 1.25rem;
  color: #555555;
  font-family: var(--font-mono), monospace;
  font-size: 0.62rem;
  font-weight: var(--font-weight-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.presenter-leaderboard-header span:nth-child(n + 3),
.presenter-correct-count,
.presenter-score { text-align: right; }

.presenter-correct-count {
  color: #555555;
  font-family: var(--font-mono), monospace;
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.presenter-leaderboard-row:last-child {
  border-bottom: 0;
}

.presenter-leaderboard-row--podium {
  background: #fefce8;
}

.presenter-rank,
.presenter-score {
  font-family: var(--font-mono), monospace;
  font-weight: var(--font-weight-heading);
}

.presenter-rank {
  color: #e8117f;
  font-size: 1.4rem;
}

.presenter-medal {
  display: inline-grid;
  min-width: 2rem;
  min-height: 2rem;
  place-items: center;
  border-radius: 999px;
  font-size: 1.55rem;
  line-height: 1;
}

.presenter-medal--gold { background: #fff4a3; }
.presenter-medal--silver { background: #eef0f2; }
.presenter-medal--bronze { background: #f7d4be; }

.presenter-rank--unscored {
  color: #a29b90;
}

.presenter-player {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 1rem;
}

.presenter-player span {
  overflow: hidden;
  font-size: 1.25rem;
  font-weight: var(--font-weight-heading);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.presenter-score {
  color: #555555;
}

.presenter-empty-state {
  margin: 2rem 0 0;
  padding: 3rem;
  color: #555555;
  text-align: center;
}

.presenter-state-card {
  width: min(100%, 38rem);
  padding: clamp(2rem, 5vw, 4rem);
  text-align: center;
}

.presenter-state-card h1 {
  font-size: clamp(2.5rem, 6vw, 4rem);
  line-height: 1;
}

.presenter-state-card > p:last-child {
  margin: 1.25rem 0 0;
  color: #555555;
  line-height: 1.6;
}

.presenter-error {
  width: fit-content;
  margin: 1rem 0 0;
  border: 1px solid #f3b0aa;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  background: #fff1f0;
  color: #9f1b12;
  font-size: 0.85rem;
  font-weight: var(--font-weight-label);
}

@media (hover: hover) and (pointer: fine) {
  .presenter-end-action:hover {
    color: #e8117f;
  }
}

@media (max-width: 960px) {
  .presenter-lobby-grid,
  .presenter-question-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .presenter-qr-card {
    width: min(100%, 34rem);
    margin-inline: auto;
  }

  .presenter-results-panel {
    min-height: 20rem;
  }
}

@media (max-width: 640px) {
  .presenter-controls {
    align-items: flex-start;
    flex-direction: column;
  }

  .presenter-control-actions,
  .presenter-control-actions--solo {
    margin-left: 0;
  }
}

@media (max-width: 640px) {
  .presenter-stage,
  .presenter-centred-state {
    padding: 0.8rem;
  }

  .presenter-topbar {
    align-items: flex-start;
  }

  .presenter-room-chip {
    font-size: 0.62rem;
  }

  .presenter-options {
    grid-template-columns: minmax(0, 1fr);
  }

  .presenter-question-heading {
    display: block;
  }

  .presenter-timer {
    width: fit-content;
    margin-top: 1rem;
    justify-items: start;
  }

  .presenter-score-summary {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .presenter-score-rule {
    border-top: 1px solid #e0ddd4;
    border-left: 0;
    padding: 0.75rem 0 0;
  }

  .presenter-leaderboard-table { min-width: 40rem; }
}

@media (prefers-reduced-motion: reduce) {
  .presenter-option,
  .presenter-chart-fill,
  .presenter-vote-progress-rail span,
  .presenter-explanation,
  .presenter-end-action {
    transition: none;
  }
}
</style>
