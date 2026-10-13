import type { Context } from 'hono';
import type { ResendEmail } from '@/lib/email/resend';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import type { Database, Json } from '@/types/supabase';

export type SandboxEmailDelivery = Database['public']['Tables']['devcon26_test_checkout_email_outbox']['Row'];

export async function claimSandboxEmails(c: Context, claimToken: string): Promise<SandboxEmailDelivery[]> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('claim_devcon26_test_checkout_emails', { p_claim_token: claimToken });

  if (error) throw new Error('sandbox_email_claim_failed');

  return data ?? [];
}

export async function freezeSandboxEmail(c: Context, id: string, claimToken: string, payload: ResendEmail): Promise<unknown> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('freeze_devcon26_test_checkout_email', {
    p_id: id, p_claim_token: claimToken, p_payload: payload as unknown as Json,
  });

  if (error || !data) throw new Error('sandbox_email_freeze_failed');

  return data;
}

export async function finishSandboxEmail(c: Context, id: string, claimToken: string,
  status: 'accepted' | 'failed' | 'suppressed' | 'needs_attention', providerEmailId?: string): Promise<void> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('finish_devcon26_test_checkout_email', {
    p_id: id, p_claim_token: claimToken, p_status: status, p_provider_email_id: providerEmailId,
  });

  if (error || !data) throw new Error('sandbox_email_finish_failed');
}
