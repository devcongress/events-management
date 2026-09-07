// Local-only rendered component checks; never submits an API request.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';

// A separate test-only server avoids registering a fixture route in the app.
const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-form-tests', plugins: [vue()], resolve: { alias: { '@': process.cwd() } }, server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', route => route.request().method() === 'GET' ? route.fulfill({ json: [] }) : route.abort());
    await page.goto(`${server.resolvedUrls.local[0]}scripts/fixtures/forms-preview.html`);
    await page.getByLabel('Name', { exact: true }).waitFor();
    const controls = [page.getByLabel('Name', { exact: true }), page.getByLabel('Legacy field'), page.getByRole('button', { name: /^Topic / }), page.getByRole('button', { name: 'Interests' }), page.getByRole('button', { name: 'Deadline' })];
    const styles = [];
    for (const control of controls) styles.push(await control.evaluate(el => { const s = getComputedStyle(el); return { height: el.getBoundingClientRect().height, border: s.borderWidth, radius: s.borderRadius, font: s.fontSize }; }));
    for (const style of styles) assert.deepEqual(style, styles[0]);
    assert.equal(styles[0].height, 50);
    await controls[0].focus();
    const fieldFocus = await controls[0].evaluate(el => getComputedStyle(el).boxShadow);
    await controls[2].click();
    assert.equal(await controls[2].evaluate(el => getComputedStyle(el).boxShadow), fieldFocus);
    const menu = page.getByRole('listbox');
    const bounds = await menu.boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.getByRole('option', { name: 'Open Source & Developer Community', exact: true }).click();
    await controls[2].press('ArrowDown');
    await page.getByRole('option', { name: 'Open Source & Developer Community', exact: true }).press('End');
    await page.getByRole('option', { name: 'Tech Education', exact: true }).press('Enter');
    await controls[2].press('ArrowDown');
    await page.keyboard.press('Tab');
    assert.equal(await controls[3].evaluate(el => el === document.activeElement), true, 'Portal Tab should reach next field');
    await controls[2].press('ArrowDown');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await controls[1].evaluate(el => el === document.activeElement), true, 'Portal Shift+Tab should reach previous field');
    await controls[4].click();
    const hour = page.getByRole('textbox', { name: 'Hour, 00 to 23' });
    assert.equal((await hour.boundingBox()).height, 36);
    await hour.press('Escape');
    assert.equal((await page.getByLabel('Consent').boundingBox()).width < 30, true);
    for (const textarea of await page.locator('textarea').all()) {
      assert.equal(await textarea.evaluate(el => getComputedStyle(el).resize), 'none');
      assert.equal(await textarea.evaluate(el => getComputedStyle(el).overflowY), 'auto');
    }
    assert.equal((await page.getByRole('button', { name: 'Compact filter' }).boundingBox()).height < 50, true);
    const outcomeAdd = page.getByRole('button', { name: 'Add another outcome' });
    const outcomeAddBounds = await outcomeAdd.boundingBox();
    const firstOutcomeBounds = await page.getByLabel('Learning outcome 1', { exact: true }).boundingBox();
    assert(outcomeAddBounds.y < firstOutcomeBounds.y, 'Add outcome belongs in the section header');
    assert(outcomeAddBounds.x + outcomeAddBounds.width <= width, 'Add outcome stays within the viewport');
    await page.getByLabel('Learning outcome 1', { exact: true }).fill('First outcome');
    await page.getByRole('button', { name: 'Add another outcome' }).click();
    await page.getByLabel('Learning outcome 2', { exact: true }).fill('Second outcome');
    await page.getByRole('button', { name: 'Add another outcome' }).click();
    await page.getByLabel('Learning outcome 3', { exact: true }).fill('Third outcome');
    const removedId = await page.getByLabel('Learning outcome 2', { exact: true }).getAttribute('id');
    await page.getByRole('button', { name: 'Remove learning outcome 2', exact: true }).click();
    await page.locator(`[id="${removedId}"]`).waitFor({ state: 'detached' });
    assert.equal(await page.getByLabel('Learning outcome 2', { exact: true }).inputValue(), 'Third outcome');
    assert.equal(await page.getByLabel('Learning outcome 2', { exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Remove learning outcome 2', exact: true }).click();
    assert.equal(await page.getByLabel('Learning outcome 1', { exact: true }).inputValue(), 'First outcome');
    assert.equal(await page.getByRole('button', { name: /Remove learning outcome/ }).count(), 0);
    assert.equal(await page.getByLabel('Learning outcome 1', { exact: true }).evaluate(el => el === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `/tmp/shared-forms-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Open task drawer', exact: true }).click();
    const workstream = page.getByRole('button', { name: 'Workstream', exact: false });
    await workstream.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'option');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await workstream.evaluate(el => el === document.activeElement), true);
    await workstream.press('ArrowDown');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').isVisible(), true);
    await workstream.press('ArrowDown');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('button', { name: /^Phase / }).evaluate(el => el === document.activeElement), true, 'Inline Tab should reach next field');
    await workstream.press('ArrowDown');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.getByPlaceholder('What needs to be completed?').evaluate(el => el === document.activeElement), true, 'Inline Shift+Tab should reach task title');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${width}px: matching control geometry/focus, viewport clamp, date internals, compact filters, outcome identity/focus, no overflow`);
  }
} finally { await browser.close(); await server.close(); }
