import { expect, test } from '@playwright/test';

test('PepaPog monitor errors follow current values and dependent conditions after submission', async ({
  page,
}) => {
  await page.goto('/observability/#monitors');
  await page.getByRole('button', { name: 'New monitor', exact: true }).click();
  const threshold = page.locator('#monitor-threshold');
  const warning = page.locator('#monitor-warningThreshold');
  const operator = page.locator('#monitor-operator');
  const warningEnabled = page.getByRole('checkbox', { name: 'Set a warning threshold' });
  const thresholdError = page.locator('#error-threshold');
  const warningError = page.locator('#error-warningThreshold');
  const nameError = page.locator('#error-name');
  const recipientError = page.locator('#error-recipients');

  await threshold.fill('0');
  await expect(page.locator('.field-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create monitor', exact: true }).click();
  await expect(thresholdError).toHaveText('Enter a threshold greater than 0 and at most 100.');
  await expect(warningError).toHaveText('Warning must be below the alert threshold.');
  await expect(nameError).toBeVisible();
  await expect(recipientError).toBeVisible();

  await threshold.fill('2');
  await expect(thresholdError).toHaveCount(0);
  await expect(warningError).toHaveCount(0);
  await expect(nameError).toBeVisible();
  await expect(recipientError).toBeVisible();

  await operator.selectOption('below');
  await expect(warningError).toHaveText('Warning must be above the alert threshold.');
  await warningEnabled.uncheck();
  await expect(warningError).toHaveCount(0);
  await warningEnabled.check();
  await expect(warningError).toHaveText('Warning must be above the alert threshold.');
  await warning.fill('3');
  await expect(warningError).toHaveCount(0);

  await page
    .getByRole('button', { name: 'P95 latency 95th percentile response time', exact: true })
    .click();
  await expect(threshold).toHaveValue('300');
  await expect(warning).toHaveValue('250');
  await expect(warningError).toHaveText('Warning must be above the alert threshold.');
  await operator.selectOption('above');
  await expect(warningError).toHaveCount(0);
  await threshold.fill('0');
  await expect(thresholdError).toBeVisible();
  await expect(warningError).toBeVisible();
  await page.getByRole('button', { name: /Error rate.*Failed requests/ }).click();
  await expect(threshold).toHaveValue('2');
  await expect(warning).toHaveValue('1');
  await expect(thresholdError).toHaveCount(0);
  await expect(warningError).toHaveCount(0);

  await page.locator('#monitor-name').fill('A');
  await expect(nameError).toBeVisible();
  await page.locator('#monitor-name').fill('Current draft validation');
  await expect(nameError).toHaveCount(0);
  await page.locator('#monitor-recipients').fill('invalid');
  await expect(recipientError).toBeVisible();
  await page.locator('#monitor-recipients').fill('oncall@example.test');
  await expect(page.locator('.field-error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create monitor', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Pause Current draft validation', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New monitor', exact: true }).click();
  await threshold.fill('0');
  await expect(page.locator('.field-error')).toHaveCount(0);
});
