// Actual public routes with isolated API fixtures. No submissions are sent.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VOLUNTEER_PUBLIC_PATH } from '../lib/volunteer-intake-routes.ts';

const event = { id: 'ui-fixture', name: 'DevCongress form preview', event_date: '2026-12-19T10:00:00Z', status: 'cfp_open', location: { name: 'Accra' } };
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-public-form-tests', plugins: [vue()], resolve: { alias: { '@': process.cwd() } }, server: { host: '127.0.0.1', port: 0 } });

await server.listen();
const browser = await chromium.launch({ headless: true });

try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });

    page.setDefaultTimeout(10000);
    page.on('pageerror', error => console.error(error.message));
    await page.route('**/api/**', route => {
      if (route.request().method() !== 'GET') return route.abort();
      const url = route.request().url();

      return route.fulfill({ json: url.includes('speaker-intake')
        ? { event, link: {}, prefill: { title: 'Building tools', session_type: '60-minute workshop', learning_outcomes: ['Understand tools', 'Build a tool', 'Evaluate a tool'] } }
        : { event, available: true, campaign: { description: 'Join our community event.' } } });
    });
    for (const [name, url, selector] of [
      ['volunteer', VOLUNTEER_PUBLIC_PATH, 'input[name="name"]'],
      ['registration', '/register/ui-fixture', '#registration-name'],
      ['speaker', '/conference-speakers/2026/ui-fixture', 'input[type="url"]'],
    ]) {
      await page.goto(`${server.resolvedUrls.local[0]}${url.slice(1)}`);
      const input = page.locator(selector);

      await input.waitFor().catch(async error => { console.error(await page.locator('body').innerText());

 throw error; });
      const styles = await input.evaluate(el => { const s = getComputedStyle(el);

 return { height: el.getBoundingClientRect().height, border: s.borderWidth, radius: s.borderRadius, font: s.fontSize }; });

      assert.deepEqual(styles, { height: 50, border: '1px', radius: '8px', font: '16px' }, `${name} at ${width}px`);
      await input.focus();
      assert.match(await input.evaluate(el => getComputedStyle(el).boxShadow), /232, 17, 127/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} overflow`);
      await page.screenshot({ path: `/tmp/${name}-polish-${width}.png`, fullPage: true });
      console.log(`PASS ${name} ${width}px: actual route styles, focus, no horizontal overflow`);
    }
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
