<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  type ComponentPublicInstance,
  watch,
} from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { useRoute } from "vue-router";
import AnnualConferenceNav from "@/src/components/AnnualConferenceNav.vue";
import VolunteerApplicationSheet from "@/src/components/VolunteerApplicationSheet.vue";
import VolunteerFollowUpPanel from "@/src/components/VolunteerFollowUpPanel.vue";
import VolunteerReviewsPanel from "@/src/components/VolunteerReviewsPanel.vue";
import VolunteerWorkspaceTabs from "@/src/components/VolunteerWorkspaceTabs.vue";
import AppCopyButton from "@/src/components/ui/AppCopyButton.vue";
import AppPagination from "@/src/components/AppPagination.vue";
import VolunteerContactValue from "@/src/components/VolunteerContactValue.vue";
import AnnualConferenceRouteSkeleton from "@/src/components/ui/page-skeletons/AnnualConferenceRouteSkeleton.vue";
import { xProfile } from "@/src/lib/x-profile";
import {
  VOLUNTEER_PUBLIC_PATH,
  annualConferencePath,
} from "@/src/annual-conference";
import {
  fetchAnnualConferenceVolunteerTeam,
  fetchAnnualConferenceWorkPlan,
  fetchAdminSession,
  fetchVolunteerApplications,
  ensureAdminShortLink,
  queryKeys,
} from "@/src/lib/api";
import { copyTextToClipboard } from "@/src/lib/clipboard";
import { notify } from "@/src/lib/notify";
import { adminPath } from "@/src/admin-routes";
import {
  buildVolunteerDirectoryRows,
  filterVolunteerDirectory,
  volunteerDirectoryActions,
  volunteerDirectoryAssignments,
  type VolunteerDirectoryRow,
  type VolunteerDirectoryStatusFilter,
} from "@/src/lib/volunteer-directory";
import { hasAnnualConferenceCapability } from "@/lib/annual-conference-capabilities";

const route = useRoute();
const queryClient = useQueryClient();
const year = computed(() => String(route.params.year));
const annualConferenceNav = ref<ComponentPublicInstance | null>(null);
const annualConferenceNavHeight = ref(0);
const volunteerDirectoryToolbar = ref<HTMLElement | null>(null);
const volunteerDirectoryToolbarHeight = ref(0);
let annualConferenceNavObserver: ResizeObserver | null = null;
let volunteerDirectoryToolbarObserver: ResizeObserver | null = null;
const sessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
});
const workPlanQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceWorkPlan(year.value)),
  queryFn: () => fetchAnnualConferenceWorkPlan(year.value),
});
const capabilities = computed(
  () => workPlanQuery.data.value?.permissions.capabilities ?? [],
);
const canViewTeam = computed(() =>
  hasAnnualConferenceCapability(capabilities.value, "volunteers.view_team"),
);
const canShareIntake = computed(() =>
  hasAnnualConferenceCapability(capabilities.value, "volunteers.share_intake"),
);
const canReviewApplications = computed(() =>
  hasAnnualConferenceCapability(
    capabilities.value,
    "volunteers.review_applications",
  ),
);
const canLoadVolunteerApplications = computed(
  () => canReviewApplications.value && year.value === "2026",
);
const canViewReviews = computed(
  () => canReviewApplications.value && year.value === "2026",
);
const canViewCampaign = computed(
  () => canViewReviews.value && sessionQuery.data.value?.user?.role === "owner",
);

