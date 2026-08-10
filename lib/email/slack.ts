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

function formatEventDateForSlack(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Accra',
  }).format(date);
  const timeLabel = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Africa/Accra',
    timeZoneName: 'short',
  }).format(date);

  return `${dateLabel} · ${timeLabel}`;
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
  fetcher?: typeof fetch;
}): Promise<void> {
  const payload = {
    text: `New event submission: ${input.eventTitle}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: 'New event submission' } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Event*\n${slackText(input.eventTitle)}` },
          { type: 'mrkdwn', text: `*Organizer*\n${slackText(input.organizerName)}` },
          { type: 'mrkdwn', text: `*Email*\n${slackText(input.organizerEmail)}` },
          { type: 'mrkdwn', text: `*When*\n${slackText(input.startsAt)}` },
          { type: 'mrkdwn', text: `*Format*\n${slackText(input.format)}` },
          { type: 'mrkdwn', text: `*Where*\n${slackText(input.location)}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Summary*\n${slackText(input.summary) || '(no summary)'}` },
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Review in EMS' },
          url: input.dashboardUrl,
        }],
      },
    ],
  };

  await postSlackWebhook({ webhookUrl: input.webhookUrl, payload, fetcher: input.fetcher });
}

export async function sendEventAddedToSlack(input: {
  webhookUrl: string;
  eventName: string;
  eventDate: string;
  eventFormat: string;
  location: string;
  source: 'organizer' | 'public submission';
  publicEventUrl: string;
  coverImageUrl: string;
  fetcher?: typeof fetch;
}): Promise<void> {
  const sourceLabel = input.source === 'public submission' ? 'Community submission' : 'Organizer workspace';
  const eventDetails = [
    formatEventDateForSlack(input.eventDate),
    `${titleCase(input.eventFormat)} · ${input.location.trim() || 'Location to be announced'}`,
  ].join('\n');
  const payload = {
    text: `New event added: ${input.eventName}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'New event' },
      },
      {
        type: 'image',
        image_url: input.coverImageUrl,
        alt_text: `Event cover for ${input.eventName}`.slice(0, 2_000),
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${slackText(input.eventName)}*\n${slackText(eventDetails)}` },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `Added via ${slackText(sourceLabel)}` }],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open event' },
            url: input.publicEventUrl,
          },
        ],
      },
    ],
  };

  await postSlackWebhook({ webhookUrl: input.webhookUrl, payload, fetcher: input.fetcher });
}
