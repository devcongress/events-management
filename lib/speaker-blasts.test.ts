import { describe, expect, it } from 'vitest';
import { groupSpeakerBlastRecipients, speakerBlastAudienceMatches, speakerBlastDraftSchema } from './speaker-blasts';
import { speakerBlastEmail } from './email/templates/speaker-blast';

const session = (id: string) => ({ id, title: `Talk ${id}`, url: `https://go.devcongress.org/P_${id}`, deadline: '2099-10-31T23:59:59Z' });

describe('personalized speaker blasts', () => {
  it('accepts JSONB key reordering while rejecting changes to reviewed fields', () => {
    const current = [{ email: 'ama@example.com', name: 'Ama', sessions: [session('a')] }];
    const saved = [{ sessions: [{ deadline: session('a').deadline, url: session('a').url, title: 'Talk a', id: 'a' }], name: 'Ama', email: 'ama@example.com' }];

    expect(speakerBlastAudienceMatches(saved, current)).toBe(true);
    for (const field of ['email', 'name'] as const) {
      const changed = structuredClone(current);

      changed[0][field] = 'changed';
      expect(speakerBlastAudienceMatches(saved, changed)).toBe(false);
    }
    for (const field of ['id', 'title', 'url', 'deadline'] as const) {
      const changed = structuredClone(current);

      changed[0].sessions[0][field] = 'changed';
      expect(speakerBlastAudienceMatches(saved, changed)).toBe(false);
    }
    expect(speakerBlastAudienceMatches(saved, [])).toBe(false);
  });

  it('groups multiple sessions for one address without mixing private links between speakers', () => {
    const recipients = groupSpeakerBlastRecipients([
      { name: 'Ama', email: 'Ama@example.com', session: session('a') },
      { name: 'Ama', email: 'ama@example.com', session: session('b') },
      { name: 'Kojo', email: 'kojo@example.com', session: session('c') },
    ]);

    expect(recipients).toHaveLength(2);
    expect(recipients[0].sessions).toHaveLength(2);
    for (const intent of ['update', 'slides_reminder'] as const) {
      const emails = recipients.map((recipient) => speakerBlastEmail({ eventName: 'Monthly meetup', subject: 'Update', message: 'Hello <script>', intent, recipient }));

      expect(emails[0].text).toContain('Hi Ama,');
      expect(emails[0].text).toContain('P_a');
      expect(emails[0].text).toContain('P_b');
      expect(emails[0].text).not.toContain('P_c');
      expect(emails[1].text).toContain('Hi Kojo,');
      expect(emails[1].text).not.toContain('P_a');
      expect(emails[0].html).toContain('&lt;script&gt;');
    }
    expect(speakerBlastAudienceMatches(recipients, recipients.slice(0, 1))).toBe(false);
  });

  it('does not allow a private speaker link in the shared body or browser-selected recipients', () => {
    expect(speakerBlastDraftSchema.safeParse({ intent: 'update', subject: 'Hello', message: 'Use https://go.devcongress.org/P_secret' }).success).toBe(false);
    expect(speakerBlastDraftSchema.safeParse({ intent: 'update', subject: 'Hello', message: 'go.devcongress.org/P_secret' }).success).toBe(false);
    expect(speakerBlastDraftSchema.safeParse({ intent: 'update', subject: 'Hello', message: 'Hello', recipients: ['other@example.com'] }).success).toBe(false);
  });

  it('refuses a slides reminder without a working link', () => {
    expect(() => speakerBlastEmail({ eventName: 'Meetup', subject: 'Slides', message: 'Please share', intent: 'slides_reminder', recipient: { name: 'Ama', email: 'ama@example.com', sessions: [{ ...session('a'), url: null }] } })).toThrow();
  });
});
