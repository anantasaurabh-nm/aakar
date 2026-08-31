import { test, expect } from '@playwright/test';

test('settings UI toolbar and detail view', async ({ page }) => {
  await page.goto('/login');
  await page.getByPlaceholder('admin@doers-os.internal').fill('admin@doers-os.internal');
  await page.getByPlaceholder('••••••••••••').fill('Password123!');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL('/', { timeout: 10000 });

  // Navigate to AI Configuration
  await page.goto('/admin/ai-configuration');
  await expect(page.getByText('AI Configuration').first()).toBeVisible();

  // Check the settings group item in the list
  const groupButton = page.locator('button:has-text("openrouter"), button:has-text("Add Model Config")').first();
  await expect(groupButton).toBeVisible();

  // Click on a model config to open detail view
  await groupButton.click();

  // Verify full-width top toolbar elements
  const backBtn = page.getByTitle('Back');
  await expect(backBtn).toBeVisible();

  const saveBtn = page.getByTitle('Save changes');
  await expect(saveBtn).toBeVisible();

  // Check if status dropdown is present
  const statusBtn = page.getByRole('button', { name: 'Status' });
  if (await statusBtn.isVisible()) {
    await statusBtn.click();
    // Verify dropdown menu options
    await expect(page.getByRole('button', { name: 'Active' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fallback' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disabled' })).toBeVisible();
  }

  // Click Back to return to list
  await backBtn.click();
  await expect(page.getByRole('button', { name: 'Models & Providers' })).toBeVisible();
});

