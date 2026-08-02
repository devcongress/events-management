export const TEST_EVENT_PREFIX = '[TEST]';

export function eventTestModeEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || normalized === 'false') return false;
  if (normalized === 'true') return true;
  throw new Error('EVENT_TEST_MODE must be either true or false.');
}

export function isTestEventTitle(value: string): boolean {
  return value.toUpperCase().startsWith(TEST_EVENT_PREFIX);
}

export function markTestEventTitle(value: string, enabled: boolean): string {
  if (!enabled || isTestEventTitle(value)) return value;
  return `${TEST_EVENT_PREFIX} ${value}`;
}
