import { describe, expect, it, vi } from 'vitest';
import { prepareResendBroadcast, ResendBatchError, sendResendBroadcast, sendResendEmailBatch } from './resend';

const email = {
  from: 'DevCongress <speakers@updates.devcongress.org>',
  to: ['ama@example.com'],
  reply_to: 'hello@devcongress.org',
  subject: 'Archive request',
  html: '<p>Open it</p>',
  text: 'Open it',
};

describe('Resend batch client', () => {
  it('sends the idempotency key and returns provider ids in request order', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ id: 'email-1' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(sendResendEmailBatch({
      apiKey: 're_test',
      idempotencyKey: 'speaker-archive-test',
      emails: [email],
      fetcher,
    })).resolves.toEqual({ ids: ['email-1'] });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/emails/batch',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
          'Idempotency-Key': 'speaker-archive-test',
        }),
      }),
    );
  });

  it('returns a safe provider error without exposing the response body', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      message: 'sensitive provider details',
    }), { status: 429 }));

    await expect(sendResendEmailBatch({
      apiKey: 're_test',
      idempotencyKey: 'speaker-archive-test',
      emails: [email],
      fetcher,
    })).rejects.toEqual(new ResendBatchError('The email provider did not accept the request.', 429));
  });
});

describe('Resend broadcast client', () => {
  it('isolates recipients in a new segment and asks Resend to schedule the blast', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/segments')) return new Response(JSON.stringify({ id: 'segment-1' }), { status: 200 });
      if (url.endsWith('/contacts')) return new Response(JSON.stringify({ id: 'contact-1' }), { status: 200 });
      if (url.endsWith('/broadcasts')) return new Response(JSON.stringify({ id: 'broadcast-1' }), { status: 200 });
      return new Response(JSON.stringify({ method: init?.method }), { status: 404 });
    });

    await expect(prepareResendBroadcast({
      apiKey: 're_broadcast_test',
      eventName: 'July meetup',
      eventDate: '2026-07-30T08:30:00.000Z',
      eventEndDate: '2026-07-30T16:00:00.000Z',
      locationName: 'Fido, Accra',
      locationUrl: 'https://www.google.com/maps/place/Accra',
      eventUrl: 'https://em.devcongress.org/r/july-meetup?view=details',
      calendarDownloadUrl: 'https://em.devcongress.org/api/registration/events/july-meetup/calendar.ics',
      subject: 'Venue update\r\nBcc: attacker@example.com',
      body: 'We have moved rooms.',
      from: 'DevCongress <events@updates.devcongress.org>',
      replyTo: 'hello@devcongress.org',
      recipients: [{ email: 'ama@example.com', name: 'Ama Mensah' }],
      fetcher,
    })).resolves.toEqual({ broadcastId: 'broadcast-1', segmentId: 'segment-1' });

    const broadcastCall = fetcher.mock.calls.find(([url]) => String(url).endsWith('/broadcasts'));
    expect(broadcastCall?.[1]).toEqual(expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"segment_id":"segment-1"'),
    }));
    expect(broadcastCall?.[1]?.body).toContain('"send":false');
    expect(broadcastCall?.[1]?.body).toContain('"subject":"Venue update Bcc: attacker@example.com"');
    expect(broadcastCall?.[1]?.body).not.toContain('Venue update\\r\\n');
    expect(broadcastCall?.[1]?.body).toContain('RESEND_UNSUBSCRIBE_URL');
  });

  it('sends a persisted broadcast separately so a retry cannot create another audience', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://api.resend.com/broadcasts/broadcast-1/send');
      return new Response(JSON.stringify({ id: 'send-1' }), { status: 200 });
    });

    await expect(sendResendBroadcast({
      apiKey: 're_broadcast_test',
      broadcastId: 'broadcast-1',
      scheduledFor: '2026-08-01T12:00:00.000Z',
      fetcher,
    })).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.resend.com/broadcasts/broadcast-1/send',
      expect.objectContaining({
        method: 'POST',
        body: '{"scheduled_at":"2026-08-01T12:00:00.000Z"}',
      }),
    );
  });
});
