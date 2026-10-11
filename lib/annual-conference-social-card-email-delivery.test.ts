import { describe, expect, it } from 'vitest';
import {
  annualConferenceSocialCardEmailDeliveryConfiguration,
  annualConferenceSocialCardManagementUrl,
} from './annual-conference-social-card-email-delivery';

describe('annual conference social-card email delivery policy', () => {
  it('stays inert unless its dedicated sender settings are explicitly complete', () => {
    expect(annualConferenceSocialCardEmailDeliveryConfiguration({ RESEND_API_KEY: 're_test' }).enabled).toBe(false);
    expect(annualConferenceSocialCardEmailDeliveryConfiguration({
      RESEND_API_KEY: 're_test',
      DEVCON26_SOCIAL_CARD_EMAILS_ENABLED: 'true',
      DEVCON26_SOCIAL_CARD_EMAIL_FROM: 'DevCongress <social@example.test>',
      DEVCON26_SOCIAL_CARD_EMAIL_REPLY_TO: 'social@example.test',
    })).toMatchObject({ enabled: true, apiKey: 're_test' });
  });

  it('uses the website-owned fragment capability URL', () => {
    expect(annualConferenceSocialCardManagementUrl('capability-value'))
      .toBe('https://devcongress.org/devcon26/social-card/#capability-value');
  });
});
