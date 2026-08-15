import { describe, expect, it } from 'vitest';
import { emailPreviewCatalog } from './previews';
import { EMAIL_SCENARIOS, EMAIL_SENDERS } from './scenarios';

describe('owner email preview catalog', () => {
  it('renders one preview for every active email scenario', () => {
    const catalog = emailPreviewCatalog();
    const activeIds = EMAIL_SCENARIOS
      .filter((scenario) => scenario.status === 'active')
      .map((scenario) => scenario.id)
      .sort();

    expect(catalog.previews.map((preview) => preview.id).sort()).toEqual(activeIds);
    expect(new Set(catalog.previews.map((preview) => preview.id)).size).toBe(catalog.previews.length);
  });

  it('uses the production renderers and sender identities with safe sample recipients', () => {
    const catalog = emailPreviewCatalog();

    expect(catalog.previews).toHaveLength(12);
    expect(catalog.previews.every((preview) => preview.html.startsWith('<!doctype html>'))).toBe(true);
    expect(catalog.previews.every((preview) => preview.text.trim().length > 0)).toBe(true);
    expect(catalog.previews.every((preview) => preview.subject.trim().length > 0)).toBe(true);
    expect(catalog.previews.every((preview) => (
      preview.from === EMAIL_SENDERS.events.from || preview.from === EMAIL_SENDERS.speakers.from
    ))).toBe(true);
    expect(catalog.previews.every((preview) => preview.to.endsWith('example.com>') || preview.to === 'Confirmed guests for this event')).toBe(true);
  });

  it('separates planned scenarios instead of inventing renderings', () => {
    const catalog = emailPreviewCatalog();
    const plannedIds = EMAIL_SCENARIOS
      .filter((scenario) => scenario.status === 'planned')
      .map((scenario) => scenario.id)
      .sort();

    expect(catalog.planned.map((scenario) => scenario.id).sort()).toEqual(plannedIds);
    expect(catalog.planned).toHaveLength(5);
  });
});
