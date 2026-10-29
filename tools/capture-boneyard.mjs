import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { appPath, artifactForSection, hashBytes, mergeRegistry, validateManifest, writeAtomically } from './rebuild-boneyard-registry.mjs';

const runFile = promisify(execFile);

export const breakpoints = [390, 640, 768, 960, 1024, 1280];
const manifestFile = '.auto-skeleton/manifest.json';
const registryFile = 'src/bones/registry.ts';
const journalFile = '.auto-skeleton/capture-journal.json';
const terminalStatuses = new Set(['completed', 'adopted']);
const phoneHeights = [667, 740, 812, 852];
const phoneSections = ['public-dashboard', 'public-events-list', 'mobile-events-list', 'mobile-event-detail', 'organizer-mobile-next-actions'];
const screenshotSections = [
  'admin-audit-log',
  'call-for-proposals',
  'annual-conference-work-plan-board',
  'admin-present-forms-board-3',
  'annual-conference-ticket-orders',
];
const screenshotDirectory = '/private/tmp/ems-loading-refresh';

export async function withinDeadline(promise, message, timeout = 15000) {
  let timer;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeout); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function readOptional(path) {
  return readFile(path).catch((error) => {
    if (error.code === 'ENOENT') return null;

    throw error;
  });
}

async function readManifest(root) {
  const bytes = await readOptional(resolve(root, manifestFile));

  return bytes ? validateManifest(JSON.parse(bytes.toString())) : { schemaVersion: 1, sections: {} };
}

export function validateCatalog(sections) {
  if (!Array.isArray(sections) || sections.length === 0) throw new Error('The Boneyard catalog is empty.');

  const ids = new Set();

  for (const section of sections) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(section.id) || ids.has(section.id)) {
      throw new Error(`Unsafe or duplicate Boneyard section ID: ${section.id}`);
    }

    if (!section.route || !section.sourcePaths?.length || !Number.isFinite(section.capture?.maxWidth) || section.capture.maxWidth <= 0) {
      throw new Error(`Boneyard section ${section.id} is missing its route, sources, or capture dimensions.`);
    }

    ids.add(section.id);
  }

  return sections;
}

async function loadCatalog(root) {
  const { stdout } = await runFile(process.execPath, [
    '--import', 'tsx', '--input-type=module', '--eval',
    'const { skeletonSections } = await import(process.argv[1]); process.stdout.write(JSON.stringify(skeletonSections));',
    pathToFileURL(resolve(root, 'src/boneyard/sections/index.ts')).href,
  ], { cwd: root, maxBuffer: 4 * 1024 * 1024 });

  return validateCatalog(JSON.parse(stdout));
}

export function validateSnapshot(snapshot, id, viewportWidth) {
  if (snapshot?.name !== id || snapshot.viewportWidth !== viewportWidth || !Number.isFinite(snapshot.width) || snapshot.width <= 0
    || !Number.isFinite(snapshot.height) || snapshot.height <= 0 || !Array.isArray(snapshot.bones) || !snapshot.bones.length) {
    throw new Error(`Invalid Boneyard artifact for ${id} at ${viewportWidth}px.`);
  }

  let visibleBones = 0;

  for (const raw of snapshot.bones) {
    const bone = Array.isArray(raw) ? { x: raw[0], y: raw[1], w: raw[2], h: raw[3], r: raw[4] } : raw;

    if (![bone.x, bone.y, bone.w, bone.h].every(Number.isFinite) || bone.w < 0 || bone.h < 0
      || !['number', 'string'].includes(typeof bone.r) || (typeof bone.r === 'number' && !Number.isFinite(bone.r))) {
      throw new Error(`Invalid Boneyard bone for ${id} at ${viewportWidth}px.`);
    }

    // Scroll tables and fixed-height boards legitimately contain offscreen
    // descendants. The installed runtime clips them in its overlay.
    if (bone.x < 100 && bone.x + bone.w > 0 && bone.y < snapshot.height && bone.y + bone.h > 0) visibleBones += 1;
  }

  if (!visibleBones) throw new Error(`Boneyard artifact has no visible bones for ${id} at ${viewportWidth}px.`);

  return snapshot;
}

