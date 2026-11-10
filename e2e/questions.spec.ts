import { expect, test } from '@playwright/test';
import { newRun } from '../src/game/engine';
import { SAVE_KEY, freshSave } from '../src/game/save';
import { en } from '../src/i18n/en';
import type { RunState } from '../src/game/types';

// Open questions (openQuestions in src/game/save.ts) replace the endings count: one per
// ending not seen yet, on the title and on the ending card. Seeing an ending crosses it off.

const ALL = ['question.homeInTime', 'question.homeAtCost', 'question.tooLate', 'question.turnedBack'].map((k) => en[k]);

test('a fresh save lists every open question on the title', async ({ page }) => {
  await page.goto('./');
  const list = page.locator('.title-screen .open-questions');
  await expect(list.locator('h2')).toHaveText(en['ui.openQuestions']);
  await expect(list.locator('li')).toHaveText(ALL);
  await expect(page.getByText(/Endings seen/)).toHaveCount(0);
});

test('the ending card crosses off the ending just seen, and so does the title after it', async ({ page }) => {
  await page.goto('./');
  const run: RunState = {
    ...newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 }),
    time: 0, checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending: 'tooLate',
  };
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run, endingsSeen: ['tooLate'] })] as const);
  await page.reload();

  const open = ALL.filter((q) => q !== en['question.tooLate']);
  await expect(page.locator('.ending-card .open-questions li')).toHaveText(open);
  await expect(page.getByText(/Endings seen/)).toHaveCount(0);

  // A reload keeps the list: it comes from the save.
  await page.reload();
  await expect(page.locator('.ending-card .open-questions li')).toHaveText(open);
});

test('the title shows only what is left once some endings are seen', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['homeInTime', 'turnedBack'] })] as const);
  await page.reload();
  await expect(page.locator('.title-screen .open-questions li')).toHaveText([en['question.homeAtCost'], en['question.tooLate']]);
});

test('with every ending seen, the title shows no questions', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['homeInTime', 'homeAtCost', 'tooLate', 'turnedBack'] })] as const);
  await page.reload();
  await expect(page.locator('.title-screen h1')).toBeVisible();
  await expect(page.locator('.open-questions')).toHaveCount(0);
});
