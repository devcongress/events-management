export type SecurityCheckStatus = 'pass' | 'fail' | 'skip';

export type SecurityCheck = {
  id: string;
  status: SecurityCheckStatus;
  detail: string;
};

export type SecurityScanReport = {
  target: string;
  mode: 'deployed-verification' | 'staging-dast';
  active: boolean;
  generated_at: string;
  checks: SecurityCheck[];
  summary: Record<SecurityCheckStatus, number>;
};

export const PRODUCTION_HOSTNAMES = new Set([
  'em.devcongress.org',
  'events-management.admins-a7d.workers.dev',
  'events-management.pages.dev',
  'devcongress.org',
  'www.devcongress.org',
]);

const REQUIRED_SECURITY_HEADERS: Array<[string, string, string?]> = [
  ['strict-transport-security', 'max-age=63072000'],
  ['content-security-policy', "frame-ancestors 'none'"],
  ['content-security-policy', 'https://player.vimeo.com', 'media-frame-origins'],
  ['cross-origin-opener-policy', 'same-origin'],
  ['permissions-policy', 'camera=()'],
  ['referrer-policy', 'strict-origin-when-cross-origin'],
  ['x-content-type-options', 'nosniff'],
  ['x-frame-options', 'DENY'],
  ['x-permitted-cross-domain-policies', 'none'],
];

