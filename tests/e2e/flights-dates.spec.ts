import { test, expect } from '@playwright/test';

test('Looking.com jumps to a distant leap year and preserves the chosen round trip dates', async ({
  page,
}) => {
  await page.goto('/flights/');
  await page.locator('.date-field .picker-button').click();
  await page.getByLabel('Calendar year', { exact: true }).fill('2032');
  await page.getByLabel('Calendar month', { exact: true }).selectOption('02');
  await page.getByRole('button', { name: 'February 29, 2032', exact: true }).click();
  await expect(page.getByRole('button', { name: 'February 28, 2032', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next month', exact: true }).click();
  await page.getByRole('button', { name: 'March 4, 2032', exact: true }).click();
  await page.locator('.date-field .picker-button').click();
  await expect(page.getByLabel('Calendar year', { exact: true })).toHaveValue('2032');
  await expect(page.getByLabel('Calendar month', { exact: true })).toHaveValue('02');
  await expect(page.getByLabel('Departure date', { exact: true })).toHaveValue('2032-02-29');
  await page.getByRole('button', { name: 'Return Mar 4', exact: true }).click();
  await expect(page.getByLabel('Calendar month', { exact: true })).toHaveValue('03');
  await expect(page.getByLabel('Return date', { exact: true })).toHaveValue('2032-03-04');
  await page
    .locator('.calendar-popover')
    .getByRole('button', { name: 'Done', exact: true })
    .click();
  await page.getByRole('button', { name: 'Search flights', exact: true }).click();
  await expect(page.locator('.flight-card')).toHaveCount(12);
  await expect(page.locator('.results-heading')).toContainText('February 29');
  await page.getByRole('button', { name: 'Select flight', exact: true }).first().click();
  await expect(page.locator('.results-heading')).toContainText('March 4');
  await expect(page.locator('.flight-card')).toHaveCount(12);
});

test('Looking.com accepts exact past dates and rejects a return before departure', async ({
  page,
}) => {
  await page.goto('/flights/');
  await page.locator('.date-field .picker-button').click();
  await page.getByLabel('Departure date', { exact: true }).fill('1980-02-29');
  await page.getByRole('button', { name: 'Use date', exact: true }).click();
  await page.getByLabel('Return date', { exact: true }).fill('1980-02-28');
  await page.getByRole('button', { name: 'Use date', exact: true }).click();
  await expect(page.locator('#calendar-date-error')).toHaveText(
    'Your return date must be on or after your departure.',
  );
  await page.getByLabel('Return date', { exact: true }).fill('1980-03-07');
  await page.getByRole('button', { name: 'Use date', exact: true }).click();
  await page.getByRole('button', { name: 'Search flights', exact: true }).click();
  await expect(page.locator('.results-heading')).toContainText('February 29');
  await expect(page.locator('.flight-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Select flight', exact: true }).first().click();
  await expect(page.locator('.results-heading')).toContainText('March 7');
});

test.describe('Looking.com calendar dates in Pacific/Apia', () => {
  test.use({ timezoneId: 'Pacific/Apia' });

  test('a locally skipped day keeps its actual calendar label and selected search date', async ({
    page,
  }) => {
    await page.goto('/flights/');
    await page.getByLabel('One way', { exact: true }).check();
    await page.locator('.date-field .picker-button').click();
    await page.getByLabel('Calendar year', { exact: true }).fill('2011');
    await page.getByLabel('Calendar month', { exact: true }).selectOption('12');
    await page.getByRole('button', { name: 'December 30, 2011', exact: true }).click();
    await page.getByRole('button', { name: 'Search flights', exact: true }).click();
    await expect(page.locator('.flight-card')).toHaveCount(12);
    await expect(page.locator('.results-heading')).toContainText('Friday, December 30, 2011');
    await expect(page.locator('.price-calendar button.selected > span')).toContainText('30');
  });
});

for (const boundary of [
  { date: '0001-01-01', selectedIndex: 0, neighborIndex: 1, nextLabel: 'January 2, 1' },
  { date: '9999-12-31', selectedIndex: 6, neighborIndex: 5, nextLabel: 'December 30, 9999' },
]) {
  test(`Looking.com has seven unique selectable prices at ${boundary.date}`, async ({ page }) => {
    await page.goto('/flights/');
    await page.getByLabel('One way', { exact: true }).check();
    await page.locator('.date-field .picker-button').click();
    await page.getByLabel('Departure date', { exact: true }).fill(boundary.date);
    await page.getByRole('button', { name: 'Use date', exact: true }).click();
    await page.getByRole('button', { name: 'Search flights', exact: true }).click();
    await expect(page.locator('.flight-card')).toHaveCount(12);
    const days = page.locator('.price-calendar button > span');
    await expect(days).toHaveCount(7);
    expect(new Set(await days.allTextContents()).size).toBe(7);
    await expect(page.locator('.price-calendar button').nth(boundary.selectedIndex)).toHaveClass(
      'selected',
    );
    const nextDateLabel = await days.nth(boundary.neighborIndex).textContent();
    await page.locator('.price-calendar button').nth(boundary.neighborIndex).click();
    await expect(page.locator('.results-heading')).toContainText(boundary.nextLabel);
    await expect(page.locator('.price-calendar button.selected > span')).toHaveText(nextDateLabel!);
  });
}