watch(
  () => sessionQuery.data.value?.user?.role,
  (role) => {
    if (role !== "owner") {
      queryClient.removeQueries({
        queryKey: ["annual-conference", "2026", "volunteer-follow-up", "owner"],
      });
    }
  },
);
const volunteerView = ref<"directory" | "reviews" | "campaign">("directory");
const volunteerViewTransitionDirection = ref<"forward" | "backward" | null>(
  null,
);
const volunteerViewTransitionName = computed(() =>
  volunteerViewTransitionDirection.value === "forward"
    ? "volunteer-panel-forward"
    : volunteerViewTransitionDirection.value === "backward"
      ? "volunteer-panel-backward"
      : "volunteer-panel-settle",
);
const teamQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceVolunteerTeam(year.value)),
  queryFn: () => fetchAnnualConferenceVolunteerTeam(year.value),
  enabled: canViewTeam,
});
const volunteerQuery = useQuery({
  queryKey: computed(() => queryKeys.volunteerApplications(year.value)),
  queryFn: () => fetchVolunteerApplications(year.value),
  enabled: canLoadVolunteerApplications,
});
const applications = computed(
  () => volunteerQuery.data.value?.applications ?? [],
);
const team = computed(() => teamQuery.data.value?.members ?? []);
const volunteerRows = computed(() =>
  buildVolunteerDirectoryRows(
    canReviewApplications.value ? applications.value : [],
    canViewTeam.value ? team.value : [],
  ),
);
const activeVolunteerCount = computed(
  () => volunteerRows.value.filter((row) => row.status === "active").length,
);
const applicantCount = computed(
  () => volunteerRows.value.filter((row) => row.status === "applicant").length,
);
const volunteerSearch = ref("");
const volunteerStatusFilter = ref<VolunteerDirectoryStatusFilter>("all");
const filteredVolunteerRows = computed(() =>
  filterVolunteerDirectory(volunteerRows.value, {
    search: volunteerSearch.value,
    status: volunteerStatusFilter.value,
  }),
);
const hasVolunteerFilters = computed(
  () =>
    volunteerSearch.value.trim().length > 0 ||
    volunteerStatusFilter.value !== "all",
);
const volunteerPage = ref(1);
const volunteersPerPage = 10;
const volunteerPageCount = computed(() =>
  Math.max(
    1,
    Math.ceil(filteredVolunteerRows.value.length / volunteersPerPage),
  ),
);
const volunteerPageStart = computed(
  () => (volunteerPage.value - 1) * volunteersPerPage,
);
const volunteerPageEnd = computed(() =>
  Math.min(
    filteredVolunteerRows.value.length,
    volunteerPageStart.value + volunteersPerPage,
  ),
);
const paginatedVolunteers = computed(() =>
  filteredVolunteerRows.value.slice(
    volunteerPageStart.value,
    volunteerPageEnd.value,
  ),
);
const selectedVolunteer = ref<VolunteerDirectoryRow | null>(null);
const selectedVolunteerTasks = computed(() =>
  volunteerDirectoryAssignments(
    selectedVolunteer.value,
    workPlanQuery.data.value?.tasks ?? [],
  ),
);
const selectedVolunteerActions = computed(() =>
  volunteerDirectoryActions(selectedVolunteer.value, {
    role: sessionQuery.data.value?.user?.role ?? null,
    year: year.value,
    canViewAllTasks:
      workPlanQuery.data.value?.permissions.access_scope === "all",
    canAssignTasks:
      workPlanQuery.data.value?.permissions.can_edit_all_tasks === true,
    workPlanPath: annualConferencePath("work-plan", year.value),
    accessPath: adminPath("organizers"),
  }),
);

watch(year, () => {
  volunteerView.value = "directory";
  volunteerSearch.value = "";
  volunteerStatusFilter.value = "all";
  volunteerPage.value = 1;
  selectedVolunteer.value = null;
});
watch(volunteerView, (view, previous) => {
  volunteerViewTransitionDirection.value =
    ["reviews", "campaign"].indexOf(view) >=
    ["reviews", "campaign"].indexOf(previous)
      ? "forward"
      : "backward";
});
watch([volunteerSearch, volunteerStatusFilter], () => {
  volunteerPage.value = 1;
});
watch(volunteerPageCount, (pageCount) => {
  volunteerPage.value = Math.min(volunteerPage.value, pageCount);
});

