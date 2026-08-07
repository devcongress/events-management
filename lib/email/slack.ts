export class SlackWebhookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SlackWebhookError';
  }
}

function slackText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  let webhook: URL;
  try {
    webhook = new URL(input.webhookUrl.trim());
  } catch {
    throw new SlackWebhookError('Slack notification URL is invalid.');
  }
  if (webhook.protocol !== 'https:' || webhook.hostname !== 'hooks.slack.com') {
    throw new SlackWebhookError('Slack notification URL is invalid.');
  }

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

  try {
    const response = await (input.fetcher ?? fetch)(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new SlackWebhookError('Slack did not accept the notification.');
  } catch (error) {
    if (error instanceof SlackWebhookError) throw error;
    throw new SlackWebhookError('Slack could not be reached.');
  }
}
