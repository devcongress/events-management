import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { createAnnualConferenceReadModel } from '@/lib/annual-conference-read-model';
import {
  defaultAnnualConferencePhaseScope,
  type AnnualConferenceTask,
  type AnnualConferenceTaskUpdateInput,
} from '@/lib/annual-conference-work-plan';
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
  updateTask(year: string, taskId: string, input: AnnualConferenceTaskUpdateInput): Promise<AnnualConferenceTask>;
}

type TaskUpdateVariables = {
  taskId: string;
  input: AnnualConferenceTaskUpdateInput;
  optimisticStatus?: AnnualConferenceTask['status'];
  previousStatus?: AnnualConferenceTask['status'];
  year?: string;
};

type TaskUpdateContext = {
  optimisticStatus?: AnnualConferenceTask['status'];
  previousStatus?: AnnualConferenceTask['status'];
  queryKey: ReturnType<typeof queryKeys.annualConferenceWorkPlan>;
  taskId: string;
  year: string;
};

type StatusQueueEntry = {
  confirmedStatus: AnnualConferenceTask['status'];
  desiredStatus: AnnualConferenceTask['status'];
  forcePersist: boolean;
  requestActive: boolean;
  taskId: string;
  year: string;
};

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
  const pendingStatusOverrides = ref(new Map<string, AnnualConferenceTask['status']>());
  const statusQueues = ref(new Map<string, StatusQueueEntry>());

  const workPlanQuery = useQuery({
    queryKey: computed(() => queryKeys.annualConferenceWorkPlan(options.year.value)),
    queryFn: () => api.getWorkspace(options.year.value),
    refetchInterval: options.refetchInterval,
    refetchOnWindowFocus: options.refetchOnWindowFocus,
  });
  const organizersQuery = useQuery({
    queryKey: computed(() => queryKeys.annualConferenceTaskMembers(options.year.value)),
    queryFn: () => api.getOrganizers(options.year.value),
    enabled: options.loadOrganizers
      ?? computed(() => Boolean(
        workPlanQuery.data.value?.permissions.can_edit_all_tasks
        || workPlanQuery.data.value?.permissions.can_edit_assigned_tasks,
      )),
  });
  const tasks = computed(() => (workPlanQuery.data.value?.tasks ?? []).map((task) => {
    const pendingStatus = pendingStatusOverrides.value.get(taskOverrideKey(options.year.value, task.id));

    return pendingStatus ? { ...task, status: pendingStatus } : task;
  }));
  const readModel = computed(() => createAnnualConferenceReadModel({
    phases: workPlanQuery.data.value?.phases ?? [],
    tasks: tasks.value,
  }));
  const phases = computed(() => readModel.value.phases);
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

  const updateTaskMutation = useMutation<AnnualConferenceTask, Error, TaskUpdateVariables, TaskUpdateContext>({
    mutationFn: ({ taskId, input, year: requestedYear }) =>
      api.updateTask(requestedYear ?? options.year.value, taskId, input),
    onMutate: (variables) => {
      const requestedYear = variables.year ?? options.year.value;
      const queryKey = queryKeys.annualConferenceWorkPlan(requestedYear);
      const cachedStatus = queryClient
        .getQueryData<AnnualConferenceWorkPlanResponse>(queryKey)
        ?.tasks.find((task) => task.id === variables.taskId)
        ?.status;
      const previousStatus = variables.previousStatus ?? cachedStatus;

      if (variables.optimisticStatus) {
        setPendingStatus(requestedYear, variables.taskId, variables.optimisticStatus);
      }

      return {
        optimisticStatus: variables.optimisticStatus,
        previousStatus,
        queryKey,
        taskId: variables.taskId,
        year: requestedYear,
      };
    },
    onSuccess: (updatedTask, _variables, context) => {
      if (context) {
        queryClient.setQueryData<AnnualConferenceWorkPlanResponse>(context.queryKey, (current) => {
          if (!current) return current;

          return {
            ...current,
            tasks: current.tasks.map((task) => task.id === context.taskId ? updatedTask : task),
          };
        });
        if (!statusQueues.value.has(taskOverrideKey(context.year, context.taskId))) {
          clearPendingStatus(context.year, context.taskId);
        }
        void queryClient.invalidateQueries({ queryKey: context.queryKey });
      }

      editingTaskId.value = null;
      notify.success('Conference task updated.');
    },
    onError: (error, _variables, context) => {
      if (context) {
        if (context.optimisticStatus && context.previousStatus) {
          const { optimisticStatus, previousStatus } = context;

          queryClient.setQueryData<AnnualConferenceWorkPlanResponse>(context.queryKey, (current) => {
            if (!current) return current;

            return {
              ...current,
              tasks: current.tasks.map((task) => (
                task.id === context.taskId && task.status === optimisticStatus
                  ? { ...task, status: previousStatus }
                  : task
              )),
            };
          });
        }
        if (!statusQueues.value.has(taskOverrideKey(context.year, context.taskId))) {
          clearPendingStatus(context.year, context.taskId);
        }
      }

      notify.error(error instanceof Error ? error.message : 'Unable to update the task.');
    },
  });

  function setPendingStatus(year: string, taskId: string, status: AnnualConferenceTask['status']) {
    const next = new Map(pendingStatusOverrides.value);

    next.set(taskOverrideKey(year, taskId), status);
    pendingStatusOverrides.value = next;
  }

  function clearPendingStatus(year: string, taskId: string) {
    const next = new Map(pendingStatusOverrides.value);

    next.delete(taskOverrideKey(year, taskId));
    pendingStatusOverrides.value = next;
  }

  const pendingStatusTaskIds = computed(() => new Set(
    [...statusQueues.value.values()]
      .filter((entry) => entry.requestActive || entry.desiredStatus !== entry.confirmedStatus)
      .map((entry) => entry.taskId),
  ));

  function queueTaskStatus(taskId: string, status: AnnualConferenceTask['status']) {
    const year = options.year.value;
    const key = taskOverrideKey(year, taskId);
    const existing = statusQueues.value.get(key);
    const cachedTask = queryClient
      .getQueryData<AnnualConferenceWorkPlanResponse>(queryKeys.annualConferenceWorkPlan(year))
      ?.tasks.find((task) => task.id === taskId);

    if (!existing && !cachedTask) return;

    const entry: StatusQueueEntry = existing
      ? { ...existing, desiredStatus: status }
      : {
        confirmedStatus: cachedTask!.status,
        desiredStatus: status,
        forcePersist: false,
        requestActive: false,
        taskId,
        year,
      };

    setPendingStatus(year, taskId, status);
    updateCachedTaskStatus(year, taskId, status);
    setStatusQueue(key, entry);
    void processStatusQueue(key);
  }

  async function processStatusQueue(key: string): Promise<void> {
    const entry = statusQueues.value.get(key);

    if (!entry || entry.requestActive) return;

    if (entry.desiredStatus === entry.confirmedStatus && !entry.forcePersist) {
      clearPendingStatus(entry.year, entry.taskId);
      clearStatusQueue(key);

      return;
    }

    const activeEntry = { ...entry, requestActive: true };

    setStatusQueue(key, activeEntry);

    try {
      const updatedTask = await api.updateTask(activeEntry.year, activeEntry.taskId, {
        status: activeEntry.desiredStatus,
      });
      const currentEntry = statusQueues.value.get(key);

      if (!currentEntry) return;

      const settledEntry = {
        ...currentEntry,
        confirmedStatus: updatedTask.status,
        forcePersist: false,
        requestActive: false,
      };

      setStatusQueue(key, settledEntry);

      if (settledEntry.desiredStatus === settledEntry.confirmedStatus) {
        await queryClient.cancelQueries({ queryKey: queryKeys.annualConferenceWorkPlan(settledEntry.year) });
        updateCachedTask(settledEntry.year, settledEntry.taskId, updatedTask);
        clearPendingStatus(settledEntry.year, settledEntry.taskId);
        clearStatusQueue(key);
        notify.success('Conference task updated.');
        void queryClient.invalidateQueries({ queryKey: queryKeys.annualConferenceWorkPlan(settledEntry.year) });

        return;
      }

      updateCachedTask(activeEntry.year, activeEntry.taskId, updatedTask);
      void processStatusQueue(key);
    } catch (error) {
      const currentEntry = statusQueues.value.get(key);

      if (!currentEntry) return;

      const settledEntry = { ...currentEntry, requestActive: false };

      if (settledEntry.desiredStatus !== activeEntry.desiredStatus) {
        setStatusQueue(key, { ...settledEntry, forcePersist: true });
        void processStatusQueue(key);

        return;
      }

      await queryClient.cancelQueries({ queryKey: queryKeys.annualConferenceWorkPlan(settledEntry.year) });
      updateCachedTaskStatus(settledEntry.year, settledEntry.taskId, settledEntry.confirmedStatus);
      clearPendingStatus(settledEntry.year, settledEntry.taskId);
      clearStatusQueue(key);
      notify.error(error instanceof Error ? error.message : 'Unable to update the task.');
      void queryClient.invalidateQueries({
        queryKey: queryKeys.annualConferenceWorkPlan(settledEntry.year),
      });
    }
  }

  function updateCachedTask(year: string, taskId: string, updatedTask: AnnualConferenceTask) {
    const queryKey = queryKeys.annualConferenceWorkPlan(year);

    queryClient.setQueryData<AnnualConferenceWorkPlanResponse>(queryKey, (current) => {
      if (!current) return current;

      return {
        ...current,
        tasks: current.tasks.map((task) => task.id === taskId ? updatedTask : task),
      };
    });
  }

  function updateCachedTaskStatus(year: string, taskId: string, status: AnnualConferenceTask['status']) {
    const queryKey = queryKeys.annualConferenceWorkPlan(year);

    queryClient.setQueryData<AnnualConferenceWorkPlanResponse>(queryKey, (current) => {
      if (!current) return current;

      return {
        ...current,
        tasks: current.tasks.map((task) => task.id === taskId ? { ...task, status } : task),
      };
    });
  }

  function setStatusQueue(key: string, entry: StatusQueueEntry) {
    const next = new Map(statusQueues.value);

    next.set(key, entry);
    statusQueues.value = next;
  }

  function clearStatusQueue(key: string) {
    const next = new Map(statusQueues.value);

    next.delete(key);
    statusQueues.value = next;
  }

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
    pendingStatusTaskIds,
    queueTaskStatus,
    refresh,
    openTask,
    editTask,
    openCreateDrawer,
    closeTaskDrawer,
  };
}

function taskOverrideKey(year: string, taskId: string): string {
  return `${year}:${taskId}`;
}
