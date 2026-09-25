import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

// Serve only built static assets: no application server, credentials, or database.
const origin = "http://127.0.0.1:4189";
const artifacts = "artifacts/organizer-journeys";
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
    () => document.querySelectorAll(".page-view").length === 1,
  );
}

async function assertVisibleBoardCards(page, expectedLabels) {
  await waitForRouteTransition(page);

  const labels = await page
    .locator(".task-board__card:visible")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("aria-label")).sort(),
    );

  assert.deepEqual(labels, [...expectedLabels].sort());
}

async function assertBoardColumnsAreContained(page) {
  const isContained = await page
    .locator(".task-board:visible")
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
  await page.locator(".task-board:visible").evaluate(
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

async function journey(
  name,
  run,
  { role = "organizer", date = "2026-09-26T12:00:00Z" } = {},
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
  await page.clock.setFixedTime(new Date(date));
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
          .getByRole("region", { name: "Loading form QR codes" })
          .waitFor();
        await two.evaluate(() => document.fonts.ready);
        assert.equal(
          await two.locator(".code-frame.board-skeleton").count(),
          2,
        );
        assert.equal(await two.locator(".audience-card a").count(), 0);
        skeletonBox = await two.locator(".code-frame").first().boundingBox();
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
      const loadedBox = await two.locator(".code-frame").first().boundingBox();

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
      .getByRole("link")
      .filter({ hasText: "Alice" })
      .filter({ hasText: "View tasks" })
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

          assert.ok(gate, "Unexpected extra status PATCH");
          gate.markEntered();
          await gate.response;

          if (saveIndex === 3)
            return { status: 500, body: { error: "Save failed" } };

          serverTask = {
            ...serverTask,
            status: JSON.parse(request.postData()).status,
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
      const visibleBoard = page.locator(".task-board:visible");
      const taskCard = visibleBoard
        .getByRole("button", {
          name: "Open Move this task instantly",
          exact: true,
        })
        .first();

      await taskCard.waitFor();
      await assertBoardColumnsAreContained(page);
      assert.equal(await taskCard.getAttribute("draggable"), "true");

      const firstSaveRequested = page.waitForRequest((request) =>
        request.url().endsWith("/work-plan/optimistic-task"),
      );

      await moveBoardTask(page, "Open Move this task instantly", "In progress");
      await Promise.all([firstSaveRequested, saveGates[0].entered]);
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

      const queuedSaveRequested = page.waitForRequest(
        (request) =>
          request.url().endsWith("/work-plan/optimistic-task") &&
          JSON.parse(request.postData()).status === "blocked",
      );

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
      await queuedSaveRequested;
      await saveGates[1].entered;
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

      const secondSaveRequested = page.waitForRequest((request) =>
        request.url().endsWith("/work-plan/optimistic-task"),
      );

      await moveBoardTask(page, "Open Move this task instantly", "Done");
      await Promise.all([secondSaveRequested, saveGates[2].entered]);
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
        outcome_delivery: {
          status: "retrying",
          attempt_count: 2,
          next_attempt_at: "2026-09-23T10:15:00.000Z",
          last_error: "Temporary provider issue.",
          provider_email_id: null,
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
          decision: "pending",
          decision_version: 0,
          outcome_delivery: {
            ...recipient.outcome_delivery,
            attempt_count: index + 2,
            last_error: `Temporary provider issue ${index + 2}.`,
          },
        })),
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
            status: "draft",
            application_deadline_at: "2026-09-30T23:59:59.000Z",
            last_drain_at: null,
            last_drain_reason: null,
            outcome_paused: outcomePaused,
          },
          response_deadline: "2026-10-14T23:59:59.000Z",
          recipients: campaignRecipients,
          can_manage: true,
        },
      }));
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
            }],
            from: "DevCongress <volunteers@devcongress.org>",
            subject: "Your DevCongress 2026 volunteer application",
            html: "<html><head></head><body><p>Selected</p></body></html>",
            text: "Your application has been selected.",
          },
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
      await page.getByRole("tab", { name: "Campaign", exact: true }).click();
      const followUp = page.getByRole("region", {
        name: "Volunteer follow-up",
      });

      const outcomes = followUp.getByRole("region", { name: "Outcome emails" });

      await outcomes.locator(".outcome-summary").getByText(/accepted/).waitFor();
      await outcomes.getByText("Delivery attempts and backoff", { exact: true }).click();
      const finalDiagnostic = outcomes.locator(".outcome-diagnostics-scroll li").nth(12);

      await finalDiagnostic.scrollIntoViewIfNeeded();
      assert.equal(
        (await finalDiagnostic.innerText()).includes("Diagnostic Volunteer 13"),
        true,
      );

      await page.screenshot({
        path: `${artifacts}/volunteer-outcome-campaign.png`,
        fullPage: true,
      });
      await outcomes.getByRole("button", { name: "Preview acceptances", exact: true }).click();
      const outcomePreview = page.getByRole("dialog", { name: "Send acceptances" });

      await outcomePreview.getByTitle("Rendered outcome email preview").waitFor();
      await page.frameLocator('iframe[title="Rendered outcome email preview"]')
        .getByText("Selected", { exact: true })
        .waitFor();
      await outcomePreview.getByText("Frozen recipients (1)", { exact: true }).waitFor();
      await outcomePreview.getByText("ama@example.com", { exact: true }).waitFor();
      await outcomePreview.getByText("Sample template preview", { exact: false }).waitFor();
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
      await outcomes.getByRole("button", { name: "Pause outcome sending", exact: true }).click();
      await outcomes.getByRole("button", { name: "Resume outcome sending", exact: true }).waitFor();
      await outcomes.getByRole("button", { name: "Resume outcome sending", exact: true }).click();
      await outcomes.getByRole("button", { name: "Pause outcome sending", exact: true }).waitFor();

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

      await followUp.getByRole("button", { name: /Ama Mensah/ }).click();
      await followUp.locator(".follow-up-selected-drawer").waitFor();
      await followUp
        .getByRole("button", { name: "Close applicant details", exact: true })
        .click();
      await page.getByRole("tab", { name: "Directory", exact: true }).click();
      await page
        .getByText("Your directory is ready for its first volunteers", {
          exact: true,
        })
        .waitFor();
    },
    { role: "owner" },
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
            motivation: "I want to make the conference welcoming.",
            can_attend_accra: true,
            review_status: "unreviewed",
            review_note: null,
            invitation_sent: true,
            decision: "pending",
            decision_version: 0,
            outcome_sent: false,
          };
          const reviewedRecipient = {
            ...recipient,
            review_status: "reviewed",
            review_note: "Ready for scheduling.",
            decision: "accepted",
            decision_version: 1,
          };
          let persistedRecipient = recipient;

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
            () => ({ body: { recipients: [persistedRecipient] } }),
          );
          responses.set(
            "/api/annual-conference/2026/volunteer-follow-up/recipients/fixture-review-recipient/review",
            (request) => {
              const input = JSON.parse(request.postData() ?? "{}");

              persistedRecipient = {
                ...reviewedRecipient,
                review_status: input.status,
                review_note: input.note,
                decision: input.decision,
                decision_version: input.expected_version + 1,
              };

              return { body: { recipient: persistedRecipient } };
            },
          );

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
          await page.getByRole("button", { name: /Ama Mensah/ }).click();
          await page.getByRole("button", { name: "Volunteer selection decision" }).click();
          await page.getByRole("option", { name: "Accepted", exact: true }).click();
          await page.getByLabel("Review note").fill("Ready for scheduling.");
          await page
            .getByRole("button", { name: "Save review", exact: true })
            .click();
          await page.getByText("Review saved.", { exact: true }).waitFor();
          assert.equal(
            requests.some((request) =>
              request.path.endsWith("/fixture-review-recipient/review") &&
              JSON.parse(request.body ?? "{}").decision === "accepted" &&
              JSON.parse(request.body ?? "{}").expected_version === 0,
            ),
            true,
          );
          assert.equal(
            requests.some((request) => request.path.endsWith("/outcomes/confirm")),
            false,
          );
          await page
            .getByRole("button", { name: "Close review", exact: true })
            .click();
          await page.getByRole("button", { name: /Ama Mensah/ }).click();
          await page.getByLabel("Review note").waitFor();
          assert.equal(
            await page.getByLabel("Review note").inputValue(),
            "Ready for scheduling.",
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
  await journey(
    "volunteer-permissions",
    async ({ page, requests }) => {
      await page.goto(
        `${origin}/organizer-console/mobile/annual-conference/2026`,
      );
      await page.getByText("No tasks assigned yet", { exact: true }).waitFor();
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
