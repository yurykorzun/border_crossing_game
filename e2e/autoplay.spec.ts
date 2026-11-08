import { expect, test } from '@playwright/test';

// ?autoplay=honest plays a whole run on screen at one step a second, no clicks.
// Bot runs end within 40 steps (src/game/bots.test.ts), so 40 s plus slack.

test('autoplay reaches an ending with no clicks', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?autoplay=honest');

  await expect(page.locator('[data-autoplay="honest"] main.run')).toBeVisible();
  await expect(page.locator('.ending-card')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.ending-card h1')).not.toBeEmpty();

  // Autoplay never writes the player's save.
  expect(await page.evaluate(() => localStorage.getItem('purpose-of-visit-save'))).toBeNull();
  expect(errors, 'console errors').toEqual([]);
});
