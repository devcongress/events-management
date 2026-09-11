<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import VolunteerApplicationSheet from '@/src/components/VolunteerApplicationSheet.vue';
import AppCopyButton from '@/src/components/ui/AppCopyButton.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import VolunteerContactValue from '@/src/components/VolunteerContactValue.vue';
import { xProfile } from '@/src/lib/x-profile';
import {
  VOLUNTEER_PUBLIC_PATH,
  annualConferencePath,
} from '@/src/annual-conference';
import {
  fetchAnnualConferenceVolunteerTeam,
  fetchAnnualConferenceWorkPlan,
  fetchAdminSession,
  fetchVolunteerApplications,
  ensureAdminShortLink,
  queryKeys,
} from '@/src/lib/api';
import { copyTextToClipboard } from '@/src/lib/clipboard';
import { notify } from '@/src/lib/notify';
import { adminPath } from '@/src/admin-routes';
import {
  buildVolunteerDirectoryRows,
  filterVolunteerDirectory,
  volunteerDirectoryActions,
  volunteerDirectoryAssignments,
  type VolunteerDirectoryRow,
  type VolunteerDirectoryStatusFilter,
} from '@/src/lib/volunteer-directory';
import { hasAnnualConferenceCapability } from '@/lib/annual-conference-capabilities';

const route = useRoute();
const year = computed(() => String(route.params.year));
const sessionQuery = useQuery({ queryKey: queryKeys.adminSession, queryFn: fetchAdminSession });
const workPlanQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
});
const capabilities = computed(() => workPlanQuery.data.value?.permissions.capabilities ?? []);
const canViewTeam = computed(() => hasAnnualConferenceCapability(capabilities.value, 'volunteers.view_team'));
const canShareIntake = computed(() => hasAnnualConferenceCapability(capabilities.value, 'volunteers.share_intake'));
const canReviewApplications = computed(() => hasAnnualConferenceCapability(capabilities.value, 'volunteers.review_applications'));
const teamQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceVolunteerTeam(year.value)),
  queryFn: () => fetchAnnualConferenceVolunteerTeam(year.value),
  enabled: canViewTeam,
});
const volunteerQuery = useQuery({
  queryKey: computed(() => queryKeys.volunteerApplications(year.value)),
  queryFn: () => fetchVolunteerApplications(year.value),
  enabled: computed(() => canReviewApplications.value && year.value === '2026'),
});
const applications = computed(() => volunteerQuery.data.value?.applications ?? []);
const team = computed(() => teamQuery.data.value?.members ?? []);
const volunteerRows = computed(() => buildVolunteerDirectoryRows(
  canReviewApplications.value ? applications.value : [],
  canViewTeam.value ? team.value : [],
));
const activeVolunteerCount = computed(() => volunteerRows.value.filter((row) => row.status === 'active').length);
const applicantCount = computed(() => volunteerRows.value.filter((row) => row.status === 'applicant').length);
const volunteerSearch = ref('');
const volunteerStatusFilter = ref<VolunteerDirectoryStatusFilter>('all');
const filteredVolunteerRows = computed(() => filterVolunteerDirectory(volunteerRows.value, {
  search: volunteerSearch.value,
  status: volunteerStatusFilter.value,
}));
const hasVolunteerFilters = computed(() => volunteerSearch.value.trim().length > 0 || volunteerStatusFilter.value !== 'all');
const volunteerPage = ref(1);
const volunteersPerPage = 10;
const volunteerPageCount = computed(() => Math.max(1, Math.ceil(filteredVolunteerRows.value.length / volunteersPerPage)));
const volunteerPageStart = computed(() => (volunteerPage.value - 1) * volunteersPerPage);
const volunteerPageEnd = computed(() => Math.min(filteredVolunteerRows.value.length, volunteerPageStart.value + volunteersPerPage));
const paginatedVolunteers = computed(() => filteredVolunteerRows.value.slice(volunteerPageStart.value, volunteerPageEnd.value));
const selectedVolunteer = ref<VolunteerDirectoryRow | null>(null);
const selectedVolunteerTasks = computed(() => volunteerDirectoryAssignments(
  selectedVolunteer.value,
  workPlanQuery.data.value?.tasks ?? [],
));
const selectedVolunteerActions = computed(() => volunteerDirectoryActions(selectedVolunteer.value, {
  role: sessionQuery.data.value?.user?.role ?? null,
  year: year.value,
  canViewAllTasks: workPlanQuery.data.value?.permissions.access_scope === 'all',
  canAssignTasks: workPlanQuery.data.value?.permissions.can_edit_all_tasks === true,
  workPlanPath: annualConferencePath('work-plan', year.value),
  accessPath: adminPath('organizers'),
}));

