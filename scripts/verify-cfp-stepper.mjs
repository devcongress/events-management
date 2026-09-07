// Run against the local dev server: node scripts/verify-cfp-stepper.mjs
// Fixtures isolate the UI: no proposal or email is sent.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let posts = 0;
    await page.route('**/api/**', async (route) => {
      if (route.request().method() === 'POST') {
        posts += 1;
        return route.abort();
      }
      return route.fulfill({ json: { id: 'cfp-ui-fixture', name: 'DevCongress Annual Conference', event_date: '2026-12-19', status: 'cfp_open' } });
    });
    await page.goto('http://localhost:5173/speak/c/2026');
    const heading = (name) => page.getByRole('heading', { name, exact: true });
    const next = page.getByRole('button', { name: 'Continue' });
    await heading('About you').waitFor();
    assert.equal(await heading('Your session').isVisible(), false);
    await next.click();
    assert.match(await page.getByRole('alert').innerText(), /valid email/);
    await page.getByLabel('Your Name').fill('UI Test Speaker');
    await page.getByLabel('Email Address').fill('speaker@example.com');
    await page.getByLabel('Speaker bio').fill('A developer who enjoys teaching.');
    await page.getByLabel('Email Address').press('Enter');
    await heading('Your session').waitFor();
    assert.equal(await heading('About you').isVisible(), false);
    await next.click();
    assert.match(await page.getByRole('alert').innerText(), /topic track/);
    await page.getByLabel('Talk Title').fill('Building useful developer tools');
    await page.getByRole('button', { name: 'Topic track * Choose one track' }).click();
    await page.getByRole('option', { name: 'Open Source & Developer Community', exact: true }).click();
    await page.getByRole('button', { name: 'Session type * Choose one session type' }).click();
    await page.getByRole('option', { name: '25-minute short talk', exact: true }).click();
    await page.getByLabel('Abstract', { exact: false }).fill('word '.repeat(251));
    await next.click();
    assert.equal(await heading('Your session').isVisible(), true);
    await page.getByLabel('Abstract', { exact: false }).fill('Learn to build useful tools and evaluate their impact.');
    await next.click();
    await heading('Attendee takeaways').waitFor();
    assert.equal(await page.getByRole('button', { name: /Remove learning outcome/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'SUBMIT PROPOSAL', exact: true }).isEnabled(), false);
    await page.getByLabel('Learning outcome 1', { exact: true }).fill('Identify a practical developer problem.');
    for (const index of [2, 3]) {
      await page.getByRole('button', { name: 'Add another outcome' }).click();
      await page.getByLabel(`Learning outcome ${index}`, { exact: true }).fill(`Apply technique ${index}.`);
    }
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await page.getByLabel('Talk Title').inputValue(), 'Building useful developer tools');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    assert.equal(await page.getByLabel('Your Name').inputValue(), 'UI Test Speaker');
    await next.click();
    await next.click();
    assert.equal(await page.getByLabel('Learning outcome 3', { exact: true }).inputValue(), 'Apply technique 3.');
    await page.getByLabel('Learning outcome 3', { exact: true }).fill('   ');
    assert.equal(await page.getByRole('button', { name: 'SUBMIT PROPOSAL', exact: true }).isEnabled(), false);
    await page.screenshot({ path: `/tmp/speaker-outcomes-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1280, height: 1000 });
    assert.equal(await heading('About you').isVisible(), false);
    assert.equal(await heading('Your session').isVisible(), false);
    assert.equal(await heading('Attendee takeaways').isVisible(), true);
    assert.equal(await next.isVisible(), false);
    await page.setViewportSize({ width, height: 844 });
    await heading('About you').waitFor({ state: 'hidden' });
    assert.equal(await heading('Attendee takeaways').isVisible(), true);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.screenshot({ path: `/tmp/cfp-stepper-${width}.png`, fullPage: true });
    assert.equal(posts, 0, 'Step navigation must never submit a proposal');
    assert.deepEqual(errors, []);
    // Monthly CFP remains a single page with normal browser validation.
    await page.goto('http://localhost:5173/speak/m/ui-test');
    await page.getByLabel('Your Name').waitFor();
    assert.equal(await page.getByLabel('Talk Title').isVisible(), true);
    assert.equal(await page.getByLabel('Abstract', { exact: false }).isVisible(), true);
    assert.equal(await next.isVisible(), false);
    assert.equal(await page.locator('form').getAttribute('novalidate'), null);
    await page.close();
    console.log(`PASS ${width}px: validation, Enter, back/forward, values, overflow, responsive layout, no submissions`);
  }
} finally {
  await browser.close();
}
