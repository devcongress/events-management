import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scheduledSecret = 'scheduled-fetch-budget-secret-at-least-32-bytes';
const campaignId = '30000000-0000-4000-8000-000000000001';
const deliveryId = '40000000-0000-4000-8000-000000000001';

const campaign = {
  id: campaignId,
  edition_year: 2026,
  status: 'closed',
  application_deadline_at: '2026-09-30T23:59:59.999Z',
  launched_at: null,
  launched_by: null,
  last_drain_at: null,
  last_drain_reason: null,
  outcome_paused: false,
  drain_lease_token: null,
  drain_lease_until: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

describe('volunteer follow-up scheduled outbound-request budget', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('APP_DATA_SOURCE', 'supabase');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://supabase.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key-for-test');
    vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', scheduledSecret);
    vi.stubEnv('RESEND_API_KEY', 'resend-test-key');
    // This HTTP-only suite provides the construction API and forbids connections.
    vi.stubGlobal('WebSocket', class UnexpectedWebSocket {
      constructor() {
        throw new Error('Unexpected WebSocket connection in HTTP budget test');
      }
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps a closed-campaign outcome send, webhook replay, health write, and audit below 50 requests', async () => {
    const outbound: URL[] = [];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      outbound.push(url);

      if (outbound.length > 50)
        throw new Error('Synthetic Worker outbound-request limit exceeded');

      if (url.origin === 'https://api.resend.com') {
        if (url.pathname === '/usage') return json({
          emails: {
            daily: { used: 0, limit: null },
            monthly: { used: 2600, limit: 3000 },
          },
        });

        if (url.pathname === '/emails/batch') {
          return new Response(JSON.stringify({ data: [{ id: 'provider-outcome-id' }] }), {
            headers: {
              'Content-Type': 'application/json',
              'x-resend-daily-quota': '0',
              'x-resend-monthly-quota': '2600',
            },
          });
        }
      }

      if (url.origin !== 'https://supabase.test')
        throw new Error(`Unexpected outbound origin: ${url.origin}`);

      const resource = url.pathname.replace('/rest/v1/', '');

      if (resource === 'volunteer_follow_up_campaigns') {
        if (method === 'GET') return json(campaign);

        return json({});
      }

      if (resource === 'volunteer_follow_up_outcome_deliveries') {
        if (url.searchParams.get('select')?.includes('provider_event_at'))
          return json({ id: deliveryId, provider_event_at: null });
        if (url.searchParams.get('select')?.includes('id'))
          return json([{ id: deliveryId }]);

        return json([]);
      }

      if (resource === 'email_delivery_health') {
        if (method === 'GET') {
          return json({
            provider: 'resend',
            daily_quota_used: 10,
            daily_quota_limit: 100,
            monthly_quota_used: 100,
            monthly_quota_limit: 3000,
            daily_level: 'healthy',
            monthly_level: 'healthy',
            last_provider_response_at: null,
            updated_at: '2026-09-01T00:00:00.000Z',
          });
        }

        return json({});
      }

      if (resource === 'volunteer_follow_up_webhook_events') {
        if (method === 'GET') {
          return json([{
            webhook_event_id: 'webhook-event-1',
            provider_email_id: 'provider-outcome-id',
            event_type: 'email.delivered',
            provider_created_at: '2026-09-02T00:00:00.000Z',
          }]);
        }

        return json({});
      }
      if (resource === 'volunteer_follow_up_recipients') return json(null);
      if (resource === 'admin_audit_log') return json({});

      if (resource.startsWith('rpc/')) {
        const functionName = resource.slice(4);

        if (functionName === 'acquire_volunteer_follow_up_drain_lease') return json(true);
        if (functionName === 'renew_volunteer_follow_up_drain_lease') return json(true);
        if (functionName === 'release_volunteer_follow_up_drain_lease') return json(true);
        if (functionName === 'validate_volunteer_follow_up_outcome_send') return json(true);
        if (functionName === 'finalize_volunteer_follow_up_outcome_send') return json(true);
        if (functionName === 'claim_volunteer_follow_up_outcome') {
          return json([{
            id: deliveryId,
            idempotency_key: 'outcome-idempotency-key',
            attempt_count: 1,
            payload: {
              from: 'DevCongress <events@example.com>',
              to: ['applicant@example.com'],
              subject: 'Volunteer update',
              html: '<p>Update</p>',
              text: 'Update',
            },
          }]);
        }
      }

      if (method === 'HEAD') {
        return new Response(null, { headers: { 'content-range': '*/0' } });
      }

      throw new Error(`Unexpected Supabase request: ${method} ${resource}`);
    }));

    const app = (await import('./app')).default;
    const response = await app.request('http://localhost/api/internal/volunteer-follow-up/drain', {
      method: 'POST',
      headers: { 'x-scheduled-job-secret': scheduledSecret },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 1 });
    expect(outbound).toHaveLength(35);
    expect(outbound.filter((url) => url.origin === 'https://api.resend.com')).toHaveLength(2);
    expect(outbound.filter((url) => url.pathname === '/usage')).toHaveLength(1);
    expect(outbound.some((url) => url.pathname === '/emails/batch')).toBe(true);
    expect(outbound.some((url) => url.pathname.endsWith('/rpc/finalize_volunteer_follow_up_outcome_send'))).toBe(true);
    expect(outbound.some((url) => url.pathname.endsWith('/rpc/release_volunteer_follow_up_drain_lease'))).toBe(true);
    expect(outbound.some((url) => url.pathname.endsWith('/admin_audit_log'))).toBe(true);
    expect(outbound.some((url) => url.pathname.endsWith('/volunteer_follow_up_webhook_events'))).toBe(true);
  });

  it('keeps a running-campaign invitation send below 50 requests', async () => {
    const outbound: URL[] = [];
    const runningCampaign = { ...campaign, status: 'running' };

    vi.stubEnv('VOLUNTEER_FOLLOW_UP_TOKEN_SECRET', 'volunteer-follow-up-token-secret-at-least-32-bytes');
    vi.stubEnv('PUBLIC_APP_URL', 'https://events.example.com');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      outbound.push(url);

      if (outbound.length > 50)
        throw new Error('Synthetic Worker outbound-request limit exceeded');

      if (url.origin === 'https://api.resend.com') {
        if (url.pathname === '/usage') return json({
          emails: {
            daily: { used: 0, limit: null },
            monthly: { used: 2600, limit: 3000 },
          },
        });

        if (url.pathname === '/emails/batch') {
          return new Response(JSON.stringify({ data: [{ id: 'provider-invitation-id' }] }), {
            headers: {
              'Content-Type': 'application/json',
              'x-resend-daily-quota': '0',
              'x-resend-monthly-quota': '2600',
            },
          });
        }
      }

      if (url.origin !== 'https://supabase.test')
        throw new Error(`Unexpected outbound origin: ${url.origin}`);

      const resource = url.pathname.replace('/rest/v1/', '');

      if (resource === 'volunteer_follow_up_campaigns') {
        if (method === 'GET') return json(runningCampaign);

        return json({});
      }

      if (resource === 'app_json_documents') {
        return json({ data: [], version: 1 });
      }

      if (resource === 'volunteer_follow_up_outcome_deliveries') return json([]);

      if (resource === 'volunteer_follow_up_recipients') return json({});

      if (resource === 'email_delivery_health') {
        if (method === 'GET') {
          return json({
            provider: 'resend',
            daily_quota_used: 10,
            daily_quota_limit: 100,
            monthly_quota_used: 100,
            monthly_quota_limit: 3000,
            daily_level: 'healthy',
            monthly_level: 'healthy',
            last_provider_response_at: null,
            updated_at: '2026-09-01T00:00:00.000Z',
          });
        }

        return json({});
      }

      if (resource === 'volunteer_follow_up_webhook_events') return json([]);
      if (resource === 'admin_audit_log') return json({});

      if (resource.startsWith('rpc/')) {
        const functionName = resource.slice(4);

        if (functionName === 'acquire_volunteer_follow_up_drain_lease') return json(true);
        if (functionName === 'renew_volunteer_follow_up_drain_lease') return json(true);
        if (functionName === 'release_volunteer_follow_up_drain_lease') return json(true);
        if (functionName === 'claim_volunteer_follow_up_recipient') {
          return json([{
            id: '40000000-0000-4000-8000-000000000002',
            campaign_id: campaignId,
            application_id: '50000000-0000-4000-8000-000000000001',
            applicant_name: 'Applicant',
            applicant_email: 'applicant@example.com',
            idempotency_key: 'invitation-idempotency-key',
            application_created_at: '2026-09-01T00:00:00.000Z',
            attempt_count: 1,
          }]);
        }
      }

      if (method === 'HEAD') {
        return new Response(null, { headers: { 'content-range': '*/0' } });
      }

      throw new Error(`Unexpected Supabase request: ${method} ${resource}`);
    }));

    const app = (await import('./app')).default;
    const response = await app.request('http://localhost/api/internal/volunteer-follow-up/drain', {
      method: 'POST',
      headers: { 'x-scheduled-job-secret': scheduledSecret },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ sent: 1 });
    expect(outbound.filter((url) => url.origin === 'https://api.resend.com')).toHaveLength(2);
    expect(outbound.filter((url) => url.pathname === '/usage')).toHaveLength(1);
    expect(outbound.some((url) => url.pathname === '/emails/batch')).toBe(true);
    expect(outbound.some((url) => url.pathname.endsWith('/rpc/claim_volunteer_follow_up_recipient'))).toBe(true);
    expect(outbound.some((url) => url.pathname.endsWith('/rpc/release_volunteer_follow_up_drain_lease'))).toBe(true);
    expect(outbound.some((url) => url.pathname.endsWith('/admin_audit_log'))).toBe(true);
    expect(outbound).toHaveLength(33);
    expect(outbound.length).toBeLessThanOrEqual(50);
  });
});
