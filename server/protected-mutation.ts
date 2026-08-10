import type { Context } from 'hono';
import { getAdminSession, recordAdminAudit } from '@/lib/supabase/admin-auth';

export type ProtectedMutationAuditEvent = {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Shared audit boundary for authenticated mutations. It resolves the cached
 * request actor once and keeps the persistence-facing audit shape out of every
 * domain handler. Domain services receive this as an injected audit sink.
 */
export async function recordProtectedMutationAudit(
  c: Context,
  input: ProtectedMutationAuditEvent,
): Promise<void> {
  const session = c.get('adminSession') ?? await getAdminSession(c);
  if (!session.authenticated) return;

  await recordAdminAudit(c, {
    actor_user_id: session.user_id,
    actor_email: session.email,
    actor_role: session.role,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata,
  });
}
