import { describe, expect, it } from 'vitest';
import {
  DEVCON26_ANNUAL_CFP_PATH,
  DEVCON26_ANNUAL_CFP_REDIRECT_ENABLED_ENV,
  DEVCON26_ANNUAL_CFP_REDIRECT_META_NAME,
  DEVCON26_ANNUAL_CFP_WEBSITE_URL,
  devCon26AnnualCfpRedirectEnabled,
  devCon26AnnualCfpRedirectEnabledFromMeta,
  devCon26AnnualCfpRedirectMetaTag,
  devCon26AnnualCfpRedirectResponse,
  shouldRedirectDevCon26AnnualCfpRoute,
} from './devcon26-annual-cfp-redirect';

describe('DevCon26 annual CFP website redirect', () => {
  it('uses a single exact opt-in and publishes that value for the SPA', () => {
    expect(DEVCON26_ANNUAL_CFP_REDIRECT_ENABLED_ENV).toBe(
      'DEVCON26_ANNUAL_CFP_WEBSITE_REDIRECT_ENABLED',
    );
    expect(devCon26AnnualCfpRedirectEnabled(undefined)).toBe(false);
    expect(devCon26AnnualCfpRedirectEnabled('false')).toBe(false);
    expect(devCon26AnnualCfpRedirectEnabled('TRUE')).toBe(false);
    expect(devCon26AnnualCfpRedirectEnabled('true')).toBe(true);
    expect(devCon26AnnualCfpRedirectMetaTag(true)).toBe(
      `<meta name="${DEVCON26_ANNUAL_CFP_REDIRECT_META_NAME}" content="true" />`,
    );
    expect(devCon26AnnualCfpRedirectEnabledFromMeta('true')).toBe(true);
    expect(devCon26AnnualCfpRedirectEnabledFromMeta('false')).toBe(false);
    expect(devCon26AnnualCfpRedirectEnabledFromMeta(null)).toBe(false);
  });

  it('redirects only exact-path GET and HEAD requests to the fixed website URL', () => {
    for (const method of ['GET', 'HEAD']) {
      const response = devCon26AnnualCfpRedirectResponse(
        new Request(`https://em.devcongress.org${DEVCON26_ANNUAL_CFP_PATH}?token=private&source=email`, { method }),
        true,
      );

      expect(response?.status).toBe(302);
      expect(response?.headers.get('Location')).toBe(DEVCON26_ANNUAL_CFP_WEBSITE_URL);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
    }

    for (const [method, pathname] of [
      ['POST', DEVCON26_ANNUAL_CFP_PATH],
      ['GET', '/speak/c/2025'],
      ['GET', '/speak/c/2026/extra'],
      ['GET', '/speak/m/event-123'],
      ['GET', '/conference-speakers/2026/private-token'],
      ['GET', '/organizer-console/annual-conference/2026/speakers'],
      ['GET', '/api/cfp/conferences/2026'],
    ]) {
      expect(devCon26AnnualCfpRedirectResponse(
        new Request(`https://em.devcongress.org${pathname}`, { method }),
        true,
      )).toBeNull();
    }

    expect(devCon26AnnualCfpRedirectResponse(
      new Request(`https://em.devcongress.org${DEVCON26_ANNUAL_CFP_PATH}`),
      false,
    )).toBeNull();
  });

  it('uses the exact path for client-side navigation too', () => {
    expect(shouldRedirectDevCon26AnnualCfpRoute(DEVCON26_ANNUAL_CFP_PATH, true)).toBe(true);
    expect(shouldRedirectDevCon26AnnualCfpRoute(DEVCON26_ANNUAL_CFP_PATH, false)).toBe(false);
    expect(shouldRedirectDevCon26AnnualCfpRoute('/speak/c/2025', true)).toBe(false);
    expect(shouldRedirectDevCon26AnnualCfpRoute('/conference-speakers/2026/private-token', true)).toBe(false);
  });
});
