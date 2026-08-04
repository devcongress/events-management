import { describe, expect, it } from 'vitest';
import {
  ARCHIVE_REQUESTS_CHECKLIST_LABEL,
  canChangeChecklistItemAvailability,
  isArchiveRequestsDisabledForEvent,
  isArchiveRequestsChecklistItem,
  isSystemDesignChecklistItem,
  isSystemDesignDisabledForEvent,
  isSystemDesignWorkspaceDisabled,
  SYSTEM_DESIGN_CHECKLIST_LABEL,
} from './event-checklist-policy';

describe('event checklist feature policy', () => {
  it('recognizes the monthly system design checklist item', () => {
    expect(isSystemDesignChecklistItem({ label: SYSTEM_DESIGN_CHECKLIST_LABEL })).toBe(true);
    expect(isSystemDesignChecklistItem({ label: 'Confirm speakers and talks' })).toBe(false);
  });

  it('disables system design only when its event checklist item is disabled', () => {
    expect(isSystemDesignDisabledForEvent([
      { label: SYSTEM_DESIGN_CHECKLIST_LABEL, disabled_at: '2026-07-26T15:00:00.000Z' },
      { label: 'Confirm speakers and talks', disabled_at: null },
    ])).toBe(true);

    expect(isSystemDesignDisabledForEvent([
      { label: SYSTEM_DESIGN_CHECKLIST_LABEL, disabled_at: null },
      { label: 'Confirm speakers and talks', disabled_at: '2026-07-26T15:00:00.000Z' },
    ])).toBe(false);
  });

  it('keeps historical System Design workspaces available when saved source evidence exists', () => {
    const disabledChecklist = [
      { label: SYSTEM_DESIGN_CHECKLIST_LABEL, disabled_at: '2026-07-26T15:00:00.000Z' },
    ];

    expect(isSystemDesignWorkspaceDisabled(disabledChecklist, true)).toBe(false);
    expect(isSystemDesignWorkspaceDisabled(disabledChecklist, false)).toBe(true);
  });

  it('keeps archive requests off until their per-event item is explicitly enabled', () => {
    expect(isArchiveRequestsChecklistItem({ label: ARCHIVE_REQUESTS_CHECKLIST_LABEL })).toBe(true);
    expect(isArchiveRequestsDisabledForEvent([])).toBe(true);
    expect(isArchiveRequestsDisabledForEvent([
      { label: ARCHIVE_REQUESTS_CHECKLIST_LABEL, disabled_at: '2026-08-04T09:00:00.000Z' },
    ])).toBe(true);
    expect(isArchiveRequestsDisabledForEvent([
      { label: ARCHIVE_REQUESTS_CHECKLIST_LABEL, disabled_at: null },
    ])).toBe(false);
  });

  it('keeps the monthly system design choice editable after event publication', () => {
    expect(canChangeChecklistItemAvailability({
      label: SYSTEM_DESIGN_CHECKLIST_LABEL,
      completed: false,
    }, true)).toBe(true);
    expect(canChangeChecklistItemAvailability({
      label: 'Confirm speakers and talks',
      completed: false,
    }, true)).toBe(false);
    expect(canChangeChecklistItemAvailability({
      label: 'Confirm speakers and talks',
      completed: false,
    }, false)).toBe(true);
    expect(canChangeChecklistItemAvailability({
      label: SYSTEM_DESIGN_CHECKLIST_LABEL,
      completed: true,
    }, true)).toBe(false);
    expect(canChangeChecklistItemAvailability({
      label: ARCHIVE_REQUESTS_CHECKLIST_LABEL,
      completed: true,
      disabled_at: '2026-08-04T09:00:00.000Z',
    }, true)).toBe(true);
  });
});
