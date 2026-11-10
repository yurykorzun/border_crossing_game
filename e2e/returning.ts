import type { Page } from '@playwright/test';
import { SAVE_KEY, freshSave } from '../src/game/save';

/**
 * Opens the game as a returning player: a save with one ending seen, so Start
 * walks the traveler and documents screens. A fresh save skips them and opens
 * the begin screen as Lena with FIRST_RUN's packing (src/game/content/world.ts).
 */
export async function openReturning(page: Page) {
  await page.goto('./');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['tooLate'] })] as const);
  await page.reload();
}
