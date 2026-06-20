<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref, watch } from 'vue';
import { z } from 'zod';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminOrganizersPageSkeleton from '@/src/components/ui/page-skeletons/AdminOrganizersPageSkeleton.vue';
import { fetchAdminOrganizers, fetchAdminSession, queryKeys, type OrganizerMembership, type OrganizerMembershipsResponse } from '@/src/lib/api';
import type { AdminRole } from '@/types/supabase';

const addOrganizerSchema = z.object({
  email: z.string().trim().email('Enter a valid organizer email.'),
  display_name: z.string().trim().optional(),
  role: z.enum(['owner', 'organizer']),
});

const queryClient = useQueryClient();
const actionError = ref('');
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
const authMode = computed(() => organizersQuery.data.value?.auth_mode ?? 'supabase');
const currentUserRole = computed<AdminRole | null>(() => adminSessionQuery.data.value?.user?.role ?? null);
const currentUserEmail = computed(() => adminSessionQuery.data.value?.user?.email?.toLowerCase() ?? null);
const activeOrganizers = computed(() => organizers.value.filter((organizer) => organizer.status === 'active'));
const ownerCount = computed(() => activeOrganizers.value.filter((organizer) => organizer.role === 'owner').length);
const loading = computed(() => organizersQuery.isPending.value);
const error = computed(() => actionError.value || organizersQuery.error.value?.message || '');
const addOrganizerValidation = computed(() => addOrganizerSchema.safeParse(form));
const canAddOrganizer = computed(() => addOrganizerValidation.value.success && !addOrganizerMutation.isPending.value);
const roleOptions = computed<Array<{ value: AdminRole; label: string }>>(() => {
  if (currentUserRole.value === 'owner') {
    return [
      { value: 'organizer', label: 'Organizer' },
      { value: 'owner', label: 'Owner' },
    ];
  }

  return [{ value: 'organizer', label: 'Organizer' }];
});

watch(currentUserRole, (role) => {
  if (role !== 'owner' && form.role === 'owner') {
    form.role = 'organizer';
  }
}, { immediate: true });

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
    actionError.value = caught instanceof Error ? caught.message : 'Unable to add organizer';
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
  if (!canAddOrganizer.value) {
    actionError.value = 'Enter a valid organizer email.';
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
  if (authMode.value === 'local' || organizer.status !== 'active' || disableOrganizerMutation.isPending.value) return false;
  if (currentUserEmail.value && organizer.email.toLowerCase() === currentUserEmail.value) return false;

  if (organizer.role === 'owner') {
    return currentUserRole.value === 'owner' && ownerCount.value > 1;
  }

  return currentUserRole.value === 'owner' || currentUserRole.value === 'organizer';
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
  return role === 'owner' ? 'Owner' : 'Organizer';
}
</script>

