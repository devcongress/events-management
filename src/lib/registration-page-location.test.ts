import { describe, expect, it } from 'vitest';
import type { Event } from '@/types';
import { registrationPageDetailsPatch, registrationPageLocationDraft, registrationPageLocationPatch, registrationPageLocationValid } from './registration-page-location';

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: 'event', name: 'Meetup', description: 'Details', event_date: '2026-11-20T18:00:00Z',
    status: 'upcoming', created_at: '', updated_at: '', location_type: 'online',
    location: { name: 'Online', label: 'Online', url: null }, online_url: null,
    stream_url: 'https://youtube.com/recording', ...overrides,
  };
}

describe('registration page location draft', () => {
  it('adds, edits and clears a public joining link without touching the venue or recording', () => {
    const saved = registrationPageLocationDraft(event());
    const added = { ...saved, online_url: ' https://meet.google.com/abc ' };

    expect(registrationPageLocationValid(added)).toBe(true);
    expect(registrationPageLocationPatch(added, saved)).toEqual({ online_url: 'https://meet.google.com/abc' });
    expect(registrationPageLocationPatch({ ...added, online_url: 'https://meet.google.com/def' }, added)).toEqual({ online_url: 'https://meet.google.com/def' });
    expect(registrationPageLocationPatch({ ...added, online_url: '' }, added)).toEqual({ online_url: null });
    expect(registrationPageLocationPatch(saved, saved)).toEqual({});
  });

  it('sends only changed details so a link-only save preserves the stored event data', () => {
    const saved = {
      ...registrationPageLocationDraft(event()),
      name: 'Meetup',
      description: 'Details',
      event_date: '2026-11-20T18:00',
      end_date: '',
    };

    expect(registrationPageDetailsPatch({ ...saved, online_url: 'https://meet.example.com/room' }, saved)).toEqual({
      online_url: 'https://meet.example.com/room',
    });
    expect(registrationPageDetailsPatch({ ...saved, name: 'New name', end_date: '2026-11-20T21:00' }, saved)).toEqual({
      name: 'New name',
      end_date: new Date('2026-11-20T21:00').toISOString(),
    });
  });

  it('allows switching to online before a link is ready and clears the physical venue', () => {
    const saved = registrationPageLocationDraft(event({ location_type: 'in_person', location: { name: 'Accra', label: 'Accra', url: null } }));
    const online = { ...saved, location_type: 'online' as const };

    expect(registrationPageLocationValid(online)).toBe(true);
    expect(registrationPageLocationPatch(online, saved)).toEqual({ location_type: 'online', location: { name: 'Online', label: 'Online', url: null }, venue_address: null });
    expect(registrationPageLocationValid({ ...online, location_type: 'in_person' })).toBe(true);
  });

  it('keeps a hybrid map and venue unchanged when updating the joining link', () => {
    const saved = registrationPageLocationDraft(event({ location_type: 'hybrid', location: { name: 'Venue', label: 'Venue', url: 'https://maps.google.com/?q=Accra' } }));
    const draft = { ...saved, online_url: 'https://meet.example.com/room' };

    expect(registrationPageLocationValid(draft)).toBe(true);
    expect(registrationPageLocationPatch(draft, saved)).toEqual({ online_url: 'https://meet.example.com/room' });
    expect(registrationPageLocationPatch({ ...saved, location_type: 'in_person' }, saved)).toEqual({ location_type: 'in_person', online_url: null });
  });

  it('requires a new venue when an online event becomes in person or hybrid', () => {
    const saved = registrationPageLocationDraft(event({ online_url: 'https://meet.example.com/room' }));
    const physical = { ...saved, location_type: 'in_person' as const };
    const hybrid = { ...saved, location_type: 'hybrid' as const };

    expect(registrationPageLocationValid(physical)).toBe(false);
    expect(registrationPageLocationValid(hybrid)).toBe(false);
    expect(registrationPageLocationPatch({ ...physical, location_name: 'Accra' }, saved)).toEqual({
      location_type: 'in_person', online_url: null,
      location: { name: 'Accra', label: 'Accra', url: null }, venue_address: null,
    });
    expect(registrationPageLocationPatch({ ...hybrid, location_name: 'Accra' }, saved)).toEqual({
      location_type: 'hybrid', location: { name: 'Accra', label: 'Accra', url: null }, venue_address: null,
    });
  });

  it.each(['Online event', '  virtual  ', 'Virtual Event'])('does not treat %s as a venue when switching from online', (name) => {
    const saved = registrationPageLocationDraft(event({ location: { name, url: null } }));

    expect(saved.location_name).toBe('');
    expect(registrationPageLocationValid({ ...saved, location_type: 'hybrid' })).toBe(false);
    expect(registrationPageLocationValid({ ...saved, location_type: 'in_person' })).toBe(false);
  });

  it('clears a hybrid venue when switching online and ignores inactive draft edits', () => {
    const saved = registrationPageLocationDraft(event({ location_type: 'hybrid', location: { name: 'Accra', label: 'Accra', url: null } }));

    expect(registrationPageLocationPatch({ ...saved, location_type: 'online' }, saved)).toEqual({
      location_type: 'online', location: { name: 'Online', label: 'Online', url: null }, venue_address: null,
    });
    expect(registrationPageLocationPatch({ ...saved, location_url: 'unused' }, saved)).toEqual({});
    const physical = { ...saved, location_type: 'in_person' as const };

    expect(registrationPageLocationPatch({ ...physical, online_url: 'unused' }, physical)).toEqual({});
  });

  it('recognizes legacy Online labels even with an inconsistent type, without using stream links as evidence', () => {
    for (const locationType of [undefined, 'in_person'] as const) {
      const saved = registrationPageLocationDraft(event({ location_type: locationType }));

      expect(saved.location_type).toBe('online');
      expect(registrationPageLocationPatch(saved, saved)).toEqual({});
      expect(registrationPageLocationPatch({ ...saved, online_url: 'https://meet.example.com/room' }, saved)).toEqual({
        location_type: 'online', online_url: 'https://meet.example.com/room',
      });
    }

    const lowercase = registrationPageLocationDraft(event({ location: { name: '  online  ', url: null } }));

    expect(lowercase.location_name).toBe('');
    expect(registrationPageLocationValid({ ...lowercase, location_type: 'in_person' })).toBe(false);
    expect(registrationPageLocationDraft(event({ location_type: undefined, location: { name: 'Accra', url: null } })).location_type).toBe('in_person');
  });

  it.each(['http://example.com', 'javascript:alert(1)', 'https://localhost/room', 'https://user:pass@example.com'])('rejects unsafe joining link %s', (url) => {
    expect(registrationPageLocationValid({ ...registrationPageLocationDraft(event()), online_url: url })).toBe(false);
  });
});
