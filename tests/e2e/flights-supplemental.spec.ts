import { test, expect, type Locator, type Page } from '@playwright/test';

const dollars = (text: string) => Number(text.replace(/[^0-9.]/g, ''));
const money = (value: number) => `$${value.toLocaleString('en-US')}`;
const summaryTotal = (page: Page) => page.locator('.trip-summary .summary-row.total');

async function chooseFlights(page: Page, roundTrip = true) {
  await page.getByLabel(roundTrip ? 'Round trip' : 'One way', { exact: true }).check();
  await page.getByRole('button', { name: 'Search flights', exact: true }).click();
  const prices: number[] = [];
  for (let leg = 0; leg < (roundTrip ? 2 : 1); leg++) {
    await expect(page.locator('.flight-card')).toHaveCount(12);
    const flight = page.locator('.flight-card').first();
    prices.push(dollars((await flight.locator('.flight-price > strong').textContent())!));
    await flight.getByRole('button', { name: 'Select flight', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Choose your fare', exact: true })).toBeVisible();
  return prices;
}

async function enableBug(page: Page, id: string, label: string) {
  await page.getByRole('button', { name: 'Test controls', exact: true }).click();
  await page.getByRole('combobox', { name: 'Active bug', exact: true }).selectOption(id);
  await expect(page).toHaveURL(new RegExp(`[?&]bug=${id}(?:&|$)`));
  await expect(page.getByText(`Deliberate bug enabled: ${label}`, { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search flights', exact: true })).toBeVisible();
}

async function disableBug(page: Page) {
  await page.getByRole('button', { name: 'Disable', exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]bug=/);
  await expect(page.getByRole('button', { name: 'Test controls', exact: true })).toBeVisible();
  await expect(page.getByText(/Deliberate bug enabled:/)).toHaveCount(0);
}

async function selectAvailableSeat(page: Page) {
  const seat = page.locator('button.seat:not([disabled])[aria-pressed="false"]').first();
  const code = (await seat.getAttribute('aria-label'))!.match(/^Seat (\d+[A-F])/)![1];
  await seat.click();
  await expect(
    page.getByRole('button', { name: `Seat ${code}, selected`, exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.seat-details > .summary-row strong')).toHaveText(code);
  return code;
}

async function chooseBothSeats(page: Page) {
  await page.getByRole('button', { name: 'Continue to seats', exact: true }).click();
  const outbound = await selectAvailableSeat(page);
  await page.getByRole('button', { name: 'Choose return seats', exact: true }).click();
  const inbound = await selectAvailableSeat(page);
  await page.getByRole('button', { name: 'Continue to checkout', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'First name', exact: true })).toBeVisible();
  return { outbound, inbound };
}

test('Looking fare-total omits the selected upgrade only when enabled, then recovers', async ({
  page,
}) => {
  await page.goto('/flights/');
  let expectedPrices: number[] | undefined;
  let expectedTotal = 0;
  for (const mode of ['normal', 'bug', 'recovered'] as const) {
    if (mode === 'bug') await enableBug(page, 'fare-total', 'Incorrect fare total');
    if (mode === 'recovered') await disableBug(page);
    const prices = await chooseFlights(page);
    if (expectedPrices) expect(prices).toEqual(expectedPrices);
    else expectedPrices = prices;
    const base = prices.reduce((sum, price) => sum + price, 0);
    const flex = page
      .locator('.fare-card')
      .filter({ has: page.getByRole('heading', { name: 'Flex', exact: true }) });
    await expect(flex.locator('.fare-price')).toContainText('+$128');
    await flex.getByRole('button', { name: 'Choose Flex', exact: true }).click();
    await expect(flex.getByRole('button', { name: 'Selected', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expectedTotal = base + 128 * 2;
    const shownTotal = mode === 'bug' ? base : expectedTotal;
    await expect(summaryTotal(page)).toHaveText(`Total${money(shownTotal)} USD`);
    if (mode === 'bug') await expect(summaryTotal(page)).not.toContainText(money(expectedTotal));
    await chooseBothSeats(page);
    await expect(summaryTotal(page)).toHaveText(`Total${money(shownTotal)} USD`);
    await expect(page.locator('.trip-summary')).toContainText('1 traveler · Flex');
  }
  await expect(summaryTotal(page)).toContainText(money(expectedTotal));
});

test('Looking occupied seats reject selection, expose the labelled defect, then reject again', async ({
  page,
}) => {
  await page.goto('/flights/');
  let occupiedCode = '';
  for (const mode of ['normal', 'bug', 'recovered'] as const) {
    if (mode === 'bug') await enableBug(page, 'seat-conflict', 'Occupied seat selectable');
    if (mode === 'recovered') await disableBug(page);
    await chooseFlights(page, false);
    await page.getByRole('button', { name: 'Continue to seats', exact: true }).click();
    if (!occupiedCode) {
      occupiedCode = (await page
        .locator('.seat.occupied')
        .first()
        .getAttribute('aria-label'))!.match(/^Seat (\d+[A-F])/)![1];
    }
    const occupied = page.getByRole('button', {
      name: `Seat ${occupiedCode}, occupied`,
      exact: true,
    });
    const next = page.getByRole('button', { name: 'Continue to checkout', exact: true });
    await expect(occupied).toHaveAttribute('aria-pressed', 'false');
    await expect(next).toBeDisabled();
    if (mode === 'bug') {
      await expect(occupied).toBeEnabled();
      await occupied.click();
      await expect(
        page.getByRole('button', { name: `Seat ${occupiedCode}, occupied, selected`, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.seat-details > .summary-row strong')).toHaveText(occupiedCode);
      await expect(next).toBeEnabled();
      await next.click();
      await expect(page.getByRole('textbox', { name: 'First name', exact: true })).toBeVisible();
    } else {
      await expect(occupied).toBeDisabled();
      // A real pointer press on the disabled seat must leave the selection empty.
      await occupied.scrollIntoViewIfNeeded();
      const bounds = (await occupied.boundingBox())!;
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await expect(occupied).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('.seat[aria-pressed="true"]')).toHaveCount(0);
      await expect(page.locator('.seat-details > .summary-row strong')).toHaveText('Not selected');
      await expect(next).toBeDisabled();
      if (mode === 'recovered') {
        const available = await selectAvailableSeat(page);
        expect(available).not.toBe(occupiedCode);
        await next.click();
        await expect(page.getByRole('textbox', { name: 'First name', exact: true })).toBeVisible();
      }
    }
  }
});

async function assertBookingSeats(
  booking: Locator,
  outbound: string,
  inbound: string,
  total: string,
) {
  await expect(booking.getByText(`Alex Morgan · Seat ${outbound}`, { exact: true })).toBeVisible();
  await expect(
    booking.locator('.booking-card-main p').filter({ hasText: /^Return / }),
  ).toContainText(`· Seats ${inbound}`);
  await expect(booking.locator('.booking-total')).toHaveText(total);
  await expect(booking.locator('.status')).toHaveText('Confirmed');
}

test('Looking saves both booking seat changes across reopening and reload without changing the fare total', async ({
  page,
}) => {
  await page.goto('/flights/');
  await chooseFlights(page);
  await page.getByRole('button', { name: 'Choose Flex', exact: true }).click();
  const originalSeats = await chooseBothSeats(page);
  const checkoutTotal = (await summaryTotal(page).locator('strong').last().innerText()).replace(
    /\s+USD$/,
    '',
  );
  await page.getByLabel('First name', { exact: true }).fill('Alex');
  await page.getByLabel('Last name', { exact: true }).fill('Morgan');
  await page.getByLabel('Date of birth', { exact: true }).fill('1992-06-15');
  await page.getByLabel('Email address', { exact: true }).fill('alex@example.com');
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click();
  await page.getByRole('button', { name: 'Use sample', exact: true }).click();
  await page.getByRole('button', { name: 'Review booking', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I have reviewed' }).check();
  await page
    .getByRole('button', { name: `Confirm booking · ${checkoutTotal}`, exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Booking confirmed', exact: true })).toBeVisible();
  const reference = (await page.locator('.booking-reference').textContent())!;
  await page.getByRole('button', { name: 'Manage your booking', exact: true }).click();
  await expect(page.locator('.booking-card')).toHaveCount(2);
  const booking = page
    .locator('.booking-card')
    .filter({ has: page.getByText(reference, { exact: true }) });
  const otherBooking = page
    .locator('.booking-card')
    .filter({ has: page.getByText('WL6P2K', { exact: true }) });
  const otherBefore = (await otherBooking.textContent())!;
  const totalBefore = (await booking.locator('.booking-total').textContent())!;
  await expect(booking.locator('.booking-total')).toContainText(checkoutTotal);
  await assertBookingSeats(booking, originalSeats.outbound, originalSeats.inbound, totalBefore);
  await booking.getByRole('button', { name: 'Change seats', exact: true }).click();
  await expect(page.locator('.page-subtitle')).toContainText('Outbound');
  await page
    .getByRole('button', { name: `Seat ${originalSeats.outbound}, selected`, exact: true })
    .click();
  const outbound = page.locator('button.seat:not([disabled])[aria-pressed="false"]').nth(1);
  const newOutbound = (await outbound.getAttribute('aria-label'))!.match(/^Seat (\d+[A-F])/)![1];
  expect(newOutbound).not.toBe(originalSeats.outbound);
  await outbound.click();
  await page.getByRole('button', { name: 'Choose return seats', exact: true }).click();
  await expect(page.locator('.page-subtitle')).toContainText('Return');
  await page
    .getByRole('button', { name: `Seat ${originalSeats.inbound}, selected`, exact: true })
    .click();
  const inbound = page.locator('button.seat:not([disabled])[aria-pressed="false"]').nth(1);
  const newInbound = (await inbound.getAttribute('aria-label'))!.match(/^Seat (\d+[A-F])/)![1];
  expect(newInbound).not.toBe(originalSeats.inbound);
  await inbound.click();
  await page.getByRole('button', { name: 'Save seats', exact: true }).click();
  await assertBookingSeats(booking, newOutbound, newInbound, totalBefore);
  await expect(otherBooking).toHaveText(otherBefore);

  for (const reload of [false, true]) {
    if (reload) {
      await page.reload();
      await page.getByRole('button', { name: 'My trips', exact: true }).click();
    }
    await assertBookingSeats(booking, newOutbound, newInbound, totalBefore);
    await expect(otherBooking).toHaveText(otherBefore);
    await booking.getByRole('button', { name: 'Change seats', exact: true }).click();
    await expect(
      page.getByRole('button', { name: `Seat ${newOutbound}, selected`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: `Seat ${originalSeats.outbound}`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Choose return seats', exact: true }).click();
    await expect(
      page.getByRole('button', { name: `Seat ${newInbound}, selected`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('button', { name: `Seat ${originalSeats.inbound}`, exact: true }),
    ).toHaveAttribute('aria-pressed', 'false');
    await page.getByRole('button', { name: 'Back to my trips', exact: true }).click();
  }
});
