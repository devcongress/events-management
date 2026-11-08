<script setup lang="ts">
import { protectedFetch } from '@/src/lib/admin-session-signal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { z } from 'zod';
import AppDropdown from '@/src/components/AppDropdown.vue';
import { usePhoneViewport } from '@/src/composables/usePhoneViewport';
import AccessRequestDrawer from '@/src/components/AccessRequestDrawer.vue';
import AppPagination from '@/src/components/AppPagination.vue';
import NaviiAvatar from '@/src/components/NaviiAvatar.vue';
import OrganizerRoleBadge from '@/src/components/OrganizerRoleBadge.vue';
import ConfirmDialog from '@/src/components/ui/ConfirmDialog.vue';
import BoneyardPageSkeleton from '@/src/components/ui/BoneyardPageSkeleton.vue';
import {
  fetchAdminOrganizers,
  fetchAdminAccessRequests,
  fetchAdminSession,
  fetchAnnualConferenceAccess,
  fetchAnnualConferenceEditions,
  fetchVolunteerApplications,
  queryKeys,
  updateAnnualConferenceAccessGrant,
  type AnnualConferenceAccessResponse,
  type OrganizerMembership,
  type OrganizerMembershipsResponse,
  type AdminAccessRequest,
} from '@/src/lib/api';
import type { AdminRole } from '@/types/supabase';
import {
  ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS,
  annualConferenceCapabilityChanges,
  canDelegateAnnualConferenceCapability,
  type AnnualConferenceCapability,
} from '@/lib/annual-conference-capabilities';
import { ACTIVE_ANNUAL_CONFERENCE_EDITION } from '@/src/annual-conference';
import { notify } from '@/src/lib/notify';

const addOrganizerSchema = z.object({
  email: z.string().trim().email('Enter a valid email.'),
  display_name: z.string().trim().min(1, 'Enter a display name.').max(120, 'Keep the display name under 120 characters.'),
  role: z.enum(['owner', 'organizer', 'volunteer', 'member']),
});

const queryClient = useQueryClient();
const route = useRoute();
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
  role: 'member' as AdminRole,
});
const accessSetupContext = ref<string | null>(null);
const addAccessOpen = ref(false);
const delegationOpen = ref(false);
const addAccessEmail = ref<HTMLInputElement | null>(null);
const delegationFields = ref<HTMLElement | null>(null);

async function toggleAddAccess() {
  addAccessOpen.value = !addAccessOpen.value;
  if (addAccessOpen.value) {
    await nextTick();
    addAccessEmail.value?.focus();
  }
}

async function toggleDelegation() {
  delegationOpen.value = !delegationOpen.value;
  if (delegationOpen.value) {
    await nextTick();
    delegationFields.value?.querySelector<HTMLButtonElement>('button')?.focus();
  }
}

const appliedVolunteerApplication = ref<string | null>(null);
const appliedResponsibilityMember = ref<string | null>(null);
const requestedApplicationId = computed(() => typeof route.query.volunteer_application === 'string'
  ? route.query.volunteer_application
  : null);
