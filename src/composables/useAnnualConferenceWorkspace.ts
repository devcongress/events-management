import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { createAnnualConferenceReadModel } from '@/lib/annual-conference-read-model';
import { defaultAnnualConferencePhaseScope, type AnnualConferenceTaskUpdateInput } from '@/lib/annual-conference-work-plan';
import {
  fetchAnnualConferenceTaskMembers,
  fetchAnnualConferenceWorkPlan,
  queryKeys,
  type AnnualConferenceWorkPlanResponse,
  type OrganizerMembershipsResponse,
  updateAnnualConferenceTask,
} from '@/src/lib/api';
import { notify } from '@/src/lib/notify';

export interface AnnualConferenceWorkspaceOptions {
  year: ComputedRef<string>;
  today: Ref<string>;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
  loadOrganizers?: boolean | ComputedRef<boolean>;
  api?: AnnualConferenceWorkspaceApi;
}

export interface AnnualConferenceWorkspaceApi {
  getWorkspace(year: string): Promise<AnnualConferenceWorkPlanResponse>;
  getOrganizers(year: string): Promise<OrganizerMembershipsResponse>;
  updateTask(year: string, taskId: string, input: AnnualConferenceTaskUpdateInput): Promise<unknown>;
}

export function useAnnualConferenceWorkspace(options: AnnualConferenceWorkspaceOptions) {
  const api = options.api ?? {
    getWorkspace: fetchAnnualConferenceWorkPlan,
    getOrganizers: fetchAnnualConferenceTaskMembers,
    updateTask: updateAnnualConferenceTask,
  };
  const queryClient = useQueryClient();
  const phaseScope = ref('all');
  const phaseScopeInitialized = ref(false);
  const selectedTaskId = ref<string | null>(null);
  const editingTaskId = ref<string | null>(null);
  const showCreateForm = ref(false);

  const workPlanQuery = useQuery({
    queryKey: computed(() => queryKeys.annualConferenceWorkPlan(options.year.value)),
    queryFn: () => api.getWorkspace(options.year.value),
    refetchInterval: options.refetchInterval,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
  });
  const organizersQuery = useQuery({
    queryKey: queryKeys.adminOrganizers,
    queryFn: () => api.getOrganizers(options.year.value),
    enabled: options.loadOrganizers
      ?? computed(() => Boolean(
        workPlanQuery.data.value?.permissions.can_edit_all_tasks
        || workPlanQuery.data.value?.permissions.can_edit_assigned_tasks,
      )),
  });
  const readModel = computed(() => createAnnualConferenceReadModel({
    phases: workPlanQuery.data.value?.phases ?? [],
    tasks: workPlanQuery.data.value?.tasks ?? [],
  }));
  const phases = computed(() => readModel.value.phases);
  const tasks = computed(() => workPlanQuery.data.value?.tasks ?? []);
  const projection = computed(() => readModel.value.project({
    phaseScope: phaseScope.value,
    today: options.today.value,
  }));
  const permissions = computed(() => workPlanQuery.data.value?.permissions);
  const scopedTasks = computed(() => projection.value.tasks);
  const selectedPhase = computed(() => projection.value.selected_phase);
  const selectedTask = computed(() => tasks.value.find((task) => task.id === selectedTaskId.value) ?? null);

  watch([phases, options.today], ([availablePhases, currentDate]) => {
    const selectedPhaseStillExists = availablePhases.some((phase) => phase.id === phaseScope.value);
    if (
      phaseScopeInitialized.value
      && (selectedPhaseStillExists || phaseScope.value === 'all' || phaseScope.value === 'unassigned')
    ) return;
    if (!availablePhases.length) return;

    phaseScope.value = defaultAnnualConferencePhaseScope(availablePhases, currentDate);
    phaseScopeInitialized.value = true;
  }, { immediate: true });

  watch(options.year, () => {
    phaseScopeInitialized.value = false;
    phaseScope.value = 'all';
    closeTaskDrawer();
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, input }: { taskId: string; input: AnnualConferenceTaskUpdateInput }) =>
      api.updateTask(options.year.value, taskId, input),
    onSuccess: async () => {
      await refresh();
      editingTaskId.value = null;
      notify.success('Conference task updated.');
    },
    onError: (error) => notify.error(error instanceof Error ? error.message : 'Unable to update the task.'),
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceWorkPlan(options.year.value) });
  }

  function openTask(taskId: string) {
    showCreateForm.value = false;
    editingTaskId.value = null;
    selectedTaskId.value = taskId;
  }

  function editTask(taskId: string) {
    showCreateForm.value = false;
    selectedTaskId.value = taskId;
    editingTaskId.value = taskId;
  }

  function openCreateDrawer() {
    selectedTaskId.value = null;
    editingTaskId.value = null;
    showCreateForm.value = true;
  }

  function closeTaskDrawer() {
    showCreateForm.value = false;
    selectedTaskId.value = null;
    editingTaskId.value = null;
  }

  return {
    workPlanQuery,
    organizersQuery,
    permissions,
    phases,
    tasks,
    projection,
    phaseScope,
    scopedTasks,
    selectedPhase,
    selectedTask,
    selectedTaskId,
    editingTaskId,
    showCreateForm,
    updateTaskMutation,
    refresh,
    openTask,
    editTask,
    openCreateDrawer,
    closeTaskDrawer,
  };
}
