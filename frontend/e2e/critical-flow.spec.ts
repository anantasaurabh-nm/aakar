import { test, expect } from '@playwright/test';

/**
 * Login -> DoersOS Home -> open Todo -> SDUI loads -> Dashboard renders ->
 * Table renders -> filter works -> new action -> form -> submit
 * (stack.md §19). Requires the backend + frontend dev servers running and
 * the database seeded (npm run prisma:seed).
 */
test('critical path: login through creating a task', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('admin@doers-os.internal').fill('admin@doers-os.internal');
  await page.getByPlaceholder('••••••••••••').fill('Password123!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL('/', { timeout: 10000 });
  await page.getByText('Todo', { exact: true }).click();

  await expect(page.getByText('Insights')).toBeVisible();
  await expect(page.getByText('Tasks')).toBeVisible();

  await page.getByRole('button', { name: 'New' }).click();
  await page.getByLabel('Title').fill('E2E created task');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('E2E created task').first()).toBeVisible();
});
