import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppBindings } from '@/server/http/app-bindings';

const mocks = vi.hoisted(() => ({
  assessCapacity: vi.fn(),
  audit: vi.fn(),
  confirmPreview: vi.fn(),
  createPreview: vi.fn(),
  deliveryHealth: vi.fn(),
  claimSlot: vi.fn(),
  findOwnedSlot: vi.fn(),
  getBlast: vi.fn(),
  getCampaign: vi.fn(),
  listBroadcasts: vi.fn(),
  listRecipients: vi.fn(),
  outboxSummary: vi.fn(),
  listSlots: vi.fn(),
  markTerminal: vi.fn(),
  readPreview: vi.fn(),
  recordSlotError: vi.fn(),
  releaseSlot: vi.fn(),
  requireAdmin: vi.fn(),
  session: vi.fn(),
  setSlotProviderId: vi.fn(),
  updateBlast: vi.fn(),
}));

vi.mock('@/lib/email/blast-capacity', () => ({
  assessBlastCapacity: mocks.assessCapacity,
  blastTransactionalReserve: vi.fn(() => 25),
}));
vi.mock('@/lib/email/delivery-health', () => ({
  getEmailDeliveryHealth: mocks.deliveryHealth,
  getEmailOutboxSummary: mocks.outboxSummary,
}));
vi.mock('@/lib/event-blast-store', () => ({
  getEventBlastById: mocks.getBlast,
  getVolunteerBroadcasts: mocks.listBroadcasts,
  updateEventBlast: mocks.updateBlast,
}));
vi.mock('@/lib/event-blast-segment-pool', () => ({
  claimVolunteerBlastSegmentSlot: mocks.claimSlot,
  findOwnedVolunteerBlastSegmentSlot: mocks.findOwnedSlot,
  listEventBlastSegmentSlots: mocks.listSlots,
  markEventBlastSegmentTerminal: mocks.markTerminal,
  recordEventBlastSegmentSlotError: mocks.recordSlotError,
  releaseEventBlastSegmentSlot: mocks.releaseSlot,
  setEventBlastSegmentSlotProviderId: mocks.setSlotProviderId,
}));
vi.mock('@/lib/supabase/admin-auth', () => ({
  getAdminSession: mocks.session,
  requireAdmin: mocks.requireAdmin,
}));
vi.mock('@/lib/supabase/volunteer-broadcasts', () => ({
  confirmVolunteerBroadcastPreview: mocks.confirmPreview,
  createVolunteerBroadcastPreview: mocks.createPreview,
  readVolunteerBroadcastPreview: mocks.readPreview,
}));
vi.mock('@/lib/supabase/volunteer-follow-up', () => ({
  getVolunteerFollowUpCampaign: mocks.getCampaign,
  listVolunteerFollowUpRecipients: mocks.listRecipients,
}));
vi.mock('@/server/protected-mutation', () => ({ recordProtectedMutationAudit: mocks.audit }));

const campaignId = '10000000-0000-4000-8000-000000000001';
const previewId = '20000000-0000-4000-8000-000000000001';
const blastId = '30000000-0000-4000-8000-000000000001';
const scheduledJobSecret = 'fixture-only-'.repeat(4);
const recipientIds = [
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
];
const recipients = recipientIds.map((recipientId, index) => ({
  recipient_id: recipientId,
  decision_version: index + 2,
  name: index ? 'Kofi Mensah' : 'Ama Boateng',
  email: index ? 'kofi@example.test' : 'ama@example.test',
}));
const preview = {
  id: previewId,
  campaignId,
  subject: 'Volunteer orientation',
  body: 'Here are the details.',
  scheduledFor: null,
  recipients,
  recipientCount: recipients.length,
  renderedHtml: '<p>Here are the details.</p>',
  renderedText: 'Here are the details.',
  templateVersion: 'devcon26-volunteer-broadcast-v1',
  expiresAt: '2099-01-01T00:10:00.000Z',
  confirmedBlastId: null,
};
const blast = {
  id: blastId,
  event_id: null,
  audience_kind: 'accepted_volunteers' as const,
  volunteer_campaign_id: campaignId,
  subject: preview.subject,
  body: preview.body,
  status: 'waiting' as const,
  recipient_count: recipients.length,
  scheduled_for: null,
  sent_at: null,
  provider_broadcast_id: null,
  provider_segment_id: null,
  recipient_snapshot: recipients,
  prepared_recipient_count: 0,
  preparation_error: null,
  created_by_email: 'owner@example.test',
  rendered_html: preview.renderedHtml,
  rendered_text: preview.renderedText,
  template_version: preview.templateVersion,
  created_at: '2026-10-26T00:00:00.000Z',
  updated_at: '2026-10-26T00:00:00.000Z',
};

