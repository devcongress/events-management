<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import CommunityMasthead from '@/src/components/CommunityMasthead.vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import LeaderboardPageSkeleton from '@/src/components/ui/page-skeletons/LeaderboardPageSkeleton.vue';

interface LeaderboardEntry {
  rank: number;
  nickname: string;
  total_score: number;
  events_participated?: number;
  is_claimed?: boolean;
  user_id?: string;
  device_id?: string | null;
}

type LeaderboardMode = 'all-time' | 'monthly';

const leaderboards = reactive<Record<LeaderboardMode, LeaderboardEntry[]>>({
  'all-time': [],
  monthly: [],
});
const loading = ref(true);
const claiming = ref(false);
const merging = ref(false);
const accountMessage = ref<string | null>(null);
const accountError = ref<string | null>(null);
const leaderboardMode = ref<LeaderboardMode>('all-time');
const phaseOneLeaderboardEnabled = false;
const page = ref(1);
const pageSize = 8;
const leaderboardPanel = ref<HTMLElement | null>(null);
const keepModeSwitcherSticky = ref(true);

const claimForm = reactive({
  userId: '',
  deviceId: '',
  username: '',
  email: '',
  secretQuestion: '',
  secretAnswer: '',
});

const mergeForm = reactive({
  targetUserId: '',
  sourceUserId: '',
  secretAnswer: '',
});

