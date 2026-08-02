import { describe, expect, it } from 'vitest';
import { communityEventSubmissionEmail } from './community-event-submission';

const base = {
  organizerName: 'Community Builders Ghana',
  eventTitle: 'Systems & <Safety>',
  startsAt: '2026-12-04T18:00:00.000Z',
  timezone: 'Africa/Accra',
  communityCalendarUrl: 'https://devcongress.org/events/',
  submissionUrl: 'https://devcongress.org/events/submit/',
  registrationUrl: 'https://example.com/register',
};

describe('community event submission email', () => {
  it('builds a receipt without exposing a status lookup', () => {
    const email = communityEventSubmissionEmail({ ...base, kind: 'receipt' });

    expect(email.subject).toBe('We received your event submission: Systems & <Safety>');
    expect(email.text).toContain('organizer review queue');
    expect(email.html).toContain('Systems &amp; &lt;Safety&gt;');
    expect(email.text).not.toContain('/status/');
  });

  it('builds a published approval notice using the community calendar', () => {
    const email = communityEventSubmissionEmail({ ...base, kind: 'approved' });

    expect(email.subject).toBe('Your event is now listed: Systems & <Safety>');
    expect(email.text).toContain('approved and published');
    expect(email.text).toContain('https://example.com/register');
    expect(email.text).toContain('does not transfer ownership');
  });

  it('includes organizer-facing rejection copy and never accepts an internal note', () => {
    const email = communityEventSubmissionEmail({
      ...base,
      kind: 'rejected',
      rejectionCategory: 'insufficient_information',
      organizerMessage: 'Please add a public agenda before resubmitting. <Thanks>',
    });

    expect(email.subject).toBe('Update on your event submission: Systems & <Safety>');
    expect(email.text).toContain('insufficient or could not be verified');
    expect(email.text).toContain('Please add a public agenda');
    expect(email.html).toContain('&lt;Thanks&gt;');
    expect(email).not.toHaveProperty('internalNote');
  });
});
