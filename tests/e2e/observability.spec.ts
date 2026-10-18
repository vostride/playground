import { test, expect } from '@playwright/test';
test('PepaPog: live dashboard, log query validation, virtualization and trace waterfall', async ({
  page,
}) => {
  await page.goto('/observability/');
  await expect(page.getByRole('heading', { name: 'Production overview' })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.getByRole('link', { name: 'Log explorer', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Log events' })).toBeVisible();
  const total = Number(
    await page.getByRole('table', { name: 'Log events' }).getAttribute('aria-rowcount'),
  );
  expect(total).toBeGreaterThan(100);
  expect(await page.locator('.log-row').count()).toBeLessThan(25);
  await page.getByRole('textbox', { name: 'Log search query' }).fill('unknown:value');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Log search query' })
    .fill('service:checkout status:error');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('.log-row').first()).toContainText('checkout');
  await expect(page.locator('.log-row').first()).toContainText('error');
  await page.locator('.log-row').first().click();
  await expect(page.getByRole('dialog', { name: 'Log event' })).toBeVisible();
  await page.getByRole('button', { name: 'View trace', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Trace details' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Trace waterfall' })).toBeVisible();
  await page.locator('.waterfall-row').first().click();
  await expect(page.locator('.span-detail')).toBeVisible();
});
test('PepaPog: alert builder validates, creates, persists, pauses and deletes a monitor', async ({
  page,
}) => {
  await page.goto('/observability/#monitors');
  await page.getByRole('button', { name: 'New monitor', exact: true }).click();
  await page.getByRole('button', { name: 'Create monitor', exact: true }).click();
  await expect(page.locator('#error-name')).toBeVisible();
  await page.locator('#monitor-name').fill('Checkout latency above budget');
  await page.locator('#monitor-recipients').fill('oncall@example.test');
  await page.getByRole('button', { name: 'Create monitor', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Checkout latency above budget/ }).first(),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Pause Checkout latency above budget', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Resume Checkout latency above budget', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Delete Checkout latency above budget', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete monitor', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Resume Checkout latency above budget', exact: true }),
  ).toHaveCount(0);
});
test('PepaPog time range, simulated updates, facets and log scrolling respond', async ({ page }) => {
  await page.clock.install();
  await page.goto('/observability/');
  await page.clock.runFor(500);
  const metric = page.locator('.stat-value').first();
  const before = await metric.textContent();
  await page.clock.runFor(5000);
  await expect(metric).not.toHaveText(before!);
  await page.getByRole('button', { name: 'Live', exact: true }).click();
  const paused = await metric.textContent();
  await page.clock.runFor(5000);
  await expect(metric).toHaveText(paused!);
  await page.getByRole('link', { name: 'Log explorer', exact: true }).click();
  const hourCount = Number(
    await page.getByRole('table', { name: 'Log events' }).getAttribute('aria-rowcount'),
  );
  await page.getByRole('button', { name: 'Past 1 hour', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Past 24 hours', exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByRole('table', { name: 'Log events' }).getAttribute('aria-rowcount')),
    )
    .toBeGreaterThan(hourCount);
  await page.locator('.virtual-logs').evaluate((el) => (el.scrollTop = 2000));
  await expect(page.locator('.log-row').first()).not.toHaveAttribute('aria-rowindex', '1');
  await page.locator('.facet-option').filter({ hasText: 'checkout' }).getByRole('checkbox').check();
  await expect(page.locator('.log-row').first()).toContainText('checkout');
});
