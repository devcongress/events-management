<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { z } from 'zod';
import AppDropdown from '@/src/components/AppDropdown.vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import OrganizerRoleBadge from '@/src/components/OrganizerRoleBadge.vue';
import AdminOrganizersPageSkeleton from '@/src/components/ui/page-skeletons/AdminOrganizersPageSkeleton.vue';
import { fetchAdminOrganizers, fetchAdminSession, queryKeys, type OrganizerMembership, type OrganizerMembershipsResponse } from '@/src/lib/api';
import type { AdminRole } from '@/types/supabase';

const addOrganizerSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  display_name: z.string().trim().min(1, 'Enter a display name.').max(120, 'Keep the display name under 120 characters.'),
  role: z.enum(['owner', 'organizer', 'volunteer']),
});

const queryClient = useQueryClient();
const actionError = ref('');
const showEmails = ref(false);
const roleUpdatingId = ref<string | null>(null);
const form = reactive({
  email: '',
  display_name: '',
  role: 'organizer' as AdminRole,
});
const organizersQuery = useQuery({
  queryKey: queryKeys.adminOrganizers,
  queryFn: fetchAdminOrganizers,
});
const adminSessionQuery = useQuery({
  queryKey: queryKeys.adminSession,
  queryFn: fetchAdminSession,
});

const organizers = computed(() => organizersQuery.data.value?.organizers ?? []);
const currentUserRole = computed<AdminRole | null>(() => adminSessionQuery.data.value?.user?.role ?? null);
const currentUserEmail = computed(() => adminSessionQuery.data.value?.user?.email?.toLowerCase() ?? null);
const canRevealEmails = computed(() => currentUserRole.value === 'owner');
const activeOrganizers = computed(() => organizers.value.filter((organizer) => organizer.status === 'active'));
const ownerCount = computed(() => activeOrganizers.value.filter((organizer) => organizer.role === 'owner').length);
const loading = computed(() => organizersQuery.isPending.value);
const error = computed(() => actionError.value || organizersQuery.error.value?.message || '');
const organizerPage = ref(1);
const organizersPerPage = 10;
const organizerPageCount = computed(() => Math.max(1, Math.ceil(organizers.value.length / organizersPerPage)));
const organizerPageStart = computed(() => (organizerPage.value - 1) * organizersPerPage);
const organizerPageEnd = computed(() => Math.min(organizers.value.length, organizerPageStart.value + organizersPerPage));
const paginatedOrganizers = computed(() => organizers.value.slice(organizerPageStart.value, organizerPageEnd.value));
const addOrganizerValidation = computed(() => addOrganizerSchema.safeParse(form));
const canAddOrganizer = computed(() => addOrganizerValidation.value.success && !addOrganizerMutation.isPending.value);
const memberRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'organizer', label: 'Organizer' },
  { value: 'volunteer', label: 'Volunteer' },
];
const roleOptions = computed<Array<{ value: AdminRole; label: string }>>(() => {
  if (currentUserRole.value === 'owner') {
    return [
      { value: 'organizer', label: 'Organizer' },
      { value: 'volunteer', label: 'Volunteer' },
      { value: 'owner', label: 'Owner' },
    ];
  }

  return [
    { value: 'organizer', label: 'Organizer' },
    { value: 'volunteer', label: 'Volunteer' },
  ];
});

watch(currentUserRole, (role) => {
  if (role !== 'owner' && form.role === 'owner') {
    form.role = 'organizer';
  }
  if (role !== 'owner') showEmails.value = false;
}, { immediate: true });

watch(organizerPageCount, (pageCount) => {
  if (organizerPage.value > pageCount) {
    organizerPage.value = pageCount;
  }
});

async function readError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error ?? `Request failed: ${response.status}`;
}

const addOrganizerMutation = useMutation({
  mutationFn: async () => {
    const parsed = addOrganizerSchema.parse(form);
    const response = await fetch('/api/admin/organizers', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: parsed.email,
        display_name: parsed.display_name ?? '',
        role: parsed.role,
      }),
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    return response.json() as Promise<OrganizerMembership>;
  },
  onSuccess: async () => {
    actionError.value = '';
    form.email = '';
    form.display_name = '';
    form.role = 'organizer';
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
  onError: (caught) => {
    actionError.value = caught instanceof Error ? caught.message : 'Unable to add team member';
  },
});

