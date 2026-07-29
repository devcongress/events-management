import type {
  EventRegistration,
  EventRegistrationCampaign,
  EventRegistrationStatus,
  EventRegistrationSummary,
} from '@/types';

export type RegistrationAvailability =
  | { available: true }
  | { available: false; reason: 'draft' | 'closed' | 'not_open' | 'ended' };

export function registrationAvailability(
  campaign: EventRegistrationCampaign,
  nowMs = Date.now(),
): RegistrationAvailability {
  if (campaign.status === 'draft') return { available: false, reason: 'draft' };
  if (campaign.status === 'closed') return { available: false, reason: 'closed' };

  const opensAt = campaign.opens_at ? new Date(campaign.opens_at).getTime() : null;
  if (opensAt !== null && Number.isFinite(opensAt) && opensAt > nowMs) {
    return { available: false, reason: 'not_open' };
  }

  const closesAt = campaign.closes_at ? new Date(campaign.closes_at).getTime() : null;
  if (closesAt !== null && Number.isFinite(closesAt) && closesAt < nowMs) {
    return { available: false, reason: 'ended' };
  }

  return { available: true };
}

export function nextRegistrationStatus(input: {
  autoConfirm: boolean;
  capacity: number;
  confirmedCount: number;
  waitlistEnabled: boolean;
}): EventRegistrationStatus | null {
  if (input.autoConfirm && input.confirmedCount < input.capacity) return 'confirmed';
  if (input.waitlistEnabled) return 'waitlisted';
  return null;
}

export function summarizeEventRegistrations(
  campaign: EventRegistrationCampaign,
  registrations: EventRegistration[],
): EventRegistrationSummary {
  const active = registrations.filter((registration) => registration.status !== 'cancelled');
  const confirmed = active.filter((registration) => registration.status === 'confirmed').length;

  return {
    total: active.length,
    confirmed,
    waitlisted: active.filter((registration) => registration.status === 'waitlisted').length,
    checked_in: active.filter((registration) => Boolean(registration.checked_in_at)).length,
    available: Math.max(0, campaign.capacity - confirmed),
    pending_emails: active.filter((registration) => registration.email_status === 'pending' || registration.email_status === 'failed').length,
  };
}
