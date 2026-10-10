import type { Context } from 'hono';
import { getSupabaseAdminClient, isSupabaseServerConfigured } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';
import type { Devcon26TestQuote } from '@/lib/devcon26-test-coupons';

export type Devcon26TestSession = Database['public']['Tables']['devcon26_test_checkout_sessions']['Row'];

export async function devcon26TestStorageReady(c: Context): Promise<boolean> {
  if (!isSupabaseServerConfigured(c)) return false;
  const { error } = await getSupabaseAdminClient(c).from('devcon26_test_checkout_sessions')
    .select('id,base_amount_minor,discount_amount_minor,coupon_id,purchaser_email').limit(0);
  const coupons = await getSupabaseAdminClient(c).from('devcon26_test_coupon_codes').select('id').limit(0);

  return !error && !coupons.error;
}

export async function quoteDevcon26TestCheckout(c: Context, tierKey: string, couponCode?: string): Promise<Devcon26TestQuote> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('quote_devcon26_test_checkout', {
    p_tier_key: tierKey, p_coupon_code: couponCode,
  });

  if (error || !data) throw new Error(error?.message ?? 'test_checkout_storage_unavailable');

  return data as unknown as Devcon26TestQuote;
}

export async function prepareDevcon26TestSession(c: Context, requestKey: string, tierKey: string,
  purchaserName: string, purchaserEmail: string, couponCode?: string): Promise<Devcon26TestSession> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('prepare_devcon26_test_checkout', {
    p_request_key: requestKey, p_tier_key: tierKey, p_purchaser_name: purchaserName,
    p_purchaser_email: purchaserEmail, p_coupon_code: couponCode,
  });

  if (error || !data) throw new Error(error?.message ?? 'test_checkout_storage_unavailable');

  return data;
}

export async function initializeDevcon26TestSession(c: Context, session: Devcon26TestSession, authorizationUrl: string) {
  const { data, error } = await getSupabaseAdminClient(c).from('devcon26_test_checkout_sessions')
    .update({ authorization_url: authorizationUrl, status: 'initialized', initialization_lease: null, initialization_lease_until: null })
    .eq('id', session.id).eq('initialization_lease', session.initialization_lease!).eq('status', 'prepared')
    .select('*').single();

  if (error || !data) throw new Error('test_checkout_storage_unavailable');

  return data;
}

export async function findDevcon26TestSession(c: Context, reference: string): Promise<Devcon26TestSession | null> {
  const { data, error } = await getSupabaseAdminClient(c).from('devcon26_test_checkout_sessions')
    .select('*').eq('payment_reference', reference).maybeSingle();

  if (error) throw new Error('test_checkout_storage_unavailable');

  return data;
}

export async function confirmDevcon26TestSession(c: Context, input: {
  reference: string; eventId: string; amountMinor: number; currency: string; payloadSha256: string; providerStatus?: 'success' | 'failed';
}): Promise<Devcon26TestSession> {
  const { data, error } = await getSupabaseAdminClient(c).rpc('confirm_devcon26_test_checkout', {
    p_reference: input.reference,
    p_event_id: input.eventId,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency,
    p_domain: 'test',
    p_provider_status: input.providerStatus ?? 'success',
    p_payload_sha256: input.payloadSha256,
  });

  if (error || !data) throw new Error('test_checkout_storage_unavailable');

  return data;
}