const updateOrganizerRoleMutation = useMutation({
  mutationFn: async ({ organizerId, role }: { organizerId: string; role: 'organizer' | 'volunteer' }) => {
    const response = await fetch(`/api/admin/organizers/${organizerId}/role`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    return response.json() as Promise<OrganizerMembership>;
  },
  onMutate: async ({ organizerId, role }) => {
    actionError.value = '';
    roleUpdatingId.value = organizerId;
    await queryClient.cancelQueries({ queryKey: queryKeys.adminOrganizers });
    const previous = queryClient.getQueryData<OrganizerMembershipsResponse>(queryKeys.adminOrganizers);
    if (previous) {
      queryClient.setQueryData<OrganizerMembershipsResponse>(queryKeys.adminOrganizers, {
        ...previous,
        organizers: previous.organizers.map((organizer) => organizer.id === organizerId
          ? { ...organizer, role }
          : organizer),
      });
    }
    return { previous };
  },
  onError: (caught, _variables, context) => {
    if (context?.previous) {
      queryClient.setQueryData(queryKeys.adminOrganizers, context.previous);
    }
    actionError.value = caught instanceof Error ? caught.message : 'Unable to change member role.';
  },
  onSettled: () => {
    roleUpdatingId.value = null;
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
});

const disableOrganizerMutation = useMutation({
  mutationFn: async (organizerId: string) => {
    const response = await fetch(`/api/admin/organizers/${organizerId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    return response.json() as Promise<OrganizerMembership>;
  },
  onMutate: async (organizerId) => {
    actionError.value = '';
    await queryClient.cancelQueries({ queryKey: queryKeys.adminOrganizers });
    const previous = queryClient.getQueryData<OrganizerMembershipsResponse>(queryKeys.adminOrganizers);
    if (previous) {
      queryClient.setQueryData<OrganizerMembershipsResponse>(queryKeys.adminOrganizers, {
        ...previous,
        organizers: previous.organizers.map((organizer) => organizer.id === organizerId
          ? { ...organizer, status: 'disabled' }
          : organizer),
      });
    }
    return { previous };
  },
  onError: (caught, _organizerId, context) => {
    if (context?.previous) {
      queryClient.setQueryData(queryKeys.adminOrganizers, context.previous);
    }
    actionError.value = caught instanceof Error ? caught.message : 'Unable to disable organizer';
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
});

function submitOrganizer() {
  if (!addOrganizerValidation.value.success) {
    actionError.value = addOrganizerValidation.value.error.issues[0]?.message ?? 'Check the access details.';
    return;
  }
  if (addOrganizerMutation.isPending.value) {
    return;
  }
  actionError.value = '';
  addOrganizerMutation.mutate();
}

function disableOrganizer(organizer: OrganizerMembership) {
  if (organizer.status !== 'active' || disableOrganizerMutation.isPending.value) return;
  disableOrganizerMutation.mutate(organizer.id);
}

function canDisableOrganizer(organizer: OrganizerMembership): boolean {
  if (organizer.status !== 'active' || disableOrganizerMutation.isPending.value) return false;
  if (currentUserEmail.value && organizer.email.toLowerCase() === currentUserEmail.value) return false;

  if (organizer.role === 'owner') {
    return currentUserRole.value === 'owner' && ownerCount.value > 1;
  }

  return currentUserRole.value === 'owner' || currentUserRole.value === 'organizer';
}

function canChangeOrganizerRole(organizer: OrganizerMembership): boolean {
  return currentUserRole.value === 'owner'
    && organizer.status === 'active'
    && organizer.role !== 'owner'
    && organizer.email.toLowerCase() !== currentUserEmail.value;
}

function changeOrganizerRole(organizer: OrganizerMembership, value: string | number) {
  if (!canChangeOrganizerRole(organizer) || updateOrganizerRoleMutation.isPending.value) return;
  if (value !== 'organizer' && value !== 'volunteer') return;
  if (organizer.role === value) return;
  updateOrganizerRoleMutation.mutate({ organizerId: organizer.id, role: value });
}

function formatDateTime(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function roleLabel(role: AdminRole): string {
  if (role === 'owner') return 'Owner';
  if (role === 'volunteer') return 'Volunteer';
  return 'Organizer';
}

function memberName(organizer: OrganizerMembership): string {
  return organizer.display_name?.trim() || 'Unnamed member';
}

function unavailableActionLabel(organizer: OrganizerMembership): string {
  if (organizer.status === 'disabled') return 'Disabled';
  if (currentUserEmail.value && organizer.email.toLowerCase() === currentUserEmail.value) return 'You';
  if (organizer.role === 'owner' && currentUserRole.value !== 'owner') return 'Owner only';
  if (organizer.role === 'owner' && ownerCount.value <= 1) return 'Protected';
  return 'Unavailable';
}

function toggleEmailVisibility() {
  if (!canRevealEmails.value) return;
  showEmails.value = !showEmails.value;
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap py-5 lg:py-6">
      <header class="flex flex-col gap-5 border-b border-dc-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="editorial-eyebrow">People</p>
          <h1 class="mt-1 text-3xl font-semibold tracking-tight text-dc-ink sm:text-4xl">Access directory</h1>
          <p class="mt-2 max-w-xl text-sm leading-6 text-dc-gray">
            Manage who can operate DevCongress and what they can reach.
          </p>
        </div>

        <dl class="grid grid-cols-3 overflow-hidden rounded-lg border border-dc-border bg-dc-paper sm:min-w-[24rem]">
          <div class="px-3 py-2.5">
            <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Active</dt>
            <dd class="mt-1 text-lg font-semibold text-dc-ink">{{ activeOrganizers.length }}</dd>
          </div>
          <div class="border-l border-dc-border px-3 py-2.5">
            <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Owners</dt>
            <dd class="mt-1 text-lg font-semibold text-dc-ink">{{ ownerCount }}</dd>
          </div>
          <div class="border-l border-dc-border px-3 py-2.5">
            <dt class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">Your role</dt>
            <dd class="mt-1 truncate text-sm font-semibold text-dc-ink">{{ currentUserRole ? roleLabel(currentUserRole) : '—' }}</dd>
          </div>
        </dl>
      </header>

      <div v-if="error" class="mt-4 rounded-md border border-red-700 bg-red-50 p-4 text-sm font-medium text-red-800">
        {{ error }}
      </div>

      <AdminOrganizersPageSkeleton v-if="loading" />

      <div v-else class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <form class="rounded-lg border border-dc-border bg-dc-paper p-4 xl:col-start-2 xl:row-start-1" @submit.prevent="submitOrganizer">
          <p class="editorial-eyebrow">Invite</p>
          <h2 class="mt-1 text-lg font-semibold text-dc-ink">Add access</h2>
          <p class="mt-1 text-xs leading-5 text-dc-gray">Add one person and choose the access they need.</p>
          <div class="mt-3 grid gap-2.5">
            <label>
              <span class="editorial-label">Email</span>
              <input v-model="form.email" required type="email" autocomplete="email" class="editorial-input mt-1.5 !min-h-10 !rounded-md !px-3 !py-2 !text-sm" placeholder="person@devcongress.org">
            </label>
            <label>
              <span class="editorial-label">Display name</span>
              <input v-model="form.display_name" required maxlength="120" autocomplete="name" class="editorial-input mt-1.5 !min-h-10 !rounded-md !px-3 !py-2 !text-sm" placeholder="Full name">
            </label>
            <AppDropdown v-model="form.role" label="Role" :options="roleOptions" density="compact" menu-class="min-w-48" teleport />
            <button class="editorial-action min-h-10 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50" :disabled="!canAddOrganizer">
              {{ addOrganizerMutation.isPending.value ? 'Adding…' : 'Add person' }}
            </button>
          </div>
        </form>

        <section class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-dc-border bg-dc-paper xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <div class="flex items-center justify-between gap-4 border-b border-dc-border px-4 py-3 sm:px-5">
            <div>
              <h2 class="text-lg font-semibold text-dc-ink">Team access</h2>
              <p class="mt-0.5 text-xs text-dc-gray">Names, roles, and recent sign-in activity.</p>
            </div>
            <div class="flex items-center gap-3">
              <p class="font-mono text-[11px] font-semibold uppercase tracking-wide text-dc-gray">
                {{ organizers.length }} total
              </p>
              <button
                v-if="canRevealEmails"
                type="button"
                class="motion-press inline-flex min-h-9 items-center gap-2 rounded-md border border-dc-border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray hover:border-dc-pink hover:text-dc-pink"
                :aria-pressed="showEmails"
                @click="toggleEmailVisibility"
              >
                <svg v-if="showEmails" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.7M9.9 4.2A10.8 10.8 0 0112 4c5.2 0 8.6 4.4 9.6 6a2.5 2.5 0 010 2.8 15.8 15.8 0 01-2.1 2.6M6.2 6.2A16.8 16.8 0 002.4 10a2.5 2.5 0 000 2.8C3.4 14.4 6.8 19 12 19a10.6 10.6 0 004-.8" />
                </svg>
                <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.4 10a2.5 2.5 0 000 2.8C3.4 14.4 6.8 19 12 19s8.6-4.6 9.6-6.2a2.5 2.5 0 000-2.8C20.6 8.4 17.2 4 12 4S3.4 8.4 2.4 10z" />
                  <circle cx="12" cy="11.5" r="2.5" />
                </svg>
                {{ showEmails ? 'Hide emails' : 'Show emails' }}
              </button>
            </div>
          </div>

          <div v-if="organizers.length === 0" class="px-4 py-6 text-sm text-dc-gray">
            No access emails have been added yet.
          </div>

          <div v-else class="flex-1 overflow-x-auto">
            <table class="w-full min-w-[46rem] border-collapse text-left">
              <thead class="bg-dc-paper-warm">
                <tr class="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-dc-gray">
                  <th class="px-5 py-2.5">Person</th>
                  <th class="px-3 py-2.5">Role</th>
                  <th class="px-3 py-2.5">Last sign-in</th>
                  <th class="px-3 py-2.5">Status</th>
                  <th class="px-5 py-2.5"><span class="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-dc-border">
                <tr v-for="organizer in paginatedOrganizers" :key="organizer.id" :class="{ 'opacity-55': organizer.status === 'disabled' }">
                  <td class="px-5 py-3">
                    <span class="flex min-w-0 items-center gap-3">
                      <NaviiAvatar :seed="organizer.id" :title="`${memberName(organizer)} avatar`" :size="36" />
                      <span class="min-w-0">
                        <span class="block max-w-[16rem] truncate text-sm font-semibold text-dc-ink">{{ memberName(organizer) }}</span>
                        <span v-if="showEmails" class="mt-0.5 block max-w-[16rem] truncate text-xs text-dc-gray">{{ organizer.email }}</span>
                        <span v-else class="mt-0.5 block text-xs text-dc-gray">Email hidden</span>
                      </span>
                    </span>
                  </td>
                  <td class="px-3 py-3 text-xs font-medium text-dc-ink">
                    <AppDropdown
                      v-if="canChangeOrganizerRole(organizer)"
                      class="w-32"
                      :model-value="organizer.role"
                      :options="memberRoleOptions"
                      :disabled="roleUpdatingId === organizer.id"
                      density="slim"
                      menu-class="min-w-32"
                      teleport
                      @update:model-value="changeOrganizerRole(organizer, $event)"
                    />
                    <OrganizerRoleBadge v-else :role="organizer.role" />
                  </td>
                  <td class="px-3 py-3 text-xs text-dc-gray">{{ formatDateTime(organizer.last_login_at) }}</td>
                  <td class="px-3 py-3">
                    <span class="inline-flex items-center gap-2 text-xs font-medium capitalize" :class="organizer.status === 'active' ? 'text-dc-success' : 'text-dc-gray'">
                      <span class="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{{ organizer.status }}
                    </span>
                  </td>
                  <td class="px-5 py-3 text-right">
                    <button
                      v-if="canDisableOrganizer(organizer)"
                      class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink"
                      type="button"
                      @click="disableOrganizer(organizer)"
                    >
                      Disable
                    </button>
                    <span v-else class="font-mono text-[9px] font-semibold uppercase tracking-wide text-dc-gray">{{ unavailableActionLabel(organizer) }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div v-if="organizers.length > organizersPerPage" class="pagination-footer">
            <p class="pagination-summary">
              Showing {{ organizerPageStart + 1 }}-{{ organizerPageEnd }} of {{ organizers.length }}
            </p>
            <div class="pagination-controls" aria-label="Organizer allowlist pagination">
              <button
                type="button"
                class="pagination-button"
                :disabled="organizerPage === 1"
                @click="organizerPage -= 1"
              >
                Previous
              </button>
              <span class="pagination-count" aria-live="polite">Page {{ organizerPage }} / {{ organizerPageCount }}</span>
              <button
                type="button"
                class="pagination-button"
                :disabled="organizerPage === organizerPageCount"
                @click="organizerPage += 1"
              >
                Next
              </button>
            </div>
          </div>
        </section>

        <section class="overflow-hidden rounded-lg border border-dc-border bg-dc-paper xl:col-start-2 xl:row-start-2" aria-labelledby="access-levels-title">
          <div class="border-b border-dc-border px-4 py-3">
            <h2 id="access-levels-title" class="text-sm font-semibold text-dc-ink">Access levels</h2>
          </div>
          <dl class="divide-y divide-dc-border">
            <div class="px-4 py-3">
              <dt class="flex items-center justify-between gap-3 text-xs font-semibold text-dc-ink">
                <span>Owner</span>
                <OrganizerRoleBadge role="owner" icon-only />
              </dt>
              <dd class="mt-1 text-xs leading-5 text-dc-gray">Full access, including owners and access management.</dd>
            </div>
            <div class="px-4 py-3">
              <dt class="flex items-center justify-between gap-3 text-xs font-semibold text-dc-ink">
                <span>Organizer</span>
                <OrganizerRoleBadge role="organizer" icon-only />
              </dt>
              <dd class="mt-1 text-xs leading-5 text-dc-gray">Runs events and manages organizers or volunteers.</dd>
            </div>
            <div class="px-4 py-3">
              <dt class="flex items-center justify-between gap-3 text-xs font-semibold text-dc-ink">
                <span>Volunteer</span>
                <OrganizerRoleBadge role="volunteer" icon-only />
              </dt>
              <dd class="mt-1 text-xs leading-5 text-dc-gray">Sees only Annual Conference tasks assigned to them.</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  </div>
</template>
