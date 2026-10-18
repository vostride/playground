import { test, expect, type Page } from '@playwright/test';
async function signIn(page: Page) {
  await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('alex@example.com');
  await page.getByLabel('Password', { exact: true }).fill('fernwood123');
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function addMugs(page: Page) {
  await page.goto('/shop/');
  await page.getByRole('button', { name: 'Add Everyday Ceramic Mug to bag', exact: true }).click();
  await page.getByRole('button', { name: 'Shopping bag (1)' }).click();
  await page
    .getByRole('button', { name: 'Increase Everyday Ceramic Mug quantity', exact: true })
    .click();
}
async function fillShipping(page: Page) {
  await page.getByRole('textbox', { name: 'Street address' }).fill('24 Cedar Lane');
  await page.getByRole('textbox', { name: 'City', exact: true }).fill('Portland');
  await page.getByRole('textbox', { name: 'Postal code' }).fill('97205');
}
test('Fernwood released shopping flow: sign in, quantity, validated checkout, order and cancellation', async ({
  page,
}) => {
  await addMugs(page);
  await expect(page.locator('.order-summary .total')).toContainText('$53.00');
  await page.getByRole('button', { name: 'Continue to checkout' }).click();
  await signIn(page);
  await page.getByRole('button', { name: 'Continue to delivery' }).click();
  await expect(page.getByText('Enter a street address.', { exact: true })).toBeVisible();
  await fillShipping(page);
  await page.getByRole('button', { name: 'Continue to delivery' }).click();
  await page.getByText('Express delivery', { exact: true }).click();
  await page.getByRole('button', { name: 'Review order' }).click();
  await expect(page.locator('.order-summary .total')).toContainText('$60.00');
  await page.getByRole('button', { name: 'Place order · $60.00' }).click();
  await expect(page.getByRole('heading', { name: 'Good things are on their way.' })).toBeVisible();
  await page.getByRole('button', { name: 'View orders' }).click();
  await expect(page.getByRole('heading', { name: 'Order FW-1001' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Order FW-1001' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm cancellation' }).click();
  await expect(page.locator('.status')).toHaveText('Cancelled');
});
test('Fernwood search, filters, pagination and product detail work', async ({ page }) => {
  await page.goto('/shop/');
  await page.getByRole('textbox', { name: 'Search products' }).fill('impossiblexyz');
  await expect(page.getByRole('heading', { name: 'No products found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).last().click();
  await page.getByRole('button', { name: 'View Arc Table Lamp', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByText('Page 2 of 100', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'View Arc Table Lamp · Edition 2', exact: true }),
  ).toBeVisible();
});
test('Fernwood deliberate cart bug is labelled and reproduces only when enabled', async ({
  page,
}) => {
  await page.goto('/shop/?bug=cart-total');
  await page.getByRole('button', { name: 'Add Everyday Ceramic Mug to bag', exact: true }).click();
  await page.getByRole('button', { name: 'Shopping bag (1)' }).click();
  await page
    .getByRole('button', { name: 'Increase Everyday Ceramic Mug quantity', exact: true })
    .click();
  await expect(page.getByText('Deliberate bug enabled: Incorrect cart total')).toBeVisible();
  await expect(page.locator('.order-summary .total')).toContainText('$29.00');
  await page.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page.locator('.order-summary .total')).toContainText('$53.00');
});
test('Fernwood reset restores the fresh session', async ({ page }) => {
  await addMugs(page);
  await page.getByRole('button', { name: 'Reset playground session' }).click();
  await page.getByRole('button', { name: 'Shopping bag (0)' }).click();
  await expect(
    page.getByRole('heading', { name: 'A little room for something good.' }),
  ).toBeVisible();
});
