import { expect, test, type Locator } from '@playwright/test';

// The first seeded checkout trace includes full-width, short, late and failing spans.
const spans = [
  { name: 'http.request', start: 0, duration: 1134 },
  { name: 'authenticate', start: 4, duration: 102 },
  { name: 'checkout.create', start: 136, duration: 964 },
  { name: 'inventory.reserve', start: 181, duration: 261 },
  { name: 'payment.authorize', start: 465, duration: 476 },
  { name: 'order.confirmation', start: 987, duration: 91 },
];

async function expectContained(dialog: Locator, width: number, height: number) {
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);
  // Viewport intersection alone misses a toolbar painted over the modal header.
  expect(
    await dialog.evaluate((element) => {
      const header = element.querySelector('header')!;
      const box = header.getBoundingClientRect();
      const toolbar = document.querySelector<HTMLElement>('.pg-banner')!;
      const pointerEvents = toolbar.style.pointerEvents;
      // Radix disables outside pointer events, which otherwise hides visual occlusion
      // from hit testing. Restore hit testing only for this synchronous measurement.
      toolbar.style.pointerEvents = 'auto';
      try {
        return [box.top + 4, box.top + box.height / 2, box.bottom - 4].every((y) =>
          header.contains(document.elementFromPoint(box.left + box.width / 2, y)),
        );
      } finally {
        toolbar.style.pointerEvents = pointerEvents;
      }
    }),
  ).toBe(true);
  await expect(
    dialog.getByRole('heading', { name: 'Trace details', exact: true }),
  ).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport();
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`trace timing and inspection fit ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/observability/#traces');
    const inspect = page.getByRole('button', { name: 'Inspect trace-0001', exact: true });
    await inspect.click();
    const dialog = page.getByRole('dialog', { name: 'Trace details', exact: true });
    await expect(dialog).toBeVisible();
    await expectContained(dialog, viewport.width, viewport.height);
    const rows = dialog.locator('.waterfall-row');
    await expect(rows).toHaveCount(spans.length);
    const ticks = await dialog.locator('.waterfall-axis > span').evaluateAll((elements) =>
      elements.map((element) => {
        const { left, right } = element.getBoundingClientRect();
        return { left, right };
      }),
    );
    for (let index = 1; index < ticks.length; index++) {
      expect(ticks[index].left - ticks[index - 1].right).toBeGreaterThanOrEqual(8);
    }

    for (const span of spans) {
      const row = dialog.getByRole('button', {
        name: `Inspect ${span.name}, ${span.duration} milliseconds`,
        exact: true,
      });
      const geometry = await row.evaluate((element) => {
        const rect = (selector: string) => {
          const { x, y, width, height } = element.querySelector(selector)!.getBoundingClientRect();
          return { x, y, width, height };
        };
        return {
          track: rect('.span-track'),
          bar: rect('.span-bar'),
          duration: rect('.span-duration'),
        };
      });
      const { track, bar, duration } = geometry;
      expect(track.width).toBeGreaterThan(100);
      expect(Math.abs(bar.x - track.x - (span.start / 1134) * track.width)).toBeLessThan(2);
      expect(Math.abs(bar.width - (span.duration / 1134) * track.width)).toBeLessThan(2);
      expect(bar.x).toBeGreaterThanOrEqual(track.x - 1);
      expect(bar.x + bar.width).toBeLessThanOrEqual(track.x + track.width + 1);
      // A duration must never overlap the timeline, even for the full-width root span.
      expect(duration.x).toBeGreaterThanOrEqual(track.x + track.width);
      expect(Math.abs(duration.y + duration.height / 2 - bar.y - bar.height / 2)).toBeLessThan(2);
    }

    const payment = dialog.getByRole('button', {
      name: 'Inspect payment.authorize, 476 milliseconds',
      exact: true,
    });
    await payment.click();
    await expect(payment).toHaveAttribute('aria-pressed', 'true');
    const detail = dialog.locator('.span-detail');
    await expect(detail).toContainText('payment-worker');
    await expect(detail).toContainText('503');
    await detail.getByText('503', { exact: true }).scrollIntoViewIfNeeded();
    await expect(detail.getByText('503', { exact: true })).toBeInViewport();
    await expectContained(dialog, viewport.width, viewport.height);

    const overflow = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]')!;
      const scroll = dialog.querySelector('.waterfall-scroll')!;
      return {
        page: document.documentElement.scrollWidth - innerWidth,
        dialog: dialog.scrollWidth - dialog.clientWidth,
        waterfall: scroll.scrollWidth - scroll.clientWidth,
      };
    });
    expect(overflow.page).toBeLessThanOrEqual(1);
    expect(overflow.dialog).toBeLessThanOrEqual(1);
    if (viewport.width === 390) {
      expect(overflow.waterfall).toBeGreaterThan(0);
      const waterfall = dialog.locator('.waterfall-scroll');
      await waterfall.evaluate((element) => (element.scrollLeft = element.scrollWidth));
      const scrollBox = await waterfall.boundingBox();
      const nameBox = await rows.first().locator('.span-name').boundingBox();
      expect(nameBox!.x).toBeGreaterThanOrEqual(scrollBox!.x);
      expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(scrollBox!.x + scrollBox!.width);
      await waterfall.evaluate((element) => (element.scrollLeft = 0));
    }
    await page.screenshot({ path: `test-results/trace-${viewport.width}.png` });

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(inspect).toBeFocused();
    await inspect.click();
    await expect(dialog.locator('.waterfall-row[aria-pressed="true"]')).toHaveCount(0);
    const root = dialog.getByRole('button', {
      name: 'Inspect http.request, 1134 milliseconds',
      exact: true,
    });
    await root.focus();
    await page.keyboard.press('Enter');
    await expect(root).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('.span-detail')).toContainText('api-gateway');
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(inspect).toBeFocused();
  });
}