const volunteerDirectoryLoading = computed(
  () =>
    (canViewTeam.value && teamQuery.isPending.value) ||
    (canLoadVolunteerApplications.value && volunteerQuery.isPending.value),
);
const volunteerDirectoryError = computed(
  () =>
    (canViewTeam.value && teamQuery.isError.value) ||
    (canLoadVolunteerApplications.value && volunteerQuery.isError.value),
);
const volunteerRouteLoading = computed(
  () => workPlanQuery.isLoading.value || volunteerDirectoryLoading.value,
);
const publicUrl = `${window.location.origin}${VOLUNTEER_PUBLIC_PATH}`;
const shortLinkUrl = ref<string | null>(null);
const copyState = ref<"idle" | "copying" | "copied">("idle");
let copyResetTimer: number | undefined;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function copyPublicUrl() {
  if (copyState.value === "copying") return;
  copyState.value = "copying";
  try {
    let shareUrl = shortLinkUrl.value ?? publicUrl;

    if (!shortLinkUrl.value) {
      try {
        const shortLink = await ensureAdminShortLink({
          destination: "volunteer_intake",
        });

        shortLinkUrl.value = shortLink.url;
        shareUrl = shortLink.url;
      } catch {
        // Keep the canonical form URL available if short-link storage is unavailable.
      }
    }
    await copyTextToClipboard(shareUrl);
    copyState.value = "copied";
    if (copyResetTimer) window.clearTimeout(copyResetTimer);
    copyResetTimer = window.setTimeout(() => {
      copyState.value = "idle";
      copyResetTimer = undefined;
    }, 1800);
  } catch {
    copyState.value = "idle";
    notify.error("Unable to copy the volunteer form link.");
  }
}

function updateAnnualConferenceNavHeight() {
  const navigationElement = annualConferenceNav.value?.$el;

  if (navigationElement instanceof HTMLElement) {
    annualConferenceNavHeight.value =
      navigationElement.getBoundingClientRect().height;
  }
}

function updateVolunteerDirectoryToolbarHeight() {
  if (volunteerDirectoryToolbar.value) {
    volunteerDirectoryToolbarHeight.value =
      volunteerDirectoryToolbar.value.getBoundingClientRect().height;
  }
}

onMounted(() => {
  const navigationElement = annualConferenceNav.value?.$el;

  if (!(navigationElement instanceof HTMLElement)) return;

  updateAnnualConferenceNavHeight();
  annualConferenceNavObserver = new ResizeObserver(
    updateAnnualConferenceNavHeight,
  );
  annualConferenceNavObserver.observe(navigationElement);
});

watch(
  volunteerDirectoryToolbar,
  (toolbar) => {
    volunteerDirectoryToolbarObserver?.disconnect();
    if (!toolbar) return;

    updateVolunteerDirectoryToolbarHeight();
    volunteerDirectoryToolbarObserver = new ResizeObserver(
      updateVolunteerDirectoryToolbarHeight,
    );
    volunteerDirectoryToolbarObserver.observe(toolbar);
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  if (copyResetTimer) window.clearTimeout(copyResetTimer);
  annualConferenceNavObserver?.disconnect();
  volunteerDirectoryToolbarObserver?.disconnect();
});

async function prepareVolunteerShareLink() {
  shortLinkUrl.value = null;
  if (!canShareIntake.value) return;
  try {
    const shortLink = await ensureAdminShortLink({
      destination: "volunteer_intake",
    });

    if (canShareIntake.value) shortLinkUrl.value = shortLink.url;
  } catch {
    // The canonical form URL remains available for narrow volunteer roles and service outages.
  }
}

watch(
  canShareIntake,
  () => {
    void prepareVolunteerShareLink();
  },
  { immediate: true },
);

function openVolunteerDisplay() {
  window.open(
    annualConferencePath("volunteers/display", year.value),
    "_blank",
    "noopener,noreferrer",
  );
}

