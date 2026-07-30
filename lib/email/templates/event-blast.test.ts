import { describe, expect, it } from 'vitest';
import { eventBlastEmail } from './event-blast';

describe('event blast email template', () => {
  it('uses the same escaped message in HTML and text output', () => {
    const content = eventBlastEmail({
      subject: 'Venue <update>',
      body: 'Hi team,\nBring <nothing>.',
      unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
    });

    expect(content.html).toContain('Venue &lt;update&gt;');
    expect(content.html).toContain('Bring &lt;nothing&gt;.');
    expect(content.html).toContain('Hi team,<br>Bring');
    expect(content.html).toContain('RESEND_UNSUBSCRIBE_URL');
    expect(content.text).toContain('Venue <update>');
    expect(content.text).toContain('Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}');
  });
});
