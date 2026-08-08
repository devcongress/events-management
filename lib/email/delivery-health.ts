import type { Context } from 'hono';
import { recordAdminAudit } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import { envValue } from '@/server/env';
import type { Database } from '@/types/supabase';

export type EmailQuotaUsage = {
  dailyUsed: number | null;
  monthlyUsed: number | null;
};

export type EmailHealthLevel = 'healthy' | 'warning' | 'high' | 'exhausted';

export type EmailDeliveryHealth = {
  provider: 'resend';
  daily_quota_used: number | null;
  daily_quota_limit: number;
  monthly_quota_used: number | null;
  monthly_quota_limit: number;
  daily_level: EmailHealthLevel;
  monthly_level: EmailHealthLevel;
  last_provider_response_at: string | null;
  updated_at: string;
};

export type EmailOutboxSummary = {
  pending: number;
  failed: number;
};

export type RecentEmailDelivery = {
  id: string;
  source: 'registration' | 'community_submission' | 'speaker_archive';
  label: string;
  status: 'pending' | 'accepted' | 'failed';
  attempts: number;
  occurred_at: string;
  last_error: string | null;
};

type EmailDeliveryHealthRow = Database['public']['Tables']['email_delivery_health']['Row'];

const DEFAULT_DAILY_QUOTA_LIMIT = 100;
const DEFAULT_MONTHLY_QUOTA_LIMIT = 3_000;
const RECENT_DELIVERY_LIMIT = 16;

function quotaLimit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseResendQuotaUsage(value: string | null): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function emailHealthLevel(used: number | null, limit: number): EmailHealthLevel {
  if (used === null || limit <= 0) return 'healthy';
  const percentage = (used / limit) * 100;
  if (percentage >= 100) return 'exhausted';
  if (percentage >= 85) return 'high';
  if (percentage >= 70) return 'warning';
  return 'healthy';
}

export function sortRecentEmailDeliveries(deliveries: RecentEmailDelivery[]): RecentEmailDelivery[] {
  return [...deliveries].sort((first, second) => (
    new Date(second.occurred_at).getTime() - new Date(first.occurred_at).getTime()
  ));
}

function levelRank(level: EmailHealthLevel): number {
  return ['healthy', 'warning', 'high', 'exhausted'].indexOf(level);
}

function toEmailDeliveryHealth(row: EmailDeliveryHealthRow): EmailDeliveryHealth {
  return {
    provider: 'resend',
    daily_quota_used: row.daily_quota_used,
    daily_quota_limit: row.daily_quota_limit,
    monthly_quota_used: row.monthly_quota_used,
    monthly_quota_limit: row.monthly_quota_limit,
    daily_level: row.daily_level as EmailHealthLevel,
    monthly_level: row.monthly_level as EmailHealthLevel,
    last_provider_response_at: row.last_provider_response_at,
    updated_at: row.updated_at,
  };
}

export async function getEmailDeliveryHealth(c?: Context): Promise<EmailDeliveryHealth | null> {
  if (!isSupabaseServerConfigured(c)) return null;
  const { data, error } = await getSupabaseAdminClient(c)
    .from('email_delivery_health')
    .select('*')
    .eq('provider', 'resend')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toEmailDeliveryHealth(data) : null;
}

export async function getEmailOutboxSummary(c?: Context): Promise<EmailOutboxSummary | null> {
  if (!isSupabaseServerConfigured(c)) return null;
  const client = getSupabaseAdminClient(c);
  const [registrationResult, submissionResult, speakerResult] = await Promise.all([
    client.from('registration_email_deliveries').select('status'),
    client.from('event_submission_email_deliveries').select('status'),
    client.from('speaker_intake_links').select('email_status').not('email_status', 'is', null),
  ]);
  if (registrationResult.error) throw new Error(registrationResult.error.message);
  if (submissionResult.error) throw new Error(submissionResult.error.message);
  if (speakerResult.error) throw new Error(speakerResult.error.message);

  const statuses = [
    ...registrationResult.data.map((delivery) => delivery.status),
    ...submissionResult.data.map((delivery) => delivery.status),
    ...speakerResult.data.map((delivery) => delivery.email_status),
  ];
  return {
    pending: statuses.filter((status) => status === 'pending').length,
    failed: statuses.filter((status) => status === 'failed').length,
  };
}

function isEmailDeliveryStatus(value: string | null): value is RecentEmailDelivery['status'] {
  return value === 'pending' || value === 'accepted' || value === 'failed';
}

function recentDeliveryTimestamp(input: {
  accepted_at?: string | null;
  last_attempt_at?: string | null;
  email_sent_at?: string | null;
  email_last_attempt_at?: string | null;
  updated_at: string;
}): string {
  return input.accepted_at
    ?? input.email_sent_at
    ?? input.last_attempt_at
    ?? input.email_last_attempt_at
    ?? input.updated_at;
}

function registrationDeliveryLabel(kind: string): string {
  return kind === 'promotion' ? 'Waitlist promotion' : 'Registration confirmation';
}

function submissionDeliveryLabel(kind: string): string {
  if (kind === 'approved') return 'Listing approved';
  if (kind === 'rejected') return 'Listing decision';
  return 'Submission receipt';
}

function speakerDeliveryLabel(purpose: string): string {
  if (purpose === 'archive_materials_follow_up') return 'Archive materials follow-up';
  if (purpose === 'selected_speaker_confirmation') return 'Selected presenter request';
  return 'Archive request';
}

