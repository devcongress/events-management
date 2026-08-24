import { describe, expect, it } from 'vitest';
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
    expect(result.text).toContain('We appreciate the time and thought you put into it');
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
