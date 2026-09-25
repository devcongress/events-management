import type { Context } from 'hono';
import { getVolunteerApplications } from '@/lib/mock-db/volunteer-applications';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { volunteerFollowUpApplicationIsEligible } from '@/lib/volunteer-follow-up';
import type { VolunteerApplication } from '@/types';
import type { VolunteerFollowUpCampaignRow, VolunteerFollowUpRecipientRow, VolunteerFollowUpOutcomeDeliveryRow } from '@/types/supabase';

export async function getVolunteerFollowUpCampaign(c?: Context): Promise<VolunteerFollowUpCampaignRow | null> {
  if (!isSupabaseServerConfigured(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_campaigns')
    .select('*')
    .eq('edition_year', 2026)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
}

export async function saveVolunteerFollowUpCampaign(input: {
  applicationDeadlineAt: string;
}, c: Context): Promise<VolunteerFollowUpCampaignRow> {
  const existing = await getVolunteerFollowUpCampaign(c);

  if (!existing) throw new Error('Volunteer follow-up campaign is not configured.');

  const { data, error } = await getSupabaseAdminClient(c).from('volunteer_follow_up_campaigns')
    .update({ application_deadline_at: input.applicationDeadlineAt })
    .eq('id', existing.id)
    .eq('status', 'draft')
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('The campaign has launched. Its application deadline is fixed.');

  return data;
}

export async function setVolunteerFollowUpCampaignStatus(
  campaign: VolunteerFollowUpCampaignRow,
  status: VolunteerFollowUpCampaignRow['status'],
  actorEmail: string,
  c: Context,
): Promise<VolunteerFollowUpCampaignRow> {
  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_campaigns')
    .update({
      status,
      launched_at: status === 'running' ? campaign.launched_at ?? new Date().toISOString() : campaign.launched_at,
      launched_by: status === 'running' ? campaign.launched_by ?? actorEmail : campaign.launched_by,
    })
    .eq('id', campaign.id)
    .eq('status', campaign.status)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error('Campaign state changed. Refresh and try again.');

  return data;
}

export async function recordVolunteerFollowUpDrain(campaignId: string, reason: string, c: Context): Promise<void> {
  const { error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_campaigns')
    .update({ last_drain_at: new Date().toISOString(), last_drain_reason: reason })
    .eq('id', campaignId);

  if (error) throw new Error(error.message);
}

export async function acquireVolunteerFollowUpDrainLease(campaignId: string, leaseToken: string, c: Context): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('acquire_volunteer_follow_up_drain_lease', {
    p_campaign_id: campaignId,
    p_lease_token: leaseToken,
  });

  if (error) throw new Error(error.message);

  return data === true;
}

export async function renewVolunteerFollowUpDrainLease(campaignId: string, leaseToken: string, c: Context): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('renew_volunteer_follow_up_drain_lease', {
    p_campaign_id: campaignId,
    p_lease_token: leaseToken,
  });

  if (error) throw new Error(error.message);

  return data === true;
}

export async function releaseVolunteerFollowUpDrainLease(campaignId: string, leaseToken: string, c: Context): Promise<void> {
  const { error } = await getSupabaseAdminClient(c).rpc('release_volunteer_follow_up_drain_lease', {
    p_campaign_id: campaignId,
    p_lease_token: leaseToken,
  });

  if (error) throw new Error(error.message);
}

export async function reconcileVolunteerFollowUpApplicants(
  campaign: VolunteerFollowUpCampaignRow,
  c?: Context,
): Promise<number> {
  const applications = await getVolunteerApplications();
  const candidates = applications
    .filter((application) => (
      volunteerFollowUpApplicationIsEligible(application.created_at, campaign.application_deadline_at)
    ))
    .sort((first, second) => new Date(first.created_at).getTime() - new Date(second.created_at).getTime());

  if (candidates.length === 0) return 0;

  const client = getSupabaseAdminClient(c);
  const { error } = await client.from('volunteer_follow_up_recipients').upsert(
    candidates.map((application) => ({
      campaign_id: campaign.id,
      application_id: application.id,
      application_created_at: application.created_at,
      applicant_name: application.name,
      applicant_email: application.email.trim().toLowerCase(),
      idempotency_key: `volunteer-follow-up/${campaign.id}/${application.id}`,
    })),
    { onConflict: 'campaign_id,application_id', ignoreDuplicates: true },
  );

  if (error) throw new Error(error.message);

  return candidates.length;
}

export async function enrollVolunteerFollowUpApplicant(
  application: VolunteerApplication,
  campaign: VolunteerFollowUpCampaignRow,
  c?: Context,
): Promise<boolean> {
  if (!volunteerFollowUpApplicationIsEligible(application.created_at, campaign.application_deadline_at)) {
    return false;
  }

  const { error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_recipients')
    .upsert({
      campaign_id: campaign.id,
      application_id: application.id,
      application_created_at: application.created_at,
      applicant_name: application.name,
      applicant_email: application.email.trim().toLowerCase(),
      idempotency_key: `volunteer-follow-up/${campaign.id}/${application.id}`,
    }, { onConflict: 'campaign_id,application_id', ignoreDuplicates: true });

  if (error) throw new Error(error.message);

  return true;
}

export async function listVolunteerFollowUpRecipients(c?: Context): Promise<VolunteerFollowUpRecipientRow[]> {
  if (!isSupabaseServerConfigured(c)) return [];

  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_recipients')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);

  return data ?? [];
}

export async function getVolunteerOutcomeSentRecipientIds(
  recipientIds: string[],
  c?: Context,
): Promise<Set<string>> {
  if (!recipientIds.length || !isSupabaseServerConfigured(c)) return new Set();

  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_outcome_deliveries')
    .select('recipient_id')
    .in('recipient_id', recipientIds)
    .not('provider_email_id', 'is', null);

  if (error) throw new Error(error.message);

  return new Set((data ?? []).map((row) => row.recipient_id));
}

export async function listVolunteerOutcomeDeliveries(
  campaignId: string,
  c?: Context,
): Promise<Array<Pick<VolunteerFollowUpOutcomeDeliveryRow, 'recipient_id' | 'decision' | 'status' | 'attempt_count' | 'last_attempt_at' | 'next_attempt_at' | 'last_error' | 'provider_email_id'>>> {
  if (!isSupabaseServerConfigured(c)) return [];

  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_outcome_deliveries')
    .select('recipient_id, decision, status, attempt_count, last_attempt_at, next_attempt_at, last_error, provider_email_id')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return data ?? [];
}

export async function hasDueVolunteerOutcomeDelivery(
  campaignId: string,
  c?: Context,
): Promise<boolean> {
  if (!isSupabaseServerConfigured(c)) return false;

  const client = getSupabaseAdminClient(c);
  const now = new Date().toISOString();
  const [due, expiredSending] = await Promise.all([
    client
      .from('volunteer_follow_up_outcome_deliveries')
    .select('id')
    .eq('campaign_id', campaignId)
    .in('status', ['queued', 'retrying', 'failed'])
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .limit(1),
    client
      .from('volunteer_follow_up_outcome_deliveries')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('status', 'sending')
      .or(`claimed_until.is.null,claimed_until.lte.${now}`)
      .limit(1),
  ]);

  if (due.error) throw new Error(due.error.message);
  if (expiredSending.error) throw new Error(expiredSending.error.message);

  return Boolean(due.data?.length || expiredSending.data?.length);
}

export async function setVolunteerOutcomePaused(
  campaignId: string,
  paused: boolean,
  c: Context,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_campaigns')
    .update({ outcome_paused: paused })
    .eq('id', campaignId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);

  return Boolean(data);
}

export async function getVolunteerFollowUpRecipient(id: string, c?: Context): Promise<VolunteerFollowUpRecipientRow | null> {
  if (!isSupabaseServerConfigured(c)) return null;

  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_recipients')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data;
}

export async function submitVolunteerFollowUpResponse(input: {
  recipientId: string;
  motivation: string;
  canAttendAccra: boolean;
}, c: Context): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_recipients')
    .update({
      motivation: input.motivation,
      can_attend_accra: input.canAttendAccra,
      submitted_at: new Date().toISOString(),
    })
    .eq('id', input.recipientId)
    .is('submitted_at', null)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(error.message);

  return Boolean(data);
}

export async function reviewVolunteerFollowUpResponse(input: {
  recipientId: string;
  expectedVersion: number;
  decision: 'pending' | VolunteerOutcomeDecision;
  status: VolunteerFollowUpRecipientRow['review_status'];
  note: string;
  actorEmail: string;
}, c: Context): Promise<VolunteerFollowUpRecipientRow | null> {
  const current = await getVolunteerFollowUpRecipient(input.recipientId, c);

  if (!current) return null;

  const { data, error } = await getSupabaseAdminClient(c).rpc('save_volunteer_follow_up_decision', {
    p_recipient_id: input.recipientId,
    p_expected_version: input.expectedVersion,
    p_decision: input.decision,
    p_review_status: input.status,
    p_review_note: input.note,
    p_actor: input.actorEmail,
  });

  if (error) throw new Error(error.message);

  return data?.[0] ?? null;
}

export type VolunteerOutcomeDecision = 'accepted' | 'not_selected';
export type VolunteerOutcomeDeliveryStatus = 'queued' | 'sending' | 'retrying' | 'accepted' | 'delivered' | 'delayed' | 'failed' | 'bounced' | 'suppressed' | 'complained' | 'needs_attention' | 'cancelled';

export type VolunteerOutcomePreviewRecipient = {
  recipient_id: string;
  decision_version: number;
  name: string;
  email: string;
};

export async function createVolunteerOutcomePreview(input: {
  campaignId: string;
  decision: VolunteerOutcomeDecision;
  actorEmail: string;
}, c: Context): Promise<{
  id: string;
  eligibleCount: number;
  excludedCount: number;
  recipients: VolunteerOutcomePreviewRecipient[];
}> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('create_volunteer_follow_up_outcome_preview', {
    p_campaign_id: input.campaignId,
    p_decision: input.decision,
    p_actor: input.actorEmail,
  });

  if (error) throw new Error(error.message);
  const row = data?.[0];

  if (!row || !Array.isArray(row.recipients)) throw new Error('Unable to create outcome preview.');

  return {
    id: row.preview_id,
    eligibleCount: row.eligible_count,
    excludedCount: row.excluded_count,
    recipients: row.recipients as VolunteerOutcomePreviewRecipient[],
  };
}

