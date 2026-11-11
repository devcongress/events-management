import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { stripVTControlCharacters } from "node:util";
import { chromium } from "playwright";

// Serve only built static assets: no application server, credentials, or database.
const portText = process.env.ORGANIZER_JOURNEY_PORT ?? "4189";

if (!/^[1-9]\d{0,4}$/.test(portText) || Number(portText) > 65535) {
  throw new Error("ORGANIZER_JOURNEY_PORT must be an integer from 1 to 65535.");
}
const origin = `http://127.0.0.1:${portText}`;
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
    portText,
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let serverLog = "";
let serverError;

server.on("error", (error) => {
  serverError = error;
});

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
const ownerCapabilities = [
  'work_plan.tasks.view',
  'work_plan.tasks.manage',
  'work_plan.timeline.view',
  'work_plan.phases.manage',
  'volunteers.directory.view',
  'volunteers.intake.share',
  'volunteers.reviews.view',
  'volunteers.reviews.manage',
  'volunteers.campaign.view',
  'volunteers.campaign.manage',
  'volunteers.campaign.send',
  'programme.view',
  'programme.manage',
  'speakers.proposals.view',
  'speakers.proposals.manage',
  'speakers.participation.view',
  'speakers.participation.manage',
  'speakers.delivery.view',
  'speakers.delivery.manage',
  'speakers.delivery.retry',
  'speakers.outcomes.view',
  'speakers.outcomes.manage',
  'speakers.outcomes.send',
  'finance.view',
  'ticketing.overview.view',
  'ticketing.overview.manage',
  'ticketing.orders.view',
  'ticketing.orders.manage',
  'ticketing.delivery.view',
  'ticketing.delivery.manage',
  'ticketing.delivery.retry',
  'ticketing.sponsors.view',
  'ticketing.sponsors.manage',
  'ticketing.complimentary.view',
  'ticketing.complimentary.manage',
  'ticketing.coupons.view',
  'ticketing.coupons.manage',
  'registration.summary.view',
  'registration.guests.view',
  'registration.guests.manage',
  'registration.form.view',
  'registration.form.manage',
  'registration.emails.view',
  'registration.emails.manage',
  'registration.emails.retry',
  'registration.community.view',
  'registration.community.manage',
  'registration.blasts.view',
  'registration.blasts.manage',
  'registration.blasts.send',
  'ticketing.check_in',
];
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

async function chooseWorkspaceSection(page, nav, label) {
  const picker = nav.locator('.app-dropdown-trigger');

  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole('option', { name: label, exact: true }).click();
  } else {
    await nav.getByRole('link', { name: label, exact: true }).click();
  }
}

async function assertWorkspaceSection(nav, label) {
  const picker = nav.locator('.app-dropdown-trigger');

  if (await picker.isVisible()) assert.match(await picker.innerText(), new RegExp(label));
  else assert.equal(await nav.getByRole('link', { name: label, exact: true }).getAttribute('aria-current'), 'page');
}

async function orderSkeletonBones(loader) {
  await loader.locator("[data-boneyard-bone]").first().waitFor({ state: "attached" });
  await loader.evaluate(() => document.fonts.ready);

  return loader.evaluate((element) => {
    const origin = element.getBoundingClientRect();

    return [...element.querySelectorAll("[data-boneyard-bone]")].map((bone) => {
      const rect = bone.getBoundingClientRect();

      return { x: rect.x + rect.width / 2 - origin.x, y: rect.y + rect.height / 2 - origin.y, w: rect.width, h: rect.height };
    });
  });
}

async function orderElementBounds(region, element, textOnly = false) {
  const rect = await element.evaluate((item, useText) => {
    const range = document.createRange();

    range.selectNodeContents(item);
    const bounds = useText ? range.getBoundingClientRect() : item.getBoundingClientRect();

    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, w: bounds.width, h: bounds.height };
  }, textOnly);
  const origin = await region.boundingBox();

  return { x: rect.x - origin.x, y: rect.y - origin.y, w: rect.w, h: rect.h };
}

