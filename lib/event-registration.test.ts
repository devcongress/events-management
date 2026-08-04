import { describe, expect, it } from 'vitest';
import {
  nextRegistrationStatus,
  registrationAvailability,
  summarizeEventRegistrations,
} from './event-registration';
import type { EventRegistration, EventRegistrationCampaign } from '@/types';

const campaign: EventRegistrationCampaign = {
  id: 'campaign-1',
  event_id: 'event-1',
  status: 'open',
  description: null,
  capacity: 2,
  opens_at: null,
  closes_at: null,
  waitlist_enabled: true,
  auto_confirm: true,
  created_at: '2026-07-28T00:00:00.000Z',
  updated_at: '2026-07-28T00:00:00.000Z',
};

function registration(
  id: string,
  status: EventRegistration['status'],
  checkedIn = false,
  emailStatus: EventRegistration['email_status'] = 'accepted',
): EventRegistration {
  return {
    id,
    campaign_id: campaign.id,
    name: `Guest ${id}`,
    email: `${id}@example.com`,
    status,
    confirmed_at: status === 'confirmed' ? '2026-07-28T00:00:00.000Z' : null,
    cancelled_at: status === 'cancelled' ? '2026-07-28T00:00:00.000Z' : null,
    checked_in_at: checkedIn ? '2026-07-28T00:00:00.000Z' : null,
    email_status: emailStatus,
    created_at: '2026-07-28T00:00:00.000Z',
    updated_at: '2026-07-28T00:00:00.000Z',
  };
}

describe('event registration policy', () => {
  it('only opens an open campaign inside its configured window', () => {
    expect(registrationAvailability(campaign, Date.parse('2026-07-28T12:00:00Z'))).toEqual({ available: true });
    expect(registrationAvailability({ ...campaign, status: 'draft' })).toEqual({ available: false, reason: 'draft' });
    expect(registrationAvailability({ ...campaign, status: 'closed' })).toEqual({ available: false, reason: 'closed' });
    expect(registrationAvailability({ ...campaign, opens_at: '2026-07-29T00:00:00Z' }, Date.parse('2026-07-28T12:00:00Z')))
      .toEqual({ available: false, reason: 'not_open' });
    expect(registrationAvailability({ ...campaign, closes_at: '2026-07-27T00:00:00Z' }, Date.parse('2026-07-28T12:00:00Z')))
      .toEqual({ available: false, reason: 'ended' });
  });

  it('confirms inside capacity and waitlists after capacity', () => {
    expect(nextRegistrationStatus({
      autoConfirm: true,
      capacity: 2,
      confirmedCount: 1,
      waitlistEnabled: true,
    })).toBe('confirmed');
    expect(nextRegistrationStatus({
      autoConfirm: true,
      capacity: 2,
      confirmedCount: 2,
      waitlistEnabled: true,
    })).toBe('waitlisted');
  });

  it('summarizes active guests without counting cancellations', () => {
    expect(summarizeEventRegistrations(campaign, [
      registration('1', 'confirmed', true),
      registration('2', 'confirmed', false, 'pending'),
      registration('3', 'waitlisted'),
      registration('4', 'cancelled'),
    ])).toEqual({
      total: 3,
      confirmed: 2,
      waitlisted: 1,
      checked_in: 1,
      available: 0,
      pending_emails: 1,
    });
  });
});
