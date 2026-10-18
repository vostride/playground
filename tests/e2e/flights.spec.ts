import { test, expect } from '@playwright/test';
test('Looking: search, filters, fare, seats, validated checkout, manage booking', async ({
  page,
}) => {
  await page.goto('/flights/');
  await page.getByRole('combobox', { name: 'From', exact: true }).fill('New');
  await page.getByRole('option').filter({ hasText: 'JFK' }).click();
  await page.getByRole('button', { name: 'Search flights', exact: true }).click();
  await expect(page.locator('.flight-card')).toHaveCount(12);
  await page.getByLabel('Nonstop only').check();
  await expect(page.locator('.flight-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Select flight', exact: true }).first().click();
  await page.getByRole('button', { name: 'Select flight', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Choose your fare' })).toBeVisible();
  await page.getByRole('button', { name: 'Choose Flex', exact: true }).click();
  await page.getByRole('button', { name: 'Continue to seats' }).click();
  await page.locator('button.seat:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Choose return seats' }).click();
  await page.locator('button.seat:not([disabled])').first().click();
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('First name', { exact: true }).fill('Alex');
  await page.getByLabel('Last name', { exact: true }).fill('Morgan');
  await page.getByLabel('Date of birth', { exact: true }).fill('1992-06-15');
  await page.getByLabel('Email address', { exact: true }).fill('alex@example.com');
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.getByRole('button', { name: 'Use sample', exact: true }).click();
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('checkbox', { name: 'I have reviewed' }).check();
  await page.getByRole('button', { name: /Confirm booking/ }).click();
  await expect(page.locator('.confirmation-page')).toBeVisible();
  await page.getByRole('button', { name: 'My trips', exact: true }).click();
  await expect(page.locator('.booking-card')).toHaveCount(2);
  await page
    .locator('.booking-card')
    .first()
    .getByRole('button', { name: 'Cancel booking', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cancel booking', exact: true })
    .click();
  await expect(page.locator('.booking-card').first().locator('.status')).toHaveText('Cancelled');
});
test('Looking occupied seats are disabled by default', async ({ page }) => {
  await page.goto('/flights/');
  await page.getByLabel('One way', { exact: true }).check();
  await page.getByRole('button', { name: 'Search flights', exact: true }).click();
  await page.getByRole('button', { name: 'Select flight', exact: true }).first().click();
  await page.getByRole('button', { name: 'Continue to seats' }).click();
  await expect(page.locator('.seat.occupied').first()).toBeDisabled();
});
test('Looking date range, traveler picker, price calendar and sorting change results', async ({
  page,
}) => {
  await page.goto('/flights/');
  await page.getByRole('button', { name: 'Nov 10 – Nov 17', exact: true }).click();
  await page.getByRole('button', { name: 'November 12, 2026', exact: true }).click();
  await page.getByRole('button', { name: 'November 19, 2026', exact: true }).click();
  await page.getByRole('button', { name: '1 adult', exact: true }).click();
  await page.getByRole('button', { name: 'Add traveler' }).click();
  await page
    .locator('.passenger-popover')
    .getByRole('button', { name: 'Done', exact: true })
    .click();
  await page.getByRole('button', { name: 'Search flights', exact: true }).click();
  await expect(page.locator('.results-heading')).toContainText('November 12');
  await expect(page.locator('.results-heading')).toContainText('2 travelers');
  await page.locator('.results-toolbar select').selectOption('cheapest');
  await expect(page.locator('.flight-card')).toHaveCount(12);
  const prices = await page.locator('.flight-price>strong').allTextContents();
  const nums = prices.map((p) => Number(p.replace(/[^0-9]/g, '')));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  await page.locator('.price-calendar button').nth(4).click();
  await expect(page.locator('.results-heading')).toContainText('November 13');
});