function assertOrderPlaceholder(bones, field, label, { textOffset = 0 } = {}) {
  const closest = bones.filter((bone) => bone.w > 8 && bone.h >= 8 && bone.h <= 48)
    .sort((a, b) => Math.hypot(a.x - field.x, a.y - field.y) - Math.hypot(b.x - field.x, b.y - field.y))[0];

  assert.ok(closest, `Missing placeholder for ${label}`);
  // Bones scale as percentages of the available panel width. Real buttons keep
  // their intrinsic size when a platform scrollbar narrows the panel.
  const xTolerance = Math.max(Math.min(16, field.w * 0.2), textOffset);
  const yTolerance = Math.max(5, field.h * 0.15);

  assert.ok(Math.abs(field.x - closest.x) <= xTolerance && Math.abs(field.y - closest.y) <= yTolerance
    && Math.abs(field.w - closest.w) <= 10,
  `Misaligned ${label}: field ${JSON.stringify(field)}, nearest bone ${JSON.stringify(closest)}`);
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

async function expandProgrammeRow(page, row) {
  const toggle = row.locator('.programme-mobile-toggle');

  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

async function journey(
  name,
  run,
  { role = "organizer", date = "2026-09-26T12:00:00Z", useFakeClock = false } = {},
) {
  if (process.env.ORGANIZER_JOURNEY_FILTER && !name.includes(process.env.ORGANIZER_JOURNEY_FILTER)) return;

  const started = Date.now();
  let status = "failed";

  console.log(`[journey] start ${name}`);
  const context = await browser.newContext({
    viewport:
      name === "presentation-board" || name === "reports-navigation-desktop"
        ? { width: 1280, height: 720 }
        : { width: 390, height: 844 },
    timezoneId: "Africa/Accra",
    hasTouch: name === "button-hover-touch" || name === "programme-time-picker-320",
    // Playwright’s service-worker blocker throws in the sandboxed email iframe.
    serviceWorkers: name.startsWith("speaker-outcome-preview-") || name.startsWith("speaker-updates-") ? "allow" : "block",
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

    if (name.startsWith("speaker-updates-") && url.origin === "https://em.devcongress.org" && (url.pathname === "/brand/dev-con-logo.png" || /^\/fonts\/[a-z0-9-]+\.woff2$/.test(url.pathname))) {
      return route.fulfill({ path: `public${url.pathname}` });
    }
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) {
      if (name.startsWith("speaker-updates-") && request.isNavigationRequest() && request.frame() === page.mainFrame()) {
        const worker = await readFile("public/_worker.js", "utf8");
        const policySource = worker.match(/const CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join\('; '\);/)[1];
        const policy = [...policySource.matchAll(/^\s*"([^"]+)"/gm)].map((match) => match[1]).join("; ");
        const response = await route.fetch();

        return route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
      }

      return route.continue();
    }
    requests.push({
      path: url.pathname,
      method: request.method(),
      body: request.postData(),
    });
    let body;
    let status = 200;
    let contentType;
    let headers;
    const custom = responses.get(url.pathname);

    if (custom) {
      ({ body, status = 200, contentType, headers } =
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
    } else if (request.method() === "GET" && url.pathname === "/api/public/annual-conference/2026/attendance-counter") {
      body = { count: 25, source: "ticket_count" };
    } else if (request.method() === "GET" && url.pathname === "/api/annual-conference/2026/attendance-counter" && role === "owner") {
      body = { count: 25, source: "ticket_count", baseline: 20, purchases: 5 };
    } else if (request.method() === "GET" && [
      "/api/annual-conference/2026/programme/speakers",
      "/api/annual-conference/2027/programme/speakers",
    ].includes(url.pathname)) {
      body = { proposals: [], canManagePhotos: true };
    } else if (url.pathname === "/api/events") body = [event];
    else if (url.pathname === "/api/events/fixture-event") body = event;
    else if (url.pathname.endsWith("/work-plan")) body = role === "owner"
      ? { ...workspace, permissions: { ...workspace.permissions, capabilities: ownerCapabilities } }
      : workspace;
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
    if (contentType) return route.fulfill({ status, contentType, headers, body });
    await route.fulfill({ status, json: body });
  });
  page.setDefaultTimeout(8000);
  try {
    await run({ page, responses, requests });
    assert.deepEqual(errors, []);
    results.push({ name, status: "passed", durationMs: Date.now() - started });
    await context.tracing.stop();
    status = "passed";
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
    console.log(`[journey] ${status} ${name} ${Date.now() - started}ms`);
  }
}

try {
  await mkdir(artifacts, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    if (serverError || server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Preview failed: ${serverError ?? serverLog}`);
    }
    // A response alone may come from another checkout already using this port.
    // Wait for this child to announce its bound URL before probing it.
    if (stripVTControlCharacters(serverLog).includes(`${origin}/`)) {
      try {
        if ((await fetch(origin)).ok && server.exitCode === null && server.signalCode === null) break;
      } catch {
        /* Startup only. */
      }
    }
    if (attempt >= 40)
      throw new Error(`Preview failed: ${serverLog}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch();

  async function stubBadgeShare(page) {
    await page.addInitScript(() => {
      Object.defineProperties(navigator, {
        canShare: { value: (data) => data.files?.[0]?.type === "image/png" },
        share: { value: ({ files }) => {
          window.badgeShared = { name: files[0].name, size: files[0].size, activated: navigator.userActivation.isActive };

          return Promise.resolve();
        } },
      });
    });
  }

  for (const width of [390, 1440]) {
    await journey(`conference-overview-volunteer-${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const path = width === 390 ? "/organizer-console/mobile/annual-conference/2026" : "/organizer-console/annual-conference/2026";

      await page.goto(`${origin}${path}`);
      await page.getByRole("heading", { name: "Your conference", exact: true }).waitFor();
      await page.getByRole("heading", { name: "No tasks assigned yet" }).waitFor();
      await page.screenshot({ path: `${artifacts}/conference-overview-volunteer-${width}.png`, animations: "disabled", fullPage: true });
      await page.getByRole(width === 390 ? "button" : "link", { name: "Create your conference badge" }).click();
      await page.waitForURL(/section=badge/);
      await page.getByRole("region", { name: "Your volunteer badge" }).waitFor();
    }, { role: "volunteer" });
  }

  for (const width of [390, 1440]) {
    await journey(`conference-overview-owner-${width}`, async ({ page, responses }) => {
      responses.set("/api/annual-conference/2026/work-plan", { body: { ...workspace, permissions: { ...workspace.permissions, access_scope: "all", can_create_tasks: true } } });
      responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
      responses.set("/api/admin/organizers", { body: { organizers: [] } });
      await page.setViewportSize({ width, height: 900 });
      const path = width === 390 ? "/organizer-console/mobile/annual-conference/2026" : "/organizer-console/annual-conference/2026";

      await page.goto(`${origin}${path}`);
      await page.getByRole("heading", { name: "Your conference", exact: true }).waitFor();
      await page.screenshot({ path: `${artifacts}/conference-overview-owner-${width}.png`, animations: "disabled", fullPage: true });
    }, { role: "owner" });
  }

  for (const width of [320, 390, 1440]) {
    await journey(`devcon26-volunteer-badge-${width}`, async ({ page, responses, requests }) => {
      responses.set("/api/public/annual-conference/2026/attendance-counter", { body: { count: 25, source: "ticket_count" } });
      if (width < 768) await stubBadgeShare(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026`);
      const nav = page.getByRole("navigation", { name: "Annual Conference workspace" });
      const editor = page.getByRole("region", { name: "Your volunteer badge" });

      await nav.waitFor();
      assert.equal(await nav.getByText("Volunteers", { exact: true }).count(), 0);
      assert.equal(await editor.isVisible(), false);
      const badgeTab = width < 768 ? nav.getByRole("button", { name: "Conference badge" }) : nav.getByRole("link", { name: "Conference badge" });

      await badgeTab.click();
      await page.waitForURL(/section=badge/);
      assert.equal(await badgeTab.getAttribute('aria-current'), 'page');
      const name = editor.getByRole("textbox", { name: "Display name" });
      const downloadButton = editor.getByRole("button", { name: "Download PNG" });

      await name.fill("Ama Mensah");
      await editor.getByRole("img", { name: "DevCon26 volunteer badge preview for Ama Mensah" }).waitFor();
      await page.evaluate(() => {
        const toBlob = HTMLCanvasElement.prototype.toBlob;

        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          toBlob.call(this, (blob) => setTimeout(() => callback(blob), 220), ...args);
        };
      });
      const actionOffset = () => downloadButton.evaluate((button) => (
        button.getBoundingClientRect().top - button.closest("section").getBoundingClientRect().top
      ));
      const beforeTyping = await actionOffset();

      await name.fill("Ama Mensah N");
      assert.equal(await editor.locator("canvas").evaluate((canvas) => getComputedStyle(canvas).visibility), "visible");
      assert.equal(await downloadButton.isDisabled(), true);
      assert.equal(await actionOffset(), beforeTyping);
      if (width < 768) {
        assert.equal(await editor.getByRole("button", { name: "Share badge" }).isDisabled(), true);
      }
      const preview = editor.getByRole("img", { name: "DevCon26 volunteer badge preview for Ama Mensah N" });

      await preview.waitFor();
      await nav.getByText("Overview", { exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get('section') === 'overview' || !url.searchParams.has('section'));
      await page.goBack();
      await page.waitForURL(/section=badge/);
      await preview.waitFor();
      assert.equal(await name.inputValue(), "Ama Mensah N");
      const photoInput = editor.locator('input[type="file"]');
      const portrait = await page.evaluate(() => {
        const canvas = document.createElement("canvas");

        canvas.width = 400;
        canvas.height = 500;
        const context = canvas.getContext("2d");

        context.fillStyle = "#d4d9d7";
        context.fillRect(0, 0, 400, 500);
        context.fillStyle = "#42595a";
        context.beginPath();
        context.ellipse(200, 500, 170, 150, 0, 0, 2 * Math.PI);
        context.fill();
        context.fillStyle = "#a87054";
        context.beginPath();
        context.ellipse(200, 225, 90, 120, 0, 0, 2 * Math.PI);
        context.fill();
        context.fillStyle = "#302a28";
        context.beginPath();
        context.ellipse(200, 145, 91, 65, 0, Math.PI, 2 * Math.PI);
        context.fill();

        return canvas.toDataURL().split(",")[1];
      });
      const portraitFile = { name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(portrait, "base64") };

      await photoInput.setInputFiles(portraitFile);
      await editor.getByRole("button", { name: "Remove photo" }).waitFor();
      await page.waitForFunction((button) => !button.disabled, await downloadButton.elementHandle());
      const initialImage = await preview.evaluate((canvas) => canvas.toDataURL());
      const zoom = editor.getByRole("slider", { name: "Zoom" });
      const horizontal = editor.getByRole("slider", { name: "Horizontal position" });
      const vertical = editor.getByRole("slider", { name: "Vertical position" });

      if (width < 768) {
        const done = page.getByRole("button", { name: "Dismiss keyboard", exact: true });

        await name.focus();
        await done.waitFor({ state: "visible" });
        await zoom.focus();
        await done.waitFor({ state: "hidden" });
      }
      await zoom.fill("1.2");
      await horizontal.fill("0.55");
      await vertical.fill("0.35");
      assert.equal(await downloadButton.isDisabled(), true);
      await page.waitForFunction((button) => !button.disabled, await downloadButton.elementHandle());
      assert.notEqual(await preview.evaluate((canvas) => canvas.toDataURL()), initialImage);
      const previewBox = await preview.boundingBox();
      const zoomBox = await zoom.boundingBox();
      const actionsBox = await downloadButton.boundingBox();

      assert.ok(width < 768 ? zoomBox.y > previewBox.y + previewBox.height : zoomBox.x > previewBox.x + previewBox.width);
      assert.ok(width < 768 ? actionsBox.y > previewBox.y + previewBox.height : actionsBox.x > previewBox.x + previewBox.width);
      if (width < 768) {
        const changeBox = await editor.getByRole("button", { name: "Change photo" }).boundingBox();
        const removeBox = await editor.getByRole("button", { name: "Remove photo" }).boundingBox();
        const shareBox = await editor.getByRole("button", { name: "Share badge" }).boundingBox();

        assert.equal(changeBox.y, removeBox.y);
        assert.equal(shareBox.y, actionsBox.y);
        assert.ok(shareBox.y >= changeBox.y + changeBox.height);
        assert.ok([changeBox, removeBox, shareBox, actionsBox].every((box) => box.height >= 44));
      }
      await name.blur();
      await preview.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.screenshot({ path: `${artifacts}/badge-crop-${width}-preview.png`, fullPage: false, animations: "disabled" });
      if (width >= 768) {
        await editor.screenshot({ path: `${artifacts}/badge-crop-${width}-editor.png`, animations: "disabled" });
      }
      if (width < 768) {
        await downloadButton.evaluate((element) => element.scrollIntoView({ block: "center" }));
        await page.screenshot({ path: `${artifacts}/badge-crop-${width}-controls.png`, fullPage: false, animations: "disabled" });
        await editor.getByRole("button", { name: "Share badge" }).click();
        const result = await page.evaluate(() => window.badgeShared);

        assert.equal(result.name, "devcon26-volunteer.png");
        assert.equal(result.activated, true);
        assert.ok(result.size > 0);
      }
      await photoInput.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
      assert.equal(await zoom.inputValue(), "1.2");
      assert.equal(await horizontal.inputValue(), "0.55");
      assert.equal(await vertical.inputValue(), "0.35");
      assert.equal(await editor.getByRole("button", { name: "Remove photo" }).isVisible(), true);
      const download = page.waitForEvent("download");

      await downloadButton.click();
      const file = await download;

      assert.equal(file.suggestedFilename(), "devcon26-volunteer.png");
      assert.equal(await file.failure(), null);
      const downloaded = await readFile(await file.path());
      const previewPng = await preview.evaluate((canvas) => canvas.toDataURL().split(",")[1]);

      assert.equal(downloaded.toString("base64"), previewPng);
      await photoInput.setInputFiles(portraitFile);
      await page.waitForFunction((input) => input.value === "1", await zoom.elementHandle());
      assert.equal(await horizontal.inputValue(), "0.5");
      assert.equal(await vertical.inputValue(), "0.18");
      await zoom.fill("2");
      await editor.getByRole("button", { name: "Remove photo" }).click();
      await photoInput.setInputFiles(portraitFile);
      await zoom.waitFor();
      assert.equal(await zoom.inputValue(), "1");
      assert.equal(await preview.evaluate((canvas) => canvas.width), 1080);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(requests.some((request) => request.method !== "GET"), false);
      assert.equal(requests.some((request) => request.path === "/api/annual-conference/2026/attendance-counter"), false);
    }, { role: "volunteer" });
  }

  await journey("devcon26-speaker-badge-share", async ({ page, responses, requests }) => {
    const token = "fixture-speaker-badge";
    const endpoint = `/api/conferences/2026/speaker-intake/${token}`;

    responses.set(endpoint, { body: { event, link: { purpose: "conference_speaker_workspace" }, prefill: { title: "Systems in production" } } });
    responses.set(`${endpoint}/headshot`, { body: {
      headshot: { source: "none", url: null, revision: 0, photo_available: false },
      badge_photo: { available: false, version: null },
    } });
    responses.set(`${endpoint}/badge`, { body: {
      card: { display_name: "Ama Mensah", role: "speaker", crop: { x: 0.5, y: 0.18, scale: 1 }, photo_available: false, photo_version: null },
    } });
    responses.set(`/api/conference-speaker-materials/2026/${token}`, { body: { materials: [] } });
    await stubBadgeShare(page);
    await page.goto(`${origin}/conference-speakers/2026/${token}`);
    await page.getByRole("button", { name: "Customize badge" }).click();
    const badge = page.getByRole("region", { name: "Your speaker badge" });

    await badge.getByRole("button", { name: "Share badge" }).click();
    const result = await page.evaluate(() => window.badgeShared);

    assert.equal(result.name, "devcon26-speaker-badge.png");
    assert.equal(result.activated, true);
    assert.ok(result.size > 0);
    assert.equal(await badge.getByRole("button", { name: "Download PNG" }).isVisible(), true);
    assert.equal(requests.some((request) => request.method !== "GET"), false);
  });

  await journey("devcon26-attendance-counter-owner", async ({ page, responses, requests }) => {
    const ownerPath = "/api/annual-conference/2026/attendance-counter";
    let saved = { count: 25, source: "ticket_count", baseline: 20, purchases: 5, version: 0 };
    let saveUnavailable = true;
    let saveConflict = false;

    responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
    responses.set("/api/admin/organizers", { body: { organizers: [] } });
    responses.set('/api/annual-conference/2026/work-plan', { body: { ...workspace, permissions: { ...workspace.permissions, capabilities: ownerCapabilities } } });
    responses.set('/api/annual-conference/2026/ticketing', { body: { settings: { public_capacity: 150 }, inventory: { reduction_floor: 0 } } });
    responses.set('/api/annual-conference/2026/registrations', { body: { overview: { mode: 'free', status: 'open', capacity: 150, reserved: 0, confirmed: 0, waitlisted: 0 }, registrations: [] } });
    responses.set('/api/annual-conference/2026/registrations/testing', { body: { enabled: false, tester_emails: [], local_delivery: false } });
    responses.set('/api/annual-conference/2026/registrations/blasts', { body: { blasts: [] } });
    responses.set(ownerPath, (request) => {
      if (request.method() === "GET") return { body: saved };
      assert.equal(request.method(), "PATCH");
      const input = request.postDataJSON();

      if (saveConflict) {
        assert.deepEqual(input, { baseline: 40, version: 1 });
        saved = { ...saved, count: 41, baseline: 36, version: 2 };

        return { status: 409, body: { error: "Conflict" } };
      }
      assert.deepEqual(input, { baseline: 32, version: 0 });
      if (saveUnavailable) return { status: 503, body: { error: "Ticket counter is temporarily unavailable." } };
      saved = { ...saved, count: input.baseline + saved.purchases, baseline: input.baseline, version: 1 };

      return { body: saved };
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/organizer-console/annual-conference/2026/registrations`);
    const counter = page.getByRole("region", { name: "Public ticket counter" });

    await page.getByRole('heading', { name: 'Registration overview' }).waitFor();
    await counter.getByText('25 displayed').waitFor();
    await counter.getByText('20 starting + 5 net purchased').waitFor();
    const startingCount = counter.getByRole("spinbutton", { name: "Starting count", exact: true });
    const edit = counter.getByRole("button", { name: "Edit", exact: true });
    const save = counter.getByRole("button", { name: "Save", exact: true });

    await edit.click();
    assert.equal(await startingCount.evaluate((element) => element === document.activeElement), true);
    const inputBox = await startingCount.boundingBox();
    const saveBox = await save.boundingBox();
    const cancelBox = await counter.getByRole("button", { name: "Cancel", exact: true }).boundingBox();

    assert.ok(inputBox && saveBox && cancelBox);
    assert.ok(Math.abs(inputBox.y - saveBox.y) < 10 && Math.abs(inputBox.y - cancelBox.y) < 10, JSON.stringify({ inputBox, saveBox, cancelBox }));
    assert.equal(await startingCount.inputValue(), "20");
    assert.equal(await save.isDisabled(), true);
    assert.equal(requests.some((request) => request.path === ownerPath && request.method !== "GET"), false);
    await startingCount.fill("30");
    await counter.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await edit.evaluate((element) => element === document.activeElement), true);
    await edit.click();
    assert.equal(await startingCount.inputValue(), "20");
    await startingCount.fill("32");
    await save.click();
    await counter.getByRole("alert").waitFor();
    assert.equal(await startingCount.inputValue(), "32");
    assert.equal(await counter.getByText("25 displayed").isVisible(), true);
    saveUnavailable = false;
    await save.click();
    await counter.getByText("37 displayed").waitFor();
    await counter.getByText("32 starting + 5 net purchased").waitFor();
    assert.equal(requests.filter((request) => request.path === ownerPath && request.method === "PATCH").length, 2);
    await page.reload();
    await counter.getByText("37 displayed").waitFor();
    await edit.click();
    assert.equal(await startingCount.inputValue(), "32");
    saveConflict = true;
    await startingCount.fill("40");
    await save.click();
    await counter.getByRole("alert").waitFor();
    assert.equal(await startingCount.inputValue(), "40");
    await counter.getByRole("button", { name: "Reload latest count" }).click();
    await counter.getByText("41 displayed").waitFor();
    assert.equal(await edit.evaluate((element) => element === document.activeElement), true);
    await page.setViewportSize({ width: 390, height: 844 });
    await edit.evaluate((element) => element.scrollIntoView({ block: "end" }));
    const editGeometry = await edit.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const navigationTop = document.querySelector(".conference-phone-bottom")?.getBoundingClientRect().top ?? window.innerHeight;

      return { top: rect.top, bottom: rect.bottom, navigationTop, hit: hit?.outerHTML.slice(0, 200), visible: rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0
        && rect.bottom <= navigationTop && (hit === element || element.contains(hit)) };
    });

    assert.equal(editGeometry.visible, true, JSON.stringify(editGeometry));
  }, { role: "owner" });

  await journey('button-hover-feedback', async ({ page, responses }) => {
    responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
    responses.set('/api/annual-conference/2026/work-plan', { body: workspace });
    responses.set('/api/annual-conference/2026/programme', { body: { rows: [], revision: 0, updated_at: null, updated_by: null } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
    const add = page.getByRole('button', { name: 'Add outline' });

    await add.waitFor();
    await page.mouse.move(0, 0);
    const style = (element) => {
      const css = getComputedStyle(element);

      return { outline: css.outlineStyle, transform: css.transform, shadow: css.boxShadow };
    };
    const idle = await add.evaluate(style);

    await add.hover();
    assert.deepEqual(await add.evaluate(style), idle, 'Hover must not add an outline, shadow, or lift');
    await add.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.equal(await add.evaluate(element => element.matches(':focus-visible')), true);
    assert.notEqual(await add.evaluate(element => getComputedStyle(element).outlineStyle === 'none' && getComputedStyle(element).boxShadow === 'none'), true);
  }, { role: 'organizer' });

  await journey('button-hover-touch', async ({ page, responses }) => {
    responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
    responses.set('/api/annual-conference/2026/work-plan', { body: workspace });
    responses.set('/api/annual-conference/2026/programme', { body: { rows: [], revision: 0, updated_at: null, updated_by: null } });
    await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
    const add = page.getByRole('button', { name: 'Add outline' });

    await add.waitFor();
    assert.equal(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), false);
    const before = await add.evaluate(element => getComputedStyle(element).outlineStyle);

    await add.hover();
    assert.equal(await add.evaluate(element => getComputedStyle(element).outlineStyle), before);
  }, { role: 'organizer' });

  await journey('programme-phone-validation', async ({ page, responses }) => {
    const idA = '00000000-0000-4000-8000-000000000001';
    const idB = '00000000-0000-4000-8000-000000000002';
    const row = (id, title) => ({ id, time: '10:00', title, type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '', speakerProposalIds: [] });
    let snapshot = { rows: [row(idA, 'First'), row(idB, 'Second')], revision: 1, updated_at: null, updated_by: null };
    const ownerWorkspace = { ...workspace, permissions: { ...workspace.permissions, access_scope: 'all', can_create_tasks: true } };

    responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
    responses.set('/api/annual-conference/2026/work-plan', { body: ownerWorkspace });
    responses.set('/api/admin/organizers', { body: { organizers: [] } });
    responses.set('/api/annual-conference/2026/programme', request => {
      if (request.method() === 'PUT') snapshot = { ...request.postDataJSON(), revision: 2, updated_at: null, updated_by: null };

      return { body: snapshot };
    });
    await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
    const more = page.getByRole('navigation', { name: 'Annual Conference workspace' }).getByRole('button', { name: 'More', exact: true });
    const menu = page.getByRole('dialog', { name: 'More' });

    await more.click();
    await menu.waitFor();
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await more.evaluate(el => el === document.activeElement), true);
    await more.click();
    await menu.locator('.app-dropdown-trigger').click();
    await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), true);
    assert.equal(await menu.locator('.app-dropdown-trigger').getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
    await more.click();
    await page.getByRole('button', { name: 'Close menu' }).click();
    await menu.waitFor({ state: 'hidden' });
    await more.click();
    await menu.getByRole('button', { name: 'New edition' }).click();
    await menu.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('input[type=number]').first().evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Edit outline' }).click();
    const rowA = page.locator(`[data-programme-row="${idA}"]`);
    const rowB = page.locator(`[data-programme-row="${idB}"]`);

    await rowA.locator('.programme-mobile-toggle').click();
    await rowA.locator('[data-row-title]').fill('');
    await rowB.locator('.programme-mobile-toggle').click();
    await rowB.getByRole('button', { name: /Description and resource/ }).click();
    await rowB.locator('[data-resource-url]').fill('invalid-url');
    await page.getByRole('button', { name: 'Save outline' }).click();
    assert.equal(await rowA.locator('[data-row-title]').evaluate(el => el === document.activeElement), true);
    assert.equal(await rowB.locator('.programme-mobile-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await rowB.locator('[data-resource-url]').inputValue(), 'invalid-url');
    await rowA.locator('[data-row-title]').fill('First edited');
    await page.getByRole('button', { name: 'Save outline' }).click();
    assert.equal(await rowB.locator('[data-resource-url]').evaluate(el => el === document.activeElement), true);
    await rowB.locator('[data-resource-url]').fill('https://example.com');
    await rowB.getByRole('button', { name: 'Move Second up' }).click();
    assert.equal(await page.locator('fieldset.programme-row').first().getAttribute('data-programme-row'), idB);
    await rowB.getByRole('button', { name: 'Remove Second' }).click();
    await page.getByRole('dialog', { name: 'Remove session?' }).getByRole('button', { name: 'Remove session' }).click();
    assert.equal(await rowA.locator('[data-row-title]').inputValue(), 'First edited');
    assert.equal(await rowA.locator('[data-row-title]').evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Add row' }).click();
    const newRow = page.locator('fieldset.programme-row').last();

    assert.equal(await newRow.locator('.programme-mobile-toggle').getAttribute('aria-expanded'), 'true');
    assert.equal(await newRow.locator('[data-row-title]').evaluate(el => el === document.activeElement), true);
    await newRow.locator('[data-row-title]').fill('Added');
    await page.getByRole('button', { name: 'Save outline' }).click();
    await page.getByRole('heading', { name: 'Added' }).waitFor();
    assert.deepEqual(snapshot.rows.map(item => item.title), ['First edited', 'Added']);
  }, { role: 'owner' });

  for (const mobile of [false, true]) {
    await journey(`programme-speakers-${mobile ? 'mobile' : 'desktop'}`, async ({ page, responses }) => {
      const path = '/api/annual-conference/2026/programme';
      const proposal = { id: '11111111-1111-4111-8111-111111111111', speakerId: '22222222-2222-4222-8222-222222222222', name: 'Ada Example', title: 'Tracing services', description: 'Learn how teams trace slow requests. We will explore profiling with real examples. Participants will leave with a practical checklist for their own services.', photoUrl: null };
      const second = { ...proposal, id: '33333333-3333-4333-8333-333333333333', speakerId: '44444444-4444-4444-8444-444444444444', name: 'Sam Example', title: 'Building systems' };
      let saved;

      responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
      responses.set('/api/annual-conference/2026/work-plan', { body: workspace });
      responses.set(`${path}/speakers`, { body: { proposals: [proposal, second], canManagePhotos: true } });
      responses.set(`${path}/speakers/${proposal.speakerId}/photo`, (request) => ({ body: { photoUrl: request.method() === 'DELETE' ? null : '/fixture-photo.png' } }));
      responses.set(path, (request) => {
        if (request.method() === 'PUT') saved = request.postDataJSON();

        return { body: saved ? { ...saved, revision: 1, updated_at: null, updated_by: null } : { rows: [], revision: 0, updated_at: null, updated_by: null } };
      });
      await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
      await page.getByRole('button', { name: 'Add outline' }).click();
      const row = page.locator('fieldset.programme-row').first();

      await row.getByRole('button', { name: 'Description and resource' }).click();
      await row.getByRole('button', { name: /Accepted speaker proposals/ }).click();
      await page.getByRole('option', { name: /Ada Example/ }).click();
      await page.getByRole('option', { name: /Sam Example/ }).click();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await row.getByRole('button', { name: 'Copy title and description' }).first().click();
      assert.equal(await row.getByLabel('Title', { exact: true }).inputValue(), proposal.title);
      await row.getByRole('button', { name: 'Copy title and description' }).nth(1).click();
      await page.getByRole('dialog', { name: 'Replace session text?' }).getByRole('button', { name: 'Cancel' }).click();
      assert.equal(await row.getByLabel('Title', { exact: true }).inputValue(), proposal.title);
      await row.getByRole('button', { name: 'Copy title and description' }).nth(1).click();
      await page.getByRole('dialog', { name: 'Replace session text?' }).getByRole('button', { name: 'Replace text' }).click();
      assert.equal(await row.getByLabel('Title', { exact: true }).inputValue(), second.title);
      await row.getByRole('button', { name: 'Copy title and description' }).first().click();
      await page.getByRole('dialog', { name: 'Replace session text?' }).getByRole('button', { name: 'Replace text' }).click();
      await row.getByRole('button', { name: 'Suggest summary' }).click();
      await row.getByLabel('Description', { exact: true }).fill(`${proposal.description} Additional detail.`);
      assert.equal(await row.getByLabel('Suggested summary').count(), 0);
      await row.getByLabel('Description', { exact: true }).fill(proposal.description);
      await row.getByRole('button', { name: 'Suggest summary' }).click();
      const summary = row.getByLabel('Suggested summary');

      assert.ok((await summary.inputValue()).length < proposal.description.length);
      assert.equal(await row.getByLabel('Description', { exact: true }).inputValue(), proposal.description);
      await summary.fill('A reviewed summary.');
      await row.getByRole('button', { name: 'Use summary' }).click();
      assert.equal(await row.getByLabel('Description', { exact: true }).inputValue(), 'A reviewed summary.');
      await row.locator('input[type=file]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('fixture') });
      await row.getByAltText('Photo of Ada Example').waitFor();
      const initialPhoto = await row.getByAltText('Photo of Ada Example').getAttribute('src');

      await row.locator('input[type=file]').first().setInputFiles({ name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from('replacement') });
      await page.waitForFunction(previous => document.querySelector('.programme-photo')?.getAttribute('src') !== previous, initialPhoto);
      await row.getByRole('button', { name: 'Remove photo' }).click();
      await page.getByRole('dialog', { name: 'Remove speaker photo?' }).getByRole('button', { name: 'Cancel' }).click();
      assert.equal(await row.getByAltText('Photo of Ada Example').count(), 1);
      await row.getByRole('button', { name: 'Remove photo' }).click();
      await page.getByRole('dialog', { name: 'Remove speaker photo?' }).getByRole('button', { name: 'Remove photo' }).click();
      await row.getByAltText('Photo of Ada Example').waitFor({ state: 'detached' });
      await page.getByRole('group', { name: 'Outline actions' }).getByRole('button', { name: 'Add row' }).click();
      await page.getByLabel('Title', { exact: true }).nth(1).fill('Break');
      await page.getByRole('group', { name: 'Outline actions' }).getByRole('button', { name: 'Save outline' }).click();
      await page.getByRole('heading', { name: proposal.title }).waitFor();
      assert.equal(await page.locator('.programme-display-speaker').count(), 2);
      assert.deepEqual(saved.rows[0].speakerProposalIds, [proposal.id, second.id]);
      assert.deepEqual(saved.rows[1].speakerProposalIds, []);
      assert.equal(saved.rows[0].description, 'A reviewed summary.');
      assert.equal(proposal.description.includes('practical checklist'), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }, { role: 'organizer' });
  }

  await journey('programme-speaker-unavailable', async ({ page, responses }) => {
    const path = '/api/annual-conference/2026/programme';
    const staleId = '55555555-5555-4555-8555-555555555555';
    const row = { id: '66666666-6666-4666-8666-666666666666', time: 'TBD', title: 'Existing session', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '', speakerProposalIds: [staleId] };
    let saved;

    responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
    responses.set('/api/annual-conference/2026/work-plan', { body: workspace });
    responses.set(`${path}/speakers`, { body: { proposals: [], canManagePhotos: true } });
    responses.set(path, request => {
      if (request.method() === 'PUT') saved = request.postDataJSON();

      return { body: { rows: saved?.rows ?? [row], revision: 1, updated_at: null, updated_by: null } };
    });
    await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
    await page.getByRole('button', { name: 'Edit outline' }).click();
    await page.locator('.programme-mobile-toggle').first().click();
    await page.getByRole('button', { name: 'Description and resource' }).click();
    await page.getByText(/linked proposal is no longer available/).waitFor();
    await page.getByRole('button', { name: /Accepted speaker proposals/ }).click();
    await page.getByRole('option', { name: /Unavailable proposal/ }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Save outline' }).click();
    await page.getByRole('heading', { name: 'Existing session' }).waitFor();
    assert.deepEqual(saved.rows[0].speakerProposalIds, []);
  }, { role: 'organizer' });

  await journey('programme-speaker-denied', async ({ page, responses }) => {
    const path = '/api/annual-conference/2026/programme';
    const row = { id: '66666666-6666-4666-8666-666666666666', time: 'TBD', title: 'Existing session', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '', speakerProposalIds: ['55555555-5555-4555-8555-555555555555'] };
    let saved;

    responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
    responses.set('/api/annual-conference/2026/work-plan', { body: { ...workspace, permissions: { ...workspace.permissions, capabilities: ['programme.view'] } } });
    responses.set(`${path}/speakers`, { status: 403, body: { error: 'Speaker access denied.' } });
    responses.set(path, request => {
      if (request.method() === 'PUT') saved = request.postDataJSON();

      return { body: { rows: saved?.rows ?? [row], revision: 1, updated_at: null, updated_by: null } };
    });
    await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
    await page.getByRole('heading', { name: 'Existing session' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Edit outline' }).count(), 0);
    assert.equal(saved, undefined);
  }, { role: 'organizer' });

  for (const width of [1440, 390, 700]) {
    const mobile = width < 768;

    await journey(`programme-${mobile ? (width === 390 ? 'mobile' : `mobile-${width}`) : 'desktop'}`, async ({ page, responses }) => {
      let snapshot = { rows: [], revision: 0, updated_at: null, updated_by: null };
      const programmePath = '/api/annual-conference/2026/programme';

      const nextEdition = { ...edition, id: 'fixture-edition-2027', year: 2027, label: 'December 2027' };

      responses.set('/api/annual-conference/editions', { body: { editions: [nextEdition, edition] } });
      responses.set('/api/annual-conference/2026/work-plan', { body: workspace });
      responses.set('/api/annual-conference/2027/work-plan', { body: { ...workspace, edition: nextEdition } });
      responses.set('/api/annual-conference/2027/programme', { body: { rows: [], revision: 0, updated_at: null, updated_by: null } });
      responses.set(programmePath, (request) => {
        if (request.method() === 'PUT') {
          const input = request.postDataJSON();

          if (input.revision !== snapshot.revision) return { status: 409, body: { error: 'Programme changed.' } };
          snapshot = { ...input, revision: input.revision + 1, updated_at: '2026-11-01T12:00:00Z', updated_by: 'fixture@example.com' };
        }

        return { body: snapshot };
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
      await page.getByRole('button', { name: 'Add outline' }).click();
      await page.getByLabel('Title', { exact: true }).first().fill('Opening');
      await page.getByRole('group', { name: 'Outline actions' }).getByRole('button', { name: 'Add row' }).click();
      await page.getByLabel('Title', { exact: true }).nth(1).fill('Discussion');
      await page.getByRole('group', { name: 'Outline actions' }).getByRole('button', { name: 'Save outline' }).click();
      await page.getByRole('heading', { name: 'Opening' }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'Discussion' }).waitFor();
      await page.screenshot({ path: `${artifacts}/programme-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.getByRole('button', { name: 'Edit outline' }).click();
      await expandProgrammeRow(page, page.locator('fieldset.programme-row').nth(1));
      await page.getByRole('group', { name: 'Session 2 actions' }).getByRole('button', { name: 'Move Discussion up' }).click();
      await expandProgrammeRow(page, page.locator('fieldset.programme-row').nth(1));
      await page.getByRole('group', { name: 'Session 2 actions' }).getByRole('button', { name: 'Remove Opening' }).click();
      await page.getByRole('dialog', { name: 'Remove session?' }).getByText('Remove “Opening” from the draft? Save outline to apply this change.').waitFor();
      await page.getByRole('dialog', { name: 'Remove session?' }).getByRole('button', { name: 'Remove session' }).click();
      await page.getByRole('group', { name: 'Outline actions' }).getByRole('button', { name: 'Save outline' }).click();
      await page.getByRole('heading', { name: 'Discussion' }).waitFor();
      assert.deepEqual(snapshot.rows.map(row => row.title), ['Discussion']);
      await page.getByRole('button', { name: 'Edit outline' }).click();
      await expandProgrammeRow(page, page.locator('fieldset.programme-row').first());
      await page.getByLabel('Title', { exact: true }).first().fill('Unsaved draft');
      if (mobile) {
        const nav = page.getByRole('navigation', { name: 'Annual Conference workspace' });
        const dismissKeyboard = page.getByRole('button', { name: 'Dismiss keyboard' });
        const toast = page.locator('[data-sonner-toast][data-visible="true"]');

        await dismissKeyboard.waitFor();
        await toast.waitFor();
        const [footerBox, keyboardBox, toastBox] = await Promise.all([nav.boundingBox(), dismissKeyboard.boundingBox(), toast.boundingBox()]);

        assert.ok(footerBox && keyboardBox && toastBox);
        assert.ok(keyboardBox.y + keyboardBox.height <= footerBox.y, 'Keyboard dismissal clears the footer');
        assert.ok(toastBox.y + toastBox.height <= footerBox.y, 'Toast clears the footer');
        await page.screenshot({ path: `${artifacts}/programme-footer-overlays-${width}.png`, fullPage: false, animations: 'disabled' });
        await nav.getByRole('button', { name: 'More', exact: true }).click();
      }
      await page.getByRole('button', { name: /December 2026/ }).filter({ visible: true }).click();
      await page.getByRole('option', { name: 'December 2027' }).click();
      await page.getByText('2027 conference').waitFor();
      if (mobile) await page.getByRole('navigation', { name: 'Annual Conference workspace' }).getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('button', { name: /December 2027/ }).filter({ visible: true }).click();
      await page.getByRole('option', { name: 'December 2026' }).click();
      await page.getByText('2026 conference').waitFor();
      assert.equal(await page.getByLabel('Title', { exact: true }).first().inputValue(), 'Unsaved draft');
    }, { role: 'organizer' });
  }

  for (const mobile of [false, true]) {
    await journey(`programme-layout-${mobile ? 'mobile' : 'desktop'}`, async ({ page, responses, requests }) => {
      const supplied = [
  ['10:00–10:15 AM', 'Opening and Welcome Remarks', 'Host introduction, event overview, housekeeping and programme highlights.', 'talk'],
  ['10:15–10:40 AM', 'Keynote Address', 'The featured speaker addresses the event theme: Technology for the Next Generation.', 'talk'],
  ['10:40–10:55 AM', 'Sponsor Spotlight 1 — Paystack', 'Sponsor presentation, developer opportunities, or technology ecosystem insights.', 'talk'],
  ['10:55–11:25 AM', 'Technical Speaking Sessions', 'Two talks of approximately 15 minutes each, including a brief transition.', 'talk'],
  ['11:25–11:45 AM', 'Product Demonstrations', 'Two live demos showcasing products, developer tools, or practical technology solutions.', 'product_demo'],
  ['11:45 AM–12:00 PM', 'Sponsor Spotlight 2 — To Be Confirmed', 'Sponsor presentation focused on products, developer resources, or industry opportunities.', 'talk'],
  ['12:00–12:45 PM', 'Breakout Sessions — Round 1', 'Three parallel rooms. This 45-minute block is a placeholder; see breakout scheduling note below.', 'workshop'],
  ['12:45–1:15 PM', 'Lunch and Networking', 'Refreshments, sponsor engagement and informal networking.', 'networking'],
  ['1:15–2:00 PM', 'Breakout Sessions — Round 2', 'Three parallel rooms. This block can host a second set of talks or workshops.', 'workshop'],
  ['2:00–2:15 PM', 'Sponsor Spotlight 3 — To Be Confirmed', 'Additional sponsor presentation.', 'talk'],
  ['2:15–3:00 PM', 'System Design Session', 'Technical deep dive into architecture, scalability, trade-offs and real-world engineering decisions.', 'system_design'],
  ['3:00–3:40 PM', 'Panel Discussion', 'Moderated conversation with industry professionals, followed by audience questions.', 'panel'],
  ['3:40–4:00 PM', 'Closing Remarks and Networking', 'Acknowledgements, announcements, sponsor appreciation and event close.', 'networking'],
];
      const rows = supplied.map(([time, title, description, type], index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        time, title, description, type,
        lead: 'Hidden existing lead',
        resourceTitle: index === 0 ? 'Slides' : '',
        resourceUrl: index === 0 ? 'https://example.com/slides' : '',
      }));
      let saved = { rows, revision: 1, updated_at: null, updated_by: null };

      responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
      responses.set('/api/annual-conference/2026/work-plan', { body: workspace });
      responses.set('/api/annual-conference/2026/programme', (request) => {
        if (request.method() === 'PUT') saved = { ...request.postDataJSON(), revision: 2, updated_at: null, updated_by: null };

        return { body: saved };
      });
      await page.setViewportSize({ width: mobile ? 390 : 1440, height: 900 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
      await page.getByRole('heading', { name: 'Closing Remarks and Networking' }).waitFor();
      assert.equal(await page.getByText('Hidden existing lead').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.programme-time').nth(5).evaluate(el => (() => { const range = document.createRange();

 range.selectNodeContents(el);

 return range.getClientRects().length === 1 && el.scrollWidth <= el.clientWidth; })()), true);
      await page.screenshot({ path: `${artifacts}/programme-layout-${mobile ? 'mobile' : 'desktop'}-read.png`, fullPage: true });
      await page.locator('.programme-heading').screenshot({ path: `${artifacts}/programme-layout-${mobile ? 'mobile' : 'desktop'}-header.png` });
      await page.getByRole('button', { name: 'Edit outline' }).click();
      assert.equal(await page.getByLabel('Lead', { exact: true }).count(), 0);
      const top = page.getByRole('group', { name: 'Outline actions' });

      for (const label of ['Add row', 'Save outline', 'Cancel']) {
        assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 1);
      }
      const first = page.locator('fieldset.programme-row').first();

      await expandProgrammeRow(page, first);
      const toggle = first.getByRole('button', { name: /Description and resource/ });
      const geometry = await first.evaluate((element) => {
        const controls = [element.querySelector('.programme-time-field button'), element.querySelector('[data-row-title]'), element.querySelector('.programme-type-field button')];

        return controls.map((control) => {
          const rect = control.getBoundingClientRect();

          return { top: rect.top, height: rect.height };
        });
      });

      if (mobile) assert.ok(geometry[1].top < geometry[0].top && geometry[0].top < geometry[2].top, JSON.stringify(geometry));
      else assert.equal(geometry.every(rect => Math.abs(rect.top - geometry[0].top) < 1 && Math.abs(rect.height - geometry[0].height) < 1), true, JSON.stringify(geometry));
      console.log(JSON.stringify({ viewport: mobile ? 390 : 1440, programmeFieldGeometry: geometry }));

      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.ok(await toggle.getAttribute('aria-controls'));
      await page.screenshot({ path: `${artifacts}/programme-layout-${mobile ? 'mobile' : 'desktop'}-edit.png`, fullPage: true });
      await toggle.click();
      await first.getByLabel('Resource URL').fill('javascript:alert(1)');
      await first.getByRole('button', { name: 'Hide details' }).click();
      await top.getByRole('button', { name: 'Save outline' }).click();
      assert.equal(await first.getByLabel('Resource URL').isVisible(), true);
      assert.equal(await first.getByLabel('Resource URL').evaluate(el => el === document.activeElement), true);
      await first.getByLabel('Resource URL').fill('https://example.com/slides');
      await first.getByRole('button', { name: 'Hide details' }).click();
      await top.getByRole('button', { name: 'Add row' }).click();
      assert.equal(await page.getByLabel('Title', { exact: true }).last().evaluate(el => el === document.activeElement), true);
      await page.getByLabel('Title', { exact: true }).last().fill('Draft session');
      const last = page.locator('fieldset.programme-row').last();
      const remove = last.getByRole('button', { name: /Remove/ });
      const putCount = () => requests.filter(request => request.method === 'PUT').length;
      const before = putCount();

      await remove.click();
      const dialog = page.getByRole('dialog', { name: 'Remove session?' });

      await dialog.getByText('Remove “Draft session” from the draft? Save outline to apply this change.').waitFor();
      await page.waitForFunction((isMobile) => {
        const panel = document.querySelector('[role="dialog"]');

        if (!panel) return false;
        const rect = panel.getBoundingClientRect();

        return isMobile
          ? Math.abs(rect.bottom - innerHeight) < 2
          : Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 2;
      }, mobile);
      await page.screenshot({ path: `${artifacts}/programme-remove-${mobile ? 'mobile' : 'desktop'}.png`, animations: 'disabled' });
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      assert.equal(await page.locator('fieldset.programme-row').count(), 14);
      assert.equal(putCount(), before);
      await remove.click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('fieldset.programme-row').count(), 14);
      await remove.click();
      await page.locator('.confirm-dialog-shell').click({ position: { x: 5, y: 5 } });
      assert.equal(await page.locator('fieldset.programme-row').count(), 14);
      await remove.click();
      await dialog.getByRole('button', { name: 'Remove session' }).click();
      assert.equal(await page.locator('fieldset.programme-row').count(), 13);
      assert.equal(putCount(), before);
      assert.equal(await page.getByLabel('Title', { exact: true }).last().evaluate(el => el === document.activeElement), true);
      await top.getByRole('button', { name: 'Save outline' }).click();
      await page.getByRole('heading', { name: 'Closing Remarks and Networking' }).waitFor();
      assert.equal(saved.rows[0].lead, 'Hidden existing lead');
      if (mobile) {
        await page.setViewportSize({ width: 320, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
    }, { role: 'organizer' });
  }

  for (const width of [1440, 390, 320]) {
    await journey(`programme-time-picker-${width}`, async ({ page, responses, requests }) => {
      const rows = [
        { id: '00000000-0000-4000-8000-000000000001', time: '1:15–2:00 PM', title: 'Breakout', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '' },
        { id: '00000000-0000-4000-8000-000000000002', time: 'After lunch', title: 'Legacy', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '' },
        { id: '00000000-0000-4000-8000-000000000003', time: '11:45 PM–12:00 AM', title: 'Midnight', type: 'talk', lead: '', description: '', resourceTitle: '', resourceUrl: '' },
      ];
      let snapshot = { rows, revision: 1, updated_at: null, updated_by: null };

      responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
      responses.set('/api/annual-conference/2026/work-plan', { body: workspace });
      responses.set('/api/annual-conference/2026/programme', request => {
        if (request.method() === 'PUT') snapshot = { ...request.postDataJSON(), revision: 2, updated_at: null, updated_by: null };

        return { body: snapshot };
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
      await page.getByRole('button', { name: 'Edit outline' }).click();
      const first = page.locator('fieldset.programme-row').first();
      const picker = page.getByRole('dialog', { name: 'Choose programme time' });

      await expandProgrammeRow(page, first);
      await first.getByRole('button', { name: 'Time' }).click();
      await picker.getByText('2:00 PM', { exact: true }).waitFor();
      assert.equal(await picker.getByRole('spinbutton').inputValue(), '45');
      assert.equal(await picker.getByRole('button', { name: /^(15|20|30|45) min$/ }).count(), 0);
      const label = await picker.getByText('Duration', { exact: true }).boundingBox();
      const plus = await picker.getByRole('button', { name: 'Increase duration by one minute' }).boundingBox();

      assert.ok(Math.abs(label.y + label.height / 2 - plus.y - plus.height / 2) < 2);
      assert.ok(plus.x + plus.width <= width);
      const bounds = await picker.boundingBox();

      assert.equal(await page.evaluate(() => Math.abs(document.documentElement.getBoundingClientRect().width - innerWidth) < 1), true);
      assert.ok(bounds.height < 340, `Picker should remain compact: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      if (width < 640) assert.ok(Math.abs(bounds.y + bounds.height - 900) < 2);
      else {
        await page.waitForFunction(() => {
          const picker = document.querySelector('.programme-time-panel').getBoundingClientRect();
          const trigger = document.querySelector('.programme-time-trigger').getBoundingClientRect();

          return picker.bottom <= trigger.top - 4 || picker.top >= trigger.bottom + 4;
        });
      }
      await page.screenshot({ path: `${artifacts}/programme-time-${width}.png`, animations: 'disabled' });
      await picker.getByRole('button', { name: /^Start minute,/ }).click();
      const optionBounds = await page.getByRole('option', { name: '17', exact: true }).boundingBox();

      assert.ok(optionBounds.x >= 0 && optionBounds.x + optionBounds.width <= width + 1);
      await page.getByRole('option', { name: '17', exact: true }).click();
      await page.keyboard.press('Escape');
      assert.equal(await first.getByRole('button', { name: 'Time' }).innerText(), '1:15–2:00 PM');
      await first.getByRole('button', { name: 'Time' }).click();
      await picker.getByRole('button', { name: /^Start minute,/ }).click();
      await page.getByRole('option', { name: '17', exact: true }).click();
      await picker.getByRole('spinbutton', { name: 'Duration in minutes' }).fill('17');
      await picker.getByText('1:34 PM', { exact: true }).waitFor();
      await picker.getByRole('button', { name: 'Apply' }).click();
      assert.equal(await first.getByRole('button', { name: 'Time' }).innerText(), '1:17–1:34 PM');
      assert.equal(requests.some(request => request.method === 'PUT'), false);
      const second = page.locator('fieldset.programme-row').nth(1);

      const third = page.locator('fieldset.programme-row').nth(2);

      await expandProgrammeRow(page, third);
      await third.getByRole('button', { name: 'Time' }).click();
      await picker.getByText('12:00 AM', { exact: true }).waitFor();
      assert.equal(await picker.getByRole('spinbutton', { name: 'Duration in minutes' }).inputValue(), '15');
      await picker.getByRole('button', { name: /^Start hour,/ }).click();
      await page.getByRole('option', { name: '12', exact: true }).click();
      await picker.getByRole('button', { name: /^Start minute,/ }).click();
      await page.getByRole('option', { name: '00', exact: true }).click();
      await picker.getByRole('button', { name: /^Start period,/ }).click();
      await page.getByRole('option', { name: 'AM', exact: true }).click();
      await picker.getByRole('spinbutton', { name: 'Duration in minutes' }).fill('1440');
      assert.equal(await picker.getByRole('button', { name: 'Apply' }).isDisabled(), true);
      await picker.getByRole('button', { name: 'Cancel' }).click();
      await expandProgrammeRow(page, second);
      await second.getByRole('button', { name: 'Time' }).click();
      await picker.getByText('Current: After lunch').waitFor();
      await picker.getByRole('button', { name: 'Apply' }).click();
      assert.equal(await second.getByRole('button', { name: 'Time' }).innerText(), 'After lunch');
      await second.getByRole('button', { name: 'Time' }).click();
      await picker.getByRole('button', { name: /Start after previous session/ }).click();
      await picker.getByRole('spinbutton', { name: 'Duration in minutes' }).fill('20');
      await picker.getByText('1:54 PM', { exact: true }).waitFor();
      await picker.getByRole('button', { name: 'Cancel' }).click();
      assert.equal(await second.getByRole('button', { name: 'Time' }).innerText(), 'After lunch');
      await page.getByRole('group', { name: 'Outline actions' }).getByRole('button', { name: 'Save outline' }).click();
      await page.getByRole('heading', { name: 'Breakout' }).waitFor();
      assert.equal(snapshot.rows[0].time, '1:17–1:34 PM');
      assert.equal(snapshot.rows[1].time, 'After lunch');
      await page.reload();
      await page.getByText('1:17–1:34 PM').waitFor();
      await page.getByRole('button', { name: 'Edit outline' }).click();
      await expandProgrammeRow(page, page.locator('fieldset.programme-row').first());
      await page.locator('fieldset.programme-row').first().getByRole('button', { name: 'Time' }).click();
      const minutes = picker.getByRole('spinbutton', { name: 'Duration in minutes' });

      await minutes.fill('60');
      const focusStyle = await minutes.evaluate(input => {
        const css = getComputedStyle(input);

        return [css.boxShadow, css.outlineStyle, css.borderTopWidth, css.borderBottomWidth];
      });

      assert.deepEqual(focusStyle, ['none', 'none', '0px', '2px']);
      await picker.getByText('2:17 PM', { exact: true }).waitFor();
      await picker.getByRole('button', { name: 'Increase duration by one minute' }).click();
      assert.equal(await minutes.inputValue(), '61');
      await picker.getByRole('button', { name: 'Decrease duration by one minute' }).click();
      assert.equal(await minutes.inputValue(), '60');
      await picker.getByRole('spinbutton', { name: 'Duration in minutes' }).fill('20');
      assert.equal(await minutes.inputValue(), '20');
      await picker.getByRole('button', { name: 'Set TBD' }).click();
      await picker.getByRole('button', { name: 'Apply' }).click();
      assert.equal(await page.locator('fieldset.programme-row').first().getByRole('button', { name: 'Time' }).innerText(), 'TBD');
      await expandProgrammeRow(page, page.locator('fieldset.programme-row').nth(1));
      await page.locator('fieldset.programme-row').nth(1).getByRole('button', { name: 'Time' }).click();
      assert.equal(await picker.getByRole('button', { name: /Start after previous session/ }).count(), 0);
      await picker.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('group', { name: 'Session 2 actions' }).getByRole('button', { name: 'Move Legacy up' }).click();
      await expandProgrammeRow(page, page.locator('fieldset.programme-row').first());
      await page.locator('fieldset.programme-row').first().getByRole('button', { name: 'Time' }).click();
      assert.equal(await picker.getByRole('button', { name: /Start after previous session/ }).count(), 0);
      if (width < 640) {
        await page.locator('.programme-time-layer').click({ position: { x: 4, y: 4 } });
        await picker.waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement === document.querySelector('fieldset.programme-row .programme-time-trigger'));
      } else {
        await picker.getByRole('button', { name: 'Cancel' }).click();
      }
    }, { role: 'organizer' });
  }

  for (const width of [1440, 1024, 390, 320]) {
    await journey(`programme-sticky-${width}`, async ({ page, responses }) => {
      const rows = Array.from({ length: 13 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
        time: '11:45 AM–12:00 PM', title: `Session ${index + 1}`,
        type: 'talk', lead: '', description: 'Session description.', resourceTitle: '', resourceUrl: '',
      }));

      responses.set('/api/admin/organizers', { body: { organizers: [] } });
      responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
      responses.set('/api/annual-conference/2026/work-plan', { body: { ...workspace, permissions: { ...workspace.permissions, can_create_tasks: true } } });
      responses.set('/api/annual-conference/2026/programme', { body: { rows, revision: 1, updated_at: null, updated_by: null } });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/programme`);
      await page.getByRole('heading', { name: 'Session 13' }).waitFor();
      if (width < 768) {
        const menu = page.getByRole('dialog', { name: 'More' });

        await page.getByRole('navigation', { name: 'Annual Conference workspace' }).getByRole('button', { name: 'More', exact: true }).click();
        assert.equal(await menu.getByRole('button', { name: 'New edition' }).isVisible(), true);
        await menu.getByRole('button', { name: 'Close menu' }).click();
      }
      const main = page.locator('.app-main');
      const check = async (editing) => {
        if (width < 768) {
          await page.evaluate(() => window.scrollTo(0, 1300));
          await page.waitForFunction(() => window.scrollY >= 100);
        } else {
          await main.evaluate(element => { element.scrollTop = 1300; });
          await page.waitForFunction(() => document.querySelector('.app-main').scrollTop >= 100);
        }
        const geometry = await page.evaluate(() => {
          const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
          const buttons = [...document.querySelectorAll('[aria-label="Outline actions"] button')].map(button => button.getBoundingClientRect().toJSON());

          return { main: rect('.app-main'), appHeader: rect('.app-header'), header: rect('.programme-heading'), title: rect('.programme-heading h1'), nav: rect('.annual-conference-nav-shell'), buttons, scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth };
        });

        if (width >= 768) assert.ok(geometry.header.top >= geometry.main.top - 1, JSON.stringify(geometry));
        else assert.ok(Math.abs(geometry.header.top) < 2, JSON.stringify(geometry));
        assert.ok(geometry.title.top >= geometry.header.top - 1 && geometry.title.bottom <= geometry.header.bottom + 1, JSON.stringify(geometry));
        if (width >= 768) assert.ok(Math.abs(geometry.header.top - geometry.nav.bottom) < 2, JSON.stringify(geometry));
        assert.ok(geometry.header.bottom < Math.min(geometry.main.bottom, 900), JSON.stringify(geometry));
        assert.equal(geometry.scrollWidth <= geometry.viewportWidth, true);
        if (editing) {
          assert.equal(geometry.buttons.length, 3);
          assert.ok(geometry.buttons.every(button => button.height >= (width < 768 ? 44 : 36) && button.top >= geometry.header.top - 1 && button.bottom <= geometry.header.bottom + 1), JSON.stringify(geometry));
        }
        await page.screenshot({ path: `${artifacts}/programme-sticky-${width}-${editing ? 'edit' : 'read'}.png` });
        if (editing && width === 1440) await page.locator('.programme-heading').screenshot({ path: `${artifacts}/programme-layout-desktop-header.png` });
      };

      await check(false);
      if (width === 1440) {
        await page.getByRole('button', { name: 'New edition' }).click();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.annual-conference-nav-shell')).position === 'relative');
        await main.evaluate(element => { element.scrollTop = 1300; });
        await page.waitForFunction(() => {
          const header = document.querySelector('.programme-heading').getBoundingClientRect();
          const crumbs = document.querySelector('.organizer-breadcrumbs').getBoundingClientRect();

          return Math.abs(header.top - crumbs.bottom) < 2;
        });
        await page.locator('.annual-conference-nav-shell form').getByRole('button', { name: 'Cancel' }).click();
      }
      await page.getByRole('button', { name: 'Edit outline' }).click();
      await check(true);
      await expandProgrammeRow(page, page.locator('fieldset.programme-row').first());
      await page.getByLabel('Time', { exact: true }).first().focus();
      if (width < 768) await page.evaluate(() => window.scrollBy(0, 250));
      else await main.evaluate(element => { element.scrollTop += 250; });
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => {
        const focused = document.activeElement.getBoundingClientRect();
        const header = document.querySelector('.programme-heading').getBoundingClientRect();

        return focused.top >= header.bottom - 1;
      });
      if (width < 768) await page.evaluate(() => window.scrollBy(0, 200));
      else await main.evaluate(element => { element.scrollTop += 200; });
      await page.keyboard.press('Shift+Tab');
      await page.waitForFunction(() => {
        const focused = document.activeElement.getBoundingClientRect();
        const header = document.querySelector('.programme-heading').getBoundingClientRect();

        return focused.top >= header.bottom - 1;
      });
      await page.locator('fieldset.programme-row').last().scrollIntoViewIfNeeded();
      await page.getByRole('group', { name: 'Outline actions' }).getByRole('button', { name: 'Add row' }).click();
      const focused = await page.getByLabel('Title', { exact: true }).last().evaluate(element => {
        const header = document.querySelector('.programme-heading').getBoundingClientRect();
        const field = element.getBoundingClientRect();

        return element === document.activeElement && field.top >= header.bottom - 1 && field.bottom <= Math.min(innerHeight, document.querySelector('.app-main').getBoundingClientRect().bottom) + 1;
      });

      assert.equal(focused, true);
    }, { role: 'organizer' });
  }

  for (const mobile of [false, true]) {
    await journey(`reports-navigation-${mobile ? 'mobile' : 'desktop'}`, async ({ page, responses, requests }) => {
      const feedbackEvent = { event, campaign: null, campaign_configured: false, response_count: 0, is_open: false, insights: {} };
      const months = ['2026-08', '2026-09'].map(month => ({ month, label: month, event_count: 1, total_responses: 0, events: [feedbackEvent] }));

      responses.set('/api/attendance/monthly', { body: { ledger: [], insights: null } });
      responses.set('/api/feedback/monthly', { body: { months } });
      responses.set('/api/events/fixture-event/checklist', { body: { items: [] } });
      responses.set('/api/events/fixture-event/feedback-campaign', { status: 404, body: { error: 'Fixture campaign' } });
      await page.goto(`${origin}/organizer-console/feedback?month=2026-09&from=old#report`);
      await page.getByRole('heading', { name: 'Event feedback' }).waitFor();
      assert.match(page.url(), /reports\?.*month=2026-09.*section=feedback#report/);
      const nav = page.getByRole('navigation', { name: 'Reports sections' });

      assert.match(await page.getByRole('button', { name: /Sep 1 event/ }).getAttribute('class'), /feedback-month-button--active/);
      await page.getByRole('button', { name: /Aug 1 event/ }).click();
      await nav.getByRole('link', { name: 'Attendance' }).click();
      await page.getByRole('heading', { name: 'Monthly attendance' }).waitFor();
      await page.goBack();
      await page.getByRole('heading', { name: 'Event feedback' }).waitFor();
      assert.equal(await nav.getByRole('link', { name: 'Feedback' }).getAttribute('aria-current'), 'page');
      assert.match(await page.getByRole('button', { name: /Aug 1 event/ }).getAttribute('class'), /feedback-month-button--active/);
      await page.getByRole('button', { name: /Sep 1 event/ }).click();
      await page.screenshot({ path: `${artifacts}/reports-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
      await page.getByRole('link', { name: 'Configure' }).click();
      await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Feedback' }).click();
      await page.getByRole('heading', { name: 'Event feedback' }).waitFor();
      assert.match(page.url(), /section=feedback.*month=2026-09/);
      assert.equal(requests.some(request => request.method !== 'GET'), false);
    });
  }

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

      const expected = ["Events", "Reports", "Annual Conference", "People & Access", ...(role === "owner" ? ["Present forms", "Audit Log"] : [])];

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

      await page.setViewportSize({ width: 1440, height: 900 });
      const focusedLabel = 'People & Access';

      await primary.getByRole('link', { name: focusedLabel, exact: true }).focus();
      await page.setViewportSize({ width: 961, height: 900 });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      if (role === 'owner') {
        await page.waitForFunction(() => document.activeElement?.classList.contains('app-nav-more-toggle'));
      } else {
        assert.equal(await primary.getByRole('link', { name: focusedLabel, exact: true }).evaluate(element => element === document.activeElement), true);
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
  for (const scenario of [
    { name: "owner", role: "owner", capabilities: ownerCapabilities, assigned: false },
    { name: "assigned-volunteer", role: "volunteer", capabilities: [], assigned: true },
    { name: "delegated-volunteer", role: "volunteer", capabilities: ["volunteers.directory.view", "volunteers.reviews.view", "ticketing.check_in"], assigned: true },
  ]) {
    await journey(`conference-phone-navigation-${scenario.name}`, async ({ page, responses, requests }) => {
      const permissions = { ...workspace.permissions, access_scope: scenario.assigned ? "assigned" : "all", can_create_tasks: scenario.role === "owner", capabilities: scenario.capabilities };

      responses.set("/api/annual-conference/2026/work-plan", { body: { ...workspace, permissions } });
      responses.set("/api/annual-conference/editions", { body: { editions: [edition, { ...edition, id: "edition-2027", year: 2027, label: "December 2027" }] } });
      responses.set("/api/admin/organizers", { body: { organizers: [] } });
      responses.set("/api/annual-conference/2026/team", { body: { members: [] } });
      responses.set("/api/annual-conference/2026/volunteer-applications", { body: { applications: [] } });
      responses.set("/api/annual-conference/2026/volunteer-follow-up/reviews", { body: { recipients: [], outcome_messages: [] } });
      await page.goto(`${origin}/organizer-console/mobile/annual-conference/2026?section=tasks`);
      const nav = page.getByRole("navigation", { name: "Annual Conference workspace", exact: true });

      await nav.getByRole("button", { name: scenario.assigned ? "My tasks" : "Work plan", exact: true }).waitFor();
      assert.equal(await nav.getByRole("button", { name: scenario.assigned ? "My tasks" : "Work plan", exact: true }).getAttribute("aria-current"), "page");
      const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb' });

      await breadcrumbs.locator('[aria-current="page"]').waitFor();
      assert.equal(await breadcrumbs.locator('[aria-current="page"]').innerText(), scenario.assigned ? 'My tasks' : 'Work plan');
      assert.equal(await breadcrumbs.getByRole('link', { name: 'Overview' }).getAttribute('href'), '/organizer-console/mobile/annual-conference/2026?section=overview');
      assert.equal(await nav.getByRole("button", { name: "Volunteers", exact: true }).count(), scenario.capabilities.includes("volunteers.directory.view") ? 1 : 0);
      assert.equal(await nav.getByRole("button", { name: "Speakers", exact: true }).count(), scenario.role === "owner" ? 1 : 0);
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const back = await page.getByRole("button", { name: "Back to conference overview" }).boundingBox();

        assert.ok(back && back.width >= 44 && back.height >= 44);
        assert.equal(await page.getByLabel("More conference navigation").count(), 0);
        assert.ok(await nav.getByRole("button").count() <= 5, "Footer has at most five actions");
        const footer = await nav.boundingBox();

        assert.ok(footer && Math.abs(footer.y + footer.height - 844) < 1, "Footer is pinned to viewport bottom");
        for (const button of await nav.getByRole("button").all()) {
          const box = await button.boundingBox();

          assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= width, `Navigation target fits at ${width}px`);
        }
      }
      const more = nav.getByRole("button", { name: "More", exact: true });

      if (scenario.name === "assigned-volunteer") {
        assert.equal(await more.count(), 0);
        assert.equal(await nav.getByRole("button", { name: "Sign out", exact: true }).count(), 1);
      } else {
        await more.click();
        const dialog = page.getByRole("dialog", { name: "More" });
        const menu = dialog.getByRole("navigation", { name: "More conference destinations" });

        await dialog.waitFor();
        await page.screenshot({ path: `${artifacts}/conference-phone-navigation-${scenario.name}.png`, fullPage: false, animations: "disabled" });
        assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('.conference-phone-menu__panel'))), true);
        assert.equal(await menu.getByRole("link", { name: "Programme", exact: true }).count(), scenario.role === "owner" ? 1 : 0);
        assert.equal(await menu.getByRole("link", { name: "Ticketing", exact: true }).count(), scenario.role === "owner" ? 1 : 0);
        assert.equal(await dialog.getByRole("button", { name: "Sign out", exact: true }).count(), 1);
        if (scenario.role === "owner") {
          assert.equal(await menu.getByRole("button", { name: "Speakers", exact: true }).count(), 0);
          assert.equal(await menu.getByRole("link", { name: "Registration", exact: true }).getAttribute("href"), "/organizer-console/annual-conference/2026/registrations");
          assert.equal(await menu.getByText("Finance", { exact: false }).getAttribute("aria-disabled"), "true");
          const editionPicker = page.getByRole("button", { name: /Edition.*December 2026/ });

          await editionPicker.focus();
          await page.keyboard.press("ArrowDown");
          await page.getByRole("option", { name: "December 2026" }).waitFor();
          await page.keyboard.press("Escape");
          assert.equal(await dialog.isVisible(), true, "First Escape closes the edition menu, not the navigation drawer");
        }
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden" });
        assert.equal(await more.evaluate(element => document.activeElement === element), true);
      }
      await nav.getByRole("button", { name: "Overview", exact: true }).click();
      await page.waitForURL(url => url.pathname.endsWith("/2026") && url.searchParams.get("section") === "overview");
      await page.goBack();
      await page.waitForURL(url => url.searchParams.get("section") === "tasks");
      if (scenario.name === 'delegated-volunteer') {
        await nav.getByRole('button', { name: 'Volunteers', exact: true }).click();
        await page.waitForURL(url => url.searchParams.get('section') === 'volunteers');
        await breadcrumbs.locator('[aria-current="page"]').waitFor();
        assert.equal(await breadcrumbs.locator('[aria-current="page"]').innerText(), 'Directory');
        const reviews = page.getByRole('tab', { name: 'Reviews', exact: true });

        await reviews.waitFor();
        await reviews.click();
        await page.waitForURL(url => url.searchParams.get('volunteerView') === 'reviews');
        await page.waitForFunction(() => document.querySelector('[aria-label="Breadcrumb"] [aria-current="page"]')?.textContent?.trim() === 'Reviews');
        assert.equal(await breadcrumbs.getByRole('link', { name: 'Volunteers' }).getAttribute('href'), '/organizer-console/mobile/annual-conference/2026?section=volunteers&volunteerView=directory');
      }
      assert.equal(requests.some(request => request.method !== "GET"), false);
    }, { role: scenario.role });
  }

  await journey("conference-phone-navigation-same-year", async ({ page, responses, requests }) => {
    const edition2027 = { ...edition, id: "edition-2027", year: 2027, label: "December 2027" };
    const permissions = { ...workspace.permissions, access_scope: "all", capabilities: ownerCapabilities };

    responses.set("/api/annual-conference/editions", { body: { editions: [edition2027, edition] } });
    responses.set("/api/annual-conference/2027/work-plan", { body: { ...workspace, edition: edition2027, permissions } });
    responses.set("/api/annual-conference/2027/speakers", { body: {
      edition: { ...edition2027, name: "DevCongress Annual Conference" },
      call: { open: true, public_path: "/speak/c/2027", logistics_deadline: null },
      permissions: { can_manage: true, can_send_email: false },
      email_delivery: { configured: false, workspace_links_configured: false },
      counts: { submitted: 0, selected: 0, not_selected: 0, withdrawn: 0 }, submissions: [],
    } });
    responses.set("/api/admin/organizers", { body: { organizers: [] } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/organizer-console/annual-conference/2027/speakers?section=participation`);
    const nav = page.getByRole("navigation", { name: "Annual Conference workspace", exact: true });
    const section = page.getByRole("navigation", { name: "Speaker sections" });

    await section.locator(".app-dropdown-trigger").getByText("Participation", { exact: true }).waitFor();
    await nav.getByRole("button", { name: "More", exact: true }).click();
    const menu = page.getByRole("navigation", { name: "More conference destinations" });

    assert.equal(await menu.getByRole("link", { name: "Programme", exact: true }).getAttribute("href"), "/organizer-console/annual-conference/2027/programme");
    assert.equal(await menu.getByRole("link", { name: "Ticketing", exact: true }).getAttribute("href"), "/organizer-console/annual-conference/2027/ticketing");
    await page.keyboard.press("Escape");
    await nav.getByRole("button", { name: "Work plan", exact: true }).click();
    await page.waitForURL(url => url.pathname.endsWith("/mobile/annual-conference/2027") && url.searchParams.get("section") === "tasks");
    await page.goBack();
    await page.waitForURL(url => url.pathname.endsWith("/annual-conference/2027/speakers") && url.searchParams.get("section") === "participation");
    await section.locator(".app-dropdown-trigger").getByText("Participation", { exact: true }).waitFor();
    await page.setViewportSize({ width: 1024, height: 844 });
    await page.getByRole("navigation", { name: "Annual Conference workspace", exact: true }).waitFor();
    assert.equal(await page.locator(".conference-phone-shell").isVisible(), false);
    assert.equal(requests.some(request => request.method !== "GET"), false);
  }, { role: "owner" });

  await journey("conference-phone-navigation-owner-display", async ({ page, requests }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/organizer-console/present-forms/display?demo=1`);
    await page.locator('.audience-board').waitFor();
    assert.ok(page.url().includes('/present-forms/display?demo=1'));
    assert.equal(await page.getByRole('navigation', { name: 'Organizer workspaces' }).count(), 0);
    assert.equal(requests.some(request => request.method !== 'GET'), false);
  }, { role: 'owner' });

  await journey("mobile-section-pickers", async ({ page, responses, requests }) => {
    const permissions = { ...workspace.permissions, access_scope: "all", capabilities: ownerCapabilities };

    responses.set('/api/annual-conference/editions', { body: { editions: [edition] } });
    responses.set('/api/annual-conference/2026/work-plan', { body: { ...workspace, permissions } });
    responses.set('/api/annual-conference/2026/speakers', { body: {
      edition: { ...edition, name: 'DevCongress Annual Conference' }, call: { open: true, public_path: '/speak/c/2026', logistics_deadline: null },
      permissions: { can_manage: true, can_send_email: true }, email_delivery: { configured: true, workspace_links_configured: true },
      counts: { submitted: 0, selected: 0, not_selected: 0, withdrawn: 0 }, submissions: [],
    } });
    responses.set('/api/annual-conference/2026/speakers/storage', { body: { speaker_photo_count: 0, speaker_photo_bytes: 0, shared_bucket_bytes: 0 } });
    responses.set('/api/annual-conference/2026/speaker-outcomes/messages', { body: { messages: [] } });
    responses.set('/api/annual-conference/2026/ticketing', { body: { settings: { public_capacity: 150, ticket_tiers: [] }, inventory: { paid_seats: 0, sponsor_seats_held: 0, checkout_seats_held: 0, remaining_public_seats: 150 } } });
    responses.set('/api/annual-conference/2026/ticketing/orders', { body: { orders: [], total: 0, page: 1, page_size: 5 } });
    responses.set('/api/admin/audit-log', { body: { logs: [] } });
    responses.set('/api/admin/short-links', { body: { links: [] } });
    responses.set('/api/admin/archived-events', { body: { events: [] } });
    responses.set('/api/admin/organizers', { body: { organizers: [] } });
    const cases = [
      { path: '/organizer-console/annual-conference/2026/speakers?section=proposals&retained=yes', label: 'Speaker sections', selected: 'Proposals', target: 'Participation', key: 'participation' },
      { path: '/organizer-console/annual-conference/2026/ticketing?section=overview&retained=yes', label: 'Ticketing sections', selected: 'Overview', target: 'Orders', key: 'orders' },
      { path: '/organizer-console/audit-log?section=activity&retained=yes', label: 'Audit section', selected: 'Activity', target: 'Short links', key: 'short-links' },
    ];

    for (const item of cases) {
      for (const width of [320, 390, 767]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(origin + item.path);
        const picker = page.getByRole('button', { name: new RegExp(`^${item.label}`) });

        await picker.waitFor();
        assert.match(await picker.innerText(), new RegExp(item.selected));
        if (item.label === 'Audit section' && width !== 767) {
          await page.screenshot({ path: `${artifacts}/audit-picker-${width}-closed.png`, animations: 'disabled' });
        }
        await picker.focus();
        await page.keyboard.press('ArrowDown');
        const list = page.getByRole('listbox');

        await list.waitFor();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const box = await list.boundingBox();

        if (item.label === 'Audit section' && width !== 767) {
          await page.screenshot({ path: `${artifacts}/audit-picker-${width}-open.png`, animations: 'disabled' });
        }
        assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 845, `${item.label} menu fits ${width}px`);
        if (width === 767) {
          await page.setViewportSize({ width: 1024, height: 844 });
          await list.waitFor({ state: 'hidden' });
          if (item.label === 'Audit section') await page.getByRole('tab', { name: item.selected, exact: true }).waitFor();
          else await page.getByRole('navigation', { name: item.label }).getByRole('link', { name: item.selected, exact: true }).waitFor();
          await page.setViewportSize({ width, height: 844 });
          await picker.waitFor();
          await picker.focus();
          await page.keyboard.press('ArrowDown');
          await list.waitFor();
        }
        await page.keyboard.press('Escape');
        assert.equal(await picker.evaluate(element => element === document.activeElement), true);
        await picker.click();
        await page.getByRole('option', { name: item.target, exact: true }).click();
        await page.waitForURL(url => url.searchParams.get('section') === item.key);
        const breadcrumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
        const current = breadcrumbs.locator('[aria-current="page"]');

        await current.waitFor();
        assert.equal(await current.innerText(), item.target);
        assert.equal(await current.evaluate(element => element.tagName), 'SPAN');
        if (item.label === 'Speaker sections' || item.label === 'Ticketing sections') {
          const parent = item.label === 'Speaker sections' ? 'Speakers' : 'Ticketing';
          const parentPath = item.label === 'Speaker sections' ? 'speakers?section=proposals' : 'ticketing?section=overview';

          assert.equal(await breadcrumbs.getByRole('link', { name: 'Overview' }).getAttribute('href'), '/organizer-console/mobile/annual-conference/2026?section=overview');
          assert.equal(await breadcrumbs.getByRole('link', { name: parent }).getAttribute('href'), `/organizer-console/annual-conference/2026/${parentPath}`);
        } else {
          assert.equal(await breadcrumbs.getByRole('link', { name: 'Home' }).getAttribute('href'), '/organizer-console/mobile');
        }
        assert.equal(await breadcrumbs.evaluate(element => element.scrollWidth <= element.clientWidth), true);
        if (item.label === 'Speaker sections' && width !== 767) {
          await page.screenshot({ path: `${artifacts}/speakers-participation-${width}.png`, animations: 'disabled' });
        }
        assert.equal(new URL(page.url()).searchParams.get('retained'), 'yes');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.goBack();
        await page.waitForURL(url => new URL(url).searchParams.get('section') !== item.key);
        await picker.waitFor();
        assert.match(await picker.innerText(), new RegExp(item.selected));
      }
      await page.setViewportSize({ width: 1024, height: 844 });
      await page.goto(origin + item.path);
      assert.equal(await page.getByRole('button', { name: new RegExp(`^${item.label}`) }).count(), 0);
      if (item.label === 'Audit section') await page.getByRole('tablist', { name: 'Audit Log sections' }).waitFor();
      else await page.getByRole('navigation', { name: item.label }).getByRole('link', { name: item.selected, exact: true }).waitFor();
    }
    assert.equal(requests.some(request => request.method !== 'GET'), false);
  }, { role: 'owner' });

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
  for (const role of ["organizer", "volunteer"]) {
    for (const width of [1024, 1440]) {
      await journey(`work-plan-sticky-header-${role}-${width}`, async ({ page, responses }) => {
        await page.setViewportSize({ width, height: 900 });
        const tasks = Array.from({ length: 24 }, (_, index) => ({
          id: `sticky-task-${index}`,
          edition_id: edition.id,
          title: `Prepare conference task ${index + 1}`,
          details: "Coordinate the materials and confirm readiness with the team.",
          internal_note: null,
          phase_id: "current",
          workstream: "venue_production_logistics",
          accountable_owner: "fixture@example.com",
          collaborators: [],
          priority: "medium",
          target_date: "2026-09-30",
          status: ["not_started", "in_progress", "blocked", "done"][index % 4],
          dependency_task_ids: [],
          dependency_note: null,
          source: "manual",
          sort_order: index,
          created_at: "2026-09-01T00:00:00Z",
          updated_at: "2026-09-01T00:00:00Z",
        }));

        responses.set("/api/annual-conference/2026/work-plan", { body: {
          ...workspace,
          phases: [{ id: "current", name: "Current phase", starts_on: "2026-09-01", ends_on: "2026-09-30", sort_order: 1 }],
          tasks,
          permissions: { ...workspace.permissions, access_scope: role === "volunteer" ? "assigned" : "all" },
        } });
        responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
        responses.set("/api/annual-conference/2026/task-members", { body: { organizers: [] } });
        await page.goto(`${origin}/organizer-console/annual-conference/2026/work-plan`);
        await page.getByRole("button", { name: "Open Prepare conference task 1", exact: true }).waitFor();
        await page.evaluate(() => document.fonts.ready);
        await waitForRouteTransition(page);
        const originalHeight = await page.locator(".annual-task-workspace").evaluate(element => element.getBoundingClientRect().height);

        for (const scrollTop of [350, 650, 900]) {
          await page.locator(".app-main").evaluate((element, top) => { element.scrollTop = top; }, scrollTop);
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const geometry = await page.evaluate(() => {
            const controls = document.querySelector(".annual-task-workspace").getBoundingClientRect();
            const nav = document.querySelector(".annual-conference-nav-shell").getBoundingClientRect();
            const phaseLabel = document.querySelector(".annual-task-workspace__controls p").getBoundingClientRect();
            const columnHeader = document.querySelector(".task-board__column-header").getBoundingClientRect();

            return { top: controls.top, bottom: controls.bottom, height: controls.height, navBottom: nav.bottom, labelTop: phaseLabel.top, columnTop: columnHeader.top };
          });

          assert.ok(Math.abs(geometry.height - originalHeight) < 1, "Phase controls must retain their full height");
          assert.ok(geometry.top >= geometry.navBottom - 1, `Phase controls overlap navigation at scroll ${scrollTop}: ${JSON.stringify(geometry)}`);
          assert.ok(geometry.labelTop >= geometry.navBottom, "Viewing phase label must stay visible");
          assert.ok(geometry.columnTop >= geometry.bottom - 1, "Board headings must remain below the full controls bar");
        }
        await page.screenshot({ path: `${artifacts}/work-plan-sticky-header-${role}-${width}.png`, fullPage: false });
      }, { role });
    }
  }

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
            "volunteers.directory.view",
            "volunteers.reviews.view",
            "volunteers.campaign.view",
            "volunteers.campaign.manage",
            "volunteers.campaign.send",
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
        const picker = page.getByRole("button", { name: /^Campaign section / });

        if (await picker.isVisible()) {
          await picker.click();
          await page.getByRole("option", { name, exact: true }).click();
          await waitForCampaignTabs();
          assert.match(await picker.innerText(), new RegExp(name));
        } else {
          await scope.getByRole("tab", { name, exact: true }).click();
          await waitForCampaignTabs();
          assert.equal(await scope.getByRole("tab", { name, exact: true }).getAttribute("aria-selected"), "true");
        }
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
      async function selectMobileCampaign() {
        const picker = mobileConference.getByRole("button", { name: /^Volunteer section / });

        if (await picker.isVisible()) {
          await picker.click();
          await page.getByRole("option", { name: "Campaign", exact: true }).click();
          assert.match(await picker.innerText(), /Campaign/);
        } else {
          await mobileConference.getByRole("tab", { name: "Campaign", exact: true }).click();
        }
      }

      await selectMobileCampaign();
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
      await page.waitForURL(url => url.pathname === "/organizer-console/annual-conference/2026/volunteers"
        && url.searchParams.get("volunteerView") === "campaign" && url.searchParams.get("campaignTab") === "settings");
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
      await selectMobileCampaign();
      const mobileCampaignSections = mobileConference.getByRole("tablist", { name: "Campaign sections" });

      await page.getByRole("button", { name: /^Campaign section / }).waitFor();
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
      assert.match(await page.getByRole("button", { name: /^Campaign section / }).innerText(), /Outcome emails/);
      assert.equal(await page.locator("#app").getAttribute("inert"), null);
      await mobileDeliveries.screenshot({ style: ".conference-mobile__header { position: static !important; }", path: `${artifacts}/outcome-delivery-accepted-mobile.png` });
      await mobileOutcomes.getByRole("button", { name: "Choose outcome audience" }).click();
      await page.getByRole("option", { name: "Not-selected applicants", exact: true }).click();
      await mobileDeliveries.getByRole("searchbox").fill("");
      await mobileDeliveries.getByRole("button", { name: "Queue retry for Not-selected Applicant", exact: true }).waitFor();
      await mobileDeliveries.screenshot({ style: ".conference-mobile__header { position: static !important; }", path: `${artifacts}/outcome-delivery-not-selected-mobile.png` });

      await page.setViewportSize({ width: 1280, height: 1000 });
      await page.waitForURL(url => url.pathname === "/organizer-console/annual-conference/2026/volunteers"
        && url.searchParams.get("volunteerView") === "campaign" && url.searchParams.get("campaignTab") === "outcomes");
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
      // The scheduler result ages while the organizer continues working.
      await page.clock.setSystemTime(new Date("2026-09-26T12:15:00.000Z"));
      await selectCampaignSection(campaignSections, "Settings");
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
              capabilities: ["volunteers.reviews.view", "volunteers.reviews.manage"],
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
          if (mobile) {
            const copyToggle = page.getByRole("button", { name: "Edit email copy", exact: true });
            const firstApplicant = page.locator(".reviews-list > button").first();
            const applicantTop = await firstApplicant.evaluate((element) => element.getBoundingClientRect().top);

            assert.ok(applicantTop < 800, `First applicant should be visible on the phone: top=${applicantTop}`);
            assert.equal(await copyToggle.getAttribute("aria-expanded"), "false");
            await copyToggle.click();
          }
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
          if (mobile) {
            await page.getByRole("button", { name: /Hide email copy/ }).click();
            const copyToggle = page.getByRole("button", { name: /Edit email copy.*Unsaved changes/ });

            assert.equal(await copyToggle.getAttribute("aria-expanded"), "false");
            await copyToggle.click();
            assert.equal(await page.getByLabel("Outcome email message").inputValue(), "Accepted outcome body saved by reviewer.");
          }
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
            await page.getByRole("button", { name: /Hide email copy/ }).click();
            const moreFilters = page.getByRole("button", { name: "More filters", exact: true });

            assert.equal(await moreFilters.getAttribute("aria-expanded"), "false");
            assert.equal(await page.getByRole("button", { name: "Filter by submission status" }).isVisible(), false);
            await moreFilters.click();
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
                  searchBounds.bottom <= reviewBounds.top &&
                  [submissionBounds, reviewBounds, decisionBounds, invitationBounds].every((bounds) =>
                    bounds.left >= toolbarBounds.left &&
                    bounds.right <= toolbarBounds.right &&
                    bounds.left >= 0 &&
                    bounds.right <= window.innerWidth,
                  ) &&
                  reviewBounds.bottom <= submissionBounds.top &&
                  Math.abs(submissionBounds.top - decisionBounds.top) < 1 &&
                  invitationBounds.top >= submissionBounds.bottom &&
                  submissionBounds.right <= decisionBounds.left
                );
              });

              assert.equal(
                toolbarLayout,
                true,
                `Mobile review toolbar must fit at ${width}px with search and review above the expanded filters.`,
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
  for (const mobile of [false, true]) {
    await journey(`speaker-updates-${mobile ? "mobile" : "desktop"}`, async ({ page, responses, requests }) => {
      const base = "/api/annual-conference/2026/speaker-updates";
      const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
      const candidates = [
        { id: ids[0], name: "Ada Example", email: "ada@example.test", eligible: true, reason: null },
        { id: ids[1], name: "Ama Example", email: "ama@example.test", eligible: true, reason: null },
        { id: ids[2], name: "Esi Example", email: "esi@example.test", eligible: false, reason: "Private workspace access is revoked." },
      ];
      const fixture = spawnSync(process.execPath, ["--import", "tsx", "scripts/fixtures/speaker-update-preview.ts"], { encoding: "utf8" });

      assert.equal(fixture.status, 0, fixture.stderr);
      const { rendered, defaultDraft } = JSON.parse(fixture.stdout);
      let campaign = { id: "10000000-0000-4000-8000-000000000001", edition_id: "fixture-edition", ...defaultDraft, version: 1, state: "draft", created_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-05T10:00:00Z" };
      let sendingEnabled = false;
      const delivery = { id: "delivery-1", submission_id: ids[0], name: candidates[0].name, recipient: candidates[0].email, status: "failed", last_error: "Temporary failure", attempt_count: 1 };
      const previewPath = (id) => `${base}/${campaign.id}/previews/20000000-0000-4000-8000-000000000001/recipients/${id}/html`;
      const recipient = { id: ids[0], name: candidates[0].name, recipient: candidates[0].email, ...rendered, preview_url: previewPath(ids[0]) };
      const emailCsp = "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'; script-src 'none'; style-src 'unsafe-inline'; style-src-attr 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https://devcongress.org https://em.devcongress.org";

      for (const id of ids.slice(0, 2)) {
        responses.set(previewPath(id), { contentType: "text/html", headers: { "content-security-policy": emailCsp }, body: rendered.html });
      }

      responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
      responses.set("/api/annual-conference/2026/speakers", { body: { edition: { ...edition, name: "DevCongress Annual Conference" }, call: { open: true, public_path: "/speak/c/2026", logistics_deadline: null }, permissions: { can_manage: true, can_send_email: true }, email_delivery: { configured: true, workspace_links_configured: true }, counts: { submitted: 0, selected: 0, not_selected: 0, withdrawn: 0 }, submissions: [] } });
      responses.set("/api/annual-conference/2026/speaker-outcomes/messages", { body: { messages: [] } });
      const sentCampaign = { ...campaign, id: "10000000-0000-4000-8000-000000000002", subject: "Programme details", state: "complete", delivery_summary: { total: 2, statuses: { delivered: 1, failed: 1 } } };

      responses.set(base, async () => ({ body: { campaigns: [campaign, sentCampaign], candidates, default_draft: defaultDraft, sending_enabled: sendingEnabled, send_unavailable_reason: sendingEnabled ? null : "Speaker update delivery is not enabled." } }));
      responses.set(`${base}/${campaign.id}`, async (request) => {
        if (request.method() === "PUT") campaign = { ...campaign, ...JSON.parse(request.postData()), version: campaign.version + 1 };

        return { body: request.method() === "PUT" ? { campaign } : { campaign, deliveries: campaign.state === "draft" ? [] : [delivery] } };
      });
      responses.set(`${base}/${campaign.id}/preview`, { body: { preview_id: "20000000-0000-4000-8000-000000000001", expires_in_seconds: 600, recipients: [recipient, { ...recipient, id: ids[1], name: "Ama Example", recipient: "ama@example.test", preview_url: previewPath(ids[1]) }] } });
      let testAttempt = 0;
      const staleTest = createSaveGate();

      responses.set(`${base}/${campaign.id}/test`, async () => {
        testAttempt += 1;
        if (testAttempt === 1) return { status: 503, body: { error: "Test delivery unavailable" } };
        if (testAttempt === 3) {
          staleTest.markEntered();
          await staleTest.response;
        }

        return { body: { accepted: true, recipient: "test@example.test" } };
      });
      responses.set(`${base}/${campaign.id}/send`, async () => { campaign = { ...campaign, state: "queued" };

 return { body: { queued: 1 } }; });
      await page.setViewportSize({ width: mobile ? 390 : 1440, height: 844 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/speakers?section=outcome-messages&messageView=updates`);
      await page.getByRole("button", { name: /DevCon26 speaker update/ }).waitFor();
      await page.getByRole("heading", { name: "Speaker updates", exact: true }).evaluate(el => el.closest("section").scrollIntoView({ block: "start" }));
      await page.screenshot({ path: `${artifacts}/speaker-updates-${mobile ? "mobile" : "desktop"}-history.png`, animations: "disabled" });
      await page.getByRole("button", { name: "New update" }).click();
      await page.getByRole("button", { name: /Start with/ }).click();
      await page.getByRole("option", { name: "Workspace reminder" }).click();
      await page.getByRole("listbox").waitFor({ state: "hidden" });
      await page.getByLabel("Subject", { exact: true }).waitFor();
      await page.screenshot({ path: `${artifacts}/speaker-updates-${mobile ? "mobile" : "desktop"}-reminder.png`, animations: "disabled" });
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "Close update" }).click();
      await page.getByRole("button", { name: /DevCon26 speaker update/ }).click();
      await page.getByLabel("Subject").fill("Updated details");
      assert.equal(await page.getByLabel("Subject").inputValue(), "Updated details");
      await page.getByText("Save this update before previewing or testing.").waitFor();
      await page.getByRole("button", { name: "Save update" }).click();
      await page.getByLabel(/Ada Example/).check();
      await page.getByLabel(/Ama Example/).check();
      assert.equal(await page.getByLabel(/Esi Example/).isDisabled(), true);
      await page.getByText("Private workspace access is revoked.").waitFor();
      await page.screenshot({ path: `${artifacts}/speaker-updates-${mobile ? "mobile" : "desktop"}-draft.png`, animations: "disabled" });
      const testAction = page.getByRole("button", { name: "Send test email" });

      await testAction.click();
      const testDrawer = page.getByRole("dialog", { name: "Send test email" });

      await testDrawer.waitFor();
      assert.equal(await testDrawer.getByLabel("Test recipient").evaluate((input) => document.activeElement === input), true);
      assert.equal(await testDrawer.getByRole("button", { name: "Send update to 2 speakers" }).count(), 0);
      await testDrawer.getByText("Choose the speaker whose frozen email you want to test.").waitFor();
      await testDrawer.getByLabel("Test recipient").fill("test@example.test");
      if (!mobile) {
        const primary = testDrawer.getByRole("button", { name: "Send test email" });
        const secondary = testDrawer.getByRole("button", { name: "Close" });
        const style = (element) => {
          const css = getComputedStyle(element);

          return { background: css.backgroundColor, color: css.color, outline: css.outlineStyle, shadow: css.boxShadow, transform: css.transform };
        };

        for (const button of [primary, secondary]) {
          await page.mouse.move(0, 0);
          const before = await button.evaluate(style);

          await button.hover();
          const after = await button.evaluate(style);

          assert.notEqual(after.background, before.background);
          assert.equal(after.outline, before.outline);
          assert.equal(after.shadow, before.shadow);
          assert.equal(after.transform, before.transform);
        }
        await primary.hover();
        await testDrawer.screenshot({ path: `${artifacts}/speaker-update-hover-primary.png`, animations: "disabled" });
        await secondary.hover();
        await testDrawer.screenshot({ path: `${artifacts}/speaker-update-hover-secondary.png`, animations: "disabled" });
      }
      await page.screenshot({ path: `${artifacts}/speaker-updates-${mobile ? "mobile" : "desktop"}-test.png`, animations: "disabled" });
      await testDrawer.getByRole("button", { name: "Send test email" }).click();
      await testDrawer.getByRole("alert").filter({ hasText: "Test delivery unavailable" }).waitFor();
      assert.equal(await testDrawer.getByLabel("Test recipient").inputValue(), "test@example.test");
      await testDrawer.getByRole("button", { name: "Send test email" }).click();
      await testDrawer.waitFor({ state: "hidden" });
      await page.getByText("Test email sent to test@example.test.").waitFor();
      const testRequests = requests.filter((request) => request.path.endsWith("/test"));
      const testPayload = JSON.parse(testRequests[0].body);

      assert.deepEqual({ ...testPayload, request_id: "uuid" }, { preview_id: "20000000-0000-4000-8000-000000000001", recipient_id: ids[0], email: "test@example.test", request_id: "uuid" });
      assert.equal(JSON.parse(testRequests[1].body).request_id, testPayload.request_id);
      assert.equal(requests.some((request) => request.path.endsWith("/send")), false);
      await page.getByRole("button", { name: /Updated details/ }).click();
      await page.getByLabel(/Ada Example/).check();
      await page.getByLabel(/Ama Example/).check();
      await page.getByRole("button", { name: "Preview 2 selected" }).click();
      const drawer = page.getByRole("dialog", { name: "Review speaker updates" });

      await drawer.waitFor();
      assert.deepEqual(JSON.parse(requests.find((request) => request.path.endsWith("/preview")).body), { ids: [ids[0], ids[1]], version: 2 });
      const previewFrame = drawer.frameLocator('iframe[title="Personalized speaker update preview"]');

      await previewFrame.locator('.email-copy').first().waitFor();
      const brandColors = await previewFrame.locator('.email-brand-meta').evaluate((element) => ({
        text: getComputedStyle(element).color,
        background: getComputedStyle(element.closest('.email-brand')).backgroundColor,
      }));

      assert.equal(brandColors.text, 'rgb(255, 255, 255)');
      assert.equal(brandColors.background, 'rgb(17, 17, 17)');
      const copy = previewFrame.locator('.email-copy').filter({ hasText: 'Hi Ada' });

      await copy.waitFor();
      const copyStyle = await copy.evaluate(element => ({
        color: getComputedStyle(element).color,
        background: getComputedStyle(element.closest('.email-content')).backgroundColor,
        size: getComputedStyle(element).fontSize,
        family: getComputedStyle(element).fontFamily,
      }));

      assert.equal(copyStyle.color, 'rgb(68, 68, 68)');
      assert.equal(copyStyle.background, 'rgb(255, 255, 255)');
      assert.equal(copyStyle.size, '16px');
      assert.match(copyStyle.family, /Inter/i);
      await drawer.locator('iframe').screenshot({ path: `${artifacts}/speaker-update-rendered-${mobile ? "phone" : "desktop"}.png`, animations: "disabled" });
      await page.screenshot({ path: `${artifacts}/speaker-updates-${mobile ? "mobile" : "desktop"}-preview.png`, animations: "disabled" });
      assert.equal(await drawer.getByRole("button", { name: "Send update to 2 speakers" }).isDisabled(), true);
      await drawer.getByText("Speaker update delivery is not enabled.").waitFor();
      sendingEnabled = true;
      await page.reload();
      await page.getByRole("button", { name: /Updated details/ }).click();
      await page.getByLabel(/Ada Example/).check();
      await page.getByLabel(/Ama Example/).check();
      await page.getByRole("button", { name: "Preview 2 selected" }).click();
      await drawer.waitFor();
      await drawer.getByRole("button", { name: "Close" }).click();
      await drawer.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Preview 2 selected");
      await page.getByLabel("Subject").fill("Unsaved change");
      assert.equal(await page.getByRole("button", { name: "Preview 2 selected" }).isDisabled(), true);
      await page.getByLabel("Subject").fill("Updated details");
      await page.getByRole("button", { name: "Preview 2 selected" }).click();
      await drawer.waitFor();
      assert.equal(requests.filter((request) => request.path.endsWith("/preview")).length, 4);
      assert.equal(await drawer.getByLabel("Test recipient").count(), 0);
      await drawer.getByRole("button", { name: "Close" }).click();
      await testAction.click();
      await testDrawer.waitFor();
      await testDrawer.getByLabel("Test recipient").fill("test@example.test");
      await testDrawer.getByRole("button", { name: "Send test email" }).click();
      await waitForSaveGate(staleTest, "stale speaker update test");
      if (mobile) {
        await testDrawer.getByRole("button", { name: /Preview recipient/ }).click();
        await page.getByRole("option", { name: "Ama Example" }).click();
        await testDrawer.getByText("2 of 2 speakers").waitFor();
      } else {
        await testDrawer.getByRole("button", { name: "Ama Example" }).click();
      }
      assert.equal(await testDrawer.getByLabel("Test recipient").inputValue(), "");
      const staleResponse = page.waitForResponse((response) => response.url().endsWith("/test"));

      staleTest.release();
      await staleResponse;
      assert.equal(await testDrawer.isVisible(), true);
      assert.equal(await testDrawer.getByLabel("Test recipient").inputValue(), "");
      assert.equal(requests.some((request) => request.path.endsWith("/send")), false);
      await testDrawer.getByRole("button", { name: "Close" }).click();
      await page.getByRole("button", { name: "Preview 2 selected" }).click();
      await drawer.waitFor();
      await drawer.getByRole("button", { name: "Send update to 2 speakers" }).click();
      await drawer.waitFor({ state: "hidden" });
      await page.getByText("Temporary failure").waitFor();
      assert.deepEqual(JSON.parse(requests.find((request) => request.path.endsWith("/send")).body), { preview_id: "20000000-0000-4000-8000-000000000001", confirmed: true });
      assert.equal(await page.getByLabel("Subject").isDisabled(), true);
      assert.equal(await page.getByText("Failed · 1 attempt").count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }, { role: "owner" });
  }

  for (const mobile of [false, true]) {
    await journey(`speaker-updates-recipient-selection-${mobile ? "mobile" : "desktop"}`, async ({ page, responses, requests }) => {
      const base = "/api/annual-conference/2026/speaker-updates";
      const candidates = Array.from({ length: 8 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name: `Speaker ${index + 1}`, email: `speaker${index + 1}@example.test`,
        eligible: index !== 2, reason: index === 2 ? "Private workspace access is revoked." : null,
      }));
      const selectedIds = candidates.filter(item => item.eligible).map(item => item.id);
      const fixture = spawnSync(process.execPath, ["--import", "tsx", "scripts/fixtures/speaker-update-preview.ts"], { encoding: "utf8" });

      assert.equal(fixture.status, 0, fixture.stderr);
      const { rendered, defaultDraft } = JSON.parse(fixture.stdout);
      let campaign = { id: "10000000-0000-4000-8000-000000000001", edition_id: "fixture-edition", ...defaultDraft, version: 1, state: "draft", created_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-05T10:00:00Z" };
      let sendingEnabled = false;
      const previewPath = (id) => `${base}/10000000-0000-4000-8000-000000000001/previews/20000000-0000-4000-8000-000000000001/recipients/${id}/html`;
      const emailCsp = "default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'; form-action 'none'; script-src 'none'; style-src 'unsafe-inline'; style-src-attr 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https://devcongress.org https://em.devcongress.org";

      responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
      responses.set("/api/annual-conference/2026/speakers", { body: { edition: { ...edition, name: "DevCongress Annual Conference" }, call: { open: true, public_path: "/speak/c/2026", logistics_deadline: null }, permissions: { can_manage: true, can_send_email: true }, email_delivery: { configured: true, workspace_links_configured: true }, counts: { submitted: 0, selected: 0, not_selected: 0, withdrawn: 0 }, submissions: [] } });
      responses.set("/api/annual-conference/2026/speaker-outcomes/messages", { body: { messages: [] } });
      responses.set(base, () => ({ body: { campaigns: [campaign], candidates, default_draft: defaultDraft, sending_enabled: sendingEnabled, send_unavailable_reason: "Speaker update delivery is not enabled." } }));
      responses.set(`${base}/${campaign.id}`, () => ({ body: { campaign, deliveries: [] } }));
      responses.set(`${base}/10000000-0000-4000-8000-000000000001/preview`, (request) => {
        const { ids } = JSON.parse(request.postData());

        return { body: { preview_id: "20000000-0000-4000-8000-000000000001", expires_in_seconds: 600, recipients: ids.map(id => {
          const candidate = candidates.find(item => item.id === id);

          return { id, name: candidate.name, recipient: candidate.email, ...rendered, preview_url: previewPath(id) };
        }) } };
      });
      for (const candidate of candidates) {
        responses.set(previewPath(candidate.id), { contentType: "text/html", headers: { "content-security-policy": emailCsp }, body: rendered.html });
      }
      responses.set(`${base}/10000000-0000-4000-8000-000000000001/send`, () => {
        campaign = { ...campaign, state: "queued" };

        return { body: { queued: selectedIds.length } };
      });
      await page.setViewportSize({ width: mobile ? 390 : 1440, height: 844 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/speakers?section=outcome-messages&messageView=updates`);
      await page.getByRole("button", { name: /DevCon26 speaker update/ }).click();
      const selectAll = page.getByLabel("Select all eligible");
      const pagination = page.getByRole("navigation", { name: "Speaker update recipients" });

      await page.getByLabel(/Speaker 1 ·/).check();
      assert.equal(await selectAll.evaluate(input => input.indeterminate), true);
      await selectAll.check();
      await page.getByText("7 selected", { exact: true }).waitFor();
      assert.equal(await page.getByLabel(/Speaker 3 ·/).isDisabled(), true);
      await pagination.getByRole("button", { name: "Next page" }).click();
      assert.equal(await page.getByLabel(/Speaker 7 ·/).isChecked(), true);
      assert.equal(await page.getByLabel(/Speaker 8 ·/).isChecked(), true);
      await page.getByRole("button", { name: "Clear all" }).click();
      assert.equal(await page.getByLabel(/Speaker 7 ·/).isChecked(), false);
      assert.equal(await selectAll.isChecked(), false);
      await selectAll.check();
      await page.getByRole("button", { name: "Preview 7 selected" }).click();
      const drawer = page.getByRole("dialog", { name: "Review speaker updates" });

      await drawer.waitFor();
      assert.deepEqual(JSON.parse(requests.find(request => request.path.endsWith("/preview")).body), { ids: selectedIds, version: 1 });
      assert.equal(await drawer.getByLabel("Test recipient").count(), 0);
      if (mobile) {
        const recipientPicker = drawer.getByRole("button", { name: /Preview recipient/ });

        await recipientPicker.click();
        await page.keyboard.press("Escape");
        assert.equal(await drawer.isVisible(), true);
        assert.equal(await recipientPicker.getAttribute("aria-expanded"), "false");
        await recipientPicker.click();
        const lastRecipient = page.getByRole("option", { name: "Speaker 8" });

        await lastRecipient.scrollIntoViewIfNeeded();
        assert.equal(await lastRecipient.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

          return top === element || element.contains(top);
        }), true, "Recipient menu must appear above the modal");
        await lastRecipient.click();
        await drawer.getByText("7 of 7 speakers").waitFor();
        const previewSource = await drawer.locator('iframe').getAttribute('src');

        await recipientPicker.click();
        await page.getByRole("option", { name: "Speaker 8" }).waitFor();
        await page.setViewportSize({ width: 900, height: 844 });
        await page.getByRole("option", { name: "Speaker 8" }).waitFor({ state: "detached" });
        const selectedRecipient = drawer.getByRole("button", { name: "Speaker 8", exact: true });

        assert.equal(await selectedRecipient.getAttribute("aria-pressed"), "true");
        assert.equal(await selectedRecipient.evaluate(element => document.activeElement === element), true);
        assert.equal(await drawer.locator('iframe').getAttribute('src'), previewSource);
        await page.setViewportSize({ width: 390, height: 844 });
        await drawer.getByText("7 of 7 speakers").waitFor();
        assert.equal(await drawer.locator('iframe').getAttribute('src'), previewSource);
        await recipientPicker.focus();
        await page.keyboard.press("ArrowDown");
        await page.getByRole("option", { name: "Speaker 8" }).waitFor();
        await page.keyboard.press("Escape");
        assert.equal(await drawer.isVisible(), true);
        assert.equal(await recipientPicker.evaluate(element => document.activeElement === element), true);
        const bounds = await drawer.boundingBox();

        assert.ok(bounds && bounds.width <= 390 && bounds.height <= 844);
        await drawer.screenshot({ path: `${artifacts}/speaker-updates-recipient-phone.png`, animations: "disabled" });
        for (const viewport of [{ width: 320, height: 844 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport);
          const dialogBounds = await drawer.boundingBox();
          const closeBounds = await drawer.getByRole("button", { name: "Close" }).boundingBox();
          const footerBounds = await drawer.getByRole("button", { name: "Send update to 7 speakers" }).boundingBox();

          assert.ok(dialogBounds && dialogBounds.width <= viewport.width && dialogBounds.height <= viewport.height);
          assert.ok(closeBounds && closeBounds.y >= 0 && closeBounds.y + closeBounds.height <= viewport.height);
          assert.ok(footerBounds && footerBounds.y >= 0 && footerBounds.y + footerBounds.height <= viewport.height);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
      assert.equal(await drawer.getByRole("button", { name: "Send update to 7 speakers" }).isDisabled(), true);
      assert.equal(requests.some(request => request.path.endsWith("/send")), false);
      await drawer.getByRole("button", { name: "Close" }).click();
      sendingEnabled = true;
      await page.reload();
      await page.getByRole("button", { name: /DevCon26 speaker update/ }).click();
      await page.getByLabel("Select all eligible").check();
      await page.getByRole("button", { name: "Preview 7 selected" }).click();
      await drawer.waitFor();
      await drawer.getByRole("button", { name: "Send update to 7 speakers" }).click();
      await drawer.waitFor({ state: "hidden" });
      assert.deepEqual(JSON.parse(requests.find(request => request.path.endsWith("/send")).body), { preview_id: "20000000-0000-4000-8000-000000000001", confirmed: true });
      assert.deepEqual(JSON.parse(requests.filter(request => request.path.endsWith("/preview")).at(-1).body).ids, selectedIds);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }, { role: "owner" });
  }

  for (const width of [1280, 320]) {
    await journey(`conference-access-drawer-${width}`, async ({ page, responses, requests }) => {
      const member = { id: "fixture-member", email: "member@example.test", display_name: "Fixture Member", role: "organizer", status: "active", last_login_at: null };
      const effective = ["registration.summary.view", "registration.guests.view", "registration.emails.view"];
      const inherited = ["registration.summary.view", "registration.guests.view", "registration.guests.manage"];
      const accessPath = "/api/annual-conference/2026/access-grants";
      const mutationPath = `${accessPath}/${member.id}`;
      let gate = createSaveGate();

      responses.set("/api/admin/organizers", { body: { organizers: [member] } });
      responses.set("/api/admin/access-requests", { body: { requests: [] } });
      responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
      responses.set("/api/annual-conference/2026/volunteer-applications", { body: { applications: [] } });
      responses.set(accessPath, () => ({ body: { edition_id: edition.id, members: [{ ...member, capabilities: [...effective], inherited_capabilities: inherited }] } }));
      responses.set(mutationPath, async (request) => {
        const { changes } = request.postDataJSON();

        gate.markEntered();
        await gate.response;
        for (const { capability, enabled } of changes) {
          const index = effective.indexOf(capability);

          if (enabled && index === -1) effective.push(capability);
          if (!enabled && index !== -1) effective.splice(index, 1);
        }

        return { body: { changes } };
      });
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${origin}/organizer-console/organizers`);
      const trigger = page.getByRole("button", { name: "Delegate Annual Conference responsibilities to Fixture Member" }).filter({ visible: true });

      await trigger.click();
      const drawer = page.getByRole("dialog", { name: "Delegate to Fixture Member" });
      const close = drawer.getByRole("button", { name: "Close access drawer" });
      const summary = drawer.locator("summary").filter({ hasText: "Registration" });

      await drawer.waitFor();
      await summary.getByText("3 of 6 enabled · 2 limited").waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.waitForFunction(() => {
        const bounds = document.querySelector('[aria-label="Close access drawer"]')?.getBoundingClientRect();

        return bounds && bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
      });
      const closeBounds = await close.boundingBox();

      assert.ok(closeBounds && closeBounds.x >= 0 && closeBounds.x + closeBounds.width <= width && closeBounds.y >= 0 && closeBounds.y + closeBounds.height <= 844);
      assert.equal(await drawer.getByRole("switch").count(), 0);
      await summary.focus();
      await page.keyboard.press("Enter");
      assert.equal(await summary.evaluate((element) => document.activeElement === element && element.parentElement.open), true);
      const switches = drawer.getByRole("switch");
      const guests = drawer.getByRole("switch", { name: "Registration: Guests access" });
      const emails = drawer.getByRole("switch", { name: "Registration: Emails access" });
      const form = drawer.getByRole("switch", { name: "Registration: Form & capacity access" });

      assert.equal(await switches.count(), 6);
      const aligned = await summary.evaluate((element) => {
        const chevron = element.querySelector(".responsibility-chevron")?.getBoundingClientRect();
        const control = element.parentElement.querySelector('.responsibility-state-box')?.getBoundingClientRect();

        return chevron && control && Math.abs((chevron.x + chevron.width / 2) - (control.x + control.width / 2)) < 1;
      });

      assert.equal(aligned, true);
      assert.equal(await guests.getAttribute("aria-checked"), "true");
      assert.equal(await emails.getAttribute("aria-checked"), "true");
      assert.equal(await form.getAttribute("aria-checked"), "false");
      await guests.getByText("Limited access · Includes role defaults").waitFor();
      await emails.getByText("Limited access · Edition access").waitFor();
      assert.equal(requests.filter((request) => request.method === "PATCH").length, 0);
      assert.equal(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth), true);
      await page.screenshot({ path: `${artifacts}/conference-access-drawer-${width}.png`, animations: "disabled" });
      await emails.getByText("Emails", { exact: true }).click();
      await waitForSaveGate(gate, "conference access");
      await drawer.getByText("Saving access…").waitFor();
      assert.equal(await emails.isDisabled(), true);
      const patches = requests.filter((request) => request.path === mutationPath && request.method === "PATCH");

      assert.equal(patches.length, 1);
      assert.deepEqual(JSON.parse(patches[0].body), { changes: [
        { capability: "registration.emails.view", enabled: false },
        { capability: "registration.emails.manage", enabled: false },
        { capability: "registration.emails.retry", enabled: false },
      ] });
      gate.release();
      await page.waitForFunction(() => !document.querySelector('[role="dialog"] [role="status"]'));
      await emails.getByText("Off", { exact: true }).waitFor();
      gate = createSaveGate();
      await emails.focus();
      await page.keyboard.press("Space");
      await waitForSaveGate(gate, "conference access");
      const onPatch = requests.filter((request) => request.path === mutationPath && request.method === "PATCH").at(-1);

      assert.deepEqual(JSON.parse(onPatch.body), { changes: [
        { capability: "registration.emails.view", enabled: true },
        { capability: "registration.emails.manage", enabled: true },
        { capability: "registration.emails.retry", enabled: true },
      ] });
      gate.release();
      await emails.getByText("On · Edition access").waitFor();
      gate = createSaveGate();
      await emails.focus();
      await page.keyboard.press("Enter");
      await waitForSaveGate(gate, "conference access");
      const enterPatch = requests.filter((request) => request.path === mutationPath && request.method === "PATCH").at(-1);

      assert.deepEqual(JSON.parse(enterPatch.body), { changes: [
        { capability: "registration.emails.view", enabled: false },
        { capability: "registration.emails.manage", enabled: false },
        { capability: "registration.emails.retry", enabled: false },
      ] });
      gate.release();
      await emails.getByText("Off", { exact: true }).waitFor();
      await close.click();
      assert.equal(await trigger.evaluate((element) => document.activeElement === element), true);
    }, { role: "owner" });
  }

  await journey("organizer-role-menu-resize", async ({ page, responses, requests }) => {
    const member = { id: "fixture-member", email: "member@example.test", display_name: "Fixture Member", role: "organizer", status: "active", last_login_at: null };

    responses.set("/api/admin/organizers", { body: { organizers: [member] } });
    responses.set("/api/admin/access-requests", { body: { requests: [] } });
    responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
    responses.set("/api/annual-conference/2026/volunteer-applications", { body: { applications: [] } });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/organizer-console/organizers`);
    const mobileRole = page.getByRole("button", { name: "Role for Fixture Member" });

    await mobileRole.click();
    await page.getByRole("option", { name: "Volunteer" }).waitFor();
    await page.setViewportSize({ width: 900, height: 844 });
    await page.getByRole("option", { name: "Volunteer" }).waitFor({ state: "detached" });
    const desktopRole = page.getByRole("button", { name: "Role for Fixture Member" });

    assert.equal(await desktopRole.getAttribute("aria-expanded"), "false");
    assert.equal(await desktopRole.innerText(), "Organizer");
    await desktopRole.click();
    await page.getByRole("option", { name: "Volunteer" }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("option", { name: "Volunteer" }).waitFor({ state: "detached" });
    assert.equal(await mobileRole.getAttribute("aria-expanded"), "false");
    assert.equal(await mobileRole.innerText(), "Organizer");
    assert.equal(requests.some(request => request.method !== "GET"), false);
  }, { role: "owner" });

  for (const mobile of [false, true]) {
    await journey(`speaker-outcome-preview-${mobile ? "mobile" : "desktop"}`, async ({ page, responses, requests }) => {
      const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"];
      const previewId = "00000000-0000-4000-8000-000000000003";
      const people = ["Ada Example", "Ama Example"];
      const submissions = people.map((name, index) => ({
        id: ids[index], speaker_name: name, speaker_email: `speaker${index}@example.test`,
        title: `Talk ${index + 1}`, session_type: "Talk", topic: "Engineering", abstract: "Fixture abstract",
        bio: "Fixture bio", learning_outcomes: [], status: "not_selected", created_at: "2026-10-18T10:00:00Z",
        outcome_eligible: true, decision_email_status: "pending", decision_email_attempt_count: 0, decision_email_queued_at: null,
      }));
      const recipients = people.map((name, index) => ({
        id: ids[index], name, recipient: `speaker${index}@example.test`, from: "sender@example.test",
        replyTo: "reply@example.test", subject: `Subject ${index + 1}`,
        html: `<p>Frozen for ${name}</p>`, text: `Frozen for ${name}`,
      }));
      const base = "/api/annual-conference/2026/speaker-outcomes";

      responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
      responses.set("/api/annual-conference/2026/speakers", { body: {
        edition: { ...edition, name: "DevCongress Annual Conference" },
        call: { open: true, public_path: "/speak/c/2026", logistics_deadline: null },
        permissions: { can_manage: true, can_send_email: true },
        email_delivery: { configured: true, workspace_links_configured: true },
        counts: { submitted: 0, selected: 0, not_selected: 2, withdrawn: 0 }, submissions,
      } });
      responses.set(`${base}/messages`, { body: { messages: [
        { kind: "acceptance", subject: "Accept", message: "Accept", version: 1 },
        { kind: "rejection", subject: "Update", message: "Update", version: 1 },
      ] } });
      responses.set(`${base}/preview`, { body: { preview_id: previewId, recipients } });
      const testGate = createSaveGate();

      responses.set(`${base}/test`, async () => {
        testGate.markEntered();
        await testGate.response;

        return { body: { accepted: true, recipient: "tester@example.test" } };
      });
      responses.set(`${base}/send`, { body: { queued: 2 } });
      await page.setViewportSize({ width: mobile ? 390 : 1440, height: 844 });
      await page.goto(`${origin}/organizer-console/annual-conference/2026/speakers?section=outcome-messages`);
      await page.getByLabel(/Ada Example · Talk 1/).check();
      await page.getByLabel(/Ama Example · Talk 2/).check();
      await page.getByRole("button", { name: "Preview 2 selected" }).click();
      const drawer = page.getByRole("dialog", { name: "Review personalized emails" });

      await drawer.waitFor();
      assert.equal(await drawer.getByRole("button", { name: "Close" }).evaluate((button) => document.activeElement === button), true);
      await page.keyboard.press("Escape");
      await drawer.waitFor({ state: "hidden" });
      assert.equal(await page.getByRole("button", { name: "Preview 2 selected" }).evaluate((button) => document.activeElement === button), true);
      await page.getByRole("button", { name: "Preview 2 selected" }).click();
      await drawer.waitFor();
      assert.deepEqual(JSON.parse(requests.find((request) => request.path === `${base}/preview`).body), { ids });
      if (mobile) {
        await drawer.getByRole("button", { name: /Preview recipient/ }).click();
        await page.getByRole("option", { name: "Ama Example" }).click();
        await drawer.getByText("2 of 2 speakers").waitFor();
        await drawer.getByRole("button", { name: /Preview recipient/ }).click();
        await page.getByRole("option", { name: "Ama Example" }).waitFor();
        await page.setViewportSize({ width: 900, height: 844 });
        await page.getByRole("option", { name: "Ama Example" }).waitFor({ state: "detached" });
        const selectedRecipient = drawer.getByRole("button", { name: "Ama Example", exact: true });

        assert.equal(await selectedRecipient.getAttribute("aria-pressed"), "true");
        assert.equal(await selectedRecipient.evaluate(element => document.activeElement === element), true);
        assert.equal(await drawer.locator("iframe").getAttribute("srcdoc"), recipients[1].html);
        await page.setViewportSize({ width: 390, height: 844 });
        await drawer.getByText("2 of 2 speakers").waitFor();
      } else {
        await drawer.getByRole("button", { name: "Ama Example" }).click();
      }
      assert.equal(await drawer.locator("iframe").getAttribute("srcdoc"), recipients[1].html);
      await drawer.getByLabel("Test recipient").fill("tester@example.test");
      await drawer.getByRole("button", { name: "Send test email" }).click();
      await waitForSaveGate(testGate, "speaker test email");
      if (mobile) {
        await drawer.getByRole("button", { name: /Preview recipient/ }).click();
        await page.getByRole("option", { name: "Ada Example" }).click();
      } else {
        await drawer.getByRole("button", { name: "Ada Example" }).click();
      }
      assert.equal(await drawer.getByLabel("Test recipient").inputValue(), "");
      const testResponse = page.waitForResponse((response) => response.url().endsWith(`${base}/test`));

      testGate.release();
      await testResponse;
      await drawer.getByRole("button", { name: "Send selected emails" }).waitFor({ state: "visible" });
      await page.waitForFunction(() => !document.querySelector('.speaker-drawer-footer button')?.disabled);
      assert.equal(await drawer.getByRole("status").count(), 0);
      assert.equal(await drawer.getByRole("alert").count(), 0);
      const testRequest = requests.find((request) => request.path === `${base}/test`);
      const testBody = JSON.parse(testRequest.body);

      assert.equal(testBody.preview_id, previewId);
      assert.equal(testBody.recipient_id, ids[1]);
      assert.equal(testBody.email, "tester@example.test");
      assert.match(testBody.request_id, /^[0-9a-f-]{36}$/);
      assert.equal(requests.some((request) => request.path === `${base}/send`), false);
      responses.set(`${base}/test`, { body: { accepted: true, recipient: "tester@example.test" } });
      await drawer.getByLabel("Test recipient").fill("tester@example.test");
      await drawer.getByRole("button", { name: "Send test email" }).click();
      await drawer.waitFor({ state: "hidden" });
      await page.getByText("Test email sent to tester@example.test.").waitFor();
      await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Preview 2 selected");
      assert.equal(requests.some((request) => request.path === `${base}/send`), false);
      await page.getByRole("button", { name: "Preview 2 selected" }).click();
      await drawer.waitFor();
      await drawer.getByRole("button", { name: "Send selected emails" }).click();
      await drawer.waitFor({ state: "hidden" });
      await page.waitForFunction(() => document.activeElement?.textContent === "Ready to send");
      assert.deepEqual(JSON.parse(requests.find((request) => request.path === `${base}/send`).body), { preview_id: previewId });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }, { role: "owner" });
  }

  for (const canSendEmail of [false, true]) {
    for (const mobile of [false, true]) {
      await journey(`speaker-tracking-${canSendEmail ? "sender" : "viewer"}-${mobile ? "mobile" : "desktop"}`, async ({ page, responses, requests }) => {
        const base = "/organizer-console/annual-conference/2026/speakers";

        responses.set("/api/annual-conference/2026/work-plan", {
          body: { ...workspace, permissions: { ...workspace.permissions, capabilities: canSendEmail ? ownerCapabilities : ["speakers.proposals.view", "speakers.participation.view"] } },
        });
        const accepted = {
          id: "tracking-accepted", proposal_schema_version: 2, speaker_name: "Ada Example", speaker_email: "ada@example.test",
          title: "Reliable systems", session_type: "Talk", topic: "Engineering", abstract: "Fixture abstract",
          bio: "Fixture bio", learning_outcomes: [], status: "selected", created_at: "2026-10-18T10:00:00Z",
          workspace_access: "active",
          selected_session_id: "session-ada",
          logistics: { availability_confirmed: true, slides_url: "https://example.test/slides", headshot_photo_available: true, headshot_url: null, social_handle: "@ada" },
          decision_email_status: "failed", decision_email_attempt_count: 2,
          decision_email_last_error: "Fixture delivery failure",
          decision_email_last_attempt_at: "2026-11-03T03:15:00Z",
          decision_email_next_retry_at: "2026-11-03T03:45:00Z",
        };

        const extraSpeakers = Array.from({ length: 6 }, (_, index) => ({
          ...accepted, id: `tracking-extra-${index}`, speaker_name: `Guest ${index + 1}`, title: `Session ${index + 1}`,
          logistics: index === 0
            ? { availability_confirmed: false, headshot_photo_available: false, headshot_url: "https://example.test/headshot.png", social_handle: "@guest" }
            : { availability_confirmed: null, headshot_photo_available: false, headshot_url: null, social_handle: null },
          selected_session_id: index === 1 ? "session-badge" : "session-ada",
          decision_email_status: ["pending", "delivered"][index] ?? accepted.decision_email_status,
          decision_email_attempt_count: index === 0 ? 0 : accepted.decision_email_attempt_count,
        }));

        async function checkSecondPage(lastRow) {
          const pager = page.getByRole("navigation", { name: /pagination/i });

          await pager.getByRole("button", { name: "Next page" }).click();
          await pager.getByText("Page 2 of 2").waitFor();
          await lastRow.waitFor();
          assert.equal(await pager.getByRole("button", { name: "Next page" }).isDisabled(), true);
          await pager.getByRole("button", { name: "Previous page" }).click();
          await lastRow.waitFor({ state: "hidden" });
        }

        const storagePath = "/api/annual-conference/2026/speakers/storage";
        const storageResponse = { body: { speaker_photo_count: 1, speaker_photo_bytes: 566231, shared_bucket_bytes: 14229176 } };

        responses.set(storagePath, { status: 503, body: { error: "Unavailable" } });
        const fileName = `ConferenceSlides${"LongName".repeat(10)}.pdf`;

        responses.set("/api/annual-conference/2026/speaker-submissions/tracking-accepted/materials", { body: { materials: [{ id: "fixture-slides", file_name: fileName }] } });
        responses.set("/api/annual-conference/2026/speaker-submissions/tracking-extra-0/materials", { body: { materials: [] } });
        responses.set("/api/annual-conference/2026/speaker-submissions/tracking-extra-1/materials", { body: { materials: [] } });
        responses.set("/api/annual-conference/2026/speaker-badges/session-badge", { body: { card: { display_name: "Guest 2", role: "speaker", crop: { x: 0.5, y: 0.5, scale: 1 }, photo_available: true, photo_version: "badge-v1" } } });
        await page.route('**/api/annual-conference/2026/speaker-badges/session-badge/photo', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aS8AAAAASUVORK5CYII=', 'base64') }));
        const badgePath = "/api/annual-conference/2026/speaker-badges/session-ada";
        const badgeResponse = { body: { card: { display_name: "Ada Example", role: "speaker", crop: { x: 0.5, y: 0.5, scale: 1 }, photo_available: false, photo_version: null } } };

        responses.set(badgePath, badgeResponse);
        responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
        responses.set("/api/annual-conference/2026/speakers", { body: {
          edition: { ...edition, name: "DevCongress Annual Conference" },
          call: { open: true, public_path: "/speak/c/2026", logistics_deadline: null },
          permissions: { can_manage: canSendEmail, can_send_email: canSendEmail },
          email_delivery: { configured: true, workspace_links_configured: true },
          counts: { submitted: 0, selected: 7, not_selected: 0, withdrawn: 0 }, submissions: [accepted, ...extraSpeakers],
        } });
        responses.set("/api/annual-conference/2026/speaker-outcomes/messages", { body: { messages: [] } });
        await page.setViewportSize({ width: mobile ? 390 : 1440, height: 844 });
        await page.goto(`${origin}${base}`);
        const nav = page.getByRole("navigation", { name: "Speaker sections" });

        await nav.waitFor();
        await nav.locator('button, a').first().waitFor();
        if (mobile) {
          const controls = page.getByRole("button", { name: /Call controls and deadline/ });

          assert.equal(await controls.getAttribute("aria-expanded"), "false");
          assert.equal(await page.locator("#speaker-call-controls").isVisible(), false);
          await controls.click();
          assert.equal(await page.locator("#speaker-call-controls").isVisible(), true);
          await controls.click();
        }
        await assertWorkspaceSection(nav, "Proposals");
        if (!mobile) {
          assert.equal(await nav.getByRole("link", { name: "Delivery", exact: true }).count(), canSendEmail ? 1 : 0);
          assert.equal(await nav.getByRole("link", { name: "Outcome messages", exact: true }).count(), canSendEmail ? 1 : 0);
        }
        await page.getByRole("button", { name: "Approved", exact: true }).click();
        await checkSecondPage(page.locator(".speaker-queue").getByText("Session 6", { exact: true }).filter({ visible: true }));
        if (!mobile) {
          const queue = page.locator(".speaker-proposal-table");
          const labels = ["Ready to preview", "Delivered", "Needs attention"];
          const icons = [];

          for (const label of labels) {
            const status = queue.getByRole("cell", { name: label, exact: true }).first();
            const icon = status.locator("svg");

            await status.waitFor();
            assert.equal(await icon.getAttribute("aria-hidden"), "true");
            icons.push(await icon.locator("path").getAttribute("d"));
            const [iconBox, labelBox] = await Promise.all([icon.boundingBox(), status.getByText(label, { exact: false }).last().boundingBox()]);

            assert.ok(iconBox && labelBox && iconBox.x + iconBox.width < labelBox.x, `Expected icon before ${label}`);
          }
          assert.equal(new Set(icons).size, labels.length);
          await queue.screenshot({ path: `${artifacts}/speaker-proposal-statuses.png`, animations: "disabled" });
        }
        const acceptedProposal = page.locator(".speaker-queue").getByText("Reliable systems", { exact: true }).filter({ visible: true });

        const proposal = page.getByRole("dialog", { name: "Talk Ada Example", exact: true });

        await acceptedProposal.click();

        await proposal.getByText("Fixture abstract", { exact: true }).waitFor();
        assert.equal(await proposal.getByText("Delivery address", { exact: true }).count(), 0);
        assert.equal(await proposal.getByText("Fixture abstract", { exact: true }).isVisible(), true);
        assert.equal(await proposal.locator("nav, details, [aria-haspopup='listbox']").count(), 0);
        assert.equal(await proposal.getByRole("textbox", { name: "Correct decision email address" }).count(), 0);
        const closeProposal = proposal.getByRole("button", { name: "Close speaker proposal" });

        if (mobile) {
          await closeProposal.focus();
          await page.keyboard.press("Shift+Tab");
          assert.equal(await proposal.evaluate((element) => element.contains(document.activeElement)), true);
          assert.equal(await closeProposal.evaluate((element) => element === document.activeElement), false);
          await page.keyboard.press("Tab");
          assert.equal(await closeProposal.evaluate((element) => element === document.activeElement), true);
        }
        await page.keyboard.press("Escape");
        await proposal.waitFor({ state: "hidden" });
        await chooseWorkspaceSection(page, nav, "Participation");
        await page.waitForURL(/section=participation/);
        await assertWorkspaceSection(nav, "Participation");
        if (mobile) {
          await page.setViewportSize({ width: 700, height: 844 });
          assert.equal(await page.locator('.participation-header').isVisible(), false);
          assert.equal(await page.locator('.speaker-summary-row').first().evaluate(element => element.scrollWidth <= element.clientWidth), true);
          await page.setViewportSize({ width: 390, height: 844 });
        }
        const usage = page.locator(".badge-storage");

        await usage.getByRole("button", { name: "Try again" }).waitFor();
        responses.set(storagePath, storageResponse);
        await usage.getByRole("button", { name: "Try again" }).click();
        await usage.getByText("Speaker badge photos", { exact: true }).waitFor();
        assert.match(await usage.innerText(), /1 photo/);
        assert.equal(await usage.evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await usage.evaluate(el => el.scrollIntoView({ block: "end", behavior: "instant" }));
        await usage.screenshot({ path: artifacts + "/badge-storage-" + (mobile ? "phone" : "desktop") + ".png" });

        assert.equal(await page.getByRole("navigation", { name: "Breadcrumb" }).getByText("Participation", { exact: true }).count(), 1);
        await checkSecondPage(page.getByRole("button", { name: /Guest 6.*Awaiting response/ }));
        const ada = page.getByRole("button", { name: /Ada Example.*Confirmed/ });
        const linkRow = page.getByRole("button", { name: /Guest 1.*Not yet confirmed/ });
        const missingRow = page.getByRole("button", { name: /Guest 2.*Awaiting response/ });

        assert.match(await ada.innerText(), /Photo uploaded/);
        assert.match(await ada.innerText(), /Provided/);
        assert.match(await linkRow.innerText(), /Link provided/);
        assert.match(await missingRow.innerText(), /Missing/);
        if (!mobile) {
          const columns = await page.locator('.participation-header > span').evaluateAll(nodes => nodes.slice(0, 4).map(node => node.getBoundingClientRect().x));
          const values = await ada.locator(':scope > span, :scope > strong').evaluateAll(nodes => nodes.slice(0, 4).map(node => node.getBoundingClientRect().x));

          assert.ok(columns.every((x, index) => Math.abs(x - values[index]) < 2), 'Participation columns align with their headings');
        }
        const participationPanel = page.locator('.speaker-list-panel').filter({ has: page.getByRole('heading', { name: 'Accepted speakers' }) });

        await page.setViewportSize({ width: mobile ? 390 : 1440, height: 1800 });
        await participationPanel.scrollIntoViewIfNeeded();
        await participationPanel.screenshot({ path: `${artifacts}/speaker-monitoring-${mobile ? 'phone' : 'desktop'}-list.png`, animations: 'disabled' });
        await page.setViewportSize({ width: mobile ? 390 : 1440, height: 844 });
        await linkRow.click();
        const linked = page.getByRole("dialog", { name: "Participation Guest 1", exact: true });

        assert.equal(await linked.getByRole("link", { name: /Open submitted link/ }).getAttribute("href"), "https://example.test/headshot.png");
        await linked.getByRole("button", { name: "Close participation details" }).click();
        await missingRow.click();
        const missing = page.getByRole("dialog", { name: "Participation Guest 2", exact: true });

        await missing.getByRole("heading", { name: "Assets", exact: true }).waitFor();
        await missing.getByText("Missing", { exact: true }).first().waitFor();
        await missing.getByText("No files uploaded.", { exact: true }).waitFor();
        await missing.getByRole("button", { name: "Close participation details" }).click();
        await ada.click();
        const logistics = page.getByRole("dialog", { name: "Participation Ada Example", exact: true });

        await logistics.getByText("Reliable systems", { exact: true }).waitFor();
        await logistics.getByText("Slides/resources", { exact: true }).waitFor();
        await logistics.getByText("@ada", { exact: true }).waitFor();
        assert.equal(await logistics.locator("nav, details, [aria-haspopup='listbox']").count(), 0);
        for (const name of ["Logistics", "Assets", "Speaker workspace"]) {
          await logistics.getByRole("heading", { name, exact: true }).waitFor();
        }
        assert.equal(await logistics.getByRole("button", { name: "Copy workspace link" }).count(), canSendEmail ? 1 : 0);
        await logistics.getByText("Photo uploaded", { exact: true }).waitFor();
        const file = logistics.getByRole("link", { name: fileName, exact: true });

        await file.waitFor();
        assert.equal(await file.evaluate(element => {
          const drawerRight = element.closest("[role='dialog']").getBoundingClientRect().right;

          return [...element.getClientRects()].every(rect => rect.right <= drawerRight + 1);
        }), true, "Long filenames wrap inside the drawer");
        const logisticsHeading = await logistics.getByRole("heading", { name: "Logistics", exact: true }).boundingBox();
        const assetsHeading = await logistics.getByRole("heading", { name: "Assets", exact: true }).boundingBox();

        assert.ok(logisticsHeading && assetsHeading);
        assert.ok(mobile ? assetsHeading.y > logisticsHeading.y : assetsHeading.x > logisticsHeading.x);
        assert.equal(await logistics.evaluate(element => element.scrollWidth <= element.clientWidth), true, "The drawer fits its width");
        const badgeButton = logistics.getByRole("button", { name: "Download badge PNG" });

        await badgeButton.waitFor();
        await logistics.screenshot({ path: `${artifacts}/speaker-drawer-${canSendEmail ? "sender" : "viewer"}-${mobile ? "phone" : "desktop"}.png`, animations: "disabled" });
        const badgeDownload = page.waitForEvent("download");

        await badgeButton.click();
        const exportedBadge = await badgeDownload;
        const png = await readFile(await exportedBadge.path());

        assert.equal(exportedBadge.suggestedFilename(), "devcon26-speaker-badge.png");
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1350]);
        await page.route('**/api/annual-conference/2026/speaker-headshots/session-ada/photo', route => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('fixture photo') }));
        const download = page.waitForEvent('download');

        await logistics.getByRole("button", { name: "Download original photo" }).click();
        assert.match((await download).suggestedFilename(), /^speaker-headshot\./);
        assert.equal(await logistics.getByText("Delivery address", { exact: true }).count(), 0);
        assert.equal(await logistics.getByText("Abstract", { exact: true }).count(), 0);
        await logistics.getByRole("button", { name: "Close participation details" }).click();
        await page.getByRole("dialog").waitFor({ state: "hidden" });
        assert.equal(await page.locator(".speaker-queue").isVisible(), false);
        await page.reload();
        await page.getByRole("heading", { name: "Accepted speakers", exact: true }).waitFor();
        if (canSendEmail) {
          await chooseWorkspaceSection(page, nav, "Delivery");
          await page.waitForURL(/section=delivery/);
          await checkSecondPage(page.getByRole("button", { name: "Review delivery for Guest 6", exact: true }));
          const deliveryRow = mobile
            ? page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Review delivery for Ada Example" }) })
            : page.getByRole("row").filter({ has: page.getByRole("button", { name: "Review delivery for Ada Example" }) });

          await deliveryRow.getByText("Fixture delivery failure", { exact: true }).waitFor();
          await deliveryRow.getByText(/3:15/).waitFor();
          await deliveryRow.getByText(/3:45/).waitFor();
          if (mobile) {
            await deliveryRow.screenshot({ path: `${artifacts}/speaker-delivery-phone.png` });
            assert.equal(await deliveryRow.evaluate(element => element.scrollWidth <= element.clientWidth), true);
            await deliveryRow.getByRole("button").click();
          } else {
            await deliveryRow.getByRole("button").click();
          }
          const delivery = page.getByRole("dialog", { name: "Delivery Ada Example", exact: true });

          await delivery.getByText("Fixture delivery failure", { exact: true }).waitFor();
          await delivery.getByText("Delivery address", { exact: true }).waitFor();
          assert.equal(await delivery.getByRole("navigation", { name: "Speaker details sections" }).count(), 0);
          await delivery.getByRole("button", { name: "Retry workspace email" }).click();
          await delivery.getByRole("heading", { name: "Send workspace email?" }).waitFor();
          await delivery.getByRole("button", { name: "Cancel", exact: true }).click();
          assert.equal(await delivery.getByText("Slides/resources", { exact: true }).count(), 0);
          assert.equal(await delivery.getByText("Abstract", { exact: true }).count(), 0);
          await delivery.getByRole("button", { name: "Close delivery details" }).click();
          await page.getByRole("dialog").waitFor({ state: "hidden" });
          await chooseWorkspaceSection(page, nav, "Outcome messages");
          await page.waitForURL(/section=outcome-messages/);
          await page.getByRole("heading", { name: "Speaker outcome messages", exact: true }).waitFor();
        } else {
          for (const section of ["delivery", "outcome-messages"]) {
            await page.goto(`${origin}${base}?section=${section}`);
            await page.locator(".speaker-queue:visible").waitFor();
            assert.equal(await page.getByRole("heading", { name: "Decision email delivery", exact: true }).count(), 0);
            assert.equal(await page.getByRole("heading", { name: "Speaker outcome messages", exact: true }).count(), 0);
          }
          assert.equal(requests.some((request) => request.path.includes("speaker-outcomes")), false);
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: `${artifacts}/speaker-tracking-${canSendEmail ? "sender" : "viewer"}-${mobile ? "mobile" : "desktop"}.png`, fullPage: true });
      }, { role: canSendEmail ? "owner" : "organizer" });
    }
  }

  for (const mobile of [false, true]) {
    await journey(`speaker-headshot-workspace-${mobile ? "phone" : "desktop"}`, async ({ page, responses, requests }) => {
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
      const base = "/api/conferences/2026/speaker-intake/fixture-token";
      const photo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAABzklEQVR4nO3bO07EQBCE4T0GJARIJAgS7oHIiYk5GgciJ+AWIFlaIaP1+tFVNeP9pQrt6a5PThzM4fPrm0zkEN+g8QAEEEAAAdRwAAIIIIAuEujp7nZpLgJohUtWygRU4hKRkgOJaGxMWiCDjtpIBWSjUTNJgCI6IqN6oKCOwgggL1Bcp9yoEijuojACCCCAAAIIIIAAAmhPRoWN+BfzAn28P8eBfndoGihrNCzQOlDK6Di9AyAz02huN0Aeo/9DewKSMp0a1x9QrdTZKR0DDbm5vhoyU+T4/Mzz9wMkeh6gvQOpAxBAAAEEEEAA1QO1YFRbByCAWgPKGpV3AagHoNeH+1PZJ1DqI1IUASgE5DcStQAoB+Q00lWQ3/bpWscBpDZSL2+6UNepDkDNAJUz2XZ2X+rtSycAtN3IvK0P6PHl7W9W0IxO2A/QqNhSqenXOwaaLlaenoDMNFKmYqAgjYipEijuojCqAYpz6JgKgOIKUqOtQPH+aqNNQPHmBqP1QPHOHqOVQPG2NqM1QPGeTqPFQPGGZqNlQPFufiOA6oDirSJGc4HifVJGAFUAxZsEjQDaDBTvkDUCaBtQfPu4EUAAARQDiu/dghFAZ4B+AA9oBiqkuabWAAAAAElFTkSuQmCC", "base64");
      let headshot = { source: "none", url: null, revision: 0, photo_available: false };
      const badgePhoto = { available: true, version: "badge-v1" };
      const dto = () => ({ headshot: { ...headshot }, badge_photo: badgePhoto });
      let failNext = false;
      let staleNext = false;
      const mutate = (request, source, url = null) => {
        assert.equal(request.headers()["x-headshot-revision"], String(headshot.revision));
        if (staleNext) {
          staleNext = false;
          headshot = { source: "photo", url: null, revision: headshot.revision + 1, photo_available: true };

          return { status: 409, body: { error: "Headshot changed" } };
        }
        if (failNext) {
          failNext = false;

          return { status: 503, body: { error: "Headshot temporarily unavailable" } };
        }
        headshot = { source, url, revision: headshot.revision + 1, photo_available: source === "photo" };

        return { body: dto() };
      };

      responses.set(base, (request) => request.method() === "GET" ? { body: {
        event: { ...event, name: "DevCon2026", event_date: "2026-12-19T09:00:00Z" },
        link: { purpose: "conference_speaker_workspace", deadline: "2026-11-12" },
        prefill: { speaker_name: "Ada Example", title: "Building Together", topic: "Open Source", session_type: "Talk", slides_url: "https://example.test/slides" },
      } } : { body: { ok: true } });
      responses.set(`${base}/headshot`, (request) => {
        if (request.method() === "GET") return { body: dto() };
        if (request.method() === "DELETE") return mutate(request, "none");
        const payload = JSON.parse(request.postData());

        if (payload.source === "badge") {
          assert.equal(payload.badge_version, badgePhoto.version);

          return mutate(request, "photo");
        }
        assert.equal(payload.source, "link");

        return mutate(request, "link", payload.url);
      });
      responses.set(`${base}/headshot/photo`, (request) => mutate(request, "photo"));
      responses.set(`${base}/badge`, { body: { card: { display_name: "Ada Example", role: "speaker", crop: { x: 0.5, y: 0.5, scale: 1 }, photo_available: true, photo_version: badgePhoto.version } } });
      responses.set("/api/conference-speaker-materials/2026/fixture-token", { body: { materials: [{ id: "material-1", file_name: "slides.pdf", size_bytes: 120 }] } });
      await page.route(`**${base}/headshot/photo**`, async (route) => {
        if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "image/png", body: photo });

        return route.fallback();
      });
      await page.route(`**${base}/badge/photo**`, (route) => route.fulfill({ status: 200, contentType: "image/png", body: photo }));
      await page.goto(`${origin}/conference-speakers/2026/fixture-token`);
      await page.getByRole("heading", { name: "Headshot", exact: true }).waitFor();
      await page.getByText("No headshot added").waitFor();
      const badgeToggle = page.getByRole("button", { name: "Customize badge" });

      assert.equal(await badgeToggle.getAttribute("aria-expanded"), "false");
      const headshotHeading = page.getByRole("heading", { name: "Help us introduce you" });
      const logisticsHeading = page.getByRole("heading", { name: "Session logistics" });

      assert.equal(await headshotHeading.evaluate((node, other) => Boolean(node.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await logisticsHeading.elementHandle()), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: `${artifacts}/speaker-headshot-workspace-${mobile ? "phone" : "desktop"}-initial.png`, fullPage: true, animations: "disabled" });
      await page.getByText("Session materials", { exact: false }).click();
      assert.equal(await page.getByLabel("Slides or supporting-resource link").inputValue(), "https://example.test/slides");
      await page.getByRole("list", { name: "Uploaded files" }).getByText("slides.pdf").waitFor();
      await page.getByText("Session materials", { exact: false }).click();
      const link = page.getByLabel("Or use an HTTPS headshot link");

      await link.fill("https://example.test/ada.png");
      await page.getByRole("button", { name: "Save headshot link" }).click();
      await page.getByText("Headshot saved.").waitFor();
      await page.reload();
      await page.getByRole("link", { name: /Open saved headshot link/ }).waitFor();
      assert.equal(await link.inputValue(), "https://example.test/ada.png");
      const input = page.locator('input[type="file"][accept="image/jpeg,image/png,image/webp,image/avif"]').first();

      await input.setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: photo });
      await page.getByRole("img", { name: "Your saved headshot" }).waitFor();
      await page.screenshot({ path: `${artifacts}/speaker-headshot-workspace-${mobile ? "phone" : "desktop"}-photo.png`, fullPage: true, animations: "disabled" });
      if (!mobile) {
        await page.setViewportSize({ width: 1440, height: 1800 });
        await page.screenshot({ path: `${artifacts}/speaker-headshot-workspace-desktop-overview.png`, fullPage: true, animations: "disabled" });
        await page.setViewportSize({ width: 1440, height: 1000 });
      }
      await page.getByRole("button", { name: "Use saved badge photo" }).click();
      await page.getByText("Headshot saved.").waitFor();
      await page.getByRole("button", { name: "Remove headshot" }).click();
      await page.getByText("No headshot added").waitFor();
      await link.fill("https://example.test/draft.png");
      failNext = true;
      await page.getByRole("button", { name: "Save headshot link" }).click();
      await page.getByRole("status").filter({ hasText: "Headshot temporarily unavailable" }).waitFor();
      assert.equal(await link.inputValue(), "https://example.test/draft.png");
      staleNext = true;
      await page.getByRole("button", { name: "Save headshot link" }).click();
      await page.getByRole("status").filter({ hasText: "changed in another session" }).waitFor();
      assert.equal(await link.inputValue(), "https://example.test/draft.png");
      await page.getByRole("img", { name: "Your saved headshot" }).waitFor();
      await link.fill("unfinished headshot link");
      await page.getByLabel("Social handles").fill("@ada");
      await page.getByRole("button", { name: "SAVE DETAILS" }).click();
      await page.getByText(/Draft saved/).waitFor();
      assert.equal(await link.inputValue(), "unfinished headshot link");
      let warned = false;

      page.once("dialog", async (dialog) => { warned = true; await dialog.dismiss(); });
      await page.evaluate(async () => {
        const app = document.querySelector("#app").__vue_app__;

        await app.config.globalProperties.$router.push("/conference-speakers/2026/another-token");
      });
      assert.equal(warned, true, "Unsaved headshot draft warns before changing routes");
      assert.ok(page.url().endsWith("/conference-speakers/2026/fixture-token"));
      await page.getByRole("button", { name: "Customize badge" }).click();
      const displayName = page.getByLabel("Display name");

      await displayName.fill("Ada Draft");
      await page.getByRole("button", { name: "Close badge editor" }).click();
      await page.getByRole("button", { name: "Customize badge" }).click();
      assert.equal(await displayName.inputValue(), "Ada Draft");
      await page.getByRole("button", { name: "SAVE DETAILS" }).click();
      await page.getByText(/Draft saved/).waitFor();
      const generalSave = requests.find((request) => request.path === base && request.method === "POST");

      assert.ok(generalSave);
      assert.equal(Object.hasOwn(JSON.parse(generalSave.body), "headshot_url"), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    });
  }

  for (const capability of ["speakers.proposals.view", "speakers.proposals.manage"]) {
    await journey(`mobile-speakers-${capability}`, async ({ page, responses, requests }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
      responses.set("/api/annual-conference/2026/work-plan", {
        body: { ...workspace, permissions: { ...workspace.permissions, capabilities: ["speakers.proposals.view", capability, "finance.view", "ticketing.overview.view", "ticketing.overview.manage", "ticketing.orders.view", "ticketing.orders.manage", "ticketing.delivery.view", "ticketing.delivery.manage", "ticketing.sponsors.view", "ticketing.sponsors.manage"] } },
      });
      responses.set("/api/annual-conference/2026/speakers", {
        body: {
          edition: { ...edition, name: "DevCongress Annual Conference" },
          call: { open: true, public_path: "/speak/c/2026", logistics_deadline: null },
          permissions: { can_manage: capability === "speakers.proposals.manage" },
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
      const speakers = nav.getByRole("button", { name: "Speakers", exact: true });

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
      assert.equal(await drawer.getByRole("button", { name: "Approve", exact: true }).count(), capability === "speakers.proposals.manage" ? 1 : 0);
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

  await journey('volunteer-lead-permissions', async ({ page, responses, requests }) => {
    const workPlanPath = '/api/annual-conference/2026/work-plan';
    let capabilities = [];

    responses.set(workPlanPath, () => ({ body: { ...workspace, permissions: { ...workspace.permissions, capabilities } } }));
    responses.set('/api/annual-conference/2026/team', { body: { members: [] } });
    responses.set('/api/annual-conference/2026/volunteer-applications', { body: { applications: [] } });
    responses.set('/api/annual-conference/2026/volunteer-follow-up/reviews', { body: { recipients: [], outcome_messages: [] } });
    await page.goto(`${origin}/organizer-console/mobile/annual-conference/2026?section=volunteers&volunteerView=reviews`);
    await page.waitForURL(url => url.searchParams.get('section') === 'overview');
    const nav = page.getByRole('navigation', { name: 'Annual Conference workspace', exact: true });

    assert.equal(await nav.getByRole('button', { name: 'Volunteers', exact: true }).count(), 0);
    assert.equal(await nav.getByRole('button', { name: 'Conference badge', exact: true }).count(), 1);
    assert.equal(requests.some(request => request.path.endsWith('/volunteer-follow-up/reviews')), false);
    capabilities = ['volunteers.directory.view', 'volunteers.reviews.view'];
    await page.reload();
    await nav.getByRole('button', { name: 'Volunteers', exact: true }).click();
    await page.getByRole('tab', { name: 'Reviews', exact: true }).click();
    await page.getByRole('region', { name: 'Volunteer reviews' }).waitFor();
    assert.equal(await page.getByRole('tab', { name: 'Campaign', exact: true }).count(), 0);
    assert.equal(requests.some(request => request.path.includes('/volunteer-follow-up/campaign')), false);
  }, { role: 'volunteer' });

  await journey(
    "volunteer-permissions",
    async ({ page, requests }) => {
      await page.goto(
        `${origin}/organizer-console/mobile/annual-conference/2026`,
      );
      await page.getByText("No tasks assigned yet", { exact: true }).waitFor();
      const conferenceNavigation = page.getByRole("navigation", { name: "Annual Conference workspace" });

      assert.equal(await conferenceNavigation.getByText("Volunteers", { exact: true }).count(), 0);
      await page.evaluate(async () => {
        const app = document.querySelector("#app").__vue_app__;

        await app.config.globalProperties.$router.push({ query: { section: "volunteers" } });
      });
      await page.waitForURL((url) => [null, "overview"].includes(url.searchParams.get("section")));
      await page.getByText("No tasks assigned yet", { exact: true }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Volunteers", exact: true }).count(), 0);
      assert.equal(requests.some((request) => /\/annual-conference\/2026\/(volunteer-applications|team|volunteer-follow-up)/.test(request.path)), false);
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

  for (const mobile of [false, true]) {
    await journey(`organizer-session-recovery-volunteers${mobile ? "-phone" : ""}`, async ({ page, responses, requests }) => {
      const path = mobile
        ? "/organizer-console/mobile/annual-conference/2026?section=volunteers"
        : "/organizer-console/annual-conference/2026/volunteers";
      const pathname = path.split("?")[0];
      const capabilities = ["volunteers.directory.view", "volunteers.reviews.view", "volunteers.intake.share"];
      let authenticated = true;
      const observedSession = "10000000-0000-4000-8000-000000000001";
      const activeUser = { email: "organizer@example.test", display_name: "Conference Organizer", role: "owner" };

      responses.set("/api/auth/session", () => ({
        body: { authenticated, auth_configured: true, auth_mode: "supabase", ...(authenticated ? { user: activeUser, session_instance_id: observedSession } : {}) },
      }));
      responses.set("/api/auth/admin/session/expire", (request) => {
        assert.deepEqual(request.postDataJSON(), { session_instance_id: observedSession });
        authenticated = false;

        return { body: { ok: true } };
      });
      responses.set("/api/auth/logout", () => {
        authenticated = false;

        return { body: { ok: true } };
      });
      responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
      responses.set("/api/annual-conference/2026/work-plan", {
        body: { ...workspace, permissions: { ...workspace.permissions, capabilities } },
      });
      responses.set("/api/annual-conference/2026/team", { body: { members: [] } });
      responses.set("/api/admin/short-links/ensure", { body: { short_url: origin + "/r/demo" } });
      responses.set("/api/annual-conference/2026/volunteer-applications", { body: {
        applications: ["Ama Mensah", "Kwesi Asare", "Esi Boateng", "Adwoa Owusu", "Kojo Mensah", "Abena Ofori"].map((name, index) => ({
          id: "fixture-" + index, membership_id: null, name, email: "volunteer" + index + "@example.test",
          x_handle: null, slack_name: null, created_at: "2026-09-26T12:00:00Z", status: index < 3 ? "active" : "applicant",
        })),
      } });

      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1680, height: 1030 });
      await page.goto(origin + path);
      await page.getByText("Ama Mensah", { exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (!mobile) await page.screenshot({ path: artifacts + "/organizer-session-volunteers-before.png" });

      await page.clock.fastForward(28 * 60_000 + 100);
      const dialog = page.getByRole("dialog");
      const warningTitle = dialog.getByRole("heading", { name: "Still working?", exact: true });

      await warningTitle.waitFor();
      assert.equal(await warningTitle.evaluate(element => element === document.activeElement), true);
      await page.clock.fastForward(2 * 60_000);
      const signIn = dialog.getByRole("button", { name: "Sign in again", exact: true });
      const signOut = dialog.getByRole("button", { name: "Sign out", exact: true });

      await signIn.waitFor();
      await page.clock.runFor(350);
      assert.equal(requests.some(({ path }) => path === "/api/auth/logout"), false);
      assert.equal(requests.filter(({ path }) => path === "/api/auth/admin/session/expire").length, 1);
      assert.equal(new URL(page.url()).pathname, pathname);
      if (mobile) assert.equal(new URL(page.url()).searchParams.get("section"), "volunteers");
      assert.equal(await page.getByText("Ama Mensah", { exact: true }).count(), 0);
      assert.equal(await page.getByText("volunteer0@example.test", { exact: true }).count(), 0);
      await page.screenshot({ path: artifacts + (mobile ? "/organizer-session-volunteers-phone.png" : "/organizer-session-volunteers-locked.png") });
      if (!mobile) await dialog.screenshot({ path: artifacts + "/organizer-session-modal-detail.png" });

      const restingBackground = await signIn.evaluate(element => getComputedStyle(element).backgroundColor);

      await page.keyboard.press("Tab");
      assert.equal(await signIn.evaluate(element => element === document.activeElement && element.matches(":focus-visible")), true);
      await page.clock.runFor(300);
      assert.notEqual(await signIn.evaluate(element => getComputedStyle(element).backgroundColor), restingBackground);
      for (const button of [signIn, signOut]) {
        const style = await button.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const computed = getComputedStyle(element);

          return { height: rect.height, width: rect.width, border: computed.borderStyle, decoration: computed.textDecorationLine };
        });

        assert.ok(style.height >= 44 && style.width >= 44);
        assert.equal(style.border, "none");
        assert.equal(style.decoration, "none");
        await button.hover();
        assert.equal(await button.evaluate(element => getComputedStyle(element).borderStyle), "none");
        assert.equal(await button.evaluate(element => getComputedStyle(element).textDecorationLine), "none");
      }
      assert.equal(await signOut.evaluate(element => element !== document.activeElement && getComputedStyle(element).outlineStyle === "none"), true);

      const requestsBeforeActivity = requests.length;

      await page.mouse.move(420, 710);
      await page.keyboard.press("Escape");
      assert.equal(await signIn.isVisible(), true);
      assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"],dialog'))), true);
      assert.equal(requests.slice(requestsBeforeActivity).some(({ path }) => path.endsWith("/volunteer-applications")), false);
      if (mobile) {
        await page.setViewportSize({ width: 320, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        for (const button of [signIn, signOut]) {
          const rect = await button.boundingBox();

          assert.ok(rect && rect.width >= 44 && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= 320);
        }
      }

      const signOutGate = createSaveGate();

      responses.set("/api/auth/logout", async () => {
        signOutGate.markEntered();
        await signOutGate.response;

        return { body: { ok: true } };
      });
      const signOutRequestStart = requests.length;

      try {
        await page.getByRole("dialog").getByRole("button", { name: "Sign out", exact: true }).click();
        await waitForSaveGate(signOutGate, "explicit sign out");
        assert.equal(await page.getByText("Ama Mensah", { exact: true }).count(), 0);
        assert.equal(requests.slice(signOutRequestStart).some(({ path }) => path.endsWith("/volunteer-applications")), false);
      } finally {
        signOutGate.release();
      }
      await page.waitForURL(url => url.pathname === "/organizer-console/login");
    }, { role: "owner", useFakeClock: true });
  }

  await journey("organizer-session-recovery-resume", async ({ page, responses, requests }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const path = "/organizer-console/events";
    let unavailable = false;
    const user = { email: "organizer@example.test", display_name: "Fixture Organizer", role: "owner" };

    responses.set("/api/auth/session", () => unavailable
      ? { status: 503, body: { error: "Temporarily unavailable" } }
      : { body: { authenticated: true, auth_configured: true, user } });
    responses.set("/api/auth/logout", { body: { ok: true } });
    await page.goto(origin + path);
    await page.getByText("Fixture Meetup", { exact: true }).first().waitFor();
    unavailable = true;
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.clock.runFor(2200);
    await page.getByRole("button", { name: "Try again", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Sign in again" }).count(), 0);
    assert.equal(requests.some(request => request.path === "/api/auth/logout"), false);

    unavailable = false;
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("Fixture Meetup", { exact: true }).first().waitFor();
    assert.equal(new URL(page.url()).pathname, path);

    // A sleeping tab can resume with overdue timers still suspended.
    const current = await page.evaluate(() => Date.now());

    await page.clock.setSystemTime(current + 31 * 60_000);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.getByRole("button", { name: "Sign in again" }).waitFor();
    assert.equal(await page.getByText("Fixture Meetup", { exact: true }).count(), 0);
    const requestsAtLock = requests.length;

    await page.reload();
    await page.getByRole("button", { name: "Sign in again" }).waitFor();
    assert.equal(new URL(page.url()).pathname, path);
    assert.equal(requests.slice(requestsAtLock).some(request => request.path === "/api/events"), false);
  }, { role: "owner", useFakeClock: true });

  await journey("organizer-session-recovery-route-guard", async ({ page, responses, requests }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const path = "/organizer-console/annual-conference/2026/ticketing";
    const target = path + "?section=orders";

    responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
    responses.set("/api/annual-conference/2026/work-plan", {
      body: { ...workspace, permissions: { ...workspace.permissions, capabilities: ownerCapabilities } },
    });
    responses.set("/api/annual-conference/2026/ticketing", {
      body: { settings: { public_capacity: 150, ticket_tiers: [] }, inventory: { paid_seats: 0, sponsor_seats_held: 0, checkout_seats_held: 0, remaining_public_seats: 150 } },
    });
    responses.set("/api/annual-conference/2026/ticketing/orders", { body: { orders: [], total: 0, page: 1, page_size: 5 } });
    await page.goto(origin + target);
    await page.getByRole("heading", { name: "Ticket orders" }).waitFor();
    await page.clock.fastForward(30 * 60_000 + 100);
    const signIn = page.getByRole("button", { name: "Sign in again" });

    await signIn.waitFor();
    const offset = requests.length;

    await page.goto(origin + "/organizer-console/events");
    await page.waitForURL(origin + target);
    await signIn.waitFor();
    await page.reload();
    await signIn.waitFor();
    assert.equal(new URL(page.url()).searchParams.get("section"), "orders");
    assert.equal(requests.slice(offset).some(({ path }) => path.includes("/annual-conference/") || path === "/api/events"), false);

    await page.goto(origin + "/organizer-console/auth/callback?error=oauth_failed");
    await page.waitForURL(origin + target);
    await signIn.waitFor();
    await page.getByRole("dialog").getByRole("alert").filter({ hasText: "Google sign-in was not completed" }).waitFor();
    assert.equal(requests.slice(offset).some(({ path }) => path.includes("/annual-conference/") || path === "/api/events"), false);
  }, { role: "owner", useFakeClock: true });

  await journey("annual-ticketing-sections", async ({ page, responses, requests }) => {
    const base = "/organizer-console/annual-conference/2026/ticketing";
    const inventory = { public_capacity: 150, paid_seats: 1, sponsor_seats_held: 1, checkout_seats_held: 1, remaining_public_seats: 147, reduction_floor: 3 };
    const tiers = [
      { key: "regular", label: "Regular pass", quantity: 1, price_minor: 15000, public: true },
      { key: "team_3", label: "Team of 3", quantity: 3, price_minor: 45000, public: true },
      { key: "team_5", label: "Team of 5", quantity: 5, price_minor: 75000, public: true },
    ];
    const order = {
      id: "ticketing-order", purchaser_name: "Abena Mensah", purchaser_email: "abena@example.test",
      tier_key: "regular", quantity: 1, amount_minor: 15000, currency: "GHS", status: "paid", payment_mode: "live",
      payment_reference: "fixture-reference", paid_at: "2026-10-16T10:00:00Z", created_at: "2026-10-16T10:00:00Z",
      amount_paid_minor: 15299, quoted_gross_amount_minor: 15299,
      delivery_status: "delivered", seats: [{ id: "issued-1", order_seat_number: 1, status: "issued", issued_at: "2026-10-16T10:00:00Z", checked_in_at: null }],
    };

    const attempts = ["Esi Boateng", "Kwame Asare"].map((name, index) => ({
      ...order, id: `checkout-${index}`, purchaser_name: name, purchaser_email: `${name.split(" ")[0].toLowerCase()}@example.test`,
      status: index === 0 ? "pending_payment" : "expired", amount_paid_minor: null, paid_at: null,
      created_at: index === 0 ? "2026-11-04T10:28:00Z" : "2026-11-04T01:10:00Z",
      expires_at: index === 0 ? "2026-11-04T10:43:00Z" : "2026-11-04T01:25:00Z",
      delivery_status: null, payment_reference: null, seats: [],
    }));
    const ordersForView = (request, year) => {
      const params = new URL(request.url()).searchParams;
      const view = params.get("view");
      const pageNumber = Number(params.get("page") ?? 1);
      const orders = year !== 2026 ? [] : view === "attempts" ? attempts : view === "test" ? [] : view === "all" ? [order, ...attempts] : [order];

      return { body: { orders: orders.slice((pageNumber - 1) * 5, pageNumber * 5), total: orders.length, page: pageNumber, page_size: 5 } };
    };

    responses.set("/api/annual-conference/editions", { body: { editions: [edition, { ...edition, year: 2027, label: "December 2027" }] } });
    for (const year of [2026, 2027]) {
      responses.set(`/api/annual-conference/${year}/work-plan`, {
        body: { ...workspace, edition: { ...edition, year }, permissions: { ...workspace.permissions, capabilities: ownerCapabilities } },
      });
      responses.set(`/api/annual-conference/${year}/ticketing`, {
        body: { settings: { public_capacity: 150, ticket_sales_status: "draft", public_mode: "free", currency: "GHS", ticket_tiers: tiers }, inventory },
      });
      responses.set(`/api/annual-conference/${year}/ticketing/orders`, request => ordersForView(request, year));
      responses.set(`/api/annual-conference/${year}/ticketing/sponsor-allocations`, { body: { allocations: [] } });
      responses.set(`/api/annual-conference/${year}/ticketing/email-deliveries`, { body: {
        deliveries: [], total: 0, page: 1, page_size: 8,
        summary: { queued: 0, sending: 0, accepted: 0, delivered: 0, failed: 0 },
      } });
    }
    responses.set("/api/annual-conference/2026/ticketing/test-coupons", { body: {
      coupons: [{
        id: "coupon-1", code: "TEST-ABCD-EFGH", discount_type: "fixed_minor", discount_value: 500,
        eligible_tiers: ["regular"], expires_at: "2026-12-19T10:00:00Z", max_completed: 5,
        enabled: true, completed: 0, active_holds: 0, remaining: 5, exceptions: 0,
      }], total: 1, page: 1, page_size: 8, checkouts: [{
        id: "sandbox-checkout", payment_reference: "sandbox-reference", purchaser_name: "Sandbox purchaser", purchaser_email: "sandbox@example.test",
        tier_key: "regular", quantity: 1, coupon_code: null, base_amount_minor: 15000, discount_amount_minor: 0,
        amount_minor: 15000, currency: "GHS", status: "verified", resolution_reason: null,
        expires_at: "2026-10-16T10:15:00Z", verified_at: "2026-10-16T10:00:00Z", created_at: "2026-10-16T10:00:00Z",
      }], checkout_total: 1, checkout_page: 1, checkout_page_size: 5,
    } });
    const ticketingPath = "/api/annual-conference/2026/ticketing";
    const ordersPath = ticketingPath + "/orders";
    const ticketingResponse = responses.get(ticketingPath);
    const ordersResponse = responses.get(ordersPath);

    for (const width of [320, 390, 768, 1280]) {
      const ticketingGate = createSaveGate();
      const ordersGate = createSaveGate();
      const height = width === 320 ? 667 : width === 390 ? 844 : 1000;

      responses.set(ticketingPath, async () => {
        await ticketingGate.response;

        return ticketingResponse;
      });
      responses.set(ordersPath, async (request) => {
        await ordersGate.response;

        return ordersResponse(request);
      });
      try {
        await page.setViewportSize({ width, height });
        await page.goto(`${origin}${base}?section=orders&retained=yes`);
        const panel = page.locator('[aria-labelledby="ticket-orders-title"]');
        const rows = panel.locator('[data-loading-section="annual-conference-ticket-orders"]');
        const rowBones = await orderSkeletonBones(rows);

        ticketingGate.release();
        await rows.scrollIntoViewIfNeeded();
        const bounds = await rows.boundingBox();

        assert.ok(bounds && bounds.height >= 200 && bounds.height <= 401);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (width === 390 || width === 1280) {
          await panel.screenshot({ path: `${artifacts}/annual-ticketing-orders-loading-${width}.png` });
        }

        ordersGate.release();
        const content = panel.locator(width < 768 ? ".ticket-order-cards" : "table");
        const status = content.getByText("Delivered", { exact: true }).first();

        await status.waitFor();
        const center = await orderElementBounds(content, status, true);

        assertOrderPlaceholder(rowBones, center, `Delivery text at ${width}px`, { textOffset: width < 768 ? 12 : 24 });
        if (width === 390 || width === 1280) {
          await panel.screenshot({ path: `${artifacts}/annual-ticketing-orders-loaded-${width}.png` });
        }
      } finally {
        ticketingGate.release();
        ordersGate.release();
        responses.set(ticketingPath, ticketingResponse);
        responses.set(ordersPath, ordersResponse);
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}${base}?section=orders&retained=yes`);
    const nav = page.getByRole("navigation", { name: "Ticketing sections", exact: true });

    await page.getByRole("rowheader").getByText("Abena Mensah", { exact: true }).waitFor();
    await page.getByRole("row").filter({ hasText: "Abena Mensah" }).getByText("Paid", { exact: true }).waitFor();
    const ordersPanel = page.locator('[aria-labelledby="ticket-orders-title"]');
    const filter = (name) => ordersPanel.getByRole("button", { name, exact: true });

    assert.equal(await filter("Paid orders").getAttribute("aria-pressed"), "true");
    assert.match(await ordersPanel.getByRole("table").innerText(), /152\.99/i);
    assert.doesNotMatch(await ordersPanel.getByRole("table").innerText(), /152\.99 received/i);
    assert.equal(await filter("Paid orders").evaluate((button) => getComputedStyle(button).backgroundColor), "rgb(245, 230, 66)");
    await ordersPanel.screenshot({ path: `${artifacts}/annual-orders-paid-desktop.png` });
    await filter("Paid orders").focus();
    await page.keyboard.press("Tab");
    assert.equal(await filter("Checkout attempts").evaluate((button) => button.matches(":focus-visible")), true);
    assert.notEqual(await filter("Checkout attempts").evaluate((button) => getComputedStyle(button).boxShadow), "none");
    const deliveredCell = ordersPanel.getByRole("row").filter({ hasText: "Abena Mensah" }).getByRole("cell").filter({ hasText: "Delivered" });

    assert.equal(await deliveredCell.evaluate((cell) => getComputedStyle(cell).textAlign), "center");
    assert.equal(await deliveredCell.locator("span").count(), 0);
    assert.doesNotMatch(await ordersPanel.getByRole("table").innerText(), /Esi Boateng|Kwame Asare|check.in/i);
    await filter("Checkout attempts").click();
    await ordersPanel.getByRole("rowheader", { name: /Kwame Asare/ }).waitFor();
    const attemptsTable = await ordersPanel.getByRole("table").innerText();

    assert.match(attemptsTable, /Esi Boateng/);
    assert.match(attemptsTable, /152\.99 quoted/i);
    assert.match(attemptsTable, /started/i);
    assert.doesNotMatch(attemptsTable, /Not queued|Abena Mensah|Check.in/i);
    await ordersPanel.screenshot({ path: `${artifacts}/annual-orders-attempts-desktop.png` });
    for (const name of ["Adwoa", "Nii", "Kweku", "Akosua"]) {
      attempts.push({ ...attempts[0], id: `checkout-${name}`, purchaser_name: name, purchaser_email: `${name.toLowerCase()}@example.test` });
    }
    await filter("Refresh").click();
    await ordersPanel.getByRole("button", { name: "Next page" }).click();
    await ordersPanel.getByRole("rowheader", { name: /Akosua/ }).waitFor();
    attempts.pop();
    await filter("Refresh").click();
    await ordersPanel.getByRole("rowheader", { name: /Esi Boateng/ }).waitFor();
    assert.equal(await ordersPanel.getByRole("rowheader").count(), 5);
    await filter("Test orders").click();
    await ordersPanel.getByText("No test orders yet.").waitFor();
    await filter("Paid orders").click();
    await ordersPanel.getByRole("rowheader", { name: /Abena Mensah/ }).waitFor();
    await assertUnderlineTabGeometry(page, '[aria-label="Ticketing sections"]');
    assert.deepEqual(await nav.getByRole("link").allTextContents().then(items => items.map(item => item.trim())), ["Overview", "Orders", "Delivery", "Sponsors", "Complimentary", "Coupons"]);
    assert.equal(await nav.locator('[aria-current="page"]').innerText(), "Orders");
    assert.equal(requests.some(request => /\/ticketing\/(sponsor-allocations|email-deliveries|test-coupons)$/.test(request.path)), false, "Unvisited section queries stay idle");
    await nav.getByRole("link", { name: "Sponsors", exact: true }).click();
    await page.getByLabel("Sponsor", { exact: true }).fill("Unsubmitted partner draft");
    assert.equal(new URL(page.url()).searchParams.get("retained"), "yes");
    await nav.getByRole("link", { name: "Orders", exact: true }).click();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await page.getByRole("dialog", { name: "Abena Mensah", exact: true }).waitFor();
    assert.equal(await page.locator("#app").getAttribute("inert"), "");
    await page.goBack();
    await page.getByLabel("Sponsor", { exact: true }).waitFor();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(await page.getByLabel("Sponsor", { exact: true }).inputValue(), "Unsubmitted partner draft");
    assert.equal(await page.locator("#app").getAttribute("inert"), null);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-labelledby="ticket-orders-title"]'))), false, "Back never focuses the hidden order panel");
    await nav.getByRole("link", { name: "Coupons", exact: true }).click();
    await page.getByRole("cell", { name: "TEST-ABCD-EFGH", exact: true }).waitFor();
    await page.getByRole("button", { name: "Create test coupon", exact: true }).click();
    await page.locator("#test-coupon-discount").fill("12.50");
    await nav.getByRole("link", { name: "Overview", exact: true }).click();
    await page.getByRole("heading", { name: "Every reserved seat accounted for", exact: true }).waitFor();
    await nav.getByRole("link", { name: "Coupons", exact: true }).click();
    assert.equal(await page.locator("#test-coupon-discount").inputValue(), "12.50", "Visited Coupons controls keep their unsaved draft");
    await page.getByRole("button", { name: "Test checkout activity", exact: true }).click();
    const activityBreadcrumb = page.getByRole("navigation", { name: "Breadcrumb" }).filter({ hasText: "Test checkout activity" });

    await activityBreadcrumb.getByText("Test checkout activity", { exact: true }).waitFor();
    assert.equal(await activityBreadcrumb.getByText("Test checkout activity", { exact: true }).getAttribute("aria-current"), "page");
    await page.getByRole("button", { name: /^Open private sandbox checkout details/ }).click();
    const sandboxDrawer = page.getByRole("dialog", { name: "Private checkout details", exact: true });

    await sandboxDrawer.waitFor();
    await page.goBack();
    await page.getByRole("heading", { name: "Every reserved seat accounted for", exact: true }).waitFor();
    await sandboxDrawer.waitFor({ state: "detached" });
    assert.equal(await page.locator("#app").getAttribute("inert"), null);
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[aria-labelledby="test-coupons-title"]'))), false, "Leaving Coupons never focuses its hidden controls");
    await nav.getByRole("link", { name: "Coupons", exact: true }).click();
    await activityBreadcrumb.getByRole("button", { name: "Coupons", exact: true }).click();
    assert.equal(await page.locator("#test-coupon-discount").inputValue(), "12.50");
    await page.setViewportSize({ width: 320, height: 844 });
    await nav.locator('.app-dropdown-trigger').waitFor();
    await assertWorkspaceSection(nav, "Coupons");
    await page.setViewportSize({ width: 390, height: 844 });
    await chooseWorkspaceSection(page, nav, "Orders");
    const phoneOrders = page.getByRole("list", { name: "Ticket orders", exact: true });
    const viewOrder = phoneOrders.getByRole("button", { name: "View order from Abena Mensah", exact: true });

    await phoneOrders.waitFor();
    assert.equal(await page.locator('[aria-labelledby="ticket-orders-title"] table').isVisible(), false);
    for (const label of ["Pass", "Payment", "Latest order email"]) await phoneOrders.getByText(label, { exact: true }).waitFor();
    assert.doesNotMatch(await phoneOrders.innerText(), /check.in/i);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const orderButton = await viewOrder.boundingBox();

    assert.ok(orderButton && orderButton.height >= 44 && orderButton.x >= 0 && orderButton.x + orderButton.width <= 390);
    await page.screenshot({ path: `${artifacts}/annual-ticketing-orders-mobile.png` });
    await ordersPanel.screenshot({ path: `${artifacts}/annual-orders-paid-phone.png` });
    await viewOrder.click();
    const phoneDrawer = page.getByRole("dialog", { name: "Abena Mensah", exact: true });

    await phoneDrawer.waitFor();
    assert.doesNotMatch(await phoneDrawer.innerText(), /check.in/i);
    const closeOrder = phoneDrawer.getByRole("button", { name: "Close ticket order details", exact: true });
    const closeBounds = await closeOrder.boundingBox();

    assert.ok(closeBounds && closeBounds.width >= 44 && closeBounds.height >= 44);
    await closeOrder.click();
    await phoneDrawer.waitFor({ state: "detached" });
    assert.equal(await viewOrder.evaluate(element => element === document.activeElement), true);
    await chooseWorkspaceSection(page, nav, "Delivery");
    await page.getByRole("heading", { name: "Delivery health", exact: true }).waitFor();
    await assertWorkspaceSection(nav, "Delivery");
    assert.equal(await page.locator("body").evaluate(element => element.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `${artifacts}/annual-ticketing-delivery-mobile.png` });
    await page.goto(`${origin}${base}?section=orders&section=delivery&retained=yes`);
    await page.waitForURL(url => url.searchParams.getAll("section").length === 1 && url.searchParams.get("section") === "overview");
    assert.equal(new URL(page.url()).searchParams.get("retained"), "yes");

    const nextYear = "/organizer-console/annual-conference/2027/ticketing";

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}${nextYear}?section=testing&retained=yes`);
    await page.waitForURL(url => url.searchParams.get("section") === "overview");
    assert.equal(await nav.getByRole("link", { name: "Coupons", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Edit prices", exact: true }).waitFor();
    assert.equal(requests.some(request => request.path === "/api/annual-conference/2027/ticketing/orders"), true, "Overview retains the authorized non-2026 pricing eligibility read");
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
  }, { role: "owner", date: "2026-11-04T11:25:00Z" });

  await journey("annual-paid-payment-mode", async ({ page, responses, requests }) => {
    const paymentPath = "/api/annual-conference/2026/registrations/payment-mode";
    let paymentSettings;

    responses.set("/api/annual-conference/editions", { body: { editions: [edition] } });
    responses.set("/api/annual-conference/2026/work-plan", {
      body: { ...workspace, edition, permissions: { ...workspace.permissions, capabilities: ownerCapabilities } },
    });
    responses.set("/api/annual-conference/2026/ticketing/capacity", {
      body: { settings: { public_capacity: 150 }, inventory: { reduction_floor: 0 } },
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
      body: { ...workspace, edition, permissions: { ...workspace.permissions, capabilities: ownerCapabilities } },
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
    await assertUnderlineTabGeometry(page, '.annual-conference-nav[aria-label="Annual Conference workspace"]');
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
    assert.equal(await page.getByRole("button", { name: "Check in", exact: true }).count(), 0);
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
    await page.getByLabel("Search guests").waitFor();
    await page.locator(".page-leave-active, .page-stable-leave-active").waitFor({ state: "detached" });
    await page.locator(".page-enter-active, .page-stable-enter-active").waitFor({ state: "detached" });
    const headingAfter = await page.getByRole("heading", { name: "Registration", exact: true }).boundingBox();

    assert.ok(Math.abs(headingBefore.x - headingAfter.x) < 1);
    assert.ok(Math.abs(headingBefore.y - headingAfter.y) < 1);
    assert.equal(await page.getByText("Welcome them in.", { exact: true }).count(), 0);
    await page.screenshot({ path: artifacts + "/annual-registration-checkin-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const checkInPanel = await page.getByRole("region", { name: "Conference guests" }).boundingBox();

    assert.ok(checkInPanel.x >= 0 && checkInPanel.x + checkInPanel.width <= 391, "Check-in panel must fit the mobile viewport");
    await page.screenshot({ path: artifacts + "/annual-registration-checkin-mobile.png", fullPage: true });
    guests[0].status = "waitlisted";
    await page.reload();
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
  }, { role: "owner", date: "2026-12-19T10:00:00Z" });

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
    await page.goto(`${origin}/organizer-console/annual-conference/2026/check-in`);
    await page.getByText("Adjoa Mensah", { exact: true }).waitFor();
    await page.getByText("Check-in opens at midnight Accra time on 19 December 2026.", { exact: true }).waitFor();
    await page.getByRole("region", { name: "Conference attendee check-in" }).screenshot({ path: `${artifacts}/annual-guests-locked.png` });
    const activeGuestFilter = page.getByRole("button", { name: "All", exact: true });

    assert.equal(await activeGuestFilter.evaluate((button) => getComputedStyle(button).backgroundColor), "rgb(245, 230, 66)");
    const admitButton = page.getByRole("button", { name: "Check in", exact: true }).first();

    assert.equal(await admitButton.isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Scan with camera" }).isDisabled(), true);
    await page.getByLabel("Search guests").fill("Kofi");
    await page.getByText("Kofi Mensah", { exact: true }).waitFor();
    await page.getByLabel("Search guests").fill("");
    assert.equal(requests.some(({ method, path }) => method === "POST" && /\/check-in(\/admit)?$/.test(path)), false);
    await page.clock.fastForward(15_000);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Check in" && !button.disabled));
    assert.equal(
      requests.some((request) => request.path.endsWith("/check-in/attendees")),
      true,
    );
    assert.equal(await page.getByRole("navigation", { name: "Registration sections" }).getByRole("link", { name: "Registration", exact: true }).count(), 0);
    assert.equal(await page.getByRole("navigation", { name: "Registration sections" }).getByRole("link").count(), 0);
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
  }, { role: "volunteer", date: "2026-12-18T23:59:45Z", useFakeClock: true });

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
