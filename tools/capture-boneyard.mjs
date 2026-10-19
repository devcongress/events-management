import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outputDirectory = resolve(root, "src/bones");
const manifestPath = resolve(root, ".auto-skeleton/manifest.json");
const captureUrl = "http://127.0.0.1:4180/tools/boneyard-capture.html";
const breakpoints = [390, 768, 1280];
const knownSections = new Set([
  "public-events-list", "public-dashboard", "speaker-talk-intake", "event-registration",
  "archive-event-detail", "public-archive", "call-for-proposals", "public-feedback", "public-event-detail",
  "system-design-participant", "admin-feedback-overview", "admin-talks", "admin-speakers",
  "admin-organizers", "admin-event-detail", "admin-feedback", "admin-attendance",
  "admin-audit-log", "admin-attendance-overview", "admin-events-list", "admin-event-submissions", "admin-present-forms-board-1", "admin-present-forms-board-2", "admin-present-forms-board-3", "admin-registration-workspace", "admin-system-design", "event-amendment", "admin-community-event-detail", "volunteer-follow-up-campaign", "annual-conference-finance",
  "annual-conference-speakers", "annual-conference-overview", "annual-conference-registrations",
  "annual-conference-volunteers", "annual-conference-work-plan", "annual-conference-ticketing",
  "organizer-mobile-next-actions",
  "mobile-events-list", "mobile-event-detail", "mobile-conference-workspace",
  "mobile-check-in-guests", "mobile-blasts-audience",
]);

const requested = process.argv.slice(2);
const refresh = requested.includes("--refresh");
const requestedIds = requested.includes("--all")
  ? [...knownSections]
  : requested.filter((argument) => argument !== "--refresh");

if (requestedIds.length === 0 || requestedIds.some((section) => !knownSections.has(section))) {
  throw new Error("Pass known Boneyard section IDs, or --all. Use --refresh to deliberately replace completed captures.");
}

let existingManifest;

try {
  existingManifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;

  existingManifest = { schemaVersion: 1, sections: {} };
}

if (existingManifest.schemaVersion !== 1 || !existingManifest.sections || typeof existingManifest.sections !== "object") {
  throw new Error("Unsupported Boneyard manifest schema. No artifacts were changed.");
}

const allowlist = requestedIds.filter((id) => refresh || existingManifest.sections[id]?.status !== "completed");

if (allowlist.length === 0) {
  console.log("All requested Boneyard captures are complete; no files changed. Pass --refresh to replace them deliberately.");
  process.exit(0);
}

for (const [id, section] of Object.entries(existingManifest.sections)) {
  if (section.status !== "completed") continue;

  const artifact = `src/bones/${id}.bones.json`;
  const expectedHash = section.artifactHashes?.[artifact];
  const actualHash = createHash("sha256")
    .update(await readFile(resolve(root, artifact)))
    .digest("hex");

  if (!expectedHash || expectedHash !== actualHash) {
    throw new Error(`Completed Boneyard artifact failed its preservation check: ${id}`);
  }
}

await mkdir(resolve(root, ".auto-skeleton"), { recursive: true });
const lockPath = resolve(root, ".auto-skeleton/capture.lock");
const captureLock = await open(lockPath, "wx");

const server = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--config",
  "tools/boneyard.vite.config.ts",
  "--host",
  "127.0.0.1",
  "--port",
  "4180",
  "--strictPort",
], {
  cwd: root,
  stdio: "pipe",
});

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(captureUrl);

      if (response.ok && (await response.text()).includes("Boneyard capture fixtures")) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }

  throw new Error("Timed out starting the isolated Boneyard capture server.");
}

async function writeAtomically(path, contents) {
  const temporaryPath = `${path}.tmp-${process.pid}`;

  await writeFile(temporaryPath, contents);
  await rename(temporaryPath, path);
}

try {
  await waitForServer();
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(resolve(root, ".auto-skeleton"), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.addInitScript(() => { window.__BONEYARD_BUILD = true; });

  const captures = {};

  for (const width of breakpoints) {
    await page.setViewportSize({ width, height: 1000 });
    const targetUrl = new URL(captureUrl);

    for (const id of allowlist) targetUrl.searchParams.append("section", id);
    await page.goto(targetUrl.toString(), { waitUntil: "networkidle" });
    await page.waitForFunction(() => typeof window.__BONEYARD_SNAPSHOT === "function");

    const snapshot = await page.evaluate((ids) => {
      const results = {};

      for (const id of ids) {
        const element = document.querySelector(`[data-boneyard="${id}"]`);

        if (!element?.firstElementChild) throw new Error(`Missing fixture for ${id}`);
        results[id] = window.__BONEYARD_SNAPSHOT(element.firstElementChild, id);
      }

      return results;
    }, allowlist);

    for (const [id, result] of Object.entries(snapshot)) {
      if (!result?.bones?.length || !Number.isFinite(result.width) || !Number.isFinite(result.height)) {
        throw new Error(`Invalid Boneyard artifact for ${id} at ${width}px.`);
      }
      captures[id] ??= { breakpoints: {} };
      captures[id].breakpoints[width] = result;
    }
  }
  await browser.close();

  const sourceHash = createHash("sha256");

  for (const sourcePath of [
    "src/components/ui/BoneyardPageSkeleton.vue",
    "src/components/ui/BoneyardPageSkeletonFixture.vue",
    "src/styles.css",
    "src/styles/forms.css",
    "src/boneyard/capture.ts",
  ]) {
    sourceHash.update(sourcePath);
    sourceHash.update(await readFile(resolve(root, sourcePath)));
  }

  const inputFingerprint = sourceHash.digest("hex");

  for (const id of allowlist) {
    const fileName = `${id}.bones.json`;
    const artifactPath = resolve(outputDirectory, fileName);
    const serialized = `${JSON.stringify(captures[id], null, 2)}\n`;

    await writeAtomically(artifactPath, serialized);
    const hash = createHash("sha256").update(serialized).digest("hex");

    existingManifest.sections[id] = {
      status: "completed",
      sourcePaths: ["src/components/ui/BoneyardPageSkeleton.vue", "src/components/ui/BoneyardPageSkeletonFixture.vue"],
      route: "/tools/boneyard-capture.html",
      fixture: id,
      artifactPaths: [`src/bones/${fileName}`],
      artifactHashes: { [`src/bones/${fileName}`]: hash },
      inputFingerprint,
      captureConfig: { breakpoints, fixture: id, generatorVersion: "boneyard-js@1.9.0" },
      verification: "Targeted isolated fixture capture validated non-empty bones at 390px, 768px, and 1280px.",
    };
  }

  const registryEntries = Object.entries(existingManifest.sections)
    .filter(([, section]) => section.status === "completed" && section.artifactPaths?.[0])
    .map(([id, section]) => [id, section.artifactPaths[0].replace("src/bones/", "")]);

  const registry = [
    'import { registerBones } from "boneyard-js/vue";',
    ...registryEntries.map(([id, fileName], index) => `import bones${index} from "./${fileName}";`),
    "",
    "registerBones({",
    ...registryEntries.map(([id], index) => `  "${id}": bones${index},`),
    "});",
    "",
  ].join("\n");

  await writeAtomically(resolve(outputDirectory, "registry.ts"), registry);

  await writeAtomically(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    framework: "vue",
    boneyardVersion: "1.9.0",
    registryPath: "src/bones/registry.ts",
    sections: existingManifest.sections,
  }, null, 2)}\n`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  await captureLock.close();
  await unlink(lockPath);
}
