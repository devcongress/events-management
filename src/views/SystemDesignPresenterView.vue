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
let pollInFlight = false;

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
const answerDistribution = computed(() => Array.from({ length: 4 }, (_, optionIndex) => (
  liveState.value?.answer_distribution?.find((result) => result.option_index === optionIndex) ?? {
    option_index: optionIndex,
    count: 0,
    percentage: 0,
  }
)));

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
                {{ actionPending ? 'Starting...' : 'Start first question' }}
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

        <div v-if="liveState?.leaderboard.length" class="presenter-leaderboard">
          <div v-for="entry in liveState.leaderboard" :key="entry.user_id" class="presenter-leaderboard-row" :class="{ 'presenter-leaderboard-row--podium': entry.rank <= 3 }">
            <span class="presenter-rank">#{{ entry.rank }}</span>
            <div class="presenter-player">
              <NaviiAvatar :seed="entry.avatar_seed ?? entry.user_id" :title="`${entry.nickname} avatar`" :size="entry.rank <= 3 ? 56 : 46" />
              <span>{{ entry.nickname }}</span>
            </div>
            <span class="presenter-score">{{ entry.total_score }} pts</span>
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
          <article class="presenter-question-panel">
            <div>
              <p class="presenter-kicker">Think through the trade-off</p>
              <h1>{{ currentQuestion?.question_text ?? 'Preparing the next question' }}</h1>
            </div>

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

            <div v-if="session.question_phase === 'revealing'" class="presenter-explanation">
              <p class="presenter-eyebrow">Why this answer</p>
              <p>{{ currentQuestion?.explanation }}</p>
            </div>

            <footer class="presenter-controls">
              <button v-if="session.question_phase === 'answering'" type="button" class="editorial-secondary-action motion-press" :disabled="actionPending" @click="revealAnswer">{{ actionPending ? 'Revealing...' : 'Reveal answer' }}</button>
              <button v-else-if="!allQuestionsReleased" type="button" class="editorial-action motion-press" :disabled="actionPending" @click="releaseQuestion">{{ actionPending ? 'Releasing...' : 'Release next question' }}</button>
              <button v-else type="button" class="editorial-action motion-press" :disabled="actionPending" @click="finishRoom">Finish room</button>
              <button v-if="!allQuestionsReleased" type="button" class="presenter-end-action motion-press" :disabled="actionPending" @click="finishRoom">End room</button>
            </footer>
            <p v-if="error" class="presenter-error">{{ error }}</p>
          </article>

          <aside class="presenter-results-panel">
            <div class="presenter-results-heading">
              <div>
                <p class="presenter-eyebrow">Room response</p>
                <h2>How people answered</h2>
              </div>
              <div class="presenter-answer-count">
                <strong>{{ liveState?.answers_count ?? 0 }}</strong>
                <span>of {{ participantsCount }}</span>
              </div>
            </div>

            <div class="presenter-chart" role="img" :aria-label="`Vertical bar chart of ${liveState?.answers_count ?? 0} answers from ${participantsCount} participants`">
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

            <p class="presenter-chart-note">
              {{ session.question_phase === 'revealing' ? 'Answer revealed · use the explanation to discuss the trade-off.' : 'Live aggregate only · participant identities stay private.' }}
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
  width: min(100%, 90rem);
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
  grid-template-columns: minmax(0, 1.55fr) minmax(24rem, 0.75fr);
  gap: clamp(1rem, 2vw, 1.75rem);
  padding-top: clamp(1rem, 2vw, 1.75rem);
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
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: clamp(1.5rem, 3vw, 2.5rem);
}

.presenter-question-panel h1 {
  max-width: 26ch;
  font-size: clamp(1.8rem, 3vw, 3.5rem);
  font-weight: var(--font-weight-emphasis);
  letter-spacing: -0.035em;
  line-height: 1.12;
}

.presenter-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  margin-top: clamp(1.5rem, 3vw, 2.5rem);
}

.presenter-option {
  display: grid;
  min-height: 5rem;
  grid-template-columns: 3rem minmax(0, 1fr);
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
  padding: 1rem;
  font-size: clamp(0.95rem, 1.3vw, 1.15rem);
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
  margin-top: 1rem;
  border: 2px solid #111111;
  border-radius: 8px;
  padding: 1.1rem 1.25rem;
  background: #fefce8;
}

.presenter-explanation > p:last-child {
  margin: 0.65rem 0 0;
  color: #555555;
  font-size: 1rem;
  line-height: 1.6;
}

.presenter-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: auto;
  padding-top: 1.5rem;
}

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
  padding: clamp(1.25rem, 2vw, 1.75rem);
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
  min-height: 22rem;
  flex: 1;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(0.5rem, 1.2vw, 0.9rem);
  align-items: end;
  padding-top: 1.25rem;
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

.presenter-leaderboard {
  overflow: hidden;
}

.presenter-leaderboard-row {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  border-bottom: 1px solid #e0ddd4;
  padding: 0.85rem 1.25rem;
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
    min-height: 34rem;
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

  .presenter-leaderboard-row {
    grid-template-columns: 3rem minmax(0, 1fr);
  }

  .presenter-score {
    grid-column: 2;
  }
}

@media (prefers-reduced-motion: reduce) {
  .presenter-option,
  .presenter-chart-fill,
  .presenter-end-action {
    transition: none;
  }
}
</style>
