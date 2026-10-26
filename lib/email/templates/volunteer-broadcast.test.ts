import { describe, expect, it } from 'vitest';

import { volunteerBroadcastEmail } from './volunteer-broadcast';

describe('volunteer broadcast email', () => {
  it('escapes organizer copy and states the selected-volunteer reason truthfully', () => {
    const email = volunteerBroadcastEmail({
      subject: 'Orientation <update>',
      body: 'Hello team,\n\nBring <nothing> but your questions.',
      unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
    });

    expect(email.subject).toBe('Orientation <update>');
    expect(email.html).toContain('Orientation &lt;update&gt;');
    expect(email.html).toContain('Bring &lt;nothing&gt; but your questions.');
    expect(email.html).toContain('selected for the DevCon26 volunteer team');
    expect(email.html).not.toContain('because you registered');
    expect(email.html).toContain('RESEND_UNSUBSCRIBE_URL');
    expect(email.text).toContain('Bring <nothing> but your questions.');
    expect(email.text).toContain('Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}');
  });
});