const requestedMemberId = computed(() => typeof route.query.member === 'string' ? route.query.member : null);
const requestedEdition = computed(() => {
  const value = typeof route.query.edition === 'string' ? route.query.edition : '';

  return /^\d{4}$/.test(value) ? value : String(ACTIVE_ANNUAL_CONFERENCE_EDITION.year);
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
const phone = usePhoneViewport();
const currentUserRole = computed<AdminRole | null>(() => adminSessionQuery.data.value?.user?.role ?? null);
const currentUserEmail = computed(() => adminSessionQuery.data.value?.user?.email?.toLowerCase() ?? null);
const accessRequestsQuery = useQuery({
  queryKey: queryKeys.adminAccessRequests,
  queryFn: fetchAdminAccessRequests,
  enabled: computed(() => currentUserRole.value === 'owner'),
});
const requestedApplicationQuery = useQuery({
  queryKey: computed(() => queryKeys.volunteerApplications(requestedEdition.value)),
  queryFn: () => fetchVolunteerApplications(requestedEdition.value),
  enabled: computed(() => Boolean(requestedApplicationId.value)
    && (currentUserRole.value === 'owner' || currentUserRole.value === 'organizer')),
});
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

watch([accessSetupContext, loading], async ([context, isLoading]) => {
  if (!context || isLoading) return;
  addAccessOpen.value = true;
  await nextTick();
  if (window.matchMedia('(max-width: 767px)').matches) addAccessEmail.value?.focus();
});

const pageError = computed(() => organizersQuery.error.value?.message || '');
const organizerPage = ref(1);
const organizersPerPage = 10;
const organizerPageCount = computed(() => Math.max(1, Math.ceil(organizers.value.length / organizersPerPage)));
const organizerPageStart = computed(() => (organizerPage.value - 1) * organizersPerPage);
const organizerPageEnd = computed(() => Math.min(organizers.value.length, organizerPageStart.value + organizersPerPage));
const paginatedOrganizers = computed(() => organizers.value.slice(organizerPageStart.value, organizerPageEnd.value));
const accessRequests = computed(() => accessRequestsQuery.data.value?.requests ?? []);
const accessRequestPage = ref(1);
const accessRequestSearch = ref('');
const accessRequestsPerPage = 10;
const filteredAccessRequests = computed(() => {
  const search = accessRequestSearch.value.trim().toLowerCase();

  return accessRequests.value.filter((request) => !search
    || [request.display_name, request.email, request.reason ?? ''].some((value) => value.toLowerCase().includes(search)));
});

watch(accessRequestSearch, () => { accessRequestPage.value = 1; });
const accessRequestPageCount = computed(() => Math.max(1, Math.ceil(filteredAccessRequests.value.length / accessRequestsPerPage)));
const paginatedAccessRequests = computed(() => filteredAccessRequests.value.slice((accessRequestPage.value - 1) * accessRequestsPerPage, accessRequestPage.value * accessRequestsPerPage));
const requestDetails = ref<AdminAccessRequest | null>(null);
const queuedRequestDecision = ref<{ request: AdminAccessRequest; approve: boolean } | null>(null);
const accessRequestsHeading = ref<HTMLElement | null>(null);

function openRequestDetails(request: AdminAccessRequest, event: MouseEvent) {
  if (currentUserRole.value !== 'owner') return;
  const target = event.currentTarget as HTMLElement;

  (target.matches('button') ? target : target.querySelector<HTMLButtonElement>('button'))?.focus();
  requestDetails.value = request;
}

function queueRequestDecision(approve: boolean) {
  if (!requestDetails.value || decideAccessRequestMutation.isPending.value) return;
  queuedRequestDecision.value = { request: requestDetails.value, approve };
  requestDetails.value = null;
}

function finishRequestDrawerClose() {
  const decision = queuedRequestDecision.value;

  queuedRequestDecision.value = null;
  if (!decision) return;
  if (decision.approve) approveAccessRequest(decision.request);
  else declineAccessRequest(decision.request);
}

const accessRequestCandidate = ref<AdminAccessRequest | null>(null);
const declineAccessRequestCandidate = ref<AdminAccessRequest | null>(null);
const accessRequestRole = ref<'organizer' | 'volunteer' | 'member'>('member');
const addOrganizerValidation = computed(() => addOrganizerSchema.safeParse(form));
const canAddOrganizer = computed(() => addOrganizerValidation.value.success && !addOrganizerMutation.isPending.value);
const responsibilityEditionOptions = computed(() => (editionsQuery.data.value?.editions ?? []).map((edition) => ({
  value: String(edition.year),
  label: edition.label,
})));
const delegationMemberOptions = computed(() => organizers.value
  .filter((member) => member.status === 'active' && member.role !== 'owner')
  .map((member) => ({
    value: member.id,
    label: `${memberName(member)} · ${roleLabel(member.role)}`,
  })));
const delegationMember = computed(() => organizers.value.find((member) => member.id === delegationMemberId.value) ?? null);
const responsibilityMember = computed(() => organizers.value.find((member) => member.id === responsibilityMemberId.value) ?? null);
const responsibilityAccessMember = computed(() => accessQuery.data.value?.members.find((member) => member.id === responsibilityMemberId.value) ?? null);
const responsibilitySections = computed(() => ['Work plan', 'Volunteers', 'Speakers', 'Ticketing', 'Registration', 'Check-in', 'Finance']
  .map((section) => ({
    section,
    capabilities: ANNUAL_CONFERENCE_CAPABILITY_DEFINITIONS
      .filter((definition) => definition.section === section)
      .filter((definition) => {
        if (!responsibilityMember.value) return true;

        return canDelegateAnnualConferenceCapability(definition.value, responsibilityMember.value.role)
          || responsibilityIsInherited(definition.value);
      }),
  }))
  .filter((group) => group.capabilities.length > 0));
const memberRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'organizer', label: 'Organizer' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'member', label: 'Restricted member' },
];
const roleOptions = computed<Array<{ value: AdminRole; label: string }>>(() => {
  if (currentUserRole.value === 'owner') {
    return [
      { value: 'organizer', label: 'Organizer' },
      { value: 'volunteer', label: 'Volunteer' },
      { value: 'member', label: 'Restricted member' },
      { value: 'owner', label: 'Owner' },
    ];
  }

  return [
    { value: 'organizer', label: 'Organizer' },
    { value: 'volunteer', label: 'Volunteer' },
  ];
});

watch(currentUserRole, (role) => {
  if (role !== 'owner' && (form.role === 'owner' || form.role === 'member')) {
    form.role = 'organizer';
  }
  if (role !== 'owner') showEmails.value = false;
}, { immediate: true });

watch(organizerPageCount, (pageCount) => {
  if (organizerPage.value > pageCount) {
    organizerPage.value = pageCount;
  }
});

