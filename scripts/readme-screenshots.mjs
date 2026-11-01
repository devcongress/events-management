import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  annualConferenceCapabilities,
  annualConferenceTasksForMember,
} from '../lib/annual-conference-access.ts';

// Real built UI, synthetic API responses, no application server or credentials.
const origin = 'http://127.0.0.1:4195';
const output = 'docs/images/readme';
const timestamp = '2026-11-01T10:00:00Z';
const organizer = { email: 'ama@example.com', display_name: 'Ama Mensah', role: 'organizer' };
const volunteer = { email: 'kwesi@example.com', display_name: 'Kwesi Asare', role: 'volunteer' };
const members = [organizer, volunteer, { email: 'abena@example.com', display_name: 'Abena Owusu', role: 'organizer' }];
const edition = {
  id: 'demo-edition', year: 2026, name: 'DevCongress Annual Conference', label: 'December 2026',
  provisional_date: '2026-12-19', status: 'planning', task_creator_email: 'planning@example.com',
};
const phases = [{
  id: 'preparation', edition_id: edition.id, name: 'Programme & preparation',
  starts_on: '2026-10-15', ends_on: '2026-11-30', sort_order: 0,
}];
const tasks = [
  ['Confirm the session programme', 'programme_speakers', 'in_progress', 'ama@example.com', '2026-11-12'],
  ['Prepare the welcome desk', 'venue_production_logistics', 'not_started', 'kwesi@example.com', '2026-11-20'],
  ['Walk through the venue setup', 'venue_production_logistics', 'in_progress', 'kwesi@example.com', '2026-11-18'],
  ['Publish the community announcement', 'creative_marketing', 'done', 'abena@example.com', '2026-10-28'],
  ['Confirm workshop equipment', 'venue_production_logistics', 'blocked', 'ama@example.com', '2026-11-10'],
  ['Prepare volunteer briefing notes', 'volunteers', 'done', 'kwesi@example.com', '2026-10-30'],
  ['Coordinate speaker arrival times', 'programme_speakers', 'not_started', 'abena@example.com', '2026-11-25'],
  ['Review the event-day checklist', 'venue_production_logistics', 'in_progress', 'ama@example.com', '2026-11-15'],
].map(([title, workstream, status, accountable_owner, target_date], index) => ({
  id: `task-${index}`, edition_id: edition.id, title, workstream, status, accountable_owner, target_date,
  details: 'Review the checklist with your team, confirm the materials needed, and update the task status when ready.',
  internal_note: null, collaborators: [], phase_id: phases[0].id, priority: index === 4 ? 'high' : 'medium',
  dependency_task_ids: [], dependency_note: null, source: 'manual', sort_order: index,
  created_at: timestamp, updated_at: timestamp,
}));
const events = [
  ['november-meetup', 'Building software that lasts', '2026-11-28T10:00:00Z', 'upcoming', 'monthly', 'Practical talks, live demos, and conversations with the local developer community.'],
  ['project-night', 'Project Night', '2026-11-05T18:00:00Z', 'upcoming', 'special', 'Bring what you are building. Share progress, find collaborators, and learn together.'],
  ['october-meetup', 'From idea to production', '2026-10-31T10:00:00Z', 'completed', 'monthly', 'An afternoon of shipping stories, system design, and community learning.'],
].map(([id, name, event_date, status, series_type, description]) => ({
  id, name, event_date, end_date: event_date.replace('10:00', '14:00').replace('18:00', '21:00'),
  status, series_type, description, format: 'meetup', timezone: 'Africa/Accra',
  ownership: 'native', publication_status: 'published', publish_to_website: true,
  location: { name: 'Community Hub, Accra', url: null }, schedule: [],
  cover: null, cover_url: null, registration_url: null, created_at: timestamp, updated_at: timestamp,
}));
const questions = [
  ['rating', 'Building reliable services'], ['rating', 'System design together'],
  ['yes_no', 'Would you attend another meetup like this?'], ['text', 'Other comments'],
].map(([type, label], index) => ({ id: `question-${index}`, type, label, required: type === 'rating', options: [], order_index: index }));
const submissions = Array.from({ length: 24 }, (_, index) => ({
  id: `response-${index}`, event_id: events[2].id, campaign_id: 'feedback-demo', created_at: timestamp,
  answers: questions.map((question, questionIndex) => ({
    question_id: question.id,
    value: questionIndex < 2 ? (index % 9 === 0 ? 'not_attended' : index % 4 === 0 ? 4 : 5)
      : questionIndex === 2 ? index !== 4
        : index < 3 ? ['The live examples made the ideas click.', 'More time for questions next month, please.', 'Loved meeting other builders.'][index] : null,
  })),
}));
const registrations = ['Akosua Boateng', 'Daniel Addo', 'Efua Osei', 'Kofi Adjei', 'Nana Owusu', 'Yaw Mensah']
  .map((name, index) => ({
    id: `guest-${index}`, campaign_id: 'registration-demo', name, email: `guest${index + 1}@example.com`,
    status: 'confirmed', confirmed_at: timestamp, checked_in_at: null, cancelled_at: null,
    email_status: 'accepted', created_at: timestamp, updated_at: timestamp,
  }));
const campaign = {
  id: 'registration-demo', event_id: events[0].id, status: 'open', description: 'Come learn and build with the community.',
  capacity: 80, blast_transactional_reserve: null, opens_at: null, closes_at: null, waitlist_enabled: true,
  auto_confirm: true, created_at: timestamp, updated_at: timestamp,
};

