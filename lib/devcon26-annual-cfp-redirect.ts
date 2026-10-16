export const DEVCON26_ANNUAL_CFP_REDIRECT_ENABLED_ENV =
  'DEVCON26_ANNUAL_CFP_WEBSITE_REDIRECT_ENABLED';
export const DEVCON26_ANNUAL_CFP_REDIRECT_META_NAME =
  'devcon26-annual-cfp-website-redirect-enabled';
export const DEVCON26_ANNUAL_CFP_PATH = '/speak/c/2026';
export const DEVCON26_ANNUAL_CFP_WEBSITE_URL =
  'https://devcongress.org/devcon26/speak/';

export function devCon26AnnualCfpRedirectEnabled(value: string | undefined): boolean {
  return value === 'true';
}

export function devCon26AnnualCfpRedirectEnabledFromMeta(
  content: string | null,
): boolean {
  return content === 'true';
}

export function shouldRedirectDevCon26AnnualCfpRoute(
  pathname: string,
  enabled: boolean,
): boolean {
  return enabled && isDevCon26AnnualCfpPathname(pathname);
}

function isDevCon26AnnualCfpPathname(pathname: string): boolean {
  return pathname === DEVCON26_ANNUAL_CFP_PATH
    || pathname === `${DEVCON26_ANNUAL_CFP_PATH}/`;
}

export function devCon26AnnualCfpRedirectResponse(
  request: Pick<Request, 'method' | 'url'>,
  enabled: boolean,
): Response | null {
  if (!enabled || !['GET', 'HEAD'].includes(request.method)) return null;

  const url = new URL(request.url);

  if (!isDevCon26AnnualCfpPathname(url.pathname)) return null;

  return new Response(null, {
    status: 302,
    headers: {
      'Cache-Control': 'no-store',
      Location: DEVCON26_ANNUAL_CFP_WEBSITE_URL,
    },
  });
}

export function devCon26AnnualCfpRedirectMetaTag(enabled: boolean): string {
  return `<meta name="${DEVCON26_ANNUAL_CFP_REDIRECT_META_NAME}" content="${enabled ? 'true' : 'false'}" />`;
}
