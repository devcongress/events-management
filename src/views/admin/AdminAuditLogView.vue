<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import AdminAuditLogPageSkeleton from '@/src/components/ui/page-skeletons/AdminAuditLogPageSkeleton.vue';
import { createAdminShortLink, fetchAdminAuditLog, fetchAdminShortLinks, queryKeys, revokeAdminShortLink, type AdminAuditLogEntry, type EmailHealthLevel, type RecentEmailDelivery, type RecentEventBlast } from '@/src/lib/api';

const AUDIT_LOG_LIMIT = 80;
const AUDIT_LOG_PAGE_SIZE = 4;
const DELIVERY_LOG_PAGE_SIZE = 5;

interface AuditLogGroup {
  key: string;
  actorLabel: string;
  count: number;
  logs: AdminAuditLogEntry[];
}

type AuditLogSection = 'activity' | 'email-delivery' | 'short-links';

const filters = reactive({
  action: '',
  target_type: '',
});
const groupByActorEmail = ref(false);
const page = ref(1);
const deliveryPage = ref(1);
const activeSection = ref<AuditLogSection>('activity');
const selectedShortLinkDestination = ref('');
const shortLinkMessage = ref('');
const queryClient = useQueryClient();
const selectedAuditLogId = ref<string | null>(null);
const auditFiltersShell = ref<HTMLElement | null>(null);
const auditActivitySummary = ref<HTMLElement | null>(null);
const auditDrawerCloseButton = ref<HTMLButtonElement | null>(null);
const auditDrawerPanel = ref<HTMLElement | null>(null);
const auditFiltersHeight = ref(0);
const auditActivitySummaryHeight = ref(0);
let auditStickyResizeObserver: ResizeObserver | undefined;
let auditDrawerTrigger: HTMLElement | null = null;

const auditFilters = computed(() => ({
  action: filters.action.trim(),
  target_type: filters.target_type.trim(),
  limit: String(AUDIT_LOG_LIMIT),
}));

const auditQuery = useQuery({
  queryKey: computed(() => queryKeys.adminAuditLog(auditFilters.value)),
  queryFn: () => fetchAdminAuditLog(auditFilters.value),
});
const shortLinksQuery = useQuery({ queryKey: queryKeys.adminShortLinks, queryFn: fetchAdminShortLinks });
const shortLinkMutation = useMutation({
  mutationFn: createAdminShortLink,
  onSuccess: async (link) => {
    shortLinkMessage.value = `${link.url} is ready to copy.`;
    selectedShortLinkDestination.value = '';
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminShortLinks });
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminAuditLog() });
  },
  onError: (error) => { shortLinkMessage.value = error instanceof Error ? error.message : 'Unable to create the short link.'; },
});
const revokeShortLinkMutation = useMutation({
  mutationFn: revokeAdminShortLink,
  onSuccess: async () => {
    shortLinkMessage.value = 'Short link revoked.';
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminShortLinks });
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminAuditLog() });
  },
  onError: (error) => { shortLinkMessage.value = error instanceof Error ? error.message : 'Unable to revoke the short link.'; },
});

const logs = computed(() => auditQuery.data.value?.logs ?? []);
const emailHealth = computed(() => auditQuery.data.value?.email_health ?? null);
const emailOutbox = computed(() => auditQuery.data.value?.email_outbox ?? null);
const blastCapacity = computed(() => auditQuery.data.value?.blast_capacity ?? null);
const recentEmailDeliveries = computed(() => auditQuery.data.value?.recent_email_deliveries ?? []);
const recentEventBlasts = computed(() => auditQuery.data.value?.recent_event_blasts ?? []);
const selectedAuditLog = computed(() => logs.value.find((log) => log.id === selectedAuditLogId.value) ?? null);
const loading = computed(() => auditQuery.isPending.value);
const error = computed(() => auditQuery.error.value?.message ?? '');
const actionOptions = computed(() => [...new Set(logs.value.map((log) => log.action))].sort());
const targetTypeOptions = computed(() => [...new Set(logs.value.map((log) => log.target_type).filter((value): value is string => Boolean(value)))].sort());
const actionDropdownOptions = computed(() => [
  { value: '', label: 'All actions' },
  ...actionOptions.value.map((action) => ({ value: action, label: actionLabel(action) })),
]);
const targetTypeDropdownOptions = computed(() => [
  { value: '', label: 'All targets' },
  ...targetTypeOptions.value.map((targetType) => ({ value: targetType, label: targetType })),
]);
const orderedLogs = computed(() => {
  const nextLogs = [...logs.value];
  if (!groupByActorEmail.value) return nextLogs;

  return nextLogs.sort((first, second) => {
    const actorComparison = actorLabel(first).localeCompare(actorLabel(second), undefined, { sensitivity: 'base' });
    if (actorComparison !== 0) return actorComparison;
    return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
  });
});
const pageCount = computed(() => Math.max(1, Math.ceil(orderedLogs.value.length / AUDIT_LOG_PAGE_SIZE)));
const pageStart = computed(() => (orderedLogs.value.length === 0 ? 0 : (page.value - 1) * AUDIT_LOG_PAGE_SIZE + 1));
const pageEnd = computed(() => Math.min(orderedLogs.value.length, page.value * AUDIT_LOG_PAGE_SIZE));
const deliveryPageCount = computed(() => Math.max(1, Math.ceil(recentEmailDeliveries.value.length / DELIVERY_LOG_PAGE_SIZE)));
const deliveryPageStart = computed(() => (
  recentEmailDeliveries.value.length === 0 ? 0 : (deliveryPage.value - 1) * DELIVERY_LOG_PAGE_SIZE + 1
));
const deliveryPageEnd = computed(() => Math.min(recentEmailDeliveries.value.length, deliveryPage.value * DELIVERY_LOG_PAGE_SIZE));
const paginatedRecentEmailDeliveries = computed(() => {
  const start = (deliveryPage.value - 1) * DELIVERY_LOG_PAGE_SIZE;
  return recentEmailDeliveries.value.slice(start, start + DELIVERY_LOG_PAGE_SIZE);
});
const paginatedLogs = computed(() => {
  const start = (page.value - 1) * AUDIT_LOG_PAGE_SIZE;
  return orderedLogs.value.slice(start, start + AUDIT_LOG_PAGE_SIZE);
});
const actorLogCounts = computed(() => orderedLogs.value.reduce((counts, log) => {
  const key = actorKey(log);
  counts.set(key, (counts.get(key) ?? 0) + 1);
  return counts;
}, new Map<string, number>()));
const visibleLogGroups = computed<AuditLogGroup[]>(() => {
  if (!groupByActorEmail.value) {
    return [{ key: 'all', actorLabel: '', count: paginatedLogs.value.length, logs: paginatedLogs.value }];
  }

  return paginatedLogs.value.reduce<AuditLogGroup[]>((groups, log) => {
    const key = actorKey(log);
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = {
        key,
        actorLabel: actorLabel(log),
        count: actorLogCounts.value.get(key) ?? 0,
        logs: [],
      };
      groups.push(group);
    }
    group.logs.push(log);
    return groups;
  }, []);
});
const hasActiveAuditControls = computed(() => Boolean(filters.action || filters.target_type || groupByActorEmail.value));
const auditStickyStyle = computed(() => ({
  '--audit-log-filters-height': `${auditFiltersHeight.value}px`,
  '--audit-log-activity-summary-height': `${auditActivitySummaryHeight.value}px`,
}));
const auditActivitySummaryStyle = computed(() => ({
  top: 'var(--audit-log-filters-height)',
}));
const auditTableHeaderStyle = computed(() => ({
  top: 'calc(var(--audit-log-filters-height) + var(--audit-log-activity-summary-height))',
}));
const activeSectionTransition = ref<'forward' | 'backward'>('forward');

