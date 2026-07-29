import type { Context } from 'hono';
import type {
  EventRegistration,
  EventRegistrationCampaign,
  EventRegistrationCampaignStatus,
  RegistrationEmailKind,
  RegistrationEmailDeliveryStatus,
} from '@/types';
import type { Database } from '@/types/supabase';
import { getSupabaseAdminClient, isSupabaseRuntimeEnabled } from './server';

type CampaignInsert = Database['public']['Tables']['event_registration_campaigns']['Insert'];
type CampaignUpdate = Database['public']['Tables']['event_registration_campaigns']['Update'];
type RegistrationRow = Database['public']['Tables']['event_registrations']['Row'];
type EmailDeliveryRow = Database['public']['Tables']['registration_email_deliveries']['Row'];

export type PendingRegistrationEmail = {
  delivery_id: string;
  registration_id: string;
  idempotency_key: string;
  attempts: number;
  kind: RegistrationEmailKind;
  name: string;
  email: string;
  registration_status: EventRegistration['status'];
};

export function canUseSupabaseEventRegistrations(c?: Context): boolean {
  return isSupabaseRuntimeEnabled(c);
}

export async function createSupabaseRegistrationCampaign(
  input: {
    event_id: string;
    status?: EventRegistrationCampaignStatus;
    capacity: number;
    opens_at?: string | null;
    closes_at?: string | null;
    waitlist_enabled: boolean;
    auto_confirm: boolean;
  },
  c?: Context,
): Promise<EventRegistrationCampaign | null> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const insert: CampaignInsert = input;
  const { data, error } = await getSupabaseAdminClient(c)
    .from('event_registration_campaigns')
    .insert(insert)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getSupabaseRegistrationCampaign(
  eventId: string,
  c?: Context,
): Promise<EventRegistrationCampaign | null | undefined> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('event_registration_campaigns')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? undefined;
}

export async function updateSupabaseRegistrationCampaign(
  eventId: string,
  input: CampaignUpdate,
  c?: Context,
): Promise<EventRegistrationCampaign | null | undefined> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('event_registration_campaigns')
    .update(input)
    .eq('event_id', eventId)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ?? undefined;
}

export async function registerSupabaseForEvent(
  input: { event_id: string; name: string; email: string },
  c?: Context,
): Promise<EventRegistration | null> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c).rpc('register_for_event', {
    p_event_id: input.event_id,
    p_name: input.name,
    p_email: input.email,
  });

  if (error) throw new Error(error.message);
  return toEventRegistration(data, null, {
    status: 'pending',
    kind: 'confirmation',
  });
}

export async function getSupabaseEventRegistrations(
  eventId: string,
  c?: Context,
): Promise<EventRegistration[] | null> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const campaign = await getSupabaseRegistrationCampaign(eventId, c);
  if (!campaign) return [];

  const client = getSupabaseAdminClient(c);
  const registrationsResult = await client
    .from('event_registrations')
    .select('*')
    .eq('campaign_id', campaign.id)
    .order('created_at', { ascending: false });
  if (registrationsResult.error) throw new Error(registrationsResult.error.message);
  if (registrationsResult.data.length === 0) return [];

  const registrationIds = registrationsResult.data.map((registration) => registration.id);
  const [checkinsResult, deliveriesResult] = await Promise.all([
    client
      .from('event_registration_checkins')
      .select('*')
      .in('registration_id', registrationIds),
    client
      .from('registration_email_deliveries')
      .select('*')
      .in('registration_id', registrationIds)
      .order('updated_at', { ascending: true }),
  ]);
  if (checkinsResult.error) throw new Error(checkinsResult.error.message);
  if (deliveriesResult.error) throw new Error(deliveriesResult.error.message);

  const checkinsByRegistration = new Map(
    checkinsResult.data.map((checkin) => [checkin.registration_id, checkin.checked_in_at]),
  );
  const deliveriesByRegistration = new Map<string, EmailDeliveryRow>();
  for (const delivery of deliveriesResult.data) {
    deliveriesByRegistration.set(delivery.registration_id, delivery);
  }

  return registrationsResult.data.map((registration) => toEventRegistration(
    registration,
    checkinsByRegistration.get(registration.id) ?? null,
    deliveriesByRegistration.get(registration.id) ?? null,
  ));
}

export async function checkInSupabaseRegistration(
  registrationId: string,
  checkedInByEmail: string | null,
  c?: Context,
): Promise<string | null> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const checkedInAt = new Date().toISOString();
  const { error } = await getSupabaseAdminClient(c)
    .from('event_registration_checkins')
    .upsert({
      registration_id: registrationId,
      checked_in_at: checkedInAt,
      checked_in_by_email: checkedInByEmail,
    }, { onConflict: 'registration_id' });

  if (error) throw new Error(error.message);
  return checkedInAt;
}

