import { expect, test } from '@playwright/test';
import { SAVE_KEY } from '../src/game/save';
import { en } from '../src/i18n/en';

// First-run explanations (border_crossing_game-dap.9): on a fresh save the first
// hour lost explains, under the reaction, how time works; the next hour lost does not,
// and the save remembers it was shown.

const MAX_STEPS = 120;

test('a fresh save explains time once, under the first hour lost, at 390x844', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // A first run: Begin opens the begin screen straight away, with the first run's packing.
  await page.locator('.title-screen button.primary').click();
  await page.locator('.begin-step .controls button.primary').click();
  await expect(page.locator('main.run')).toBeVisible();

  const reaction = page.locator('main.run .panel.reaction');
  const waitingSkip = page.locator('.panel.waiting .skip');
  const explain = page.locator('main.run .explain p[data-explain-id="time"]');
  const lost = /\d+ hours? lost\./;
  let hoursLost = 0;
  for (let steps = 0; steps < MAX_STEPS && hoursLost < 2; steps++) {
    if (await page.locator('.ending-card').isVisible()) break;
    if (await reaction.isVisible()) {
      const text = await reaction.innerText();
      if (lost.test(text)) {
        hoursLost++;
        if (hoursLost === 1) {
          await expect(explain).toHaveText(en['explain.time']);
          await expect(explain).toBeInViewport();
          const box = await explain.boundingBox();
          expect(box!.y + box!.height).toBeLessThanOrEqual(844);
        } else {
          await expect(explain).toHaveCount(0);
        }
      } else {
        await expect(explain).toHaveCount(0);
      }
      await page.locator('main.run .controls button.primary').click();
    } else if (await waitingSkip.isVisible()) {
      await page.locator('.panel.waiting').click();
    } else {
      const options = page.locator('main.run .controls button:enabled');
      await expect(options.first()).toBeVisible();
      // An answer that costs hours gets to the first hour lost sooner.
      const timed = options.filter({ hasText: /: \d+ hours?/ });
      await ((await timed.count()) ? timed.first() : options.first()).click();
    }
  }
  expect(hoursLost, 'hours lost seen').toBe(2);
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);
  expect(saved.explained).toContain('time');
  expect(errors).toEqual([]);
});
