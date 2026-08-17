import { z } from 'zod';

export const storedStatusSchema = z.enum(['untested', 'verified', 'failed']);
export type StoredStatus = z.infer<typeof storedStatusSchema>;
export type DisplayStatus = StoredStatus | 'not_reached';

const scenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  precondition: z.string().min(1),
  action: z.string().min(1),
  expected: z.string().min(1),
  initialStatus: storedStatusSchema,
  covers: z.array(z.string().regex(/^[a-z-]+:[a-z0-9-]+$/)).min(1),
});

const checkpointSchema = z.object({
  id: z.string().min(1),
  stage: z.number().int().positive(),
  label: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  terminal: z.boolean().optional(),
  scenarios: z.array(scenarioSchema),
}).superRefine((checkpoint, context) => {
  if (!checkpoint.terminal && checkpoint.scenarios.length === 0) {
    context.addIssue({ code: 'custom', message: 'Non-terminal checkpoints require at least one scenario.' });
  }
});

const coverageContractSchema = z.object({
  required: z.record(z.string(), z.array(z.string().min(1)).min(1)),
  excluded: z.array(z.object({ dimension: z.string(), value: z.string(), reason: z.string().min(1) })),
});

const workflowSchema = z.object({
  id: z.string().min(1),
  index: z.string().min(1),
  actor: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  coverageContract: coverageContractSchema,
  checkpoints: z.array(checkpointSchema).min(1),
});

export const atlasCatalogSchema = z.object({
  version: z.number().int().positive(),
  workflows: z.array(workflowSchema).min(1),
});

export type AtlasCatalog = z.infer<typeof atlasCatalogSchema>;
export type AtlasWorkflow = AtlasCatalog['workflows'][number];
export type AtlasCheckpoint = AtlasWorkflow['checkpoints'][number];
export type AtlasScenario = AtlasCheckpoint['scenarios'][number];