export async function cancelSupabaseRegistration(
  registrationId: string,
  c?: Context,
): Promise<{
  cancelled: boolean;
  promotedRegistrationId: string | null;
} | null> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c).rpc('cancel_registration_and_promote', {
    p_registration_id: registrationId,
  });

  if (error) throw new Error(error.message);
  const result = data?.[0];
  return {
    cancelled: result?.cancelled === true,
    promotedRegistrationId: result?.promoted_registration_id ?? null,
  };
}

export async function deleteSupabaseRegistration(
  registrationId: string,
  c?: Context,
): Promise<boolean | null> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('event_registrations')
    .delete()
    .eq('id', registrationId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getSupabasePendingRegistrationEmails(
  eventId: string,
  input: {
    limit?: number;
    registrationId?: string;
    statuses?: Array<Extract<RegistrationEmailDeliveryStatus, 'pending' | 'failed'>>;
    kinds?: RegistrationEmailKind[];
  } = {},
  c?: Context,
): Promise<PendingRegistrationEmail[] | null> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const campaign = await getSupabaseRegistrationCampaign(eventId, c);
  if (!campaign) return [];

  const client = getSupabaseAdminClient(c);
  const { data: registrations, error: registrationsError } = await client
    .from('event_registrations')
    .select('*')
    .eq('campaign_id', campaign.id)
    .neq('status', 'cancelled');
  if (registrationsError) throw new Error(registrationsError.message);

  const registrationsById = new Map(registrations.map((registration) => [registration.id, registration]));
  if (input.registrationId) {
    const registration = registrationsById.get(input.registrationId);
    registrationsById.clear();
    if (registration) registrationsById.set(registration.id, registration);
  }
  if (registrationsById.size === 0) return [];

  const { data: deliveries, error: deliveriesError } = await client
    .from('registration_email_deliveries')
    .select('*')
    .in('registration_id', Array.from(registrationsById.keys()))
    .in('kind', input.kinds ?? ['confirmation', 'promotion'])
    .in('status', input.statuses ?? ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(input.limit ?? 100);
  if (deliveriesError) throw new Error(deliveriesError.message);

  return deliveries.flatMap((delivery) => {
    const registration = registrationsById.get(delivery.registration_id);
    return registration ? [toPendingEmail(delivery, registration)] : [];
  });
}

export async function updateSupabaseRegistrationEmailDelivery(
  deliveryId: string,
  input: {
    status: RegistrationEmailDeliveryStatus;
    provider_id?: string | null;
    last_error?: string | null;
  },
  c?: Context,
): Promise<void | null> {
  if (!canUseSupabaseEventRegistrations(c)) return null;

  const attemptedAt = new Date().toISOString();
  const client = getSupabaseAdminClient(c);
  const { data: current, error: currentError } = await client
    .from('registration_email_deliveries')
    .select('attempts')
    .eq('id', deliveryId)
    .single();
  if (currentError) throw new Error(currentError.message);

  const { error } = await client
    .from('registration_email_deliveries')
    .update({
      status: input.status,
      provider_id: input.provider_id ?? null,
      last_error: input.last_error ?? null,
      attempts: current.attempts + 1,
      last_attempt_at: attemptedAt,
      accepted_at: input.status === 'accepted' ? attemptedAt : null,
    })
    .eq('id', deliveryId);

  if (error) throw new Error(error.message);
}

function toEventRegistration(
  row: RegistrationRow,
  checkedInAt: string | null,
  emailDelivery: Pick<EmailDeliveryRow, 'status' | 'kind'> | null,
): EventRegistration {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    name: row.name,
    email: row.email,
    status: row.status,
    confirmed_at: row.confirmed_at,
    cancelled_at: row.cancelled_at,
    checked_in_at: checkedInAt,
    email_status: emailDelivery?.status ?? null,
    email_kind: emailDelivery
      ? registrationEmailKind(emailDelivery.kind)
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toPendingEmail(
  delivery: EmailDeliveryRow,
  registration: RegistrationRow,
): PendingRegistrationEmail {
  return {
    delivery_id: delivery.id,
    registration_id: registration.id,
    idempotency_key: delivery.idempotency_key,
    attempts: delivery.attempts,
    kind: registrationEmailKind(delivery.kind),
    name: registration.name,
    email: registration.email,
    registration_status: registration.status,
  };
}

function registrationEmailKind(value: string): RegistrationEmailKind {
  return value === 'promotion' ? 'promotion' : 'confirmation';
}
