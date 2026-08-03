<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query';
import { computed, reactive, watch } from 'vue';
import AppDropdown from '@/src/components/AppDropdown.vue';
import AppMultiSelectDropdown from '@/src/components/AppMultiSelectDropdown.vue';
import AppDatePicker from '@/src/components/ui/AppDatePicker.vue';
import {
  ANNUAL_CONFERENCE_STATUS_LABELS,
  ANNUAL_CONFERENCE_TASK_PRIORITIES,
  ANNUAL_CONFERENCE_TASK_STATUSES,
  ANNUAL_CONFERENCE_WORKSTREAM_LABELS,
  ANNUAL_CONFERENCE_WORKSTREAMS,
  type AnnualConferenceTask,
  type AnnualConferenceTaskCreateInput,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
import {
  fetchAdminOrganizers,
  queryKeys,
  type OrganizerMembership,
} from '@/src/lib/api';

type TaskFormValue = Omit<AnnualConferenceTaskCreateInput, 'accountable_owner'> & {
  accountable_owner: string | null;
};

const props = defineProps<{
  mode: 'create' | 'edit';
  task?: AnnualConferenceTask | null;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  submit: [value: TaskFormValue | AnnualConferenceTaskUpdateInput];
  cancel: [];
}>();

const organizersQuery = useQuery({
  queryKey: queryKeys.adminOrganizers,
  queryFn: fetchAdminOrganizers,
});
const form = reactive({
  title: '',
  details: '',
  internal_note: '',
  workstream: 'programme_speakers' as AnnualConferenceTask['workstream'],
  accountable_owner: '',
  collaborators: [] as string[],
  priority: '' as Exclude<AnnualConferenceTask['priority'], null> | '',
  target_date: '',
  status: 'not_started' as AnnualConferenceTask['status'],
  dependency_note: '',
});
const workstreamOptions = ANNUAL_CONFERENCE_WORKSTREAMS.map((workstream) => ({
  value: workstream,
  label: ANNUAL_CONFERENCE_WORKSTREAM_LABELS[workstream],
}));
const statusOptions = ANNUAL_CONFERENCE_TASK_STATUSES.map((status) => ({
  value: status,
  label: ANNUAL_CONFERENCE_STATUS_LABELS[status],
}));
const priorityOptions = [
  { value: '', label: 'Not set' },
  ...ANNUAL_CONFERENCE_TASK_PRIORITIES.map((priority) => ({
    value: priority,
    label: priority.charAt(0).toUpperCase() + priority.slice(1),
  })),
];
const activeOrganizers = computed(() => (organizersQuery.data.value?.organizers ?? [])
  .filter((organizer) => organizer.status === 'active')
  .sort((left, right) => organizerLabel(left).localeCompare(organizerLabel(right))));
const accountableOwnerOptions = computed(() => {
  const options = activeOrganizers.value.map((organizer) => ({
    value: organizerValue(organizer),
    label: organizerLabel(organizer),
  }));
  const currentOwner = form.accountable_owner.trim();

  if (currentOwner && !options.some((option) => option.value === currentOwner)) {
    options.unshift({
      value: currentOwner,
      label: `${currentOwner} · Current assignment`,
    });
  }

  return options;
});
const accountableOwnerPlaceholder = computed(() => (
  organizersQuery.isPending.value
    ? 'Loading organizers…'
    : organizersQuery.isError.value
      ? 'Organizer list unavailable'
      : accountableOwnerOptions.value.length === 0
        ? 'No active organizers'
        : 'Select an organizer'
));
const ownerDropdownDisabled = computed(() => (
  props.submitting
  || organizersQuery.isPending.value
  || organizersQuery.isError.value
  || accountableOwnerOptions.value.length === 0
));
const collaboratorOptions = computed(() => {
  const options = activeOrganizers.value.map((organizer) => {
    const value = organizerValue(organizer);
    const isAccountableOwner = value === form.accountable_owner;
    return {
      value,
      label: organizerLabel(organizer),
      disabled: isAccountableOwner,
      note: isAccountableOwner ? 'Accountable' : undefined,
    };
  });

  for (const collaborator of form.collaborators) {
    if (!options.some((option) => option.value === collaborator)) {
      options.unshift({
        value: collaborator,
        label: `${collaborator} · Current collaborator`,
        disabled: collaborator === form.accountable_owner,
        note: collaborator === form.accountable_owner ? 'Accountable' : undefined,
      });
    }
  }

  return options;
});
const collaboratorPlaceholder = computed(() => (
  organizersQuery.isPending.value
    ? 'Loading organizers…'
    : organizersQuery.isError.value
      ? 'Organizer list unavailable'
      : collaboratorOptions.value.every((option) => option.disabled)
        ? 'No collaborators available'
        : 'Select collaborators'
));
const collaboratorSelectionText = computed(() => {
  if (form.collaborators.length === 0) return '';

  return form.collaborators.map((selectedValue) => {
    const organizer = activeOrganizers.value.find((item) => organizerValue(item) === selectedValue);
    return organizer?.display_name?.trim() || selectedValue;
  }).join(', ');
});
const collaboratorDropdownDisabled = computed(() => (
  props.submitting
  || organizersQuery.isPending.value
  || organizersQuery.isError.value
  || collaboratorOptions.value.every((option) => option.disabled)
));

function organizerValue(organizer: OrganizerMembership): string {
  return organizer.email.trim().toLowerCase();
}

function organizerLabel(organizer: OrganizerMembership): string {
  const displayName = organizer.display_name?.trim();
  const identity = displayName ? `${displayName} · ${organizer.email}` : organizer.email;
  return organizer.role === 'volunteer' ? `${identity} · Volunteer` : identity;
}

function resetForm() {
  const task = props.task;
  form.title = task?.title ?? '';
  form.details = task?.details ?? '';
  form.internal_note = task?.internal_note ?? '';
  form.workstream = task?.workstream ?? 'programme_speakers';
  form.accountable_owner = task?.accountable_owner ?? '';
  form.collaborators = [...(task?.collaborators ?? [])];
  form.priority = task?.priority ?? '';
  form.target_date = task?.target_date ?? '';
  form.status = task?.status ?? 'not_started';
  form.dependency_note = task?.dependency_note ?? '';
}

watch(() => props.task, resetForm, { immediate: true });
watch(() => form.accountable_owner, (accountableOwner) => {
  if (!accountableOwner) return;
  form.collaborators = form.collaborators.filter((collaborator) => collaborator !== accountableOwner);
});

function optionalText(value: string): string | null {
  return value.trim() || null;
}

function submitForm() {
  emit('submit', {
    title: form.title.trim(),
    details: optionalText(form.details),
    internal_note: optionalText(form.internal_note),
    workstream: form.workstream,
    accountable_owner: optionalText(form.accountable_owner),
    collaborators: [...new Set(form.collaborators)]
      .filter((collaborator) => collaborator !== form.accountable_owner),
    priority: form.priority || null,
    target_date: form.target_date || null,
    status: form.status,
    dependency_note: optionalText(form.dependency_note),
  });
}
</script>

<template>
  <form class="grid gap-5" @submit.prevent="submitForm">
    <div class="grid gap-5 lg:grid-cols-2">
      <label class="block lg:col-span-2">
        <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-gray">Task</span>
        <input
          v-model="form.title"
          class="editorial-input mt-2"
          type="text"
          maxlength="160"
          required
          placeholder="What needs to be completed?"
        >
      </label>

      <AppDropdown
        v-model="form.workstream"
        label="Workstream"
        :options="workstreamOptions"
        menu-class="min-w-64"
      />

      <AppDropdown
        v-model="form.status"
        label="Status"
        :options="statusOptions"
        menu-class="min-w-44"
      />

      <div class="block">
        <AppDropdown
          v-model="form.accountable_owner"
          label="Accountable owner"
          :options="accountableOwnerOptions"
          :placeholder="accountableOwnerPlaceholder"
          :disabled="ownerDropdownDisabled"
          :required="mode === 'create'"
          menu-class="min-w-72"
        />
        <span v-if="organizersQuery.isError.value" class="mt-2 block text-xs font-semibold leading-5 text-dc-pink">
          The organizer list could not be loaded.
          <button
            type="button"
            class="motion-press font-semibold underline decoration-2 underline-offset-2"
            @click="organizersQuery.refetch()"
          >
            Try again
          </button>
        </span>
        <span v-else class="mt-2 block text-xs font-medium leading-5 text-dc-gray">
          Select one active team member. Exactly one person is accountable.
        </span>
      </div>

      <div class="block">
        <AppMultiSelectDropdown
          v-model="form.collaborators"
          label="Collaborators"
          :options="collaboratorOptions"
          :placeholder="collaboratorPlaceholder"
          :selected-text="collaboratorSelectionText"
          :disabled="collaboratorDropdownDisabled"
          menu-align="right"
          menu-class="min-w-80"
        />
        <span class="mt-2 block text-xs font-medium leading-5 text-dc-gray">
          Select any number of team members. The accountable owner is kept separate.
        </span>
      </div>

      <AppDropdown
        v-model="form.priority"
        label="Priority"
        :options="priorityOptions"
        menu-class="min-w-40"
      />

      <AppDatePicker
        v-model="form.target_date"
        label="Target date"
      />

      <label class="block lg:col-span-2">
        <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-gray">Details</span>
        <textarea
          v-model="form.details"
          class="editorial-input mt-2 min-h-24 resize-none"
          maxlength="2000"
          placeholder="Describe the expected outcome."
        />
      </label>

      <label class="block">
        <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-gray">Dependency</span>
        <textarea
          v-model="form.dependency_note"
          class="editorial-input mt-2 min-h-20 resize-none"
          maxlength="2000"
          placeholder="What must happen first?"
        />
      </label>

      <label class="block">
        <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-dc-gray">Internal note</span>
        <textarea
          v-model="form.internal_note"
          class="editorial-input mt-2 min-h-20 resize-none"
          maxlength="2000"
          placeholder="Decision, shortlist, or follow-up note."
        />
      </label>
    </div>

    <div class="flex flex-wrap justify-end gap-3 border-t-2 border-dc-border pt-4">
      <button
        type="button"
        class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-paper px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-dc-ink"
        :disabled="submitting"
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="motion-press min-h-11 rounded-md border-2 border-dc-ink bg-dc-pink px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-[2px_2px_0_#111111] disabled:cursor-wait disabled:opacity-60"
        :disabled="submitting"
      >
        {{ submitting ? 'Saving…' : mode === 'create' ? 'Add task' : 'Save changes' }}
      </button>
    </div>
  </form>
</template>