export function compactSnapshot(snapshot) {
  return {
    ...snapshot,
    bones: snapshot.bones.map((bone) => Array.isArray(bone) ? bone : [bone.x, bone.y, bone.w, bone.h, bone.r, ...(bone.c ? [true] : [])]),
  };
}

export async function snapshotFixture(page, id, width) {
  const snapshot = await withinDeadline(page.evaluate((sectionId) => {
    const root = document.querySelector(`[data-boneyard="${sectionId}"]`).firstElementChild;
    const rootRect = root.getBoundingClientRect();
    const excludeTags = ['col', 'colgroup', 'td', 'th', 'li'];
    const result = window.__BONEYARD_SNAPSHOT(root, sectionId, { excludeTags });
    const atomicTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'img', 'svg', 'video', 'canvas', 'input', 'button', 'textarea', 'select']);

    for (const cell of root.querySelectorAll('td, th, li')) {
      const cellRect = cell.getBoundingClientRect();
      const cellStyle = getComputedStyle(cell);

      if (cellRect.width < 1 || cellRect.height < 1 || cellStyle.visibility === 'hidden' || cellStyle.opacity === '0') continue;

      // Native extraction makes table cells and whole list cards atomic leaves.
      // Capture their children without changing DOM or losing text line boxes.
      const children = window.__BONEYARD_SNAPSHOT(cell, sectionId, { excludeTags });

      const background = cellStyle.backgroundColor;
      const radius = parseFloat(cellStyle.borderTopLeftRadius) || 0;
      const hasBackground = background !== 'transparent' && background !== 'rgba(0, 0, 0, 0)';
      const hasRoundedBorder = radius > 0 && parseFloat(cellStyle.borderTopWidth) > 0
        && cellStyle.borderTopColor !== 'transparent' && cellStyle.borderTopColor !== 'rgba(0, 0, 0, 0)';

      if (cell.tagName === 'LI' && (hasBackground || cellStyle.backgroundImage !== 'none' || hasRoundedBorder)) {
        result.bones.push({
          x: +((cellRect.left - rootRect.left) / rootRect.width * 100).toFixed(4),
          y: Math.round(cellRect.top - rootRect.top),
          w: +(cellRect.width / rootRect.width * 100).toFixed(4),
          h: Math.round(cellRect.height),
          r: radius,
          c: true,
        });
      }

      for (const bone of children.bones) {
        result.bones.push({
          ...bone,
          x: +(((cellRect.left - rootRect.left + bone.x * cellRect.width / 100) / rootRect.width) * 100).toFixed(4),
          y: Math.round(cellRect.top - rootRect.top + bone.y),
          w: +(bone.w * cellRect.width / rootRect.width).toFixed(4),
        });
      }

      // Bare headers and mixed text nodes have no element wrapper for Boneyard
      // to walk. Ranges retain their actual line boxes and text footprint.
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      let text;

      while ((text = walker.nextNode())) {
        const parent = text.parentElement;

        if (!text.textContent.trim() || !parent || (parent !== cell && !parent.children.length)) continue;

        let coveredOrHidden = false;

        for (let ancestor = parent; ancestor && ancestor !== cell; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);

          if (atomicTags.has(ancestor.tagName.toLowerCase()) || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            coveredOrHidden = true;

            break;
          }
        }

        if (coveredOrHidden) continue;

        const range = document.createRange();

        range.selectNodeContents(text);

        for (const rect of range.getClientRects()) {
          if (rect.width < 1 || rect.height < 1) continue;

          result.bones.push({
            x: +((rect.left - rootRect.left) / rootRect.width * 100).toFixed(4),
            y: Math.round(rect.top - rootRect.top),
            w: +(rect.width / rootRect.width * 100).toFixed(4),
            h: Math.round(rect.height),
            r: 8,
          });
        }
      }
    }

    // Boneyard 1.9 reports the root width here; Vue selects by viewport width.
    return { ...result, viewportWidth: window.innerWidth };
  }, id), `Snapshot extraction timed out for ${id} at ${width}px.`);

  return compactSnapshot(validateSnapshot(snapshot, id, width));
}

