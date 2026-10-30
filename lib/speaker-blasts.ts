import { z } from 'zod';
import type { ResendEmail } from '@/lib/email/resend';

export type SpeakerBlastIntent = 'update' | 'slides_reminder';
export type SpeakerBlastSession = { id: string; title: string; url: string | null; deadline: string | null };
export type SpeakerBlastRecipient = { email: string; name: string; sessions: SpeakerBlastSession[] };
export type SpeakerBlastAudience = {
  recipients: SpeakerBlastRecipient[];
  excluded: Array<{ name: string; title: string; reason: string }>;
};
export type SpeakerBlast = {
  id: string;
  event_id: string;
  created_by: string;
  intent: SpeakerBlastIntent;
  subject: string;
  message: string;
  recipients: SpeakerBlastRecipient[];
  emails: ResendEmail[];
  status: 'preview' | 'sending' | 'accepted' | 'failed';
  provider_ids: string[];
  error: string | null;
  created_at: string;
  expires_at: string;
  first_attempt_at: string | null;
  lease_until: string | null;
  lease_token: string | null;
};

export const speakerBlastDraftSchema = z.object({
  intent: z.enum(['update', 'slides_reminder']),
  subject: z.string().trim().min(1, 'Add a subject.').max(160).refine((value) => !/[\r\n]/.test(value), 'Keep the subject on one line.'),
  message: z.string().trim().min(1, 'Add a message.').max(5000),
}).strict().superRefine((value, context) => {
  if (/(?:https?:\/\/)?[^\s]*(?:\/P_[A-Za-z0-9_-]+|\/speaker-talks\/|\/speaker-intake\/)/i.test(`${value.subject} ${value.message}`)) {
    context.addIssue({ code: 'custom', message: 'Private speaker links are added per recipient. Remove private links from the shared message.' });
  }
});

export function groupSpeakerBlastRecipients(rows: Array<{ email: string; name: string; session: SpeakerBlastSession }>): SpeakerBlastRecipient[] {
  const grouped = new Map<string, SpeakerBlastRecipient>();

  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    const recipient = grouped.get(email) ?? { email, name: row.name, sessions: [] };

    if (!recipient.sessions.some((session) => session.id === row.session.id)) recipient.sessions.push(row.session);
    grouped.set(email, recipient);
  }

  return [...grouped.values()].sort((a, b) => a.email.localeCompare(b.email)).map((recipient) => ({
    ...recipient,
    sessions: recipient.sessions.sort((a, b) => a.id.localeCompare(b.id)),
  }));
}

export function speakerBlastAudienceMatches(saved: SpeakerBlastRecipient[], current: SpeakerBlastRecipient[]): boolean {
  // JSONB may reorder object keys; compare the reviewed fields, not serialization.
  return saved.length === current.length && saved.every((recipient, index) => {
    const candidate = current[index];

    return recipient.email === candidate.email
      && recipient.name === candidate.name
      && recipient.sessions.length === candidate.sessions.length
      && recipient.sessions.every((session, sessionIndex) => {
        const currentSession = candidate.sessions[sessionIndex];

        return session.id === currentSession.id
          && session.title === currentSession.title
          && session.url === currentSession.url
          && session.deadline === currentSession.deadline;
      });
  });
}