function clearVolunteerFilters() {
  volunteerSearch.value = "";
  volunteerStatusFilter.value = "all";
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <AnnualConferenceNav
        ref="annualConferenceNav"
        title="Volunteers"
        description="Share the sign-up, show its QR code, and review applications."
      >
        <template #actions>
          <div
            v-if="canShareIntake"
            class="flex flex-wrap items-center gap-2"
            aria-label="Volunteer form actions"
          >
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

      <div
        class="volunteer-view-workspace"
        :class="{
          'volunteer-view-workspace--tabbed': canViewReviews || canViewCampaign,
        }"
      >
        <VolunteerWorkspaceTabs
          v-if="canViewReviews || canViewCampaign"
          v-model="volunteerView"
          :reviews-visible="canViewReviews"
          :campaign-visible="canViewCampaign"
          id-prefix="admin-volunteers"
        />

        <Transition
          v-if="
            canViewReviews ||
            canViewCampaign ||
            volunteerRouteLoading ||
            canViewTeam ||
            canReviewApplications
          "
          :name="volunteerViewTransitionName"
          mode="out-in"
        >
          <div
            v-if="canViewReviews && volunteerView === 'reviews'"
            key="reviews"
            id="admin-volunteers-reviews-panel"
            class="volunteer-workspace-panel"
            role="tabpanel"
            aria-labelledby="admin-volunteers-reviews-tab"
            tabindex="0"
          >
            <VolunteerReviewsPanel
              :session-identity="`${sessionQuery.data.value?.user?.email ?? 'unknown'}:${sessionQuery.data.value?.user?.role ?? 'unknown'}`"
            />
          </div>

          <div
            v-else-if="canViewCampaign && volunteerView === 'campaign'"
            key="campaign"
            id="admin-volunteers-campaign-panel"
            class="volunteer-workspace-panel"
            role="tabpanel"
            aria-labelledby="admin-volunteers-campaign-tab"
            tabindex="0"
          >
            <VolunteerFollowUpPanel
              :is-owner-session="
                sessionQuery.data.value?.user?.role === 'owner'
              "
            />
          </div>

          <div
            v-else-if="volunteerRouteLoading && volunteerView === 'directory'"
            key="directory-loading"
            :id="
              canViewReviews || canViewCampaign
                ? 'admin-volunteers-directory-panel'
                : undefined
            "
            :role="canViewReviews || canViewCampaign ? 'tabpanel' : undefined"
            :aria-labelledby="
              canViewReviews || canViewCampaign
                ? 'admin-volunteers-directory-tab'
                : undefined
            "
            :tabindex="canViewReviews || canViewCampaign ? 0 : undefined"
          >
            <AnnualConferenceRouteSkeleton variant="volunteers" />
          </div>

          <section
            v-else-if="
              (canViewTeam || canReviewApplications) &&
              volunteerView === 'directory'
            "
            key="directory"
            :id="
              canViewReviews || canViewCampaign
                ? 'admin-volunteers-directory-panel'
                : undefined
            "
            :role="canViewReviews || canViewCampaign ? 'tabpanel' : undefined"
            :aria-labelledby="
              canViewReviews || canViewCampaign
                ? 'admin-volunteers-directory-tab'
                : undefined
            "
            :tabindex="canViewReviews || canViewCampaign ? 0 : undefined"
            class="editorial-panel volunteer-directory-panel"
            :class="{
              'volunteer-directory-panel--tabbed':
                canViewReviews || canViewCampaign,
            }"
            :style="{
              '--annual-conference-nav-height': `${annualConferenceNavHeight}px`,
              '--volunteer-directory-toolbar-height': `${volunteerDirectoryToolbarHeight}px`,
            }"
          >
            <div
              ref="volunteerDirectoryToolbar"
              class="volunteer-directory-toolbar md:sticky md:z-30"
            >
              <div
                class="flex flex-wrap items-center justify-between gap-3 border-b border-dc-border bg-dc-paper px-5 py-3 sm:px-6"
              >
                <div>
                  <h2 class="text-lg font-semibold text-dc-ink">
                    Volunteer directory
                  </h2>
                  <p class="mt-0.5 text-xs text-dc-gray">
                    {{
                      canReviewApplications
                        ? "Active team members and applicants in one list."
                        : "Active team members in one list."
                    }}
                  </p>
                </div>
              </div>

              <div
                v-if="
                  !volunteerDirectoryLoading &&
                  !volunteerDirectoryError &&
                  volunteerRows.length
                "
                class="volunteer-directory-controls border-b border-dc-border bg-dc-paper-warm px-5 py-3 sm:px-6"
              >
                <label class="volunteer-directory-search relative block w-full">
                  <span class="sr-only">Search volunteers</span>
                  <svg
                    class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-dc-gray"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    v-model="volunteerSearch"
                    type="search"
                    autocomplete="off"
                    placeholder="Search name, email, X or Slack"
                    class="min-h-10 w-full rounded-md border border-dc-border bg-white py-2 pl-9 pr-3 text-sm text-dc-ink outline-none placeholder:text-dc-gray focus:border-dc-ink focus:ring-2 focus:ring-dc-yellow"
                  />
                </label>
                <div
                  class="volunteer-lifecycle-filter"
                  role="group"
                  aria-label="Filter volunteers by lifecycle"
                >
                  <button
                    type="button"
                    class="motion-press"
                    :class="{ 'is-selected': volunteerStatusFilter === 'all' }"
                    :aria-pressed="volunteerStatusFilter === 'all'"
                    @click="volunteerStatusFilter = 'all'"
                  >
                    All <strong>{{ volunteerRows.length }}</strong>
                  </button>
                  <button
                    type="button"
                    class="motion-press"
                    :class="{
                      'is-selected': volunteerStatusFilter === 'active',
                    }"
                    :aria-pressed="volunteerStatusFilter === 'active'"
                    @click="
                      volunteerStatusFilter =
                        volunteerStatusFilter === 'active' ? 'all' : 'active'
                    "
                  >
                    <span
                      class="volunteer-filter-dot volunteer-filter-dot--active"
                      aria-hidden="true"
                    />Active <strong>{{ activeVolunteerCount }}</strong>
                  </button>
                  <button
                    type="button"
                    class="motion-press"
                    :class="{
                      'is-selected': volunteerStatusFilter === 'applicant',
                    }"
                    :aria-pressed="volunteerStatusFilter === 'applicant'"
                    @click="
                      volunteerStatusFilter =
                        volunteerStatusFilter === 'applicant'
                          ? 'all'
                          : 'applicant'
                    "
                  >
                    <span
                      class="volunteer-filter-dot"
                      aria-hidden="true"
                    />Applicants <strong>{{ applicantCount }}</strong>
                  </button>
                </div>
                <div class="volunteer-directory-results">
                  <p
                    class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray"
                    aria-live="polite"
                  >
                    {{ filteredVolunteerRows.length }}
                    {{
                      filteredVolunteerRows.length === 1 ? "match" : "matches"
                    }}
                  </p>
                  <button
                    v-if="hasVolunteerFilters"
                    type="button"
                    class="motion-press text-xs font-semibold text-dc-pink underline decoration-dc-pink/40 underline-offset-4"
                    @click="clearVolunteerFilters"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            </div>

            <div v-if="volunteerDirectoryLoading" class="p-6 text-dc-gray">
              Loading volunteers…
            </div>
            <div v-else-if="volunteerDirectoryError" class="p-6 text-red-800">
              Unable to load the volunteer directory.
            </div>
            <div
              v-else-if="volunteerRows.length === 0"
              class="volunteer-directory-empty px-5 py-12 text-center sm:px-6"
            >
              <span class="volunteer-directory-empty-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.7"
                >
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m16 16 4.5 4.5M8 10.5h5" />
                </svg>
              </span>
              <p class="text-sm font-semibold text-dc-ink">
                Your directory is ready for its first volunteers
              </p>
              <p class="mt-1 text-xs text-dc-gray">
                Volunteer records will appear here as the directory is
                populated.
              </p>
            </div>
            <template v-else>
              <div
                v-if="filteredVolunteerRows.length === 0"
                class="volunteer-directory-empty px-5 py-10 text-center sm:px-6"
              >
                <span class="volunteer-directory-empty-icon" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                  >
                    <circle cx="10.5" cy="10.5" r="6.5" />
                    <path d="m16 16 4.5 4.5M8 10.5h5" />
                  </svg>
                </span>
                <p class="text-sm font-semibold text-dc-ink">
                  No matching volunteers
                </p>
                <p class="mt-1 text-xs text-dc-gray">
                  Try another name or contact value, or clear the lifecycle
                  filter.
                </p>
                <button
                  type="button"
                  class="motion-press mt-4 rounded-md border border-dc-ink bg-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wide text-dc-ink hover:bg-dc-yellow"
                  @click="clearVolunteerFilters"
                >
                  Clear filters
                </button>
              </div>
              <div v-else class="overflow-x-auto md:overflow-visible">
                <table
                  class="w-full min-w-[60rem] table-fixed border-collapse text-left md:min-w-0"
                >
                  <caption class="sr-only">
                    Volunteer directory with active and applicant status
                  </caption>
                  <thead
                    class="volunteer-directory-table-head border-b border-dc-border bg-dc-paper-warm"
                  >
                    <tr
                      class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-gray"
                    >
                      <th scope="col" class="w-[22%] px-5 py-2.5 sm:px-6">
                        Name
                      </th>
                      <th scope="col" class="w-[13%] px-4 py-2.5">Status</th>
                      <th
                        v-if="canReviewApplications"
                        scope="col"
                        class="w-[25%] px-4 py-2.5"
                      >
                        Email
                      </th>
                      <th
                        v-if="canReviewApplications"
                        scope="col"
                        class="w-[13%] px-4 py-2.5"
                      >
                        X
                      </th>
                      <th
                        v-if="canReviewApplications"
                        scope="col"
                        class="w-[12%] px-4 py-2.5"
                      >
                        Slack
                      </th>
                      <th
                        v-if="canReviewApplications"
                        scope="col"
                        class="w-[15%] px-5 py-2.5 text-right sm:px-6"
                      >
                        Signed up
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-dc-border bg-white">
                    <tr
                      v-for="row in paginatedVolunteers"
                      :key="row.id"
                      class="volunteer-directory-row"
                    >
                      <th
                        scope="row"
                        class="px-5 py-3 text-sm font-semibold text-dc-ink sm:px-6"
                      >
                        <button
                          type="button"
                          class="motion-press text-left underline decoration-dc-border underline-offset-4 hover:decoration-dc-pink focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dc-pink"
                          aria-haspopup="dialog"
                          :aria-label="`Open details for ${row.name}`"
                          @click="selectedVolunteer = row"
                        >
                          {{ row.name }}
                        </button>
                      </th>
                      <td class="px-4 py-3">
                        <span
                          class="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize"
                          :class="
                            row.status === 'active'
                              ? 'border-green-200 bg-green-50 text-dc-success'
                              : 'border-dc-border bg-dc-paper-warm text-dc-gray'
                          "
                        >
                          <span
                            class="h-1.5 w-1.5 rounded-full bg-current"
                            aria-hidden="true"
                          />
                          {{ row.status }}
                        </span>
                      </td>
                      <td
                        v-if="canReviewApplications && !row.signedUpAt"
                        colspan="4"
                        class="px-4 py-3 text-xs text-dc-gray"
                      >
                        <span class="font-semibold text-dc-ink"
                          >Added directly</span
                        >
                        <span class="ml-1.5"
                          >No volunteer application details.</span
                        >
                      </td>
                      <template v-else-if="canReviewApplications">
                        <td class="px-4 py-3 text-sm">
                          <VolunteerContactValue
                            v-if="row.email"
                            :value="row.email"
                            label="Email"
                            email
                          />
                        </td>
                        <td
                          class="px-4 py-3 font-mono text-xs font-semibold text-dc-gray"
                        >
                          <VolunteerContactValue
                            v-if="row.xHandle"
                            :value="xProfile(row.xHandle)?.label ?? row.xHandle"
                            :profile-href="xProfile(row.xHandle)?.href"
                            label="X handle"
                          />
                          <span v-else>—</span>
                        </td>
                        <td
                          class="px-4 py-3 font-mono text-xs font-semibold text-dc-gray"
                        >
                          <VolunteerContactValue
                            v-if="row.slackName"
                            :value="row.slackName"
                            label="Slack"
                          />
                          <span v-else>—</span>
                        </td>
                        <td
                          class="whitespace-nowrap px-5 py-3 text-right sm:px-6"
                        >
                          <time
                            class="font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray"
                            >{{ formatDate(row.signedUpAt!) }}</time
                          >
                        </td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <div
              v-if="
                !volunteerDirectoryLoading &&
                !volunteerDirectoryError &&
                filteredVolunteerRows.length
              "
              class="flex flex-col gap-3 border-t border-dc-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <p class="text-xs text-dc-gray">
                Showing {{ volunteerPageStart + 1 }}–{{ volunteerPageEnd }} of
                {{ filteredVolunteerRows.length }} volunteers
              </p>
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
        </Transition>
      </div>

      <VolunteerApplicationSheet
        :open="Boolean(selectedVolunteer)"
        :person="selectedVolunteer"
        :assigned-tasks="selectedVolunteerTasks"
        :actions="selectedVolunteerActions"
        @close="selectedVolunteer = null"
      />

      <section
        v-if="
          !workPlanQuery.isPending.value &&
          !canViewTeam &&
          !canShareIntake &&
          !canReviewApplications
        "
        class="editorial-panel p-6"
      >
        <h2 class="text-lg font-semibold text-dc-ink">
          No volunteer responsibility assigned
        </h2>
        <p class="mt-2 text-sm text-dc-gray">
          Ask an Owner to assign the volunteer responsibility you need for this
          edition.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.volunteer-directory-panel {
  box-shadow: none;
}