export async function confirmVolunteerOutcomePreview(input: {
  previewId: string;
  actorEmail: string;
}, c: Context): Promise<{ queuedCount: number; deliveryIds: string[] }> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('confirm_volunteer_follow_up_outcome_preview', {
    p_preview_id: input.previewId,
    p_actor: input.actorEmail,
  });

  if (error) throw new Error(error.message);
  const row = data?.[0];

  if (!row) throw new Error('Unable to queue volunteer outcome emails.');

  return { queuedCount: row.queued_count, deliveryIds: row.delivery_ids ?? [] };
}

export async function saveVolunteerOutcomePreviewPayloads(input: {
  previewId: string;
  actorEmail: string;
  payloads: Record<string, unknown>;
}, c: Context): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('save_volunteer_follow_up_outcome_preview_payloads', {
    p_preview_id: input.previewId,
    p_actor: input.actorEmail,
    p_payloads: input.payloads,
  });

  if (error) throw new Error(error.message);

  return data === true;
}

export async function readVolunteerOutcomePreview(input: {
  previewId: string;
  actorEmail: string;
}, c: Context): Promise<{
  campaignId: string;
  decision: VolunteerOutcomeDecision;
  recipients: VolunteerOutcomePreviewRecipient[];
  eligibleCount: number;
  excludedCount: number;
  expiresAt: string;
  confirmedAt: string | null;
} | null> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('read_volunteer_follow_up_outcome_preview', {
    p_preview_id: input.previewId,
    p_actor: input.actorEmail,
  });

  if (error) throw new Error(error.message);
  const row = data?.[0];

  if (!row || !Array.isArray(row.recipients)) return null;

  return {
    campaignId: row.campaign_id,
    decision: row.decision as VolunteerOutcomeDecision,
    recipients: row.recipients as VolunteerOutcomePreviewRecipient[],
    eligibleCount: row.eligible_count,
    excludedCount: row.excluded_count,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
  };
}

