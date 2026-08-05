<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { useRoute } from 'vue-router';
import AnnualConferenceNav from '@/src/components/AnnualConferenceNav.vue';
import {
  DECEMBER_2026_VOLUNTEER_PUBLIC_PATH,
  annualConferencePath,
} from '@/src/annual-conference';
import {
  fetchAnnualConferenceVolunteerTeam,
  fetchAnnualConferenceWorkPlan,
  fetchVolunteerApplications,
  queryKeys,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';
import { hasAnnualConferenceCapability } from '@/lib/annual-conference-capabilities';

const route = useRoute();
const year = computed(() => String(route.params.year));
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
const volunteerRows = computed(() => {
  const applicationRows = canReviewApplications.value
    ? applications.value.map((application) => ({
      id: `application:${application.id}`,
      membershipId: application.membership_id,
      name: application.name,
      email: application.email,
      xHandle: application.x_handle,
      slackName: application.slack_name,
      signedUpAt: application.created_at,
      status: application.status,
    }))
    : [];
  const activeMembershipIds = new Set(applicationRows.flatMap((row) => row.membershipId ? [row.membershipId] : []));
  const teamRows = canViewTeam.value
    ? team.value
      .filter((member) => !activeMembershipIds.has(member.id))
      .map((member) => ({
        id: `member:${member.id}`,
        membershipId: member.id,
        name: member.display_name,
        email: null,
        xHandle: null,
        slackName: null,
        signedUpAt: null,
        status: 'active' as const,
      }))
    : [];

  return [...applicationRows, ...teamRows].sort((left, right) => {
    if (left.status !== right.status) return left.status === 'active' ? -1 : 1;
    if (left.status === 'applicant' && left.signedUpAt && right.signedUpAt) {
      return new Date(right.signedUpAt).getTime() - new Date(left.signedUpAt).getTime();
    }
    return left.name.localeCompare(right.name);
  });
});
const activeVolunteerCount = computed(() => volunteerRows.value.filter((row) => row.status === 'active').length);
const applicantCount = computed(() => volunteerRows.value.filter((row) => row.status === 'applicant').length);
const volunteerDirectoryLoading = computed(() => (
  (canViewTeam.value && teamQuery.isPending.value)
  || (canReviewApplications.value && volunteerQuery.isPending.value)
));
const volunteerDirectoryError = computed(() => (
  (canViewTeam.value && teamQuery.isError.value)
  || (canReviewApplications.value && volunteerQuery.isError.value)
));
const publicUrl = `${window.location.origin}${DECEMBER_2026_VOLUNTEER_PUBLIC_PATH}`;
const copied = ref(false);

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
  try {
    await navigator.clipboard.writeText(publicUrl);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 1800);
  } catch {
    notify.error('Unable to copy the volunteer form link.');
  }
}

function openVolunteerDisplay() {
  window.open(annualConferencePath('volunteers/display', year.value), '_blank', 'noopener,noreferrer');
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
          <button
            type="button"
            class="motion-press min-h-10 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-ink hover:bg-dc-yellow"
            @click="copyPublicUrl"
          >
            {{ copied ? 'Copied' : 'Copy link' }}
          </button>
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

      <section v-if="canViewTeam || canReviewApplications" class="editorial-panel overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-dc-border px-5 py-4 sm:px-6">
          <div>
            <p class="editorial-eyebrow">Volunteers</p>
            <h2 class="mt-1 text-lg font-semibold text-dc-ink">Volunteer directory</h2>
            <p class="mt-0.5 text-xs text-dc-gray">Active team members and sign-ups in one list.</p>
          </div>
          <dl class="flex overflow-hidden rounded-md border border-dc-border bg-dc-paper-warm text-xs">
            <div class="flex items-center gap-2 px-3 py-2">
              <span class="h-1.5 w-1.5 rounded-full bg-dc-success" aria-hidden="true" />
              <dt class="text-dc-gray">Active</dt>
              <dd class="font-semibold text-dc-ink">{{ activeVolunteerCount }}</dd>
            </div>
            <div class="flex items-center gap-2 border-l border-dc-border px-3 py-2">
              <span class="h-1.5 w-1.5 rounded-full bg-dc-gray" aria-hidden="true" />
              <dt class="text-dc-gray">Applicants</dt>
              <dd class="font-semibold text-dc-ink">{{ applicantCount }}</dd>
            </div>
            <div class="border-l border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">
              {{ volunteerRows.length }} total
            </div>
          </dl>
        </div>

        <div v-if="volunteerDirectoryLoading" class="p-6 text-dc-gray">Loading volunteers…</div>
        <div v-else-if="volunteerDirectoryError" class="p-6 text-red-800">Unable to load the volunteer directory.</div>
        <div v-else-if="volunteerRows.length === 0" class="p-6 text-dc-gray">No volunteers or applications yet.</div>
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
              <tr v-for="row in volunteerRows" :key="row.id" class="hover:bg-dc-paper-warm/40">
                <th scope="row" class="px-5 py-3 text-sm font-semibold text-dc-ink sm:px-6">{{ row.name }}</th>
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
                    <a :href="`mailto:${row.email}`" class="font-medium text-dc-pink underline decoration-dc-pink/30 underline-offset-4">{{ row.email }}</a>
                  </td>
                  <td class="px-4 py-3 font-mono text-xs font-semibold text-dc-gray">{{ row.xHandle || '—' }}</td>
                  <td class="px-4 py-3 font-mono text-xs font-semibold text-dc-gray">{{ row.slackName || '—' }}</td>
                  <td class="whitespace-nowrap px-5 py-3 text-right sm:px-6">
                    <time class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray">{{ formatDate(row.signedUpAt!) }}</time>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="!workPlanQuery.isPending.value && !canViewTeam && !canShareIntake && !canReviewApplications" class="editorial-panel p-6">
        <h2 class="text-lg font-semibold text-dc-ink">No volunteer responsibility assigned</h2>
        <p class="mt-2 text-sm text-dc-gray">Ask an Owner to assign the volunteer responsibility you need for this edition.</p>
      </section>
    </div>
  </div>
</template>
