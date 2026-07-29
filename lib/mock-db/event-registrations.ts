import {
  nextRegistrationStatus,
  registrationAvailability,
} from '@/lib/event-registration';
import type {
  EventRegistration,
  EventRegistrationCampaign,
  EventRegistrationCampaignStatus,
  RegistrationEmailDeliveryStatus,
} from '@/types';
import { generateId, now } from '@/lib/utils';
import { readData, updateData, writeData } from './index';
import type { PendingRegistrationEmail } from '@/lib/supabase/event-registrations';

const CAMPAIGNS_FILE = 'event-registration-campaigns';
const REGISTRATIONS_FILE = 'event-registrations';
const EMAILS_FILE = 'registration-email-deliveries';

type MockEmailDelivery = {
  id: string;
  registration_id: string;
  status: RegistrationEmailDeliveryStatus;
  attempts: number;
  idempotency_key: string;
  provider_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export async function createMockRegistrationCampaign(input: {
  event_id: string;
  status?: EventRegistrationCampaignStatus;
  capacity: number;
  opens_at?: string | null;
  closes_at?: string | null;
  waitlist_enabled: boolean;
  auto_confirm: boolean;
}): Promise<EventRegistrationCampaign> {
  const campaigns = await readData<EventRegistrationCampaign>(CAMPAIGNS_FILE);
  const timestamp = now();
  const campaign: EventRegistrationCampaign = {
    id: generateId(),
    event_id: input.event_id,
    status: input.status ?? 'draft',
    capacity: input.capacity,
    opens_at: input.opens_at ?? null,
    closes_at: input.closes_at ?? null,
    waitlist_enabled: input.waitlist_enabled,
    auto_confirm: input.auto_confirm,
    created_at: timestamp,
    updated_at: timestamp,
  };
  campaigns.push(campaign);
  await writeData(CAMPAIGNS_FILE, campaigns);
  return campaign;
}

export async function getMockRegistrationCampaign(eventId: string): Promise<EventRegistrationCampaign | undefined> {
  return (await readData<EventRegistrationCampaign>(CAMPAIGNS_FILE))
    .find((campaign) => campaign.event_id === eventId);
}

export async function updateMockRegistrationCampaign(
  eventId: string,
  input: Partial<Omit<EventRegistrationCampaign, 'id' | 'event_id' | 'created_at'>>,
): Promise<EventRegistrationCampaign | undefined> {
  return updateData<EventRegistrationCampaign, EventRegistrationCampaign | undefined>(CAMPAIGNS_FILE, (campaigns) => {
    const index = campaigns.findIndex((campaign) => campaign.event_id === eventId);
    if (index < 0) return { data: campaigns, result: undefined };

    campaigns[index] = { ...campaigns[index], ...input, updated_at: now() };
    return { data: campaigns, result: campaigns[index] };
  });
}

export async function registerMockForEvent(input: {
  event_id: string;
  name: string;
  email: string;
}): Promise<EventRegistration> {
  const campaign = await getMockRegistrationCampaign(input.event_id);
  if (!campaign) throw new Error('registration_unavailable');

  const availability = registrationAvailability(campaign);
  if (!availability.available) throw new Error('registration_closed');

  const normalizedEmail = input.email.trim().toLowerCase();
  const result = await updateData<EventRegistration, EventRegistration>(REGISTRATIONS_FILE, (registrations) => {
    const existingIndex = registrations.findIndex((registration) => (
      registration.campaign_id === campaign.id
      && registration.email.trim().toLowerCase() === normalizedEmail
    ));
    if (existingIndex >= 0 && registrations[existingIndex].status !== 'cancelled') {
      throw new Error('registration_duplicate');
    }

    const confirmedCount = registrations.filter((registration) => (
      registration.campaign_id === campaign.id && registration.status === 'confirmed'
    )).length;
    const status = nextRegistrationStatus({
      autoConfirm: campaign.auto_confirm,
      capacity: campaign.capacity,
      confirmedCount,
      waitlistEnabled: campaign.waitlist_enabled,
    });
    if (!status) throw new Error('registration_full');

    const timestamp = now();
    const next: EventRegistration = {
      id: existingIndex >= 0 ? registrations[existingIndex].id : generateId(),
      campaign_id: campaign.id,
      name: input.name.trim(),
      email: input.email.trim(),
      status,
      confirmed_at: status === 'confirmed' ? timestamp : null,
      cancelled_at: null,
      checked_in_at: null,
      email_status: 'pending',
      created_at: existingIndex >= 0 ? registrations[existingIndex].created_at : timestamp,
      updated_at: timestamp,
    };

    if (existingIndex >= 0) registrations[existingIndex] = next;
    else registrations.push(next);
    return { data: registrations, result: next };
  });

  await updateData<MockEmailDelivery, void>(EMAILS_FILE, (deliveries) => {
    const existingIndex = deliveries.findIndex((delivery) => delivery.registration_id === result.id);
    const timestamp = now();
    const delivery: MockEmailDelivery = {
      id: existingIndex >= 0 ? deliveries[existingIndex].id : generateId(),
      registration_id: result.id,
      status: 'pending',
      attempts: 0,
      idempotency_key: `registration-confirmation-${result.id}`,
      provider_id: null,
      last_error: null,
      created_at: existingIndex >= 0 ? deliveries[existingIndex].created_at : timestamp,
      updated_at: timestamp,
    };
    if (existingIndex >= 0) deliveries[existingIndex] = delivery;
    else deliveries.push(delivery);
    return { data: deliveries, result: undefined };
  });

  return result;
}

export async function getMockEventRegistrations(eventId: string): Promise<EventRegistration[]> {
  const campaign = await getMockRegistrationCampaign(eventId);
  if (!campaign) return [];
  const deliveries = await readData<MockEmailDelivery>(EMAILS_FILE);
  const deliveryStatusByRegistration = new Map(
    deliveries.map((delivery) => [delivery.registration_id, delivery.status]),
  );
  return (await readData<EventRegistration>(REGISTRATIONS_FILE))
    .filter((registration) => registration.campaign_id === campaign.id)
    .map((registration) => ({
      ...registration,
      email_status: deliveryStatusByRegistration.get(registration.id) ?? registration.email_status,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function checkInMockRegistration(registrationId: string): Promise<string | undefined> {
  return updateData<EventRegistration, string | undefined>(REGISTRATIONS_FILE, (registrations) => {
    const index = registrations.findIndex((registration) => registration.id === registrationId);
    if (index < 0) return { data: registrations, result: undefined };
    const checkedInAt = now();
    registrations[index] = { ...registrations[index], checked_in_at: checkedInAt, updated_at: checkedInAt };
    return { data: registrations, result: checkedInAt };
  });
}

export async function cancelMockRegistration(registrationId: string): Promise<boolean> {
  return updateData<EventRegistration, boolean>(REGISTRATIONS_FILE, (registrations) => {
    const index = registrations.findIndex((registration) => registration.id === registrationId);
    if (index < 0) return { data: registrations, result: false };
    const timestamp = now();
    registrations[index] = {
      ...registrations[index],
      status: 'cancelled',
      cancelled_at: timestamp,
      updated_at: timestamp,
    };
    return { data: registrations, result: true };
  });
}

export async function deleteMockRegistration(registrationId: string): Promise<boolean> {
  const deleted = await updateData<EventRegistration, boolean>(REGISTRATIONS_FILE, (registrations) => {
    const nextRegistrations = registrations.filter((registration) => registration.id !== registrationId);
    return {
      data: nextRegistrations,
      result: nextRegistrations.length !== registrations.length,
    };
  });
  if (!deleted) return false;

  await updateData<MockEmailDelivery, void>(EMAILS_FILE, (deliveries) => ({
    data: deliveries.filter((delivery) => delivery.registration_id !== registrationId),
    result: undefined,
  }));
  return true;
}

export async function getMockPendingRegistrationEmails(eventId: string, limit = 100): Promise<PendingRegistrationEmail[]> {
  const registrations = await getMockEventRegistrations(eventId);
  const registrationsById = new Map(
    registrations
      .filter((registration) => registration.status !== 'cancelled')
      .map((registration) => [registration.id, registration]),
  );
  const deliveries = await readData<MockEmailDelivery>(EMAILS_FILE);

  return deliveries
    .filter((delivery) => registrationsById.has(delivery.registration_id) && delivery.status !== 'accepted')
    .slice(0, limit)
    .map((delivery) => {
      const registration = registrationsById.get(delivery.registration_id)!;
      return {
        delivery_id: delivery.id,
        registration_id: registration.id,
        idempotency_key: delivery.idempotency_key,
        attempts: delivery.attempts,
        name: registration.name,
        email: registration.email,
        registration_status: registration.status,
      };
    });
}

export async function updateMockRegistrationEmailDelivery(
  deliveryId: string,
  input: {
    status: RegistrationEmailDeliveryStatus;
    provider_id?: string | null;
    last_error?: string | null;
  },
): Promise<void> {
  await updateData<MockEmailDelivery, void>(EMAILS_FILE, (deliveries) => {
    const index = deliveries.findIndex((delivery) => delivery.id === deliveryId);
    if (index < 0) return { data: deliveries, result: undefined };
    deliveries[index] = {
      ...deliveries[index],
      status: input.status,
      attempts: deliveries[index].attempts + 1,
      provider_id: input.provider_id ?? null,
      last_error: input.last_error ?? null,
      updated_at: now(),
    };
    return { data: deliveries, result: undefined };
  });
}
