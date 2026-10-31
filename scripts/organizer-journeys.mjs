import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

// Serve only built static assets: no application server, credentials, or database.
const origin = "http://127.0.0.1:4189";
const artifacts = process.env.ORGANIZER_JOURNEYS_ARTIFACTS ??
  "artifacts/organizer-journeys";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4189",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let serverLog = "";

server.stdout.on("data", (chunk) => {
  serverLog += chunk;
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk;
});
const event = {
  id: "fixture-event",
  name: "Fixture Meetup",
  event_date: "2026-09-26T09:00:00Z",
  timezone: "Africa/Accra",
  status: "upcoming",
  schedule: [],
  registration_url: null,
};
const edition = {
  id: "fixture-edition",
  year: 2026,
  label: "December 2026",
  provisional_date: "2026-12-19",
  status: "planning",
};
const workspace = {
  edition,
  phases: [],
  tasks: [],
  summary: {},
  permissions: {
    access_scope: "assigned",
    capabilities: [],
    can_create_tasks: false,
    can_manage_phases: false,
    can_edit_all_tasks: false,
    can_edit_assigned_tasks: false,
    can_update_all_task_status: false,
    can_update_assigned_task_status: true,
  },
};
const results = [];
let browser;

async function waitForRouteTransition(page) {
  await page.waitForFunction(
    () => {
      const routeViews = [...document.querySelectorAll(
        ".page-route-stack > .page-view",
      )];
      const transitionClasses = [
        "page-enter-active",
        "page-leave-active",
        "page-tab-forward-enter-active",
        "page-tab-forward-leave-active",
        "page-tab-back-enter-active",
        "page-tab-back-leave-active",
      ];

      return routeViews.length === 1 && routeViews.every(
        (routeView) => !transitionClasses.some((className) =>
          routeView.classList.contains(className),
        ),
      );
    },
    undefined,
    { timeout: 8_000 },
  );
}

async function assertUnderlineTabGeometry(page, selector) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(rowSelector => {
    const active = document.querySelector(rowSelector)?.querySelector('[aria-current="page"], [aria-selected="true"]');

    return active && getComputedStyle(active, '::after').opacity === '1';
  }, selector);

  const geometry = await page.locator(selector).evaluate(row => {
    const active = row.querySelector('[aria-current="page"], [aria-selected="true"]');
    const content = active?.querySelector('.underline-section-tab__content');

    if (!active || !content) return null;

    const bounds = active.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const contentBounds = content.getBoundingClientRect();
    const after = getComputedStyle(active, '::after');

    return {
      height: bounds.height,
      width: bounds.width,
      labelGap: rowBounds.bottom - 1 - contentBounds.bottom,
      markerDelta: bounds.bottom - Number.parseFloat(after.bottom) - rowBounds.bottom,
      markerHeight: after.height,
      markerOpacity: after.opacity,
      border: getComputedStyle(active).borderBottomWidth,
    };
  });

  assert.ok(geometry && geometry.height >= 44 && geometry.width >= 44, JSON.stringify(geometry));
  assert.ok(geometry.labelGap >= 2 && geometry.labelGap <= 7, JSON.stringify(geometry));
  assert.ok(Math.abs(geometry.markerDelta) <= 1, JSON.stringify(geometry));
  assert.equal(geometry.markerHeight, '2px');
  assert.equal(geometry.markerOpacity, '1');
  assert.equal(geometry.border, '0px', 'The active indicator must not duplicate a tab border');
}

async function assertVisibleBoardCards(page, expectedLabels) {
  await waitForRouteTransition(page);

  const labels = await page
    .locator(".page-route-stack > .page-view .task-board__card:visible")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("aria-label")).sort(),
    );

  assert.deepEqual(labels, [...expectedLabels].sort());
}

async function assertBoardColumnsAreContained(page) {
  const isContained = await page
    .locator(".page-route-stack > .page-view .task-board:visible")
    .evaluateAll((boards) => {
      return boards.every((board) => {
        const boardBounds = board.getBoundingClientRect();

        return [...board.querySelectorAll(".task-board__column")].every(
          (column) => {
            const columnBounds = column.getBoundingClientRect();

            const columnIsContained =
              columnBounds.left >= boardBounds.left &&
              columnBounds.right <= boardBounds.right;
            const cardsAreContained = [
              ...column.querySelectorAll(".task-board__card"),
            ].every((card) => {
              const cardBounds = card.getBoundingClientRect();

              return (
                cardBounds.left >= columnBounds.left &&
                cardBounds.right <= columnBounds.right
              );
            });

            return columnIsContained && cardsAreContained;
          },
        );
      });
    });

  assert.equal(
    isContained,
    true,
    "Every board column and card must remain inside its board boundary.",
  );
}

async function moveBoardTask(page, taskLabel, targetStatusLabel) {
  await page.locator(".page-route-stack > .page-view .task-board:visible").evaluate(
    (board, { taskLabel, targetStatusLabel }) => {
      const task = [...board.querySelectorAll(".task-board__card")].find(
        (card) => card.getAttribute("aria-label") === taskLabel,
      );
      const target = [...board.querySelectorAll(".task-board__column")].find(
        (column) =>
          column.getAttribute("aria-label") === `${targetStatusLabel} tasks`,
      );

      if (!task || !target)
        throw new Error("Unable to find the board task or destination column.");

      const transfer = new DataTransfer();
      const dragOptions = {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      };

      task.dispatchEvent(new DragEvent("dragstart", dragOptions));
      target.dispatchEvent(new DragEvent("dragover", dragOptions));
      target.dispatchEvent(new DragEvent("drop", dragOptions));
    },
    { taskLabel, targetStatusLabel },
  );
}

function createSaveGate() {
  let markEntered;
  let release;
  const entered = new Promise((resolve) => {
    markEntered = resolve;
  });
  const response = new Promise((resolve) => {
    release = resolve;
  });

  return { entered, markEntered, release, response };
}