watch(year, () => {
  volunteerSearch.value = '';
  volunteerStatusFilter.value = 'all';
  volunteerPage.value = 1;
  selectedVolunteer.value = null;
});
watch([volunteerSearch, volunteerStatusFilter], () => { volunteerPage.value = 1; });
watch(volunteerPageCount, (pageCount) => {
  volunteerPage.value = Math.min(volunteerPage.value, pageCount);
});

const volunteerDirectoryLoading = computed(() => (
  (canViewTeam.value && teamQuery.isPending.value)
  || (canReviewApplications.value && volunteerQuery.isPending.value)
));
const volunteerDirectoryError = computed(() => (
  (canViewTeam.value && teamQuery.isError.value)
  || (canReviewApplications.value && volunteerQuery.isError.value)
));
const publicUrl = `${window.location.origin}${VOLUNTEER_PUBLIC_PATH}`;
const shortLinkUrl = ref<string | null>(null);
const copyState = ref<'idle' | 'copying' | 'copied'>('idle');
let copyResetTimer: number | undefined;

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

async function copyPublicUrl() {
  if (copyState.value === 'copying') return;
  copyState.value = 'copying';
  try {
    let shareUrl = shortLinkUrl.value ?? publicUrl;

    if (!shortLinkUrl.value) {
      try {
        const shortLink = await ensureAdminShortLink({ destination: 'volunteer_intake' });

        shortLinkUrl.value = shortLink.url;
        shareUrl = shortLink.url;
      } catch {
        // Keep the canonical form URL available if short-link storage is unavailable.
      }
    }
    await copyTextToClipboard(shareUrl);
    copyState.value = 'copied';
    if (copyResetTimer) window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      copyState.value = 'idle';
      copyResetTimer = undefined;
    }, 1800);
  } catch {
    copyState.value = 'idle';
    notify.error('Unable to copy the volunteer form link.');
  }
}

onBeforeUnmount(() => {
  if (copyResetTimer) window.clearTimeout(copyResetTimer);
});

async function prepareVolunteerShareLink() {
  shortLinkUrl.value = null;
  if (!canShareIntake.value) return;
  try {
    const shortLink = await ensureAdminShortLink({ destination: 'volunteer_intake' });

    if (canShareIntake.value) shortLinkUrl.value = shortLink.url;
  } catch {
    // The canonical form URL remains available for narrow volunteer roles and service outages.
  }
}

watch(canShareIntake, () => {
  void prepareVolunteerShareLink();
}, { immediate: true });

function openVolunteerDisplay() {
  window.open(annualConferencePath('volunteers/display', year.value), '_blank', 'noopener,noreferrer');
}

