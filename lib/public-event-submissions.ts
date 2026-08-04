export function publicEventSubmissionsEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function publicEventSubmissionsPublicDiscoveryEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}
