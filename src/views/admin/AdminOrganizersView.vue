<script setup lang="ts">
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { z } from 'zod';
import AppDropdown from '@/src/components/AppDropdown.vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import OrganizerRoleBadge from '@/src/components/OrganizerRoleBadge.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import AdminOrganizersPageSkeleton from '@/src/components/ui/page-skeletons/AdminOrganizersPageSkeleton.vue';
import {
  fetchAdminOrganizers,
  fetchAdminSession,
  fetchAnnualConferenceAccess,
  fetchAnnualConferenceEditions,
  queryKeys,
  updateAnnualConferenceAccessGrant,
  type AnnualConferenceAccessResponse,
  type OrganizerMembership,
  type OrganizerMembershipsResponse,
} from '@/src/lib/api';
import type { AdminRole } from '@/types/supabase';
import {
  ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS,
  type AnnualConferenceCapability,
} from '@/lib/annual-conference-capabilities';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';

const addOrganizerSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  display_name: z.string().trim().min(1, 'Enter a display name.').max(120, 'Keep the display name under 120 characters.'),
  role: z.enum(['owner', 'organizer', 'volunteer']),
});

const queryClient = useQueryClient();
const actionError = ref('');
const showEmails = ref(false);
const roleUpdatingId = ref<string | null>(null);
const enableUpdatingId = ref<string | null>(null);
const removalCandidate = ref<OrganizerMembership | null>(null);
const delegationMemberId = ref('');
const responsibilityMemberId = ref<string | null>(null);
const responsibilityYear = ref(ACTIVE_ANNUAL_CONFERENCE_EDITION.year);
const responsibilityUpdating = ref<AnnualConferenceCapability | null>(null);
const pageContent = ref<HTMLElement | null>(null);
const responsibilityPanel = ref<HTMLElement | null>(null);
const responsibilityCloseButton = ref<HTMLButtonElement | null>(null);
let responsibilityTrigger: HTMLElement | null = null;
let previousBodyOverflow = '';
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
const editionsQuery = useQuery({
  queryKey: queryKeys.annualConferenceEditions,
  queryFn: fetchAnnualConferenceEditions,
  enabled: computed(() => currentUserRole.value === 'owner'),
});
const accessQuery = useQuery({
  queryKey: computed(() => queryKeys.annualConferenceAccess(responsibilityYear.value)),
  queryFn: () => fetchAnnualConferenceAccess(responsibilityYear.value),
  enabled: computed(() => currentUserRole.value === 'owner' && Boolean(responsibilityMemberId.value)),
});

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
const responsibilityEditionOptions = computed(() => (editionsQuery.data.value?.editions ?? []).map((edition) => ({
  value: String(edition.year),
  label: edition.label,
})));
const delegationMemberOptions = computed(() => organizers.value
  .filter((member) => member.status === 'active' && member.role === 'volunteer')
  .map((member) => ({
    value: member.id,
    label: `${memberName(member)} · ${roleLabel(member.role)}`,
  })));
const delegationMember = computed(() => organizers.value.find((member) => member.id === delegationMemberId.value) ?? null);
const responsibilityMember = computed(() => organizers.value.find((member) => member.id === responsibilityMemberId.value) ?? null);
const responsibilityAccessMember = computed(() => accessQuery.data.value?.members.find((member) => member.id === responsibilityMemberId.value) ?? null);
const responsibilitySections = computed(() => ['Work plan', 'Timeline', 'Volunteers'].map((section) => ({
  section,
  capabilities: ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS.filter((definition) => definition.section === section),
})));
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