function clearVolunteerFilters() {
  volunteerSearch.value = '';
  volunteerStatusFilter.value = 'all';
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav
        title="Volunteers"
        description="Share the sign-up, show its QR code, and review applications."
      >
        <template #actions>
        <div v-if="canShareIntake" class="flex flex-wrap items-center gap-2" aria-label="Volunteer form actions">
          <button
            type="button"
            class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-pink px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-white shadow-[2px_2px_0_#111111]"
            @click="openVolunteerDisplay"
          >
            Show QR
          </button>
          <AppCopyButton
            :state="copyState"
            label="Copy link"
            class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-ink hover:bg-dc-yellow"
            @click="copyPublicUrl"
          />
          <a
            :href="publicUrl"
            target="_blank"
            rel="noreferrer"
            class="motion-press inline-flex min-h-10 items-center rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-ink hover:bg-dc-yellow"
          >
            Open form
          </a>
        </div>
        </template>
      </AnnualConferenceNav>

      <section v-if="canViewTeam || canReviewApplications" class="editorial-panel volunteer-directory-panel overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-dc-border px-5 py-4 sm:px-6">
          <div>
            <p class="editorial-eyebrow">Volunteers</p>
            <h2 class="mt-1 text-lg font-semibold text-dc-ink">Volunteer directory</h2>
            <p class="mt-0.5 text-xs text-dc-gray">Active team members and sign-ups in one list.</p>
          </div>
          <div class="flex overflow-hidden rounded-md border border-dc-border bg-dc-paper-warm text-xs" role="group" aria-label="Filter volunteers by lifecycle">
            <button
              type="button"
              class="motion-press flex items-center gap-2 px-3 py-2 text-dc-gray"
              :class="volunteerStatusFilter === 'active' ? 'bg-dc-yellow text-dc-ink' : 'hover:bg-white'"
              :aria-pressed="volunteerStatusFilter === 'active'"
              @click="volunteerStatusFilter = volunteerStatusFilter === 'active' ? 'all' : 'active'"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-dc-success" aria-hidden="true" />
              <span>Active</span>
              <span class="font-semibold text-dc-ink">{{ activeVolunteerCount }}</span>
            </button>
            <button
              type="button"
              class="motion-press flex items-center gap-2 border-l border-dc-border px-3 py-2 text-dc-gray"
              :class="volunteerStatusFilter === 'applicant' ? 'bg-dc-yellow text-dc-ink' : 'hover:bg-white'"
              :aria-pressed="volunteerStatusFilter === 'applicant'"
              @click="volunteerStatusFilter = volunteerStatusFilter === 'applicant' ? 'all' : 'applicant'"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-dc-gray" aria-hidden="true" />
              <span>Applicants</span>
              <span class="font-semibold text-dc-ink">{{ applicantCount }}</span>
            </button>
            <button
              type="button"
              class="motion-press border-l border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide"
              :class="volunteerStatusFilter === 'all' ? 'bg-dc-yellow text-dc-ink' : 'text-dc-gray hover:bg-white'"
              :aria-pressed="volunteerStatusFilter === 'all'"
              @click="volunteerStatusFilter = 'all'"
            >
              {{ volunteerRows.length }} total
            </button>
          </div>
        </div>

        <div v-if="volunteerDirectoryLoading" class="p-6 text-dc-gray">Loading volunteers…</div>
        <div v-else-if="volunteerDirectoryError" class="p-6 text-red-800">Unable to load the volunteer directory.</div>
        <div v-else-if="volunteerRows.length === 0" class="p-6 text-dc-gray">No volunteers or applications yet.</div>
        <template v-else>
          <div class="flex flex-col gap-3 border-b border-dc-border bg-dc-paper-warm/50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <label class="relative block w-full sm:max-w-sm">
              <span class="sr-only">Search volunteers</span>
              <svg class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dc-gray" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                v-model="volunteerSearch"
                type="search"
                autocomplete="off"
                placeholder="Search name, email, X or Slack"
                class="min-h-10 w-full rounded-md border border-dc-border bg-white py-2 pl-9 pr-3 text-sm text-dc-ink outline-none placeholder:text-dc-gray focus:border-dc-ink focus:ring-2 focus:ring-dc-yellow"
              >
            </label>
            <div class="flex min-h-8 items-center justify-between gap-3 sm:justify-end">
              <p class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray" aria-live="polite">
                {{ filteredVolunteerRows.length }} {{ filteredVolunteerRows.length === 1 ? 'match' : 'matches' }}
              </p>
              <button
                v-if="hasVolunteerFilters"
                type="button"
                class="motion-press text-xs font-semibold text-dc-pink underline decoration-dc-pink/40 underline-offset-4"
                @click="clearVolunteerFilters"
              >Clear filters</button>
            </div>
          </div>
          <div v-if="filteredVolunteerRows.length === 0" class="px-5 py-10 text-center sm:px-6">
            <p class="text-sm font-semibold text-dc-ink">No matching volunteers</p>
            <p class="mt-1 text-xs text-dc-gray">Try another name or contact value, or clear the lifecycle filter.</p>
            <button type="button" class="motion-press mt-4 rounded-md border border-dc-ink bg-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wide text-dc-ink" @click="clearVolunteerFilters">Clear filters</button>
          </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full min-w-[60rem] table-fixed border-collapse text-left">
            <caption class="sr-only">Volunteer directory with active and applicant status</caption>
            <thead class="border-b border-dc-border bg-dc-paper-warm">
              <tr class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray">
                <th scope="col" class="w-[22%] px-5 py-2.5 sm:px-6">Name</th>
                <th scope="col" class="w-[13%] px-4 py-2.5">Status</th>
                <th v-if="canReviewApplications" scope="col" class="w-[25%] px-4 py-2.5">Email</th>
                <th v-if="canReviewApplications" scope="col" class="w-[13%] px-4 py-2.5">X</th>
                <th v-if="canReviewApplications" scope="col" class="w-[12%] px-4 py-2.5">Slack</th>
                <th v-if="canReviewApplications" scope="col" class="w-[15%] px-5 py-2.5 text-right sm:px-6">Signed up</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-dc-border bg-white">
              <tr v-for="row in paginatedVolunteers" :key="row.id" class="hover:bg-dc-paper-warm/40">
                <th scope="row" class="px-5 py-3 text-sm font-semibold text-dc-ink sm:px-6">
                  <button
                    type="button"
                    class="motion-press text-left underline decoration-dc-border underline-offset-4 hover:decoration-dc-pink"
                    aria-haspopup="dialog"
                    :aria-label="`Open details for ${row.name}`"
                    @click="selectedVolunteer = row"
                  >{{ row.name }}</button>
                </th>
                <td class="px-4 py-3">
                  <span
                    class="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize"
                    :class="row.status === 'active' ? 'border-green-200 bg-green-50 text-dc-success' : 'border-dc-border bg-dc-paper-warm text-dc-gray'"
                  >
                    <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    {{ row.status }}
                  </span>
                </td>
                <td v-if="canReviewApplications && !row.signedUpAt" colspan="4" class="px-4 py-3 text-xs text-dc-gray">
                  <span class="font-semibold text-dc-ink">Added directly</span>
                  <span class="ml-1.5">No volunteer application details.</span>
                </td>
                <template v-else-if="canReviewApplications">
                  <td class="px-4 py-3 text-sm">
                    <VolunteerContactValue v-if="row.email" :value="row.email" label="Email" email />
                  </td>
                  <td class="px-4 py-3 font-mono text-xs font-semibold text-dc-gray">
                    <VolunteerContactValue v-if="row.xHandle" :value="xProfile(row.xHandle)?.label ?? row.xHandle" :profile-href="xProfile(row.xHandle)?.href" label="X handle" />
                    <span v-else>—</span>
                  </td>
                  <td class="px-4 py-3 font-mono text-xs font-semibold text-dc-gray">
                    <VolunteerContactValue v-if="row.slackName" :value="row.slackName" label="Slack" />
                    <span v-else>—</span>
                  </td>
                  <td class="whitespace-nowrap px-5 py-3 text-right sm:px-6">
                    <time class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ formatDate(row.signedUpAt!) }}</time>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        </template>
        <div v-if="!volunteerDirectoryLoading && !volunteerDirectoryError && filteredVolunteerRows.length" class="flex flex-col gap-3 border-t border-dc-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p class="text-xs text-dc-gray">Showing {{ volunteerPageStart + 1 }}–{{ volunteerPageEnd }} of {{ filteredVolunteerRows.length }} volunteers</p>
          <AppPagination
            v-model:page="volunteerPage"
            class="volunteer-pagination"
            :page-count="volunteerPageCount"
            :total="filteredVolunteerRows.length"
            :range-start="volunteerPageStart + 1"
            :range-end="volunteerPageEnd"
            item-label="volunteers"
            aria-label="Volunteer directory pagination"
          />
        </div>
      </section>

      <VolunteerApplicationSheet
        :open="Boolean(selectedVolunteer)"
        :person="selectedVolunteer"
        :assigned-tasks="selectedVolunteerTasks"
        :actions="selectedVolunteerActions"
        @close="selectedVolunteer = null"
      />

      <section v-if="!workPlanQuery.isPending.value && !canViewTeam && !canShareIntake && !canReviewApplications" class="editorial-panel p-6">
        <h2 class="text-lg font-semibold text-dc-ink">No volunteer responsibility assigned</h2>
        <p class="mt-2 text-sm text-dc-gray">Ask an Owner to assign the volunteer responsibility you need for this edition.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.volunteer-directory-panel {
  box-shadow: none;
}

.volunteer-pagination {
  border-top: 0;
  padding: 0;
  background: transparent;
}
</style>
