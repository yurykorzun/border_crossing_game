import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { dailySetup } from '../src/game/daily';
import { CHARACTERS } from '../src/game/content/world';
import { CHECKPOINTS } from '../src/game/types';
import { openReturning } from './returning';

// The daily crossing at 390x844 (border_crossing_game-rwf.7): on the level list,
// the date's traveler and three bulletins, then a full run to an ending.
const DATE = '2026-11-10';
const MAX_STEPS = 200;

test('the daily crossing sits on the level list and plays the date\'s setup end to end', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  // The game reads the clock once at Start; a fixed clock makes it this date.
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00`));
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();

  const day = dailySetup(DATE);
  const list = page.locator('main.level-step');
  const daily = list.locator('button.daily');
  await expect(daily).toBeVisible();
  await expect(daily.locator('.level-name')).toHaveText(en['ui.dailyTitle']);
  await expect(daily).toContainText(en['ui.dailyBlurb']);
  await expect(daily).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight), 'level list fits').toBe(true);
  await daily.click();

  // Straight to packing: the date picked the traveler. One bulletin per desk, by name.
  const docs = page.locator('main.documents-step');
  await expect(docs).toBeVisible();
  await expect(page.locator('main.traveler-step')).toHaveCount(0);
  const lines = docs.locator('.daily-bulletins li');
  await expect(lines).toHaveText(day.bulletins.map((b, i) => `${en[`checkpoint.${CHECKPOINTS[i]}`]}: ${en[`bulletin.${b}`]}`));
  await expect(docs.locator('.pack-cue')).toHaveCount(0);
  const cont = docs.locator('.controls button.primary');
  for (let i = 0; i < CHARACTERS[day.character].evidenceSlots; i++) await docs.locator('.doc').nth(i).click();
  await expect(cont).toBeEnabled();
  await cont.click();

  // The begin screen names the date's traveler, and carry-over is off by default.
  const begin = page.locator('main.begin-step');
  await expect(begin.locator('.begin-traveler')).toContainText(`${en[`char.${day.character}.name`]} · ${en[`char.${day.character}.role`]}`);
  const memory = begin.getByRole('checkbox', { name: en['ui.dailyMemory'] });
  await expect(memory).not.toBeChecked();
  await begin.locator('.controls button.primary').click();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('purpose-of-visit-save') ?? '{}'));
  expect(saved.run.daily).toBe(DATE);
  expect(saved.run.character).toBe(day.character);
  expect(saved.run.bulletins).toEqual(day.bulletins);
  expect(saved.run.level).toBe(day.level);
  expect(saved.run.claims).toEqual([]);

  // Play it to an ending: dismiss each reaction, skip each wait, take the first open answer.
  const ending = page.locator('.ending-card');
  const reaction = page.locator('.panel.reaction');
  const waitingSkip = page.locator('.panel.waiting .skip');
  let steps = 0;
  for (; steps < MAX_STEPS; steps++) {
    if (await ending.isVisible()) break;
    if (await reaction.isVisible()) await page.locator('main.run .controls button.primary').click();
    else if (await waitingSkip.isVisible()) await page.locator('.panel.waiting').click();
    else {
      const option = page.locator('main.run .controls button:enabled').first();
      await expect(option).toBeVisible();
      await option.click();
    }
  }
  expect(steps, 'run did not end').toBeLessThan(MAX_STEPS);
  await expect(ending.locator('h1')).not.toBeEmpty();

  // The finished daily crossing is kept as the last daily file, for carry-over next time.
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('purpose-of-visit-save') ?? '{}'));
  expect(after.dailyFile.daily).toBe(DATE);
  expect(after.dailyFile.character).toBe(day.character);
  expect(errors).toEqual([]);
});

test('Back from the daily crossing\'s packing returns to the level list', async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${DATE}T12:00:00`));
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();
  await page.locator('main.level-step button.daily').click();
  await page.locator('main.documents-step').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('main.level-step')).toBeVisible();
  // Arrival still opens the traveler screen afterwards.
  await page.locator('main.level-step button.level[data-level="arrival"]').click();
  await expect(page.locator('main.traveler-step')).toBeVisible();
});
