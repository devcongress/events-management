import type { Context } from 'hono';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

const contextSchema = z.discriminatedUnion('is_test', [
  z.object({ is_test: z.literal(false), allowed: z.literal(true) }),
  z.object({ is_test: z.literal(true), allowed: z.boolean(), origin: z.string().regex(/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/) }),
]);

export async function completeTestEmailContext(c: Context, kind: 'admission' | 'social', id: string) {
  const result = await getSupabaseAdminClient(c).rpc('complete_test_email_context' as never, { p_kind: kind, p_id: id } as never);

  if (result.error) throw new Error('Test email policy is unavailable.');

  return contextSchema.parse(result.data);
}

export function markCompleteTestEmail<T extends { subject: string; text: string; html: string }>(content: T): T {
  const notice = 'TEST ONLY — No money was charged. These tickets and badges are for preview testing, not admission to DevCon26.';

  return { ...content, subject: `[TEST] ${content.subject}`, text: `${notice}\n\n${content.text}`, html: `<p><strong>${notice}</strong></p>${content.html}` };
}
