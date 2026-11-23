import { z } from 'zod';
import type { ArchiveItemKind } from '@/types';

export const DEFAULT_CFP_KINDS: ArchiveItemKind[] = ['talk', 'product_demo'];
export const cfpKindsSchema = z.array(z.enum(['talk', 'product_demo']))
  .min(1, 'Select at least one presentation format.')
  .max(2)
  .refine((kinds) => new Set(kinds).size === kinds.length, 'Choose each presentation format only once.');

export function allowedCfpKinds(kinds: ArchiveItemKind[] | undefined | null): ArchiveItemKind[] {
  return kinds ?? DEFAULT_CFP_KINDS;
}
