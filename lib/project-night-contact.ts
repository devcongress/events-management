import type { PublicEventPrimaryAction } from '@/types';

export const PROJECT_NIGHT_CONTACT_LABEL = 'Message @aberkowitz';
export const PROJECT_NIGHT_CONTACT_URL = 'slack://user?team=T0A0T7A5Q&id=U3LB1TNLS';

export function isProjectNightEvent(name: string | null | undefined): boolean {
  return /\bproject[\s-]+night\b/i.test(name ?? '');
}

export function projectNightPrimaryAction(
  name: string | null | undefined,
): PublicEventPrimaryAction | null {
  if (!isProjectNightEvent(name)) return null;

  return {
    kind: 'slack_profile',
    label: PROJECT_NIGHT_CONTACT_LABEL,
    url: PROJECT_NIGHT_CONTACT_URL,
  };
}
