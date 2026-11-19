import type { Context } from 'hono';
import { callSlackWebApi, eventSubmissionSlackPayload, type EventSubmissionSlackInput } from '@/lib/email/slack';
import { getSupabaseAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/types/supabase';

export type SlackModerationConfig = {
  signingSecret: string;
  botToken: string;
  teamId: string;
  appId: string;
  channelId: string;
};

export function slackModerationConfig(value: (name: string) => string | undefined): SlackModerationConfig | null {
  const signingSecret = value('SLACK_EVENT_SUBMISSION_SIGNING_SECRET')?.trim() ?? '';
  const botToken = value('SLACK_EVENT_SUBMISSION_BOT_TOKEN')?.trim() ?? '';
  const teamId = value('SLACK_EVENT_SUBMISSION_TEAM_ID')?.trim() ?? '';
  const appId = value('SLACK_EVENT_SUBMISSION_APP_ID')?.trim() ?? '';
  const channelId = value('SLACK_EVENT_SUBMISSION_CHANNEL_ID')?.trim() ?? '';

  if (signingSecret.length < 20 || botToken.length < 20 || !/^T[A-Z0-9]{8,31}$/.test(teamId) || !/^A[A-Z0-9]{8,31}$/.test(appId) || !/^[CG][A-Z0-9]{8,31}$/.test(channelId)) return null;

  return { signingSecret, botToken, teamId, appId, channelId };
}

export async function verifySlackSignature(body: string, timestamp: string, signature: string, secret: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{10}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^v0=[0-9a-f]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
  const expected = `v0=${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  let difference = 0;

  for (let i = 0; i < expected.length; i += 1) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);

  return difference === 0;
}

async function privateSlackChannel(config: SlackModerationConfig): Promise<boolean> {
  const info = await callSlackWebApi({ method: 'conversations.info', botToken: config.botToken, payload: { channel: config.channelId } });
  const channel = info.channel as Record<string, unknown> | undefined;

  return Boolean(channel && channel.id === config.channelId && channel.is_private === true && channel.is_im !== true && channel.is_mpim !== true && channel.is_shared !== true && channel.is_ext_shared !== true && channel.is_org_shared !== true);
}

export async function privateSlackChannelMember(config: SlackModerationConfig, slackUserId: string): Promise<boolean> {
  if (!/^[UW][A-Z0-9]{8,31}$/.test(slackUserId)) return false;
  try {
    if (!await privateSlackChannel(config)) return false;
    let cursor = '';
    const seen = new Set<string>();

    for (let page = 0; page < 50; page += 1) {
      const result = await callSlackWebApi({ method: 'conversations.members', botToken: config.botToken, payload: { channel: config.channelId, limit: 200, ...(cursor ? { cursor } : {}) } });

      if (!Array.isArray(result.members)) return false;
      if (result.members.includes(slackUserId)) return true;
      const next = (result.response_metadata as { next_cursor?: unknown } | undefined)?.next_cursor;

      if (!next) return false;
      if (typeof next !== 'string' || seen.has(next)) return false;
      seen.add(next);
      cursor = next;
    }
  } catch {
    return false;
  }

  return false;
}

export async function slackReviewerEmail(config: SlackModerationConfig, slackUserId: string): Promise<string | null> {
  if (!/^[UW][A-Z0-9]{8,31}$/.test(slackUserId)) return null;
  try {
    const result = await callSlackWebApi({ method: 'users.info', botToken: config.botToken, payload: { user: slackUserId } });
    const user = result.user as { id?: unknown; team_id?: unknown; deleted?: unknown; is_bot?: unknown; is_app_user?: unknown; is_email_confirmed?: unknown; is_external?: unknown; suspended?: unknown; profile?: { email?: unknown } } | undefined;
    const email = typeof user?.profile?.email === 'string' ? user.profile.email.trim().toLowerCase() : '';

    if (user?.id !== slackUserId || user.team_id !== config.teamId || user.deleted !== false || user.is_bot !== false || user.is_app_user === true || user.is_external === true || user.suspended === true || user.is_email_confirmed !== true || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

    return email;
  } catch {
    return null;
  }
}

export async function slackModerator(c: Context, config: SlackModerationConfig, slackUserId: string) {
  const client = getSupabaseAdminClient(c);
  const identity = await client.from('event_submission_slack_identities').select('membership_id')
    .eq('team_id', config.teamId).eq('slack_user_id', slackUserId).maybeSingle();

  if (identity.error || !await privateSlackChannelMember(config, slackUserId)) return null;
  if (identity.data) {
    if (!identity.data.membership_id) return null;
    const member = await client.from('admin_memberships').select('email, role, status')
      .eq('id', identity.data.membership_id).maybeSingle();

    if (member.error || !member.data || member.data.status !== 'active' || !['owner', 'organizer'].includes(member.data.role)) return null;

    return { email: member.data.email, role: member.data.role as 'owner' | 'organizer', reviewedVia: 'slack_ems' as const };
  }
  const grant = await client.from('event_submission_slack_grants').select('slack_user_id')
    .eq('team_id', config.teamId).eq('channel_id', config.channelId).eq('slack_user_id', slackUserId).maybeSingle();

  if (grant.error || !grant.data) return null;
  const email = await slackReviewerEmail(config, slackUserId);

  if (!email) return null;
  const member = await client.from('admin_memberships').select('id').eq('email', email).maybeSingle();

  if (member.error || member.data) return null;

  return { email, role: null, reviewedVia: 'slack_only' as const };
}

export async function postSubmissionCard(c: Context, config: SlackModerationConfig, submissionId: string, input: EventSubmissionSlackInput): Promise<void> {
  if (!await privateSlackChannel(config)) {
    throw new Error('Slack moderation channel is not private');
  }
  const payload = eventSubmissionSlackPayload(input, submissionId);
  const sent = await callSlackWebApi({ method: 'chat.postMessage', botToken: config.botToken, payload: { channel: config.channelId, ...payload } });

  if (sent.channel !== config.channelId || typeof sent.ts !== 'string' || !/^\d{10,16}\.\d{6}$/.test(sent.ts)) throw new Error('Invalid Slack message reference');
  const { error } = await getSupabaseAdminClient(c).from('event_submission_slack_cards').insert({
    submission_id: submissionId,
    channel_id: config.channelId,
    message_ts: sent.ts,
    payload: payload as Json,
  });

  if (error) throw new Error('Unable to store Slack message reference');
  await syncSubmissionCard(c, config, submissionId);
}

export async function syncSubmissionCard(c: Context, config: SlackModerationConfig, submissionId: string): Promise<void> {
  const client = getSupabaseAdminClient(c);
  const token = crypto.randomUUID();
  const claim = await client.rpc('claim_event_submission_slack_card', { p_submission_id: submissionId, p_token: token });

  if (claim.error) throw new Error('Unable to claim Slack card');
  if (!claim.data) return;
  try {
    const card = await client.from('event_submission_slack_cards').select('*').eq('submission_id', submissionId).maybeSingle();
    const submission = await client.from('event_submissions').select('review_status').eq('id', submissionId).maybeSingle();

    if (card.error || submission.error) throw new Error('Unable to load Slack card state');
    if (!card.data || !submission.data || card.data.channel_id !== config.channelId || card.data.delivered_status === submission.data.review_status) return;
    const status = submission.data.review_status;
    const payload = card.data.payload as { text: string; blocks: Array<Record<string, unknown>> };
    const blocks = payload.blocks.map((block) => block.type === 'actions'
      ? { ...block, elements: (block.elements as Array<Record<string, unknown>>).filter((element) => element.url) }
      : block);

    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `*Decision:* ${status}` }] });
    await callSlackWebApi({ method: 'chat.update', botToken: config.botToken, payload: { channel: card.data.channel_id, ts: card.data.message_ts, text: `${payload.text} — ${status}`, blocks } });
    const updated = await client.from('event_submission_slack_cards').update({ delivered_status: status })
      .eq('submission_id', submissionId).eq('sync_token', token);

    if (updated.error) throw new Error('Unable to mark Slack card delivered');
  } finally {
    await client.from('event_submission_slack_cards').update({ sync_token: null, sync_until: null })
      .eq('submission_id', submissionId).eq('sync_token', token);
  }
}

export async function retrySubmissionCards(c: Context, config: SlackModerationConfig): Promise<void> {
  const client = getSupabaseAdminClient(c);
  const { data, error } = await client.rpc('pending_event_submission_slack_card_sync', { p_channel_id: config.channelId });

  if (error) throw new Error('Unable to load Slack cards');
  for (const card of data) {
    await syncSubmissionCard(c, config, card.submission_id).catch(() => undefined);
  }
}

export function rejectionView(metadata: string) {
  return {
    type: 'modal', callback_id: 'submission_rejection', private_metadata: metadata,
    title: { type: 'plain_text', text: 'Reject submission' },
    submit: { type: 'plain_text', text: 'Reject' }, close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      { type: 'input', block_id: 'category', label: { type: 'plain_text', text: 'Reason' }, element: { type: 'static_select', action_id: 'value', options: [
        ['Calendar fit', 'calendar_fit'], ['Insufficient information', 'insufficient_information'], ['Duplicate', 'duplicate'], ['Event passed', 'event_passed'], ['Other', 'other'],
      ].map(([label, value]) => ({ text: { type: 'plain_text', text: label }, value })) } },
      { type: 'input', block_id: 'message', optional: true, label: { type: 'plain_text', text: 'Message to submitter' }, element: { type: 'plain_text_input', action_id: 'value', multiline: true, max_length: 1200 } },
      { type: 'input', block_id: 'note', optional: true, label: { type: 'plain_text', text: 'Internal note' }, element: { type: 'plain_text_input', action_id: 'value', multiline: true, max_length: 1000 } },
    ],
  };
}