const title = computed(() => leaderboardMode.value === 'monthly' ? 'This Month' : 'All-Time Leaderboard');
const visibleLeaderboard = computed(() => phaseOneLeaderboardEnabled ? leaderboards[leaderboardMode.value] : []);
const showAccountTools = computed(() => {
  return phaseOneLeaderboardEnabled && leaderboards['all-time'].length > 0 && leaderboards.monthly.length > 0;
});
const pageCount = computed(() => Math.max(1, Math.ceil(visibleLeaderboard.value.length / pageSize)));
const paginatedLeaderboard = computed(() => visibleLeaderboard.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const pageStart = computed(() => (visibleLeaderboard.value.length === 0 ? 0 : (page.value - 1) * pageSize + 1));
const pageEnd = computed(() => Math.min(visibleLeaderboard.value.length, page.value * pageSize));
const topScore = computed(() => visibleLeaderboard.value[0]?.total_score ?? 0);

function naviiSeed(entry: LeaderboardEntry): string {
  return entry.user_id || entry.device_id || `${entry.nickname}-${entry.rank}`;
}

async function fetchData() {
  loading.value = true;
  if (!phaseOneLeaderboardEnabled) {
    leaderboards['all-time'] = [];
    leaderboards.monthly = [];
    loading.value = false;
    requestAnimationFrame(updateModeSwitcherScope);
    return;
  }

  const [allTimeLeaderboard, monthlyLeaderboard] = await Promise.all([
    fetchLeaderboard('all-time'),
    fetchLeaderboard('monthly'),
  ]);
  leaderboards['all-time'] = allTimeLeaderboard;
  leaderboards.monthly = monthlyLeaderboard;
  page.value = Math.min(page.value, pageCount.value);
  loading.value = false;
  requestAnimationFrame(updateModeSwitcherScope);
}

async function fetchLeaderboard(mode: LeaderboardMode): Promise<LeaderboardEntry[]> {
  const response = await fetch(`/api/leaderboard?type=${mode}`);
  if (!response.ok) return [];
  return response.json();
}

async function setMode(mode: LeaderboardMode) {
  leaderboardMode.value = mode;
  page.value = 1;
  await fetchData();
}

function goToPage(nextPage: number) {
  page.value = Math.min(pageCount.value, Math.max(1, nextPage));
  requestAnimationFrame(updateModeSwitcherScope);
}

function updateModeSwitcherScope() {
  const panel = leaderboardPanel.value;
  const scrollArea = document.querySelector('main');
  if (!panel || !scrollArea) {
    keepModeSwitcherSticky.value = true;
    return;
  }

  const panelRect = panel.getBoundingClientRect();
  const scrollRect = scrollArea.getBoundingClientRect();
  keepModeSwitcherSticky.value = panelRect.bottom > scrollRect.top + 160;
}

async function submitClaim() {
  claiming.value = true;
  accountError.value = null;
  accountMessage.value = null;

  try {
    const response = await fetch('/api/users/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: claimForm.userId,
        device_id: claimForm.deviceId,
        username: claimForm.username,
        email: claimForm.email || null,
        secret_question: claimForm.secretQuestion,
        secret_answer: claimForm.secretAnswer,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      accountError.value = data.error || 'Failed to claim profile';
      return;
    }

    accountMessage.value = `Claimed ${data.username} successfully.`;
    Object.assign(claimForm, { userId: '', deviceId: '', username: '', email: '', secretQuestion: '', secretAnswer: '' });
    await fetchData();
  } catch {
    accountError.value = 'Failed to claim profile';
  } finally {
    claiming.value = false;
  }
}

async function submitMerge() {
  merging.value = true;
  accountError.value = null;
  accountMessage.value = null;

  try {
    const response = await fetch('/api/users/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target_user_id: mergeForm.targetUserId,
        source_user_id: mergeForm.sourceUserId,
        secret_answer: mergeForm.secretAnswer,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      accountError.value = data.error || 'Failed to merge profiles';
      return;
    }

    accountMessage.value = `Merged account ${data.source_user_id} into ${data.merged_into_user_id}.`;
    Object.assign(mergeForm, { targetUserId: '', sourceUserId: '', secretAnswer: '' });
    await fetchData();
  } catch {
    accountError.value = 'Failed to merge profiles';
  } finally {
    merging.value = false;
  }
}

function rankLabel(rank: number): string {
  if (rank === 1) return '01';
  if (rank === 2) return '02';
  if (rank === 3) return '03';
  return `#${rank}`;
}

onMounted(async () => {
  await fetchData();
  const scrollArea = document.querySelector('main');
  scrollArea?.addEventListener('scroll', updateModeSwitcherScope, { passive: true });
  window.addEventListener('resize', updateModeSwitcherScope);
  updateModeSwitcherScope();
});

onUnmounted(() => {
  const scrollArea = document.querySelector('main');
  scrollArea?.removeEventListener('scroll', updateModeSwitcherScope);
  window.removeEventListener('resize', updateModeSwitcherScope);
});
</script>

<template>
  <div class="editorial-page leaderboard-page">
    <div class="leaderboard-wrap editorial-wrap">
      <CommunityMasthead
        eyebrow="rankings"
        title="Leaderboard"
        description="Rankings are paused while the live quiz work is re-scoped for a low-cost community launch."
        ribbon="Coming soon"
      />

      <section class="coming-soon-muted">
        <div
          v-if="visibleLeaderboard.length > 0"
          class="z-30 mb-8 border-b-2 border-dc-ink bg-dc-cream/95 py-4 backdrop-blur"
          :class="keepModeSwitcherSticky ? 'sticky top-0' : 'relative'"
        >
          <div class="flex flex-wrap gap-3">
            <button
              class="motion-press rounded-md border-2 px-5 py-3 font-mono text-sm font-bold uppercase tracking-wide"
              :class="leaderboardMode === 'all-time' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-ink bg-dc-paper text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink'"
              disabled
              @click="setMode('all-time')"
            >
              All Time
            </button>
            <button
              class="motion-press rounded-md border-2 px-5 py-3 font-mono text-sm font-bold uppercase tracking-wide"
              :class="leaderboardMode === 'monthly' ? 'border-dc-ink bg-dc-yellow text-dc-ink shadow-[2px_2px_0_#111111]' : 'border-dc-ink bg-dc-paper text-dc-gray hover:bg-dc-paper-warm hover:text-dc-ink'"
              disabled
              @click="setMode('monthly')"
            >
              This Month
            </button>
          </div>
        </div>

        <LeaderboardPageSkeleton v-if="loading" />

        <template v-else>
          <div ref="leaderboardPanel" class="editorial-panel">
          <div class="grid grid-cols-12 gap-4 border-b-2 border-dc-ink bg-dc-yellow px-6 py-4">
            <div class="col-span-2 text-xs font-bold uppercase tracking-wider text-dc-ink">Rank</div>
            <div class="col-span-6 text-xs font-bold uppercase tracking-wider text-dc-ink">Player</div>
            <div class="col-span-4 text-right text-xs font-bold uppercase tracking-wider text-dc-ink">Score</div>
          </div>

          <div class="divide-y-2 divide-dc-border">
            <div
            v-for="entry in paginatedLeaderboard"
              :key="entry.rank"
              class="motion-colors grid grid-cols-12 gap-4 px-6 py-4"
              :class="entry.rank <= 3 ? 'bg-dc-paper-warm hover:bg-dc-yellow/30' : 'hover:bg-dc-paper-warm'"
            >
              <div class="col-span-2 flex items-center gap-2">
                <span class="font-mono text-2xl font-bold" :class="entry.rank <= 3 ? 'text-3xl text-dc-pink' : 'text-dc-gray'">
                  {{ rankLabel(entry.rank) }}
                </span>
              </div>

              <div class="col-span-6 flex min-w-0 items-center gap-4">
                <NaviiAvatar :seed="naviiSeed(entry)" :title="`${entry.nickname} avatar`" :size="48" />
                <div class="min-w-0">
                  <div class="truncate text-lg font-bold" :class="entry.rank <= 3 ? 'text-dc-ink' : 'text-dc-ink'">
                    {{ entry.nickname }}
                    <span v-if="entry.is_claimed" class="ml-2 align-middle font-mono text-xs font-bold uppercase tracking-wide text-green-700">claimed</span>
                  </div>
                  <div v-if="entry.events_participated" class="mt-1 text-sm text-dc-gray">
                    {{ entry.events_participated }} {{ entry.events_participated === 1 ? 'event' : 'events' }}
                  </div>
                </div>
              </div>

              <div class="col-span-4 flex items-center justify-end gap-2">
                <span class="text-3xl font-black" :class="entry.rank <= 3 ? 'text-dc-pink' : 'text-dc-ink'">
                  {{ entry.total_score }}
                </span>
                <span class="text-xs uppercase text-dc-gray">pts</span>
              </div>
            </div>
          </div>

          <div v-if="visibleLeaderboard.length === 0" class="leaderboard-empty-state py-16 text-center">
            <p class="text-lg font-semibold text-dc-gray">No scores yet.</p>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-dc-gray">The leaderboard will open when live quiz scoring is ready for community events.</p>
          </div>

          <div v-else class="pagination-footer border-t-2 border-dc-ink bg-dc-paper-warm">
            <p class="pagination-summary">
              Showing {{ pageStart }}-{{ pageEnd }} of {{ visibleLeaderboard.length }}
            </p>
            <div class="pagination-controls">
              <button
                class="pagination-button"
                :disabled="page === 1"
                @click="goToPage(page - 1)"
              >
                <span aria-hidden="true">‹</span>
                Prev
              </button>
              <span class="pagination-count" aria-live="polite">
                Page {{ page }} of {{ pageCount }}
              </span>
              <button
                class="pagination-button"
                :disabled="page === pageCount"
                @click="goToPage(page + 1)"
              >
                Next
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
          </div>
        </template>
      </section>

        <div v-if="showAccountTools" class="editorial-panel mt-10 p-6 opacity-60">
          <h2 class="mb-2 text-2xl font-black text-dc-ink">Account Tools (Prototype)</h2>
          <p class="mb-6 text-dc-gray">Coming soon with the leaderboard. Profile claiming stays paused for the low-cost launch phase.</p>

          <div v-if="accountMessage" class="mb-4 border border-green-700/50 bg-green-100 px-4 py-3 text-sm text-green-800">
            {{ accountMessage }}
          </div>
          <div v-if="accountError" class="mb-4 border border-red-700/50 bg-red-100 px-4 py-3 text-sm text-red-800">
            {{ accountError }}
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
            <form class="space-y-3" @submit.prevent="submitClaim">
              <h3 class="text-lg font-bold text-dc-pink">Claim Profile</h3>
              <input v-model="claimForm.userId" class="editorial-input" placeholder="User ID" required />
              <input v-model="claimForm.deviceId" class="editorial-input" placeholder="Device ID" required />
              <input v-model="claimForm.username" class="editorial-input" placeholder="Username" required />
              <input v-model="claimForm.email" class="editorial-input" placeholder="Email (optional)" />
              <input v-model="claimForm.secretQuestion" class="editorial-input" placeholder="Secret Question" required />
              <input v-model="claimForm.secretAnswer" class="editorial-input" placeholder="Secret Answer" type="password" required />
              <button type="submit" disabled class="editorial-action disabled:cursor-not-allowed disabled:opacity-60">
                {{ claiming ? 'Claiming...' : 'Claim Profile' }}
              </button>
            </form>

            <form class="space-y-3" @submit.prevent="submitMerge">
              <h3 class="text-lg font-bold text-dc-pink">Merge Duplicate</h3>
              <input v-model="mergeForm.targetUserId" class="editorial-input" placeholder="Target Claimed User ID" required />
              <input v-model="mergeForm.sourceUserId" class="editorial-input" placeholder="Source Duplicate User ID" required />
              <input v-model="mergeForm.secretAnswer" class="editorial-input" placeholder="Target Secret Answer" type="password" required />
              <button type="submit" disabled class="editorial-action disabled:cursor-not-allowed disabled:opacity-60">
                {{ merging ? 'Merging...' : 'Merge Profiles' }}
              </button>
            </form>
          </div>
        </div>
    </div>
  </div>
</template>