function updateAuditStickyHeights() {
  auditFiltersHeight.value = auditFiltersShell.value?.offsetHeight ?? 0;
  auditActivitySummaryHeight.value = auditActivitySummary.value?.offsetHeight ?? 0;
}

function syncAuditStickyObserver() {
  auditStickyResizeObserver?.disconnect();

  if (auditFiltersShell.value) {
    auditStickyResizeObserver?.observe(auditFiltersShell.value);
  }

  if (auditActivitySummary.value) {
    auditStickyResizeObserver?.observe(auditActivitySummary.value);
  }

  updateAuditStickyHeights();
}

watch(pageCount, (nextPageCount) => {
  if (page.value > nextPageCount) {
    page.value = nextPageCount;
  }
});

watch(deliveryPageCount, (nextPageCount) => {
  if (deliveryPage.value > nextPageCount) {
    deliveryPage.value = nextPageCount;
  }
});

watch(recentEmailDeliveries, () => {
  deliveryPage.value = 1;
});

watch(logs, (nextLogs) => {
  if (selectedAuditLogId.value && !nextLogs.some((log) => log.id === selectedAuditLogId.value)) {
    closeAuditDrawer();
  }
});

watch([() => filters.action, () => filters.target_type, groupByActorEmail], () => {
  page.value = 1;
});

watch(loading, () => {
  void nextTick(syncAuditStickyObserver);
});

watch(activeSection, () => {
  void nextTick(syncAuditStickyObserver);
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

  return `${dateLabel} · ${timeLabel}`;
}

function actorRoleLabel(role: string | null): string {
  if (role === 'owner') return 'Owner';
  if (role === 'organizer') return 'Organizer';
  if (role === 'volunteer') return 'Volunteer';
  return 'System';
}

function quotaMetric(used: number | null, limit: number): string {
  return used === null ? `Awaiting first send / ${limit.toLocaleString()}` : `${used.toLocaleString()} / ${limit.toLocaleString()}`;
}

function healthLabel(level: EmailHealthLevel): string {
  if (level === 'warning') return 'Watch';
  if (level === 'high') return 'Near limit';
  if (level === 'exhausted') return 'Limit reached';
  return 'Healthy';
}

function healthTone(level: EmailHealthLevel): string {
  if (level === 'warning') return 'border-dc-yellow bg-dc-yellow/15 text-dc-ink';
  if (level === 'high') return 'border-dc-pink bg-dc-pink/10 text-dc-pink';
  if (level === 'exhausted') return 'border-red-600 bg-red-50 text-red-700';
  return 'border-emerald-500 bg-emerald-50 text-emerald-700';
}

function deliverySourceLabel(source: RecentEmailDelivery['source']): string {
  if (source === 'community_submission') return 'Community listing';
  if (source === 'speaker_archive') return 'Speaker archive';
  return 'Registration';
}

function deliveryStatusLabel(status: RecentEmailDelivery['status']): string {
  if (status === 'accepted') return 'Accepted';
  if (status === 'failed') return 'Failed';
  return 'Queued';
}

function deliveryDetail(delivery: RecentEmailDelivery): string {
  if (delivery.status === 'accepted') return 'Accepted by Resend';
  if (delivery.status === 'failed') return delivery.last_error ?? 'Provider did not accept the request';
  return 'Awaiting delivery attempt';
}

function blastStatusLabel(status: RecentEventBlast['status']): string {
  if (status === 'sent') return 'Sent to provider';
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'needs_capacity') return 'Needs capacity';
  if (status === 'failed') return 'Failed';
  return 'Preparing';
}

function blastStatusTone(status: RecentEventBlast['status']): string {
  if (status === 'sent') return 'audit-log-broadcast-status--sent';
  if (status === 'scheduled') return 'audit-log-broadcast-status--scheduled';
  if (status === 'needs_capacity') return 'audit-log-broadcast-status--needs-capacity';
  if (status === 'failed') return 'audit-log-broadcast-status--failed';
  return 'audit-log-broadcast-status--preparing';
}

function actionLabel(value: string): string {
  return value.replace(/\./g, ' / ');
}

function activityActionSummary(value: string): string {
  return value
    .split('.')
    .filter(Boolean)
    .map((segment) => segment
      .split(/[_-]+/)
      .filter(Boolean)
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
      .join(' '))
    .join(' · ');
}

function metadataEntries(log: AdminAuditLogEntry): Array<[string, unknown]> {
  return Object.entries(log.metadata ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '');
}

function metadataKeyLabel(key: string): string {
  return key
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function metadataValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function actorLabel(log: AdminAuditLogEntry): string {
  return log.actor_email?.trim() || 'System';
}

function actorKey(log: AdminAuditLogEntry): string {
  return actorLabel(log).toLowerCase();
}

function toggleGroupByActorEmail() {
  groupByActorEmail.value = !groupByActorEmail.value;
}

function clearFilters() {
  filters.action = '';
  filters.target_type = '';
  groupByActorEmail.value = false;
  page.value = 1;
}

function selectSection(section: AuditLogSection) {
  if (activeSection.value === section) return;
  activeSectionTransition.value = section === 'activity' ? 'backward' : 'forward';
  activeSection.value = section;
}

const shortLinkDestinationOptions = computed(() => {
  const destinations = shortLinksQuery.data.value?.destinations;
  if (!destinations) return [] as Array<{ value: string; label: string }>;
  return [
    ...destinations.monthly_cfp.map((item) => ({ value: `monthly_cfp:${item.id}`, label: `Monthly CFP — ${item.label}` })),
    ...destinations.event_registration.map((item) => ({ value: `event_registration:${item.id}`, label: `Registration — ${item.label}` })),
    ...destinations.conference_cfp.map((item) => ({ value: `conference_cfp:${item.year}`, label: `Conference CFP — ${item.label}` })),
  ];
});

async function copyShortLink(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    shortLinkMessage.value = 'Short link copied.';
  } catch {
    shortLinkMessage.value = 'Copy failed. Select the link and copy it manually.';
  }
}

function createShortLinkFromSelection() {
  const [destination, target] = selectedShortLinkDestination.value.split(':');
  if (!target || (destination !== 'monthly_cfp' && destination !== 'event_registration' && destination !== 'conference_cfp')) return;
  shortLinkMutation.mutate(destination === 'conference_cfp'
    ? { destination, conference_year: Number(target) }
    : { destination, event_id: target });
}

function openAuditDrawer(log: AdminAuditLogEntry, event?: Event) {
  auditDrawerTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  selectedAuditLogId.value = log.id;
  void nextTick(() => auditDrawerCloseButton.value?.focus());
}

