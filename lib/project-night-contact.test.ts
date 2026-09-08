import { describe, expect, it } from 'vitest';
import {
  PROJECT_NIGHT_CONTACT_LABEL,
  PROJECT_NIGHT_CONTACT_URL,
  isProjectNightEvent,
  projectNightPrimaryAction,
} from './project-night-contact';

describe('Project Night public contact action', () => {
  it.each([
    'Project Night',
    'DevCongress Project Night',
    'Project-Night: Accra',
    'devcongress project night 2026',
  ])('recognizes %s', (name) => {
    expect(isProjectNightEvent(name)).toBe(true);
    expect(projectNightPrimaryAction(name)).toEqual({
      kind: 'slack_profile',
      label: PROJECT_NIGHT_CONTACT_LABEL,
      url: PROJECT_NIGHT_CONTACT_URL,
    });
  });

  it.each(['Project showcase', 'Night of projects', 'Project Nightmare', null, undefined])(
    'does not classify %s as Project Night',
    (name) => {
      expect(isProjectNightEvent(name)).toBe(false);
      expect(projectNightPrimaryAction(name)).toBeNull();
    },
  );
});