async function rendererDependencies(root) {
  const sources = new Set();

  async function visit(sourcePath) {
    if (sources.has(sourcePath) || sourcePath.startsWith('src/bones/')) return;

    const source = await readFile(appPath(root, sourcePath), 'utf8');

    sources.add(sourcePath);

    const references = [...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s*["']([^"']+)["']/g),
      ...source.matchAll(/\bsrc=["']([^"']+\.css)["']/g)];

    for (const [, reference] of references) {
      if (!reference.startsWith('.') && !reference.startsWith('@/')) continue;

      const importPath = reference.startsWith('@/') ? resolve(root, reference.slice(2)) : resolve(root, dirname(sourcePath), reference);
      const candidates = extname(importPath) ? [importPath] : [`${importPath}.ts`, `${importPath}.vue`, `${importPath}.css`, resolve(importPath, 'index.ts')];

      for (const candidate of candidates) {
        if (!await readOptional(candidate)) continue;

        await visit(relative(root, candidate));

        break;
      }
    }
  }

  await visit('src/components/ui/BoneyardPageSkeleton.vue');
  await visit('src/boneyard/capture.ts');

  return [...sources];
}

async function sourceFingerprint(root, section) {
  const directory = resolve(root, 'src/boneyard/sections');
  const catalogPaths = (await readdir(directory)).filter((name) => name.endsWith('.ts')).map((name) => `src/boneyard/sections/${name}`);
  const sources = [...new Set([
    ...section.sourcePaths,
    ...catalogPaths,
    ...await rendererDependencies(root),
    'src/styles.css',
    'src/styles/forms.css',
    'lib/design-system.ts',
    'tailwind.config.ts',
    'postcss.config.mjs',
    'src/boneyard/capture.ts',
    'src/main.ts',
    'tools/capture-boneyard.mjs',
    'tools/rebuild-boneyard-registry.mjs',
    'tools/boneyard.vite.config.ts',
    'package.json',
    'pnpm-lock.yaml',
  ])].sort();
  const parts = [JSON.stringify(section), JSON.stringify(breakpoints)];

  for (const source of sources) parts.push(source, await readFile(appPath(root, source)));

  const main = await readFile(resolve(root, 'src/main.ts'), 'utf8');
  const require = createRequire(resolve(root, 'package.json'));
  const fontImports = [...main.matchAll(/import\s+["'](@fontsource[^"']+\.css)["']/g)].map((match) => match[1]);

  for (const fontImport of fontImports) {
    const cssPath = require.resolve(fontImport);
    const css = await readFile(cssPath, 'utf8');

    parts.push(fontImport, css);

    for (const [, fontFile] of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) {
      if (!fontFile.startsWith('data:')) parts.push(fontFile, await readFile(resolve(dirname(cssPath), fontFile)));
    }
  }

  return { inputFingerprint: hashBytes(Buffer.concat(parts.map((part) => Buffer.isBuffer(part) ? part : Buffer.from(part)))), sourcePaths: sources };
}

async function assertInputsUnchanged(root, sections, allowlist, fingerprints) {
  if (JSON.stringify(await loadCatalog(root)) !== JSON.stringify(sections)) {
    throw new Error('The Boneyard catalog changed during capture; no completion metadata was promoted.');
  }

  for (const section of sections.filter(({ id }) => allowlist.includes(id))) {
    const current = await sourceFingerprint(root, section);

    if (current.inputFingerprint !== fingerprints.get(section.id).inputFingerprint) {
      throw new Error(`Capture inputs changed for ${section.id}; retry after the source edits are finished.`);
    }
  }
}

async function preservedArtifacts(root, manifest, allowlist) {
  const preserved = new Map();

  for (const [id, section] of Object.entries(manifest.sections)) {
    if (section.status !== 'completed' || allowlist.includes(id)) continue;

    const artifact = artifactForSection(id, section);
    const bytes = await readOptional(appPath(root, artifact));

    if (!bytes || hashBytes(bytes) !== section.artifactHashes[artifact]) {
      throw new Error(`Completed artifact ${id} needs an explicit repair; it was not added to the capture allowlist.`);
    }

    preserved.set(artifact, hashBytes(bytes));
  }

  return preserved;
}

