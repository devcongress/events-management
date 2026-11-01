import { z } from 'zod';

export const programmeTypes = ['talk', 'product_demo', 'system_design', 'workshop', 'panel', 'open_discussion', 'networking', 'break'] as const;

const resourceUrl = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;

  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}, 'Use a valid HTTP or HTTPS resource URL.');

export const programmeRowSchema = z.object({
  id: z.string().uuid(),
  time: z.string().trim().max(80).transform((value) => value || 'TBD'),
  title: z.string().trim().min(1, 'Each row needs a title.').max(200),
  type: z.enum(programmeTypes),
  lead: z.string().trim().max(200),
  description: z.string().trim().max(2000),
  resourceTitle: z.string().trim().max(200),
  resourceUrl,
}).strict();

export const programmeSaveSchema = z.object({
  revision: z.number().int().nonnegative().max(2147483646),
  rows: z.array(programmeRowSchema).max(100),
}).strict().refine((value) => new Set(value.rows.map((row) => row.id)).size === value.rows.length, 'Row IDs must be unique.');

export type ProgrammeRow = z.output<typeof programmeRowSchema>;
export type ProgrammeSave = z.output<typeof programmeSaveSchema>;
export type ProgrammeSnapshot = { rows: ProgrammeRow[]; revision: number; updated_at: string | null; updated_by: string | null };
