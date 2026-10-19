import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });

test('Brello: pointer reorder within a column supports Undo and persists after reload', async ({
  page,
}) => {
  await page.goto('/tasks/');
  const column = page.locator('[aria-label="Backlog column"]');
  const cards = column.locator('.task-card');
  const ids = cards.locator('.task-id');
  const undo = page.getByRole('button', { name: 'Undo last change', exact: true });
  await expect(cards).toHaveCount(6);
  const original = await ids.allTextContents();
  expect(original[0]).toBe('CKB-001');
  await expect(undo).toBeDisabled();

  // Dropping the first card on the third inserts it immediately before that card.
  // dragTo uses browser mouse input, exercising the actual draggable card handlers.
  const reordered = [original[1], original[0], ...original.slice(2)];
  await cards.nth(0).dragTo(cards.nth(2));
  await expect(ids).toHaveText(reordered);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(ids).toHaveText(original);
  await expect(undo).toBeDisabled();

  await cards.nth(0).dragTo(cards.nth(2));
  await expect(ids).toHaveText(reordered);
  await page.reload();
  await expect(ids).toHaveText(reordered);
  // Task state survives reload; the intentionally in-memory Undo stack does not.
  await expect(undo).toBeDisabled();
});

test('Brello: edited due date survives detail reopening and reload', async ({ page }) => {
  await page.goto('/tasks/');
  const task = page.locator('[data-task-id="CKB-001"]');
  const panel = page.getByRole('dialog', { name: 'Task CKB-001', exact: true });
  const dueDate = panel.getByLabel('Due date', { exact: true });
  const close = panel.getByRole('button', { name: 'Close task details', exact: true });

  await task.click();
  await expect(dueDate).toHaveValue('');
  await dueDate.fill('2027-02-18');
  await expect(dueDate).toHaveValue('2027-02-18');
  await close.click();
  await expect(panel).toHaveCount(0);
  await expect(task.locator('.due-date')).toHaveText('Feb 18');

  await task.click();
  await expect(dueDate).toHaveValue('2027-02-18');
  await close.click();
  await page.reload();
  await expect(task.locator('.due-date')).toHaveText('Feb 18');
  await task.click();
  await expect(dueDate).toHaveValue('2027-02-18');
});
