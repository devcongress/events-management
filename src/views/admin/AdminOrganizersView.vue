<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, reactive, ref } from 'vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AdminOrganizersPageSkeleton from '@/src/components/ui/page-skeletons/AdminOrganizersPageSkeleton.vue';
import { fetchAdminOrganizers, queryKeys, type OrganizerMembership, type OrganizerMembershipsResponse } from '@/src/lib/api';
import type { AdminRole } from '@/types/supabase';

const queryClient = useQueryClient();
const actionError = ref('');
const form = reactive({
  email: '',
  display_name: '',
  role: 'organizer' as AdminRole,
});
const roleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'organizer', label: 'Organizer' },
  { value: 'owner', label: 'Owner' },
];

const organizersQuery = useQuery({
  queryKey: queryKeys.adminOrganizers,
  queryFn: fetchAdminOrganizers,
});

const organizers = computed(() => organizersQuery.data.value?.organizers ?? []);
const authMode = computed(() => organizersQuery.data.value?.auth_mode ?? 'supabase');
const activeOrganizers = computed(() => organizers.value.filter((organizer) => organizer.status === 'active'));
const ownerCount = computed(() => activeOrganizers.value.filter((organizer) => organizer.role === 'owner').length);
const loading = computed(() => organizersQuery.isPending.value);
const error = computed(() => actionError.value || organizersQuery.error.value?.message || '');

async function readError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  return payload?.error ?? `Request failed: ${response.status}`;
}

const addOrganizerMutation = useMutation({
  mutationFn: async () => {
    const response = await fetch('/api/admin/organizers', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: form.email,
        display_name: form.display_name,
        role: form.role,
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
  if (addOrganizerMutation.isPending.value) return;
  addOrganizerMutation.mutate();
}

function disableOrganizer(organizer: OrganizerMembership) {
  if (organizer.status !== 'active' || disableOrganizerMutation.isPending.value) return;
  disableOrganizerMutation.mutate(organizer.id);
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
      <div class="editorial-header">
        <p class="editorial-eyebrow">admin security</p>
        <h1 class="editorial-title">Organizer Access</h1>
        <p class="editorial-copy max-w-3xl">
          Add trusted organizer emails, review active access, and disable old entries.
        </p>
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

        <form v-else class="editorial-panel mb-6 grid gap-4 p-5 md:grid-cols-[1.2fr_1fr_160px_auto] md:items-end" @submit.prevent="submitOrganizer">
          <label>
            <span class="editorial-label">Email</span>
            <input v-model="form.email" required type="email" class="editorial-input mt-2 font-mono" placeholder="organizer@devcongress.org">
          </label>
          <label>
            <span class="editorial-label">Display name</span>
            <input v-model="form.display_name" class="editorial-input mt-2 font-mono" placeholder="Optional">
          </label>
          <AppDropdown v-model="form.role" label="Role" :options="roleOptions" menu-class="min-w-48" />
          <button class="editorial-action justify-center disabled:opacity-60" :disabled="addOrganizerMutation.isPending.value">
            {{ addOrganizerMutation.isPending.value ? 'Saving...' : 'Add Email' }}
          </button>
        </form>

        <section class="editorial-panel overflow-hidden">
          <div class="border-b-2 border-dc-border bg-dc-paper-warm p-5">
            <p class="editorial-eyebrow">allowlist</p>
            <h2 class="mt-2 text-2xl font-black text-dc-ink">{{ activeOrganizers.length }} active organizer{{ activeOrganizers.length === 1 ? '' : 's' }}</h2>
          </div>

          <div v-if="organizers.length === 0" class="p-6 text-sm text-dc-gray">
            No organizer emails have been added yet.
          </div>

          <div v-else class="divide-y-2 divide-dc-border">
            <article
              v-for="organizer in organizers"
              :key="organizer.id"
              class="grid gap-4 p-5 md:grid-cols-[1fr_150px_150px_auto] md:items-center"
              :class="{ 'opacity-55': organizer.status === 'disabled' }"
            >
              <div>
                <h3 class="font-mono text-base font-black text-dc-ink">{{ organizer.email }}</h3>
                <p class="mt-1 text-sm text-dc-gray">{{ organizer.display_name || 'No display name' }}</p>
                <p class="mt-2 text-xs font-semibold uppercase tracking-wide text-dc-gray">Last login: {{ formatDateTime(organizer.last_login_at) }}</p>
              </div>
              <div class="rounded-md border-2 border-dc-border bg-dc-paper px-3 py-2 text-center font-mono text-xs font-bold uppercase tracking-wide text-dc-ink">
                {{ roleLabel(organizer.role) }}
              </div>
              <div class="rounded-md border-2 px-3 py-2 text-center font-mono text-xs font-bold uppercase tracking-wide" :class="organizer.status === 'active' ? 'border-dc-success bg-dc-success-soft text-dc-success' : 'border-dc-border bg-dc-paper-warm text-dc-gray'">
                {{ organizer.status }}
              </div>
              <button
                class="editorial-secondary-action justify-center disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="authMode === 'local' || organizer.status !== 'active' || (organizer.role === 'owner' && ownerCount <= 1) || disableOrganizerMutation.isPending.value"
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
