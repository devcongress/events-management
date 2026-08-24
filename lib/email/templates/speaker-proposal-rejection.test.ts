import { describe, expect, it } from 'vitest';
import { selectedSpeakerConfirmationEmail } from './monthly-archive-request';
import { speakerProposalRejectionEmail } from './speaker-proposal-rejection';

describe('speaker proposal rejection email', () => {
  it('renders respectful decision copy from the Speakers sender workflow', () => {
    const result = speakerProposalRejectionEmail({
      eventName: 'DevCongress August Meetup',
      speakerName: 'Ama Boateng',
      talkTitle: 'Designing Reliable Systems',
    });

    expect(result.subject).toBe('Update on your presentation proposal for DevCongress August Meetup');
    expect(result.html).toContain('Hi Ama,');
    expect(result.html).toContain('we will not be moving forward with this proposal');
    expect(result.html).toContain('src="https://em.devcongress.org/brand/dev-con-logo.png"');
    expect(result.html).toContain('src="https://em.devcongress.org/brand/speaker-archive-illustration.png"');
    expect(result.html).toContain('alt="DevCongress"');
    expect(result.text).toContain('We appreciate the time and thought you put into it');
  });

  it('uses the same branded wrapper as the selected-speaker email', () => {
    const input = {
      eventName: 'DevCongress August Meetup',
      speakerName: 'Ama Boateng',
      talkTitle: 'Designing Reliable Systems',
    };
    const rejected = speakerProposalRejectionEmail(input).html;
    const selected = selectedSpeakerConfirmationEmail({
      ...input,
      privateUrl: 'https://go.devcongress.org/P_example',
      expiresAt: '2026-08-31T12:00:00.000Z',
    }).html;
    const sharedWrapperFragments = [
      'class="email-canvas"',
      'class="email-shell"',
      'class="email-brand email-brand-pad"',
      'height="5" bgcolor="#E8117F"',
      'class="email-pad email-content"',
      'class="email-session-card"',
      'class="email-pad email-footer"',
      'class="email-signoff"',
    ];

    for (const fragment of sharedWrapperFragments) {
      expect(rejected).toContain(fragment);
      expect(selected).toContain(fragment);
    }
    expect(rejected).not.toContain('class="email-cta"');
    expect(selected).toContain('class="email-cta"');
  });

  it('escapes proposal data in the rendered HTML', () => {
    const result = speakerProposalRejectionEmail({
      eventName: 'DevCongress <Meetup>',
      speakerName: '<img src=x onerror=alert(1)>',
      talkTitle: '<script>alert(1)</script>',
    });

    expect(result.html).not.toContain('<script>alert(1)</script>');
    expect(result.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
