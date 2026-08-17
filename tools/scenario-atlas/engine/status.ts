import type { AtlasCatalog, DisplayStatus, StoredStatus } from '../catalog/schema';

export type ScenarioRunState = { status: StoredStatus; note: string; updatedAt: string | null };
export type ScenarioStateMap = Record<string, ScenarioRunState>;

export type RuntimeScenario = AtlasCatalog['workflows'][number]['checkpoints'][number]['scenarios'][number] & ScenarioRunState;
export type RuntimeCheckpoint = Omit<AtlasCatalog['workflows'][number]['checkpoints'][number], 'scenarios'> & {
  status: DisplayStatus;
  scenarios: RuntimeScenario[];
};
export type RuntimeWorkflow = Omit<AtlasCatalog['workflows'][number], 'checkpoints'> & {
  status: DisplayStatus;
  checkpoints: RuntimeCheckpoint[];
  coverage: { verified: number; total: number; failed: number };
};

function checkpointStatus(scenarios: RuntimeScenario[], terminal = false): StoredStatus {
  if (terminal) return 'verified';
  if (scenarios.some((scenario) => scenario.status === 'failed')) return 'failed';
  if (scenarios.length > 0 && scenarios.every((scenario) => scenario.status === 'verified')) return 'verified';
  return 'untested';
}

export function applyScenarioState(catalog: AtlasCatalog, state: ScenarioStateMap): { version: number; workflows: RuntimeWorkflow[] } {
  return {
    version: catalog.version,
    workflows: catalog.workflows.map((workflow) => {
      let stoppedBeforeStage: number | null = null;
      const checkpoints = workflow.checkpoints.map((checkpoint) => {
        const scenarios = checkpoint.scenarios.map((scenario) => ({
          ...scenario,
          status: state[scenario.id]?.status ?? scenario.initialStatus,
          note: state[scenario.id]?.note ?? '',
          updatedAt: state[scenario.id]?.updatedAt ?? null,
        }));
        const stored = checkpointStatus(scenarios, checkpoint.terminal);
        const status: DisplayStatus = stoppedBeforeStage !== null && checkpoint.stage > stoppedBeforeStage
          ? 'not_reached'
          : stored;

        if (stoppedBeforeStage === null && stored !== 'verified') stoppedBeforeStage = checkpoint.stage;
        return { ...checkpoint, scenarios, status };
      });
      const allScenarios = checkpoints.flatMap((checkpoint) => checkpoint.scenarios);
      const failed = allScenarios.filter((scenario) => scenario.status === 'failed').length;
      const verified = allScenarios.filter((scenario) => scenario.status === 'verified').length;
      const first = checkpoints.find((checkpoint) => checkpoint.status !== 'verified');
      return {
        ...workflow,
        checkpoints,
        status: first?.status ?? 'verified',
        coverage: { verified, total: allScenarios.length, failed },
      };
    }),
  };
}
