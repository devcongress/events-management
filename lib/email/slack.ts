export class SlackWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackWebhookError';
  }
}

function slackText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function titleCase(value: string): string {
  return value
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatEventDateForSlack(value: string, endValue?: string | null): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Accra',
  }).format(date);
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Accra',
  });
  const timeWithZoneFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Accra',
    timeZoneName: 'short',
  });
  const endDate = endValue ? new Date(endValue) : null;
  const hasRange = Boolean(endDate && !Number.isNaN(endDate.getTime()) && endDate.getTime() > date.getTime());
  const timeLabel = hasRange && endDate
    ? `${timeFormatter.format(date)}–${timeWithZoneFormatter.format(endDate)}`
    : timeWithZoneFormatter.format(date);

  return `${dateLabel} · ${timeLabel}`;
}

type EventSlackMessageInput = {
  eventName: string;
  eventDate: string;
  eventEndDate?: string | null;
  eventFormat: string;
  location: string;
  source: 'organizer' | 'public submission';
  publicEventUrl: string;
  coverImageUrl?: string | null;
};

export type SlackMessageReference = {
  channelId: string;
  messageTs: string;
};

function eventAddedPayload(input: EventSlackMessageInput): Record<string, unknown> {
  const sourceLabel = input.source === 'public submission' ? 'Community submission' : 'Organizer workspace';
  const eventDetails = [
    formatEventDateForSlack(input.eventDate, input.eventEndDate),
    `${titleCase(input.eventFormat)} · ${input.location.trim() || 'Location to be announced'}`,
  ].join('\n');
  const coverImageUrl = publicSlackImageUrl(input.coverImageUrl);

  return {
    text: `New event added: ${input.eventName}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'New event' },
      },
      ...(coverImageUrl ? [{
        type: 'image',
        image_url: coverImageUrl,
        alt_text: `Event cover for ${input.eventName}`.slice(0, 2_000),
      }] : []),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${slackText(input.eventName)}*\n${slackText(eventDetails)}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Added via ${slackText(sourceLabel)}` }],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `<${input.publicEventUrl}|Open event →>` },
      },
    ],
  };
}

function slackChannelId(value: string): string {
  const normalized = value.trim();
  if (!/^[CG][A-Z0-9]{8,31}$/.test(normalized)) {
    throw new SlackWebhookError('Slack events channel ID is invalid.');
  }
  return normalized;
}

function slackMessageTs(value: string): string {
  const normalized = value.trim();
  if (!/^\d{10,16}\.\d{6}$/.test(normalized)) {
    throw new SlackWebhookError('Slack message timestamp is invalid.');
  }
  return normalized;
}

async function callSlackWebApi(input: {
  method: 'chat.postMessage' | 'chat.update';
  botToken: string;
  payload: Record<string, unknown>;
  fetcher?: typeof fetch;
}): Promise<Record<string, unknown>> {
  const token = input.botToken.trim();
  if (token.length < 20 || token.length > 500) {
    throw new SlackWebhookError('Slack bot credentials are invalid.');
  }

  try {
    const response = await (input.fetcher ?? fetch)(`https://slack.com/api/${input.method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(input.payload),
      signal: AbortSignal.timeout(5_000),
    });
    const result = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || result?.ok !== true) {
      const providerCode = typeof result?.error === 'string' && /^[a-z0-9_]{1,80}$/.test(result.error)
        ? ` (${result.error})`
        : '';
      throw new SlackWebhookError(`Slack rejected the notification${providerCode}.`);
    }
    return result;
  } catch (error) {
    if (error instanceof SlackWebhookError) throw error;
    throw new SlackWebhookError('Slack could not be reached.');
  }
}

function slackWebhookUrl(value: string): URL {
  let webhook: URL;
  try {
    webhook = new URL(value.trim());
  } catch {
    throw new SlackWebhookError('Slack notification URL is invalid.');
  }
  if (webhook.protocol !== 'https:' || webhook.hostname !== 'hooks.slack.com') {
    throw new SlackWebhookError('Slack notification URL is invalid.');
  }
  return webhook;
}

function publicSlackImageUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 3_000) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

async function postSlackWebhook(input: {
  webhookUrl: string;
  payload: Record<string, unknown>;
  fetcher?: typeof fetch;
}): Promise<void> {
  const webhook = slackWebhookUrl(input.webhookUrl);

  try {
    const response = await (input.fetcher ?? fetch)(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      const detail = (await response.text())
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 160);
      const suffix = detail ? `: ${detail}` : '';
      throw new SlackWebhookError(`Slack rejected the notification (HTTP ${response.status})${suffix}.`);
    }
  } catch (error) {
    if (error instanceof SlackWebhookError) throw error;
    throw new SlackWebhookError('Slack could not be reached.');
  }
}

export async function sendEventSubmissionReplyToSlack(input: {
  webhookUrl: string;
  eventTitle: string;
  senderEmail: string;
  subject: string;
  bodyExcerpt: string;
  receivedAt: string;
  dashboardUrl: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const payload = {
    text: `New reply to community submission: ${input.eventTitle}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'New community submission reply' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Event*\n${slackText(input.eventTitle)}` },
          { type: 'mrkdwn', text: `*From*\n${slackText(input.senderEmail)}` },
          { type: 'mrkdwn', text: `*Subject*\n${slackText(input.subject || '(no subject)')}` },
          { type: 'mrkdwn', text: `*Received*\n${slackText(input.receivedAt)}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `>${slackText(input.bodyExcerpt).replace(/\n/g, '\n>') || '(empty reply)'}` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open in EMS' },
            url: input.dashboardUrl,
          },
        ],
      },
    ],
  };

  await postSlackWebhook({ webhookUrl: input.webhookUrl, payload, fetcher: input.fetcher });
}

