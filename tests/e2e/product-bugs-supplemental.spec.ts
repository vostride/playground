import { expect, test, type Page } from '@playwright/test';

async function enableBug(page: Page, id: string, label: string) {
  await page.getByRole('button', { name: 'Test controls', exact: true }).click();
  await page.getByRole('combobox', { name: 'Active bug', exact: true }).selectOption(id);
  await expect(page).toHaveURL(new RegExp(`[?&]bug=${id}(?:&|#|$)`));
  await expect(page.getByText(`Deliberate bug enabled: ${label}`, { exact: false })).toBeVisible();
}

async function disableBug(page: Page) {
  await page.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]bug=/);
  await expect(page.getByRole('button', { name: 'Test controls', exact: true })).toBeVisible();
}

test('Komazon checkout-validation switch permits blank shipping only while enabled', async ({
  page,
}) => {
  await page.goto('/shop/');
  await page.getByRole('button', { name: 'Add Everyday Ceramic Mug to bag', exact: true }).click();
  await page.getByRole('button', { name: 'Shopping bag (1)', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to checkout', exact: true }).click();
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('komazon123');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();

  const continueToDelivery = page.getByRole('button', {
    name: 'Continue to delivery',
    exact: true,
  });
  const shipping = page.getByRole('heading', { name: 'Shipping address', exact: true });
  const delivery = page.getByRole('heading', { name: 'Delivery method', exact: true });
  await expect(page.getByRole('textbox', { name: 'Street address', exact: true })).toHaveValue('');
  await continueToDelivery.click();
  await expect(page.getByText('Enter a street address.', { exact: true })).toBeVisible();
  await expect(shipping).toBeVisible();
  await expect(delivery).toHaveCount(0);

  await enableBug(page, 'checkout-validation', 'Missing address validation');
  await expect(page.getByRole('textbox', { name: 'Street address', exact: true })).toHaveValue('');
  await continueToDelivery.click();
  await expect(delivery).toBeVisible();
  await expect(shipping).toHaveCount(0);

  await disableBug(page);
  await expect(shipping).toBeVisible();
  await continueToDelivery.click();
  await expect(page.getByText('Enter a street address.', { exact: true })).toBeVisible();
  await expect(delivery).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Street address', exact: true }).fill('24 Cedar Lane');
  await page.getByRole('textbox', { name: 'City', exact: true }).fill('Portland');
  await page.getByRole('textbox', { name: 'Postal code', exact: true }).fill('97205');
  await continueToDelivery.click();
  await expect(delivery).toBeVisible();
});

test('Brello move-drops-label switch clears moved labels only while enabled and undo restores them', async ({
  page,
}) => {
  await page.goto('/tasks/');
  const task = page.locator('[data-task-id="CKB-001"]');
  const labels = task.locator('.task-label');
  await expect(labels).toHaveCount(1);
  const originalLabel = (await labels.innerText()).trim();
  const backlogTask = page.locator('[aria-label="Backlog column"] [data-task-id="CKB-001"]');
  const todoTask = page.locator('[aria-label="To do column"] [data-task-id="CKB-001"]');
  const undo = page.getByRole('button', { name: 'Undo last change', exact: true });
  async function moveRight() {
    await task.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(todoTask).toBeVisible();
  }

  await expect(backlogTask).toBeVisible();
  await moveRight();
  await expect(labels).toHaveText([originalLabel]);
  await undo.click();
  await expect(backlogTask).toBeVisible();

  await enableBug(page, 'move-drops-label', 'Moving removes labels');
  await expect(labels).toHaveText([originalLabel]);
  await moveRight();
  await expect(labels).toHaveCount(0);
  await undo.click();
  await expect(backlogTask).toBeVisible();
  await expect(labels).toHaveText([originalLabel]);

  await disableBug(page);
  await moveRight();
  await expect(labels).toHaveText([originalLabel]);
});

test('Brello filter-ignores-assignee switch reveals an unassigned task only while enabled', async ({
  page,
}) => {
  await page.goto('/tasks/');
  const unassignedTask = page.locator('[data-task-id="CKB-001"]');
  await expect(unassignedTask).toBeVisible();
  await expect(unassignedTask.locator('.avatar')).toHaveCount(0);
  async function filterMaya() {
    await page.getByRole('button', { name: 'Filter', exact: true }).click();
    await page.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption('maya');
    await expect(page.getByRole('combobox', { name: 'Assignee', exact: true })).toHaveValue('maya');
  }
  const cards = page.locator('.task-card');
  await filterMaya();
  await expect(unassignedTask).toHaveCount(0);
  await expect(cards.first()).toBeVisible();
  const matchingCount = await cards.count();
  await expect(cards.filter({ has: page.locator('.avatar[aria-label="Maya Chen"]') })).toHaveCount(
    matchingCount,
  );

  await enableBug(page, 'filter-ignores-assignee', 'Assignee filter is ignored');
  await filterMaya();
  await expect(unassignedTask).toBeVisible();
  await expect(unassignedTask.locator('.avatar')).toHaveCount(0);
  expect(await cards.count()).toBeGreaterThan(matchingCount);

  await disableBug(page);
  await filterMaya();
  await expect(unassignedTask).toHaveCount(0);
  await expect(cards).toHaveCount(matchingCount);
  await expect(cards.filter({ has: page.locator('.avatar[aria-label="Maya Chen"]') })).toHaveCount(
    matchingCount,
  );
});

test('PepaPog log-filter switch ignores status but preserves service, then recovers', async ({
  page,
}) => {
  await page.goto('/observability/#logs');
  await page
    .getByRole('textbox', { name: 'Log search query', exact: true })
    .fill('service:checkout status:error');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const errorFacet = page
    .locator('.facet-option')
    .filter({ has: page.locator('.level-dot.error') })
    .getByRole('checkbox');
  await errorFacet.check();
  const rows = page.locator('.log-row');
  async function expectOnlyCheckoutErrors() {
    await expect(rows.first()).toBeVisible();
    await expect(rows.locator('.log-level').filter({ hasNotText: /^error$/ })).toHaveCount(0);
    await expect(rows.locator('.log-service').filter({ hasNotText: /^checkout$/ })).toHaveCount(0);
  }
  await expectOnlyCheckoutErrors();
  const normalCount = Number(
    await page.getByRole('table', { name: 'Log events' }).getAttribute('aria-rowcount'),
  );

  await enableBug(page, 'log-filter', 'Broken log status filter');
  await expect(page.getByRole('textbox', { name: 'Log search query', exact: true })).toHaveValue(
    'service:checkout status:error',
  );
  await expect(errorFacet).toBeChecked();
  await expect(rows.locator('.log-level:not(.error)').first()).toBeVisible();
  await expect(rows.locator('.log-service')).toHaveText(Array(await rows.count()).fill('checkout'));
  expect(
    Number(await page.getByRole('table', { name: 'Log events' }).getAttribute('aria-rowcount')),
  ).toBeGreaterThan(normalCount);

  await disableBug(page);
  await expect(errorFacet).toBeChecked();
  await expectOnlyCheckoutErrors();
  await expect(page.getByRole('table', { name: 'Log events' })).toHaveAttribute(
    'aria-rowcount',
    String(normalCount),
  );
});

test('PepaPog alert-threshold switch inverts the saved direction and evaluation only while enabled', async ({
  page,
}) => {
  await page.goto('/observability/#monitors');
  const name = 'Supplemental checkout error-rate guard';
  await page.getByRole('button', { name: 'New monitor', exact: true }).click();
  await page.locator('#monitor-name').fill(name);
  await page.locator('#monitor-recipients').fill('oncall@example.test');
  await page
    .getByRole('combobox', { name: 'Trigger when value is', exact: true })
    .selectOption('above');
  await page.locator('#monitor-threshold').fill('2');
  await page.getByRole('checkbox', { name: 'Set a warning threshold', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Create monitor', exact: true }).click();
  const row = page
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: `Edit ${name}`, exact: true }) });
  await expect(row.getByRole('cell').nth(3)).toHaveText('> 2 %');
  await expect(row.locator('.status')).toHaveText('Healthy');

  await enableBug(page, 'alert-threshold', 'Inverted monitor threshold');
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Trigger when value is', exact: true }),
  ).toHaveValue('above');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(row.getByRole('cell').nth(3)).toHaveText('< 2 %');
  await expect(row.locator('.status')).toHaveText('Alert');

  await disableBug(page);
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Trigger when value is', exact: true }),
  ).toHaveValue('below');
  await page
    .getByRole('combobox', { name: 'Trigger when value is', exact: true })
    .selectOption('above');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(row.getByRole('cell').nth(3)).toHaveText('> 2 %');
  await expect(row.locator('.status')).toHaveText('Healthy');
});
