import { renderSpeakerOutcomeMessage } from '@/lib/annual-conference-speaker-outcomes';

export const DEFAULT_SPEAKER_UPDATE = {
  subject: 'DevCon26 speaker update: A few details for 12 November',
  message: `Hi {first_name},

Sorry for the confusion in our earlier acceptance email.

You do not need to send a short bio, slides or demo materials at this stage. Please share the following by November 12, 2026:

1. Your preferred headshot. Upload a photo, provide a link or choose “Use saved badge photo” in your private workspace.
2. Your social media handles.

We’ll use these for our speaker announcements. If we haven’t received your headshot by the deadline, we’ll use a publicly available professional photo from your online profiles.

Please also confirm your participation in your private workspace by November 12. You can include any technical or accessibility support you need.

Open your private workspace:
{workspace_url}

Your speaker badge is optional. You can personalize and download it whenever you’re ready. You do not need to customize it to submit your details.

You can return to your workspace to update your information. Please keep your private link to yourself.

Thank you,
DevCon 2026 Event Organizers

For enquiries: events@devcongress.org`,
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