async function waitForSaveGate(gate, label) {
  let timeoutId;

  try {
    await Promise.race([
      gate.entered,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timed out waiting for ${label} status save.`));
        }, 8000);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function journey(
  name,
  run,
  { role = "organizer", date = "2026-09-26T12:00:00Z", useFakeClock = false } = {},
) {
  const context = await browser.newContext({
    viewport:
      name === "presentation-board"
        ? { width: 1280, height: 720 }
        : { width: 390, height: 844 },
    timezoneId: "Africa/Accra",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  const responses = new Map();

  page.on("pageerror", (error) => errors.push(error.message));
  context.on("page", (popup) => {
    popup.setDefaultTimeout(8000);
    popup.on("pageerror", (error) => errors.push(error.message));
  });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  if (useFakeClock) await page.clock.install({ time: new Date(date) });
  else await page.clock.setFixedTime(new Date(date));
  await page.addInitScript(() => {
    window.turnstile = {
      render: (_element, options) => {
        queueMicrotask(() => options.callback("fixture-token"));

        return "fixture-widget";
      },
      reset: () => {},
      remove: () => {},
    };
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    requests.push({
      path: url.pathname,
      method: request.method(),
      body: request.postData(),
    });
    let body;
    let status = 200;
    const custom = responses.get(url.pathname);

    if (custom) {
      ({ body, status = 200 } =
        typeof custom === "function" ? await custom(request) : custom);
    } else if (url.pathname === "/api/auth/session") {
      body = {
        authenticated: true,
        auth_configured: true,
        user: {
          email: "fixture@example.com",
          display_name: "Fixture User",
          role,
        },
      };
    } else if (url.pathname === "/api/events") body = [event];
    else if (url.pathname === "/api/events/fixture-event") body = event;
    else if (url.pathname.endsWith("/work-plan")) body = workspace;
    else if (url.pathname === "/api/public/email-preflight")
      body = {
        accepted: true,
        status: "deliverable",
        normalized_email: "fixture@example.com",
      };
    else {
      errors.push(`Unmocked API: ${request.method()} ${url.pathname}`);

      return route.fulfill({
        status: 500,
        json: { error: "Unmocked fixture endpoint" },
      });
    }
    await route.fulfill({ status, json: body });
  });
  const started = Date.now();

  page.setDefaultTimeout(8000);
  try {
    await run({ page, responses, requests });
    assert.deepEqual(errors, []);
    results.push({ name, status: "passed", durationMs: Date.now() - started });
    await context.tracing.stop();
  } catch (error) {
    results.push({
      name,
      status: "failed",
      error: String(error),
      errors,
      requests,
      durationMs: Date.now() - started,
    });
    await page
      .screenshot({ path: `${artifacts}/${name}.png`, fullPage: true })
      .catch(() => {});
    await context.tracing.stop({ path: `${artifacts}/${name}.zip` });
  } finally {
    await context.close();
  }
}

try {
  await mkdir(artifacts, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* Startup only. */
    }
    if (attempt >= 40 || server.exitCode !== null)
      throw new Error(`Preview failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch();

  for (const mobile of [false, true]) {
    await journey(`blast-outline-${mobile ? 'mobile' : 'desktop'}`, async ({ page, responses, requests }) => {
      const outline = [
        { title: 'Welcome address', lead: null },
        { title: 'Building AI experiences', lead: 'Samora Dake' },
      ];
      const outlineEvent = { ...event, schedule: outline.map((item) => ({ ...item, time: '11:15AM - 11:45AM', type: 'talk', resources: [] })) };
      const registration = {
        managed_internally: true, event: outlineEvent,
        campaign: { status: 'open', capacity: 100, waitlist_enabled: true },
        registrations: [{ id: 'guest-1', status: 'confirmed', name: 'Fixture Guest', email: 'guest@example.com' }],
        summary: { confirmed: 1, waitlisted: 0, cancelled: 0, checked_in: 0 },
        public_url: '/register/fixture-event',
      };

      responses.set('/api/events/fixture-event/checklist', { body: { items: [] } });
      responses.set('/api/admin/short-links/ensure', { body: { url: `${origin}/s/fixture-registration` } });
      responses.set('/api/events/fixture-event/registrations', { body: registration });
      responses.set('/api/events/fixture-event/blasts', (request) => request.method() === 'POST'
        ? { status: 202, body: { delivery: 'preparing', blast: { recipient_count: 1 } } }
        : { body: { blasts: [] } });
      await page.setViewportSize({ width: mobile ? 390 : 1440, height: 1000 });
      await page.goto(`${origin}/organizer-console/${mobile ? 'mobile/events/fixture-event/blasts' : 'events/fixture-event/registrations'}`);
      if (!mobile) await page.getByRole('tab', { name: 'Blasts', exact: true }).click();
      await page.getByRole('button', { name: /create blast/i }).click();
      const checkbox = page.getByRole('checkbox', { name: /Include event outline/ });

      assert.equal(await checkbox.isChecked(), false);
      await page.getByLabel('Message', { exact: true }).fill('Join us for a day of learning and connection.');
      await checkbox.check();
      await page.screenshot({ path: `${artifacts}/blast-outline-${mobile ? 'mobile' : 'desktop'}-composer.png`, fullPage: true, animations: 'disabled' });
      await page.getByRole('button', { name: /preview email/i }).click();
      const preview = page.getByLabel('Rendered email preview');

      await preview.getByText('Building AI experiences — Samora Dake', { exact: true }).waitFor();
      assert.equal((await preview.innerText()).includes('11:15AM'), false);
      await page.screenshot({ path: `${artifacts}/blast-outline-${mobile ? 'mobile' : 'desktop'}-preview.png`, fullPage: true, animations: 'disabled' });
      await page.locator('.blast-preview-send').click();
      await checkbox.waitFor({ state: 'hidden' });
      const sent = requests.find((request) => request.path.endsWith('/blasts') && request.method === 'POST');

      assert.deepEqual(JSON.parse(sent.body).outline, outline);
      await page.getByRole('button', { name: /create blast/i }).click();
      assert.equal(await checkbox.isChecked(), false);
      await page.getByRole('button', { name: /preview email/i }).click();
      assert.equal((await preview.innerText()).includes('What’s on the programme'), false);
      await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
      registration.event = { ...event, schedule: [] };
      await page.reload();
      if (!mobile) await page.getByRole('tab', { name: 'Blasts', exact: true }).click();
      await page.getByRole('button', { name: /create blast/i }).click();
      assert.equal(await checkbox.isDisabled(), true);
      await page.getByText('Add a program outline to this event first.').waitFor();
    }, { role: 'owner' });
  }

  for (const width of [390, 1440]) {
    await journey(`speaker-blast-${width}`, async ({ page, responses, requests }) => {
      const recipients = [
        { name: 'Ama Boateng', email: 'ama@example.test', sessions: [{ id: 'a', title: 'Building AI experiences', url: 'https://go.devcongress.org/P_fixture_ama', deadline: '2026-10-31T23:59:59Z' }] },
        { name: 'Kojo Mensah', email: 'kojo@example.test', sessions: [{ id: 'b', title: 'System design in practice', url: 'https://go.devcongress.org/P_fixture_kojo', deadline: '2026-10-31T23:59:59Z' }] },
      ];
      let accepted = false;
      const blast = () => ({ id: 'fixture-speaker-blast', subject: 'Share your slides', status: 'accepted', recipient_count: 2, accepted_count: 2, error: null, recipients: recipients.map((recipient) => ({ ...recipient, provider_id: 'fixture-provider' })) });

      responses.set('/api/events/fixture-event', { body: { ...event, series_type: 'monthly' } });
      responses.set('/api/events/fixture-event/checklist', { body: { items: [] } });
      responses.set('/api/events/fixture-event/registrations', { body: { managed_internally: false, registrations: [], summary: {} } });
      responses.set('/api/events/fixture-event/talks', { body: [] });
      responses.set('/api/events/fixture-event/speaker-submissions', { body: { submissions: [] } });
      responses.set('/api/events/fixture-event/speaker-intake-links', { body: { links: [] } });
      responses.set('/api/events/fixture-event/speaker-blasts', { get body() { return { audience: { recipients, excluded: [{ name: 'Akua', title: 'Interfaces', reason: 'Slides are already provided.' }] }, blasts: accepted ? [blast()] : [] }; } });
      responses.set('/api/events/fixture-event/speaker-blasts/preview', {
        body: { id: 'fixture-speaker-blast', subject: 'Share your slides', previews: recipients.map((recipient) => ({ name: recipient.name, to: recipient.email, from: 'DevCongress Speakers', subject: 'Share your slides', text: `Hi ${recipient.name},\n\nPlease add your slides.\n\n${recipient.sessions[0].title}\n${recipient.sessions[0].url}` })) },
      });
      responses.set('/api/events/fixture-event/speaker-blasts/fixture-speaker-blast/send', () => {
        accepted = true;

        return { body: { blast: blast() } };
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}/organizer-console/events/fixture-event/talks/program`);
      await page.getByRole('button', { name: 'Email speakers', exact: true }).click();
      await page.getByRole('button', { name: 'Message type', exact: true }).click();
      await page.getByRole('option', { name: 'Slides reminder', exact: true }).click();
      const panel = page.getByRole('region', { name: 'Speaker blasts', exact: true });

      await panel.getByText('2 eligible speakers.', { exact: false }).waitFor();
      await panel.screenshot({ path: `${artifacts}/speaker-blast-${width}-composer.png`, animations: 'disabled' });
      await page.getByRole('button', { name: 'Preview speaker emails', exact: true }).click();
      const first = panel.locator('details').filter({ hasText: 'Ama Boateng' });
      const second = panel.locator('details').filter({ hasText: 'Kojo Mensah' });

      await first.locator('summary').click();
      await second.locator('summary').click();
      assert.equal((await first.innerText()).includes('P_fixture_ama'), true);
      assert.equal((await first.innerText()).includes('P_fixture_kojo'), false);
      assert.equal((await second.innerText()).includes('P_fixture_kojo'), true);
      assert.equal(requests.some((request) => request.path.endsWith('/send')), false);
      await panel.screenshot({ path: `${artifacts}/speaker-blast-${width}-preview.png`, animations: 'disabled' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('button', { name: 'Send 2 speaker emails', exact: true }).click();
      await panel.getByRole('status').waitFor();
      await panel.getByText('Speaker email history', { exact: true }).waitFor();
      assert.equal(requests.filter((request) => request.path.endsWith('/send')).length, 1);
    }, { role: 'owner' });
  }

  await journey('underline-workspace-tabs', async ({ page, responses }) => {
    responses.set('/api/admin/audit-log', { body: { logs: [] } });
    responses.set('/api/admin/short-links', { body: { links: [] } });
    responses.set('/api/admin/archived-events', { body: { events: [] } });
    responses.set('/api/events/fixture-event/checklist', { body: { items: [] } });
    responses.set('/api/admin/short-links/ensure', { body: { url: `${origin}/s/fixture-registration` } });
    responses.set('/api/events/fixture-event/registrations', {
      body: {
        managed_internally: true,
        event,
        campaign: { status: 'open', capacity: 100, waitlist_enabled: true },
        registrations: [],
        summary: { confirmed: 0, waitlisted: 0, cancelled: 0, checked_in: 0 },
        public_url: '/register/fixture-event',
      },
    });
    responses.set('/api/events/fixture-event/blasts', { body: { blasts: [] } });

    for (const width of [768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/organizer-console/audit-log`);
      await page.getByRole('tab', { name: 'Activity', exact: true }).waitFor();
      await assertUnderlineTabGeometry(page, '[aria-label="Audit Log sections"]');
      await page.getByRole('tab', { name: 'Short links', exact: true }).click();
      await assertUnderlineTabGeometry(page, '[aria-label="Audit Log sections"]');

      await page.goto(`${origin}/organizer-console/events/fixture-event/registrations`);
      await page.getByRole('tab', { name: 'Summary', exact: true }).waitFor();
      await assertUnderlineTabGeometry(page, '[aria-label="Registration workspace"]');
      await page.getByRole('tab', { name: 'Guests', exact: true }).click();
      await assertUnderlineTabGeometry(page, '[aria-label="Registration workspace"]');
    }
  }, { role: 'owner' });

  for (const role of ["owner", "organizer"]) {
    await journey(`navigation-fit-${role}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${origin}/organizer-console/events`);
      await page.evaluate(() => document.fonts.ready);
      const primary = page.getByRole("navigation", { name: "Primary", exact: true, includeHidden: true });
      const toggle = page.getByRole("button", { name: "Open menu", exact: true });

      const expected = ["Events", "Attendance", "Feedback", "Annual Conference", "People & Access", ...(role === "owner" ? ["Present forms", "Audit Log"] : [])];

      for (const width of [1024, 1280, 1440, 1592, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForFunction(() => {
          const nav = document.querySelector('.app-primary-nav');

          return nav && nav.getAttribute('aria-hidden') === 'false' && nav.scrollWidth <= nav.clientWidth + 1;
        });
        await primary.waitFor();
        assert.equal(await primary.getAttribute("aria-hidden"), "false");
        assert.equal(await primary.evaluate(element => element.inert), false);
        assert.equal(await page.locator('.app-mobile-menu-toggle').isVisible(), false, 'Desktop overflow must not become a mobile menu');
        assert.equal(await primary.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true);

        const more = page.getByRole('button', { name: /^More navigation/ });

        if (await more.isVisible()) {
          await more.click();
          await page.waitForFunction(() => {
            const panel = document.querySelector('#desktop-navigation-more');

            return panel && !panel.classList.contains('desktop-navigation-enter-active') && getComputedStyle(panel).opacity === '1';
          });
          const panel = await page.locator('#desktop-navigation-more').boundingBox();
          const header = await page.locator('.app-header').boundingBox();

          assert.ok(panel && header && panel.width <= 320 && panel.x >= 0 && panel.x + panel.width <= width && panel.y >= header.y + header.height - 1);
          assert.deepEqual(await primary.getByRole('link').allTextContents().then(labels => labels.map(label => label.trim())), expected);
          if (width === 1440) await page.screenshot({ path: `${artifacts}/navigation-more-${role}-desktop.png` });
          await page.keyboard.press('Escape');
          assert.equal(await more.getAttribute('aria-expanded'), 'false');
          assert.equal(await more.evaluate(element => element === document.activeElement), true);
          await page.keyboard.press('Enter');
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('#desktop-navigation-more'))), true);
          await page.getByRole('heading', { name: 'Events', exact: true }).click();
          assert.equal(await more.getAttribute('aria-expanded'), 'false');
        } else {
          assert.deepEqual(await primary.getByRole('link').allTextContents().then(labels => labels.map(label => label.trim())), expected);
        }
      }

      if (role === 'organizer') {
        await page.setViewportSize({ width: 1440, height: 900 });
        await primary.getByRole('link', { name: 'People & Access', exact: true }).focus();
        await page.setViewportSize({ width: 1024, height: 900 });
        await page.waitForFunction(() => document.activeElement?.classList.contains('app-nav-more-toggle'));
      }

      await page.setViewportSize({ width: 960, height: 900 });
      await toggle.waitFor();
      await toggle.click();
      const mobile = page.getByRole("navigation", { name: "Mobile primary" });

      await mobile.waitFor();
      assert.deepEqual(await mobile.getByRole("link").allTextContents().then((labels) => labels.map((label) => label.replace("↗", "").trim())), await primary.locator("a").allTextContents().then((labels) => labels.map((label) => label.trim())));
      await page.keyboard.press("Escape");
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
      await toggle.click();
      await page.getByRole("link", { name: "CREATE EVENT", exact: true }).focus();
      await page.waitForFunction(() => document.querySelector(".app-mobile-menu-toggle")?.getAttribute("aria-expanded") === "false");
    }, { role });
  }

  await journey(
    "presentation-board",
    async ({ page, responses, requests }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      const forms = [
        {
          key: "speaker",
          destination: "conference_cfp",
          conference_year: 2026,
          label: "December 2026",
        },
        {
          key: "volunteer",
          destination: "volunteer_intake",
          label: "Volunteer form",
        },
        {
          key: "feedback-sep",
          destination: "event_feedback",
          event_id: "sep",
          event_date: "2026-09-26T09:00:00Z",
          series_type: "monthly",
          label: "September Meetup",
        },
        {
          key: "feedback-oct",
          destination: "event_feedback",
          event_id: "oct",
          event_date: "2026-10-24T09:00:00Z",
          series_type: "monthly",
          label: "October Meetup",
        },
        {
          key: "registration",
          destination: "event_registration",
          event_id: "sep",
          event_date: "2026-09-26T09:00:00Z",
          series_type: "monthly",
          label: "September Meetup",
        },
      ];

      responses.set("/api/admin/presentation-forms", { body: { forms } });
      responses.set("/api/admin/short-links/ensure", (request) => {
        const input = JSON.parse(request.postData());

        return {
          body: { url: `${origin}/s/${input.event_id ?? input.destination}` },
        };
      });
      responses.set("/api/annual-conference/editions", {
        body: { editions: [edition] },
      });
      responses.set("/api/admin/organizers", { body: { organizers: [] } });
      await page.goto(`${origin}/organizer-console/annual-conference/2026`);
      await page.locator('.app-header').waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
      });
      const navigationToggle = page.getByRole('button', { name: 'Open menu', exact: true });

      if (await navigationToggle.isVisible()) await navigationToggle.click();
      else if (!await page.getByRole('link', { name: 'Present forms', exact: true }).isVisible()) {
        await page.getByRole('button', { name: /^More navigation/ }).click();
      }

      await page
        .getByRole("link", { name: "Present forms", exact: true })
        .click();
      await page.waitForURL(`${origin}/organizer-console/present-forms`);
      const present = page.getByRole("button", {
        name: "Present ↗",
        exact: true,
      });

      await page.locator(".qr-tile img").nth(2).waitFor();
      assert.equal(await page.locator(".qr-tile").count(), 3);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.getByRole("button", { name: /Meetup month/ }).click();
      await page
        .getByRole("option", { name: "October 2026", exact: true })
        .click();
      await page.locator('.short-link[href$="/oct"]').waitFor();
      assert.equal(await page.locator('.short-link[href$="/sep"]').count(), 0);
      await page.getByRole("button", { name: /Meetup month/ }).click();
      await page
        .getByRole("option", { name: "November 2026", exact: true })
        .click();
      await page
        .getByText("No monthly meetup feedback is open", { exact: false })
        .waitFor();
      assert.equal(await page.locator(".qr-tile").count(), 2);
      assert.equal(
        await page
          .getByRole("checkbox", { name: /Meetup feedback/ })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("checkbox", { name: /Event registration/ })
          .count(),
        0,
      );
      await page.locator(".qr-tile img").nth(1).waitFor();
      async function openBoard() {
        const opened = page.waitForEvent("popup");

        await present.click();
        const display = await opened;

        await display.waitForURL("**/present-forms/display?**");
        assert.equal(
          new URL(page.url()).pathname.endsWith("/present-forms"),
          true,
        );

        return display;
      }
      let releaseCatalog;
      const catalogGate = new Promise((resolve) => {
        releaseCatalog = resolve;
      });
      const holdCatalog = async (route) => {
        await catalogGate;
        await route.fallback();
      };

      await page
        .context()
        .route("**/api/admin/presentation-forms", holdCatalog);
      const two = await openBoard();
      let skeletonBox;

      try {
        await two
          .getByRole("status", { name: "Loading form QR codes" })
          .waitFor();
        await two.evaluate(() => document.fonts.ready);
        assert.ok(await two.locator("[data-boneyard-bone]").count() > 0);
        assert.equal(await two.locator(".audience-card a").count(), 0);
        skeletonBox = await two.locator(".ems-loading-region").boundingBox();
        await two.screenshot({
          path: `${artifacts}/presentation-loading.png`,
          fullPage: true,
        });
      } finally {
        releaseCatalog();
        await page
          .context()
          .unroute("**/api/admin/presentation-forms", holdCatalog);
      }

      await two.locator(".code-frame img").nth(1).waitFor();
      const loadedBox = await two.locator(".audience-grid").boundingBox();

      assert.ok(Math.abs(skeletonBox.y - loadedBox.y) < 1);
      assert.equal(skeletonBox.width, loadedBox.width);
      assert.equal(await two.locator('[aria-busy="true"]').count(), 0);
      await two.screenshot({
        path: `${artifacts}/presentation-two.png`,
        fullPage: true,
      });
      assert.equal(
        await two.evaluate(
          () =>
            document.querySelector(".audience-grid").getBoundingClientRect()
              .bottom <= innerHeight,
        ),
        true,
      );
      await two.close();
      await page.getByRole("button", { name: /Meetup month/ }).click();
      await page
        .getByRole("option", { name: "September 2026", exact: true })
        .click();
      await page.locator(".qr-tile img").nth(2).waitFor();
      await page.screenshot({
        path: `${artifacts}/presentation-setup.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 720 });
      const three = await openBoard();

      await three.locator(".code-frame img").nth(2).waitFor();
      await three.screenshot({
        path: `${artifacts}/presentation-three.png`,
        fullPage: true,
      });
      assert.equal(
        await three.evaluate(
          () =>
            document.querySelector(".audience-grid").getBoundingClientRect()
              .bottom <= innerHeight,
        ),
        true,
      );
      await three.close();
      const demoOpened = page.waitForEvent("popup");

      await page
        .getByRole("link", { name: /Preview three sample codes/ })
        .click();
      const demo = await demoOpened;

      await demo.locator(".code-frame img").nth(2).waitFor();
      await demo.getByText("Demo · sample codes only").waitFor();
      await demo
        .locator(".community-photos img")
        .evaluateAll((images) =>
          Promise.all(images.map((img) => img.decode())),
        );
      assert.equal(await demo.locator(".community-photos img").count(), 2);
      assert.equal(
        await demo
          .locator(".card-heading")
          .first()
          .evaluate((element) => getComputedStyle(element).textAlign),
        "center",
      );
      assert.equal(
        await demo
          .locator(".card-url")
          .first()
          .evaluate((element) => getComputedStyle(element).fontStyle),
        "italic",
      );
      assert.equal(
        await demo
          .locator(".card-url")
          .first()
          .evaluate((element) => getComputedStyle(element).color),
        "rgb(201, 0, 118)",
      );
      await demo
        .getByRole("heading", { name: "Help shape what’s next." })
        .waitFor();
      assert.equal(
        await demo.getByRole("button", { name: /Fullscreen/i }).count(),
        0,
      );
      assert.equal(
        await demo.evaluate(
          () =>
            document.querySelector("footer").getBoundingClientRect().bottom <=
            innerHeight,
        ),
        true,
      );
      await demo.screenshot({
        path: `${artifacts}/presentation-demo-three.png`,
        fullPage: true,
      });
      await demo.locator(".peek-window").evaluate((element) => {
        for (const animation of element.getAnimations({ subtree: true })) {
          animation.pause();
          animation.currentTime = 3100;
        }
      });
      assert.equal(await demo.locator(".hero-copy .peek-window").count(), 1);

      const peekBox = await demo.locator(".peek-window").boundingBox();
      const headlineBox = await demo.locator("h1").boundingBox();

      assert.ok(peekBox.x >= headlineBox.x + headlineBox.width);
      const qrBox = await demo.locator(".audience-grid").boundingBox();

      assert.ok(peekBox.y + peekBox.height < qrBox.y);
      await demo.screenshot({
        path: `${artifacts}/presentation-peek-face.png`,
        fullPage: true,
      });
      await demo.emulateMedia({ reducedMotion: "reduce" });
      assert.equal(
        await demo
          .locator(".peek-face")
          .evaluate((element) => getComputedStyle(element).animationName),
        "none",
      );
      assert.equal(
        await demo
          .locator(".peek-pupils")
          .evaluate((element) => getComputedStyle(element).animationName),
        "none",
      );
      await demo.close();
      responses.set("/api/admin/short-links/ensure", {
        status: 409,
        body: { error: "That public destination is not currently open." },
      });
      const failed = await openBoard();

      await failed.getByRole("alert").waitFor();
      assert.equal(await failed.locator(".audience-card").count(), 0);
      responses.set("/api/admin/short-links/ensure", {
        body: { url: `${origin}/s/recovered` },
      });
      await failed.getByRole("button", { name: "Retry", exact: true }).click();
      await failed.locator(".code-frame img").nth(2).waitFor();
      await failed.close();
      assert.equal(await present.isEnabled(), true);
      for (const checkbox of await page.getByRole("checkbox").all())
        await checkbox.uncheck();
      assert.equal(await present.isEnabled(), false);
      assert.equal(
        requests.some((request) => request.path.includes("presentation-forms")),
        true,
      );
    },
    { role: "owner" },
  );
  await journey("filtered-navigation", async ({ page, responses }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const tasks = [
      {
        id: "alice-old",
        title: "Alice earlier task",
        accountable_owner: "Alice",
        phase_id: "old",
      },
      {
        id: "alice-current",
        title: "Alice current task",
        accountable_owner: "Alice",
        phase_id: "current",
      },
      {
        id: "bob-current",
        title: "Bob current task",
        accountable_owner: "Bob",
        phase_id: "current",
      },
      {
        id: "charlie-current",
        title: "Charlie current task",
        accountable_owner: "Charlie",
        phase_id: "current",
      },
      {
        id: "doreen-current",
        title: "Doreen current task",
        accountable_owner: "Doreen",
        phase_id: "current",
      },
      {
        id: "eve-current",
        title: "Eve current task",
        accountable_owner: "Eve",
        phase_id: "current",
      },
    ].map((task) => ({
      ...task,
      edition_id: edition.id,
      details: null,
      internal_note: null,
      workstream: "venue_production_logistics",
      collaborators: [],
      priority: "medium",
      target_date: "2026-09-30",
      status: "not_started",
      dependency_task_ids: [],
      dependency_note: null,
      source: "manual",
      sort_order: 1,
    }));

    responses.set("/api/annual-conference/2026/work-plan", {
      body: {
        ...workspace,
        tasks,
        phases: [
          {
            id: "old",
            name: "Earlier phase",
            label: "Earlier phase",
            starts_on: "2026-08-01",
            ends_on: "2026-08-31",
            sort_order: 1,
          },
          {
            id: "current",
            name: "Current phase",
            label: "Current phase",
            starts_on: "2026-09-01",
            ends_on: "2026-09-30",
            sort_order: 2,
          },
        ],
        permissions: { ...workspace.permissions, access_scope: "all" },
      },
    });
    responses.set("/api/annual-conference/editions", {
      body: { editions: [edition] },
    });
    responses.set("/api/admin/organizers", { body: { organizers: [] } });
    await page.goto(`${origin}/organizer-console/annual-conference/2026`);
    await page
      .getByRole("link", { name: "View Alice's tasks in the work plan", exact: true })
      .click();
    await page.waitForURL((url) => url.searchParams.get("owner") === "Alice");
    await assertVisibleBoardCards(page, [
      "Open Alice earlier task",
      "Open Alice current task",
    ]);
    await page.goto(
      `${origin}/organizer-console/annual-conference/2026/work-plan`,
    );
    await assertVisibleBoardCards(page, [
      "Open Alice current task",
      "Open Bob current task",
      "Open Charlie current task",
      "Open Doreen current task",
      "Open Eve current task",
    ]);
    await page
      .getByRole("button", { name: "Filter tasks by owner: Alice" })
      .click();
    await page.waitForURL((url) => url.searchParams.get("owner") === "Alice");
    await assertVisibleBoardCards(page, ["Open Alice current task"]);
    await page.getByRole("button", { name: /More owner filters/ }).click();
    await page.getByRole("option", { name: "All owners", exact: true }).click();
    await page.waitForURL((url) => !url.searchParams.has("owner"));
    await waitForRouteTransition(page);
    await page.getByRole("button", { name: /More owner filters/ }).click();
    await page.getByRole("option", { name: "Eve", exact: true }).click();
    await page.waitForURL((url) => url.searchParams.get("owner") === "Eve");
    await assertVisibleBoardCards(page, ["Open Eve current task"]);
  });
  await journey(
    "optimistic-board-status",
    async ({ page, responses, requests }) => {
      await page.setViewportSize({ width: 1024, height: 1000 });
      const task = {
        id: "optimistic-task",
        edition_id: edition.id,
        title: "Move this task instantly",
        details: null,
        internal_note: null,
        phase_id: "earlier",
        workstream: "venue_production_logistics",
        accountable_owner: "Alice",
        collaborators: [],
        priority: "medium",
        target_date: "2026-09-30",
        status: "not_started",
        dependency_task_ids: [],
        dependency_note: null,
        source: "manual",
        sort_order: 1,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      };
      let serverTask = task;
      const saveGates = [createSaveGate(), createSaveGate(), createSaveGate()];
      const savedStatuses = [];
      let saveIndex = 0;

      responses.set("/api/annual-conference/2026/work-plan", () => ({
        body: {
          ...workspace,
          phases: [
            {
              id: "earlier",
              name: "Earlier phase",
              label: "Earlier phase",
              starts_on: "2026-08-01",
              ends_on: "2026-08-31",
              sort_order: 1,
            },
            {
              id: "current",
              name: "Current phase",
              label: "Current phase",
              starts_on: "2026-09-01",
              ends_on: "2026-09-30",
              sort_order: 2,
            },
          ],
          tasks: [serverTask],
          permissions: {
            ...workspace.permissions,
            access_scope: "all",
            can_edit_all_tasks: true,
            can_update_all_task_status: true,
          },
        },
      }));
      responses.set(
        "/api/annual-conference/2026/work-plan/optimistic-task",
        async (request) => {
          assert.equal(request.method(), "PATCH");
          const gate = saveGates[saveIndex++];
          const input = JSON.parse(request.postData());

          assert.ok(gate, "Unexpected extra status PATCH");
          savedStatuses.push(input.status);
          gate.markEntered();
          await gate.response;

          if (saveIndex === 3)
            return { status: 500, body: { error: "Save failed" } };

          serverTask = {
            ...serverTask,
            status: input.status,
          };

          return { body: serverTask };
        },
      );
      responses.set("/api/annual-conference/editions", {
        body: { editions: [edition] },
      });
      responses.set("/api/admin/organizers", { body: { organizers: [] } });
      responses.set("/api/annual-conference/2026/task-members", {
        body: { organizers: [] },
      });
      await page.goto(
        `${origin}/organizer-console/annual-conference/2026/work-plan`,
      );
      await waitForRouteTransition(page);
      const phaseControl = page.locator(".annual-task-workspace__controls");

      await phaseControl
        .getByRole("button", { name: "Current phase", exact: true })
        .first()
        .click();
      await page
        .getByRole("option", { name: "Earlier phase", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          new URL(window.location.href).searchParams.get("phase") === "earlier",
      );
      await waitForRouteTransition(page);
      const visibleBoard = page.locator(
        ".page-route-stack > .page-view .task-board:visible",
      );
      const taskCard = visibleBoard
        .getByRole("button", {
          name: "Open Move this task instantly",
          exact: true,
        })
        .first();

      await taskCard.waitFor();
      await assertBoardColumnsAreContained(page);
      assert.equal(await taskCard.getAttribute("draggable"), "true");

      await moveBoardTask(page, "Open Move this task instantly", "In progress");
      await waitForSaveGate(saveGates[0], "in-progress");
      assert.deepEqual(savedStatuses, ["in_progress"]);
      await visibleBoard
        .getByLabel("In progress tasks")
        .getByRole("button", {
          name: "Open Move this task instantly",
          exact: true,
        })
        .first()
        .waitFor();
      assert.equal(new URL(page.url()).searchParams.get("phase"), "earlier");
      assert.equal(
        requests.filter((request) => request.path.endsWith("/optimistic-task"))
          .length,
        1,
      );
      assert.equal(await taskCard.getAttribute("draggable"), "true");

      await moveBoardTask(page, "Open Move this task instantly", "Blocked");
      await visibleBoard
        .getByLabel("Blocked tasks")
        .getByRole("button", {
          name: "Open Move this task instantly",
          exact: true,
        })
        .first()
        .waitFor();
      assert.equal(await taskCard.getAttribute("draggable"), "true");
      assert.equal(
        requests.filter((request) => request.path.endsWith("/optimistic-task"))
          .length,
        1,
      );

      saveGates[0].release();
      await waitForSaveGate(saveGates[1], "blocked");
      assert.deepEqual(savedStatuses, ["in_progress", "blocked"]);
      saveGates[1].release();
      await page
        .getByText("Conference task updated.", { exact: true })
        .waitFor();
      await visibleBoard
        .getByLabel("Blocked tasks")
        .getByRole("button", {
          name: "Open Move this task instantly",
          exact: true,
        })
        .first()
        .waitFor();

      await moveBoardTask(page, "Open Move this task instantly", "Done");
      await waitForSaveGate(saveGates[2], "done");
      assert.deepEqual(savedStatuses, ["in_progress", "blocked", "done"]);
      await visibleBoard
        .getByLabel("Done tasks")
        .getByRole("button", {
          name: "Open Move this task instantly",
          exact: true,
        })
        .first()
        .waitFor();

      saveGates[2].release();
      await page.getByText("Save failed", { exact: true }).waitFor();
      await visibleBoard
        .getByLabel("Blocked tasks")
        .getByRole("button", {
          name: "Open Move this task instantly",
          exact: true,
        })
        .first()
        .waitFor();
    },
  );
  await journey(
    "event-amendment-time",
    async ({ page, responses, requests }) => {
      const managedEvent = {
        title: "Fixture community event",
        starts_at: "2026-09-26T17:00:00.000Z",
        ends_at: "2026-09-26T19:30:00.000Z",
        timezone: "Europe/Berlin",
        location_type: "in_person",
        venue_name: "Impact Hub Accra",
        venue_address: "Accra",
        online_url: null,
        registration_url: "https://example.com/register",
        cover_url: null,
      };
      let savedPayload = null;

      responses.set("/api/public/event-submissions/management", (request) => {
        if (request.method() === "PUT") {
          savedPayload = JSON.parse(request.postData());

          return {
            body: {
              amendment: { ...savedPayload, status: "draft", cover_url: null },
            },
          };
        }

        return {
          body: {
            management: {
              link_id: "fixture-link",
              expires_at: "2026-09-26T11:00:00.000Z",
              submission: managedEvent,
              current_event: managedEvent,
              amendment: null,
            },
          },
        };
      });
      await page.goto(`${origin}/event-amendments/fixture-capability`);
      await page
        .getByRole("heading", { name: "Update event details", exact: true })
        .waitFor();
      const datePickers = page.locator('button[aria-haspopup="dialog"]');

      assert.equal(await datePickers.count(), 2);
      const starts = datePickers.nth(0);

      await starts.getByText("26/09/2026 · 19:00", { exact: true }).waitFor();
      await starts.click();
      const hour = page.getByRole("textbox", {
        name: "Hour, 00 to 23",
        exact: true,
      });

      assert.equal(await hour.count(), 1);
      await hour.fill("20");
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await starts.getByText("26/09/2026 · 20:00", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "SAVE DRAFT", exact: true })
        .click();
      await page.getByText("Draft saved privately.", { exact: true }).waitFor();
      assert.equal(savedPayload.starts_at, "2026-09-26T18:00:00.000Z");
      assert.equal(
        requests.filter(
          (request) =>
            request.path === "/api/public/event-submissions/management" &&
            request.method === "PUT",
        ).length,
        1,
      );
    },
  );
  await journey(
    "project-night-recurrence",
    async ({ page, responses, requests }) => {
      const projectNight = {
        ...event,
        name: "Project Night",
        event_date: "2026-09-17T18:30:00Z",
        end_date: "2026-09-17T21:00:00Z",
        ownership: "external",
        publication_status: "published",
        location: { name: "Accra" },
      };
      let recurrence = null;

      responses.set("/api/events/fixture-event", { body: projectNight });
      responses.set("/api/events/fixture-event/checklist", {
        body: {
          event_status: projectNight.status,
          progress: { completed: 0, total: 0, percent: 0 },
          items: [],
        },
      });
      responses.set("/api/events/fixture-event/registrations", {
        body: { managed_internally: false, registrations: [] },
      });
      responses.set("/api/events/fixture-event/speaker-submissions", {
        body: { submissions: [] },
      });
      responses.set("/api/events/fixture-event/slack-announcement", {
        body: {
          announcement: null,
          eligible: true,
          website: { state: "published", url: "" },
          slack_url: null,
        },
      });
      responses.set("/api/events/fixture-event/page-monitor", {
        body: { monitor: null, eligible: false, organizer_contact: null },
      });
      responses.set("/api/events/fixture-event/recurrence", (request) => {
        if (request.method() === "POST") {
          const { action } = JSON.parse(request.postData());

          recurrence = {
            source_event_id: event.id,
            enabled: action !== "pause",
            next_date: action === "skip" ? "2026-10-01" : "2026-09-24",
            cover_url: "/fixture.jpg",
          };
        }

        return { body: { recurrence } };
      });
      await page.goto(
        `${origin}/organizer-console/events/fixture-event/community`,
      );
      const panel = page.getByRole("region", {
        name: "Project Night recurrence",
      });

      await panel
        .getByRole("button", { name: "ENABLE RECURRENCE", exact: true })
        .click();
      await panel.getByText("ENABLED", { exact: true }).waitFor();
      await panel.getByRole("button", { name: "SKIP NEXT WEEK" }).click();
      await panel.getByRole("button", { name: "Yes, skip this week" }).click();
      await panel.getByText("Thu, 1 Oct 2026", { exact: true }).waitFor();
      await panel.scrollIntoViewIfNeeded();
      await panel.screenshot({ path: `${artifacts}/project-night-mobile.png` });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(
        `${origin}/organizer-console/events/fixture-event/community`,
      );
      await panel.getByRole("button", { name: "PAUSE RECURRENCE" }).waitFor();
      await panel.screenshot({
        path: `${artifacts}/project-night-desktop.png`,
      });
      await panel.getByRole("button", { name: "PAUSE RECURRENCE" }).click();
      await panel.getByText("PAUSED", { exact: true }).waitFor();
      assert.deepEqual(
        requests
          .filter(
            (request) =>
              request.path.endsWith("/recurrence") && request.method === "POST",
          )
          .map((request) => JSON.parse(request.body).action),
        ["enable", "skip", "pause"],
      );
    },
  );
  await journey(
    "volunteer-follow-up-owner-navigation",
    async ({ page, responses, requests }) => {
      await page.setViewportSize({ width: 1280, height: 1000 });
      const ownerWorkspace = {
        ...workspace,
        edition,
        permissions: {
          ...workspace.permissions,
          access_scope: "all",
          capabilities: [
            "volunteers.view_team",
            "volunteers.review_applications",
          ],
        },
      };
      const recipient = {
        id: "fixture-recipient",
        applicant_name: "Ama Mensah",
        applicant_email: "ama@example.com",
        status: "delivered",
        submitted_at: null,
        motivation: null,
        can_attend_accra: null,
        review_status: "unreviewed",
        review_note: null,
        decision: "accepted",
        decision_version: 1,
        decision_at: "2026-09-22T10:00:00.000Z",
        decision_by: "owner@example.com",
        outcome_sent: false,
        outcome_control: { held: false, can_hold: true, can_resume: false, reason: null },
        delivery_diagnostic: {
          source: "provider_event",
          explanation: "Resend recorded this email as delivered.",
          action: "No retry is needed.",
          retry_block_reason: "Resend accepted this delivery or reported an event; it cannot be safely resent.",
        },
        outcome_delivery: {
          id: "fixture-outcome-delivery-1",
          individually_controlled: true,
          held_at: null,
          decision: "accepted",
          decision_version: 1,
          status: "retrying",
          attempt_count: 2,
          first_attempt_at: "2026-09-23T10:00:00.000Z",
          next_attempt_at: "2026-09-23T10:15:00.000Z",
          claimed_until: null,
          last_error: "Temporary provider issue.",
          provider_email_id: null,
          provider_event_at: null,
          delivery_stage: "provider_request",
          provider_http_status: null,
          failure_certainty: "ambiguous",
          diagnostic_at: "2026-09-23T10:00:00.000Z",
        },
        outcome_diagnostic: {
          source: "unknown",
          explanation: "The sender could not confirm whether Resend accepted the email.",
          action: "A same-key scheduled retry is pending. Do not manually queue another retry.",
          retry_block_reason: "Only a definite failed delivery can be queued again.",
        },
        attempt_count: 1,
        next_attempt_at: null,
        last_error: null,
      };
      const campaignRecipients = [
        recipient,
        ...Array.from({ length: 12 }, (_, index) => ({
          ...recipient,
          id: `fixture-diagnostic-${index + 2}`,
          applicant_name: `Diagnostic Volunteer ${index + 2}`,
          applicant_email: `diagnostic${index + 2}@example.com`,
          outcome_control: { held: false, can_hold: index > 1 && index !== 3, can_resume: false, reason: index === 3 ? "Legacy batch: individual hold/resume is unavailable." : null },
          status: index === 0 ? "failed" : index === 1 ? "queued" : "delivered",
          submitted_at: index === 2 ? "2026-09-24T10:00:00.000Z" : null,
          decision: "accepted",
          decision_version: 1,
          outcome_delivery: {
            ...recipient.outcome_delivery,
            id: `fixture-outcome-delivery-${index + 2}`,
            individually_controlled: index !== 3,
            status: index === 0 ? "delivered" : index === 1 ? "accepted" : "retrying",
            attempt_count: index + 2,
            last_error: `Temporary provider issue ${index + 2}.`,
          },
        })),
        {
          ...recipient,
          id: "not-selected-recipient",
          applicant_name: "Not-selected Applicant",
          decision: "not_selected",
          outcome_control: { held: false, can_hold: false, can_resume: false, reason: "Already stopped. Review delivery details for a safe retry." },
          outcome_delivery: { ...recipient.outcome_delivery, id: "not-selected-delivery", decision: "not_selected", status: "failed", next_attempt_at: null },
          outcome_diagnostic: { explanation: "The provider rejected this request.", action: "Review the delivery before retrying.", retry_block_reason: null },
        },
      ];

      responses.set("/api/annual-conference/2026/work-plan", {
        body: ownerWorkspace,
      });
      responses.set("/api/annual-conference/editions", {
        body: { editions: [edition] },
      });
      responses.set("/api/admin/organizers", { body: { organizers: [] } });
      responses.set("/api/annual-conference/2026/team", {
        body: { members: [] },
      });
      responses.set("/api/annual-conference/2026/volunteer-applications", {
        body: { applications: [] },
      });
      let outcomePaused = false;

      responses.set("/api/annual-conference/2026/volunteer-follow-up", () => ({
        body: {
          campaign: {
            status: "running",
            application_deadline_at: "2026-09-30T23:59:59.000Z",
            last_drain_at: "2026-09-26T12:00:00.000Z",
            last_drain_reason: "invitations:capacity_unverified;outcomes:not_due",
            outcome_paused: outcomePaused,
          },
          response_deadline: "2026-10-14T23:59:59.000Z",
          recipients: campaignRecipients,
          can_manage: true,
          email_health: {
            daily_quota_used: null,
            daily_quota_limit: 100,
            monthly_quota_used: null,
            monthly_quota_limit: 3000,
            last_provider_response_at: null,
          },
          outcome_messages: [
            {
              decision: "accepted",
              version: 4,
              subject: "Your DevCongress 2026 volunteer application",
              message: "Your application has been selected.",
            },
            {
              decision: "not_selected",
              version: 2,
              subject: "Update on your DevCongress 2026 volunteer application",
              message: "Thank you for applying to volunteer with DevCongress.",
            },
          ],
        },
      }));
      responses.set("/api/annual-conference/2026/volunteer-follow-up/blasts", {
        body: {
          accepted_volunteers: campaignRecipients
            .filter((item) => item.decision === "accepted")
            .map((item) => ({
              id: item.id,
              name: item.applicant_name,
              email: item.applicant_email,
              decision_version: item.decision_version,
            })),
          blasts: [],
          capacity: { known: true, safe_recipients_today: 99 },
        },
      });
      responses.set("/api/annual-conference/2026/volunteer-follow-up/outcomes/delivery-control", (request) => {
        const { delivery_id, action } = JSON.parse(request.postData());
        const row = campaignRecipients.find((item) => item.outcome_delivery.id === delivery_id);

        row.outcome_delivery.held_at = action === "hold" ? new Date().toISOString() : null;
        row.outcome_control = { held: action === "hold", can_hold: action !== "hold", can_resume: action === "hold", reason: null };

        return { body: { held: action === "hold", message: action === "hold" ? "Email on hold." : "Hold removed." } };
      });
      responses.set("/api/annual-conference/2026/volunteer-follow-up/preview", {
        body: {
          from: "DevCongress <volunteers@devcongress.org>",
          subject: "Invitation to volunteer",
          html: "<p>Invitation preview</p>",
          text: "Invitation preview",
          response_deadline: "2026-10-14T23:59:59.000Z",
        },
      });
      responses.set("/api/annual-conference/2026/volunteer-follow-up/test", {
        body: {
          response_deadline: "2026-10-14T23:59:59.000Z",
        },
      });
      responses.set(
        "/api/annual-conference/2026/volunteer-follow-up/outcomes/preview",
        {
          body: {
            preview_id: "00000000-0000-4000-8000-000000000007",
            decision: "accepted",
            eligible_count: 1,
            excluded_count: 0,
            recipients: [{
              recipient_id: "fixture-recipient",
              decision_version: 1,
              name: "Ama Mensah",
              email: "ama@example.com",
              payload: {
                subject: "Your DevCongress 2026 volunteer application",
                text: "Your application has been selected.",
              },
            }],
            from: "DevCongress <volunteers@devcongress.org>",
            subject: "Your DevCongress 2026 volunteer application",
            html: "<html><head></head><body><p>Selected</p></body></html>",
            text: "Your application has been selected.",
          },
        },
      );
      let sampleSendCount = 0;

      responses.set(
        "/api/annual-conference/2026/volunteer-follow-up/outcomes/test",
        (request) => {
          sampleSendCount += 1;

          if (sampleSendCount === 1) return { status: 502, body: { error: "Test acceptance could not be confirmed." } };

          return { body: {
            accepted: true,
            recipient: JSON.parse(request.postData() ?? "{}").email,
            provider_id: "fixture-test-email",
          } };
        },
      );
      responses.set(
        "/api/annual-conference/2026/volunteer-follow-up/outcomes/confirm",
        { body: { queued_count: 1 } },
      );
      responses.set(
        "/api/annual-conference/2026/volunteer-follow-up/outcomes/control",
        (request) => {
          outcomePaused = JSON.parse(request.postData() ?? "{}").action === "pause";

          return { body: { outcome_paused: outcomePaused } };
        },
      );

      await page.goto(`${origin}/organizer-console/annual-conference/2026`);
      await page.getByRole("link", { name: "Volunteers", exact: true }).click();
      await page.waitForURL(
        "**/organizer-console/annual-conference/2026/volunteers",
      );
      await waitForRouteTransition(page);
      await page.getByRole("tab", { name: "Campaign", exact: true }).click();
      const followUp = page.getByRole("region", {
        name: "Volunteer follow-up",
      });

      const campaignSections = followUp.getByRole("tablist", { name: "Campaign sections" });
      const updates = followUp.locator(".volunteer-blasts");

      async function waitForCampaignTabs() {
        await page.clock.runFor(250);
        await page.waitForFunction(() =>
          [...document.querySelectorAll(".follow-up-tabpanel")].every((panel) =>
            getComputedStyle(panel).display === "none" ||
            getComputedStyle(panel).opacity === "1",
          ),
        );
      }

      async function selectCampaignSection(scope, name) {
        await scope.getByRole("tab", { name, exact: true }).click();
        await waitForCampaignTabs();
        assert.equal(await scope.getByRole("tab", { name, exact: true }).getAttribute("aria-selected"), "true");
      }

      await updates.getByRole("heading", { name: "Volunteer updates", exact: true }).waitFor();
      assert.equal(await campaignSections.getByRole("tab", { name: "Volunteer updates", exact: true }).getAttribute("aria-selected"), "true");
      assert.equal(await followUp.getByRole("heading", { name: "Campaign setup", exact: true }).isVisible(), false);
      assert.equal(await followUp.getByRole("region", { name: "Invitation progress", exact: true }).isVisible(), false);
      await updates.getByLabel("Subject", { exact: true }).fill("Volunteer orientation");
      await updates.getByRole("textbox", { name: "Message", exact: true }).fill("Join the volunteer orientation this Sunday.");
      await updates.getByRole("checkbox", { name: "Ama Mensah ama@example.com", exact: true }).check();
      await campaignSections.getByRole("tab", { name: "Volunteer updates", exact: true }).press("End");
      await page.clock.runFor(250);
      assert.equal(await campaignSections.getByRole("tab", { name: "Settings", exact: true }).getAttribute("aria-selected"), "true");
      await campaignSections.getByRole("tab", { name: "Settings", exact: true }).press("Home");
      await page.clock.runFor(250);
      await campaignSections.getByRole("tab", { name: "Volunteer updates", exact: true }).press("ArrowRight");
      await page.clock.runFor(250);
      assert.equal(await campaignSections.getByRole("tab", { name: "Outcome emails", exact: true }).getAttribute("aria-selected"), "true");
      await campaignSections.getByRole("tab", { name: "Outcome emails", exact: true }).press("ArrowLeft");
      await waitForCampaignTabs();
      assert.equal(await updates.getByLabel("Subject", { exact: true }).inputValue(), "Volunteer orientation");
      assert.equal(await updates.getByRole("textbox", { name: "Message", exact: true }).inputValue(), "Join the volunteer orientation this Sunday.");
      assert.equal(await updates.getByRole("checkbox", { name: "Ama Mensah ama@example.com", exact: true }).isChecked(), true);
      assert.equal(await followUp.getByRole("tabpanel").count(), 1);
      await followUp.screenshot({ path: `${artifacts}/volunteer-campaign-updates-desktop.png`, style: ".annual-conference-nav-shell { position: static !important; }" });
      await selectCampaignSection(campaignSections, "Settings");
      await followUp.getByText(
        "Sending is waiting for a verified quota check.",
        { exact: true },
      ).waitFor();
      await followUp.getByText(/Last scheduler run:/).waitFor();
      await selectCampaignSection(campaignSections, "Invitations");
      await followUp.getByText("Invitations pending", { exact: true }).waitFor();
      await followUp.getByText("Queued or sending", { exact: true }).waitFor();
      await followUp.getByText("Responses received", { exact: true }).waitFor();
      await followUp.getByText("Follow-up form submitted", { exact: true }).waitFor();
      await followUp.getByText("Delivery issues", { exact: true }).waitFor();
      await followUp.getByText("Failed, bounced, suppressed, or complained", { exact: true }).waitFor();
      assert.equal(await followUp.locator(".follow-up-summary-stats dd").nth(2).innerText(), "1");
      await page.screenshot({
        path: `${artifacts}/volunteer-follow-up-quota-status-desktop.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForURL("**/organizer-console/mobile/annual-conference/2026*");
      await waitForRouteTransition(page);
      const mobileConference = page.locator(".conference-mobile");

      await mobileConference.waitFor({ state: "visible" });
      await mobileConference.getByRole("tab", { name: "Campaign", exact: true }).click();
      await selectCampaignSection(mobileConference, "Settings");
      await mobileConference.getByText(
        "Sending is waiting for a verified quota check.",
        { exact: true },
      ).waitFor();
      await page.screenshot({
        path: `${artifacts}/volunteer-follow-up-quota-status-mobile.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForURL("**/organizer-console/annual-conference/2026/volunteers");
      await waitForRouteTransition(page);
      await mobileConference.waitFor({ state: "detached" });
      await page.getByRole("tab", { name: "Campaign", exact: true }).click();
      await selectCampaignSection(campaignSections, "Settings");
      await followUp.getByText(
        "Sending is waiting for a verified quota check.",
        { exact: true },
      ).waitFor();

      let outcomes = page.locator(
        "#admin-volunteers-campaign-panel .outcome-campaign:visible",
      );

      await selectCampaignSection(campaignSections, "Outcome emails");
      await outcomes.getByText("Preview checks who can receive this email", { exact: false }).waitFor();
      await outcomes.getByRole("heading", { name: "Acceptance emails", exact: true }).waitFor();
      await outcomes.getByText("Queue delivery", { exact: true }).waitFor();
      await outcomes.getByRole("button", { name: "Use my email", exact: true }).click();
      assert.equal(await outcomes.getByLabel("Test recipient", { exact: true }).inputValue(), "fixture@example.com");
      await outcomes.getByRole("button", { name: "Send acceptance test", exact: true }).click();
      await outcomes.getByRole("alert").filter({ hasText: "Test acceptance could not be confirmed." }).waitFor();

      await outcomes.getByRole("button", { name: "Choose outcome audience" }).click();
      await page.getByRole("option", { name: "Not-selected applicants", exact: true }).click();
      await outcomes.getByRole("heading", { name: "Not-selected emails", exact: true }).waitFor();
      assert.equal(await outcomes.locator(".delivery-row").count(), 1);
      assert.equal(await outcomes.getByText("Not-selected Applicant", { exact: true }).isVisible(), true);
      await outcomes.getByLabel("Test recipient", { exact: true }).fill("sample@example.com");
      await outcomes.getByRole("button", { name: "Send non-acceptance test", exact: true }).click();
      await outcomes.getByRole("status").filter({ hasText: "accepted by Resend for sample@example.com" }).waitFor();
      const sampleRequests = requests.filter((request) => request.path.endsWith("/outcomes/test"));

      assert.equal(sampleRequests.length, 2);
      assert.equal(JSON.parse(sampleRequests[0].body).decision, "accepted");
      assert.equal(JSON.parse(sampleRequests[1].body).decision, "not_selected");

      assert.equal(
        await outcomes.getByRole("button", { name: "Preview rejections", exact: true }).isDisabled(),
        false,
      );
      assert.equal(
        requests.some((request) => request.path.endsWith("/outcomes/confirm")),
        false,
      );
      await outcomes.getByRole("button", { name: "Choose outcome audience" }).click();
      await page.getByRole("option", { name: "Accepted applicants", exact: true }).click();
      await outcomes.getByLabel("Test recipient", { exact: true }).fill("Fixture@Example.com");
      await outcomes.getByRole("button", { name: "Send acceptance test", exact: true }).click();
      await outcomes.getByRole("status").filter({ hasText: "accepted by Resend for Fixture@Example.com" }).waitFor();
      const retriedSamples = requests.filter((request) => request.path.endsWith("/outcomes/test"));

      assert.equal(retriedSamples.length, 3);
      assert.equal(JSON.parse(retriedSamples[0].body).request_id, JSON.parse(retriedSamples[2].body).request_id);
      const deliveries = outcomes.locator(".outcome-deliveries");

      assert.equal(await deliveries.locator(".delivery-row").count(), 10);
      await deliveries.getByRole("button", { name: "Next page", exact: true }).click();
      assert.equal(await deliveries.locator(".delivery-row").count(), 3);
      await deliveries.getByText("Diagnostic Volunteer 13", { exact: true }).waitFor();
      await deliveries.getByRole("button", { name: "Delivered 1", exact: true }).click();
      assert.equal(await deliveries.locator(".delivery-row").count(), 1);
      await deliveries.getByRole("button", { name: "All 13", exact: true }).click();
      await deliveries.getByRole("searchbox").fill("Diagnostic Volunteer 13");
      assert.equal(await deliveries.locator(".delivery-row").count(), 1);
      await deliveries.getByRole("searchbox").fill("");
      await deliveries.getByRole("button", { name: "Hold email for Ama Mensah", exact: true }).click();
      await deliveries.getByRole("button", { name: "Resume email for Ama Mensah", exact: true }).waitFor();
      await deliveries.getByRole("button", { name: "On hold 1", exact: true }).click();
      assert.equal(await deliveries.locator(".delivery-row").count(), 1);
      await deliveries.getByRole("button", { name: "Resume email for Ama Mensah", exact: true }).click();
      await deliveries.getByRole("button", { name: "On hold 0", exact: true }).waitFor();
      await deliveries.getByRole("button", { name: "All 13", exact: true }).click();
      await deliveries.getByRole("button", { name: "Review delivery for Ama Mensah", exact: true }).click();
      await page.locator(".follow-up-selected-drawer").getByText("The sender could not confirm whether Resend accepted the email.", { exact: true }).waitFor();
      assert.equal(await campaignSections.getByRole("tab", { name: "Outcome emails", exact: true }).getAttribute("aria-selected"), "true");
      await page.getByRole("button", { name: "Close applicant details", exact: true }).click();
      await page.locator(".follow-up-selected-drawer").waitFor({ state: "hidden" });
      await deliveries.screenshot({ style: ".annual-conference-nav-shell { position: static !important; }", path: `${artifacts}/outcome-delivery-accepted-desktop.png` });
      await outcomes.getByRole("button", { name: "Choose outcome audience" }).click();
      await page.getByRole("option", { name: "Not-selected applicants", exact: true }).click();
      await deliveries.getByRole("button", { name: "Queue retry for Not-selected Applicant", exact: true }).click();
      await page.getByRole("dialog").getByText(/existing email content and idempotency key/).waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
      assert.equal(requests.some((request) => request.path.endsWith("/delivery-retries")), false);
      await deliveries.screenshot({ style: ".annual-conference-nav-shell { position: static !important; }", path: `${artifacts}/outcome-delivery-not-selected-desktop.png` });
      await outcomes.getByRole("button", { name: "Choose outcome audience" }).click();
      await page.getByRole("option", { name: "Accepted applicants", exact: true }).click();
      await outcomes.scrollIntoViewIfNeeded();

      await outcomes.screenshot({ path: `${artifacts}/volunteer-outcome-campaign.png` });
      await page.setViewportSize({ width: 320, height: 844 });
      await page.waitForURL("**/organizer-console/mobile/annual-conference/2026*");
      await waitForRouteTransition(page);
      await mobileConference.getByRole("tab", { name: "Campaign", exact: true }).click();
      const mobileCampaignSections = mobileConference.getByRole("tablist", { name: "Campaign sections" });

      await mobileCampaignSections.getByRole("tab", { name: "Volunteer updates", exact: true }).waitFor();
      await waitForCampaignTabs();
      await mobileConference.getByRole("region", { name: "Volunteer follow-up", exact: true }).screenshot({ path: `${artifacts}/volunteer-campaign-updates-320.png`, style: "[data-sonner-toaster] { display: none !important; }" });
      await selectCampaignSection(mobileCampaignSections, "Outcome emails");
      const mobileOutcomes = mobileConference.locator(
        "#mobile-volunteers-campaign-panel .outcome-campaign:visible",
      );

      await mobileOutcomes.getByRole("heading", { name: "Acceptance emails", exact: true }).waitFor();
      await mobileOutcomes.scrollIntoViewIfNeeded();
      const mobileOutcomeFits = await mobileOutcomes.evaluate((panel) =>
        panel.getBoundingClientRect().right <= window.innerWidth &&
        document.documentElement.scrollWidth <= window.innerWidth,
      );

      assert.equal(
        mobileOutcomeFits,
        true,
        "The 320px outcome panel must fit without horizontal overflow.",
      );
      await mobileOutcomes.screenshot({ path: `${artifacts}/volunteer-outcome-campaign-320.png` });
      const mobileDeliveries = mobileOutcomes.locator(".outcome-deliveries");

      await mobileDeliveries.getByRole("searchbox").fill("Ama Mensah");
      await mobileDeliveries.getByRole("button", { name: "Review delivery for Ama Mensah", exact: true }).click();
      await page.getByRole("dialog", { name: "Ama Mensah", exact: true }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "Ama Mensah", exact: true }).waitFor({ state: "hidden" });
      assert.equal(await mobileCampaignSections.getByRole("tab", { name: "Outcome emails", exact: true }).getAttribute("aria-selected"), "true");
      assert.equal(await page.locator("#app").getAttribute("inert"), null);
      await mobileDeliveries.screenshot({ style: ".conference-mobile__header { position: static !important; }", path: `${artifacts}/outcome-delivery-accepted-mobile.png` });
      await mobileOutcomes.getByRole("button", { name: "Choose outcome audience" }).click();
      await page.getByRole("option", { name: "Not-selected applicants", exact: true }).click();
      await mobileDeliveries.getByRole("searchbox").fill("");
      await mobileDeliveries.getByRole("button", { name: "Queue retry for Not-selected Applicant", exact: true }).waitFor();
      await mobileDeliveries.screenshot({ style: ".conference-mobile__header { position: static !important; }", path: `${artifacts}/outcome-delivery-not-selected-mobile.png` });

      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForURL("**/organizer-console/annual-conference/2026/volunteers");
      await waitForRouteTransition(page);
      await page.locator("#admin-volunteers-campaign-tab").click();
      await selectCampaignSection(campaignSections, "Outcome emails");
      outcomes = page.locator(
        "#admin-volunteers-campaign-panel .outcome-campaign:visible",
      );
      await outcomes.getByRole("button", { name: "Preview acceptances", exact: true }).waitFor();
      await outcomes.getByLabel("Saved outcome message").getByText(
        "Your DevCongress 2026 volunteer application",
        { exact: true },
      ).waitFor();
      await outcomes.getByRole("button", { name: "Preview acceptances", exact: true }).click();
      const outcomePreview = page.getByRole("dialog", { name: "Send acceptances" });

      await outcomePreview.getByTitle("Rendered outcome email preview").waitFor();
      await page.frameLocator('iframe[title="Rendered outcome email preview"]')
        .getByText("Selected", { exact: true })
        .waitFor();
      await outcomePreview.getByText("Frozen recipients (1)", { exact: true }).waitFor();
      await outcomePreview.getByText("ama@example.com", { exact: true }).waitFor();
      await outcomePreview.getByText("Frozen personalized payload", { exact: true }).click();
      const outcomeRecipientPayload = outcomePreview.locator(".outcome-recipient-payload");

      await outcomeRecipientPayload.getByText(
        "Your DevCongress 2026 volunteer application",
        { exact: true },
      ).waitFor();
      await outcomeRecipientPayload.getByText("Your application has been selected.", { exact: true }).waitFor();
      await outcomePreview.getByText("Sample template preview", { exact: false }).waitFor();
      assert.equal(
        requests.some((request) =>
          request.path.endsWith("/outcomes/preview") &&
          request.method === "POST" &&
          JSON.stringify(JSON.parse(request.body ?? "{}")) === JSON.stringify({ decision: "accepted" }),
        ),
        true,
        "Campaign preview must select a saved template by decision only.",
      );
      await page.waitForFunction(() => {
        const backdrop = document.querySelector(".outcome-backdrop");

        return backdrop !== null && getComputedStyle(backdrop).opacity === "1";
      });
      await page.screenshot({
        path: `${artifacts}/volunteer-outcome-preview.png`,
        fullPage: true,
      });
      await outcomePreview.getByRole("button", { name: "Confirm and queue 1 emails", exact: true }).click();
      await page.getByText("1 outcome email queued.", { exact: true }).waitFor();
      assert.equal(
        requests.some((request) => request.path.endsWith("/outcomes/confirm") && request.method === "POST"),
        true,
      );
      await outcomes.getByRole("button", { name: "Pause queue delivery", exact: true }).click();
      await outcomes.getByRole("button", { name: "Enable queue delivery", exact: true }).waitFor();
      await outcomes.getByRole("button", { name: "Enable queue delivery", exact: true }).click();
      await outcomes.getByRole("button", { name: "Pause queue delivery", exact: true }).waitFor();

      await selectCampaignSection(campaignSections, "Settings");
      await followUp
        .getByRole("button", { name: "Preview", exact: true })
        .click();
      const invitationPreview = page.getByRole("dialog", {
        name: "Invitation email",
      });

      await invitationPreview
        .getByTitle("Rendered invitation email preview")
        .waitFor();
      await invitationPreview
        .getByRole("button", { name: "Close preview", exact: true })
        .click();
      const testFormPagePromise = page.waitForEvent("popup");

      await followUp
        .getByRole("link", { name: "Test volunteer form", exact: true })
        .click();
      const testFormPage = await testFormPagePromise;

      await testFormPage
        .getByRole("button", { name: "Submit final answers", exact: true })
        .waitFor();
      assert.equal(
        new URL(testFormPage.url()).pathname,
        "/volunteer/follow-up/test",
      );
      assert.equal(
        await testFormPage.getByText("Back to campaign", { exact: true }).count(),
        0,
      );
      await testFormPage.close();

      await selectCampaignSection(campaignSections, "Invitations");
      await followUp.locator(".follow-up-recipient").filter({ hasText: "Ama Mensah" }).click();
      const selectedDrawer = followUp.locator(".follow-up-selected-drawer");

      await selectedDrawer.waitFor();
      await selectedDrawer
        .getByText("Resend recorded this email as delivered.", { exact: true })
        .waitFor();
      await selectedDrawer
        .getByText("A same-key scheduled retry is pending. Do not manually queue another retry.", { exact: true })
        .waitFor();
      assert.equal(
        await selectedDrawer.getByRole("button", { name: /Queue .* retry/ }).count(),
        0,
      );
      await selectedDrawer
        .getByRole("button", { name: "Close applicant details", exact: true })
        .click();
      await selectedDrawer.waitFor({ state: "detached" });
      await page.clock.setSystemTime(new Date("2026-09-26T12:31:00.000Z"));
      await page.clock.runFor(30_001);
      await selectCampaignSection(campaignSections, "Settings");
      await followUp.getByText(
        "Sending follows the scheduled queue.",
        { exact: true },
      ).waitFor();
      await followUp.getByText(
        "Historical scheduler result: Sending is waiting for a verified quota check.",
        { exact: true },
      ).waitFor();
      await page.getByRole("tab", { name: "Directory", exact: true }).click();
      await page
        .getByText("Your directory is ready for its first volunteers", {
          exact: true,
        })
        .waitFor();
    },
    { role: "owner", useFakeClock: true },
  );
  for (const role of ["organizer", "volunteer"]) {
    for (const mobile of [false, true]) {
      await journey(
        `volunteer-reviews-${role}-${mobile ? "mobile" : "desktop"}`,
        async ({ page, responses, requests }) => {
          await page.setViewportSize(
            mobile
              ? { width: 390, height: 844 }
              : { width: 1440, height: 1000 },
          );
          const reviewerWorkspace = {
            ...workspace,
            edition,
            permissions: {
              ...workspace.permissions,
              access_scope: "all",
              capabilities: ["volunteers.review_applications"],
            },
          };
          const recipient = {
            id: "fixture-review-recipient",
            name: "Ama Mensah",
            email: "ama@example.com",
            submitted_at: "2026-09-22T10:00:00.000Z",
            motivation: "I want to make the conference welcoming for every person who walks through the door, including first-time attendees who may not yet know anyone. I have organised student groups, enjoy calm logistical work, and will bring patient energy to attendee questions, wayfinding, and the small details that make a long conference day feel cared for.",
            can_attend_accra: true,
            review_status: "unreviewed",
            review_note: null,
            invitation_sent: true,
            decision: "pending",
            decision_version: 0,
            outcome_sent: false,
          };
          const submittedRecipients = Array.from({ length: 21 }, (_, index) => {
            if (index === 0) return recipient;

            const number = String(index + 1).padStart(2, "0");

            return {
              ...recipient,
              id: `fixture-review-recipient-${number}`,
              name:
                index === 1
                  ? "A very long volunteer applicant name that must stay inside the review row"
                  : `Applicant ${number}`,
              email:
                index === 1
                  ? "a-very-long-volunteer-applicant-address-that-must-wrap@example.devcongress.org"
                  : `applicant-${number}@example.com`,
            };
          });
          let reviewRecipients = [
            ...submittedRecipients,
            {
              ...recipient,
              id: "fixture-awaiting-recipient",
              name: "Awaiting Invitation Response",
              email: "awaiting@example.com",
              submitted_at: null,
              motivation: null,
              can_attend_accra: null,
              invitation_sent: true,
            },
            {
              ...recipient,
              id: "fixture-uninvited-recipient",
              name: "Uninvited Applicant",
              email: "uninvited@example.com",
              submitted_at: null,
              motivation: null,
              can_attend_accra: null,
              invitation_sent: false,
            },
          ];
          let persistedRecipient = recipient;
          let shrinkAfterSave = false;
          let outcomeMessages = [
            {
              decision: "accepted",
              version: 3,
              subject: "Original accepted outcome subject",
              message: "Original accepted outcome body.",
            },
            {
              decision: "not_selected",
              version: 2,
              subject: "Original not-selected outcome subject",
              message: "Original not-selected outcome body.",
            },
          ];

          responses.set("/api/annual-conference/2026/work-plan", {
            body: reviewerWorkspace,
          });
          responses.set("/api/annual-conference/editions", {
            body: { editions: [edition] },
          });
          responses.set("/api/admin/organizers", { body: { organizers: [] } });
          responses.set("/api/annual-conference/2026/team", {
            body: { members: [] },
          });
          responses.set("/api/annual-conference/2026/volunteer-applications", {
            body: { applications: [] },
          });
          responses.set(
            "/api/annual-conference/2026/volunteer-follow-up/reviews",
            () => ({
              body: {
                recipients: shrinkAfterSave
                  ? [
                      persistedRecipient,
                      ...reviewRecipients
                        .filter((item) => item.id !== persistedRecipient.id)
                        .slice(0, 12),
                    ]
                  : reviewRecipients,
                outcome_messages: outcomeMessages,
              },
            }),
          );
          responses.set(
            "/api/annual-conference/2026/volunteer-follow-up/outcome-messages",
            (request) => {
              const input = JSON.parse(request.postData() ?? "{}");
              const current = outcomeMessages.find((message) => message.decision === input.decision);

              if (!current || input.expected_version !== current.version) {
                return { status: 409, body: { error: "Outcome message version is stale." } };
              }

              const outcomeMessage = {
                decision: current.decision,
                version: current.version + 1,
                subject: input.subject,
                message: input.message,
              };

              outcomeMessages = outcomeMessages.map((message) =>
                message.decision === outcomeMessage.decision ? outcomeMessage : message,
              );

              return { body: { outcome_message: outcomeMessage } };
            },
          );
          const saveReview = (request) => {
            const recipientId = new URL(request.url()).pathname.split("/").at(-2);
            const input = JSON.parse(request.postData() ?? "{}");
            const currentRecipient = reviewRecipients.find(
              (item) => item.id === recipientId,
            );

            if (!currentRecipient) {
              return { status: 404, body: { error: "Unknown review fixture" } };
            }

            persistedRecipient = {
              ...currentRecipient,
              review_status: input.status,
              review_note: input.note,
              decision: input.decision,
              decision_version: input.expected_version + 1,
            };
            reviewRecipients = reviewRecipients.map((item) =>
              item.id === persistedRecipient.id ? persistedRecipient : item,
            );
            shrinkAfterSave = true;

            return { body: { recipient: persistedRecipient } };
          };

          for (const item of submittedRecipients) {
            responses.set(
              `/api/annual-conference/2026/volunteer-follow-up/recipients/${item.id}/review`,
              saveReview,
            );
          }

          if (mobile) {
            await page.goto(
              `${origin}/organizer-console/mobile/annual-conference/2026`,
            );
            await page
              .getByRole("button", { name: "Volunteers", exact: true })
              .click();
          } else {
            await page.goto(
              `${origin}/organizer-console/annual-conference/2026`,
            );
            await page
              .getByRole("link", { name: "Volunteers", exact: true })
              .click();
            await page.waitForURL(
              "**/organizer-console/annual-conference/2026/volunteers",
            );
          }

          await page.getByRole("tab", { name: "Reviews", exact: true }).click();
          const outcomeTextarea = await page
            .getByLabel("Outcome email message")
            .evaluate((element) => {
              const style = getComputedStyle(element);

              return {
                height: element.getBoundingClientRect().height,
                resize: style.resize,
              };
            });

          assert.equal(outcomeTextarea.resize, "none");
          assert.ok(outcomeTextarea.height <= 104, "Outcome message editor should stay compact.");
          await page.getByLabel("Outcome email subject").fill("Accepted outcome subject saved by reviewer");
          await page.getByLabel("Outcome email message").fill("Accepted outcome body saved by reviewer.");
          await page.getByRole("button", { name: "Save message", exact: true }).click();
          await page.getByText("Outcome message saved as version 4.", { exact: true }).waitFor();
          assert.equal(
            requests.some((request) => {
              const body = JSON.parse(request.body ?? "{}");

              return request.path.endsWith("/outcome-messages") &&
                request.method === "PATCH" &&
                body.decision === "accepted" &&
                body.expected_version === 3 &&
                body.subject === "Accepted outcome subject saved by reviewer" &&
                body.message === "Accepted outcome body saved by reviewer.";
            }),
            true,
            "Reviewers must persist the subject and body with the template version guard.",
          );
          if (mobile) {
            const assertReviewFilterMenuFitsAt320 = async (label) => {
              await page.getByRole("button", { name: label }).click();
              const menu = page.locator(".app-dropdown-menu:visible");

              await menu.waitFor();
              await page.waitForFunction(async () => {
                const element = document.querySelector(".app-dropdown-menu");

                if (!(element instanceof HTMLElement) ||
                  element.style.position !== "fixed" ||
                  element.style.top === "" ||
                  element.style.left === "") {
                  return false;
                }

                const placementSignature = () => [
                  element.dataset.placement,
                  element.style.top,
                  element.style.left,
                  element.style.width,
                  element.style.maxHeight,
                ].join("|");
                let previousSignature = placementSignature();
                let stableFrames = 0;

                for (let frame = 0; frame < 6; frame += 1) {
                  await new Promise(requestAnimationFrame);

                  const currentSignature = placementSignature();

                  stableFrames = currentSignature === previousSignature
                    ? stableFrames + 1
                    : 0;
                  previousSignature = currentSignature;
                }

                return stableFrames >= 4 &&
                  element.style.position === "fixed" &&
                  element.style.top !== "" &&
                  element.style.left !== "";
              }, undefined, { timeout: 8_000 });
              const menuGeometry = await menu.evaluate((element) => {
                const menuBounds = element.getBoundingClientRect();
                const scrollRegion = element.querySelector(".app-dropdown-scroll");
                const visualViewport = window.visualViewport;
                const viewportTop = visualViewport?.offsetTop ?? 0;
                const viewportLeft = visualViewport?.offsetLeft ?? 0;
                const viewportRight = viewportLeft +
                  (visualViewport?.width ?? window.innerWidth);
                const viewportBottom = viewportTop +
                  (visualViewport?.height ?? window.innerHeight);

                const menuRect = {
                  top: menuBounds.top,
                  right: menuBounds.right,
                  bottom: menuBounds.bottom,
                  left: menuBounds.left,
                };
                const menuStyle = {
                  position: element.style.position,
                  top: element.style.top,
                  left: element.style.left,
                  width: element.style.width,
                };
                const viewportRect = {
                  top: viewportTop,
                  right: viewportRight,
                  bottom: viewportBottom,
                  left: viewportLeft,
                };

                if (!(scrollRegion instanceof HTMLElement)) {
                  return {
                    menuRect,
                    menuStyle,
                    scrollRegionPresent: false,
                    viewportRect,
                  };
                }

                const scrollBounds = scrollRegion.getBoundingClientRect();
                const scrollRegionRect = {
                  top: scrollBounds.top,
                  right: scrollBounds.right,
                  bottom: scrollBounds.bottom,
                  left: scrollBounds.left,
                };
                const panelIsContained = menuBounds.top >= viewportTop &&
                  menuBounds.bottom <= viewportBottom &&
                  menuBounds.left >= viewportLeft &&
                  menuBounds.right <= viewportRight;
                const scrollRegionIsContained = scrollBounds.top >= menuBounds.top &&
                  scrollBounds.bottom <= menuBounds.bottom &&
                  scrollBounds.left >= menuBounds.left &&
                  scrollBounds.right <= menuBounds.right;
                const hasUsableScrollRegion = scrollRegion.clientHeight > 0 &&
                  scrollRegion.scrollHeight >= scrollRegion.clientHeight;
                const scrollOffset = scrollRegion.scrollTop;

                scrollRegion.scrollTop = scrollRegion.scrollHeight;
                const scrollsWhenOverflowing =
                  scrollRegion.scrollHeight <= scrollRegion.clientHeight ||
                  scrollRegion.scrollTop > scrollOffset;

                scrollRegion.scrollTop = scrollOffset;

                return {
                  hasUsableScrollRegion,
                  menuRect,
                  menuStyle,
                  panelIsContained,
                  scrollRegionPresent: true,
                  scrollRegionIsContained,
                  scrollRegionRect,
                  scrollsWhenOverflowing,
                  viewportRect,
                  windowViewport: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                  },
                  visualViewport: visualViewport
                    ? {
                        offsetTop: visualViewport.offsetTop,
                        offsetLeft: visualViewport.offsetLeft,
                        width: visualViewport.width,
                        height: visualViewport.height,
                      }
                    : null,
                };
              });

              assert.equal(
                menuGeometry.scrollRegionPresent,
                true,
                `The ${label.toLowerCase()} teleported menu must include its scroll region: ${JSON.stringify(menuGeometry)}`,
              );
              assert.equal(
                menuGeometry.panelIsContained,
                true,
                `The ${label.toLowerCase()} teleported menu must stay inside the visual viewport: ${JSON.stringify(menuGeometry)}`,
              );
              assert.equal(
                menuGeometry.scrollRegionIsContained,
                true,
                `The ${label.toLowerCase()} menu scroll region must stay inside its panel: ${JSON.stringify(menuGeometry)}`,
              );
              assert.equal(
                menuGeometry.hasUsableScrollRegion,
                true,
                `The ${label.toLowerCase()} menu must retain a usable scroll region: ${JSON.stringify(menuGeometry)}`,
              );
              assert.equal(
                menuGeometry.scrollsWhenOverflowing,
                true,
                `The ${label.toLowerCase()} menu must scroll when its options overflow: ${JSON.stringify(menuGeometry)}`,
              );
              await page.keyboard.press("Escape");
              await menu.waitFor({ state: "hidden" });
            };

            for (const width of [320, 390]) {
              await page.setViewportSize({ width, height: 844 });
              const toolbarLayout = await page.locator(".reviews-toolbar").evaluate((toolbar) => {
                const search = toolbar.querySelector(".reviews-search");
                const filters = [...toolbar.querySelectorAll(".reviews-filter-controls > label")];

                if (!search || filters.length !== 4) return false;

                const searchBounds = search.getBoundingClientRect();
                const toolbarBounds = toolbar.getBoundingClientRect();
                const [submissionBounds, reviewBounds, decisionBounds, invitationBounds] = filters.map((filter) =>
                  filter.getBoundingClientRect(),
                );

                return (
                  searchBounds.bottom <= submissionBounds.top &&
                  [submissionBounds, reviewBounds, decisionBounds, invitationBounds].every((bounds) =>
                    bounds.left >= toolbarBounds.left &&
                    bounds.right <= toolbarBounds.right &&
                    bounds.left >= 0 &&
                    bounds.right <= window.innerWidth,
                  ) &&
                  Math.abs(submissionBounds.top - reviewBounds.top) < 1 &&
                  Math.abs(decisionBounds.top - invitationBounds.top) < 1 &&
                  decisionBounds.top > submissionBounds.bottom &&
                  Math.abs(submissionBounds.left - decisionBounds.left) < 1 &&
                  Math.abs(reviewBounds.left - invitationBounds.left) < 1 &&
                  submissionBounds.right <= reviewBounds.left &&
                  decisionBounds.right <= invitationBounds.left
                );
              });

              assert.equal(
                toolbarLayout,
                true,
                `Mobile review toolbar must fit at ${width}px with search above a contained 2x2 filter grid.`,
              );
            }
            await page.setViewportSize({ width: 320, height: 844 });
            for (const label of [
              "Filter by submission status",
              "Filter by review status",
              "Filter by decision",
              "Filter by invitation",
            ]) {
              await assertReviewFilterMenuFitsAt320(label);
            }
            await page.setViewportSize({ width: 390, height: 844 });
          } else {
            await page.setViewportSize({ width: 800, height: 1000 });
            const compactRowsFit = await page.locator(".reviews-list").evaluate((list) => {
              const listBounds = list.getBoundingClientRect();
              const header = list.querySelector(".reviews-row--header");

              return (
                getComputedStyle(header).display === "none" &&
                [...list.querySelectorAll(".reviews-row:not(.reviews-row--header)")].every((row) => {
                  const bounds = row.getBoundingClientRect();

                  return bounds.left >= listBounds.left && bounds.right <= listBounds.right;
                })
              );
            });

            assert.equal(
              compactRowsFit,
              true,
              "Review rows must remain contained at the 800px stacked breakpoint.",
            );
            await page.setViewportSize({ width: 1440, height: 1000 });
          }
          await page
            .getByRole("button", { name: "Filter by submission status" })
            .click();
          const allApplicantsOption = page.getByRole("option", {
            name: "All applicants",
            exact: true,
          });

          await allApplicantsOption.scrollIntoViewIfNeeded();
          await allApplicantsOption.click();
          await allApplicantsOption.waitFor({ state: "hidden" });
          await page.getByText("Showing 1–10 of 23 applicants", { exact: true }).waitFor();
          assert.equal(await page.locator(".reviews-list > button").count(), 10);
          await page.screenshot({
            path: `${artifacts}/volunteer-reviews-${role}-${mobile ? "mobile" : "desktop"}.png`,
            fullPage: true,
          });
          if (mobile) await page.setViewportSize({ width: 320, height: 844 });
          const longResponseReview = page.getByRole("button", {
            name: "Review A very long volunteer applicant name that must stay inside the review row",
          });

          await longResponseReview.click();
          await page.getByText("I want to make the conference welcoming for every person", { exact: false }).waitFor();
          await page.waitForFunction(() => {
            const drawer = document.querySelector(".reviews-drawer");

            return drawer && getComputedStyle(drawer).transform === "none";
          });
          const longDrawerBounds = await page.locator(".reviews-drawer").evaluate((drawer) => {
            const bounds = drawer.getBoundingClientRect();

            return {
              bodyScrollWidth: document.body.scrollWidth,
              drawerLeft: bounds.left,
              drawerRight: bounds.right,
              viewportWidth: window.innerWidth,
              windowScrollWidth: document.documentElement.scrollWidth,
            };
          });

          assert.equal(
            longDrawerBounds.drawerLeft >= 0 &&
              longDrawerBounds.drawerRight <= longDrawerBounds.viewportWidth &&
              longDrawerBounds.windowScrollWidth <= longDrawerBounds.viewportWidth,
            true,
            `The long-identity, long-motivation review drawer must fit without horizontal overflow: ${JSON.stringify(longDrawerBounds)}`,
          );
          await page.locator(".reviews-drawer").screenshot({
            path: `${artifacts}/volunteer-review-drawer-long-top-${role}-${mobile ? "320" : "desktop"}.png`,
          });
          await page.locator(".reviews-drawer-body").evaluate((body) => {
            body.scrollTop = body.scrollHeight;
          });
          const drawerFooterVisible = await page.locator(".reviews-drawer-footer").evaluate((footer) => {
            const bounds = footer.getBoundingClientRect();

            return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
          });

          assert.equal(
            drawerFooterVisible,
            true,
            "The review save footer must remain visible after reading a long response.",
          );
          await page.locator(".reviews-drawer").screenshot({
            path: `${artifacts}/volunteer-review-drawer-long-${role}-${mobile ? "320" : "desktop"}.png`,
          });
          await page.getByRole("button", { name: "Close review", exact: true }).click();
          if (mobile) await page.setViewportSize({ width: 390, height: 844 });
          await page.getByRole("button", { name: "Next page" }).click();
          await page.getByRole("button", { name: "Next page" }).click();
          await page.getByText("Page 3 of 3", { exact: true }).waitFor();
          assert.equal(await page.locator(".reviews-list > button").count(), 3);
          assert.equal(
            await page.getByRole("button", { name: "Next page" }).isDisabled(),
            true,
          );
          await page.getByRole("button", { name: "Previous page" }).click();
          assert.equal(
            await page.getByRole("button", { name: "Previous page" }).isDisabled(),
            false,
          );
          await page
            .getByPlaceholder("Search name, email, or motivation")
            .fill("Applicant 03");
          await page.getByText("Showing 1–1 of 1 applicants", { exact: true }).waitFor();
          await page
            .getByPlaceholder("Search name, email, or motivation")
            .fill("");
          await page
            .getByRole("button", { name: "Filter by review status" })
            .click();
          await page.getByRole("option", { name: "Unreviewed", exact: true }).click();
          await page.getByText("Showing 1–10 of 21 applicants", { exact: true }).waitFor();
          await page
            .getByRole("button", { name: "Filter by review status" })
            .click();
          await page.getByRole("option", { name: "All", exact: true }).click();
          await page.getByRole("button", { name: "Next page" }).click();
          if (mobile) await page.setViewportSize({ width: 320, height: 844 });
          await page
            .getByRole("button", { name: "Filter by submission status" })
            .click();
          await page.getByRole("option", { name: "Awaiting", exact: true }).click();
          await page.getByText("Showing 1–2 of 2 applicants", { exact: true }).waitFor();
          await page.getByText("Awaiting response", { exact: true }).waitFor();
          await page.getByText("Not invited", { exact: true }).waitFor();
          await page
            .getByRole("button", { name: "Filter by submission status" })
            .click();
          const resetAllApplicantsOption = page.getByRole("option", {
            name: "All applicants",
            exact: true,
          });

          await resetAllApplicantsOption.scrollIntoViewIfNeeded();
          await resetAllApplicantsOption.click();
          await page.getByRole("button", { name: "Next page" }).click();
          await page.getByRole("button", { name: "Next page" }).click();
          await page.getByRole("button", { name: "Review Applicant 21" }).click();
          await page.getByText("Why would you like to volunteer?", { exact: true }).waitFor();
          await page.getByText("Can you come to Accra and volunteer on 19 December without travel support?", { exact: true }).waitFor();
          await page.screenshot({
            path: `${artifacts}/volunteer-review-drawer-${role}-${mobile ? "390" : "desktop"}.png`,
            fullPage: true,
          });
          if (mobile) {
            await page.setViewportSize({ width: 320, height: 844 });
            await page.screenshot({
              path: `${artifacts}/volunteer-review-drawer-${role}-320.png`,
              fullPage: true,
            });
            await page.setViewportSize({ width: 390, height: 844 });
          }
          await page.getByRole("button", { name: "Volunteer selection decision" }).click();
          await page.getByRole("option", { name: "Accepted", exact: true }).click();
          await page.getByLabel("Review note").fill("Ready for scheduling.");
          await page
            .getByRole("button", { name: "Save review", exact: true })
            .click();
          await page.getByText("Review saved.", { exact: true }).waitFor();
          assert.equal(
            requests.some((request) =>
              request.path.endsWith("/fixture-review-recipient-21/review") &&
              JSON.parse(request.body ?? "{}").decision === "accepted" &&
              JSON.parse(request.body ?? "{}").expected_version === 0,
            ),
            true,
          );
          assert.equal(
            requests.some((request) => request.path.endsWith("/outcomes/confirm")),
            false,
          );
          await page.getByText("Page 2 of 2", { exact: true }).waitFor();
          await page
            .getByRole("button", { name: "Close review", exact: true })
            .click();
          await page.getByRole("button", { name: "Previous page" }).click();
          await page.getByRole("button", { name: "Review Applicant 21" }).click();
          await page.getByLabel("Review note").waitFor();
          assert.equal(
            await page.getByLabel("Review note").inputValue(),
            "Ready for scheduling.",
          );
          const reviewRowsFit = await page.locator(".reviews-list").evaluate((list) => {
            const listBounds = list.getBoundingClientRect();

            return [...list.querySelectorAll(".reviews-row:not(.reviews-row--header)")].every((row) => {
              const bounds = row.getBoundingClientRect();

              return bounds.left >= listBounds.left && bounds.right <= listBounds.right;
            });
          });

          assert.equal(
            reviewRowsFit,
            true,
            "Review rows must contain long applicant identities without horizontal overflow.",
          );
          assert.equal(
            requests.some(
              (request) =>
                request.path ===
                "/api/annual-conference/2026/volunteer-follow-up",
            ),
            false,
          );
          assert.equal(
            requests.filter(
              (request) =>
                request.path ===
                "/api/annual-conference/2026/volunteer-follow-up/reviews",
            ).length >= 1,
            true,
          );
        },
        { role },
      );
    }
  }
  for (const capability of ["speakers.view", "speakers.manage"]) {
    await journey(`mobile-speakers-${capability}`, async ({ page, responses, requests }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
      responses.set("/api/annual-conference/2026/work-plan", {
        body: { ...workspace, permissions: { ...workspace.permissions, capabilities: [capability, "finance.view", "ticketing.manage"] } },
      });
      responses.set("/api/annual-conference/2026/speakers", {
        body: {
          edition: { ...edition, name: "DevCongress Annual Conference" },
          call: { open: true, public_path: "/speak/c/2026", logistics_deadline: null },
          permissions: { can_manage: capability === "speakers.manage" },
          email_delivery: { configured: false, workspace_links_configured: false },
          counts: { submitted: 0, selected: 0, not_selected: 0, withdrawn: 0 },
          submissions: Array.from({ length: 8 }, (_, index) => ({
            id: `mobile-proposal-${index}`,
            proposal_schema_version: 2,
            title: index === 0 ? "Building resilient community tools: lessons from running a conference with a small team" : `Community proposal ${index + 1}`,
            speaker_name: index === 0 ? "Ama Mensah — Community Engineering" : `Speaker ${index + 1}`,
            speaker_email: "fixture@example.com",
            session_type: "Talk",
            topic: "Engineering",
            abstract: "A fixture proposal for verifying mobile review without production changes.",
            bio: "Community engineer.",
            learning_outcomes: ["Design for recovery"],
            status: index === 7 ? "selected" : "submitted",
            created_at: "2026-10-18T10:00:00Z",
          })),
        },
      });
      await page.goto(`${origin}/organizer-console/mobile/annual-conference/2026`);
      const nav = page.getByRole("navigation", { name: "Annual Conference workspace", exact: true });
      const speakers = nav.getByRole("link", { name: "Speakers", exact: true });

      await speakers.waitFor();
      assert.equal(await nav.getByText("Finance", { exact: true }).count(), 0);
      assert.equal(await nav.getByText("Ticketing", { exact: true }).count(), 0);
      const bounds = await speakers.boundingBox();

      assert.ok(bounds && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= 390);
      await page.screenshot({ path: `${artifacts}/mobile-speakers-${capability}.png`, fullPage: true });
      await speakers.click();
      await page.waitForURL("**/annual-conference/2026/speakers");
      await page.getByRole("heading", { name: "Call for Speakers", exact: true }).waitFor();
      await waitForRouteTransition(page);
      const queue = page.locator(".speaker-queue");
      const cards = queue.locator(".speaker-proposal-card");
      const filters = queue.getByRole("group", { name: "Filter proposals by status" });

      await page.evaluate(() => document.fonts.ready);

      for (const width of [320, 375, 390, 430, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        await page.evaluate(() => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        assert.equal(await page.locator(".speaker-proposal-table").isVisible(), width >= 768);
        assert.equal(await page.locator(".speaker-proposal-list").isVisible(), width < 768);
        if (width >= 768) continue;
        assert.equal(await cards.count(), 6);
        assert.equal(await cards.first().getByText("Ama Mensah — Community Engineering", { exact: true }).isVisible(), true);
        assert.equal(await queue.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
        for (const control of await filters.getByRole("button").all()) {
          const box = await control.boundingBox();
          const geometry = await control.evaluate((element) => ({
            label: element.textContent?.trim(),
            height: element.offsetHeight,
            minHeight: getComputedStyle(element).minHeight,
            transform: getComputedStyle(element).transform,
            fontStatus: document.fonts.status,
            documentWidth: document.documentElement.scrollWidth,
          }));

          assert.ok(
            box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width,
            `${capability} filter at ${width}px: ${JSON.stringify({ box, ...geometry })}`,
          );
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const approvedFilter = filters.getByRole("button", { name: "Approved", exact: true });

      await approvedFilter.click();
      assert.equal(await approvedFilter.getAttribute("aria-pressed"), "true");
      await cards.first().getByText("Community proposal 8", { exact: true }).waitFor();
      assert.equal(await cards.count(), 1);
      const rejectedFilter = filters.getByRole("button", { name: "Rejected", exact: true });

      await rejectedFilter.click();
      assert.equal(await rejectedFilter.getAttribute("aria-pressed"), "true");
      await queue.getByText("No not-selected proposals yet.", { exact: true }).waitFor();
      assert.equal(await cards.count(), 0);
      await filters.getByRole("button", { name: /Pending/ }).click();
      await cards.first().waitFor();
      assert.equal(await cards.count(), 6);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${artifacts}/mobile-speaker-queue-${capability}.png`, fullPage: true });
      await cards.first().click();
      const drawer = page.getByRole("dialog");

      await drawer.waitFor();
      assert.equal(await drawer.getByRole("button", { name: "Approve", exact: true }).count(), capability === "speakers.manage" ? 1 : 0);
      assert.equal(await drawer.getByText("A fixture proposal for verifying mobile review without production changes.", { exact: true }).isVisible(), true);
      await page.getByRole("button", { name: "Close speaker proposal", exact: true }).click();
      await drawer.waitFor({ state: "hidden" });
      assert.equal(await cards.first().evaluate((element) => element === document.activeElement), true);
      await queue.getByRole("button", { name: "Next page", exact: true }).click();
      assert.equal(await cards.count(), 1);
      assert.equal(await cards.first().getByText("Community proposal 7", { exact: true }).isVisible(), true);
      await filters.getByRole("button", { name: "Approved", exact: true }).click();
      assert.equal(await cards.count(), 1);
      assert.equal(await cards.first().getByText("Community proposal 8", { exact: true }).isVisible(), true);
      await filters.getByRole("button", { name: "Rejected", exact: true }).click();
      assert.equal(await queue.getByText("No not-selected proposals yet.", { exact: true }).isVisible(), true);
      assert.equal(requests.some((request) => request.method !== "GET" && request.path.includes("speaker-submissions")), false);
    });
  }

  await journey(
    "volunteer-permissions",
    async ({ page, requests }) => {
      await page.goto(
        `${origin}/organizer-console/mobile/annual-conference/2026`,
      );
      await page.getByText("No tasks assigned yet", { exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Speakers", exact: true }).count(), 0);
      assert.equal(
        await page
          .getByRole("button", { name: "New edition", exact: true })
          .count(),
        0,
      );
      assert.equal(
        requests.some(
          (request) =>
            request.path === "/api/events" ||
            request.path.endsWith("/editions"),
        ),
        false,
      );
    },
    { role: "volunteer" },
  );

  await journey(
    "volunteer-assigned-kanban",
    async ({ page, responses, requests }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const tasks = [
        {
          id: "test-volunteer-accountable",
          title: "TEST — Volunteer accountable task",
          accountable_owner: "fixture@example.com",
          collaborators: [],
          status: "not_started",
        },
        {
          id: "test-volunteer-collaborator",
          title: "TEST — Volunteer collaborator task",
          accountable_owner: "other@example.com",
          collaborators: ["fixture@example.com"],
          status: "in_progress",
        },
      ].map((task, index) => ({
        ...task,
        edition_id: edition.id,
        details: null,
        internal_note: null,
        phase_id: "current",
        workstream: "venue_production_logistics",
        priority: "medium",
        target_date: "2026-09-30",
        dependency_task_ids: [],
        dependency_note: null,
        source: "manual",
        sort_order: index,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      }));

      responses.set("/api/annual-conference/2026/work-plan", {
        body: {
          ...workspace,
          phases: [
            {
              id: "current",
              name: "Current phase",
              label: "Current phase",
              starts_on: "2026-09-01",
              ends_on: "2026-09-30",
              sort_order: 1,
            },
          ],
          tasks,
        },
      });
      responses.set("/api/annual-conference/editions", {
        body: { editions: [edition] },
      });
      responses.set("/api/admin/organizers", { body: { organizers: [] } });
      for (const task of tasks) {
        responses.set(
          `/api/annual-conference/2026/work-plan/${task.id}`,
          (request) => {
            assert.equal(request.method(), "PATCH");
            const input = JSON.parse(request.postData());

            assert.deepEqual(input, {
              status:
                task.id === "test-volunteer-accountable"
                  ? "in_progress"
                  : "done",
            });
            task.status = input.status;

            return { body: task };
          },
        );
      }

      await page.goto(
        `${origin}/organizer-console/annual-conference/2026/work-plan`,
      );
      await assertVisibleBoardCards(page, [
        "Open TEST — Volunteer accountable task",
        "Open TEST — Volunteer collaborator task",
      ]);
      assert.equal(
        await page.getByText("Tasks for", { exact: true }).count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("group", { name: "Filter tasks by owner" })
          .count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "Clear", exact: true }).count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", {
            name: "Open TEST — Volunteer accountable task",
            exact: true,
          })
          .getAttribute("draggable"),
        "true",
      );
      assert.equal(
        await page
          .getByRole("button", {
            name: "Open TEST — Volunteer collaborator task",
            exact: true,
          })
          .getAttribute("draggable"),
        "true",
      );

      const accountableSave = page.waitForRequest((request) =>
        request.url().endsWith("/test-volunteer-accountable"),
      );

      await moveBoardTask(
        page,
        "Open TEST — Volunteer accountable task",
        "In progress",
      );
      await accountableSave;
      await page
        .getByLabel("In progress tasks")
        .getByRole("button", {
          name: "Open TEST — Volunteer accountable task",
          exact: true,
        })
        .waitFor();

      const collaboratorSave = page.waitForRequest((request) =>
        request.url().endsWith("/test-volunteer-collaborator"),
      );

      await moveBoardTask(
        page,
        "Open TEST — Volunteer collaborator task",
        "Done",
      );
      await collaboratorSave;
      await page
        .getByLabel("Done tasks")
        .getByRole("button", {
          name: "Open TEST — Volunteer collaborator task",
          exact: true,
        })
        .waitFor();
      assert.equal(
        requests.filter((request) => request.path.includes("test-volunteer-"))
          .length,
        2,
      );
    },
    { role: "volunteer" },
  );

  await journey(
    "volunteer-full-plan-drag-boundary",
    async ({ page, responses }) => {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const tasks = [
        {
          id: "test-volunteer-manager-owned",
          title: "TEST — Volunteer manager owned task",
          accountable_owner: "fixture@example.com",
        },
        {
          id: "test-volunteer-manager-unrelated",
          title: "TEST — Volunteer manager unrelated task",
          accountable_owner: "other@example.com",
        },
      ].map((task, index) => ({
        ...task,
        edition_id: edition.id,
        details: null,
        internal_note: null,
        phase_id: "current",
        workstream: "venue_production_logistics",
        collaborators: [],
        priority: "medium",
        target_date: "2026-09-30",
        status: "not_started",
        dependency_task_ids: [],
        dependency_note: null,
        source: "manual",
        sort_order: index,
        created_at: "2026-09-01T00:00:00Z",
        updated_at: "2026-09-01T00:00:00Z",
      }));

      responses.set("/api/annual-conference/2026/work-plan", {
        body: {
          ...workspace,
          phases: [
            {
              id: "current",
              name: "Current phase",
              label: "Current phase",
              starts_on: "2026-09-01",
              ends_on: "2026-09-30",
              sort_order: 1,
            },
          ],
          tasks,
          permissions: {
            ...workspace.permissions,
            access_scope: "all",
            can_edit_all_tasks: true,
            can_update_assigned_task_status: false,
          },
        },
      });
      responses.set("/api/annual-conference/editions", {
        body: { editions: [edition] },
      });
      responses.set("/api/admin/organizers", { body: { organizers: [] } });
      responses.set("/api/annual-conference/2026/task-members", {
        body: { organizers: [] },
      });

      await page.goto(
        `${origin}/organizer-console/annual-conference/2026/work-plan`,
      );
      await assertVisibleBoardCards(page, [
        "Open TEST — Volunteer manager owned task",
        "Open TEST — Volunteer manager unrelated task",
      ]);
      assert.equal(
        await page
          .getByRole("button", {
            name: "Open TEST — Volunteer manager owned task",
            exact: true,
          })
          .getAttribute("draggable"),
        "true",
      );
      assert.equal(
        await page
          .getByRole("button", {
            name: "Open TEST — Volunteer manager unrelated task",
            exact: true,
          })
          .getAttribute("draggable"),
        "false",
      );
    },
    { role: "volunteer" },
  );

  await journey("volunteer-intake", async ({ page, responses, requests }) => {
    responses.set("/api/volunteer-applications", { body: { ok: true } });
    await page.goto(`${origin}/volunteer`);
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Fixture Volunteer");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("fixture@example.com");
    await page
      .getByRole("button", { name: "Join the volunteer list", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Thanks, Fixture Volunteer." })
      .waitFor();
    const submissions = requests.filter(
      (request) => request.path === "/api/volunteer-applications",
    );

    assert.equal(submissions.length, 1);
    assert.equal(JSON.parse(submissions[0].body).name, "Fixture Volunteer");
  });

  await journey("provider-recovery", async ({ page, responses }) => {
    responses.set("/api/public/email-preflight", {
      status: 503,
      body: { error: "Email service unavailable. Try again." },
    });
    responses.set("/api/volunteer-applications", { body: { ok: true } });
    await page.goto(`${origin}/volunteer`);
    await page
      .getByLabel("Full name", { exact: true })
      .fill("Fixture Volunteer");
    await page
      .getByLabel("Email address", { exact: true })
      .fill("fixture@example.com");
    await page
      .getByRole("button", { name: "Join the volunteer list", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Email service unavailable" })
      .waitFor();
    assert.equal(
      await page.getByLabel("Full name", { exact: true }).inputValue(),
      "Fixture Volunteer",
    );
    responses.delete("/api/public/email-preflight");
    await page
      .getByRole("button", { name: "Join the volunteer list", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Thanks, Fixture Volunteer." })
      .waitFor();
  });

  await journey("annual-ticketing-sections", async ({ page, responses, requests }) => {
    const base = "/organizer-console/annual-conference/2026/ticketing";
    const inventory = { public_capacity: 150, paid_seats: 1, sponsor_seats_held: 0, checkout_seats_held: 0, remaining_public_seats: 149, reduction_floor: 1 };
    const tiers = [
      { key: "regular", label: "Regular pass", quantity: 1, price_minor: 15000, public: true },
      { key: "team_3", label: "Team of 3", quantity: 3, price_minor: 45000, public: true },
      { key: "team_5", label: "Team of 5", quantity: 5, price_minor: 75000, public: true },
    ];
    const order = {
      id: "ticketing-order", purchaser_name: "Ticketing Fixture", purchaser_email: "ticketing@example.test",
      tier_key: "regular", quantity: 1, amount_minor: 15000, currency: "GHS", status: "paid", payment_mode: "live",
      payment_reference: "fixture-reference", paid_at: "2026-10-16T10:00:00Z", created_at: "2026-10-16T10:00:00Z",
      delivery_status: "delivered", seats: [],
    };

    responses.set("/api/annual-conference/editions", { body: { editions: [edition, { ...edition, year: 2027, label: "December 2027" }] } });
    for (const year of [2026, 2027]) {
      responses.set(`/api/annual-conference/${year}/work-plan`, {
        body: { ...workspace, edition: { ...edition, year }, permissions: { ...workspace.permissions, capabilities: ["ticketing.manage"] } },
      });
      responses.set(`/api/annual-conference/${year}/ticketing`, {
        body: { settings: { public_capacity: 150, ticket_sales_status: "draft", public_mode: "free", currency: "GHS", ticket_tiers: tiers }, inventory },
      });
      responses.set(`/api/annual-conference/${year}/ticketing/orders`, { body: { orders: year === 2026 ? [order] : [], total: year === 2026 ? 1 : 0, page: 1, page_size: 5 } });
      responses.set(`/api/annual-conference/${year}/ticketing/sponsor-allocations`, { body: { allocations: [] } });
      responses.set(`/api/annual-conference/${year}/ticketing/email-deliveries`, { body: {
        deliveries: [], total: 0, page: 1, page_size: 8,
        summary: { queued: 0, sending: 0, accepted: 0, delivered: 0, failed: 0 },
      } });
    }
    responses.set("/api/annual-conference/2026/ticketing/test-coupons", { body: {
      coupons: [], total: 0, page: 1, page_size: 8, checkouts: [{
        id: "sandbox-checkout", payment_reference: "sandbox-reference", purchaser_name: "Sandbox purchaser", purchaser_email: "sandbox@example.test",
        tier_key: "regular", quantity: 1, coupon_code: null, base_amount_minor: 15000, discount_amount_minor: 0,
        amount_minor: 15000, currency: "GHS", status: "verified", resolution_reason: null,
        expires_at: "2026-10-16T10:15:00Z", verified_at: "2026-10-16T10:00:00Z", created_at: "2026-10-16T10:00:00Z",
      }], checkout_total: 1, checkout_page: 1, checkout_page_size: 5,
    } });
    const ordersPath = "/api/annual-conference/2026/ticketing/orders";
    const ordersResponse = responses.get(ordersPath);
    let releaseOrders;
    const ordersHeld = new Promise(resolve => { releaseOrders = resolve; });

    responses.set(ordersPath, async () => {
      await ordersHeld;

      return ordersResponse;
    });
    await page.setViewportSize({ width: 320, height: 667 });

    try {
      await page.goto(`${origin}${base}?section=orders&retained=yes`);
      const loading = page.locator('[data-loading-section="annual-conference-ticket-orders"]');

      await loading.waitFor();
      await page.waitForFunction(() => {
        const loading = document.querySelector('[data-loading-section="annual-conference-ticket-orders"]');
        const height = loading?.getBoundingClientRect().height ?? 0;

        return height >= 200 && height <= 401;
      });
      await loading.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => {
        const loading = document.querySelector('[data-loading-section="annual-conference-ticket-orders"]');
        const region = loading?.getBoundingClientRect();

        if (!loading || !region) return false;

        return [...loading.querySelectorAll('[data-boneyard-bone]')].filter(bone => {
          const bounds = bone.getBoundingClientRect();

          return bounds.height > 0 && bounds.height < 50 && bounds.width < region.width * 0.9
            && bounds.top >= region.top && bounds.bottom <= Math.min(region.bottom, innerHeight)
            && bounds.left >= 0 && bounds.right <= innerWidth;
        }).length >= 6;
      });
      await page.screenshot({ path: `${artifacts}/annual-ticketing-orders-loading-mobile.png` });
    } finally {
      responses.set(ordersPath, ordersResponse);
      releaseOrders();
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}${base}?section=orders&retained=yes`);
    const nav = page.getByRole("navigation", { name: "Ticketing sections", exact: true });

    await page.getByRole("rowheader").getByText("Ticketing Fixture", { exact: true }).waitFor();
    await assertUnderlineTabGeometry(page, '[aria-label="Ticketing sections"]');
    assert.deepEqual(await nav.getByRole("link").allTextContents().then(items => items.map(item => item.trim())), ["Overview", "Orders", "Delivery", "Sponsors", "Testing"]);
    assert.equal(await nav.locator('[aria-current="page"]').innerText(), "Orders");
    assert.equal(requests.some(request => /\/ticketing\/(sponsor-allocations|email-deliveries|test-coupons)$/.test(request.path)), false, "Unvisited section queries stay idle");
    await nav.getByRole("link", { name: "Sponsors", exact: true }).click();
    await page.getByLabel("Sponsor", { exact: true }).fill("Unsubmitted partner draft");
    assert.equal(new URL(page.url()).searchParams.get("retained"), "yes");
    await nav.getByRole("link", { name: "Orders", exact: true }).click();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await page.getByRole("dialog", { name: "Ticketing Fixture", exact: true }).waitFor();
    assert.equal(await page.locator("#app").getAttribute("inert"), "");
    await page.goBack();
    await page.getByLabel("Sponsor", { exact: true }).waitFor();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await page.getByLabel("Sponsor", { exact: true }).inputValue(), "Unsubmitted partner draft");
    assert.equal(await page.locator("#app").getAttribute("inert"), null);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-labelledby="ticket-orders-title"]'))), false, "Back never focuses the hidden order panel");
    await nav.getByRole("link", { name: "Testing", exact: true }).click();
    await page.locator("summary").filter({ hasText: "Create a test coupon" }).click();
    await page.locator("#test-coupon-discount").fill("12.50");
    await nav.getByRole("link", { name: "Overview", exact: true }).click();
    await page.getByRole("heading", { name: "Every reserved seat accounted for", exact: true }).waitFor();
    await nav.getByRole("link", { name: "Testing", exact: true }).click();
    assert.equal(await page.locator("#test-coupon-discount").inputValue(), "12.50", "Visited Testing controls keep their unsaved draft");
    await page.getByRole("button", { name: /^Open private sandbox checkout details/ }).click();
    const sandboxDrawer = page.getByRole("dialog", { name: "Private checkout details", exact: true });

    await sandboxDrawer.waitFor();
    await page.goBack();
    await page.getByRole("heading", { name: "Every reserved seat accounted for", exact: true }).waitFor();
    await sandboxDrawer.waitFor({ state: "detached" });
    assert.equal(await page.locator("#app").getAttribute("inert"), null);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-labelledby="test-coupons-title"]'))), false, "Leaving Testing never focuses its hidden controls");
    await nav.getByRole("link", { name: "Testing", exact: true }).click();
    assert.equal(await page.locator("#test-coupon-discount").inputValue(), "12.50");
    await page.setViewportSize({ width: 320, height: 844 });
    await page.waitForFunction(() => {
      const nav = document.querySelector('[aria-label="Ticketing sections"] .workspace-section-nav__viewport');
      const active = nav?.querySelector('[aria-current="page"]');

      if (!nav || !active) return false;
      const bounds = nav.getBoundingClientRect();
      const selected = active.getBoundingClientRect();

      return selected.left >= bounds.left - 1 && selected.right <= bounds.right + 1;
    });
    await nav.locator('.workspace-section-nav__viewport').evaluate(element => { element.scrollLeft = 0; });
    await nav.locator('.workspace-section-nav__more').waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await nav.getByRole("link", { name: "Orders", exact: true }).click();
    const phoneOrders = page.getByRole("list", { name: "Ticket orders", exact: true });
    const viewOrder = phoneOrders.getByRole("button", { name: "View order from Ticketing Fixture", exact: true });

    await phoneOrders.waitFor();
    assert.equal(await page.locator('[aria-labelledby="ticket-orders-title"] table').isVisible(), false);
    for (const label of ["Pass", "Amount", "Delivery", "Check-in"]) await phoneOrders.getByText(label, { exact: true }).waitFor();
    const orderButton = await viewOrder.boundingBox();

    assert.ok(orderButton && orderButton.height >= 44 && orderButton.x >= 0 && orderButton.x + orderButton.width <= 390);
    await page.screenshot({ path: `${artifacts}/annual-ticketing-orders-mobile.png` });
    await viewOrder.click();
    const phoneDrawer = page.getByRole("dialog", { name: "Ticketing Fixture", exact: true });

    await phoneDrawer.waitFor();
    const closeOrder = phoneDrawer.getByRole("button", { name: "Close ticket order details", exact: true });
    const closeBounds = await closeOrder.boundingBox();

    assert.ok(closeBounds && closeBounds.width >= 44 && closeBounds.height >= 44);
    await closeOrder.click();
    await phoneDrawer.waitFor({ state: "detached" });
    assert.equal(await viewOrder.evaluate(element => element === document.activeElement), true);
    await nav.getByRole("link", { name: "Delivery", exact: true }).click();
    await page.getByRole("heading", { name: "Delivery health", exact: true }).waitFor();
    assert.equal(await nav.locator('[aria-current="page"]').innerText(), "Delivery");
    assert.equal(await page.locator("body").evaluate(element => element.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `${artifacts}/annual-ticketing-delivery-mobile.png` });
    await page.goto(`${origin}${base}?section=orders&section=delivery&retained=yes`);
    await page.waitForURL(url => url.searchParams.getAll("section").length === 1 && url.searchParams.get("section") === "overview");
    assert.equal(new URL(page.url()).searchParams.get("retained"), "yes");

    const nextYear = "/organizer-console/annual-conference/2027/ticketing";

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}${nextYear}?section=testing&retained=yes`);
    await page.waitForURL(url => url.searchParams.get("section") === "overview");
    assert.equal(await nav.getByRole("link", { name: "Testing", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Edit prices", exact: true }).waitFor();
    assert.equal(requests.some(request => request.path === "/api/annual-conference/2027/ticketing/orders"), true, "Overview retains the non-2026 pricing eligibility read");
    await nav.getByRole("link", { name: "Orders", exact: true }).click();
    await nav.getByRole("link", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: "Edit prices", exact: true }).click();
    await page.getByRole("dialog", { name: "Set ticket prices", exact: true }).waitFor();
    await page.goBack();
    await page.getByRole("heading", { name: "Ticket orders", exact: true }).waitFor();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await page.locator("#app").getAttribute("inert"), null);
    assert.equal(await page.evaluate(() => document.documentElement.style.overflow), "");
    assert.equal(requests.filter(request => request.method !== "GET").length, 0, "Section browsing and retained drafts send no mutations");
  }, { role: "owner" });

  await journey("annual-paid-payment-mode", async ({ page, responses, requests }) => {
    const paymentPath = "/api/annual-conference/2026/registrations/payment-mode";
    let paymentSettings;

    responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
    responses.set("/api/annual-conference/2026/work-plan", {
      body: { ...workspace, edition, permissions: { ...workspace.permissions, capabilities: ["ticketing.manage"] } },
    });
    responses.set("/api/annual-conference/2026/ticketing", {
      body: { settings: { public_capacity: 150 }, inventory: { reduction_floor: 0 } },
    });
    responses.set("/api/annual-conference/2026/registrations", {
      body: { overview: { mode: "paid", status: "open", capacity: 150, reserved: 0, confirmed: 0, waitlisted: 0 }, registrations: [] },
    });
    responses.set("/api/annual-conference/2026/registrations/blasts", { body: { blasts: [] } });
    responses.set("/api/annual-conference/2026/registrations/testing", () => ({
      body: { enabled: paymentSettings.payment_mode === "test", tester_emails: paymentSettings.tester_emails, local_delivery: false },
    }));
    responses.set(paymentPath, (request) => {
      if (request.method() === "PATCH") {
        const input = JSON.parse(request.postData() ?? "{}");

        assert.deepEqual(input, {
          payment_mode: "live", settings_version: 1,
          tester_emails: ["fixture@example.test", "second@example.test"], confirmed: true,
        });
        paymentSettings = { ...paymentSettings, ...input, settings_version: 2 };
      }

      return { body: paymentSettings };
    });

    for (const [width, label] of [[1440, "desktop"], [390, "390"]]) {
      paymentSettings = {
        payment_mode: "test", settings_version: 1, tester_emails: ["fixture@example.test"],
        readiness: { test: { ready: true, reasons: [] }, live: { ready: true, reasons: [] } },
      };
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/registrations?section=form`);
      const panel = page.locator(".payment-mode-settings");

      await panel.getByText("Current: Testing", { exact: true }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Testing settings", exact: true }).count(), 0);
      await panel.getByRole("radio", { name: /^Live/ }).check();
      await panel.getByLabel("Approved tester emails", { exact: true }).fill(" FIXTURE@EXAMPLE.TEST\nfixture@example.test\nsecond@example.test");
      const patchesBefore = requests.filter((request) => request.path === paymentPath && request.method === "PATCH").length;

      await panel.getByRole("button", { name: "Review payment settings", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Enable real payments?" });

      await dialog.getByText(/will charge real money/).waitFor();
      assert.equal(paymentSettings.payment_mode, "test");
      assert.equal(requests.filter((request) => request.path === paymentPath && request.method === "PATCH").length, patchesBefore);
      await page.waitForFunction(() => !document.querySelector(".confirm-dialog-enter-active"));
      await page.screenshot({ path: `${artifacts}/annual-payment-live-confirmation-${label}.png` });
      await dialog.getByRole("button", { name: "Save payment settings", exact: true }).click();
      await panel.getByText("Current: Live", { exact: true }).waitFor();
      await dialog.waitFor({ state: "detached" });
      await page.locator(".confirm-dialog-shell").waitFor({ state: "detached" });
      assert.deepEqual(paymentSettings.tester_emails, ["fixture@example.test", "second@example.test"]);
      assert.equal(requests.filter((request) => request.path === paymentPath && request.method === "PATCH").length, patchesBefore + 1);
      const bounds = await panel.boundingBox();

      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, "Payment controls stay within the viewport");
      await panel.screenshot({ path: `${artifacts}/annual-payment-mode-${label}.png` });
    }

    const modeRequestsBefore = requests.filter((request) => request.path === paymentPath).length;

    responses.set("/api/auth/session", { body: {
      authenticated: true, auth_configured: true,
      user: { email: "organizer@example.test", display_name: "Fixture Organizer", role: "organizer" },
    } });
    await page.reload();
    await page.getByRole("heading", { name: "Form & capacity", exact: true }).waitFor();
    assert.equal(await page.locator(".payment-mode-settings").count(), 0, "Organizers cannot see Owner payment-mode controls");
    assert.equal(requests.filter((request) => request.path === paymentPath).length, modeRequestsBefore);
  }, { role: "owner" });

  await journey("annual-registration-workspace", async ({ page, responses, requests }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const overview = { mode: "free", status: "open", capacity: 150, reserved: 101, confirmed: 101, waitlisted: 0 };

    responses.set("/api/annual-conference/2026/registrations/testing", { body: { enabled: false, tester_emails: [], local_delivery: false } });
    const guests = Array.from({ length: 101 }, (_, index) => ({
      id: "guest-" + index, name: index === 100 ? "Zara Finalpage" : "Ada Guest " + index,
      email: "guest" + index + "@example.test", status: "confirmed", is_test: false,
      created_at: "2026-10-16T09:00:00Z",
      ticket_id: index === 100 ? "ticket-zara" : null,
    }));

    responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
    responses.set("/api/annual-conference/2026/work-plan", {
      body: { ...workspace, edition, permissions: { ...workspace.permissions, capabilities: ["ticketing.manage"] } },
    });
    responses.set("/api/annual-conference/2026/ticketing", {
      body: { settings: { public_capacity: 150 }, inventory: { reduction_floor: 101 } },
    });
    responses.set("/api/annual-conference/2026/registrations", (request) => {
      const offset = Number(new URL(request.url()).searchParams.get("offset") ?? 0);

      return { body: { overview, registrations: guests.slice(offset, offset + 100) } };
    });
    let blastCreated = false;

    responses.set("/api/annual-conference/2026/registrations/blasts", (request) => {
      if (request.method() === "POST") blastCreated = true;

      return { body: { blasts: blastCreated ? [{ id: "blast-1", subject: "Fixture update", body: "Fixture message", status: "draft", recipients: 101, accepted: 0, needs_attention: 0 }] : [] } };
    });
    responses.set("/api/annual-conference/2026/registrations/blasts/blast-1/send", { body: {} });
    responses.set("/api/annual-conference/2026/ticketing/email-deliveries", {
      body: {
        deliveries: [{
          id: "mail-1", order_id: null, kind: "waitlist_notice",
          recipient_name: "Fixture Recipient", recipient_email: "fixture@example.test",
          status: "failed", attempt_count: 1, provider_email_id: null, accepted_at: null,
          next_attempt_at: "2026-10-16T12:05:00.000Z", created_at: "2026-10-16T12:00:00.000Z",
        }],
        total: 1, page: 1, page_size: 8, summary: { accepted: 3, delivered: 2, queued: 1, sending: 0, failed: 1 },
      },
    });
    responses.set("/api/annual-conference/2026/ticketing/email-deliveries/mail-1/retry", { body: { delivery: {} } });
    const zara = { ticket_id: "ticket-zara", attendee_name: "Zara Finalpage", status: "issued", checked_in_at: null, order_seat_number: 1 };

    responses.set("/api/annual-conference/2026/check-in/attendees", () => ({
      body: { attendees: [zara], page: 1, page_size: 100, has_more: false },
    }));
    responses.set("/api/annual-conference/2026/check-in/admit", () => {
      zara.status = "checked_in";
      zara.checked_in_at = "2026-12-19T10:00:00Z";

      return { body: { outcome: "checked_in" } };
    });

    await page.goto(origin + "/organizer-console/annual-conference/2026/registrations");
    await page.getByRole("heading", { name: "Registration overview" }).waitFor();
    await assertUnderlineTabGeometry(page, '[aria-label="Registration sections"]');
    await assertUnderlineTabGeometry(page, '[aria-label="Annual Conference workspace"]');
    const nav = page.getByRole("navigation", { name: "Registration sections" });

    assert.deepEqual(await nav.getByRole("link").allTextContents().then((items) => items.map((item) => item.trim())), [
      "Summary", "Guests", "Form & capacity", "Emails", "Community seats", "Blasts",
    ]);
    const headingBefore = await page.getByRole("heading", { name: "Registration", exact: true }).boundingBox();

    await page.screenshot({ path: artifacts + "/annual-registration-summary-desktop.png", fullPage: true });
    await nav.getByRole("link", { name: "Guests", exact: true }).click();
    await page.getByLabel("Search guests").fill("Finalpage");
    await page.getByText("Zara Finalpage", { exact: true }).waitFor();
    assert.equal(await page.getByText("Zara Finalpage", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Admit guest", exact: true }).click();
    await page.getByLabel("Already checked in").waitFor();
    responses.set("/api/annual-conference/2026/check-in/search", { body: { attendees: [
      { ticket_id: "paid-ticket", attendee_name: "Paid Guest", status: "issued", checked_in_at: null },
    ] } });
    await page.getByLabel("Search guests").fill("paid@example.test");
    await page.getByRole("button", { name: "Find exact email", exact: true }).click();
    await page.getByText("Paid Guest", { exact: true }).waitFor();
    assert.equal(await page.getByText("Zara Finalpage", { exact: true }).count(), 0);
    await page.getByLabel("Search guests").fill("Finalpage");
    assert.equal(await nav.locator('[aria-current="page"]').count(), 1);
    assert.equal(await nav.locator('[aria-current="page"]').innerText(), "Guests");
    await page.screenshot({ path: artifacts + "/annual-registration-guests-desktop.png", fullPage: true });
    await nav.getByRole("link", { name: "Emails", exact: true }).click();
    await page.getByText("Waitlist notice", { exact: true }).waitFor();
    const detailsButton = page.getByRole("button", { name: "Details", exact: true });

    await detailsButton.click();
    const emailDrawer = page.getByRole("dialog", { name: "Email details" });

    await emailDrawer.getByText("Fixture Recipient", { exact: true }).waitFor();
    assert.equal(await page.locator("#app").getAttribute("inert"), "");
    await page.locator(".registration-email-drawer-enter-active").waitFor({ state: "detached" });
    await page.screenshot({ path: artifacts + "/registration-email-drawer-desktop.png" });
    await page.keyboard.press("Escape");
    await emailDrawer.waitFor({ state: "detached" });
    assert.equal(await detailsButton.evaluate((element) => element === document.activeElement), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await detailsButton.click();
    await emailDrawer.waitFor();
    assert.equal(await emailDrawer.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
    await page.locator(".registration-email-drawer-enter-active").waitFor({ state: "detached" });
    await page.screenshot({ path: artifacts + "/registration-email-drawer-mobile.png" });
    await emailDrawer.getByRole("button", { name: "Close email details" }).click();
    await emailDrawer.waitFor({ state: "detached" });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    assert.equal(requests.filter((item) => item.path.endsWith("/mail-1/retry")).length, 0);
    await page.getByRole("button", { name: "Queue retry", exact: true }).click();
    await page.getByText("Email queued for retry.", { exact: false }).waitFor();
    await nav.getByRole("link", { name: "Blasts", exact: true }).click();
    await page.getByRole("button", { name: "Create blast", exact: true }).click();
    await page.getByLabel("Subject", { exact: true }).fill("Fixture update");
    await page.getByLabel("Message", { exact: true }).fill("Fixture message");
    await page.getByRole("button", { name: "Review draft", exact: true }).click();
    await page.getByRole("button", { name: "Prepare draft", exact: true }).click();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    assert.equal(requests.filter((item) => item.path.endsWith("/blast-1/send")).length, 0);
    await page.getByRole("button", { name: "Queue update", exact: true }).click();
    await page.getByText("Update queued.", { exact: true }).waitFor();
    await nav.getByRole("link", { name: "Guests", exact: true }).click();
    await page.getByRole("button", { name: "Scan with camera", exact: true }).waitFor();
    await page.locator(".page-leave-active, .page-stable-leave-active").waitFor({ state: "detached" });
    await page.locator(".page-enter-active, .page-stable-enter-active").waitFor({ state: "detached" });
    const headingAfter = await page.getByRole("heading", { name: "Registration", exact: true }).boundingBox();

    assert.ok(Math.abs(headingBefore.x - headingAfter.x) < 1);
    assert.ok(Math.abs(headingBefore.y - headingAfter.y) < 1);
    assert.equal(await page.getByText("Welcome them in.", { exact: true }).count(), 0);
    await page.screenshot({ path: artifacts + "/annual-registration-checkin-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const checkInPanel = await page.getByRole("region", { name: "Conference attendee check-in" }).boundingBox();

    assert.ok(checkInPanel.x >= 0 && checkInPanel.x + checkInPanel.width <= 391, "Check-in panel must fit the mobile viewport");
    await page.screenshot({ path: artifacts + "/annual-registration-checkin-mobile.png", fullPage: true });
    await page.goto(origin + "/organizer-console/annual-conference/2026/check-in");
    await page.waitForURL(/\/registrations\?section=guests$/);
    guests[0].status = "waitlisted";
    responses.set("/api/annual-conference/2026/check-in/attendees", { status: 503, body: { error: "Fixture outage" } });
    await page.reload();
    await page.getByRole("alert").filter({ hasText: "complete attendee list" }).waitFor();
    await page.getByLabel("Search guests").fill("guest0@example.test");
    const waitlistedRow = page.getByRole("listitem").filter({ hasText: "guest0@example.test" });

    await waitlistedRow.waitFor();
    assert.equal(await waitlistedRow.getByRole("button", { name: "Cancel registration", exact: true }).isEnabled(), true);
    guests[0].status = "cancelled";
    let recoveryBlocked = true;

    responses.set("/api/annual-conference/2026/registrations/guest-0/recover", (request) => {
      if (recoveryBlocked) return { status: 409, body: { error: "Open free registration before recovering this guest." } };
      assert.deepEqual(request.postDataJSON(), { confirmed: true });
      guests.push({ ...guests[0], id: "guest-recovered", status: "waitlisted", recovered_from_id: "guest-0" });

      return { body: { recovery: { registration_id: "guest-recovered", status: "waitlisted", created: true } } };
    });
    await page.reload();
    await page.getByLabel("Search guests").fill("guest0@example.test");
    await page.getByRole("button", { name: "Recover registration", exact: true }).click();
    assert.equal(requests.filter((item) => item.path.endsWith("/guest-0/recover")).length, 0);
    await page.getByRole("dialog").getByRole("button", { name: "Recover and queue email", exact: true }).click();
    await page.getByRole("dialog").getByRole("alert").filter({ hasText: "Open free registration before recovering this guest." }).waitFor();
    recoveryBlocked = false;
    await page.getByRole("dialog").getByRole("button", { name: "Recover and queue email", exact: true }).click();
    await page.getByText("Registration recovered as waitlisted. A fresh email is queued; delivery is not yet confirmed.", { exact: true }).waitFor();
    await page.getByText("Recovered as a new registration", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Recover registration", exact: true }).count(), 0);
    assert.equal(requests.filter((item) => item.path.endsWith("/guest-0/recover")).length, 2);
  }, { role: "owner" });

  await journey("annual-check-in-list-first", async ({ page, responses, requests }) => {
    const attendees = [
      {
        ticket_id: "ticket-adjoa",
        attendee_name: "Adjoa Mensah",
        status: "issued",
        checked_in_at: null,
        order_seat_number: 1,
      },
      {
        ticket_id: "ticket-kofi",
        attendee_name: "Kofi Mensah",
        status: "issued",
        checked_in_at: null,
        order_seat_number: 2,
      },
      {
        ticket_id: "ticket-unnamed",
        attendee_name: null,
        status: "issued",
        checked_in_at: null,
        order_seat_number: 3,
      },
    ];

    responses.set("/api/annual-conference/editions", {
      body: { editions: [edition] },
    });
    responses.set("/api/annual-conference/2026/work-plan", {
      body: {
        ...workspace,
        edition,
        permissions: { ...workspace.permissions, capabilities: ["ticketing.check_in"] },
      },
    });
    responses.set("/api/annual-conference/2026/check-in/attendees", (request) => {
      const url = new URL(request.url());
      const requestedPage = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("page_size") ?? 100);
      const from = (requestedPage - 1) * pageSize;
      const rows = attendees.slice(from, from + pageSize);

      return {
        body: {
          attendees: rows,
          page: requestedPage,
          page_size: pageSize,
          has_more: from + pageSize < attendees.length,
        },
      };
    });
    responses.set("/api/annual-conference/2026/check-in/admit", (request) => {
      const { ticket_id: ticketId } = JSON.parse(request.postData() ?? "{}");
      const attendee = attendees.find((ticket) => ticket.ticket_id === ticketId);

      if (!attendee || attendee.status === "checked_in")
        return { body: { outcome: "already_checked_in" } };
      attendee.status = "checked_in";
      attendee.checked_in_at = "2026-12-19T10:00:00.000Z";

      return { body: { outcome: "checked_in" } };
    });
    await page.goto(`${origin}/organizer-console/annual-conference/2026/registrations`);
    await page.waitForURL(/\/annual-conference\/2026\/check-in$/);
    await page.goto(`${origin}/organizer-console/annual-conference/2026/check-in`);
    await page.getByText("Adjoa Mensah", { exact: true }).waitFor();
    assert.equal(
      requests.some((request) => request.path.endsWith("/check-in/attendees")),
      true,
    );
    assert.equal(await page.getByRole("navigation", { name: "Registration sections" }).getByRole("link", { name: "Registration", exact: true }).count(), 0);
    assert.deepEqual(await page.getByRole("navigation", { name: "Registration sections" }).getByRole("link").allTextContents().then((items) => items.map((item) => item.trim())), ["Guests"]);
    assert.equal(requests.some((request) => request.path.endsWith("/registrations")), false);
    assert.equal(await page.getByRole("navigation", { name: "Annual Conference workspace" }).getByRole("link", { name: "Ticketing", exact: true }).count(), 0);

    await page.getByLabel("Search guests").fill("Kofi");
    await page.getByText("Kofi Mensah", { exact: true }).waitFor();
    assert.equal(await page.getByText("Adjoa Mensah", { exact: true }).count(), 0);
    await page.getByLabel("Search guests").fill("");
    await page
      .getByRole("button", { name: "Show guests whose names start with A" })
      .click();
    await page.getByText("Adjoa Mensah", { exact: true }).waitFor();
    assert.equal(await page.getByText("Kofi Mensah", { exact: true }).count(), 0);
    await page
      .getByRole("button", { name: "Show guests whose names start with U" })
      .click();
    const unnamedTicket = page.getByRole("listitem").filter({
      hasText: "Unnamed ticket",
    });

    await unnamedTicket.waitFor();
    assert.equal(
      await unnamedTicket.getByRole("button", { name: "Check in" }).count(),
      0,
    );
    assert.match(await unnamedTicket.innerText(), /QR only/i);

    await page
      .getByRole("button", { name: "Show all guests" })
      .click();
    await page.getByLabel("Search guests").fill("Kofi");
    await page.getByRole("button", { name: "Check in", exact: true }).click();
    await page.getByRole("dialog", { name: "Confirm guest check-in" }).waitFor();
    await page.getByRole("button", { name: "Admit guest" }).click();
    await page.getByLabel("Attendees", { exact: true }).getByText("Checked in", { exact: true }).waitFor();
    assert.equal(
      requests.filter(
        (request) => request.path.endsWith("/check-in/admit") && request.method === "POST",
      ).length,
      1,
    );

    await page.evaluate(() => {
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: () => {
            const count = Number(sessionStorage.getItem("fixture-camera-requests") ?? 0);

            sessionStorage.setItem("fixture-camera-requests", String(count + 1));

            return Promise.reject(new Error("Fixture permission denied"));
          },
        },
      });
    });
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("fixture-camera-requests")),
      null,
    );
    await page.getByRole("button", { name: "Scan with camera" }).click();
    await page.getByText("Camera access failed.", { exact: false }).waitFor();
    assert.equal(
      await page.evaluate(() => sessionStorage.getItem("fixture-camera-requests")),
      "1",
    );
  }, { role: "volunteer" });

  for (const [name, date, allowed] of [
    ["check-in-before", "2026-09-25T12:00:00Z", false],
    ["check-in-day", "2026-09-26T12:00:00Z", true],
    ["check-in-after", "2026-09-27T12:00:00Z", false],
  ]) {
    await journey(
      name,
      async ({ page, responses, requests }) => {
        let checked = false;

        responses.set("/api/events/fixture-event/registrations", () => ({
          body: {
            managed_internally: true,
            registrations: [
              {
                id: "guest",
                name: "Fixture Guest",
                email: "guest@example.com",
                status: "confirmed",
                checked_in_at: checked ? date : null,
              },
            ],
          },
        }));
        responses.set(
          "/api/events/fixture-event/registrations/guest/check-in",
          () => {
            checked = true;

            return { body: { checked_in_at: date } };
          },
        );
        await page.goto(
          `${origin}/organizer-console/mobile/events/fixture-event/check-in`,
        );
        const button = page.getByRole("button", {
          name: "Check in",
          exact: true,
        });

        await button.waitFor();
        assert.equal(await button.isEnabled(), allowed);
        if (allowed) {
          await button.click();
          await page.getByText("Checked in", { exact: true }).waitFor();
          assert.equal(
            requests.filter((request) => request.method === "POST").length,
            1,
          );
        } else
          assert.equal(
            requests.some((request) => request.method === "POST"),
            false,
          );
      },
      { date },
    );
  }
} finally {
  await browser?.close();
  server.kill();
  await writeFile(
    `${artifacts}/results.json`,
    JSON.stringify(results, null, 2),
  );
  await writeFile(`${artifacts}/server.log`, serverLog);
}
console.log(JSON.stringify(results, null, 2));
if (!results.length || results.some((result) => result.status !== "passed"))
  process.exitCode = 1;