function normalizedBaseUrl(value: string): URL {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

export function assertSafeStagingTarget(rawTarget: string, confirmation: string | undefined): URL {
  const target = normalizedBaseUrl(rawTarget);
  const hostname = target.hostname.toLowerCase();
  const local = hostname === 'localhost' || hostname === '127.0.0.1';

  if (PRODUCTION_HOSTNAMES.has(hostname)) {
    throw new Error(`Refusing to run staging DAST against production hostname ${hostname}.`);
  }
  if (!local && target.protocol !== 'https:') {
    throw new Error('Staging DAST requires HTTPS unless the target is localhost.');
  }
  if (confirmation !== hostname) {
    throw new Error(`Set DAST_CONFIRM_NON_PRODUCTION=${hostname} after confirming this deployment uses non-production data and secrets.`);
  }
  return target;
}

function check(id: string, condition: boolean, pass: string, fail: string): SecurityCheck {
  return { id, status: condition ? 'pass' : 'fail', detail: condition ? pass : fail };
}

async function request(target: URL, path: string, init?: RequestInit): Promise<Response> {
  return fetch(new URL(path, `${target.origin}${target.pathname}/`), {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
}

function securityHeaderChecks(response: Response, label: string): SecurityCheck[] {
  return REQUIRED_SECURITY_HEADERS.map(([name, expected, qualifier]) => {
    const actual = response.headers.get(name);
    return check(
      `header:${label}:${name}${qualifier ? `:${qualifier}` : ''}`,
      actual?.toLowerCase().includes(expected.toLowerCase()) === true,
      `${label} sends ${name}.`,
      `${label} expected ${name} containing ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}.`,
    );
  });
}

export async function runPassiveDeploymentChecks(target: URL, expectedAppOrigin = target.origin): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];
  const root = await request(target, '/');
  checks.push(check('root:status', root.status === 200, 'Root returned 200.', `Root returned ${root.status}.`));
  checks.push(...securityHeaderChecks(root, 'root'));

  const health = await request(target, '/api/health');
  checks.push(check('health:status', health.status === 200, 'Health returned 200.', `Health returned ${health.status}.`));
  checks.push(...securityHeaderChecks(health, 'health'));
  checks.push(check(
    'private-api:cache-control',
    health.headers.get('cache-control')?.toLowerCase().includes('no-store') === true,
    'Private API responses default to Cache-Control: no-store.',
    `Private API Cache-Control was ${JSON.stringify(health.headers.get('cache-control'))}.`,
  ));
  checks.push(check(
    'api:request-id',
    Boolean(health.headers.get('x-request-id')),
    'API responses carry a request ID.',
    'API response did not carry X-Request-ID.',
  ));

  const session = await request(target, '/api/auth/session');
  checks.push(check('session:status', session.status === 200, 'Anonymous session probe returned 200.', `Anonymous session probe returned ${session.status}.`));
  checks.push(check(
    'session:cache-control',
    session.headers.get('cache-control')?.toLowerCase().includes('no-store') === true,
    'Session responses are non-cacheable.',
    `Session Cache-Control was ${JSON.stringify(session.headers.get('cache-control'))}.`,
  ));

  const protectedRoute = await request(target, '/api/admin/organizers');
  checks.push(check(
    'auth:protected-route',
    protectedRoute.status === 401,
    'Unauthenticated protected API request returned 401.',
    `Unauthenticated protected API request returned ${protectedRoute.status}.`,
  ));

  const publicApi = await request(target, '/api/public/meetups', {
    headers: { Origin: 'https://security-probe.invalid' },
  });
  checks.push(check('public-api:status', publicApi.status === 200, 'Public meetups returned 200.', `Public meetups returned ${publicApi.status}.`));
  checks.push(check(
    'public-api:cors',
    publicApi.headers.get('access-control-allow-origin') === '*',
    'Public read API deliberately allows cross-origin reads.',
    `Public API Access-Control-Allow-Origin was ${JSON.stringify(publicApi.headers.get('access-control-allow-origin'))}.`,
  ));
  checks.push(check(
    'public-api:cache-control',
    publicApi.headers.get('cache-control')?.toLowerCase().includes('public') === true,
    'Public meetups uses its explicit public cache policy.',
    `Public meetups Cache-Control was ${JSON.stringify(publicApi.headers.get('cache-control'))}.`,
  ));

  const allowedPreflight = await request(target, '/api/auth/session', {
    method: 'OPTIONS',
    headers: {
      Origin: expectedAppOrigin,
      'Access-Control-Request-Method': 'GET',
    },
  });
  checks.push(check(
    'cors:allowed-origin',
    allowedPreflight.status === 204
      && allowedPreflight.headers.get('access-control-allow-origin') === expectedAppOrigin
      && allowedPreflight.headers.get('access-control-allow-credentials') === 'true',
    `Credentialed CORS accepts the expected app origin ${expectedAppOrigin}.`,
    `Expected credentialed CORS for ${expectedAppOrigin}; received status ${allowedPreflight.status} and origin ${JSON.stringify(allowedPreflight.headers.get('access-control-allow-origin'))}.`,
  ));

  for (const untrustedOrigin of ['https://security-probe.invalid', 'http://localhost:5173']) {
    const rejectedPreflight = await request(target, '/api/auth/session', {
      method: 'OPTIONS',
      headers: {
        Origin: untrustedOrigin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    checks.push(check(
      `cors:reject:${new URL(untrustedOrigin).hostname}`,
      !rejectedPreflight.headers.has('access-control-allow-origin'),
      `Credentialed CORS rejects ${untrustedOrigin}.`,
      `Credentialed CORS unexpectedly allowed ${untrustedOrigin}.`,
    ));
  }

  return checks;
}

export async function runActiveStagingChecks(target: URL): Promise<SecurityCheck[]> {
  const checks: SecurityCheck[] = [];
  const oversizedJoin = await request(target, '/api/quiz/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: target.origin },
    body: JSON.stringify({ join_code: 'ABC234', device_id: crypto.randomUUID(), padding: 'x'.repeat(70 * 1024) }),
  });
  checks.push(check(
    'active:quiz-body-limit',
    oversizedJoin.status === 413,
    'Oversized quiz join was rejected with 413 before route processing.',
    `Oversized quiz join returned ${oversizedJoin.status}; expected 413.`,
  ));

  const malformedJoin = await request(target, '/api/quiz/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: target.origin },
    body: '{',
  });
  checks.push(check(
    'active:malformed-json',
    malformedJoin.status === 400,
    'Malformed public JSON was rejected with 400.',
    `Malformed public JSON returned ${malformedJoin.status}; expected 400.`,
  ));

  const invalidSubmission = await request(target, '/api/public/event-submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: target.origin },
    body: '{}',
  });
  checks.push(check(
    'active:submission-validation',
    invalidSubmission.status === 400,
    'Invalid event submission was rejected before Turnstile or persistence.',
    `Invalid event submission returned ${invalidSubmission.status}; expected 400.`,
  ));

  const unauthenticatedWrite = await request(target, '/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: target.origin },
    body: '{}',
  });
  checks.push(check(
    'active:unauthenticated-write',
    unauthenticatedWrite.status === 401,
    'Unauthenticated event mutation was denied before persistence.',
    `Unauthenticated event mutation returned ${unauthenticatedWrite.status}; expected 401.`,
  ));

  return checks;
}

export function createReport(
  target: URL,
  mode: SecurityScanReport['mode'],
  active: boolean,
  checks: SecurityCheck[],
): SecurityScanReport {
  return {
    target: target.origin,
    mode,
    active,
    generated_at: new Date().toISOString(),
    checks,
    summary: {
      pass: checks.filter((item) => item.status === 'pass').length,
      fail: checks.filter((item) => item.status === 'fail').length,
      skip: checks.filter((item) => item.status === 'skip').length,
    },
  };
}

export function printReport(report: SecurityScanReport): void {
  console.log(JSON.stringify(report, null, 2));
  if (report.summary.fail > 0) process.exitCode = 1;
}

export function deployedTarget(rawTarget: string): URL {
  const target = normalizedBaseUrl(rawTarget);
  if (target.protocol !== 'https:') throw new Error('Deployed verification requires HTTPS.');
  return target;
}