export async function getRecentEmailDeliveries(c?: Context): Promise<RecentEmailDelivery[] | null> {
  if (!isSupabaseServerConfigured(c)) return null;
  const client = getSupabaseAdminClient(c);
  const [registrationResult, submissionResult, speakerResult] = await Promise.all([
    client
      .from('registration_email_deliveries')
      .select('id, kind, status, attempts, last_error, last_attempt_at, accepted_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(RECENT_DELIVERY_LIMIT),
    client
      .from('event_submission_email_deliveries')
      .select('id, kind, status, attempts, last_error, last_attempt_at, accepted_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(RECENT_DELIVERY_LIMIT),
    client
      .from('speaker_intake_links')
      .select('id, purpose, email_status, email_last_error, email_last_attempt_at, email_sent_at, updated_at')
      .not('email_status', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(RECENT_DELIVERY_LIMIT),
  ]);
  if (registrationResult.error) throw new Error(registrationResult.error.message);
  if (submissionResult.error) throw new Error(submissionResult.error.message);
  if (speakerResult.error) throw new Error(speakerResult.error.message);

  const registrationDeliveries: RecentEmailDelivery[] = registrationResult.data.map((delivery) => ({
    id: `registration:${delivery.id}`,
    source: 'registration',
    label: registrationDeliveryLabel(delivery.kind),
    status: delivery.status,
    attempts: delivery.attempts,
    occurred_at: recentDeliveryTimestamp(delivery),
    last_error: delivery.last_error,
  }));
  const submissionDeliveries: RecentEmailDelivery[] = submissionResult.data.map((delivery) => ({
    id: `community_submission:${delivery.id}`,
    source: 'community_submission',
    label: submissionDeliveryLabel(delivery.kind),
    status: delivery.status,
    attempts: delivery.attempts,
    occurred_at: recentDeliveryTimestamp(delivery),
    last_error: delivery.last_error,
  }));
  const speakerDeliveries = speakerResult.data.reduce<RecentEmailDelivery[]>((deliveries, delivery) => {
    if (!isEmailDeliveryStatus(delivery.email_status)) return deliveries;
    deliveries.push({
      id: `speaker_archive:${delivery.id}`,
      source: 'speaker_archive',
      label: speakerDeliveryLabel(delivery.purpose),
      status: delivery.email_status,
      attempts: 1,
      occurred_at: recentDeliveryTimestamp(delivery),
      last_error: delivery.email_last_error,
    });
    return deliveries;
  }, []);

  return sortRecentEmailDeliveries([
    ...registrationDeliveries,
    ...submissionDeliveries,
    ...speakerDeliveries,
  ]).slice(0, RECENT_DELIVERY_LIMIT);
}

export async function recordResendEmailHealth(
  c: Context,
  usage: EmailQuotaUsage,
): Promise<void> {
  if (!isSupabaseServerConfigured(c) || (usage.dailyUsed === null && usage.monthlyUsed === null)) return;
  try {
    const client = getSupabaseAdminClient(c);
    const dailyLimit = quotaLimit(envValue('RESEND_DAILY_EMAIL_QUOTA', c), DEFAULT_DAILY_QUOTA_LIMIT);
    const monthlyLimit = quotaLimit(envValue('RESEND_MONTHLY_EMAIL_QUOTA', c), DEFAULT_MONTHLY_QUOTA_LIMIT);
    const { data: previous, error: previousError } = await client
      .from('email_delivery_health')
      .select('*')
      .eq('provider', 'resend')
      .maybeSingle();
    if (previousError) throw new Error(previousError.message);

    const dailyUsed = usage.dailyUsed ?? previous?.daily_quota_used ?? null;
    const monthlyUsed = usage.monthlyUsed ?? previous?.monthly_quota_used ?? null;
    const dailyLevel = emailHealthLevel(dailyUsed, dailyLimit);
    const monthlyLevel = emailHealthLevel(monthlyUsed, monthlyLimit);
    const observedAt = new Date().toISOString();
    const { error } = await client
      .from('email_delivery_health')
      .upsert({
        provider: 'resend',
        daily_quota_used: dailyUsed,
        daily_quota_limit: dailyLimit,
        monthly_quota_used: monthlyUsed,
        monthly_quota_limit: monthlyLimit,
        daily_level: dailyLevel,
        monthly_level: monthlyLevel,
        last_provider_response_at: observedAt,
      }, { onConflict: 'provider' });
    if (error) throw new Error(error.message);

    const previousDailyLevel = previous?.daily_level as EmailHealthLevel | undefined;
    const previousMonthlyLevel = previous?.monthly_level as EmailHealthLevel | undefined;
    const raisedDaily = levelRank(dailyLevel) > levelRank(previousDailyLevel ?? 'healthy');
    const raisedMonthly = levelRank(monthlyLevel) > levelRank(previousMonthlyLevel ?? 'healthy');
    if (!raisedDaily && !raisedMonthly) return;

    await recordAdminAudit(c, {
      action: 'email_provider.capacity_threshold',
      target_type: 'email_provider',
      target_id: 'resend',
      metadata: {
        daily_used: dailyUsed,
        daily_limit: dailyLimit,
        daily_level: dailyLevel,
        monthly_used: monthlyUsed,
        monthly_limit: monthlyLimit,
        monthly_level: monthlyLevel,
        threshold: raisedDaily && raisedMonthly ? 'daily_and_monthly' : raisedDaily ? 'daily' : 'monthly',
      },
    });
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'email_delivery_health_observation_failed',
      error_name: error instanceof Error ? error.name : 'UnknownError',
    }));
  }
}
