import { describe, expect, it } from 'vitest';
import { volunteerOutcomeEmailPreview } from './volunteer-follow-up';

describe('volunteer outcome presentation', () => {
  it('preserves saved copy and subject while escaping paragraphs and names', () => {
    const message = 'First <script>alert(1)</script>\nSecond line\n\nLast paragraph';
    const email = volunteerOutcomeEmailPreview({ name: '<Applicant>', decision: 'accepted', subject: 'Saved subject', message });

    expect(email.subject).toBe('Saved subject');
    expect(email.text).toContain(message);
    expect(email.html).toContain('Hi &lt;Applicant&gt;,');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;<br>Second line');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('Welcome to the volunteer team.');
  });

  it('promotes a standalone Google Meet line without losing meeting context', () => {
    const message = 'Our first meeting is Sunday.\nJoin on Google Meet: https://meet.google.com/abc-defg-hij\n\nWarm regards,\nTeam';
    const email = volunteerOutcomeEmailPreview({ name: 'Ama', decision: 'accepted', subject: 'Welcome', message });

    expect(email.html).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(email.html).toContain('Our first meeting is Sunday.');
    expect(email.html).toContain('Warm regards,<br>Team');
    expect(email.html).not.toContain('border-left:');
    expect(email.html).not.toContain("Let's meet");
    expect(email.html).not.toContain('class="email-session-card"');
    expect(email.text).toContain(message);
  });

  it('keeps text order and promotes at most one meeting link', () => {
    const message = 'Before\nhttps://meet.google.com/abc-defg-hij\nAfter\n\nhttps://meet.google.com/xyz-abcd-efg';
    const email = volunteerOutcomeEmailPreview({ name: 'Ama', decision: 'accepted', subject: 'Welcome', message });

    expect(email.html.match(/href="https:\/\/meet.google.com/g)).toHaveLength(1);
    expect(email.html.indexOf('Before')).toBeLessThan(email.html.indexOf('href="https://meet.google.com'));
    expect(email.html.indexOf('After')).toBeGreaterThan(email.html.indexOf('href="https://meet.google.com'));
    expect(email.html).toContain('https://meet.google.com/xyz-abcd-efg');
    expect(email.text).toContain(message);
  });

  it.each([
    'Read https://meet.google.com/abc-defg-hij for details',
    'https://meet.google.com.evil.test/abc-defg-hij',
    'http://meet.google.com/abc-defg-hij',
    'https://meet.google.com/abc-defg-hij?unexpected=true',
    'No meeting link yet.',
  ])('leaves unrecognized meeting text untouched: %s', (message) => {
    const email = volunteerOutcomeEmailPreview({ name: 'Ama', decision: 'accepted', subject: 'Welcome', message });

    expect(email.html).not.toContain('Join on Google Meet</a>');
    expect(email.html).not.toContain('href="https://meet.google.com');
    expect(email.text).toContain(message);
  });

  it('adds the public conference route to non-selection HTML and plain text', () => {
    const email = volunteerOutcomeEmailPreview({ name: 'Ama', decision: 'not_selected' });

    expect(email.html).toContain('Your volunteer application');
    expect(email.html).toContain('href="https://devcongress.org/devcon26/"');
    expect(email.text).toContain('Explore DevCon26: https://devcongress.org/devcon26/');
    expect(email.html).not.toContain('Buy tickets');
    expect(email.html).not.toContain('email-shell');
    expect(email.html).not.toContain('email-brand-pad');
    expect(email.html).toContain('class="letter-logo"');
    expect(email.html).toContain('max-width:544px');
    expect(email.html).toContain('(prefers-color-scheme: dark)');
    expect(email.html).not.toContain('border:2px solid');
    expect(email.html).not.toContain('border-left:');
    expect(email.html).not.toContain('Stay part of');
    expect(email.html).not.toContain('raising your hand');
  });
});