function closeAuditDrawer() {
  if (!selectedAuditLogId.value) return;
  selectedAuditLogId.value = null;
  const trigger = auditDrawerTrigger;
  auditDrawerTrigger = null;
  void nextTick(() => trigger?.focus());
}

function handleAuditDrawerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && selectedAuditLog.value) {
    closeAuditDrawer();
    return;
  }

  if (event.key !== 'Tab' || !selectedAuditLog.value || !auditDrawerPanel.value) return;
  const focusable = Array.from(auditDrawerPanel.value.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
  ));
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    auditStickyResizeObserver = new ResizeObserver(updateAuditStickyHeights);
  }

  window.addEventListener('resize', updateAuditStickyHeights);
  window.addEventListener('keydown', handleAuditDrawerKeydown);
  void nextTick(syncAuditStickyObserver);
});

onUnmounted(() => {
  auditStickyResizeObserver?.disconnect();
  window.removeEventListener('resize', updateAuditStickyHeights);
  window.removeEventListener('keydown', handleAuditDrawerKeydown);
});
</script>

<template>
  <div class="editorial-page flex h-full min-h-0 flex-col">
    <div class="editorial-wrap flex w-full flex-1 min-h-0 flex-col">
      <div class="editorial-header audit-log-header">
        <p class="editorial-eyebrow">security ledger</p>
        <h1 class="editorial-title">Audit Log</h1>
        <p class="editorial-copy max-w-3xl">
          Review organizer actions alongside the health of essential delivery systems.
        </p>
      </div>

      <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {{ error }}
      </div>

      <AdminAuditLogPageSkeleton v-if="loading" />

      <div v-else class="flex w-full flex-1 min-h-0 flex-col" :style="auditStickyStyle">
        <nav class="audit-log-tabs mb-5" role="tablist" aria-label="Audit Log sections">
          <button
            id="audit-log-tab-activity"
            type="button"
            role="tab"
            class="audit-log-tab motion-press"
            :aria-selected="activeSection === 'activity'"
            aria-controls="audit-log-panel-activity"
            @click="selectSection('activity')"
          >
            <svg class="audit-log-tab-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
              <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
              <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
              <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" />
            </svg>
            <span>Activity</span>
          </button>
          <button
            id="audit-log-tab-email-delivery"
            type="button"
            role="tab"
            class="audit-log-tab motion-press"
            :aria-selected="activeSection === 'email-delivery'"
            aria-controls="audit-log-panel-email-delivery"
            @click="selectSection('email-delivery')"
          >
            <svg class="audit-log-tab-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="2.75" y="4.25" width="14.5" height="11.5" rx="1.5" />
              <path d="m3.75 5.5 6.25 5 6.25-5" />
            </svg>
            <span>Email delivery</span>
          </button>
          <button
            id="audit-log-tab-short-links"
            type="button"
            role="tab"
            class="audit-log-tab motion-press"
            :aria-selected="activeSection === 'short-links'"
            aria-controls="audit-log-panel-short-links"
            @click="selectSection('short-links')"
          >
            <svg class="audit-log-tab-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M7.25 12.75 5.5 14.5a3 3 0 0 1-4.25-4.25L4 7.5" />
              <path d="m12.75 7.25 1.75-1.75a3 3 0 0 1 4.25 4.25L16 12.5" />
              <path d="m6.75 13.25 6.5-6.5" />
            </svg>
            <span>Short links</span>
          </button>
        </nav>

        <Transition :name="`audit-log-panel-${activeSectionTransition}`" mode="out-in">
          <div v-if="activeSection === 'activity'" id="audit-log-panel-activity" key="activity" role="tabpanel" aria-labelledby="audit-log-tab-activity" class="flex flex-1 min-h-0 flex-col">
            <section ref="auditFiltersShell" data-audit-filters class="sticky top-0 z-30 mb-5 bg-dc-cream/95 pb-3 pt-1 backdrop-blur">
          <div class="rounded-md border border-dc-border bg-dc-paper p-4">
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_minmax(0,16rem)_auto_auto] lg:items-end">
              <AppDropdown
                v-model="filters.action"
                label="Action"
                :options="actionDropdownOptions"
                menu-class="lg:w-72"
              />
              <AppDropdown
                v-model="filters.target_type"
                label="Target"
                :options="targetTypeDropdownOptions"
                menu-class="lg:w-64"
              />
              <button
                type="button"
                class="motion-press min-h-[50px] rounded-md border-2 border-dc-ink px-4 py-3 font-mono text-sm font-semibold uppercase tracking-wide text-dc-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-ink/25"
                :class="groupByActorEmail ? 'bg-dc-yellow' : 'bg-dc-paper hover:bg-dc-paper-warm'"
                :aria-pressed="groupByActorEmail"
                @click="toggleGroupByActorEmail"
              >
                {{ groupByActorEmail ? 'Grouped by email' : 'Group by email' }}
              </button>
              <button
                type="button"
                class="editorial-secondary-action min-h-[50px] justify-center px-4"
                :disabled="!hasActiveAuditControls"
                @click="clearFilters"
              >
                Clear
              </button>
            </div>
          </div>
            </section>

            <section class="flex flex-col rounded-md border border-dc-border bg-dc-paper">
          <div
            ref="auditActivitySummary"
            data-audit-activity-summary
            class="sticky z-20 shrink-0 flex flex-col gap-2 rounded-t-md border-b border-dc-border bg-dc-paper-warm px-4 py-3 sm:flex-row sm:items-end sm:justify-between"
            :style="auditActivitySummaryStyle"
          >
            <div>
              <p class="editorial-eyebrow mb-1">activity</p>
              <h2 class="text-xl font-bold tracking-tight text-dc-ink">{{ orderedLogs.length }} recent item{{ orderedLogs.length === 1 ? '' : 's' }}</h2>
            </div>
            <p class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">
              Owner only
            </p>
          </div>

          <div v-if="logs.length === 0" class="flex-1 px-4 py-10 text-sm text-dc-gray">
            No audit rows match these filters.
          </div>
          <template v-else>
            <div
              data-audit-table-header
              class="sticky z-10 overflow-hidden border-b border-dc-border bg-dc-paper-warm"
              :style="auditTableHeaderStyle"
            >
              <table class="w-full table-fixed text-left">
                <colgroup>
                  <col class="w-[13%]">
                  <col class="w-[6%]">
                  <col class="w-[28%]">
                  <col class="w-[47%]">
                  <col class="w-[6%]">
                </colgroup>
                <thead class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">
                  <tr>
                    <th class="px-4 py-2">When</th>
                    <th class="px-2 py-2 text-center"><span class="sr-only">Role</span></th>
                    <th class="px-3 py-2">Email</th>
                    <th class="px-3 py-2">Activity</th>
                    <th class="px-3 py-2"><span class="sr-only">Open details</span></th>
                  </tr>
                </thead>
              </table>
            </div>
            <div class="overflow-hidden">
              <table class="w-full table-fixed text-left">
                <colgroup>
                  <col class="w-[13%]">
                  <col class="w-[6%]">
                  <col class="w-[28%]">
                  <col class="w-[47%]">
                  <col class="w-[6%]">
                </colgroup>
                <tbody class="divide-y divide-dc-border">
                  <template v-for="group in visibleLogGroups" :key="group.key">
                    <tr v-if="groupByActorEmail" class="bg-dc-cream/70">
                      <td colspan="5" class="px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">
                        <span class="text-dc-ink">{{ group.actorLabel }}</span>
                        <span class="ml-2">{{ group.count }} item{{ group.count === 1 ? '' : 's' }}</span>
                      </td>
                    </tr>
                    <tr
                      v-for="log in group.logs"
                      :key="log.id"
                      class="audit-log-activity-row"
                      tabindex="0"
                      role="button"
                      :aria-label="`Open details for ${activityActionSummary(log.action)}`"
                      @click="openAuditDrawer(log, $event)"
                      @keydown.enter.prevent="openAuditDrawer(log, $event)"
                      @keydown.space.prevent="openAuditDrawer(log, $event)"
                    >
                      <td class="whitespace-nowrap px-4 py-2 align-middle font-mono text-[11px] font-semibold leading-none text-dc-gray">{{ formatDateTime(log.created_at) }}</td>
                      <td class="px-2 py-2 align-middle text-center">
                        <span class="audit-log-role-icon" :class="`audit-log-role-icon--${log.actor_role ?? 'system'}`" :title="actorRoleLabel(log.actor_role)">
                          <svg v-if="log.actor_role === 'owner'" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m3.5 6.75 3.6 3.1L10 4l2.9 5.85 3.6-3.1-1.35 7.5h-10.3L3.5 6.75Z" /><path d="M5 16h10" /></svg>
                          <svg v-else-if="log.actor_role === 'organizer'" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="7.25" cy="6.75" r="2.25" /><path d="M3.25 15.5c.45-2.25 2-3.5 4-3.5s3.55 1.25 4 3.5M13.5 5.25a2 2 0 0 1 0 4M14.25 11.75c1.35.3 2.25 1.2 2.55 2.8" /></svg>
                          <svg v-else-if="log.actor_role === 'volunteer'" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 16s-5-3.1-5-7.05c0-1.5 1.05-2.7 2.5-2.7 1.05 0 1.95.6 2.5 1.5.55-.9 1.45-1.5 2.5-1.5 1.45 0 2.5 1.2 2.5 2.7C15 12.9 10 16 10 16Z" /></svg>
                          <svg v-else viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2" /><path d="M7 10h6M10 7v6" /></svg>
                          <span class="sr-only">{{ actorRoleLabel(log.actor_role) }}</span>
                        </span>
                      </td>
                      <td class="px-3 py-2 align-middle">
                        <p class="truncate text-sm font-semibold leading-none text-dc-ink">{{ log.actor_email ?? 'System' }}</p>
                      </td>
                      <td class="px-3 py-2 align-middle text-sm font-semibold text-dc-ink">
                        <span class="block truncate">{{ activityActionSummary(log.action) }}</span>
                      </td>
                      <td class="audit-log-activity-row__open px-3 py-2 align-middle" aria-hidden="true">
                        <svg viewBox="0 0 20 20" fill="none"><path d="m7.5 4.5 5.5 5.5-5.5 5.5" /></svg>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </template>
          <AppPagination v-model:page="page" :page-count="pageCount" :total="orderedLogs.length" :range-start="pageStart" :range-end="pageEnd" item-label="audit records" aria-label="Audit activity pagination" />
            </section>
          </div>

          <section v-else-if="activeSection === 'email-delivery'" id="audit-log-panel-email-delivery" key="email-delivery" role="tabpanel" aria-labelledby="audit-log-tab-email-delivery" class="audit-log-email-delivery w-full">
            <div class="audit-log-email-delivery__heading">
              <div>
                <p class="editorial-eyebrow mb-1">provider observation</p>
                <h2 class="text-xl font-bold tracking-tight text-dc-ink">Email delivery</h2>
              </div>
              <p class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">
                Resend · {{ emailHealth?.last_provider_response_at ? `observed ${formatDateTime(emailHealth.last_provider_response_at)}` : 'awaiting provider response' }}
              </p>
            </div>

            <section class="audit-log-delivery-overview" aria-label="Email capacity overview">
              <article class="audit-log-delivery-overview__capacity">
                <div class="audit-log-delivery-overview__lead">
                  <svg class="audit-log-delivery-row__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 19V5" />
                    <path d="M4 19h16" />
                    <path d="m7 15 4-4 3 2 5-6" />
                  </svg>
                  <div>
                    <p>Resend allowance</p>
                    <span>Live provider quota observation.</span>
                  </div>
                </div>
                <dl class="audit-log-delivery-overview__quotas">
                  <div>
                    <dt>Today</dt>
                    <dd>{{ quotaMetric(emailHealth?.daily_quota_used ?? null, emailHealth?.daily_quota_limit ?? 100) }}</dd>
                    <span :class="healthTone(emailHealth?.daily_level ?? 'healthy')">{{ healthLabel(emailHealth?.daily_level ?? 'healthy') }}</span>
                  </div>
                  <div>
                    <dt>This month</dt>
                    <dd>{{ quotaMetric(emailHealth?.monthly_quota_used ?? null, emailHealth?.monthly_quota_limit ?? 3000) }}</dd>
                    <span :class="healthTone(emailHealth?.monthly_level ?? 'healthy')">{{ healthLabel(emailHealth?.monthly_level ?? 'healthy') }}</span>
                  </div>
                </dl>
              </article>

              <article class="audit-log-delivery-overview__recovery">
                <div class="audit-log-delivery-overview__lead">
                  <svg class="audit-log-delivery-row__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 3a9 9 0 1 0 9 9" />
                    <path d="M12 7v5l3 2" />
                    <path d="M19 3v4h-4" />
                  </svg>
                  <div>
                    <p>Recovery queue</p>
                    <span>Transactional messages awaiting action.</span>
                  </div>
                </div>
                <div class="audit-log-delivery-overview__recovery-values">
                  <strong>{{ emailOutbox?.pending ?? 0 }} <small>queued</small></strong>
                  <strong :class="(emailOutbox?.failed ?? 0) > 0 ? 'text-red-700' : 'text-dc-ink'">{{ emailOutbox?.failed ?? 0 }} <small>failed</small></strong>
                </div>
              </article>

              <article class="audit-log-delivery-overview__guardrail">
                <div class="audit-log-delivery-overview__lead">
                  <svg class="audit-log-delivery-row__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 18V6" />
                    <path d="M4 18h16" />
                    <path d="M8 14h2v-3h2v3h2V8h2v6" />
                  </svg>
                  <div>
                    <p>Blast guardrail</p>
                    <span v-if="blastCapacity?.known">{{ blastCapacity.protected_reserve }} sends protected for transactional delivery.</span>
                    <span v-else>Awaiting a fresh quota observation.</span>
                  </div>
                </div>
                <div class="audit-log-delivery-overview__guardrail-value">
                  <strong>{{ blastCapacity?.safe_recipients_today ?? '—' }}</strong>
                  <span>safe to send today</span>
                </div>
                <p v-if="blastCapacity?.known" class="audit-log-delivery-overview__formula">
                  {{ blastCapacity.daily_limit }} limit · {{ blastCapacity.daily_used }} used · {{ blastCapacity.queued_transactional }} queued · {{ blastCapacity.protected_reserve }} protected
                </p>
              </article>
            </section>

            <p class="audit-log-email-delivery__note">
              Accepted means Resend accepted the message. Inbox delivery and bounce outcomes will appear here once outbound delivery webhooks are enabled.
            </p>

            <div class="audit-log-delivery-history">
              <div class="audit-log-delivery-history__heading">
                <div>
                  <p class="editorial-eyebrow mb-1">delivery log</p>
                  <h3>Recent messages</h3>
                </div>
                <div class="audit-log-delivery-history__meta">
                  <div class="audit-log-delivery-history__legend" aria-label="Delivery status legend">
                    <span class="audit-log-delivery-history__legend-item audit-log-delivery-history__legend-item--accepted">
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="m6.75 10 2.1 2.1 4.35-4.35" /></svg>
                      Accepted
                    </span>
                    <span class="audit-log-delivery-history__legend-item audit-log-delivery-history__legend-item--queued">
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6.25v4.1l2.75 1.6" /></svg>
                      Queued
                    </span>
                    <span class="audit-log-delivery-history__legend-item audit-log-delivery-history__legend-item--failed">
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="m7.75 7.75 4.5 4.5m0-4.5-4.5 4.5" /></svg>
                      Failed
                    </span>
                  </div>
                  <p v-if="recentEmailDeliveries.length > 0">Showing {{ deliveryPageStart }}–{{ deliveryPageEnd }} of {{ recentEmailDeliveries.length }}</p>
                </div>
              </div>

              <div v-if="recentEmailDeliveries.length === 0" class="audit-log-delivery-history__empty">
                No transactional delivery records yet. New registration, listing, and speaker messages will appear here.
              </div>
              <div v-else class="overflow-x-auto">
                <table class="audit-log-delivery-history__table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Source</th>
                      <th>Message</th>
                      <th>Status</th>
                      <th>Detail</th>
                      <th>Attempts</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="delivery in paginatedRecentEmailDeliveries" :key="delivery.id">
                      <td>{{ formatDateTime(delivery.occurred_at) }}</td>
                      <td>{{ deliverySourceLabel(delivery.source) }}</td>
                      <td><strong>{{ delivery.label }}</strong></td>
                      <td>
                        <span class="audit-log-delivery-history__status" :class="`audit-log-delivery-history__status--${delivery.status}`" :aria-label="deliveryStatusLabel(delivery.status)" role="img" :title="deliveryStatusLabel(delivery.status)">
                          <svg v-if="delivery.status === 'accepted'" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="m6.75 10 2.1 2.1 4.35-4.35" /></svg>
                          <svg v-else-if="delivery.status === 'pending'" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6.25v4.1l2.75 1.6" /></svg>
                          <svg v-else viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="m7.75 7.75 4.5 4.5m0-4.5-4.5 4.5" /></svg>
                        </span>
                      </td>
                      <td><span :title="deliveryDetail(delivery)">{{ deliveryDetail(delivery) }}</span></td>
                      <td>{{ delivery.attempts }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <AppPagination v-model:page="deliveryPage" :page-count="deliveryPageCount" :total="recentEmailDeliveries.length" :range-start="deliveryPageStart" :range-end="deliveryPageEnd" item-label="deliveries" aria-label="Email delivery pagination" />
            </div>

            <div class="audit-log-delivery-history audit-log-broadcast-history">
              <div class="audit-log-delivery-history__heading">
                <div>
                  <p class="editorial-eyebrow mb-1">broadcast log</p>
                  <h3>Recent event blasts</h3>
                </div>
                <p class="audit-log-delivery-history__caption">Provider acceptance is not inbox delivery.</p>
              </div>

              <div v-if="recentEventBlasts.length === 0" class="audit-log-delivery-history__empty">
                No event broadcasts have been created yet.
              </div>
              <div v-else class="overflow-x-auto">
                <table class="audit-log-delivery-history__table audit-log-broadcast-history__table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Broadcast</th>
                      <th>Audience</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="blast in recentEventBlasts" :key="blast.id">
                      <td>{{ formatDateTime(blast.updated_at) }}</td>
                      <td><strong>{{ blast.subject }}</strong></td>
                      <td>{{ blast.recipient_count }} recipients</td>
                      <td><span class="audit-log-broadcast-status" :class="blastStatusTone(blast.status)">{{ blastStatusLabel(blast.status) }}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <section v-else id="audit-log-panel-short-links" key="short-links" role="tabpanel" aria-labelledby="audit-log-tab-short-links" class="audit-log-email-delivery w-full">
            <div class="audit-log-email-delivery__heading">
              <div>
                <p class="editorial-eyebrow mb-1">marketing links</p>
                <h2 class="text-xl font-bold tracking-tight text-dc-ink">Short links</h2>
                <p class="mt-1 text-sm text-dc-muted">Create opaque flyer links for open CFPs and registration forms. Visits are counted here; organizer changes remain in Activity.</p>
              </div>
            </div>
            <div class="rounded-md border border-dc-border bg-dc-paper p-4">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label class="flex min-w-0 flex-1 flex-col gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-muted">
                  Destination
                  <select v-model="selectedShortLinkDestination" class="min-h-11 rounded-md border border-dc-border bg-white px-3 font-sans text-sm font-medium normal-case tracking-normal text-dc-ink">
                    <option value="">Choose an open public destination</option>
                    <option v-for="option in shortLinkDestinationOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                </label>
                <button type="button" class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-yellow px-4 font-mono text-xs font-semibold uppercase tracking-[0.1em] text-dc-ink disabled:cursor-not-allowed disabled:opacity-50" :disabled="!selectedShortLinkDestination || shortLinkMutation.isPending.value" @click="createShortLinkFromSelection">
                  {{ shortLinkMutation.isPending.value ? 'Creating…' : 'Create short link' }}
                </button>
              </div>
              <p v-if="shortLinkMessage" class="mt-3 text-sm font-medium text-dc-muted">{{ shortLinkMessage }}</p>
            </div>
            <div class="audit-log-delivery-history mt-5">
              <div v-if="shortLinksQuery.isPending.value" class="audit-log-delivery-history__empty">Loading short links…</div>
              <div v-else-if="shortLinksQuery.data.value?.links.length === 0" class="audit-log-delivery-history__empty">No short links yet. Create one for an open CFP or registration form.</div>
              <div v-else class="overflow-x-auto">
                <table class="audit-log-delivery-history__table">
                  <thead><tr><th>Link</th><th>Destination</th><th>Visits</th><th>Last visited</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    <tr v-for="link in shortLinksQuery.data.value?.links" :key="link.id">
                      <td><button type="button" class="font-mono font-semibold text-dc-ink underline decoration-dc-yellow decoration-2 underline-offset-4" @click="copyShortLink(link.url)">{{ link.url.replace('https://', '') }}</button></td>
                      <td>{{ link.label }}</td><td>{{ link.redirect_count.toLocaleString() }}</td><td>{{ link.last_redirected_at ? formatDateTime(link.last_redirected_at) : 'Not used yet' }}</td>
                      <td><span class="audit-log-delivery-history__status" :class="link.status === 'active' ? 'audit-log-delivery-history__status--accepted' : 'audit-log-delivery-history__status--failed'">{{ link.status }}</span></td>
                      <td><button v-if="link.status === 'active'" type="button" class="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-dc-muted underline" :disabled="revokeShortLinkMutation.isPending.value" @click="revokeShortLinkMutation.mutate(link.id)">Revoke</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </Transition>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="audit-log-drawer">
        <div v-if="selectedAuditLog" class="audit-log-drawer-shell">
          <button type="button" class="audit-log-drawer-backdrop" aria-label="Close audit record details" @click="closeAuditDrawer" />
          <aside ref="auditDrawerPanel" class="audit-log-drawer" role="dialog" aria-modal="true" aria-labelledby="audit-log-drawer-title">
            <header class="audit-log-drawer__header">
              <div class="min-w-0">
                <p class="editorial-eyebrow mb-2">Audit record</p>
                <h2 id="audit-log-drawer-title">{{ activityActionSummary(selectedAuditLog.action) }}</h2>
                <p>{{ formatDateTime(selectedAuditLog.created_at) }}</p>
              </div>
              <button ref="auditDrawerCloseButton" type="button" class="audit-log-drawer__close motion-press" aria-label="Close audit record details" @click="closeAuditDrawer">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </header>

            <div class="audit-log-drawer__body">
              <section class="audit-log-drawer__section" aria-labelledby="audit-log-drawer-activity">
                <h3 id="audit-log-drawer-activity">Activity</h3>
                <dl class="audit-log-drawer__facts">
                  <div>
                    <dt>Actor</dt>
                    <dd>{{ actorLabel(selectedAuditLog) }}</dd>
                  </div>
                  <div>
                    <dt>Role</dt>
                    <dd>{{ selectedAuditLog.actor_role ?? 'System' }}</dd>
                  </div>
                  <div class="audit-log-drawer__fact--wide">
                    <dt>Action key</dt>
                    <dd>{{ selectedAuditLog.action }}</dd>
                  </div>
                </dl>
              </section>

              <section v-if="selectedAuditLog.target_type || selectedAuditLog.target_id" class="audit-log-drawer__section" aria-labelledby="audit-log-drawer-target">
                <h3 id="audit-log-drawer-target">Target</h3>
                <dl class="audit-log-drawer__facts">
                  <div>
                    <dt>Type</dt>
                    <dd>{{ selectedAuditLog.target_type ?? '—' }}</dd>
                  </div>
                  <div class="audit-log-drawer__fact--wide">
                    <dt>Record ID</dt>
                    <dd>{{ selectedAuditLog.target_id ?? '—' }}</dd>
                  </div>
                </dl>
              </section>

              <section v-if="metadataEntries(selectedAuditLog).length > 0" class="audit-log-drawer__section" aria-labelledby="audit-log-drawer-metadata">
                <h3 id="audit-log-drawer-metadata">Record details</h3>
                <dl class="audit-log-drawer__facts">
                  <div v-for="[key, value] in metadataEntries(selectedAuditLog)" :key="key" class="audit-log-drawer__fact--wide">
                    <dt>{{ metadataKeyLabel(key) }}</dt>
                    <dd>{{ metadataValue(value) }}</dd>
                  </div>
                </dl>
              </section>

              <section class="audit-log-drawer__section" aria-labelledby="audit-log-drawer-request">
                <h3 id="audit-log-drawer-request">Request</h3>
                <dl class="audit-log-drawer__facts">
                  <div class="audit-log-drawer__fact--wide">
                    <dt>IP address</dt>
                    <dd>{{ selectedAuditLog.ip_address ?? 'Not recorded' }}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.audit-log-header {
  margin-bottom: 1.75rem;
  padding-bottom: 1.25rem;
}

.audit-log-header .editorial-eyebrow {
  margin-bottom: 0.5rem;
}

.audit-log-header .editorial-copy {
  margin-top: 0.5rem;
  color: #4f4c46;
  font-size: 0.9375rem;
  line-height: 1.45;
}

.audit-log-tabs {
  display: flex;
  gap: 1.5rem;
  overflow-x: auto;
  border-bottom: 1px solid #d6d2c8;
  padding: 0 0.125rem;
  scrollbar-width: none;
}

.audit-log-tabs::-webkit-scrollbar {
  display: none;
}

.audit-log-activity-row {
  cursor: pointer;
  outline: none;
  transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.audit-log-activity-row:focus-visible {
  outline: 2px solid rgba(232, 17, 127, 0.5);
  outline-offset: -2px;
}

.audit-log-activity-row__open {
  color: #8b877f;
}

.audit-log-activity-row__open svg {
  width: 1rem;
  height: 1rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.audit-log-role-icon {
  display: inline-flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border: 1px solid #d6d2c8;
  border-radius: 999px;
  background: #fcfbf7;
  color: #6f6c65;
}

.audit-log-role-icon svg {
  width: 0.8rem;
  height: 0.8rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.audit-log-role-icon--owner {
  border-color: #d5b700;
  background: #fff8c7;
  color: #715f00;
}

.audit-log-role-icon--organizer {
  border-color: #e7bfd4;
  background: #fff7fb;
  color: #c40a68;
}

.audit-log-role-icon--volunteer {
  border-color: #b8dfc8;
  background: #f1fbf4;
  color: #197343;
}

.audit-log-tab {
  position: relative;
  display: inline-flex;
  min-height: 2.875rem;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.125rem 0;
  color: #6f6c65;
  font-size: 0.8125rem;
  font-weight: 600;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
}

.audit-log-tab-icon,
.audit-log-delivery-row__icon {
  flex: 0 0 auto;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.audit-log-tab-icon {
  width: 0.9rem;
  height: 0.9rem;
}

.audit-log-tab::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 999px;
  background: #e8117f;
  content: '';
  opacity: 0;
  transform: scaleX(0.5);
  transform-origin: center;
  transition:
    opacity 150ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.audit-log-tab[aria-selected='true'] {
  color: #111111;
}

.audit-log-tab[aria-selected='true']::after {
  opacity: 1;
  transform: scaleX(1);
}

.audit-log-tab:focus-visible {
  border-radius: 6px;
  outline: 2px solid rgba(232, 17, 127, 0.35);
  outline-offset: 3px;
}

.audit-log-email-delivery {
  width: 100%;
  overflow: hidden;
  border: 1px solid #d6d2c8;
  border-radius: 12px;
  background: #ffffff;
  box-shadow: 0 1px 0 rgba(17, 17, 17, 0.06);
}

.audit-log-email-delivery__heading {
  display: flex;
  gap: 1rem;
  align-items: end;
  justify-content: space-between;
  border-bottom: 1px solid #d6d2c8;
  background: #fcfbf7;
  padding: 1.25rem 1.5rem;
}

.audit-log-delivery-rows {
  margin: 0;
}

.audit-log-delivery-row {
  display: flex;
  gap: 1.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 1.125rem 1.5rem;
}

.audit-log-delivery-row + .audit-log-delivery-row {
  border-top: 1px solid #e4e0d8;
}

.audit-log-delivery-row__label {
  display: flex;
  min-width: 0;
  gap: 0.75rem;
  align-items: flex-start;
}

.audit-log-delivery-row__icon {
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 0.15rem;
  color: #e8117f;
}

.audit-log-delivery-row dt {
  color: #111111;
  font-size: 0.9375rem;
  font-weight: 700;
}

.audit-log-delivery-row dd {
  margin: 0.25rem 0 0;
  color: #6f6c65;
  font-size: 0.8125rem;
  line-height: 1.45;
}

.audit-log-delivery-row__value {
  display: flex;
  flex: 0 0 auto;
  gap: 0.75rem;
  align-items: center;
}

.audit-log-delivery-row__value > strong {
  color: #111111;
  font-size: 1rem;
  line-height: 1.2;
  white-space: nowrap;
}

.audit-log-delivery-row__value > span {
  border-width: 1px;
  border-radius: 999px;
  padding: 0.25rem 0.5rem;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
}

.audit-log-delivery-row__value small {
  color: #6f6c65;
  font-size: 0.8125rem;
  font-weight: 600;
}

.audit-log-delivery-row__value--allocation {
  gap: 0.55rem;
}

.audit-log-delivery-row__value--allocation > span {
  border: 1px solid #d6d2c8;
  border-radius: 999px;
  background: #fcfbf7;
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  padding: 0.25rem 0.5rem;
  text-transform: uppercase;
}

.audit-log-delivery-overview {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(14rem, 1fr) minmax(14rem, 1fr);
  gap: 0.75rem;
  padding: 1rem 1.5rem;
}

.audit-log-delivery-overview > article {
  min-width: 0;
  border: 1px solid #e4e0d8;
  border-radius: 8px;
  background: #ffffff;
  padding: 1rem;
}

.audit-log-delivery-overview__guardrail {
  border-color: #d5b700 !important;
  background: #fffdf0 !important;
}

.audit-log-delivery-overview__lead {
  display: flex;
  min-width: 0;
  gap: 0.625rem;
  align-items: flex-start;
}

.audit-log-delivery-overview__lead p {
  margin: 0;
  color: #111111;
  font-size: 0.9375rem;
  font-weight: 700;
}

.audit-log-delivery-overview__lead span {
  display: block;
  margin-top: 0.25rem;
  color: #6f6c65;
  font-size: 0.75rem;
  line-height: 1.45;
}

.audit-log-delivery-overview__quotas {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.875rem;
  margin: 1.25rem 0 0;
}

.audit-log-delivery-overview__quotas > div + div {
  border-left: 1px solid #e4e0d8;
  padding-left: 0.875rem;
}

.audit-log-delivery-overview__quotas dt,
.audit-log-delivery-overview__formula {
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.audit-log-delivery-overview__quotas dd {
  margin: 0.4rem 0 0.55rem;
  color: #111111;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.1;
  white-space: nowrap;
}

.audit-log-delivery-overview__quotas span {
  display: inline-flex;
  border-width: 1px;
  border-radius: 999px;
  padding: 0.25rem 0.5rem;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
}

.audit-log-delivery-overview__recovery-values {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  align-items: baseline;
  margin-top: 1.25rem;
}

.audit-log-delivery-overview__recovery-values strong {
  color: #111111;
  font-size: 1.25rem;
  letter-spacing: -0.025em;
  line-height: 1.1;
  white-space: nowrap;
}

.audit-log-delivery-overview__recovery-values small,
.audit-log-delivery-overview__guardrail-value span {
  color: #6f6c65;
  font-size: 0.75rem;
  font-weight: 600;
}

.audit-log-delivery-overview__guardrail-value {
  display: flex;
  gap: 0.4rem;
  align-items: baseline;
  margin-top: 1.25rem;
}

.audit-log-delivery-overview__guardrail-value strong {
  color: #111111;
  font-size: 1.75rem;
  font-weight: 700;
  letter-spacing: -0.04em;
  line-height: 1;
}

.audit-log-delivery-overview__formula {
  margin: 0.875rem 0 0;
  line-height: 1.5;
}

.audit-log-email-delivery__note {
  margin: 0;
  border-top: 1px solid #d6d2c8;
  background: #fcfbf7;
  padding: 0.875rem 1.5rem;
  color: #6f6c65;
  font-size: 0.75rem;
  line-height: 1.5;
}

.audit-log-delivery-history {
  border-top: 1px solid #d6d2c8;
}

.audit-log-delivery-history__heading {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem 0.75rem;
}

.audit-log-delivery-history__heading h3 {
  margin: 0;
  color: #111111;
  font-size: 1.125rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.audit-log-delivery-history__meta {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.audit-log-delivery-history__meta > p {
  margin: 0;
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.audit-log-delivery-history__caption {
  margin: 0;
  color: #6f6c65;
  font-size: 0.75rem;
  line-height: 1.4;
  text-align: right;
}

.audit-log-broadcast-history {
  background: #fcfbf7;
}

.audit-log-broadcast-history__table {
  min-width: 42rem;
}

.audit-log-broadcast-history__table th:nth-child(1) { width: 20%; }
.audit-log-broadcast-history__table th:nth-child(2) { width: 44%; }
.audit-log-broadcast-history__table th:nth-child(3) { width: 18%; }
.audit-log-broadcast-history__table th:nth-child(4) { width: 18%; }

.audit-log-broadcast-status {
  display: inline-flex;
  border: 1px solid #d6d2c8;
  border-radius: 999px;
  padding: 0.25rem 0.5rem;
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1;
  text-transform: uppercase;
  white-space: nowrap;
}

.audit-log-broadcast-status--sent {
  border-color: #86cfb2;
  background: #effbf4;
  color: #047857;
}

.audit-log-broadcast-status--scheduled {
  border-color: #d5b700;
  background: #fff8c7;
  color: #715f00;
}

.audit-log-broadcast-status--needs-capacity,
.audit-log-broadcast-status--failed {
  border-color: #f2b2bd;
  background: #fff5f6;
  color: #b91c1c;
}

.audit-log-delivery-history__legend {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.audit-log-delivery-history__legend-item {
  display: inline-flex;
  gap: 0.3rem;
  align-items: center;
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.audit-log-delivery-history__legend-item svg,
.audit-log-delivery-history__status svg {
  width: 1rem;
  height: 1rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.audit-log-delivery-history__legend-item--accepted,
.audit-log-delivery-history__status--accepted {
  color: #047857;
}

.audit-log-delivery-history__legend-item--queued,
.audit-log-delivery-history__status--pending {
  color: #8a6500;
}

.audit-log-delivery-history__legend-item--failed,
.audit-log-delivery-history__status--failed {
  color: #b91c1c;
}

.audit-log-delivery-history__empty {
  border-top: 1px solid #e4e0d8;
  padding: 1.5rem;
  color: #6f6c65;
  font-size: 0.875rem;
  line-height: 1.55;
}

.audit-log-delivery-history__table {
  width: 100%;
  min-width: 52rem;
  border-top: 1px solid #e4e0d8;
  border-collapse: collapse;
  table-layout: fixed;
  text-align: left;
}

.audit-log-delivery-history__table th {
  padding: 0.625rem 1.5rem;
  background: #fcfbf7;
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.audit-log-delivery-history__table th:nth-child(1) { width: 14%; }
.audit-log-delivery-history__table th:nth-child(2) { width: 16%; }
.audit-log-delivery-history__table th:nth-child(3) { width: 18%; }
.audit-log-delivery-history__table th:nth-child(4) { width: 12%; }
.audit-log-delivery-history__table th:nth-child(5) { width: 30%; }
.audit-log-delivery-history__table th:nth-child(6) { width: 10%; }

.audit-log-delivery-history__table td {
  padding: 0.625rem 1.5rem;
  border-top: 1px solid #e4e0d8;
  color: #6f6c65;
  font-size: 0.8125rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
  vertical-align: middle;
}

.audit-log-delivery-history__table td:first-child,
.audit-log-delivery-history__table td:nth-child(2),
.audit-log-delivery-history__table td:last-child {
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.audit-log-delivery-history__table td:first-child {
  white-space: nowrap;
}

.audit-log-delivery-history__table th:nth-child(4),
.audit-log-delivery-history__table td:nth-child(4) {
  text-align: center;
}

.audit-log-delivery-history__table td strong {
  color: #111111;
  font-weight: 700;
}

.audit-log-delivery-history__table td:nth-child(5) > span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audit-log-delivery-history__status {
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
}

.audit-log-drawer-shell {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  justify-content: flex-end;
}

.audit-log-drawer-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(17, 17, 17, 0.32);
}

.audit-log-drawer {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(100%, var(--organizer-detail-drawer-width));
  height: 100%;
  flex-direction: column;
  border-left: 1px solid #d6d2c8;
  background: #ffffff;
  box-shadow: -10px 0 24px rgba(17, 17, 17, 0.16);
}

.audit-log-drawer__header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid #d6d2c8;
  background: #fcfbf7;
  padding: 1.5rem;
}

.audit-log-drawer__header h2 {
  margin: 0;
  color: #111111;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.audit-log-drawer__header > div > p:last-child {
  margin: 0.5rem 0 0;
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.6875rem;
  font-weight: 600;
}

.audit-log-drawer__close {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid #d6d2c8;
  border-radius: 6px;
  background: #ffffff;
  color: #111111;
}

.audit-log-drawer__close svg {
  width: 1.125rem;
  height: 1.125rem;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-width: 2;
}

.audit-log-drawer__body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1.5rem;
}

.audit-log-drawer__section + .audit-log-drawer__section {
  margin-top: 1.5rem;
  border-top: 1px solid #e4e0d8;
  padding-top: 1.5rem;
}

.audit-log-drawer__section h3 {
  margin: 0 0 0.875rem;
  color: #111111;
  font-family: var(--font-mono), monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.audit-log-drawer__facts {
  display: grid;
  gap: 0.875rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.audit-log-drawer__facts > div {
  min-width: 0;
}

.audit-log-drawer__fact--wide {
  grid-column: 1 / -1;
}

.audit-log-drawer__facts dt {
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.audit-log-drawer__facts dd {
  margin: 0.3rem 0 0;
  overflow-wrap: anywhere;
  color: #111111;
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.45;
}

.audit-log-drawer-enter-active,
.audit-log-drawer-leave-active,
.audit-log-drawer-enter-active .audit-log-drawer-backdrop,
.audit-log-drawer-leave-active .audit-log-drawer-backdrop,
.audit-log-drawer-enter-active .audit-log-drawer,
.audit-log-drawer-leave-active .audit-log-drawer {
  transition:
    opacity 220ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1);
}

.audit-log-drawer-enter-from .audit-log-drawer-backdrop,
.audit-log-drawer-leave-to .audit-log-drawer-backdrop {
  opacity: 0;
}

.audit-log-drawer-enter-from .audit-log-drawer,
.audit-log-drawer-leave-to .audit-log-drawer {
  opacity: 0;
  transform: translate3d(1.25rem, 0, 0);
}

.audit-log-delivery-history__pagination {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #e4e0d8;
  background: #fcfbf7;
  padding: 0.75rem 1.5rem;
}

.audit-log-delivery-history__pagination > p {
  margin: 0;
  color: #6f6c65;
  font-family: var(--font-mono), monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.audit-log-delivery-history__page-button {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid #d6d2c8;
  border-radius: 6px;
  background: #ffffff;
  padding: 0.35rem 0.6rem;
  color: #111111;
  font-family: var(--font-mono), monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition:
    background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.audit-log-delivery-history__page-button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.audit-log-panel-forward-enter-active,
.audit-log-panel-forward-leave-active,
.audit-log-panel-backward-enter-active,
.audit-log-panel-backward-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.audit-log-panel-forward-enter-from,
.audit-log-panel-backward-leave-to {
  opacity: 0;
  transform: translate3d(0.5rem, 0, 0);
}

.audit-log-panel-forward-leave-to,
.audit-log-panel-backward-enter-from {
  opacity: 0;
  transform: translate3d(-0.5rem, 0, 0);
}

@media (hover: hover) and (pointer: fine) {
  .audit-log-tab:hover {
    color: #111111;
  }

  .audit-log-activity-row:hover {
    background: #fcfbf7;
  }

  .audit-log-activity-row:hover .audit-log-activity-row__open {
    color: #111111;
  }

  .audit-log-delivery-history__page-button:not(:disabled):hover {
    border-color: #bdb8ad;
    background: #f5f3ec;
  }
}

@media (max-width: 1023px) {
  .audit-log-delivery-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .audit-log-delivery-overview__capacity {
    grid-column: 1 / -1;
  }
}

@media (max-width: 639px) {
  .audit-log-header {
    margin-bottom: 1.25rem;
    padding-bottom: 0.875rem;
  }

  .audit-log-tabs {
    gap: 1.125rem;
  }

  .audit-log-email-delivery__heading,
  .audit-log-delivery-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .audit-log-delivery-overview {
    grid-template-columns: 1fr;
    padding: 0.75rem 1rem;
  }

  .audit-log-delivery-overview__capacity {
    grid-column: auto;
  }

  .audit-log-delivery-overview__quotas {
    gap: 0.75rem;
  }

  .audit-log-email-delivery__heading,
  .audit-log-delivery-row,
  .audit-log-email-delivery__note {
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .audit-log-delivery-history__heading {
    align-items: flex-start;
    flex-direction: column;
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .audit-log-delivery-history__meta {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.5rem;
  }

  .audit-log-delivery-history__legend {
    gap: 0.625rem;
  }

  .audit-log-delivery-history__pagination {
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .audit-log-drawer__header,
  .audit-log-drawer__body {
    padding-right: 1rem;
    padding-left: 1rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .audit-log-tab,
  .audit-log-tab::after,
  .audit-log-delivery-history__page-button,
  .audit-log-activity-row,
  .audit-log-drawer-enter-active,
  .audit-log-drawer-leave-active,
  .audit-log-drawer-enter-active .audit-log-drawer-backdrop,
  .audit-log-drawer-leave-active .audit-log-drawer-backdrop,
  .audit-log-drawer-enter-active .audit-log-drawer,
  .audit-log-drawer-leave-active .audit-log-drawer,
  .audit-log-panel-forward-enter-active,
  .audit-log-panel-forward-leave-active,
  .audit-log-panel-backward-enter-active,
  .audit-log-panel-backward-leave-active {
    transition: none;
  }

  .audit-log-tab:active,
  .audit-log-panel-forward-enter-from,
  .audit-log-panel-forward-leave-to,
  .audit-log-panel-backward-enter-from,
  .audit-log-panel-backward-leave-to,
  .audit-log-drawer-enter-from .audit-log-drawer,
  .audit-log-drawer-leave-to .audit-log-drawer {
    transform: none;
  }
}
</style>
