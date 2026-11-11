import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { playRun, setupFor } from '../src/game/bots';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { SaveData } from '../src/game/save';
import { t } from '../src/i18n';
import type { RunState } from '../src/game/types';
import { openSaved, pickArrival } from './returning';

// Play again with the same setup from the ending, and Start over from the settings sheet mid-run.

const readSave = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY) as Promise<SaveData>;

async function openWith(page: Page, data: SaveData) {
  await page.goto('./');
  await openSaved(page, data);
}

test('Play again with the same setup starts the same traveler, packing, bulletin and seed', async ({ page }) => {
  const setup = { ...setupFor(2), bulletin: 'records' as const };
  const ended: RunState = { ...playRun('honest', setup).final, reaction: null };
  await openWith(page, { ...freshSave(), endingsSeen: [ended.ending!], run: ended });

  await expect(page.locator('.ending-card')).toBeVisible();
  await page.getByRole('button', { name: t('ui.playSameSetup') }).click();

  // The begin screen for the same setup: the same day's bulletin, the same traveler, no picks.
  const begin = page.locator('.begin-step.same-setup');
  await expect(begin).toBeVisible();
  await expect(begin.locator('.bulletin')).toContainText(t('bulletin.records'));
  await expect(begin.locator('.begin-traveler')).toContainText(t(`char.${setup.character}.name`));
  await begin.locator('.controls button.primary').click();

  await expect(page.locator('main.run')).toBeVisible();
  const run = (await readSave(page)).run!;
  expect(run.ending).toBeNull();
  expect(run.character).toBe(setup.character);
  expect(run.loadout).toEqual(setup.loadout);
  expect(run.bulletin).toBe('records');
  expect(run.seed).toBe(setup.seed);
});

test('Start over in settings mid-run lands on the start of a new run and keeps endings and settings', async ({ page }) => {
  const settings = { reduceWait: true, reduceMotion: false, sound: false };
  await openWith(page, { ...freshSave(), endingsSeen: ['tooLate'], settings });
  await page.locator('.title-screen button.primary').click();
  await pickArrival(page);
  await page.getByRole('radio').first().click();
  await page.locator('.traveler-step .controls button.primary').click();
  const docs = page.locator('.documents-step .doc');
  const cont = page.locator('.documents-step .controls button.primary');
  for (let i = 0; i < (await docs.count()) && !(await cont.isEnabled()); i++) await docs.nth(i).click();
  await cont.click();
  await page.locator('.begin-step .controls button.primary').click();

  // A step into the run, so there is a run to drop.
  await expect(page.locator('main.run')).toBeVisible();
  await page.locator('main.run .controls button.primary').first().click();
  const seed = (await readSave(page)).run!.seed;

  await page.getByRole('button', { name: t('ui.settings') }).click();
  await page.getByRole('button', { name: t('ui.startOver') }).click();

  // The start of a new run: the first setup screen a returning player sees after Begin.
  await expect(page.locator('main.traveler-step')).toBeVisible();
  await expect(page.locator('main.run')).toHaveCount(0);
  const after = await readSave(page);
  expect(after.run).toBeNull();
  expect(after.endingsSeen).toEqual(['tooLate']);
  expect(after.settings).toEqual(settings);

  // A reload no longer offers the old run: Begin, not Resume crossing.
  await page.reload();
  await expect(page.locator('.title-screen button.begin')).toBeVisible();
  await expect(page.locator('.title-screen button.resume')).toHaveCount(0);
  expect(seed).toBeTruthy();
});
