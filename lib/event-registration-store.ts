import type { Context } from 'hono';
import type {
  EventRegistration,
  EventRegistrationCampaign,
  EventRegistrationCampaignStatus,
  RegistrationEmailKind,
  RegistrationEmailDeliveryStatus,
} from '@/types';
import {
  cancelMockRegistration,
  checkInMockRegistration,
  createMockRegistrationCampaign,
  deleteMockRegistration,
  getMockEventRegistrations,
  getMockPendingRegistrationEmails,
  getMockRegistrationCampaign,
  registerMockForEvent,
  updateMockRegistrationCampaign,
  updateMockRegistrationEmailDelivery,
} from '@/lib/mock-db/event-registrations';
import {
  cancelSupabaseRegistration,
  checkInSupabaseRegistration,
  createSupabaseRegistrationCampaign,
  deleteSupabaseRegistration,
  getSupabaseEventRegistrations,
  getSupabasePendingRegistrationEmails,
  getSupabaseRegistrationCampaign,
  registerSupabaseForEvent,
  updateSupabaseRegistrationCampaign,
  updateSupabaseRegistrationEmailDelivery,
  type PendingRegistrationEmail,
} from '@/lib/supabase/event-registrations';

export type RegistrationCampaignInput = {
  status?: EventRegistrationCampaignStatus;
  description?: string | null;
  capacity: number;
  opens_at?: string | null;
  closes_at?: string | null;
  waitlist_enabled: boolean;
  auto_confirm: boolean;
};

export type RegistrationCancellationResult = {
  cancelled: boolean;
  promotedRegistrationId: string | null;
};

export async function createRegistrationCampaign(
  eventId: string,
  input: RegistrationCampaignInput,
  c?: Context,
): Promise<EventRegistrationCampaign> {
  return await createSupabaseRegistrationCampaign({ event_id: eventId, ...input }, c)
    ?? createMockRegistrationCampaign({ event_id: eventId, ...input });
}

export async function getRegistrationCampaign(
  eventId: string,
  c?: Context,
): Promise<EventRegistrationCampaign | undefined> {
  const campaign = await getSupabaseRegistrationCampaign(eventId, c);
  return campaign !== null ? campaign : getMockRegistrationCampaign(eventId);
}

export async function updateRegistrationCampaign(
  eventId: string,
  input: Partial<Omit<EventRegistrationCampaign, 'id' | 'event_id' | 'created_at' | 'updated_at'>>,
  c?: Context,
): Promise<EventRegistrationCampaign | undefined> {
  const campaign = await updateSupabaseRegistrationCampaign(eventId, input, c);
  return campaign !== null ? campaign : updateMockRegistrationCampaign(eventId, input);
}

export async function registerForEvent(
  input: { event_id: string; name: string; email: string },
  c?: Context,
): Promise<EventRegistration> {
  return await registerSupabaseForEvent(input, c) ?? registerMockForEvent(input);
}

export async function getEventRegistrations(
  eventId: string,
  c?: Context,
): Promise<EventRegistration[]> {
  return await getSupabaseEventRegistrations(eventId, c) ?? getMockEventRegistrations(eventId);
}

export async function checkInRegistration(
  registrationId: string,
  checkedInByEmail: string | null,
  c?: Context,
): Promise<string | undefined> {
  const checkedInAt = await checkInSupabaseRegistration(registrationId, checkedInByEmail, c);
  return checkedInAt !== null ? checkedInAt : checkInMockRegistration(registrationId);
}

export async function cancelRegistration(
  registrationId: string,
  c?: Context,
): Promise<RegistrationCancellationResult> {
  return await cancelSupabaseRegistration(registrationId, c) ?? cancelMockRegistration(registrationId);
}

export async function deleteRegistration(
  registrationId: string,
  c?: Context,
): Promise<boolean> {
  return await deleteSupabaseRegistration(registrationId, c) ?? deleteMockRegistration(registrationId);
}

export async function getPendingRegistrationEmails(
  eventId: string,
  input: {
    limit?: number;
    registrationId?: string;
    statuses?: Array<Extract<RegistrationEmailDeliveryStatus, 'pending' | 'failed'>>;
    kinds?: RegistrationEmailKind[];
  } = {},
  c?: Context,
): Promise<PendingRegistrationEmail[]> {
  return await getSupabasePendingRegistrationEmails(eventId, input, c)
    ?? getMockPendingRegistrationEmails(eventId, input);
}

export async function updateRegistrationEmailDelivery(
  deliveryId: string,
  input: {
    status: RegistrationEmailDeliveryStatus;
    provider_id?: string | null;
    last_error?: string | null;
  },
  c?: Context,
): Promise<void> {
  const result = await updateSupabaseRegistrationEmailDelivery(deliveryId, input, c);
  if (result === null) {
    await updateMockRegistrationEmailDelivery(deliveryId, input);
  }
}
