import { test, expect } from '@playwright/test';
test('Corkboard: rapid keyboard moves retain focus and commit one undo step with delayed frames', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      requestFrame((time) => window.setTimeout(() => callback(time), 120));
  });
  await page.goto('/tasks/');
  const firstColumn = page.locator('.kanban-column').first();
  const first = firstColumn.locator('.task-card').first();
  await expect(first).toBeVisible();
  const id = await first.getAttribute('data-task-id');
  const task = page.locator(`[data-task-id="${id}"]`);
  const undo = page.getByRole('button', { name: 'Undo last change' });

  await task.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  // Catch a late focus callback or state update that could leave the move open.
  await page.waitForTimeout(300);
  await expect(task).toBeFocused();
  await expect(page.locator('.move-instructions')).toHaveCount(0);
  await expect(undo).toBeEnabled();
  await expect(page.locator('.kanban-column').nth(1).locator('.task-card').first()).toHaveAttribute(
    'data-task-id',
    id!,
  );
  await undo.click();
  await expect(firstColumn.locator('.task-card').first()).toHaveAttribute('data-task-id', id!);
  await expect(undo).toBeDisabled();

  await task.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await expect(undo).toBeEnabled();
  await expect(page.locator('.kanban-column').nth(2).locator('.task-card').nth(1)).toHaveAttribute(
    'data-task-id',
    id!,
  );
  await undo.click();
  await expect(firstColumn.locator('.task-card').first()).toHaveAttribute('data-task-id', id!);
  await expect(undo).toBeDisabled();

  await task.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(firstColumn.locator('.task-card').first()).toHaveAttribute('data-task-id', id!);
  await expect(task).toBeFocused();
  await expect(undo).toBeDisabled();
});
test('Corkboard: keyboard movement between and within columns, undo, inline editing', async ({
  page,
}) => {
  await page.goto('/tasks/');
  const first = page.locator('.kanban-column').first().locator('.task-card').first();
  await expect(first).toBeVisible();
  const id = await first.getAttribute('data-task-id');
  const task = page.locator(`[data-task-id="${id}"]`);
  await task.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(
    page.locator('.kanban-column').nth(1).locator(`[data-task-id="${id}"]`),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(
    page.locator('.kanban-column').first().locator('.task-card').first(),
  ).toHaveAttribute('data-task-id', id!);
  await task.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('.kanban-column').first().locator('.task-card').nth(1)).toHaveAttribute(
    'data-task-id',
    id!,
  );
  await page.getByRole('button', { name: `Rename ${id}`, exact: true }).click();
  await page.getByRole('textbox', { name: `Title for ${id}` }).fill('Updated onboarding task');
  await page.keyboard.press('Enter');
  await expect(task).toContainText('Updated onboarding task');
  await task.click();
  await page.getByLabel('Due date', { exact: true }).fill('2026-11-15');
  await page.getByRole('button', { name: 'Close task details' }).click();
  await page.reload();
  await expect(task).toContainText('Updated onboarding task');
});
test('Corkboard: pointer drag and empty filtered state', async ({ page }) => {
  await page.goto('/tasks/');
  const from = page.locator('.kanban-column').first().locator('.task-card').first();
  await expect(from).toBeVisible();
  const id = await from.getAttribute('data-task-id');
  const target = page.locator('.kanban-column').nth(2).locator('.task-card').first();
  await from.dragTo(target);
  await expect(
    page.locator('.kanban-column').nth(2).locator(`[data-task-id="${id}"]`),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Search tasks' }).fill('unmatchable-xyz');
  await expect(page.getByRole('heading', { name: 'No tasks match your filters' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.task-card').first()).toBeVisible();
});
test('Corkboard detailed card edits, checklist and creation survive reopening', async ({
  page,
}) => {
  await page.goto('/tasks/');
  await page.locator('[data-task-id="CKB-001"]').click();
  const panel = page.getByRole('dialog', { name: 'Task CKB-001' });
  await panel.getByRole('combobox', { name: 'Priority', exact: true }).selectOption('urgent');
  await panel.locator('details').first().locator('summary').click();
  await panel.getByRole('checkbox', { name: 'Alex Morgan', exact: true }).check();
  await panel.locator('details').first().locator('summary').click();
  await panel.locator('details').nth(1).locator('summary').click();
  await panel.getByLabel('Bug', { exact: true }).check();
  await panel.locator('details').nth(1).locator('summary').click();
  await panel.getByLabel('New checklist item').fill('Verify keyboard path');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await panel.getByLabel('Verify keyboard path', { exact: true }).check();
  await panel.getByRole('button', { name: 'Close task details' }).click();
  await page.locator('[data-task-id="CKB-001"]').click();
  await expect(panel.getByRole('combobox', { name: 'Priority', exact: true })).toHaveValue(
    'urgent',
  );
  await expect(panel.getByLabel('Verify keyboard path', { exact: true })).toBeChecked();
  await panel.getByRole('button', { name: 'Close task details' }).click();
  await page.getByRole('button', { name: 'New task', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Title', { exact: true })
    .fill('Prepare release checklist');
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Prepare release checklist', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Show completed').uncheck();
  await page.locator('.kanban-column').last().locator('.task-card').first().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(page.locator('.kanban-column')).toHaveCount(4);
});
