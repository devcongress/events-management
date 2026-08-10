import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/supabase/admin-auth', () => ({
  getAdminSession: mocks.getSession,
  recordAdminAudit: mocks.audit,
}));

import { recordProtectedMutationAudit } from './protected-mutation';

describe('protected mutation audit boundary', () => {
  it('writes one normalized audit record for the cached authenticated actor', async () => {
    const context = {
      get: vi.fn(() => ({
        authenticated: true,
        user_id: 'user-1',
        email: 'owner@devcongress.org',
        role: 'owner',
      })),
    } as any;

    await recordProtectedMutationAudit(context, {
      action: 'event_submission.reject',
      targetType: 'event_submission',
      targetId: 'submission-1',
      metadata: { category: 'duplicate' },
    });

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(context, expect.objectContaining({
      actor_user_id: 'user-1',
      action: 'event_submission.reject',
      target_type: 'event_submission',
      target_id: 'submission-1',
    }));
  });
});