watch(accessRequestPageCount, (pageCount) => {
  if (accessRequestPage.value > pageCount) {
    accessRequestPage.value = pageCount;
  }
});

watch([currentUserRole, responsibilityMember], ([role, member]) => {
  if (responsibilityMemberId.value && (role !== 'owner' || !member)) {
    void closeResponsibilities();
  }
});

watch(
  [requestedApplicationId, () => requestedApplicationQuery.data.value?.applications, currentUserRole],
  ([applicationId, applications, role]) => {
    if (!applicationId || appliedVolunteerApplication.value === applicationId) return;
    if (role !== 'owner' && role !== 'organizer') return;
    const application = applications?.find((item) => item.id === applicationId);

    if (!application) return;

    form.email = application.email;
    form.display_name = application.name;
    form.role = 'volunteer';
    accessSetupContext.value = application.name;
    appliedVolunteerApplication.value = applicationId;
  },
  { immediate: true },
);

watch(
  [requestedMemberId, organizers, currentUserRole],
  async ([memberId, members, role]) => {
    if (!memberId || appliedResponsibilityMember.value === memberId || role !== 'owner') return;
    const member = members.find((item) => item.id === memberId && item.status === 'active');

    if (!member) return;

    responsibilityYear.value = requestedEdition.value;
    delegationMemberId.value = member.id;
    responsibilityMemberId.value = member.id;
    appliedResponsibilityMember.value = memberId;
    setPageInteractionLocked(true);
    await nextTick();
    responsibilityCloseButton.value?.focus();
  },
  { immediate: true },
);

async function readError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { error?: string } | null;

  return payload?.error ?? `Request failed: ${response.status}`;
}

function notifyActionError(caught: unknown, fallback: string) {
  notify.error(caught instanceof Error ? caught.message : fallback);
}

