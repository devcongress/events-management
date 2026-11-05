import { renderSpeakerOutcomeMessage } from '@/lib/annual-conference-speaker-outcomes';

export const DEFAULT_SPEAKER_UPDATE = {
  subject: 'DevCon26 speaker update — details needed by 7 November',
  message: `Hi {first_name},

We apologize for the miscommunication caused by our earlier acceptance email.

Please disregard the earlier request for a short bio and your slides or demo materials. Right now, we only need the following from you on or before November 7, 2026:

1. Your preferred headshot link
2. Your social media handles

This helps us feature you on our social platforms. If we don't receive a photo by the deadline, we'll use a publicly available professional image from your online profiles so you're still included.

Please use your private workspace to confirm your participation, share your headshot link and social media handles, and tell us about any technical or accessibility needs by November 7, 2026.

{workspace_url}

You can return to your private workspace to update your details. Please keep your private link to yourself.

Thank you for your patience and understanding. We can't wait to have you on the DevCon26 stage!

Warm regards,
DevCon 2026 Event Organizers
For enquiries:
events@devcongress.org`,
};

export function defaultSpeakerUpdate(year: number): { subject: string; message: string } {
  if (year === 2026) return DEFAULT_SPEAKER_UPDATE;

  return {
    subject: 'An update for {edition} speakers',
    message: 'Hi {first_name},\n\nPlease use your private workspace to review and update your speaker details for {edition}.\n\n{workspace_url}\n\nPlease keep your private link to yourself.\n\nThank you,\nDevCongress Event Organizers',
  };
}

export function renderSpeakerUpdate(input: {
  template: { subject: string; message: string };
  speakerName: string;
  talkTitle: string;
  edition: string;
  workspaceUrl: string;
  year: string;
}) {
  return renderSpeakerOutcomeMessage({
    ...input,
    deadline: '',
    brandMeta: ['Annual Conference', 'Speaker update'],
    footerCopy: 'For enquiries, email events@devcongress.org.',
  });
}

export type SpeakerUpdateCampaign = {
  id: string;
  edition_id: string;
  subject: string;
  message: string;
  version: number;
  state: 'draft' | 'queued' | 'complete';
  created_at: string;
  updated_at: string;
};

export type SpeakerUpdateRecipient = {
  id: string;
  name: string;
  recipient: string;
  speaker_email: string;
  link_id: string;
  link_expires_at: string;
  key: string;
  subject: string;
  html: string;
  text: string;
  provider_payload: { from: string; reply_to: string; to: string[]; subject: string; html: string; text: string };
};

export type SpeakerUpdatePreview = {
  id: string;
  update_id: string;
  edition_id: string;
  actor_id: string;
  version: number;
  recipients: SpeakerUpdateRecipient[];
  expires_at: string;
  used_at: string | null;
  queued_count: number | null;
};
