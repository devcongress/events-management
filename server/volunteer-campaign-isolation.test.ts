import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { AppBindings } from '@/server/http/app-bindings';

vi.mock('@/server/annual-conference-request', () => ({
  requireAnnualConferenceCapability: vi.fn(async () => null),
  annualConferenceCapabilitiesForRequest: vi.fn(async () => ({ capabilities: ['volunteers.campaign.view'] })),
}));
vi.mock('@/lib/email/delivery-health', async (original) => ({
  ...await original<typeof import('@/lib/email/delivery-health')>(),
  getEmailDeliveryHealth: vi.fn(async () => null),
}));
vi.mock('@/lib/supabase/volunteer-follow-up', async (original) => ({
  ...await original<typeof import('@/lib/supabase/volunteer-follow-up')>(),
  getVolunteerFollowUpCampaign: vi.fn(async () => ({ id: 'campaign', application_deadline_at: '2026-12-01T00:00:00.000Z' })),
  listVolunteerFollowUpRecipients: vi.fn(async () => [{
    id: 'recipient', applicant_name: 'Applicant', applicant_email: 'applicant@example.com',
    motivation: 'private answer', review_note: 'private note', review_status: 'reviewed',
    decision: 'accepted', decision_version: 2, status: 'sent', attempt_count: 1,
  }]),
  listVolunteerOutcomeDeliveries: vi.fn(async () => []),
  listVolunteerFollowUpOutcomeMessages: vi.fn(async () => [{ decision: 'accepted', subject: 'private copy', message: 'private message', version: 1 }]),
}));

describe('volunteer campaign response isolation', () => {
  it('omits review answers, decisions and saved review copy for campaign-only access', async () => {
    const { registerVolunteerFollowUpRoutes } = await import('./routes/volunteer-follow-up');
    const app = new Hono<AppBindings>();

    registerVolunteerFollowUpRoutes(app);
    const response = await app.request('/api/annual-conference/2026/volunteer-follow-up');

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.recipients[0]).not.toHaveProperty('motivation');
    expect(body.recipients[0]).not.toHaveProperty('review_note');
    expect(body.recipients[0]).not.toHaveProperty('decision');
    expect(body.outcome_messages).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('private');
  });
});
