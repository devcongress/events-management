import type { Context } from 'hono';
import { assertAdminOrigin, getAdminSession, recordAdminAudit } from '@/lib/supabase/admin-auth';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import { envValue } from '@/server/env';
import { privateSlackChannelMember, slackModerationConfig, slackReviewerEmail, verifySlackSignature, type SlackModerationConfig } from './slack-moderation';

const LINK_PATH = '/slack/event-submissions/link';
const TOKEN_LIFETIME_MS = 10 * 60 * 1000;

async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function frontendOrigin(c: Context): string | null {
  const configured = envValue('PUBLIC_FRONTEND_ORIGIN', c)?.trim() || envValue('PUBLIC_APP_URL', c)?.trim();

  if (!configured) return null;
  try {
    const url = new URL(configured);

    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;

    return url.origin;
  } catch {
    return null;
  }
}

export async function slackReviewerAllowMe(c: Context): Promise<Response> {
  const config = slackModerationConfig((name) => envValue(name, c));
  const origin = frontendOrigin(c);

  if (!config || !origin) return c.json({ error: 'Slack account linking is unavailable.' }, 503);
  const body = await c.req.text();
  const verified = await verifySlackSignature(body, c.req.header('x-slack-request-timestamp') ?? '', c.req.header('x-slack-signature') ?? '', config.signingSecret);

  if (!verified) return c.json({ error: 'Invalid request.' }, 401);
  const form = new URLSearchParams(body);
  const userId = form.get('user_id') ?? '';

  if (form.get('team_id') !== config.teamId || form.get('api_app_id') !== config.appId || form.get('channel_id') !== config.channelId || form.get('command') !== '/allow-me' || !/^[UW][A-Z0-9]{8,31}$/.test(userId)) {
    return c.json({ response_type: 'ephemeral', text: 'Use this command in the configured moderation channel.' });
  }
  if ((form.get('text') ?? '').trim()) return c.json({ response_type: 'ephemeral', text: 'Use /allow-me without an email address.' });

  const responseUrl = safeSlackResponseUrl(form.get('response_url'));

  if (!responseUrl) return c.json({ response_type: 'ephemeral', text: 'Unable to start enrollment. Please try again.' });
  const task = completeSlackEnrollment(c, config, origin, userId, responseUrl);

  try {
    c.executionCtx.waitUntil(task);
  } catch {
    void task;
  }

  return c.json({ response_type: 'ephemeral', text: 'Checking your access privately…' });
}

function safeSlackResponseUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);

    if (url.protocol !== 'https:' || url.hostname !== 'hooks.slack.com' || url.port || url.username || url.password || url.search || url.hash || !/^\/commands\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname)) return null;

    return url.toString();
  } catch {
    return null;
  }
}

async function organizerLinkMessage(c: Context, config: SlackModerationConfig, origin: string, userId: string, prefix: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const { error } = await getSupabaseAdminClient(c).from('event_submission_slack_link_tokens').upsert({
    token_hash: await tokenHash(token), team_id: config.teamId, slack_user_id: userId,
    expires_at: new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString(),
  }, { onConflict: 'team_id,slack_user_id' });

  return error ? `${prefix} The account link is unavailable; try /allow-me again.`
    : `${prefix} <${origin}${LINK_PATH}#${token}|Connect your organizer account>. This private link expires in 10 minutes and can be used once.`;
}

async function completeSlackEnrollment(c: Context, config: SlackModerationConfig, origin: string, userId: string, responseUrl: string): Promise<void> {
  let text = 'Unable to check your access right now. Please try /allow-me again.';

  try {
    const member = await privateSlackChannelMember(config, userId);
    const email = member ? await slackReviewerEmail(config, userId) : null;

    if (!member) {
      text = 'You must be an active member of the private moderation channel to use this command.';
    } else if (email) {
      const client = getSupabaseAdminClient(c);
      const result = await client.rpc('grant_event_submission_slack_reviewer', {
        p_team_id: config.teamId, p_channel_id: config.channelId, p_slack_user_id: userId, p_slack_email: email,
      });

      if (result.error) throw new Error('Unable to check enrollment');
      if (result.data === 'denied') {
        text = 'Your linked organizer account is not eligible for moderation. Please contact an owner.';
      } else if (result.data === 'linked') {
        text = 'Your linked organizer account can already moderate community submissions in this channel.';
      } else if (result.data === 'granted' || result.data === 'link_required') {
        const prefix = result.data === 'granted'
          ? 'Slack moderation is enabled for you in this channel. If you also have an organizer account, you may connect it.'
          : 'An organizer account needs to be connected before moderation is enabled.';

        text = await organizerLinkMessage(c, config, origin, userId, prefix);
      }
    } else {
      text = await organizerLinkMessage(c, config, origin, userId, 'Slack moderation could not be enabled because your Slack email could not be verified. If you have an organizer account, you can connect it.');
    }
  } catch {
    // Do not disclose provider or database errors in Slack.
  }

  await fetch(responseUrl, {
    method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response_type: 'ephemeral', text }),
  }).catch(() => undefined);

}

export async function confirmSlackReviewerLink(c: Context): Promise<Response> {
  const originError = assertAdminOrigin(c);

  if (originError) return originError;
  const session = await getAdminSession(c);

  if (!session.authenticated) return c.json({ error: 'Sign in to continue.' }, 401);
  if (!session.membership_id || !['owner', 'organizer'].includes(session.role)) return c.json({ error: 'An active organizer account is required.' }, 403);
  const body = await c.req.json().catch(() => null) as { token?: unknown } | null;

  if (typeof body?.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return c.json({ error: 'This link is invalid or expired.' }, 400);
  const { data, error } = await getSupabaseAdminClient(c).rpc('consume_event_submission_slack_link', {
    p_token_hash: await tokenHash(body.token), p_membership_id: session.membership_id,
  });

  if (error || !data) return c.json({ error: 'This link is invalid, expired, or already associated with another account.' }, 400);

  await recordAdminAudit(c, {
    actor_user_id: session.user_id, actor_email: session.email, actor_role: session.role,
    action: 'event_submission.slack_reviewer_linked', target_type: 'admin_membership', target_id: session.membership_id,
  });

  return c.json({ linked: true });
}