const decideAccessRequestMutation = useMutation({
  mutationFn: async ({ request, approve }: { request: AdminAccessRequest; approve: boolean }) => {
    const suffix = approve ? 'approve' : 'decline';
    const response = await protectedFetch(`/api/admin/access-requests/${request.id}/${suffix}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(approve ? { role: accessRequestRole.value } : {}),
    });

    if (!response.ok) throw new Error(await readError(response));
  },
  onSuccess: async () => {
    accessRequestCandidate.value = null;
    declineAccessRequestCandidate.value = null;
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminAccessRequests });
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
    await nextTick();
    accessRequestsHeading.value?.focus();
  },
  onError: (caught) => notifyActionError(caught, 'Unable to decide this access request.'),
});

function approveAccessRequest(request: AdminAccessRequest) {
  if (currentUserRole.value !== 'owner' || decideAccessRequestMutation.isPending.value) return;
  accessRequestRole.value = 'member';
  accessRequestCandidate.value = request;
}

function declineAccessRequest(request: AdminAccessRequest) {
  if (currentUserRole.value !== 'owner' || decideAccessRequestMutation.isPending.value) return;
  declineAccessRequestCandidate.value = request;
}

function confirmAccessRequestDecline() {
  if (!declineAccessRequestCandidate.value) return;
  decideAccessRequestMutation.mutate({ request: declineAccessRequestCandidate.value, approve: false });
}

function confirmAccessRequestApproval() {
  if (!accessRequestCandidate.value) return;
  decideAccessRequestMutation.mutate({ request: accessRequestCandidate.value, approve: true });
}

const addOrganizerMutation = useMutation({
  mutationFn: async () => {
    const parsed = addOrganizerSchema.parse(form);
    const response = await protectedFetch('/api/admin/organizers', {
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
    form.email = '';
    form.display_name = '';
    form.role = currentUserRole.value === 'owner' ? 'member' : 'organizer';
    accessSetupContext.value = null;
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
  onError: (caught) => {
    notifyActionError(caught, 'Unable to add team member.');
  },
});

const updateOrganizerRoleMutation = useMutation({
  mutationFn: async ({ organizerId, role }: { organizerId: string; role: 'organizer' | 'volunteer' | 'member' }) => {
    const response = await protectedFetch(`/api/admin/organizers/${organizerId}/role`, {
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
    notifyActionError(caught, 'Unable to change member role.');
  },
  onSettled: () => {
    roleUpdatingId.value = null;
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
});

const updateResponsibilityMutation = useMutation({
  mutationFn: ({ year, memberId, capability, enabled }: {
    year: string;
    memberId: string;
    capability: AnnualConferenceCapability;
    enabled: boolean;
  }) => updateAnnualConferenceAccessGrant(year, memberId, capability, enabled),
  onMutate: async ({ year, memberId, capability, enabled }) => {
    responsibilityUpdating.value = capability;
    const queryKey = queryKeys.annualConferenceAccess(year);

    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<AnnualConferenceAccessResponse>(queryKey);
    const member = previous?.members.find(entry => entry.id === memberId);

    if (previous && member) {
      const relatedCapabilities = annualConferenceCapabilityChanges(member.role, capability, enabled);

      queryClient.setQueryData<AnnualConferenceAccessResponse>(queryKey, {
        ...previous,
        members: previous.members.map((member) => member.id !== memberId ? member : {
          ...member,
          capabilities: enabled
            ? [...new Set([...member.capabilities, ...relatedCapabilities])]
            : member.capabilities.filter((item) => !relatedCapabilities.includes(item)),
        }),
      });
    }

    return { previous, queryKey };
  },
  onError: (caught, _variables, context) => {
    if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
    notifyActionError(caught, 'Unable to update conference responsibilities.');
  },
  onSettled: (_data, _error, _variables, context) => {
    responsibilityUpdating.value = null;
    if (context?.queryKey) void queryClient.invalidateQueries({ queryKey: context.queryKey });
  },
});

const disableOrganizerMutation = useMutation({
  mutationFn: async (organizerId: string) => {
    const response = await protectedFetch(`/api/admin/organizers/${organizerId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(await readError(response));
    }

    return response.json() as Promise<OrganizerMembership>;
  },
  onMutate: async (organizerId) => {
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
    notifyActionError(caught, 'Unable to disable organizer.');
  },
  onSettled: () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
});

const enableOrganizerMutation = useMutation({
  mutationFn: async (organizerId: string) => {
    const response = await protectedFetch(`/api/admin/organizers/${organizerId}/enable`, {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) throw new Error(await readError(response));

    return response.json() as Promise<OrganizerMembership>;
  },
  onMutate: (organizerId) => {
    enableUpdatingId.value = organizerId;
  },
  onSuccess: async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
  onError: (caught) => {
    notifyActionError(caught, 'Unable to re-enable member access.');
  },
  onSettled: () => {
    enableUpdatingId.value = null;
  },
});

const removeOrganizerMutation = useMutation({
  mutationFn: async (organizerId: string) => {
    const response = await protectedFetch(`/api/admin/organizers/${organizerId}/permanent`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) throw new Error(await readError(response));

    return response.json() as Promise<{ removed: true; id: string }>;
  },
  onSuccess: async ({ id }) => {
    if (delegationMemberId.value === id) delegationMemberId.value = '';
    if (responsibilityMemberId.value === id) await closeResponsibilities();
    removalCandidate.value = null;
    await queryClient.invalidateQueries({ queryKey: queryKeys.adminOrganizers });
  },
  onError: (caught) => {
    notifyActionError(caught, 'Unable to permanently remove member access.');
  },
});

function submitOrganizer() {
  if (!addOrganizerValidation.value.success) {
    notify.error(addOrganizerValidation.value.error.issues[0]?.message ?? 'Check the access details.');

    return;
  }
  if (addOrganizerMutation.isPending.value) {
    return;
  }
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
  if (value !== 'organizer' && value !== 'volunteer' && value !== 'member') return;
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
    'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.getClientRects().length > 0
    && (element.matches('summary') || !element.closest('details:not([open])')));

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
  return responsibilityAccessMember.value?.capabilities.includes(capability) ?? false;
}

function toggleResponsibility(capability: AnnualConferenceCapability, enabled: boolean) {
  if (updateResponsibilityMutation.isPending.value || !responsibilityMemberId.value) return;
  updateResponsibilityMutation.mutate({
    year: responsibilityYear.value,
    memberId: responsibilityMemberId.value,
    capability,
    enabled,
  });
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
  if (role === 'member') return 'Restricted member';

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

      <div v-if="pageError" class="mt-4 rounded-md border border-red-700 bg-red-50 p-4 text-sm font-medium text-red-800" role="alert">
        {{ pageError }}
      </div>

      <BoneyardPageSkeleton v-if="loading" :name="currentUserRole === 'owner' ? 'admin-organizers-owner' : 'admin-organizers'" label="people and access" layout="table" />

      <div v-else class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section v-if="currentUserRole === 'owner'" class="min-w-0 overflow-hidden rounded-lg border border-dc-border bg-dc-paper xl:col-span-2" aria-labelledby="access-requests-title">
          <div class="flex flex-wrap items-end justify-between gap-4 border-b border-dc-border p-4 sm:px-5">
            <div>
              <p class="editorial-eyebrow">Review queue</p>
              <h2 ref="accessRequestsHeading" tabindex="-1" id="access-requests-title" class="mt-1 text-lg font-semibold text-dc-ink">Access requests <span v-if="!accessRequestsQuery.isPending.value && !accessRequestsQuery.isError.value" class="ml-2 rounded-full bg-dc-paper-warm px-2 py-0.5 font-mono text-xs">{{ accessRequests.length }}</span></h2>
              <p class="mt-1 text-xs leading-5 text-dc-gray">Review each request, then choose a workspace role when approving.</p>
            </div>
            <label class="w-full sm:w-72">
              <span class="sr-only">Search access requests</span>
              <input v-model="accessRequestSearch" type="search" class="editorial-input !min-h-11 !rounded-md !px-3 !py-2 !text-base md:!text-sm" placeholder="Search name, email or reason">
            </label>
          </div>
          <BoneyardPageSkeleton v-if="accessRequestsQuery.isPending.value" name="admin-access-requests" label="admin access requests" :show-header="false" />
          <div v-else-if="accessRequestsQuery.isError.value" class="p-5" role="alert">
            <p class="text-sm text-red-700">Unable to load access requests.</p>
            <button type="button" class="text-action mt-2 min-h-11 text-sm font-semibold text-dc-pink" @click="accessRequestsQuery.refetch()">Try again</button>
          </div>
          <p v-else-if="!accessRequests.length" class="p-5 text-sm text-dc-gray">You’re all caught up. New requests will appear here.</p>
          <p v-else-if="!filteredAccessRequests.length" class="p-5 text-sm text-dc-gray" role="status">No requests match your search.</p>
          <div v-else>
            <table class="block w-full text-left text-sm sm:table">
              <caption class="sr-only">Pending access requests</caption>
              <thead class="hidden border-b border-dc-border bg-dc-paper-warm text-xs text-dc-gray sm:table-header-group">
                <tr><th scope="col" class="px-5 py-3 font-medium">Person</th><th scope="col" class="px-5 py-3 font-medium">How they’d like to help</th><th scope="col" class="px-5 py-3 font-medium">Requested</th><th scope="col" class="px-5 py-3 text-right font-medium">Review</th></tr>
              </thead>
              <tbody class="block divide-y divide-dc-border sm:table-row-group">
                <tr v-for="request in paginatedAccessRequests" :key="request.id" class="block cursor-pointer p-4 hover:bg-dc-paper-warm sm:table-row sm:p-0" @click="openRequestDetails(request, $event)">
                  <td class="block break-words pb-2 align-top sm:table-cell sm:w-1/4 sm:px-5 sm:py-4">
                    <p class="mb-1 text-xs text-dc-gray sm:hidden">Person</p>
                    <p class="font-semibold text-dc-ink">{{ request.display_name }}</p>
                    <p class="mt-0.5 break-all text-xs text-dc-gray">{{ request.email }}</p>
                  </td>
                  <td class="block pb-2 align-top sm:table-cell sm:w-2/5 sm:px-5 sm:py-4">
                    <p class="mb-1 text-xs font-medium text-dc-ink sm:hidden">How they’d like to help</p>
                    <p class="line-clamp-2 break-words text-xs leading-5 text-dc-gray">{{ request.reason || 'No note provided.' }}</p>
                  </td>
                  <td class="block pb-3 align-top text-xs text-dc-gray sm:table-cell sm:px-5 sm:py-4"><span class="sm:hidden">Requested </span><time :datetime="request.created_at">{{ formatDateTime(request.created_at) }}</time></td>
                  <td class="block align-top sm:table-cell sm:px-5 sm:py-3">
                    <div class="flex sm:justify-end">
                      <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-3 text-xs font-semibold text-dc-ink" :aria-label="`Review ${request.display_name}`" @click.stop="openRequestDetails(request, $event)">Review →</button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <AppPagination v-if="filteredAccessRequests.length > accessRequestsPerPage" v-model:page="accessRequestPage" class="border-t border-dc-border p-4" :page-count="accessRequestPageCount" :total="filteredAccessRequests.length" :range-start="(accessRequestPage - 1) * accessRequestsPerPage + 1" :range-end="Math.min(accessRequestPage * accessRequestsPerPage, filteredAccessRequests.length)" item-label="requests" aria-label="Access request pagination" />
          </div>
        </section>

        <form class="rounded-lg border border-dc-border bg-dc-paper p-4 xl:col-start-2 xl:row-start-2" @submit.prevent="submitOrganizer">
          <button
            type="button"
            class="access-disclosure md:hidden"
            :aria-expanded="addAccessOpen"
            aria-controls="add-access-fields"
            @click="toggleAddAccess"
          >
            <span>Add access</span>
            <span aria-hidden="true">{{ addAccessOpen ? '−' : '+' }}</span>
          </button>
          <div :class="{ 'hidden md:block': !addAccessOpen }" id="add-access-fields">
            <p class="editorial-eyebrow">Invite</p>
            <h2 class="mt-1 text-lg font-semibold text-dc-ink">Add access</h2>
            <p class="mt-1 text-xs leading-5 text-dc-gray">Add one person and choose the access they need.</p>
            <p v-if="accessSetupContext" class="mt-3 rounded-md border border-dc-border bg-dc-yellow/30 px-3 py-2 text-[11px] leading-4 text-dc-gray">
              Reviewing access for <strong class="text-dc-ink">{{ accessSetupContext }}</strong>. Adding this person grants workspace access; it does not happen automatically.
            </p>
            <div class="mt-3 grid gap-2.5">
              <label>
                <span class="editorial-label">Email</span>
                <input ref="addAccessEmail" v-model="form.email" required type="email" autocomplete="email" class="editorial-input mt-1.5 !min-h-10 !rounded-md !px-3 !py-2 !text-base md:!text-sm" placeholder="person@devcongress.org">
              </label>
              <label>
                <span class="editorial-label">Display name</span>
                <input v-model="form.display_name" required maxlength="120" autocomplete="name" class="editorial-input mt-1.5 !min-h-10 !rounded-md !px-3 !py-2 !text-base md:!text-sm" placeholder="Full name">
              </label>
              <AppDropdown
                v-model="form.role"
                label="Role"
                :options="roleOptions"
                density="compact"
                menu-class="min-w-48"
                teleport
              />
              <button class="editorial-action min-h-10 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50" :disabled="!canAddOrganizer">
                {{ addOrganizerMutation.isPending.value ? 'Adding…' : 'Add person' }}
              </button>
            </div>
          </div>
        </form>

        <section
          v-if="currentUserRole === 'owner'"
          class="rounded-lg border border-dc-border bg-dc-paper p-4 xl:col-start-2 xl:row-start-3"
          aria-labelledby="delegation-section-title"
        >
          <button
            type="button"
            class="access-disclosure md:hidden"
            :aria-expanded="delegationOpen"
            aria-controls="delegation-fields"
            @click="toggleDelegation"
          >
            <span>Conference responsibilities</span>
            <span aria-hidden="true">{{ delegationOpen ? '−' : '+' }}</span>
          </button>
          <div id="delegation-fields" ref="delegationFields" :class="{ 'hidden md:block': !delegationOpen }">
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
              Volunteers remain limited to assigned tasks.
            </p>
          </div>
        </section>

        <section class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-dc-border bg-dc-paper xl:col-start-1 xl:row-span-2 xl:row-start-2">
          <div class="flex flex-wrap items-center justify-between gap-4 border-b border-dc-border px-4 py-3 sm:px-5">
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
                class="motion-press inline-flex min-h-11 items-center gap-2 rounded-md border border-dc-border px-3 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-gray hover:border-dc-pink hover:text-dc-pink"
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

          <div v-else class="min-w-0 flex-1">
            <ul v-if="phone" class="divide-y divide-dc-border md:hidden" aria-label="Team access members">
              <li v-for="organizer in paginatedOrganizers" :key="organizer.id" class="space-y-3 px-4 py-4">
                <div class="flex min-w-0 items-start gap-3">
                  <NaviiAvatar :seed="organizer.id" :title="`${memberName(organizer)} avatar`" :size="36" />
                  <div class="min-w-0">
                    <p class="break-words font-semibold">{{ memberName(organizer) }}</p>
                    <p class="break-all text-sm text-dc-gray">{{ showEmails ? organizer.email : 'Email hidden' }}</p>
                  </div>
                </div>
                <dl class="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt class="text-dc-gray">Role</dt>
                    <dd class="mt-1">
                      <AppDropdown
                        v-if="canChangeOrganizerRole(organizer)"
                        :model-value="organizer.role"
                        :options="memberRoleOptions"
                        :aria-label="`Role for ${memberName(organizer)}`"
                        :disabled="roleUpdatingId === organizer.id"
                        teleport
                        @update:model-value="changeOrganizerRole(organizer, $event)"
                      />
                      <OrganizerRoleBadge v-else :role="organizer.role" />
                    </dd>
                  </div>
                  <div>
                    <dt class="text-dc-gray">Status</dt>
                    <dd class="mt-1 capitalize">{{ organizer.status }}</dd>
                  </div>
                  <div class="col-span-2">
                    <dt class="text-dc-gray">Last sign-in</dt>
                    <dd>{{ formatDateTime(organizer.last_login_at) }}</dd>
                  </div>
                </dl>
                <div class="flex flex-wrap gap-2">
                  <template v-if="currentUserRole === 'owner' && organizer.status === 'disabled'">
                    <button
                      type="button"
                      class="min-h-11 rounded-md border border-dc-border px-3 text-sm font-semibold disabled:opacity-50"
                      :disabled="enableUpdatingId === organizer.id || removeOrganizerMutation.isPending.value"
                      @click="enableOrganizer(organizer)"
                    >{{ enableUpdatingId === organizer.id ? 'Enabling…' : 'Re-enable' }}</button>
                    <button
                      type="button"
                      class="min-h-11 rounded-md border border-red-300 px-3 text-sm font-semibold text-red-700 disabled:opacity-50"
                      :disabled="enableOrganizerMutation.isPending.value || removeOrganizerMutation.isPending.value"
                      @click="requestPermanentRemoval(organizer)"
                    >Remove</button>
                  </template>
                  <button
                    v-if="currentUserRole === 'owner' && organizer.status === 'active' && organizer.role !== 'owner'"
                    type="button"
                    class="min-h-11 rounded-md border border-dc-border px-3 text-sm font-semibold text-dc-pink"
                    :aria-label="`Delegate Annual Conference responsibilities to ${memberName(organizer)}`"
                    @click="openResponsibilities(organizer, $event)"
                  >Access</button>
                  <button
                    v-if="canDisableOrganizer(organizer)"
                    type="button"
                    class="min-h-11 rounded-md border border-dc-border px-3 text-sm font-semibold"
                    @click="disableOrganizer(organizer)"
                  >Disable</button>
                  <span v-else-if="organizer.role === 'owner' || currentUserRole !== 'owner'" class="text-sm text-dc-gray">{{ unavailableActionLabel(organizer) }}</span>
                </div>
              </li>
            </ul>
            <div v-else class="hidden overflow-x-auto md:block">
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
                        :aria-label="'Role for ' + memberName(organizer)"
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
                          v-if="currentUserRole === 'owner' && organizer.status === 'active' && organizer.role !== 'owner'"
                          class="motion-press rounded-md border border-dc-border px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-wide text-dc-pink hover:border-dc-pink"
                          type="button"
                          :aria-label="`Delegate Annual Conference responsibilities to ${memberName(organizer)}`"
                          @click="openResponsibilities(organizer, $event)"
                        >
                            Access
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
          </div>

          <AppPagination v-model:page="organizerPage" :page-count="organizerPageCount" :total="organizers.length" :range-start="organizerPageStart + 1" :range-end="organizerPageEnd" item-label="members" aria-label="Organizer allowlist pagination" />
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
                {{ responsibilityMember.role === 'member'
                  ? 'Only these places are available to this member for the selected edition.'
                  : 'Set access for this conference edition. Role access elsewhere in EMS is unchanged.' }}
                Changes save immediately.
              </p>
            </div>
            <button
              ref="responsibilityCloseButton"
              type="button"
              class="motion-press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dc-border text-dc-gray hover:border-dc-ink hover:text-dc-ink"
              aria-label="Close access drawer"
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
              :disabled="updateResponsibilityMutation.isPending.value"
              class="w-full"
              label="Conference edition"
              :options="responsibilityEditionOptions"
              density="compact"
              menu-class="min-w-52"
              teleport
            />
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
            <BoneyardPageSkeleton v-if="accessQuery.isPending.value" name="admin-conference-responsibilities" label="admin conference responsibilities" :show-header="false" />
            <div v-else-if="accessQuery.isError.value" class="rounded-md border border-red-700 bg-red-50 p-4 text-sm text-red-800" role="alert">
              Unable to load conference responsibilities.
            </div>
            <div v-else class="divide-y divide-dc-border border-y border-dc-border">
              <details v-for="group in responsibilitySections" :key="group.section" class="responsibility-section">
                <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-md py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dc-pink">
                  <span class="min-w-0">
                    <span class="block text-base font-bold leading-tight text-dc-ink">{{ group.section }}</span>
                    <span class="block text-xs text-dc-gray">{{ group.capabilities.filter((item) => responsibilityIsEnabled(item.value)).map((item) => item.label).join(', ') || 'No access' }}</span>
                  </span>
                  <span class="responsibility-chevron grid size-7 shrink-0 place-items-center rounded-full border border-dc-border text-dc-gray" aria-hidden="true">
                    <svg viewBox="0 0 20 20" class="size-3.5" fill="none">
                      <path d="M5.5 8l4.5 4.5L14.5 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </span>
                </summary>
                <div class="pb-3">
                  <div class="ml-2 space-y-1 border-l border-dc-border pl-3 sm:ml-3 sm:pl-4">
                    <button
                      v-for="definition in group.capabilities"
                      :key="definition.value"
                      type="button"
                      class="motion-press flex min-h-12 w-full items-center justify-between gap-4 rounded-md px-2 py-2 text-left hover:bg-dc-paper-warm disabled:cursor-not-allowed"
                      :disabled="updateResponsibilityMutation.isPending.value"
                      :aria-pressed="responsibilityIsEnabled(definition.value)"
                      @click="toggleResponsibility(definition.value, !responsibilityIsEnabled(definition.value))"
                    >
                      <span>
                        <span class="block text-sm font-semibold text-dc-ink">{{ definition.label }}</span>
                        <span class="block text-xs leading-4 text-dc-gray">{{ definition.description }}</span>
                        <span v-if="responsibilityIsInherited(definition.value)" class="block text-xs text-dc-pink">Role default · editable for this edition</span>
                      </span>
                      <span class="flex h-5 w-9 shrink-0 items-center rounded-full p-0.5" :class="responsibilityIsEnabled(definition.value) ? 'bg-dc-pink' : 'bg-dc-border'" aria-hidden="true"><span class="responsibility-toggle-knob h-4 w-4 rounded-full bg-white shadow-sm" :class="{ 'translate-x-4': responsibilityIsEnabled(definition.value) }" /></span>
                    </button>
                  </div>
                </div>
              </details>
            </div>
            <p v-if="updateResponsibilityMutation.isPending.value" class="mt-3 text-xs text-dc-gray" role="status">Saving access…</p>
            <p v-else-if="updateResponsibilityMutation.isError.value" class="mt-3 text-xs text-red-800" role="alert">Unable to save access. Please try again.</p>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>

  <AccessRequestDrawer :open="Boolean(requestDetails) && currentUserRole === 'owner'" @close="requestDetails = null" @closed="finishRequestDrawerClose">
    <div v-if="requestDetails" class="space-y-6">
      <div>
        <p class="text-xs font-semibold text-dc-pink">Awaiting review</p>
        <h3 class="mt-2 break-words text-2xl font-bold text-dc-ink">{{ requestDetails.display_name }}</h3>
        <p class="mt-1 break-all text-sm text-dc-gray">{{ requestDetails.email }}</p>
      </div>
      <dl class="border-y border-dc-border py-4">
        <dt class="text-xs text-dc-gray">Requested</dt>
        <dd class="mt-1 text-sm text-dc-ink"><time :datetime="requestDetails.created_at">{{ formatDateTime(requestDetails.created_at) }}</time></dd>
      </dl>
      <section>
        <h3 class="text-sm font-semibold text-dc-ink">How they’d like to help</h3>
        <p class="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-dc-gray">{{ requestDetails.reason || 'No note provided.' }}</p>
      </section>
      <div class="flex flex-wrap gap-3 border-t border-dc-border pt-5">
        <button type="button" class="motion-press min-h-11 rounded-md border border-dc-pink bg-dc-pink px-4 text-sm font-semibold text-white" @click="queueRequestDecision(true)">Approve</button>
        <button type="button" class="motion-press min-h-11 rounded-md border border-dc-border px-4 text-sm font-semibold text-dc-ink" @click="queueRequestDecision(false)">Decline</button>
      </div>
    </div>
  </AccessRequestDrawer>

  <ConfirmDialog
    :open="Boolean(declineAccessRequestCandidate)"
    title="Decline access request?"
    :message="declineAccessRequestCandidate ? `${declineAccessRequestCandidate.display_name} will not receive organizer access. They may deliberately submit a new request later.` : ''"
    confirm-label="Decline request"
    busy-label="Declining…"
    :busy="decideAccessRequestMutation.isPending.value"
    danger
    @cancel="declineAccessRequestCandidate = null"
    @confirm="confirmAccessRequestDecline"
  />

  <ConfirmDialog
    :open="Boolean(accessRequestCandidate)"
    title="Approve access request?"
    :message="accessRequestCandidate ? `${accessRequestCandidate.display_name} will gain the selected workspace role. Owners remain managed through the existing member workflow.` : ''"
    confirm-label="Approve access"
    busy-label="Approving…"
    :busy="decideAccessRequestMutation.isPending.value"
    @cancel="accessRequestCandidate = null"
    @confirm="confirmAccessRequestApproval"
  >
    <AppDropdown v-model="accessRequestRole" label="Workspace role" :options="memberRoleOptions" density="compact" />
  </ConfirmDialog>

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
.access-disclosure {
  display: flex;
  width: 100%;
  min-height: 44px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  text-align: left;
  font-weight: 700;
}

.access-disclosure:focus-visible {
  outline: 2px solid #e8117f;
  outline-offset: 2px;
}

@media (min-width: 768px) {
  .access-disclosure {
    display: none;
  }
}

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

.responsibility-section summary::-webkit-details-marker {
  display: none;
}

.responsibility-section[open] .responsibility-chevron {
  @apply border-dc-pink bg-dc-paper-warm text-dc-pink;
}

.responsibility-section[open] .responsibility-chevron svg {
  transform: rotate(180deg);
}

@media (prefers-reduced-motion: no-preference) {
  .responsibility-chevron svg {
    transition: transform 160ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  @supports selector(::details-content) and (transition-behavior: allow-discrete) and (interactivity: inert) {
    .responsibility-section:not([open])::details-content {
      interactivity: inert;
    }

    .responsibility-section::details-content {
      opacity: 0;
      transform: translateY(-4px);
      transition: opacity 160ms ease-out, transform 160ms cubic-bezier(0.16, 1, 0.3, 1), content-visibility 160ms allow-discrete;
    }

    .responsibility-section[open]::details-content {
      opacity: 1;
      transform: translateY(0);
    }
  }
}

.responsibility-toggle-knob {
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-reduced-motion: reduce) {
  .responsibility-overlay-enter-active,
  .responsibility-overlay-leave-active,
  .responsibility-overlay-enter-active .responsibility-drawer,
  .responsibility-overlay-leave-active .responsibility-drawer,
  .responsibility-toggle-knob {
    transition-duration: 0.01ms;
  }

  .responsibility-overlay-enter-from .responsibility-drawer,
  .responsibility-overlay-leave-to .responsibility-drawer {
    transform: none;
  }
}
</style>
