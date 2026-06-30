<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminAuditLogPageSkeleton from '@/src/components/ui/page-skeletons/AdminAuditLogPageSkeleton.vue';
import { fetchAdminAuditLog, queryKeys, type AdminAuditLogEntry } from '@/src/lib/api';

const AUDIT_LOG_LIMIT = 80;
const AUDIT_LOG_PAGE_SIZE = 4;

interface AuditLogGroup {
  key: string;
  actorLabel: string;
  count: number;
  logs: AdminAuditLogEntry[];
}

const filters = reactive({
  action: '',
  target_type: '',
});
const groupByActorEmail = ref(false);
const page = ref(1);
const auditFiltersShell = ref<HTMLElement | null>(null);
const auditActivitySummary = ref<HTMLElement | null>(null);
const auditFiltersHeight = ref(0);
const auditActivitySummaryHeight = ref(0);
let auditStickyResizeObserver: ResizeObserver | undefined;

const auditFilters = computed(() => ({
  action: filters.action.trim(),
  target_type: filters.target_type.trim(),
  limit: String(AUDIT_LOG_LIMIT),
}));

const auditQuery = useQuery({
  queryKey: computed(() => queryKeys.adminAuditLog(auditFilters.value)),
  queryFn: () => fetchAdminAuditLog(auditFilters.value),
});

const logs = computed(() => auditQuery.data.value?.logs ?? []);
const authMode = computed(() => auditQuery.data.value?.auth_mode ?? 'supabase');
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

watch([() => filters.action, () => filters.target_type, groupByActorEmail], () => {
  page.value = 1;
});

watch(loading, () => {
  void nextTick(syncAuditStickyObserver);
});

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function actionLabel(value: string): string {
  return value.replace(/\./g, ' / ');
}

function metadataSummary(log: AdminAuditLogEntry): string {
  const entries = Object.entries(log.metadata ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 3);

  if (entries.length === 0) return '-';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' / ');
}

function actorLabel(log: AdminAuditLogEntry): string {
  return log.actor_email?.trim() || 'System';
}

function actorKey(log: AdminAuditLogEntry): string {
  return actorLabel(log).toLowerCase();
}

function goToPage(nextPage: number) {
  page.value = Math.min(pageCount.value, Math.max(1, nextPage));
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

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    auditStickyResizeObserver = new ResizeObserver(updateAuditStickyHeights);
  }

  window.addEventListener('resize', updateAuditStickyHeights);
  void nextTick(syncAuditStickyObserver);
});

onUnmounted(() => {
  auditStickyResizeObserver?.disconnect();
  window.removeEventListener('resize', updateAuditStickyHeights);
});
</script>

<template>
  <div class="editorial-page flex h-full min-h-0 flex-col">
    <div class="editorial-wrap flex flex-1 min-h-0 flex-col">
      <div class="editorial-header">
        <p class="editorial-eyebrow">security ledger</p>
        <h1 class="editorial-title">Audit Log</h1>
        <p class="editorial-copy max-w-3xl">
          Review organizer sign-ins and changes made inside the console.
        </p>
      </div>

      <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {{ error }}
      </div>

      <AdminAuditLogPageSkeleton v-if="loading" />

      <div v-else class="flex flex-1 min-h-0 flex-col" :style="auditStickyStyle">
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
                class="motion-press min-h-[50px] rounded-md border-2 border-dc-ink px-4 py-3 font-mono text-sm font-bold uppercase tracking-wide text-dc-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-pink/30"
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
              <h2 class="text-xl font-black tracking-tight text-dc-ink">{{ orderedLogs.length }} recent item{{ orderedLogs.length === 1 ? '' : 's' }}</h2>
            </div>
            <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
              Owner only
            </p>
          </div>

          <div v-if="authMode === 'local'" class="flex-1 px-4 py-10 text-sm text-dc-gray">
            Hosted Supabase auth is required before audit logs are available.
          </div>
          <div v-else-if="logs.length === 0" class="flex-1 px-4 py-10 text-sm text-dc-gray">
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
                  <col class="w-[10%]">
                  <col class="w-[22%]">
                  <col class="w-[18%]">
                  <col class="w-[18%]">
                  <col class="w-[24%]">
                  <col class="w-[8%]">
                </colgroup>
                <thead class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                  <tr>
                    <th class="px-4 py-2.5">Time</th>
                    <th class="px-4 py-2.5">Actor</th>
                    <th class="px-4 py-2.5">Action</th>
                    <th class="px-4 py-2.5">Target</th>
                    <th class="px-4 py-2.5">Summary</th>
                    <th class="px-4 py-2.5">IP</th>
                  </tr>
                </thead>
              </table>
            </div>
            <div class="overflow-hidden">
              <table class="w-full table-fixed text-left">
                <colgroup>
                  <col class="w-[10%]">
                  <col class="w-[22%]">
                  <col class="w-[18%]">
                  <col class="w-[18%]">
                  <col class="w-[24%]">
                  <col class="w-[8%]">
                </colgroup>
                <tbody class="divide-y divide-dc-border">
                  <template v-for="group in visibleLogGroups" :key="group.key">
                    <tr v-if="groupByActorEmail" class="bg-dc-cream/70">
                      <td colspan="6" class="px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                        <span class="text-dc-ink">{{ group.actorLabel }}</span>
                        <span class="ml-2">{{ group.count }} item{{ group.count === 1 ? '' : 's' }}</span>
                      </td>
                    </tr>
                    <tr v-for="log in group.logs" :key="log.id">
                      <td class="px-4 py-2.5 align-top font-mono text-[11px] font-bold uppercase leading-snug tracking-wide text-dc-gray">{{ formatDateTime(log.created_at) }}</td>
                      <td class="px-4 py-2.5 align-top">
                        <p class="w-full truncate text-sm font-semibold text-dc-ink">{{ log.actor_email ?? 'System' }}</p>
                        <p class="mt-1 font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">{{ log.actor_role ?? '-' }}</p>
                      </td>
                      <td class="px-4 py-2.5 align-top font-mono text-[11px] font-bold uppercase tracking-wide text-dc-ink">
                        <span class="block truncate">{{ actionLabel(log.action) }}</span>
                      </td>
                      <td class="px-4 py-2.5 align-top">
                        <p class="w-full truncate font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ log.target_type ?? '-' }}</p>
                        <p class="mt-1 w-full truncate text-xs text-dc-gray">{{ log.target_id ?? '-' }}</p>
                      </td>
                      <td class="px-4 py-2.5 align-top text-sm text-dc-gray">
                        <span class="block w-full truncate">{{ metadataSummary(log) }}</span>
                      </td>
                      <td class="px-4 py-2.5 align-top font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                        <span class="block truncate">{{ log.ip_address ?? '-' }}</span>
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </template>
          <div v-if="orderedLogs.length > AUDIT_LOG_PAGE_SIZE" class="pagination-footer shrink-0">
            <p class="pagination-summary">
              Showing {{ pageStart }}-{{ pageEnd }} of {{ orderedLogs.length }}
            </p>
            <div class="pagination-controls">
              <button
                type="button"
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
                type="button"
                class="pagination-button"
                :disabled="page === pageCount"
                @click="goToPage(page + 1)"
              >
                Next
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