async function assertPreserved(root, preserved) {
  for (const [artifact, expectedHash] of preserved) {
    const bytes = await readOptional(appPath(root, artifact));

    if (!bytes || hashBytes(bytes) !== expectedHash) throw new Error(`Preservation check failed for ${artifact}.`);
  }
}

export async function recoverTransaction(root) {
  const bytes = await readOptional(resolve(root, journalFile));

  if (!bytes) return;

  const journal = JSON.parse(bytes.toString());

  if (journal.version !== 1 || !Array.isArray(journal.entries) || !/^\.auto-skeleton\/staging-[a-z0-9-]+$/.test(journal.staging)) {
    throw new Error('Unknown Boneyard promotion journal; preserving it for inspection.');
  }

  for (const entry of journal.entries) {
    appPath(root, entry.target);
    appPath(root, entry.staged);

    if (entry.backup) appPath(root, entry.backup);

    if (![manifestFile, registryFile].includes(entry.target) && !/^src\/bones\/[a-z0-9-]+\.bones\.json$/.test(entry.target)) {
      throw new Error('Unexpected target in Boneyard promotion journal.');
    }
  }

  const states = await Promise.all(journal.entries.map(async (entry) => {
    const contents = await readOptional(appPath(root, entry.target));

    return contents ? hashBytes(contents) : null;
  }));
  const committed = journal.entries.every((entry, index) => states[index] === entry.afterHash);

  if (!committed) {
    for (let index = journal.entries.length - 1; index >= 0; index -= 1) {
      const entry = journal.entries[index];
      const currentHash = states[index];

      if (currentHash === entry.beforeHash) continue;

      if (currentHash !== entry.afterHash) {
        throw new Error(`Boneyard recovery found an outside edit to ${entry.target}; preserving the journal and backups.`);
      }

      if (entry.backup) {
        const backup = await readFile(appPath(root, entry.backup));

        if (hashBytes(backup) !== entry.beforeHash) throw new Error(`Boneyard backup failed validation for ${entry.target}.`);

        await writeAtomically(appPath(root, entry.target), backup);
      } else {
        await unlink(appPath(root, entry.target));
      }
    }
  }

  await rm(appPath(root, journal.staging), { recursive: true, force: true });
  await unlink(resolve(root, journalFile));
}

export async function promoteTransaction(root, staging, writes, beforeManifest = async () => {}) {
  const entries = [];

  for (let index = 0; index < writes.length; index += 1) {
    const write = writes[index];
    const original = await readOptional(appPath(root, write.target));
    const staged = `${staging}/write-${index}`;
    const backup = original ? `${staging}/backup-${index}` : null;

    await writeAtomically(appPath(root, staged), write.contents);

    if (backup) await writeAtomically(appPath(root, backup), original);

    entries.push({ target: write.target, staged, backup, beforeHash: original ? hashBytes(original) : null, afterHash: hashBytes(write.contents) });
  }

  const journal = { version: 1, staging, entries };

  await writeAtomically(resolve(root, journalFile), `${JSON.stringify(journal, null, 2)}\n`);

  try {
    for (const entry of entries) {
      if (entry.target === manifestFile) await beforeManifest();

      const current = await readOptional(appPath(root, entry.target));

      if ((current ? hashBytes(current) : null) !== entry.beforeHash) {
        throw new Error(`Boneyard promotion found an outside edit to ${entry.target}.`);
      }

      await writeAtomically(appPath(root, entry.target), await readFile(appPath(root, entry.staged)));
    }

    await recoverTransaction(root);
  } catch (error) {
    await recoverTransaction(root);

    throw error;
  }
}

