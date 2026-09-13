import { describe, expect, it } from 'vitest';
import { defaultPresentationKeys, formsForMonth, presentationMonth, type PresentationForm } from './presentation-forms';

const form = (key: string, destination: PresentationForm['destination'], overrides: Partial<PresentationForm> = {}): PresentationForm => ({
  key, destination, event_id: null, conference_year: null, label: key, event_date: null, series_type: null, ...overrides,
});
const forms = [
  form('speakers', 'conference_cfp', { conference_year: 2026 }),
  form('volunteers', 'volunteer_intake'),
  form('september', 'event_feedback', { event_id: 'sep', event_date: '2026-09-26T09:00:00Z', series_type: 'monthly' }),
  form('october', 'event_feedback', { event_id: 'oct', event_date: '2026-10-24T09:00:00Z', series_type: 'monthly' }),
];

describe('presentation form selection', () => {
  it('lists closed feedback without selecting it and excludes the other form types', () => {
    const catalog = [...forms.map((item) => item.key === 'september' ? { ...item, available: false } : item), form('registration', 'event_registration'), form('monthly-speakers', 'monthly_cfp')];

    expect(formsForMonth(catalog, '2026-09').map((item) => item.key)).toEqual(['speakers', 'volunteers', 'september']);
    expect(defaultPresentationKeys(catalog, '2026-09')).toEqual(['speakers', 'volunteers']);
  });

  it('selects the three defaults for the requested month', () => {
    expect(defaultPresentationKeys(forms, '2026-09')).toEqual(['speakers', 'volunteers', 'september']);
    expect(defaultPresentationKeys(forms, '2026-10')).toEqual(['speakers', 'volunteers', 'october']);
  });

  it('never falls back to feedback from a different month', () => {
    expect(defaultPresentationKeys(forms, '2026-11')).toEqual(['speakers', 'volunteers']);
    expect(formsForMonth(forms, '2026-09').map((item) => item.key)).not.toContain('october');
  });

  it('requires an explicit choice when two monthly meetups have feedback', () => {
    expect(defaultPresentationKeys([...forms, { ...forms[2], key: 'second-meetup' }], '2026-09')).toEqual(['speakers', 'volunteers']);
  });

  it('does not select another series or conference year as a default', () => {
    expect(defaultPresentationKeys([{ ...forms[2], series_type: 'project_night' }], '2026-09')).toEqual([]);
    expect(defaultPresentationKeys(forms, '2027-09')).toEqual(['volunteers']);
  });

  it('uses the Accra calendar month at month boundaries', () => {
    expect(presentationMonth(new Date('2026-10-01T00:30:00+01:00'))).toBe('2026-09');
  });
});
