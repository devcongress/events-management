import type {
  AnnualConferenceTaskResourceCreateInput,
  AnnualConferenceTaskResourcesResponse,
  AnnualConferenceTaskResourceUpdateInput,
  AnnualConferenceTaskResourceView,
} from '@/lib/annual-conference-task-resources';
import { fetchJson } from '@/src/lib/api';

function taskResourcesPath(year: string | number, taskId: string): string {
  return `/api/annual-conference/${encodeURIComponent(String(year))}/work-plan/${encodeURIComponent(taskId)}/resources`;
}

export function fetchAnnualConferenceTaskResources(
  year: string | number,
  taskId: string,
): Promise<AnnualConferenceTaskResourcesResponse> {
  return fetchJson(taskResourcesPath(year, taskId), { credentials: 'include' });
}

export function createAnnualConferenceTaskResource(
  year: string | number,
  taskId: string,
  input: AnnualConferenceTaskResourceCreateInput,
): Promise<{ resource: AnnualConferenceTaskResourceView }> {
  return fetchJson(taskResourcesPath(year, taskId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateAnnualConferenceTaskResource(
  year: string | number,
  taskId: string,
  resourceId: string,
  input: AnnualConferenceTaskResourceUpdateInput,
): Promise<{ resource: AnnualConferenceTaskResourceView }> {
  return fetchJson(`${taskResourcesPath(year, taskId)}/${encodeURIComponent(resourceId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function deleteAnnualConferenceTaskResource(
  year: string | number,
  taskId: string,
  resourceId: string,
): Promise<{ deleted: true }> {
  return fetchJson(`${taskResourcesPath(year, taskId)}/${encodeURIComponent(resourceId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
}