.volunteer-directory-controls {
  display: grid;
  grid-template-columns: minmax(15rem, 1fr) auto auto;
  align-items: center;
  gap: 0.75rem;
}

.volunteer-lifecycle-filter {
  display: grid;
  grid-template-columns: repeat(3, auto);
  overflow: hidden;
  border: 1px solid #d6d2c9;
  border-radius: 8px;
  background: #fff;
}

.volunteer-lifecycle-filter button {
  display: inline-flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  border: 0;
  background: transparent;
  padding: 0.45rem 0.75rem;
  color: #666;
  font-size: 0.75rem;
  white-space: nowrap;
}

.volunteer-lifecycle-filter button + button {
  border-left: 1px solid #e0ddd4;
}

.volunteer-lifecycle-filter button.is-selected {
  background: #fff8b8;
  color: #111;
}

.volunteer-lifecycle-filter button:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid #e8117f;
  outline-offset: -3px;
}

.volunteer-lifecycle-filter strong {
  color: #111;
  font-variant-numeric: tabular-nums;
}

.volunteer-filter-dot {
  width: 0.4rem;
  height: 0.4rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #77736b;
}

.volunteer-filter-dot--active {
  background: #15803d;
}

.volunteer-directory-results {
  display: flex;
  min-height: 2.5rem;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  white-space: nowrap;
}