<template>
  <div class="editorial-page">
    <div class="editorial-wrap">
      <div class="grid gap-6 border-b border-dc-ink pb-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
        <div>
          <p class="editorial-eyebrow">admin security</p>
          <h1 class="editorial-title max-w-4xl">Organizer Access</h1>
          <p class="mt-4 max-w-2xl text-base leading-7 text-dc-gray sm:text-lg">
            Keep the organizer list tight, current, and easy to trust.
          </p>

          <div class="mt-5 flex flex-wrap gap-2">
            <span class="inline-flex min-h-10 items-center rounded-md border border-dc-border bg-dc-paper px-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-dc-gray">
              {{ activeOrganizers.length }} active
            </span>
            <span class="inline-flex min-h-10 items-center rounded-md border border-dc-border bg-dc-paper px-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-dc-gray">
              {{ ownerCount }} owner{{ ownerCount === 1 ? '' : 's' }}
            </span>
            <span
              v-if="currentUserRole"
              class="inline-flex min-h-10 items-center rounded-md border border-dc-border bg-dc-paper px-3 font-mono text-[11px] font-bold uppercase tracking-[0.16em]"
              :class="currentUserRole === 'owner' ? 'text-dc-ink' : 'text-dc-gray'"
            >
              Your access: {{ roleLabel(currentUserRole) }}
            </span>
          </div>
        </div>

        <aside class="rounded-lg border border-dc-border bg-dc-paper px-5 py-4 shadow-[0_1px_0_rgba(17,17,17,0.05)]">
          <p class="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-dc-pink">who can do what</p>
          <div class="mt-3 space-y-3 text-sm leading-6 text-dc-gray">
            <p>
              <span class="font-semibold text-dc-ink">Owners</span> can add owners or organizers, and can disable other owners.
            </p>
            <p>
              <span class="font-semibold text-dc-ink">Organizers</span> can add and disable organizers only.
            </p>
          </div>
        </aside>
      </div>

      <div v-if="error" class="mb-6 rounded-md border-2 border-red-700 bg-red-50 p-4 text-sm font-semibold text-red-800">
        {{ error }}
      </div>

      <AdminOrganizersPageSkeleton v-if="loading" />

      <template v-else>
        <div v-if="authMode === 'local'" class="editorial-panel mb-6 p-6">
          <p class="editorial-eyebrow">local fallback</p>
          <h2 class="mt-2 text-2xl font-black text-dc-ink">Supabase auth is not configured</h2>
          <p class="mt-3 max-w-2xl text-sm leading-6 text-dc-gray">
            Local development is using the shared admin password. Organizer email management becomes available once Supabase URL, anon key, and service-role key are configured.
          </p>
        </div>

        <form v-else class="mb-5 rounded-md border border-dc-border bg-dc-paper p-4 sm:p-5" @submit.prevent="submitOrganizer">
          <div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p class="editorial-eyebrow mb-1">add access</p>
              <h2 class="text-xl font-black tracking-tight text-dc-ink">Invite a trusted organizer</h2>
            </div>
            <p class="max-w-md text-sm leading-6 text-dc-gray">
              Add one email at a time so access stays deliberate.
            </p>
          </div>
          <div class="grid gap-3 md:grid-cols-[1.1fr_0.9fr_150px_auto] md:items-end">
          <label>
            <span class="editorial-label">Email</span>
            <input v-model="form.email" required type="email" class="editorial-input mt-2 font-mono" placeholder="organizer@devcongress.org">
          </label>
          <label>
            <span class="editorial-label">Display name</span>
            <input v-model="form.display_name" class="editorial-input mt-2 font-mono" placeholder="Optional">
          </label>
          <AppDropdown v-model="form.role" label="Role" :options="roleOptions" menu-class="min-w-48" />
          <button class="editorial-action min-h-[50px] justify-center px-5 disabled:cursor-not-allowed disabled:opacity-60" :disabled="!canAddOrganizer">
            {{ addOrganizerMutation.isPending.value ? 'Saving...' : 'Add Email' }}
          </button>
          </div>
        </form>

        <section class="overflow-hidden rounded-md border border-dc-border bg-dc-paper">
          <div class="flex flex-col gap-2 border-b border-dc-border bg-dc-paper-warm px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="editorial-eyebrow mb-1">allowlist</p>
              <h2 class="text-xl font-black tracking-tight text-dc-ink">Current access</h2>
            </div>
            <p class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray">
              {{ organizers.length }} total
            </p>
          </div>

          <div v-if="organizers.length === 0" class="px-4 py-6 text-sm text-dc-gray">
            No organizer emails have been added yet.
          </div>

          <div v-else class="divide-y divide-dc-border">
            <article
              v-for="organizer in organizers"
              :key="organizer.id"
              class="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] md:items-center"
              :class="{ 'opacity-55': organizer.status === 'disabled' }"
            >
              <div class="min-w-0">
                <h3 class="truncate font-mono text-sm font-black text-dc-ink">{{ organizer.email }}</h3>
                <p class="mt-1 truncate text-sm text-dc-gray">
                  {{ organizer.display_name || 'No display name' }}
                  <span class="mx-2 text-dc-border">/</span>
                  Last login: {{ formatDateTime(organizer.last_login_at) }}
                </p>
              </div>
              <div class="font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray md:text-center">
                {{ roleLabel(organizer.role) }}
              </div>
              <div class="font-mono text-[11px] font-bold uppercase tracking-wide md:text-center" :class="organizer.status === 'active' ? 'text-dc-success' : 'text-dc-gray'">
                {{ organizer.status }}
              </div>
              <button
                class="motion-press justify-self-start rounded-md border border-dc-border bg-dc-paper px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:cursor-not-allowed disabled:opacity-40 md:justify-self-end"
                :disabled="!canDisableOrganizer(organizer)"
                type="button"
                @click="disableOrganizer(organizer)"
              >
                Disable
              </button>
            </article>
          </div>
        </section>
      </template>
    </div>
  </div>
</template>
