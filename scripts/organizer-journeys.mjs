import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

// Serve only built static assets: no application server, credentials, or database.
const origin = 'http://127.0.0.1:4189';
const artifacts = 'artifacts/organizer-journeys';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4189', '--strictPort'], { stdio: 'pipe' });
let serverLog = '';

server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });
const event = { id: 'fixture-event', name: 'Fixture Meetup', event_date: '2026-09-26T09:00:00Z', timezone: 'Africa/Accra', status: 'upcoming', schedule: [], registration_url: null };
const edition = { id: 'fixture-edition', year: 2026, label: 'December 2026', provisional_date: '2026-12-19', status: 'planning' };
const workspace = { edition, phases: [], tasks: [], summary: {}, permissions: { access_scope: 'assigned', capabilities: [], can_create_tasks: false, can_manage_phases: false, can_edit_all_tasks: false, can_edit_assigned_tasks: false, can_update_assigned_task_status: true } };
const results = [];
let browser;

async function journey(name, run, { role = 'organizer', date = '2026-09-26T12:00:00Z' } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Africa/Accra', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  const responses = new Map();

  page.on('pageerror', error => errors.push(error.message));
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  await page.clock.setFixedTime(new Date(date));
  await page.addInitScript(() => {
    window.turnstile = {
      render: (_element, options) => { queueMicrotask(() => options.callback('fixture-token'));

 return 'fixture-widget'; },
      reset: () => {}, remove: () => {},
    };
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    requests.push({ path: url.pathname, method: request.method(), body: request.postData() });
    let body;
    let status = 200;
    const custom = responses.get(url.pathname);

    if (custom) {
      ({ body, status = 200 } = typeof custom === 'function' ? custom(request) : custom);
    } else if (url.pathname === '/api/auth/session') {
      body = { authenticated: true, auth_configured: true, user: { email: 'fixture@example.com', display_name: 'Fixture User', role } };
    } else if (url.pathname === '/api/events') body = [event];
    else if (url.pathname === '/api/events/fixture-event') body = event;
    else if (url.pathname.endsWith('/work-plan')) body = workspace;
    else if (url.pathname === '/api/public/email-preflight') body = { accepted: true, status: 'deliverable', normalized_email: 'fixture@example.com' };
    else {
      errors.push(`Unmocked API: ${request.method()} ${url.pathname}`);

      return route.fulfill({ status: 500, json: { error: 'Unmocked fixture endpoint' } });
    }
    await route.fulfill({ status, json: body });
  });
  const started = Date.now();

  page.setDefaultTimeout(8000);
  try {
    await run({ page, responses, requests });
    assert.deepEqual(errors, []);
    results.push({ name, status: 'passed', durationMs: Date.now() - started });
    await context.tracing.stop();
  } catch (error) {
    results.push({ name, status: 'failed', error: String(error), errors, requests, durationMs: Date.now() - started });
    await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true }).catch(() => {});
    await context.tracing.stop({ path: `${artifacts}/${name}.zip` });
  } finally {
    await context.close();
  }
}