.volunteer-directory-results p {
  margin: 0;
}

.volunteer-directory-empty {
  display: grid;
  justify-items: center;
}

.volunteer-directory-empty-icon {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  margin-bottom: 0.8rem;
  border: 1px solid #e0ddd4;
  border-radius: 50%;
  background: #faf8f3;
  color: #77736b;
}

.volunteer-directory-empty-icon svg {
  width: 1.2rem;
  height: 1.2rem;
}

.volunteer-directory-row {
  background: #fff;
}

.volunteer-view-workspace:not(.volunteer-view-workspace--tabbed) {
  display: contents;
}

.volunteer-view-workspace--tabbed {
  display: grid;
  gap: 0;
}

.volunteer-directory-panel--tabbed {
  border: 1px solid #d6d2c9;
  border-top: 0;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  margin-top: 0;
  background: #fff;
}

.volunteer-workspace-panel {
  border: 1px solid #d6d2c9;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  overflow: visible;
}

.volunteer-workspace-panel :deep(.follow-up-panel) {
  border: 0;
  border-radius: 0 0 8px 8px;
}

.volunteer-panel-forward-enter-active,
.volunteer-panel-backward-enter-active {
  transition:
    transform 170ms var(--motion-smooth),
    opacity 170ms var(--motion-smooth);
}