async function waitForSettledFixture(page, id) {
  await page.waitForFunction((sectionId) => {
    const regions = document.querySelectorAll('[data-loading-section]');
    const wrappers = document.querySelectorAll('[data-boneyard]');

    return regions.length === 1 && regions[0].getAttribute('data-loading-section') === sectionId
      && wrappers.length === 1 && wrappers[0].getAttribute('data-boneyard') === sectionId;
  }, id);
  await page.evaluate(async (sectionId) => {
    async function assetReady(promise, label) {
      let timer;

      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}.`)), 5000); }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }

    const images = [...document.images];

    // Real fixtures can include lazy avatars below the bounded visible region.
    // Eager loading changes readiness only; their measured geometry is preserved.
    for (const image of images) image.loading = 'eager';

    const requiredFonts = [
      '600 16px "Bricolage Grotesque Variable"',
      '700 16px "Bricolage Grotesque Variable"',
      '400 16px "Source Sans 3 Variable"',
      '600 16px "Source Sans 3 Variable"',
      '700 16px "Source Sans 3 Variable"',
      '800 16px "Source Sans 3 Variable"',
      'italic 400 16px "Source Sans 3 Variable"',
    ];
    const loadedFonts = await assetReady(Promise.all(requiredFonts.map((font) => document.fonts.load(font, 'DevCongress'))), 'required fixture font faces');

    if (loadedFonts.some((faces) => !faces.length)) throw new Error('A required fixture font face is unavailable.');

    await assetReady(document.fonts.ready, 'fixture fonts');
    await Promise.all(images.map(async (image, index) => {
      const label = `fixture image ${index + 1}`;

      await assetReady(image.complete ? Promise.resolve() : new Promise((resolveImage, rejectImage) => {
        image.addEventListener('load', resolveImage, { once: true });
        image.addEventListener('error', () => rejectImage(new Error(`Failed to load ${label}.`)), { once: true });
      }), label);

      if (image.naturalWidth <= 0) throw new Error(`Failed to load ${label}.`);

      await assetReady(image.decode(), `${label} decoding`);
    }));

    const wrapper = document.querySelector(`[data-boneyard="${sectionId}"]`);
    let previous;
    let stableFrames = 0;

    for (let frame = 0; frame < 120; frame += 1) {
      await new Promise(requestAnimationFrame);

      const bounds = wrapper.firstElementChild.getBoundingClientRect();
      const current = [bounds.x, bounds.y, bounds.width, bounds.height].map((value) => Math.round(value * 100) / 100).join(',');

      stableFrames = current === previous ? stableFrames + 1 : 0;
      previous = current;

      if (stableFrames >= 3 && bounds.width > 0 && bounds.height > 0) return;
    }

    throw new Error(`Unstable Boneyard fixture bounds: ${sectionId}`);
  }, id);
}

export async function openFixture(page, captureUrl, id, width, build = false) {
  let rejectFailure;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  const onPageError = (error) => rejectFailure(new Error(`Browser module error: ${error.stack ?? error.message}`));
  const onResponse = (response) => {
    if (response.status() >= 400 && ['script', 'stylesheet'].includes(response.request().resourceType())) {
      rejectFailure(new Error(`Fixture dependency returned HTTP ${response.status()}: ${response.url()}`));
    }
  };
  const onRequestFailed = (request) => {
    if (['script', 'stylesheet'].includes(request.resourceType())) {
      rejectFailure(new Error(`Fixture dependency failed: ${request.url()} (${request.failure()?.errorText})`));
    }
  };

  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);

  try {
    await withinDeadline(Promise.race([
      (async () => {
        const response = await page.goto(`${captureUrl}?section=${id}`, { waitUntil: 'domcontentloaded' });

        if (!response?.ok()) throw new Error(`Fixture document returned HTTP ${response?.status()}.`);

        if (build) {
          await page.waitForFunction(() => typeof window.__BONEYARD_SNAPSHOT === 'function', undefined, { timeout: 10000 });
        }

        await waitForSettledFixture(page, id);
      })(),
      failure,
    ]), `Fixture ${id} at ${width}px exceeded its 15 second readiness deadline.`);
  } catch (error) {
    throw new Error(`Fixture ${id} at ${width}px failed: ${error.message}`, { cause: error });
  } finally {
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
    page.off('requestfailed', onRequestFailed);
  }
}

async function withFixturePage(browser, options, verify) {
  const context = await browser.newContext(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {});

  try {
    const page = await context.newPage();

    if (options.build) await page.addInitScript(() => { window.__BONEYARD_BUILD = true; });

    return await verify(page);
  } finally {
    await context.close();
  }
}

async function verifyRuntime(browser, captureUrl, captures, allowlist) {
  for (const id of allowlist) {
    await withFixturePage(browser, {}, async (page) => {
      for (const width of breakpoints) {
        await page.setViewportSize({ width, height: 1000 });
        await openFixture(page, captureUrl, id, width);

        const dimensions = await withinDeadline(page.evaluate((sectionId) => {
          const wrapper = document.querySelector(`[data-boneyard="${sectionId}"]`);
          const content = wrapper.querySelector('[data-boneyard-content]');
          const overlay = wrapper.querySelector('[data-boneyard-overlay]');
          const bones = wrapper.querySelectorAll('[data-boneyard-bone]');

          return {
            contentHeight: content?.getBoundingClientRect().height,
            height: overlay?.getBoundingClientRect().height,
            width: overlay?.getBoundingClientRect().width,
            bones: bones.length,
          };
        }, id), `Runtime dimensions timed out for ${id} at ${width}px.`);
        const snapshot = captures[id].breakpoints[width];
        // Vue 1.9 omits capture-only surface/container bones from its overlay.
        const expectedBones = snapshot.bones.filter(bone => !(Array.isArray(bone) ? bone[5] : bone.c)).length;

        if (screenshotSections.includes(id) && [390, 1280].includes(width)) {
          await mkdir(screenshotDirectory, { recursive: true });
          await page.screenshot({ path: resolve(screenshotDirectory, `${id}-${width}.png`), fullPage: false, timeout: 15000 });
        }

        if (!expectedBones || dimensions.bones !== expectedBones || ![dimensions.height, dimensions.width, dimensions.contentHeight].every(Number.isFinite)
          || Math.abs(dimensions.height - snapshot.height) > 2 || Math.abs(dimensions.contentHeight - snapshot.height) > 2
          || Math.abs(dimensions.width - snapshot.width) > 2) {
          throw new Error(`Runtime Boneyard geometry differs from the captured fixture for ${id} at ${width}px: ${JSON.stringify(dimensions)}; captured ${snapshot.width}x${snapshot.height}, ${expectedBones} visible bones.`);
        }
      }
    });
  }
}

async function verifyPhoneViewports(browser, captureUrl, allowlist) {
  const selected = phoneSections.filter((id) => allowlist.includes(id));

  if (!selected.length) return;

  for (const id of selected) {
    await withFixturePage(browser, { reducedMotion: 'reduce' }, async (page) => {
      for (const height of phoneHeights) {
        await page.setViewportSize({ width: 390, height });
        await openFixture(page, captureUrl, id, 390);

        const result = await withinDeadline(page.evaluate((sectionId) => {
          const region = document.querySelector(`[data-loading-section="${sectionId}"]`);
          const bounds = region.getBoundingClientRect();
          const controls = [...region.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')];
          const focusable = controls.filter((element) => !element.closest('[inert]') && !element.disabled && element.tabIndex >= 0);
          const animated = [...region.querySelectorAll('[data-boneyard-bone] > div')]
            .filter((element) => getComputedStyle(element).animationName !== 'none');
          const shell = document.querySelector('.app-shell');

          return {
            bounded: region.classList.contains('ems-loading-region--bounded'),
            bottom: bounds.bottom,
            documentHeight: document.documentElement.scrollHeight,
            documentWidth: document.documentElement.scrollWidth,
            shellOverflow: shell ? Math.max(0, shell.scrollHeight - shell.clientHeight) : 0,
            focusable: focusable.length,
            animated: animated.length,
            inert: Boolean(region.querySelector('[data-loading-fixture]')?.closest('[inert]')),
          };
        }, id), `Phone viewport verification timed out for ${id} at 390x${height}.`);

        if (!result.bounded || result.bottom > height - 24 + 1 || result.documentHeight > height + 1
          || result.documentWidth > 391 || result.shellOverflow > 1 || result.focusable || result.animated || !result.inert) {
          throw new Error(`Phone loading viewport verification failed for ${id} at 390x${height}: ${JSON.stringify(result)}.`);
        }
      }
    });
  }

  console.log(`Verified ${selected.length} representative phone sections at heights ${phoneHeights.join(', ')}px with reduced motion.`);
}

async function capture(root, sections, allowlist, manifest, fingerprints, preserved, refresh) {
  const staging = `.auto-skeleton/staging-${randomUUID()}`;
  const captureUrl = 'http://127.0.0.1:4180/tools/boneyard-capture.html';
  let output = '';
  let browser;

  function startServer() {
    output = '';
    const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tools/boneyard.vite.config.ts', '--host', '127.0.0.1', '--port', '4180', '--strictPort'], { cwd: root, stdio: 'pipe' });

    child.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });
    child.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });

    return child;
  }

  let server = startServer();

  async function stopServer() {
    if (server.exitCode !== null || server.signalCode !== null) return;

    const exited = new Promise(resolveExit => server.once('exit', resolveExit));

    server.kill('SIGTERM');
    await withinDeadline(exited, 'Boneyard fixture server did not stop.', 5000);
  }

  async function waitForServer() {
    let ready = false;

    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`Boneyard fixture server exited: ${output}`);

      try {
        const response = await fetch(captureUrl);

        ready = response.ok && (await response.text()).includes('Boneyard capture fixtures');
      } catch {
        // The isolated Vite server is still starting.
      }

      if (ready) break;

      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }

    if (!ready) throw new Error(`Timed out starting the Boneyard fixture server: ${output}`);
  }

  try {
    await mkdir(appPath(root, staging), { recursive: true });
    await writeFile(appPath(root, `${staging}/allowlist.json`), `${JSON.stringify({ allowlist, refresh }, null, 2)}\n`);
    await waitForServer();

    browser = await chromium.launch({ headless: true });

    const captures = {};

    for (const id of allowlist) {
      captures[id] = { breakpoints: {} };

      await withFixturePage(browser, { build: true }, async (page) => {
        for (const width of breakpoints) {
          await page.setViewportSize({ width, height: 1000 });
          await openFixture(page, captureUrl, id, width, true);

          captures[id].breakpoints[width] = await snapshotFixture(page, id, width);
        }
      });

      console.log(`Captured ${id} at ${breakpoints.length} viewport widths.`);
    }

    await assertInputsUnchanged(root, sections, allowlist, fingerprints);
    await assertPreserved(root, preserved);
    await mkdir(resolve(root, 'src/bones'), { recursive: true });

    const nextManifest = { ...manifest, schemaVersion: 1, framework: 'vue', boneyardVersion: '1.9.0', registryPath: registryFile, sections: { ...manifest.sections } };
    const writes = [];

    for (const id of allowlist) {
      const section = sections.find((entry) => entry.id === id);
      const artifact = `src/bones/${id}.bones.json`;
      const contents = `${JSON.stringify(captures[id], null, 2)}\n`;

      writes.push({ target: artifact, contents });
      nextManifest.sections[id] = {
        status: 'completed', ...fingerprints.get(id), route: section.route, fixture: id,
        artifactPaths: [artifact], artifactHashes: { [artifact]: hashBytes(contents) },
        captureConfig: { breakpoints, viewportHeight: 1000, fixture: id, layout: section.capture, generatorVersion: 'boneyard-js@1.9.0', fonts: 'src/main.ts',
          ...(phoneSections.includes(id) ? { phoneViewportHeights: phoneHeights, phoneViewportWidth: 390 } : {}) },
        verification: `Isolated fixture and runtime loading overlay verified at ${breakpoints.join(', ')}px after fonts, images, and bounds settled; natural height matched without vertical scaling at the captured 1000px viewport height.`,
      };
    }

    const registry = (await readOptional(resolve(root, registryFile)))?.toString() ?? '';
    const entries = Object.entries(nextManifest.sections).filter(([, section]) => section.status === 'completed')
      .map(([id, section]) => [id, artifactForSection(id, section).slice('src/bones/'.length)]);

    writes.push({ target: registryFile, contents: mergeRegistry(registry, entries) });
    writes.push({ target: manifestFile, contents: `${JSON.stringify(nextManifest, null, 2)}\n` });

    await promoteTransaction(root, staging, writes, async () => {
      // HMR is disabled during capture. Verify promoted files from a cold module
      // graph rather than an already transformed, cached JSON registration.
      await stopServer();
      server = startServer();
      await waitForServer();
      await verifyRuntime(browser, captureUrl, captures, allowlist);
      await verifyPhoneViewports(browser, captureUrl, allowlist);
      await assertInputsUnchanged(root, sections, allowlist, fingerprints);
      await assertPreserved(root, preserved);
    });
    await assertPreserved(root, preserved);

    console.log(`Completed ${allowlist.length} Boneyard sections; preserved ${preserved.size} existing artifacts.`);
  } finally {
    await browser?.close();
    await stopServer();

    if (!(await readOptional(resolve(root, journalFile)))) await rm(appPath(root, staging), { recursive: true, force: true });
  }
}

export async function main(root, args = process.argv.slice(2)) {
  const sections = await loadCatalog(root);
  const knownIds = new Set(sections.map((section) => section.id));
  const refresh = args.includes('--refresh');
  const requested = args.includes('--all') ? [...knownIds] : [...new Set(args.filter((argument) => argument !== '--refresh'))];

  if (!requested.length || requested.some((id) => !knownIds.has(id)) || args.some((arg) => arg.startsWith('--') && !['--all', '--refresh'].includes(arg))) {
    throw new Error('Pass known Boneyard section IDs, or --all. Use --refresh only to deliberately replace the requested completed captures.');
  }

  let manifest = await readManifest(root);
  let lock;

  async function acquireLock() {
    if (lock) return;

    await mkdir(resolve(root, '.auto-skeleton'), { recursive: true });

    try {
      lock = await open(resolve(root, '.auto-skeleton/capture.lock'), 'wx');
      await lock.writeFile(`${JSON.stringify({ pid: process.pid })}\n`);
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('Another Boneyard capture owns .auto-skeleton/capture.lock; no files were changed.');

      throw error;
    }
  }

  try {
    if (await readOptional(resolve(root, journalFile))) {
      await acquireLock();
      await recoverTransaction(root);
      manifest = await readManifest(root);
    }

    let allowlist = requested.filter((id) => refresh || !terminalStatuses.has(manifest.sections[id]?.status));
    const fingerprints = new Map();

    for (const section of sections.filter(({ id }) => requested.includes(id))) fingerprints.set(section.id, await sourceFingerprint(root, section));

    const stale = requested.filter((id) => terminalStatuses.has(manifest.sections[id]?.status)
      && manifest.sections[id].inputFingerprint !== fingerprints.get(id).inputFingerprint);
    let preserved = await preservedArtifacts(root, manifest, allowlist);

    if (!allowlist.length) {
      console.log(`All ${requested.length} requested Boneyard sections are complete; no captures or file changes.${stale.length ? ` ${stale.length} completed sections may be stale; explicit refresh is required.` : ''}`);

      return;
    }

    await acquireLock();

    // Reconcile under the lock: another capture may have completed after the
    // initial read-only inventory and before this attempt acquired ownership.
    await recoverTransaction(root);

    const latestManifest = await readManifest(root);

    if (JSON.stringify(latestManifest) !== JSON.stringify(manifest)) {
      manifest = latestManifest;
      allowlist = requested.filter((id) => refresh || !terminalStatuses.has(manifest.sections[id]?.status));
      preserved = await preservedArtifacts(root, manifest, allowlist);

      if (!allowlist.length) {
        console.log('The requested captures completed before lock acquisition; no captures or artifact changes.');

        return;
      }
    }

    for (const id of allowlist) {
      if (!manifest.sections[id] && await readOptional(resolve(root, `src/bones/${id}.bones.json`))) {
        throw new Error(`Unrecorded artifact exists for ${id}; reconcile or adopt it before capturing.`);
      }
    }

    await capture(root, sections, allowlist, manifest, fingerprints, preserved, refresh);
  } finally {
    if (lock) {
      await lock.close();
      await unlink(resolve(root, '.auto-skeleton/capture.lock'));
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.cwd());
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
