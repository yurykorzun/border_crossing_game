import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { SaveData } from '../src/game/save';

/**
 * Opens the game as a returning player: a save with one finished Arrival, so Begin walks
 * the traveler and documents screens (and the level list, once more than one level
 * is open). A fresh save skips them and opens the begin screen as Lena with
 * FIRST_RUN's packing (src/game/content/world.ts).
 */
export async function openReturning(page: Page) {
  await page.goto('./');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['tooLate'], levelsFinished: ['arrival'] })] as const);
  await page.reload();
}

/**
 * After Begin as a returning player: starts Level 1 Arrival. With only Arrival open
 * there is no level list (g0q.2), so this waits for the traveler screen and taps nothing.
 */
export async function pickArrival(page: Page) {
  await page.locator('main.level-step, main.traveler-step').first().waitFor();
  if (await page.locator('main.level-step').count()) {
    await page.locator('main.level-step button.level[data-level="arrival"]').click();
  }
}

/**
 * Reloads onto a saved game. A saved run waits on the title (g0q.2), so this taps
 * Resume crossing to reach it, as a returning player would.
 */
export async function openSaved(page: Page, data: SaveData) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(data)] as const);
  await page.reload();
  if (data.run) await resume(page);
}

/** Taps Resume crossing on the title. */
export async function resume(page: Page) {
  const button = page.locator('.title-screen button.resume');
  await expect(button).toBeVisible();
  await button.click();
}
