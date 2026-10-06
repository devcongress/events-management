import { describe, expect, it } from 'vitest';
import { annualConferenceTicketEmailDeliveryConfiguration } from '@/lib/annual-conference-ticket-email-delivery';

describe('annual conference ticket email delivery policy', () => {
  it('stays disabled without all explicit Resend delivery settings', () => {
    expect(annualConferenceTicketEmailDeliveryConfiguration({ RESEND_API_KEY: 're_test' }).enabled).toBe(false);
    expect(annualConferenceTicketEmailDeliveryConfiguration({
      DEVCON26_TICKET_EMAILS_ENABLED: 'true',
      RESEND_API_KEY: 're_test',
      DEVCON26_TICKET_EMAIL_FROM: 'DevCongress <tickets@example.test>',
      DEVCON26_TICKET_EMAIL_REPLY_TO: 'tickets@example.test',
    }).enabled).toBe(true);
  });
});
