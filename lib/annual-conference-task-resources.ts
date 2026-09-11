import { safeHttpUrl } from '@/lib/safe-url';

export const ANNUAL_CONFERENCE_TASK_RESOURCE_LIMIT = 20;
export const ANNUAL_CONFERENCE_TASK_RESOURCE_LABEL_MAX_LENGTH = 120;

export interface AnnualConferenceTaskResource {
  id: string;
  task_id: string;
  url: string;
  label: string | null;
  created_by_email: string;
  updated_by_email: string;
  created_at: string;
  updated_at: string;
}

export interface AnnualConferenceTaskResourceView extends AnnualConferenceTaskResource {
  can_manage: boolean;
}

export interface AnnualConferenceTaskResourcesResponse {
  resources: AnnualConferenceTaskResourceView[];
  permissions: {
    can_add: boolean;
    can_manage_all: boolean;
    max_resources: number;
  };
}

export interface AnnualConferenceTaskResourceCreateInput {
  url: string;
  label?: string | null;
}

export interface AnnualConferenceTaskResourceUpdateInput {
  url?: string;
  label?: string | null;
}

export class AnnualConferenceTaskResourceLimitError extends Error {
  constructor() {
    super(`A task can have at most ${ANNUAL_CONFERENCE_TASK_RESOURCE_LIMIT} resource links.`);
    this.name = 'AnnualConferenceTaskResourceLimitError';
  }
}

export function normalizeTaskResourceUrl(value: string): string | null {
  return safeHttpUrl(value);
}

export function normalizeTaskResourceLabel(value: string | null | undefined): string | null {
  const label = value?.trim() ?? '';

  return label || null;
}

export function normalizeTaskResourceActorEmail(value: string): string {
  return value.trim().toLowerCase();
}
