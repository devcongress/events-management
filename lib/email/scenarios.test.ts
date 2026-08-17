import { describe, expect, it } from 'vitest';
import { EMAIL_SCENARIOS, EMAIL_SENDERS, EMAIL_SUBJECT_MAX_LENGTH, emailSubjects } from './scenarios';

describe('email scenario policy', () => {
  it('uses stable role-based sender identities without event-series names', () => {
    expect(EMAIL_SENDERS.events.from).toBe('DevCongress Events <events@updates.devcongress.org>');
    expect(EMAIL_SENDERS.speakers.from).toBe('DevCongress Speakers <speakers@updates.devcongress.org>');
    expect(Object.values(EMAIL_SENDERS).map((sender) => sender.from).join(' ')).not.toMatch(/monthly|meetup|conference/i);
  });

  it('keeps scenario ids unique and assigns every scenario to a known sender', () => {
    const ids = EMAIL_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(EMAIL_SCENARIOS.every((scenario) => EMAIL_SENDERS[scenario.sender])).toBe(true);
  });

  it('generates the active transactional subjects from the shared policy', () => {
    expect(emailSubjects.registrationConfirmed('DevCongress August Meetup')).toBe('You are registered for DevCongress August Meetup');
    expect(emailSubjects.registrationWaitlisted('DevCongress August Meetup')).toBe('You are on the waitlist for DevCongress August Meetup');
    expect(emailSubjects.registrationPromoted('DevCongress August Meetup')).toBe('A place opened up for DevCongress August Meetup');
    expect(emailSubjects.speakerArchiveRequest('DevCongress August Meetup')).toBe('Share your talk resources: DevCongress August Meetup');
    expect(emailSubjects.communitySubmissionReceipt('Accra Systems Night')).toBe('We received your event submission: Accra Systems Night');
    expect(emailSubjects.communitySubmissionApproved('Accra Systems Night')).toBe('Your event is now listed: Accra Systems Night');
    expect(emailSubjects.communitySubmissionRejected('Accra Systems Night')).toBe('Update on your event submission: Accra Systems Night');
    expect(emailSubjects.communitySubmissionWithdrawn('Accra Systems Night')).toBe('Your event listing was removed: Accra Systems Night');
    expect(EMAIL_SCENARIOS.filter((scenario) => scenario.id.startsWith('community_submission_')).every((scenario) => scenario.status === 'active')).toBe(true);
  });

  it('puts the test marker at the front of event-related subjects', () => {
    expect(emailSubjects.registrationConfirmed('[TEST] Community workshop'))
      .toBe('[TEST] You are registered for Community workshop');
    expect(emailSubjects.communitySubmissionReceipt('[TEST] Community workshop'))
      .toBe('[TEST] We received your event submission: Community workshop');
    expect(emailSubjects.communitySubmissionApproved('[TEST] Community workshop'))
      .toBe('[TEST] Your event is now listed: Community workshop');
    expect(emailSubjects.communitySubmissionRejected('[TEST] Community workshop'))
      .toBe('[TEST] Update on your event submission: Community workshop');
    expect(emailSubjects.communitySubmissionWithdrawn('[TEST] Community workshop'))
      .toBe('[TEST] Your event listing was removed: Community workshop');
  });

  it('normalizes header controls and bounds every generated subject', () => {
    const subject = emailSubjects.communitySubmissionRejected(`Test event\r\nBcc: attacker@example.com ${'x'.repeat(220)}`);
    expect(subject).not.toMatch(/[\r\n]/);
    expect(Array.from(subject)).toHaveLength(EMAIL_SUBJECT_MAX_LENGTH);
    expect(subject.endsWith('…')).toBe(true);
  });
});