try {
  await mkdir(artifacts, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* Startup only. */ }
    if (attempt >= 40 || server.exitCode !== null) throw new Error(`Preview failed: ${serverLog}`);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.launch();
  await journey('filtered-navigation', async ({ page, responses }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const tasks = [
      { id: 'alice-old', title: 'Alice earlier task', accountable_owner: 'Alice', phase_id: 'old' },
      { id: 'alice-current', title: 'Alice current task', accountable_owner: 'Alice', phase_id: 'current' },
      { id: 'bob-current', title: 'Bob current task', accountable_owner: 'Bob', phase_id: 'current' },
    ].map(task => ({ ...task, edition_id: edition.id, details: null, internal_note: null, workstream: 'venue_production_logistics', collaborators: [], priority: 'medium', target_date: '2026-09-30', status: 'not_started', dependency_task_ids: [], dependency_note: null, source: 'manual', sort_order: 1 }));

    responses.set('/api/annual-conference/2026/work-plan', { body: { ...workspace, tasks, phases: [
      { id: 'old', name: 'Earlier phase', label: 'Earlier phase', starts_on: '2026-08-01', ends_on: '2026-08-31', sort_order: 1 },
      { id: 'current', name: 'Current phase', label: 'Current phase', starts_on: '2026-09-01', ends_on: '2026-09-30', sort_order: 2 },
    ], permissions: { ...workspace.permissions, access_scope: 'all' } } });
    responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
    responses.set('/api/admin/organizers', { body: { organizers: [] } });
    await page.goto(`${origin}/organizer-console/annual-conference/2026`);
    await page.getByRole('link').filter({ hasText: 'Alice' }).filter({ hasText: 'View tasks' }).click();
    await page.waitForURL(url => url.searchParams.get('owner') === 'Alice');
    await page.getByText('Alice earlier task', { exact: true }).waitFor();
    await page.getByText('Alice current task', { exact: true }).waitFor();
    assert.equal(await page.getByText('Bob current task', { exact: true }).count(), 0);
    await page.goto(`${origin}/organizer-console/annual-conference/2026/work-plan`);
    await page.getByText('Bob current task', { exact: true }).waitFor();
    assert.equal(await page.getByText('Alice earlier task', { exact: true }).count(), 0);
  });
  await journey('project-night-recurrence', async ({ page, responses, requests }) => {
    const projectNight = { ...event, name: 'Project Night', event_date: '2026-09-17T18:30:00Z', end_date: '2026-09-17T21:00:00Z', ownership: 'external', publication_status: 'published', location: { name: 'Accra' } };
    let recurrence = null;

    responses.set('/api/events/fixture-event', { body: projectNight });
    responses.set('/api/events/fixture-event/registrations', { body: { managed_internally: false, registrations: [] } });
    responses.set('/api/events/fixture-event/speaker-submissions', { body: { submissions: [] } });
    responses.set('/api/events/fixture-event/slack-announcement', { body: { announcement: null, eligible: true, website: { state: 'published', url: '' }, slack_url: null } });
    responses.set('/api/events/fixture-event/page-monitor', { body: { monitor: null, eligible: false, organizer_contact: null } });
    responses.set('/api/events/fixture-event/recurrence', request => {
      if (request.method() === 'POST') {
        const { action } = JSON.parse(request.postData());

        recurrence = { source_event_id: event.id, enabled: action !== 'pause', next_date: action === 'skip' ? '2026-10-01' : '2026-09-24', cover_url: '/fixture.jpg' };
      }

      return { body: { recurrence } };
    });
    await page.goto(`${origin}/organizer-console/events/fixture-event/community`);
    const panel = page.getByRole('region', { name: 'Project Night recurrence' });

    await panel.getByRole('button', { name: 'ENABLE RECURRENCE', exact: true }).click();
    await panel.getByText('ENABLED', { exact: true }).waitFor();
    await panel.getByRole('button', { name: 'SKIP NEXT WEEK' }).click();
    await panel.getByRole('button', { name: 'Yes, skip this week' }).click();
    await panel.getByText('Thu, 1 Oct 2026', { exact: true }).waitFor();
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: `${artifacts}/project-night-mobile.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/organizer-console/events/fixture-event/community`);
    await panel.getByRole('button', { name: 'PAUSE RECURRENCE' }).waitFor();
    await panel.screenshot({ path: `${artifacts}/project-night-desktop.png` });
    await panel.getByRole('button', { name: 'PAUSE RECURRENCE' }).click();
    await panel.getByText('PAUSED', { exact: true }).waitFor();
    assert.deepEqual(requests.filter(request => request.path.endsWith('/recurrence') && request.method === 'POST').map(request => JSON.parse(request.body).action), ['enable', 'skip', 'pause']);
  });
  await journey('volunteer-permissions', async ({ page, requests }) => {
    await page.goto(`${origin}/organizer-console/mobile/annual-conference/2026`);
    await page.getByText('No tasks assigned yet', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'New edition', exact: true }).count(), 0);
    assert.equal(requests.some(request => request.path === '/api/events' || request.path.endsWith('/editions')), false);
  }, { role: 'volunteer' });

  await journey('volunteer-intake', async ({ page, responses, requests }) => {
    responses.set('/api/volunteer-applications', { body: { ok: true } });
    await page.goto(`${origin}/volunteer`);
    await page.getByLabel('Full name', { exact: true }).fill('Fixture Volunteer');
    await page.getByLabel('Email address', { exact: true }).fill('fixture@example.com');
    await page.getByRole('button', { name: 'Join the volunteer list', exact: true }).click();
    await page.getByRole('heading', { name: 'Thanks, Fixture Volunteer.' }).waitFor();
    const submissions = requests.filter(request => request.path === '/api/volunteer-applications');

    assert.equal(submissions.length, 1);
    assert.equal(JSON.parse(submissions[0].body).name, 'Fixture Volunteer');
  });

  await journey('provider-recovery', async ({ page, responses }) => {
    responses.set('/api/public/email-preflight', { status: 503, body: { error: 'Email service unavailable. Try again.' } });
    responses.set('/api/volunteer-applications', { body: { ok: true } });
    await page.goto(`${origin}/volunteer`);
    await page.getByLabel('Full name', { exact: true }).fill('Fixture Volunteer');
    await page.getByLabel('Email address', { exact: true }).fill('fixture@example.com');
    await page.getByRole('button', { name: 'Join the volunteer list', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Email service unavailable' }).waitFor();
    assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), 'Fixture Volunteer');
    responses.delete('/api/public/email-preflight');
    await page.getByRole('button', { name: 'Join the volunteer list', exact: true }).click();
    await page.getByRole('heading', { name: 'Thanks, Fixture Volunteer.' }).waitFor();
  });

  for (const [name, date, allowed] of [
    ['check-in-before', '2026-09-25T12:00:00Z', false],
    ['check-in-day', '2026-09-26T12:00:00Z', true],
    ['check-in-after', '2026-09-27T12:00:00Z', false],
  ]) {
    await journey(name, async ({ page, responses, requests }) => {
      let checked = false;

      responses.set('/api/events/fixture-event/registrations', () => ({ body: { managed_internally: true, registrations: [{ id: 'guest', name: 'Fixture Guest', email: 'guest@example.com', status: 'confirmed', checked_in_at: checked ? date : null }] } }));
      responses.set('/api/events/fixture-event/registrations/guest/check-in', () => { checked = true;

 return { body: { checked_in_at: date } }; });
      await page.goto(`${origin}/organizer-console/mobile/events/fixture-event/check-in`);
      const button = page.getByRole('button', { name: 'Check in', exact: true });

      await button.waitFor();
      assert.equal(await button.isEnabled(), allowed);
      if (allowed) {
        await button.click();
        await page.getByText('Checked in', { exact: true }).waitFor();
        assert.equal(requests.filter(request => request.method === 'POST').length, 1);
      } else assert.equal(requests.some(request => request.method === 'POST'), false);
    }, { date });
  }
} finally {
  await browser?.close();
  server.kill();
  await writeFile(`${artifacts}/results.json`, JSON.stringify(results, null, 2));
  await writeFile(`${artifacts}/server.log`, serverLog);
}
console.log(JSON.stringify(results, null, 2));
if (!results.length || results.some(result => result.status !== 'passed')) process.exitCode = 1;
