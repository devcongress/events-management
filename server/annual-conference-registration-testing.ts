import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { envValue } from '@/server/env';

export const registrationTestingSchema = z.object({
  enabled: z.boolean(),
  tester_emails: z.array(z.string().trim().toLowerCase().email().max(254).refine((email) => !email.includes('*'))).max(200)
    .transform((emails) => [...new Set(emails)].sort()),
}).strict();

export async function registrationTesting(c: Context, editionId: string) {
  const result = await getSupabaseAdminClient(c).rpc('get_annual_conference_registration_testing' as never, { p_edition_id: editionId } as never);

  if (result.error) throw new Error('Registration testing settings unavailable.');

  return registrationTestingSchema.parse(result.data);
}

function loopback(value: string | undefined) {
  if (!value) return false;

  try {
    const url = new URL(value);

    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

// Never trust Origin alone: a deployed runtime cannot opt into this path.
export function localRegistrationRequest(c: Context) {
  return envValue('NODE_ENV', c) === 'development' && loopback(c.req.url) && loopback(c.req.header('Origin'));
}

export async function allowConferenceEmail(c: Context, kind: 'admission' | 'social' | 'update', id: string, email: string, claim: string) {
  const client = getSupabaseAdminClient(c);
  const result = await client.rpc('annual_conference_email_allowed' as never, {
    p_kind: kind, p_id: id, p_email: email, p_testing_only: envValue('NODE_ENV', c) === 'development',
  } as never);
  const allowed: unknown = result.data;

  if (result.error || typeof allowed !== 'boolean') throw new Error('Conference recipient policy unavailable.');
  if (allowed) return true;
  const held = await client.rpc('hold_annual_conference_testing_email' as never, { p_kind: kind, p_id: id, p_claim: claim } as never);

  if (held.error) throw new Error('Conference email could not be held.');

  return false;
}