async function app() {
  const { registerVolunteerBroadcastRoutes } = await import('./routes/volunteer-broadcasts');
  const instance = new Hono<AppBindings>();

  registerVolunteerBroadcastRoutes(instance);

  return instance;
}

describe('selected-volunteer Resend broadcasts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_BROADCASTS_API_KEY', 're_broadcast_test');
    vi.stubEnv('REGISTRATION_EMAIL_REPLY_TO', 'volunteers@example.test');
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.session.mockResolvedValue({ authenticated: true, role: 'owner', email: 'owner@example.test' });
    mocks.getCampaign.mockResolvedValue({ id: campaignId });
    mocks.createPreview.mockResolvedValue(preview);
    mocks.readPreview.mockResolvedValue(preview);
    mocks.confirmPreview.mockResolvedValue(blast);
    mocks.getBlast.mockResolvedValue(blast);
    mocks.deliveryHealth.mockResolvedValue({});
    mocks.outboxSummary.mockResolvedValue({});
    mocks.assessCapacity.mockReturnValue({ known: true, can_send_now: true, safe_recipients_today: 100 });
    mocks.audit.mockResolvedValue(undefined);
    mocks.markTerminal.mockResolvedValue(true);
    mocks.updateBlast.mockImplementation(async (_id, update) => ({ ...blast, ...update }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('freezes exactly the accepted volunteers selected by the Owner', async () => {
    const instance = await app();
    const response = await instance.request('/api/annual-conference/2026/volunteer-follow-up/blasts/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient_ids: recipientIds,
        subject: preview.subject,
        body: preview.body,
        scheduled_for: null,
      }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.anything(), ['owner']);
    expect(mocks.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      campaignId,
      recipientIds,
      actorEmail: 'owner@example.test',
    }), expect.anything());
    await expect(response.json()).resolves.toMatchObject({
      preview_id: previewId,
      recipient_count: 2,
      recipients,
    });
  });

  it('confirms the frozen snapshot and queues the programmatic Resend Broadcast flow', async () => {
    const instance = await app();
    const queueSend = vi.fn(async () => undefined);
    const response = await instance.fetch(new Request('http://localhost/api/annual-conference/2026/volunteer-follow-up/blasts/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview_id: previewId }),
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: queueSend } } as never);

    expect(response.status).toBe(202);
    expect(mocks.confirmPreview).toHaveBeenCalledWith({ previewId, actorEmail: 'owner@example.test' }, expect.anything());
    expect(queueSend).toHaveBeenCalledWith({
      kind: 'volunteer',
      campaign_id: campaignId,
      blast_id: blastId,
      offset: 0,
      phase: 'prepare',
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'annual_conference.volunteer_broadcast.queue',
      targetId: blastId,
    }));
  });

  it('records a retryable failure when background preparation cannot be queued', async () => {
    const instance = await app();
    const queueSend = vi.fn(async () => {
      throw new Error('Queue unavailable');
    });
    const response = await instance.fetch(new Request('http://localhost/api/annual-conference/2026/volunteer-follow-up/blasts/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview_id: previewId }),
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: queueSend } } as never);

    expect(response.status).toBe(503);
    expect(mocks.updateBlast).toHaveBeenCalledWith(blastId, expect.objectContaining({
      status: 'failed',
      preparation_error: expect.stringContaining('not be queued'),
    }), expect.anything());
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('marks the confirmed blast retryable when capacity lookup fails before queueing', async () => {
    mocks.deliveryHealth.mockRejectedValue(new Error('Health unavailable'));
    const instance = await app();
    const queueSend = vi.fn(async () => undefined);
    const response = await instance.fetch(new Request('http://localhost/api/annual-conference/2026/volunteer-follow-up/blasts/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview_id: previewId }),
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: queueSend } } as never);

    expect(response.status).toBe(503);
    expect(mocks.updateBlast).toHaveBeenCalledWith(blastId, expect.objectContaining({
      status: 'failed',
      preparation_error: expect.stringContaining('capacity could not be checked'),
    }), expect.anything());
    expect(queueSend).not.toHaveBeenCalled();
  });

  it('safely requeues an idempotently confirmed blast still waiting for preparation', async () => {
    mocks.readPreview.mockResolvedValue({ ...preview, confirmedBlastId: blastId });
    const instance = await app();
    const queueSend = vi.fn(async () => undefined);
    const response = await instance.fetch(new Request('http://localhost/api/annual-conference/2026/volunteer-follow-up/blasts/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preview_id: previewId }),
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: queueSend } } as never);

    expect(response.status).toBe(200);
    expect(mocks.confirmPreview).not.toHaveBeenCalled();
    expect(queueSend).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'volunteer',
      blast_id: blastId,
      phase: 'prepare',
    }));
  });

  it('rechecks transactional capacity before retrying an immediate Broadcast', async () => {
    mocks.getBlast.mockResolvedValue({ ...blast, status: 'needs_capacity' });
    mocks.assessCapacity.mockReturnValue({ known: true, can_send_now: false, safe_recipients_today: 1 });
    const instance = await app();
    const queueSend = vi.fn(async () => undefined);
    const response = await instance.fetch(new Request(`http://localhost/api/annual-conference/2026/volunteer-follow-up/blasts/${blastId}/retry`, {
      method: 'POST',
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: queueSend } } as never);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ delivery: 'needs_capacity' });
    expect(queueSend).not.toHaveBeenCalled();
    expect(mocks.updateBlast).toHaveBeenCalledWith(blastId, expect.objectContaining({ status: 'needs_capacity' }), expect.anything());
  });

  it('requires a new update instead of retrying a provider-canceled Broadcast forever', async () => {
    mocks.getBlast.mockResolvedValue({
      ...blast,
      status: 'failed',
      provider_broadcast_id: 'broadcast-1',
      preparation_error: 'The broadcast was canceled in Resend. Its audience is being cleared; create a new update to send again.',
    });
    const instance = await app();
    const queueSend = vi.fn(async () => undefined);
    const response = await instance.fetch(new Request(`http://localhost/api/annual-conference/2026/volunteer-follow-up/blasts/${blastId}/retry`, {
      method: 'POST',
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: queueSend } } as never);

    expect(response.status).toBe(409);
    expect(queueSend).not.toHaveBeenCalled();
    expect(mocks.updateBlast).not.toHaveBeenCalled();
  });

  it('clears a scheduled slot when Resend cancellation returns the Broadcast to draft', async () => {
    mocks.getBlast.mockResolvedValue({ ...blast, status: 'scheduled', provider_broadcast_id: 'broadcast-1' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'broadcast-1', status: 'draft' }), { status: 200 })));
    const { reconcileVolunteerBroadcasts } = await import('./routes/volunteer-broadcasts');
    const instance = new Hono<AppBindings>();

    instance.post('/reconcile', async (c) => c.json({ reconciled: await reconcileVolunteerBroadcasts(c, [{
      slot_number: 1,
      provider_segment_id: 'segment-1',
      status: 'reserved',
      active_scope: 'volunteer',
      active_event_id: null,
      active_blast_id: blastId,
      active_volunteer_campaign_id: campaignId,
      terminal_confirmed_at: null,
      last_error: null,
      updated_at: '2026-10-26T00:00:00.000Z',
    }]) }));
    const queueSend = vi.fn(async () => undefined);
    const response = await instance.fetch(new Request('http://localhost/reconcile', { method: 'POST' }), {
      EVENT_BLAST_PREPARATION_QUEUE: { send: queueSend },
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reconciled: 1 });
    expect(mocks.updateBlast).toHaveBeenCalledWith(blastId, expect.objectContaining({
      status: 'failed',
      preparation_error: expect.stringContaining('no longer queued'),
    }), expect.anything());
    expect(queueSend).toHaveBeenCalledWith(expect.objectContaining({ phase: 'clear', slot_number: 1 }));
  });

  it('sends immediately after a chosen schedule has passed during audience preparation', async () => {
    const scheduledBlast = {
      ...blast,
      status: 'preparing' as const,
      scheduled_for: '2026-10-25T12:00:00.000Z',
      provider_broadcast_id: 'broadcast-1',
      provider_segment_id: 'segment-1',
      prepared_recipient_count: recipients.length,
    };
    const slot = {
      slot_number: 1,
      provider_segment_id: 'segment-1',
      status: 'reserved',
      active_scope: 'volunteer',
      active_event_id: null,
      active_blast_id: blastId,
      active_volunteer_campaign_id: campaignId,
      terminal_confirmed_at: null,
      last_error: null,
      updated_at: '2026-10-26T00:00:00.000Z',
    };
    const providerFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/broadcasts/broadcast-1') && init?.method === 'GET') {
        return new Response(JSON.stringify({ id: 'broadcast-1', status: 'draft' }), { status: 200 });
      }
      if (url.endsWith('/broadcasts/broadcast-1/send')) {
        expect(JSON.parse(String(init?.body))).toEqual({});

        return new Response(JSON.stringify({ id: 'broadcast-1' }), { status: 200 });
      }

      return new Response('Not found', { status: 404 });
    });

    mocks.getBlast.mockResolvedValue(scheduledBlast);
    mocks.claimSlot.mockResolvedValue(slot);
    vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', scheduledJobSecret);
    vi.stubGlobal('fetch', providerFetch);
    const instance = await app();
    const response = await instance.fetch(new Request('http://localhost/api/internal/volunteer-broadcasts/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scheduled-job-secret': scheduledJobSecret,
      },
      body: JSON.stringify({
        kind: 'volunteer',
        campaign_id: campaignId,
        blast_id: blastId,
        offset: recipients.length,
        phase: 'send',
        slot_number: 1,
      }),
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: vi.fn() } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'sent' });
    expect(mocks.updateBlast).toHaveBeenCalledWith(blastId, expect.objectContaining({
      status: 'sent',
      sent_at: expect.any(String),
    }), expect.anything());
  });

  it('rechecks the transactional reserve before sending an expired schedule immediately', async () => {
    mocks.getBlast.mockResolvedValue({
      ...blast,
      status: 'preparing',
      scheduled_for: '2026-10-25T12:00:00.000Z',
      provider_broadcast_id: 'broadcast-1',
      provider_segment_id: 'segment-1',
      prepared_recipient_count: recipients.length,
    });
    mocks.assessCapacity.mockReturnValue({ known: true, can_send_now: false, safe_recipients_today: 1 });
    vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', scheduledJobSecret);
    const instance = await app();
    const response = await instance.fetch(new Request('http://localhost/api/internal/volunteer-broadcasts/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scheduled-job-secret': scheduledJobSecret,
      },
      body: JSON.stringify({
        kind: 'volunteer',
        campaign_id: campaignId,
        blast_id: blastId,
        offset: recipients.length,
        phase: 'send',
        slot_number: 1,
      }),
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: vi.fn() } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'needs_capacity' });
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.updateBlast).toHaveBeenCalledWith(blastId, expect.objectContaining({
      status: 'needs_capacity',
      preparation_error: expect.stringContaining('scheduled time passed'),
    }), expect.anything());
  });

  it('rechecks the transactional reserve when an immediate Broadcast reaches the send phase later', async () => {
    mocks.getBlast.mockResolvedValue({
      ...blast,
      status: 'preparing',
      provider_broadcast_id: 'broadcast-1',
      provider_segment_id: 'segment-1',
      prepared_recipient_count: recipients.length,
    });
    mocks.assessCapacity.mockReturnValue({ known: true, can_send_now: false, safe_recipients_today: 1 });
    vi.stubEnv('SLACK_EVENTS_RETRY_SECRET', scheduledJobSecret);
    const instance = await app();
    const response = await instance.fetch(new Request('http://localhost/api/internal/volunteer-broadcasts/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-scheduled-job-secret': scheduledJobSecret,
      },
      body: JSON.stringify({
        kind: 'volunteer',
        campaign_id: campaignId,
        blast_id: blastId,
        offset: recipients.length,
        phase: 'send',
        slot_number: 1,
      }),
    }), { EVENT_BLAST_PREPARATION_QUEUE: { send: vi.fn() } } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'needs_capacity' });
    expect(mocks.claimSlot).not.toHaveBeenCalled();
    expect(mocks.updateBlast).toHaveBeenCalledWith(blastId, expect.objectContaining({
      status: 'needs_capacity',
      preparation_error: expect.stringMatching(/^Protected transactional capacity is active/u),
    }), expect.anything());
  });

  it('preserves an authorization denial before creating or confirming a broadcast', async () => {
    mocks.requireAdmin.mockResolvedValue(new Response('Forbidden', { status: 403 }));
    const instance = await app();
    const response = await instance.request('/api/annual-conference/2026/volunteer-follow-up/blasts/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient_ids: recipientIds, subject: preview.subject, body: preview.body }),
    });

    expect(response.status).toBe(403);
    expect(mocks.getCampaign).not.toHaveBeenCalled();
    expect(mocks.createPreview).not.toHaveBeenCalled();
    expect(mocks.confirmPreview).not.toHaveBeenCalled();
  });
});
