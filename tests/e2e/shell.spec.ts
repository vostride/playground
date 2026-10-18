import { test, expect } from '@playwright/test';

test('test controls fit a landscape viewport and return keyboard focus on close', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/shop/');
  const trigger = page.getByRole('button', { name: 'Test controls', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Komazon test controls', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  await dialog.getByRole('button', { name: 'Close controls', exact: true }).click();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('static hosting preserves application assets, noindex headers and missing-page responses', async ({
  request,
}) => {
  for (const app of ['shop', 'flights', 'tasks', 'observability']) {
    const redirect = await request.get(`/${app}?bug=unknown`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(301);
    expect(redirect.headers().location).toBe(`/${app}/?bug=unknown`);
    const document = await request.get(`/${app}/`);
    expect(document.status()).toBe(200);
    expect(document.headers()['x-robots-tag']).toContain('noindex');
    const asset = (await document.text()).match(/src="([^"]+\.js)"/);
    expect(asset).not.toBeNull();
    const script = await request.get(asset![1]);
    expect(script.status()).toBe(200);
    expect(script.headers()['content-type']).toMatch(/javascript/);
    expect(await script.text()).not.toContain('<!doctype html>');
  }
  const missing = await request.get('/missing-playground-page');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['x-robots-tag']).toContain('noindex');
  expect(await missing.text()).toContain('Playground');
});

for (const [path, name] of [
  ['shop', 'Komazon'],
  ['flights', 'Looking.com'],
  ['tasks', 'Brello'],
  ['observability', 'PepaPog'],
]) {
  test(`${name} is self-contained, labelled and noindex`, async ({ page }) => {
    const external: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => {
      if (
        !r.url().startsWith('http://127.0.0.1:4173') &&
        !r.url().startsWith(process.env.PLAYGROUND_URL || 'http://127.0.0.1:4173') &&
        !r.url().startsWith('data:')
      )
        external.push(r.url());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/${path}/`);
    await expect(page).toHaveTitle(new RegExp(name));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('.pg-banner')).toContainText('Playground');
    await page.waitForTimeout(600);
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `test-results/${path}-desktop.png`, fullPage: true });
  });
  test(`${name} fits a mobile browser`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${path}/`);
    await page.waitForTimeout(400);
    const sizes = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(sizes.page).toBeLessThanOrEqual(sizes.viewport);
    await page.screenshot({ path: `test-results/${path}-mobile.png`, fullPage: true });
  });
}