function responseFor(path, actor) {
  const permissions = annualConferenceCapabilities(actor, edition);

  if (path === '/api/auth/session') return { authenticated: true, auth_configured: true, user: actor };
  if (path === '/api/events') return events;
  if (path === '/api/annual-conference/editions') return { editions: [edition] };
  if (path === '/api/annual-conference/2026/work-plan') {
    return { edition, phases, tasks: annualConferenceTasksForMember(tasks, actor, permissions.capabilities), permissions, summary: {} };
  }
  if (path === '/api/annual-conference/2026/task-members' || path === '/api/admin/organizers') {
    return { organizers: members.map((member, index) => ({ ...member, id: `member-${index}`, status: 'active' })) };
  }
  const event = events.find((item) => path === `/api/events/${item.id}`);

  if (event) return event;
  if (path.endsWith('/checklist')) return { event_status: 'upcoming', progress: { completed: 0, total: 0, percent: 0 }, items: [] };
  if (path === `/api/events/${events[0].id}/registrations`) {
    return {
      managed_internally: true, event: events[0], campaign, registrations,
      summary: { total: 6, confirmed: 6, waitlisted: 0, checked_in: 0, available: 74, pending_emails: 0 },
      public_url: 'https://example.com/register',
    };
  }
  if (path.endsWith('/blasts')) return { blasts: [], capacity: { known: false, can_send_now: false, reason: 'capacity_unknown' } };
  if (path === `/api/events/${events[2].id}/feedback-campaign`) {
    return {
      event: events[2], campaign: { id: 'feedback-demo', event_id: events[2].id, title: 'How was the meetup?',
        intro: 'Help shape the next one.', status: 'closed', questions, auto_open_on_event_completion: true,
        opens_at: timestamp, closes_at: timestamp, created_at: timestamp, updated_at: timestamp },
      submissions, talks: [], public_url: 'https://example.com/feedback',
      feedback_window: { opens_at: timestamp, closes_at: timestamp }, is_open: false,
    };
  }

  throw new Error(`Missing screenshot fixture: ${path}`);
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4195', '--strictPort'], { stdio: 'pipe' });
let serverLog = '';
let browser;
const captures = [];

server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });

async function capture(name, actor, path, readyText, options = {}) {
  const context = await browser.newContext({ viewport: options.mobile ? { width: 390, height: 844 } : { width: 1440, height: options.height ?? 960 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];

  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date(timestamp));
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (request.method() === 'POST' && url.pathname === '/api/admin/short-links/ensure') {
      return route.fulfill({ json: { url: 'https://example.com/register' } });
    }
    if (request.method() !== 'GET') {
      errors.push(`Unexpected mutation: ${request.method()} ${url.pathname}`);

      return route.abort();
    }
    try {
      await route.fulfill({ json: responseFor(url.pathname, actor) });
    } catch (error) {
      errors.push(error.message);
      await route.fulfill({ status: 500, json: { error: 'Missing screenshot fixture' } });
    }
  });
  try {
    await page.goto(`${origin}${path}`);
    await page.getByText(readyText, { exact: true }).first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !document.querySelector('.page-enter-active, .page-leave-active'));
    if (options.openTask) {
      await page.getByRole('button', { name: options.openTask, exact: true }).click();
      await page.getByRole('dialog').waitFor();
    }
    if (actor.role === 'volunteer') {
      assert.equal(await page.getByRole('link', { name: 'People & Access', exact: true }).count(), 0);
    }
    if (options.tab) {
      await page.getByRole('tab', { name: options.tab, exact: true }).click();
      await page.getByText('Akosua Boateng', { exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[class*="registration-panel-"][class*="-active"]'));
    }
    assert.equal(await page.getByRole('link', { name: 'Audit Log', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' });
    captures.push({ file: `${name}.png`, role: actor.role, route: path, viewport: page.viewportSize(), data: 'synthetic' });
    console.log(`Captured ${name} (${actor.role})`);
  } catch (error) {
    console.error(errors, (await page.locator('body').innerText()).slice(0, 2000));

    throw error;
  } finally {
    await context.close();
  }
}

try {
  await mkdir(output, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch { /* Wait for the isolated static preview. */ }
    if (attempt >= 40 || server.exitCode !== null) throw new Error(`Preview failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch();
  await capture('organizer-events', organizer, '/organizer-console/events', 'Building software that lasts');
  await capture('organizer-guests', organizer, '/organizer-console/events/november-meetup/registrations', 'Registration', { tab: 'Guests', height: 1240 });
  await capture('organizer-feedback', organizer, '/organizer-console/events/october-meetup/feedback', 'Responses', { height: 1040 });
  await capture('organizer-work-plan', organizer, '/organizer-console/annual-conference/2026/work-plan', 'Confirm the session programme', { height: 1120 });
  await capture('volunteer-my-tasks', volunteer, '/organizer-console/annual-conference/2026/work-plan', 'Prepare the welcome desk');
  await capture('volunteer-mobile', volunteer, '/organizer-console/mobile/annual-conference/2026?section=tasks', 'Prepare the welcome desk', { mobile: true });
  await writeFile(`${output}/manifest.json`, `${JSON.stringify({ generated_from: 'built Vue application', sample_date: timestamp, captures }, null, 2)}\n`);
} finally {
  await browser?.close();
  server.kill();
}