.volunteer-panel-forward-leave-active,
.volunteer-panel-backward-leave-active {
  transition:
    transform 90ms cubic-bezier(0.4, 0, 1, 1),
    opacity 90ms cubic-bezier(0.4, 0, 1, 1);
}

.volunteer-panel-forward-enter-from {
  opacity: 0;
  transform: translate3d(0.5rem, 0, 0);
}

.volunteer-panel-forward-leave-to {
  opacity: 0;
  transform: translate3d(-0.375rem, 0, 0);
}

.volunteer-panel-backward-enter-from {
  opacity: 0;
  transform: translate3d(-0.5rem, 0, 0);
}

.volunteer-panel-backward-leave-to {
  opacity: 0;
  transform: translate3d(0.375rem, 0, 0);
}

.volunteer-panel-settle-enter-active,
.volunteer-panel-settle-leave-active {
  transition: opacity 150ms var(--motion-smooth);
}

.volunteer-panel-settle-enter-from,
.volunteer-panel-settle-leave-to {
  opacity: 0;
}

@media (min-width: 768px) {
  .volunteer-directory-toolbar {
    top: var(--annual-conference-nav-height);
  }

  .volunteer-directory-table-head {
    position: sticky;
    top: calc(
      var(--annual-conference-nav-height) +
        var(--volunteer-directory-toolbar-height)
    );
    z-index: 20;
  }

  .volunteer-directory-table-head th {
    background: #fbf8e8;
  }
}

