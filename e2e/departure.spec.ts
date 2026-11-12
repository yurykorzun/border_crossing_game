// Departure (border_crossing_game-rwf.3): after the traveler, a short recap of that
// traveler's file, then continue their crossing or play standalone. A standalone run
// leaves the saved file as it is; a continued run replaces it once it ends.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { SAMPLE_FILES } from '../src/game/carry';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { SaveData } from '../src/game/save';
import { CHARACTER_IDS } from '../src/game/content/world';
import type { CharacterId } from '../src/game/types';

const SAVED: SaveData = { ...freshSave(), endingsSeen: ['tooLate'], levelsFinished: ['arrival'], file: SAMPLE_FILES.lena };

async function open(page: Page) {
  await page.goto('./');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(SAVED)] as const);
  await page.reload();
  await page.locator('.title-screen button.primary').click();
  await page.locator('main.level-step button.level[data-level="departure"]').click();
}

async function pickTraveler(page: Page, who: CharacterId) {
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf(who)).click();
  await page.locator('.traveler-step .controls button.primary').click();
}

/** Packs the first slots, begins, and leaves the passport queue: the quickest end to a run. */
async function packAndTurnBack(page: Page, slots: number) {
  const docs = page.locator('.documents-step .doc');
  for (let i = 0; i < slots; i++) await docs.nth(i).click();
  await page.locator('.documents-step .controls button.primary').click();
  await page.locator('.begin-step .controls button.primary').click();
  const run = page.locator('main.run');
  const turnBack = run.locator('.controls button.turn-back');
  for (let i = 0; i < 20 && !(await turnBack.isVisible()); i++) await run.locator('.controls button.primary').click();
  await turnBack.click();
  await run.locator('.controls button.primary').click();
  await expect(page.locator('.ending-card')).toBeVisible();
}

const savedFile = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}').file, SAVE_KEY);

test('Departure shows the record, and a standalone run leaves the saved file as it is', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await open(page);
  await pickTraveler(page, 'lena');

  const record = page.locator('main.record-step');
  await expect(record).toBeVisible();
  await expect(record.locator('[data-record] h2')).toHaveText(en['ui.record.title']);
  await expect(record.locator('[data-record]')).toContainText('No reason, a short trip');
  await expect(record.locator('[data-record]')).toContainText('did not match');
  await expect(record.locator('button.record-continue')).toHaveText("Continue Lena's crossing");
  await expect(record.locator('button.record-standalone')).toHaveText(en['ui.record.standalone']);
  await expect(record.locator('.record-note')).toHaveText(en['ui.record.standaloneNote']);

  await record.locator('button.record-standalone').click();
  await expect(page.locator('main.documents-step')).toBeVisible();
  await packAndTurnBack(page, 3);
  expect(await savedFile(page)).toEqual(SAMPLE_FILES.lena);
  expect(errors).toEqual([]);
});

test('continuing the crossing opens Departure with the saved file, and its end replaces it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await open(page);
  await pickTraveler(page, 'lena');
  await page.locator('main.record-step button.record-continue').click();
  await packAndTurnBack(page, 3);
  const after = await savedFile(page);
  expect(after).not.toEqual(SAMPLE_FILES.lena);
  expect(after.character).toBe('lena');
  expect(errors).toEqual([]);
});

test("Lena's file is not offered to continue Mark's crossing", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await open(page);
  await pickTraveler(page, 'mark');
  const record = page.locator('main.record-step');
  await expect(record.locator('[data-record-none]')).toHaveText("No file from Mark's crossing in. Play standalone, or finish Arrival as Mark first.");
  await expect(record.locator('button.record-continue')).toHaveCount(0);
  await record.locator('button.record-standalone').click();
  await packAndTurnBack(page, 4);
  expect(await savedFile(page)).toEqual(SAMPLE_FILES.lena);
  expect(errors).toEqual([]);
});

// Departure is its own story (dap.3): the traveler screen says the flight is in the next
// country and you cross by land to reach it, and the run plays through to an ending.
test('Departure says you cross by land to a flight, from the level list to an ending', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await open(page);
  const premise = page.locator('main.traveler-step h2.premise');
  await expect(premise).toHaveText(en['departure:ui.premise']);
  await expect(premise).toContainText('by land');
  await pickTraveler(page, 'lena');
  await page.locator('main.record-step button.record-standalone').click();
  await expect(page.locator('.documents-step .prep-message')).toContainText(en['departure:msg.prep']);
  await packAndTurnBack(page, 3);
  await expect(page.locator('.ending-card h1')).not.toHaveText(/Home in time|hospital/i);
  await expect(page.locator('.ending-card .ending-scene svg')).not.toHaveAttribute('aria-label', /hospital/i);
  expect(errors).toEqual([]);
});