export async function claimVolunteerOutcome(
  campaignId: string,
  safeSlots: number,
  claimToken: string,
  leaseToken: string,
  c: Context,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('claim_volunteer_follow_up_outcome', {
    p_campaign_id: campaignId,
    p_safe_slots: safeSlots,
    p_claim_token: claimToken,
    p_lease_token: leaseToken,
  });

  if (error) throw new Error(error.message);

  return data?.[0] ?? null;
}

export async function validateVolunteerOutcomeSend(
  deliveryId: string,
  claimToken: string,
  leaseToken: string,
  c: Context,
): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('validate_volunteer_follow_up_outcome_send', {
    p_delivery_id: deliveryId,
    p_claim_token: claimToken,
    p_lease_token: leaseToken,
  });

  if (error) throw new Error(error.message);

  return data === true;
}

export async function finalizeVolunteerOutcomeSend(input: {
  deliveryId: string;
  claimToken: string;
  status: 'accepted' | 'failed' | 'retrying' | 'needs_attention';
  providerEmailId: string | null;
  lastError: string | null;
  nextAttemptAt: string | null;
}, c: Context): Promise<boolean> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('finalize_volunteer_follow_up_outcome_send', {
    p_delivery_id: input.deliveryId,
    p_claim_token: input.claimToken,
    p_status: input.status,
    p_provider_email_id: input.providerEmailId,
    p_last_error: input.lastError,
    p_next_attempt_at: input.nextAttemptAt,
  });

  if (error) throw new Error(error.message);

  return data === true;
}

