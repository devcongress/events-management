import rawCatalog from './workflows.json';
import { atlasCatalogSchema, type AtlasCatalog } from './schema';

export function validateCoverageContracts(catalog: AtlasCatalog): void {
  const ids = new Set<string>();

  for (const workflow of catalog.workflows) {
    for (const checkpoint of workflow.checkpoints) {
      for (const scenario of checkpoint.scenarios) {
        if (ids.has(scenario.id)) throw new Error(`Duplicate scenario id: ${scenario.id}`);
        ids.add(scenario.id);
      }
    }

    const covered = new Set(
      workflow.checkpoints.flatMap((checkpoint) => checkpoint.scenarios.flatMap((scenario) => scenario.covers)),
    );
    const excluded = new Set(
      workflow.coverageContract.excluded.map((item) => `${item.dimension}:${item.value}`),
    );

    for (const [dimension, values] of Object.entries(workflow.coverageContract.required)) {
      for (const value of values) {
        const key = `${dimension}:${value}`;
        if (!covered.has(key) && !excluded.has(key)) {
          throw new Error(`${workflow.id} leaves required coverage unaccounted for: ${key}`);
        }
      }
    }
  }
}

export function loadCatalog(): AtlasCatalog {
  const catalog = atlasCatalogSchema.parse(rawCatalog);
  validateCoverageContracts(catalog);
  return catalog;
}
