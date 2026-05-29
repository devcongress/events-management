<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';

interface LeaderboardEntry {
  rank: number;
  nickname: string;
  total_score: number;
  events_participated?: number;
  is_claimed?: boolean;
  user_id?: string;
  device_id?: string | null;
}

const leaderboard = ref<LeaderboardEntry[]>([]);
const loading = ref(true);
const claiming = ref(false);
const merging = ref(false);
const accountMessage = ref<string | null>(null);
const accountError = ref<string | null>(null);

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

const topThree = computed(() => leaderboard.value.slice(0, 3));

async function fetchData() {
  const response = await fetch('/api/leaderboard?type=all-time');
  if (response.ok) {
    leaderboard.value = await response.json();
  }
  loading.value = false;
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
  if (rank === 1) return 'Champion';
  if (rank === 2) return 'Runner-up';
  if (rank === 3) return 'Third place';
  return `#${rank}`;
}

onMounted(fetchData);
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <div class="editorial-header">
        <p class="editorial-eyebrow">rankings</p>
        <h1 class="editorial-title">All-Time Leaderboard</h1>
        <p class="editorial-subtitle">Top players across all quiz sessions, with prototype tools for claiming and merging profiles.</p>
      </div>

      <div v-if="loading" class="flex min-h-[40vh] items-center justify-center">
        <div class="text-center">
          <div class="mb-4 inline-block size-16 animate-spin rounded-full border-4 border-dc-yellow border-t-transparent" />
          <p class="text-lg text-white">Loading...</p>
        </div>
      </div>

      <template v-else>
        <div v-if="topThree.length === 3" class="mb-12">
          <div class="mx-auto grid max-w-4xl grid-cols-3 items-end gap-4">
            <div class="border-2 border-dc-gray-light bg-dc-dark-1 p-6 text-center h-64 flex flex-col justify-end">
              <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-dc-gray">2nd Place</div>
              <div class="mb-2 truncate text-lg font-bold text-white">{{ topThree[1]?.nickname }}</div>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-3xl font-black text-white">{{ topThree[1]?.total_score }}</span>
                <span class="text-xs uppercase text-dc-gray">pts</span>
              </div>
            </div>

            <div class="flex h-80 flex-col justify-end border-4 border-dc-yellow-glow bg-dc-yellow p-6 text-center shadow-glow-lg">
              <div class="mb-2 text-xs font-bold uppercase tracking-wider text-dc-dark">Champion</div>
              <div class="mb-2 truncate text-2xl font-black text-dc-dark">{{ topThree[0]?.nickname }}</div>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-5xl font-black text-dc-dark">{{ topThree[0]?.total_score }}</span>
                <span class="text-sm uppercase text-dc-dark">pts</span>
              </div>
            </div>

            <div class="flex h-56 flex-col justify-end border-2 border-dc-gray bg-dc-dark-1 p-6 text-center">
              <div class="mb-2 text-xs font-semibold uppercase tracking-wider text-dc-gray">3rd Place</div>
              <div class="mb-2 truncate text-lg font-bold text-white">{{ topThree[2]?.nickname }}</div>
              <div class="flex items-baseline justify-center gap-1">
                <span class="text-3xl font-black text-white">{{ topThree[2]?.total_score }}</span>
                <span class="text-xs uppercase text-dc-gray">pts</span>
              </div>
            </div>
          </div>
        </div>

        <div class="editorial-panel">
          <div class="grid grid-cols-12 gap-4 border-b border-dc-yellow/10 bg-dc-dark-2/60 px-6 py-4">
            <div class="col-span-2 text-xs font-bold uppercase tracking-wider text-dc-yellow">Rank</div>
            <div class="col-span-6 text-xs font-bold uppercase tracking-wider text-dc-yellow">Player</div>
            <div class="col-span-4 text-right text-xs font-bold uppercase tracking-wider text-dc-yellow">Score</div>
          </div>

          <div class="divide-y-2 divide-dc-dark-3">
            <div
              v-for="entry in leaderboard"
              :key="entry.rank"
              class="grid grid-cols-12 gap-4 px-6 py-4 transition-colors"
              :class="entry.rank <= 3 ? 'bg-dc-yellow/5 hover:bg-dc-yellow/10' : 'hover:bg-dc-dark-2'"
            >
              <div class="col-span-2 flex items-center gap-2">
                <span class="text-2xl font-bold" :class="entry.rank <= 3 ? 'text-dc-yellow' : 'text-dc-gray'">
                  {{ rankLabel(entry.rank) }}
                </span>
              </div>

              <div class="col-span-6 flex flex-col justify-center">
                <div class="text-lg font-bold" :class="entry.rank <= 3 ? 'text-dc-yellow' : 'text-white'">
                  {{ entry.nickname }}
                </div>
                <div v-if="entry.user_id" class="mt-1 font-mono text-xs text-dc-gray">
                  ID: {{ entry.user_id }}
                </div>
                <div v-if="entry.events_participated" class="mt-1 text-sm text-dc-gray">
                  {{ entry.events_participated }} {{ entry.events_participated === 1 ? 'event' : 'events' }}
                </div>
              </div>

              <div class="col-span-4 flex items-center justify-end gap-2">
                <span class="text-3xl font-black" :class="entry.rank <= 3 ? 'text-dc-yellow' : 'text-white'">
                  {{ entry.total_score }}
                </span>
                <span class="text-xs uppercase text-dc-gray">pts</span>
              </div>
            </div>
          </div>

          <div v-if="leaderboard.length === 0" class="py-16 text-center">
            <p class="text-lg text-dc-gray">No scores yet. Be the first.</p>
          </div>
        </div>

        <div class="editorial-panel mt-10 p-6">
          <h2 class="mb-2 text-2xl font-black text-white">Account Tools (Prototype)</h2>
          <p class="mb-6 text-dc-gray">Claim a leaderboard profile, then merge duplicate profiles into one account.</p>

          <div v-if="accountMessage" class="mb-4 border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-200">
            {{ accountMessage }}
          </div>
          <div v-if="accountError" class="mb-4 border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {{ accountError }}
          </div>

          <div class="grid gap-6 lg:grid-cols-2">
            <form class="space-y-3" @submit.prevent="submitClaim">
              <h3 class="text-lg font-bold text-dc-yellow">Claim Profile</h3>
              <input v-model="claimForm.userId" class="editorial-input" placeholder="User ID" required />
              <input v-model="claimForm.deviceId" class="editorial-input" placeholder="Device ID" required />
              <input v-model="claimForm.username" class="editorial-input" placeholder="Username" required />
              <input v-model="claimForm.email" class="editorial-input" placeholder="Email (optional)" />
              <input v-model="claimForm.secretQuestion" class="editorial-input" placeholder="Secret Question" required />
              <input v-model="claimForm.secretAnswer" class="editorial-input" placeholder="Secret Answer" type="password" required />
              <button type="submit" :disabled="claiming" class="editorial-action disabled:opacity-60">
                {{ claiming ? 'Claiming...' : 'Claim Profile' }}
              </button>
            </form>

            <form class="space-y-3" @submit.prevent="submitMerge">
              <h3 class="text-lg font-bold text-dc-yellow">Merge Duplicate</h3>
              <input v-model="mergeForm.targetUserId" class="editorial-input" placeholder="Target Claimed User ID" required />
              <input v-model="mergeForm.sourceUserId" class="editorial-input" placeholder="Source Duplicate User ID" required />
              <input v-model="mergeForm.secretAnswer" class="editorial-input" placeholder="Target Secret Answer" type="password" required />
              <button type="submit" :disabled="merging" class="editorial-action disabled:opacity-60">
                {{ merging ? 'Merging...' : 'Merge Profiles' }}
              </button>
            </form>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