watch([currentUserRole, responsibilityMember], ([role, member]) => {
  if (responsibilityMemberId.value && (role !== 'owner' || !member)) {
    void closeResponsibilities();
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

const updateResponsibilityMutation = useMutation({
  mutationFn: ({ capability, enabled }: { capability: AnnualConferenceCapability; enabled: boolean }) => {
    if (!responsibilityMemberId.value) throw new Error('Choose a team member first.');
    return updateAnnualConferenceAccessGrant(
      responsibilityYear.value,
      responsibilityMemberId.value,
      capability,
      enabled,
    );
  },
  onMutate: async ({ capability, enabled }) => {
    actionError.value = '';
    responsibilityUpdating.value = capability;
    const queryKey = queryKeys.annualConferenceAccess(responsibilityYear.value);
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<AnnualConferenceAccessResponse>(queryKey);
    if (previous && responsibilityMemberId.value) {
      queryClient.setQueryData<AnnualConferenceAccessResponse>(queryKey, {
        ...previous,
        members: previous.members.map((member) => member.id !== responsibilityMemberId.value ? member : {
          ...member,
          capabilities: enabled
            ? [...new Set([...member.capabilities, capability])]
            : member.capabilities.filter((item) => item !== capability),
        }),
      });
    }
    return { previous, queryKey };
  },
  onError: (caught, _variables, context) => {
    if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
    actionError.value = caught instanceof Error ? caught.message : 'Unable to update conference responsibilities.';
  },
  onSettled: (_data, _error, _variables, context) => {
    responsibilityUpdating.value = null;
    if (context?.queryKey) void queryClient.invalidateQueries({ queryKey: context.queryKey });
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

const enableOrganizerMutation = useMutation({
  mutationFn: async (organizerId: string) => {
    const response = await fetch(`/api/admin/organizers/${organizerId}/enable`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json() as Promise<OrganizerMembership>;
  },
  onMutate: (organizerId) => {
    actionError.value = '';
    enableUpdatingId.value = organizerId;
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
  onError: (caught) => {
    actionError.value = caught instanceof Error ? caught.message : 'Unable to re-enable member access.';
  },
  onSettled: () => {
    enableUpdatingId.value = null;
  },
});

const removeOrganizerMutation = useMutation({
  mutationFn: async (organizerId: string) => {
    const response = await fetch(`/api/admin/organizers/${organizerId}/permanent`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json() as Promise<{ removed: true; id: string }>;
  },
  onMutate: () => {
    actionError.value = '';
  },
  onSuccess: async ({ id }) => {
    if (delegationMemberId.value === id) delegationMemberId.value = '';
    if (responsibilityMemberId.value === id) await closeResponsibilities();
    removalCandidate.value = null;
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
  onError: (caught) => {
    actionError.value = caught instanceof Error ? caught.message : 'Unable to permanently remove member access.';
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

function enableOrganizer(organizer: OrganizerMembership) {
  if (currentUserRole.value !== 'owner' || organizer.status !== 'disabled' || enableOrganizerMutation.isPending.value) return;
  enableOrganizerMutation.mutate(organizer.id);
}

function requestPermanentRemoval(organizer: OrganizerMembership) {
  if (currentUserRole.value !== 'owner' || organizer.status !== 'disabled') return;
  removalCandidate.value = organizer;
}

function cancelPermanentRemoval() {
  if (removeOrganizerMutation.isPending.value) return;
  removalCandidate.value = null;
}

function confirmPermanentRemoval() {
  if (!removalCandidate.value || removeOrganizerMutation.isPending.value) return;
  removeOrganizerMutation.mutate(removalCandidate.value.id);
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

function setPageInteractionLocked(locked: boolean) {
  if (typeof document === 'undefined') return;

  if (locked) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    pageContent.value?.setAttribute('inert', '');
    return;
  }

  document.body.style.overflow = previousBodyOverflow;
  pageContent.value?.removeAttribute('inert');
}

async function openResponsibilities(organizer: OrganizerMembership, event: MouseEvent) {
  if (currentUserRole.value !== 'owner' || organizer.status !== 'active') return;
  delegationMemberId.value = organizer.id;
  responsibilityTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  responsibilityMemberId.value = organizer.id;
  setPageInteractionLocked(true);
  await nextTick();
  responsibilityCloseButton.value?.focus();
}

function openSelectedResponsibilities(event: MouseEvent) {
  if (!delegationMember.value) return;
  void openResponsibilities(delegationMember.value, event);
}

async function closeResponsibilities() {
  if (!responsibilityMemberId.value) return;
  responsibilityMemberId.value = null;
  setPageInteractionLocked(false);
  await nextTick();
  responsibilityTrigger?.focus();
  responsibilityTrigger = null;
}

function handleResponsibilityPanelKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    void closeResponsibilities();
    return;
  }

  if (event.key !== 'Tab' || !responsibilityPanel.value) return;

  const focusable = Array.from(responsibilityPanel.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'));
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function responsibilityIsInherited(capability: AnnualConferenceCapability): boolean {
  return responsibilityAccessMember.value?.inherited_capabilities.includes(capability) ?? false;
}

function responsibilityIsEnabled(capability: AnnualConferenceCapability): boolean {
  return responsibilityIsInherited(capability)
    || (responsibilityAccessMember.value?.capabilities.includes(capability) ?? false);
}

function toggleResponsibility(capability: AnnualConferenceCapability, enabled: boolean) {
  if (responsibilityIsInherited(capability) || updateResponsibilityMutation.isPending.value) return;
  updateResponsibilityMutation.mutate({ capability, enabled });
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

onUnmounted(() => {
  setPageInteractionLocked(false);
});
</script>

<template>
  <div ref="pageContent" class="editorial-page">
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

        <section
          v-if="currentUserRole === 'owner'"
          class="rounded-lg border border-dc-border bg-dc-paper p-4 xl:col-start-2 xl:row-start-2"
          aria-labelledby="delegation-section-title"
        >
          <p class="editorial-eyebrow">Delegation</p>
          <h2 id="delegation-section-title" class="mt-1 text-lg font-semibold text-dc-ink">Conference responsibilities</h2>
          <p class="mt-1 text-xs leading-5 text-dc-gray">
            Give a member access to specific Annual Conference sections without changing their role.
          </p>
          <div class="mt-3 grid gap-2.5">
            <AppDropdown
              v-model="delegationMemberId"
              label="Team member"
              placeholder="Choose a person"
              :options="delegationMemberOptions"
              density="compact"
              menu-class="min-w-64"
              teleport
            />
            <button
              type="button"
              class="editorial-action min-h-10 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!delegationMember"
              @click="openSelectedResponsibilities"
            >
              Open delegation
            </button>
          </div>
          <p class="mt-3 border-t border-dc-border pt-3 text-[11px] leading-4 text-dc-gray">
            Volunteers remain limited to assigned tasks until you grant additional access for an edition.
          </p>
        </section>

        <section class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-dc-border bg-dc-paper xl:col-start-1 xl:row-span-3 xl:row-start-1">
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
                <tr v-for="organizer in paginatedOrganizers" :key="organizer.id">
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
                    <div class="flex items-center justify-end gap-2">
                      <template v-if="currentUserRole === 'owner' && organizer.status === 'disabled'">
                        <button
                          class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink disabled:cursor-not-allowed disabled:opacity-50"
                          type="button"
                          :disabled="enableUpdatingId === organizer.id || removeOrganizerMutation.isPending.value"
                          @click="enableOrganizer(organizer)"
                        >
                          {{ enableUpdatingId === organizer.id ? 'Enabling…' : 'Re-enable' }}
                        </button>
                        <button
                          class="motion-press rounded-md border border-red-300 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-red-700 hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          type="button"
                          :disabled="enableOrganizerMutation.isPending.value || removeOrganizerMutation.isPending.value"
                          @click="requestPermanentRemoval(organizer)"
                        >
                          Remove
                        </button>
                      </template>
                      <button
                        v-if="currentUserRole === 'owner' && organizer.status === 'active' && organizer.role === 'volunteer'"
                        class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-pink hover:border-dc-pink"
                        type="button"
                        :aria-label="`Delegate Annual Conference responsibilities to ${memberName(organizer)}`"
                        @click="openResponsibilities(organizer, $event)"
                      >
                        Delegate
                      </button>
                      <button
                        v-if="canDisableOrganizer(organizer)"
                        class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray hover:border-dc-ink hover:text-dc-ink"
                        type="button"
                        @click="disableOrganizer(organizer)"
                      >
                        Disable
                      </button>
                      <span v-else-if="organizer.role === 'owner' || currentUserRole !== 'owner'" class="font-mono text-[9px] font-semibold uppercase tracking-wide text-dc-gray">{{ unavailableActionLabel(organizer) }}</span>
                    </div>
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

        <section class="overflow-hidden rounded-lg border border-dc-border bg-dc-paper xl:col-start-2 xl:row-start-3" aria-labelledby="access-levels-title">
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

  <Teleport to="body">
    <Transition name="responsibility-overlay">
      <div
        v-if="currentUserRole === 'owner' && responsibilityMember"
        class="fixed inset-0 z-[110] flex justify-end bg-dc-ink/35"
        role="presentation"
        @click.self="closeResponsibilities"
      >
        <aside
          ref="responsibilityPanel"
          class="responsibility-drawer flex h-full w-full max-w-xl flex-col border-l border-dc-border bg-dc-paper shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="conference-responsibilities-title"
          aria-describedby="conference-responsibilities-description"
          @keydown="handleResponsibilityPanelKeydown"
        >
          <header class="flex items-start justify-between gap-5 border-b border-dc-border px-5 py-5 sm:px-6">
            <div class="min-w-0">
              <p class="editorial-eyebrow">Annual Conference</p>
              <div class="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="conference-responsibilities-title" class="truncate text-xl font-semibold text-dc-ink">
                  Delegate to {{ memberName(responsibilityMember) }}
                </h2>
                <OrganizerRoleBadge :role="responsibilityMember.role" />
              </div>
              <p id="conference-responsibilities-description" class="mt-1 max-w-md text-xs leading-5 text-dc-gray">
                Grant additional access for one conference edition. Access already included in the member’s role stays protected.
              </p>
            </div>
            <button
              ref="responsibilityCloseButton"
              type="button"
              class="motion-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dc-border text-dc-gray hover:border-dc-ink hover:text-dc-ink"
              aria-label="Close responsibility delegation"
              @click="closeResponsibilities"
            >
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div class="border-b border-dc-border px-5 py-4 sm:px-6">
            <AppDropdown
              v-model="responsibilityYear"
              class="w-full"
              label="Conference edition"
              :options="responsibilityEditionOptions"
              density="compact"
              menu-class="min-w-52"
              teleport
            />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <div v-if="accessQuery.isPending.value" class="text-sm text-dc-gray" aria-live="polite">Loading responsibilities…</div>
            <div v-else-if="accessQuery.isError.value" class="rounded-md border border-red-700 bg-red-50 p-4 text-sm text-red-800" role="alert">
              Unable to load conference responsibilities.
            </div>
            <div v-else class="grid gap-6">
              <section v-for="group in responsibilitySections" :key="group.section">
                <h3 class="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-dc-gray">{{ group.section }}</h3>
                <div class="mt-2 grid gap-2">
                  <button
                    v-for="definition in group.capabilities"
                    :key="definition.value"
                    type="button"
                    class="responsibility-option motion-press flex w-full items-start justify-between gap-4 rounded-lg border px-3.5 py-3 text-left disabled:cursor-not-allowed"
                    :class="responsibilityIsEnabled(definition.value) ? 'border-dc-pink bg-[#fff7fb]' : 'border-dc-border bg-dc-paper-warm'"
                    :disabled="responsibilityIsInherited(definition.value) || responsibilityUpdating === definition.value"
                    :aria-pressed="responsibilityIsEnabled(definition.value)"
                    @click="toggleResponsibility(definition.value, !responsibilityIsEnabled(definition.value))"
                  >
                    <span>
                      <span class="block text-xs font-semibold text-dc-ink">{{ definition.label }}</span>
                      <span class="mt-1 block text-[11px] leading-4 text-dc-gray">{{ definition.description }}</span>
                      <span v-if="responsibilityIsInherited(definition.value)" class="mt-1 block font-mono text-[8px] font-semibold uppercase tracking-wide text-dc-pink">Included in role</span>
                    </span>
                    <span
                      class="responsibility-toggle mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5"
                      :class="responsibilityIsEnabled(definition.value) ? 'bg-dc-pink' : 'bg-dc-border'"
                      aria-hidden="true"
                    ><span class="responsibility-toggle-knob h-4 w-4 rounded-full bg-white shadow-sm" :class="{ 'translate-x-4': responsibilityIsEnabled(definition.value) }" /></span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>

  <ConfirmDialog
    :open="Boolean(removalCandidate)"
    title="Remove member permanently?"
    :message="removalCandidate ? `${memberName(removalCandidate)} will be removed from People & Access. Their sessions and delegated conference access will be deleted. Historical audit records and task attribution remain.` : ''"
    confirm-label="Remove permanently"
    busy-label="Removing…"
    :busy="removeOrganizerMutation.isPending.value"
    danger
    @cancel="cancelPermanentRemoval"
    @confirm="confirmPermanentRemoval"
  />
</template>

<style scoped>
.responsibility-overlay-enter-active,
.responsibility-overlay-leave-active {
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.responsibility-overlay-enter-active .responsibility-drawer,
.responsibility-overlay-leave-active .responsibility-drawer {
  transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.responsibility-overlay-enter-from,
.responsibility-overlay-leave-to {
  opacity: 0;
}

.responsibility-overlay-enter-from .responsibility-drawer,
.responsibility-overlay-leave-to .responsibility-drawer {
  transform: translateX(100%);
}

.responsibility-option {
  transition: border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.responsibility-toggle-knob {
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .responsibility-overlay-enter-active,
  .responsibility-overlay-leave-active,
  .responsibility-overlay-enter-active .responsibility-drawer,
  .responsibility-overlay-leave-active .responsibility-drawer,
  .responsibility-option,
  .responsibility-toggle-knob {
    transition-duration: 0.01ms;
  }

  .responsibility-overlay-enter-from .responsibility-drawer,
  .responsibility-overlay-leave-to .responsibility-drawer {
    transform: none;
  }
}
</style>