export async function claimVolunteerFollowUpRecipient(
  campaignId: string,
  safeSlots: number,
  leaseToken: string,
  c: Context,
): Promise<VolunteerFollowUpRecipientRow | null> {
  const { data, error } = await getSupabaseAdminClient(c)
    .rpc('claim_volunteer_follow_up_recipient', {
      p_campaign_id: campaignId,
      p_safe_slots: safeSlots,
      p_lease_token: leaseToken,
    });

  if (error) throw new Error(error.message);

  return data?.[0] ?? null;
}

export async function updateVolunteerFollowUpDelivery(
  id: string,
  values: Partial<VolunteerFollowUpRecipientRow>,
  c: Context,
): Promise<void> {
  const { error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_recipients')
    .update(values)
    .eq('id', id);

  if (error) throw new Error(error.message);
}

export async function applyVolunteerFollowUpProviderEvent(input: {
  webhookId: string;
  providerEmailId: string;
  eventType: string;
  eventAt: string;
}, c?: Context): Promise<boolean> {
  if (!isSupabaseServerConfigured(c)) return false;

  const client = getSupabaseAdminClient(c);
  const { error: journalError } = await client.from('volunteer_follow_up_webhook_events').upsert({
    webhook_event_id: input.webhookId,
    provider_email_id: input.providerEmailId,
    event_type: input.eventType,
    provider_created_at: input.eventAt,
  }, { onConflict: 'webhook_event_id', ignoreDuplicates: true });

  if (journalError) throw new Error(journalError.message);

  const { data: existing, error: lookupError } = await client
    .from('volunteer_follow_up_recipients')
    .select('id, provider_event_at')
    .eq('provider_email_id', input.providerEmailId)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  const statuses: Record<string, VolunteerFollowUpRecipientRow['status']> = {
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delayed',
    'email.bounced': 'bounced',
    'email.failed': 'failed',
    'email.suppressed': 'suppressed',
    'email.complained': 'complained',
  };
  const status = statuses[input.eventType];

  if (!existing) {
    const { data: outcome, error: outcomeLookupError } = await client
      .from('volunteer_follow_up_outcome_deliveries')
      .select('id, provider_event_at')
      .eq('provider_email_id', input.providerEmailId)
      .maybeSingle();

    if (outcomeLookupError) throw new Error(outcomeLookupError.message);
    if (!outcome) return false;
    if (outcome.provider_event_at && outcome.provider_event_at >= input.eventAt) return true;

    const outcomeStatuses: Record<string, VolunteerOutcomeDeliveryStatus> = {
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'delayed',
      'email.bounced': 'bounced',
      'email.failed': 'failed',
      'email.suppressed': 'suppressed',
      'email.complained': 'complained',
    };
    const outcomeStatus = outcomeStatuses[input.eventType];

    if (!outcomeStatus) return true;

    const { error } = await client.from('volunteer_follow_up_outcome_deliveries')
      .update({ status: outcomeStatus, provider_event_at: input.eventAt })
      .eq('id', outcome.id)
      .or(`provider_event_at.is.null,provider_event_at.lt.${input.eventAt}`);

    if (error) throw new Error(error.message);

    return true;
  }
  if (existing.provider_event_at && existing.provider_event_at >= input.eventAt) return true;
  if (!status) return true;

  const { error } = await client.from('volunteer_follow_up_recipients')
    .update({ status, provider_event_at: input.eventAt })
    .eq('id', existing.id)
    .or(`provider_event_at.is.null,provider_event_at.lt.${input.eventAt}`);

  if (error) throw new Error(error.message);

  return true;
}

export async function replayVolunteerFollowUpProviderEvents(providerEmailId: string, c: Context): Promise<void> {
  const { data, error } = await getSupabaseAdminClient(c)
    .from('volunteer_follow_up_webhook_events')
    .select('webhook_event_id, provider_email_id, event_type, provider_created_at')
    .eq('provider_email_id', providerEmailId)
    .order('provider_created_at', { ascending: true });

  if (error) throw new Error(error.message);

  for (const event of data ?? []) {
    await applyVolunteerFollowUpProviderEvent({
      webhookId: event.webhook_event_id,
      providerEmailId: event.provider_email_id,
      eventType: event.event_type,
      eventAt: event.provider_created_at,
    }, c);
  }
}
