<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive } from 'vue';
import AdminAuditLogPageSkeleton from '@/src/components/ui/page-skeletons/AdminAuditLogPageSkeleton.vue';
import { fetchAdminAuditLog, queryKeys, type AdminAuditLogEntry } from '@/src/lib/api';

const filters = reactive({
  actor: '',
  action: '',
  target_type: '',
});

const auditFilters = computed(() => ({
  actor: filters.actor.trim(),
  action: filters.action.trim(),
  target_type: filters.target_type.trim(),
  limit: '80',
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

function clearFilters() {
  filters.actor = '';
  filters.action = '';
  filters.target_type = '';
}
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

      <div v-else class="flex flex-1 min-h-0 flex-col">
        <section class="mb-5 rounded-md border border-dc-border bg-dc-paper p-4">
          <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem_11rem_auto] md:items-end">
            <label>
              <span class="editorial-label">Actor</span>
              <input v-model="filters.actor" type="search" class="editorial-input mt-2" placeholder="email">
            </label>
            <label>
              <span class="editorial-label">Action</span>
              <select v-model="filters.action" class="editorial-input mt-2">
                <option value="">All actions</option>
                <option v-for="action in actionOptions" :key="action" :value="action">{{ actionLabel(action) }}</option>
              </select>
            </label>
            <label>
              <span class="editorial-label">Target</span>
              <select v-model="filters.target_type" class="editorial-input mt-2">
                <option value="">All targets</option>
                <option v-for="targetType in targetTypeOptions" :key="targetType" :value="targetType">{{ targetType }}</option>
              </select>
            </label>
            <button type="button" class="editorial-secondary-action min-h-[50px] justify-center px-4" @click="clearFilters">
              Clear
            </button>
          </div>
        </section>

        <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-dc-border bg-dc-paper">
          <div class="shrink-0 flex flex-col gap-2 border-b border-dc-border bg-dc-paper-warm px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="editorial-eyebrow mb-1">activity</p>
              <h2 class="text-xl font-black tracking-tight text-dc-ink">{{ logs.length }} recent item{{ logs.length === 1 ? '' : 's' }}</h2>
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
          <div v-else class="min-h-0 flex-1 overflow-auto">
            <table class="w-full min-w-[920px] text-left">
              <thead class="sticky top-0 z-10 border-b border-dc-border bg-dc-paper-warm font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
                <tr>
                  <th class="px-4 py-3">Time</th>
                  <th class="px-4 py-3">Actor</th>
                  <th class="px-4 py-3">Action</th>
                  <th class="px-4 py-3">Target</th>
                  <th class="px-4 py-3">Summary</th>
                  <th class="px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-dc-border">
                <tr v-for="log in logs" :key="log.id">
                  <td class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ formatDateTime(log.created_at) }}</td>
                  <td class="px-4 py-3">
                    <p class="max-w-[13rem] truncate text-sm font-semibold text-dc-ink">{{ log.actor_email ?? 'System' }}</p>
                    <p class="mt-1 font-mono text-[10px] font-bold uppercase tracking-wide text-dc-gray">{{ log.actor_role ?? '-' }}</p>
                  </td>
                  <td class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-ink">{{ actionLabel(log.action) }}</td>
                  <td class="px-4 py-3">
                    <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ log.target_type ?? '-' }}</p>
                    <p class="mt-1 max-w-[10rem] truncate text-xs text-dc-gray">{{ log.target_id ?? '-' }}</p>
                  </td>
                  <td class="px-4 py-3 max-w-[20rem] truncate text-sm text-dc-gray">{{ metadataSummary(log) }}</td>
                  <td class="px-4 py-3 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">{{ log.ip_address ?? '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
