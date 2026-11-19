import { describe, expect, it } from 'vitest';
import { eventSubmissionSlackPayload } from '@/lib/email/slack';
import { rejectionView, slackModerationConfig, verifySlackSignature } from './slack-moderation';

async function signature(body: string, timestamp: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));

  return `v0=${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

describe('Slack submission moderation', () => {
  it('authenticates the raw payload and rejects stale or altered requests', async () => {
    const timestamp = '1700000000';
    const body = 'payload=%7B%7D';
    const secret = 'example-signing-secret';
    const signed = await signature(body, timestamp, secret);
    const now = 1_700_000_000_000;

    expect(await verifySlackSignature(body, timestamp, signed, secret, now)).toBe(true);
    expect(await verifySlackSignature(`${body}x`, timestamp, signed, secret, now)).toBe(false);
    expect(await verifySlackSignature(body, timestamp, signed, secret, now + 301_000)).toBe(false);
    expect(await verifySlackSignature(body, timestamp, 'v0=bad', secret, now)).toBe(false);
  });

  it('fails closed unless all Slack settings are present and accepts private channel ID formats', () => {
    const env: Record<string, string> = {
      SLACK_EVENT_SUBMISSION_SIGNING_SECRET: 's'.repeat(32),
      SLACK_EVENT_SUBMISSION_BOT_TOKEN: 'x'.repeat(24),
      SLACK_EVENT_SUBMISSION_TEAM_ID: 'T12345678',
      SLACK_EVENT_SUBMISSION_APP_ID: 'A12345678',
      SLACK_EVENT_SUBMISSION_CHANNEL_ID: 'C12345678',
    };

    expect(slackModerationConfig((name) => env[name])?.channelId).toBe('C12345678');
    delete env.SLACK_EVENT_SUBMISSION_SIGNING_SECRET;
    expect(slackModerationConfig((name) => env[name])).toBeNull();
  });

  it('loads an authoritative bundled secret and trims every field', () => {
    const bundle = { botToken: ` ${'x'.repeat(24)} `, signingSecret: ` ${'s'.repeat(32)} `, teamId: ' T12345678 ', appId: ' A12345678 ', channelId: ' C12345678 ' };
    const env: Record<string, string> = {
      SLACK_EVENT_SUBMISSION_BOT_TOKEN: JSON.stringify(bundle),
      SLACK_EVENT_SUBMISSION_SIGNING_SECRET: 'legacy-secret-that-is-long-enough',
      SLACK_EVENT_SUBMISSION_TEAM_ID: 'T99999999', SLACK_EVENT_SUBMISSION_APP_ID: 'A99999999', SLACK_EVENT_SUBMISSION_CHANNEL_ID: 'C99999999',
    };

    expect(slackModerationConfig((name) => env[name])).toEqual({
      botToken: bundle.botToken.trim(), signingSecret: bundle.signingSecret.trim(), teamId: 'T12345678', appId: 'A12345678', channelId: 'C12345678',
    });
  });

  it('rejects malformed, incomplete and invalid bundles without legacy fallback', () => {
    const valid = { botToken: 'x'.repeat(24), signingSecret: 's'.repeat(32), teamId: 'T12345678', appId: 'A12345678', channelId: 'C12345678' };
    const legacy: Record<string, string> = {
      SLACK_EVENT_SUBMISSION_SIGNING_SECRET: 's'.repeat(32), SLACK_EVENT_SUBMISSION_TEAM_ID: 'T12345678',
      SLACK_EVENT_SUBMISSION_APP_ID: 'A12345678', SLACK_EVENT_SUBMISSION_CHANNEL_ID: 'C12345678',
    };
    const invalid = ['{broken', '[1,2]', '"' + 'x'.repeat(24) + '"', 'null', 'true', 'false', '123456789012345678901234', '-123456789012345678901234',
      JSON.stringify({ ...valid, channelId: undefined }), JSON.stringify({ ...valid, botToken: 42 }),
      JSON.stringify({ ...valid, signingSecret: 'short' }), JSON.stringify({ ...valid, teamId: 'bad' }),
      JSON.stringify({ ...valid, appId: 'bad' }), JSON.stringify({ ...valid, channelId: 'bad' })];

    for (const token of invalid) {
      expect(slackModerationConfig((name) => name === 'SLACK_EVENT_SUBMISSION_BOT_TOKEN' ? token : legacy[name])).toBeNull();
    }
  });

  it('adds confirmed approval and rejection alongside the review link only when interactive', () => {
    const input = { eventTitle: 'Meetup', summary: 'A meetup', organizerName: 'A', organizerEmail: 'a@example.com', startsAt: '2026-11-09T12:00:00Z', format: 'online', location: 'Online', dashboardUrl: 'https://example.com/review' };
    const plain = JSON.stringify(eventSubmissionSlackPayload(input));
    const interactive = JSON.stringify(eventSubmissionSlackPayload(input, 'submission-id'));

    expect(plain).not.toContain('submission_approve');
    expect(interactive).toContain('submission_approve');
    expect(interactive).toContain('submission_reject');
    expect(interactive).toContain('confirm');
    expect(interactive).toContain('https://example.com/review');
    expect(JSON.stringify(rejectionView('reference'))).toContain('insufficient_information');
  });

  it('marks test cards and makes their approval explicitly non-publishing', () => {
    const input = { eventTitle: 'Meetup', summary: 'A meetup', organizerName: 'A', organizerEmail: 'a@example.com', startsAt: '2026-11-09T12:00:00Z', format: 'online', location: 'Online', dashboardUrl: 'https://example.com/review' };
    const normal = JSON.stringify(eventSubmissionSlackPayload(input, 'normal'));
    const test = JSON.stringify(eventSubmissionSlackPayload({ ...input, isTest: true }, 'test'));

    expect(normal).toContain('Approve & publish');
    expect(normal).not.toContain('[TEST]');
    expect(test).toContain('[TEST]');
    expect(test).toContain('Approve test');
    expect(test).not.toContain('Approve & publish');
  });

});