export async function sendEventSubmissionReceivedToSlack(input: {
  webhookUrl: string;
  eventTitle: string;
  summary: string;
  organizerName: string;
  organizerEmail: string;
  startsAt: string;
  format: string;
  location: string;
  dashboardUrl: string;
  coverImageUrl?: string | null;
  fetcher?: typeof fetch;
}): Promise<void> {
  const coverImageUrl = publicSlackImageUrl(input.coverImageUrl);
  const eventDetails = [
    formatEventDateForSlack(input.startsAt),
    `${titleCase(input.format)} · ${input.location.trim() || 'Location to be announced'}`,
  ].join('\n');
  const payload = {
    text: `New event submission: ${input.eventTitle}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'New community event submission' } },
      ...(coverImageUrl ? [{
        type: 'image',
        image_url: coverImageUrl,
        alt_text: `Event cover for ${input.eventTitle}`.slice(0, 2_000),
      }] : []),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${slackText(input.eventTitle)}*\n${slackText(eventDetails)}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Submitted by ${slackText(input.organizerName)} · ${slackText(input.organizerEmail)}` }],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*About this event*\n${slackText(input.summary) || '(no summary)'}` },
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Review submission →' },
          style: 'primary',
          url: input.dashboardUrl,
        }],
      },
    ],
  };

  await postSlackWebhook({ webhookUrl: input.webhookUrl, payload, fetcher: input.fetcher });
}

export async function sendEventSubmissionAmendmentToSlack(input: {
  webhookUrl: string;
  eventTitle: string;
  organizerName: string;
  organizerEmail: string;
  startsAt: string;
  location: string;
  dashboardUrl: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const payload = {
    text: `Community event update requested: ${input.eventTitle}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Community event update requested' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Event*\n${slackText(input.eventTitle)}` },
          { type: 'mrkdwn', text: `*Requested schedule*\n${slackText(formatEventDateForSlack(input.startsAt))}` },
          { type: 'mrkdwn', text: `*Requested location*\n${slackText(input.location.trim() || 'Location to be announced')}` },
          { type: 'mrkdwn', text: `*Requested by*\n${slackText(input.organizerName)} · ${slackText(input.organizerEmail)}` },
        ],
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Review update →' },
          style: 'primary',
          url: input.dashboardUrl,
        }],
      },
    ],
  };

  await postSlackWebhook({ webhookUrl: input.webhookUrl, payload, fetcher: input.fetcher });
}

export async function sendEventPageMonitoringAlertToSlack(input: {
  webhookUrl: string;
  eventTitle: string;
  status: 'changed' | 'unavailable' | 'unmonitorable';
  detail: string;
  sourceUrl: string;
  dashboardUrl: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const headline = input.status === 'changed'
    ? 'Registration page details changed'
    : input.status === 'unavailable'
      ? 'Registration page is unavailable'
      : 'Registration page cannot be monitored';
  const payload = {
    text: `${headline}: ${input.eventTitle}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: headline } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Event*\n${slackText(input.eventTitle)}` },
          { type: 'mrkdwn', text: `*Signal*\n${slackText(input.detail)}` },
        ],
      },
      {
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Review in EMS →' }, style: 'primary', url: input.dashboardUrl },
          { type: 'button', text: { type: 'plain_text', text: 'Open source page ↗' }, url: input.sourceUrl },
        ],
      },
    ],
  };
  await postSlackWebhook({ webhookUrl: input.webhookUrl, payload, fetcher: input.fetcher });
}

export async function sendEventAddedToSlack(input: EventSlackMessageInput & {
  webhookUrl: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  await postSlackWebhook({ webhookUrl: input.webhookUrl, payload: eventAddedPayload(input), fetcher: input.fetcher });
}

export async function sendEditableEventAddedToSlack(input: EventSlackMessageInput & {
  botToken: string;
  channelId: string;
  fetcher?: typeof fetch;
}): Promise<SlackMessageReference> {
  const channelId = slackChannelId(input.channelId);
  const result = await callSlackWebApi({
    method: 'chat.postMessage',
    botToken: input.botToken,
    payload: { channel: channelId, ...eventAddedPayload(input) },
    fetcher: input.fetcher,
  });
  const returnedChannel = typeof result.channel === 'string' ? slackChannelId(result.channel) : channelId;
  if (typeof result.ts !== 'string') throw new SlackWebhookError('Slack did not return a message reference.');
  return { channelId: returnedChannel, messageTs: slackMessageTs(result.ts) };
}

export async function updateEditableEventAddedToSlack(input: EventSlackMessageInput & SlackMessageReference & {
  botToken: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  await callSlackWebApi({
    method: 'chat.update',
    botToken: input.botToken,
    payload: {
      channel: slackChannelId(input.channelId),
      ts: slackMessageTs(input.messageTs),
      ...eventAddedPayload(input),
    },
    fetcher: input.fetcher,
  });
}