.volunteer-pagination {
  border-top: 0;
  padding: 0;
  background: transparent;
}

@media (max-width: 767px) {
  .volunteer-directory-controls {
    grid-template-columns: minmax(0, 1fr);
  }

  .volunteer-directory-search,
  .volunteer-lifecycle-filter,
  .volunteer-directory-results {
    grid-column: 1 / -1;
  }

  .volunteer-lifecycle-filter {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: 100%;
  }

  .volunteer-lifecycle-filter button {
    gap: 0.3rem;
    padding-right: 0.45rem;
    padding-left: 0.45rem;
    font-size: 0.7rem;
  }

  .volunteer-directory-results {
    min-height: 2.5rem;
    justify-content: space-between;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .volunteer-directory-controls {
    grid-template-columns: minmax(12rem, 1fr) auto;
  }

  .volunteer-directory-results {
    grid-column: 2;
    justify-self: end;
  }
}

@media (hover: hover) and (pointer: fine) {
  .volunteer-lifecycle-filter button:not(.is-selected):hover,
  .volunteer-directory-row:hover {
    background: #faf8f3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .volunteer-panel-forward-enter-active,
  .volunteer-panel-forward-leave-active,
  .volunteer-panel-backward-enter-active,
  .volunteer-panel-backward-leave-active,
  .volunteer-panel-settle-enter-active,
  .volunteer-panel-settle-leave-active {
    transition: none;
  }

  .volunteer-panel-forward-enter-from,
  .volunteer-panel-forward-leave-to,
  .volunteer-panel-backward-enter-from,
  .volunteer-panel-backward-leave-to {
    transform: none;
  }
}
</style>
