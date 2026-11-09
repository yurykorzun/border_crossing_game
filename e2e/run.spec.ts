import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// One full run on a phone-size screen: title → character → documents → begin → play by
// always taking the first enabled option → ending card.

const MAX_STEPS = 400;

async function noHorizontalScroll(page: Page, where: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, `horizontal scroll on ${where}`).toBeLessThanOrEqual(client);
}

test('plays a full run to an ending at 390x844', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');

  // Title
  await expect(page.locator('.title-screen')).toBeVisible();
  await noHorizontalScroll(page, 'title');
  await page.locator('.title-screen button.primary').click();

  // Character: a tap selects, Continue moves on.
  await expect(page.getByRole('radio').first()).toBeVisible();
  await noHorizontalScroll(page, 'character pick');
  await page.getByRole('radio').first().click();
  await page.locator('.traveler-step .controls button.primary').click();

  // Documents: pack until Continue enables
  const cont = page.locator('.documents-step .controls button.primary');
  const docs = page.locator('.documents-step .doc');
  await expect(docs.first()).toBeVisible();
  await noHorizontalScroll(page, 'document pick');
  const docCount = await docs.count();
  for (let i = 0; i < docCount && !(await cont.isEnabled()); i++) await docs.nth(i).click();
  await expect(cont).toBeEnabled();
  await cont.click();

  // Mission card sets up the one clock: the last bus in 8 hours.
  const mission = page.locator('.begin-step .mission');
  await expect(mission).toContainText('The last bus to the hospital leaves in 8 hours');
  await expect(mission).not.toContainText('days of leave');
  await noHorizontalScroll(page, 'begin');
  await page.locator('.begin-step .controls button.primary').click();

  // Play
  const ending = page.locator('.ending-card');
  const reaction = page.locator('.panel.reaction');
  const waitingSkip = page.locator('.panel.waiting .skip');
  let previous = '';
  let lastReaction = '';
  let steps = 0;

  await expect(page.locator('main.run')).toBeVisible();

  // Time reads as hours until the last bus. Both routine passport cards have a 1-hour
  // option, so the first options screen shows a time cost on an answer's line.
  await expect(page.locator('.strip .stat.time')).toContainText('8 hours left');
  const timeChips: string[] = [];

  for (; steps < MAX_STEPS; steps++) {
    if (await ending.isVisible()) break;
    await noHorizontalScroll(page, `step ${steps}`);

    if (await reaction.isVisible()) {
      lastReaction = (await reaction.innerText()).trim();
      previous = 'reaction';
      await page.locator('main.run .controls button.primary').click();
    } else if (await waitingSkip.isVisible()) {
      previous = 'waiting';
      await page.locator('.panel.waiting').click();
    } else {
      const option = page.locator('main.run .controls button:enabled').first();
      // The waiting screen swaps its skip hint for buttons; give the screen a moment.
      await expect(option).toBeVisible();
      timeChips.push(...(await page.locator('main.run .consequence .part', { hasText: /^Costs / }).allInnerTexts()));
      previous = 'option';
      await option.click();
    }
  }

  expect(steps, 'run did not end').toBeLessThan(MAX_STEPS);
  expect(timeChips.length, 'time costs seen').toBeGreaterThan(0);
  for (const chip of timeChips) expect(chip).toMatch(/^Costs \d+ hours?$/);
  await expect(ending).toBeVisible();
  await expect(ending.locator('h1')).not.toBeEmpty();
  await expect(page.locator('.ending .controls button.primary')).toBeVisible();
  await noHorizontalScroll(page, 'ending');

  // The last officer reaction showed right before the ending card (bug fixed 2026-11-07).
  expect(previous, 'screen before the ending card').toBe('reaction');
  expect(lastReaction).not.toBe('');

  expect(errors, 'console errors').toEqual([]);
});
