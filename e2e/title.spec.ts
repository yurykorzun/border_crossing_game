import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newRun } from '../src/game/engine';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { SaveData } from '../src/game/save';
import { en } from '../src/i18n/en';
import type { RunState } from '../src/game/types';
import { openReturning } from './returning';

// The title (g0q.2): one group with the name, the border post, the premise, Begin and a quiet
// Settings. A saved run gets Resume crossing and New crossing instead of Begin. No level list
// while only one level is open, and no "Still to find out" list here or on the ending card.

const readSave = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY) as Promise<SaveData>;
const lenaRun = (): RunState => newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });

async function withSave(page: Page, data: SaveData) {
  await page.goto('./');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(data)] as const);
  await page.reload();
}

/** The title fits the screen as one group: no page scroll, every part inside the viewport. */
async function fits(page: Page, where: string) {
  const m = await page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
    return {
      scroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      card: box('.title-card'), scene: box('.title-scene'), controls: box('.title-screen .controls'),
      viewport: window.innerHeight,
    };
  });
  expect(m.scroll, `page scroll on ${where}`).toBeLessThanOrEqual(0);
  expect(m.card.top, `card off the top on ${where}`).toBeGreaterThanOrEqual(0);
  expect(m.controls.bottom, `buttons below the screen on ${where}`).toBeLessThanOrEqual(m.viewport);
  // The art is about a quarter of the screen: at least a sixth, at most a third.
  expect(m.scene.height, `art height on ${where}`).toBeGreaterThanOrEqual(m.viewport / 6);
  expect(m.scene.height, `art height on ${where}`).toBeLessThanOrEqual(m.viewport / 3);
  // About centred: the space above the group and below it differ by no more than 40 px.
  expect(Math.abs(m.card.top - (m.viewport - m.controls.bottom)), `centring on ${where}`).toBeLessThanOrEqual(40);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }]) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('a fresh save sees the title, the crossing art, the premise, Begin and Settings, and no level list', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto('./');
      const title = page.locator('main.title-screen');
      await expect(title.locator('h1')).toHaveText(en['ui.title']);
      await expect(title.locator('.title-scene svg[role="img"][data-scene="traveler"]')).toBeVisible();
      await expect(title.locator('.title-premise')).toHaveText("You're going home. You no longer know if home is safe for you.");
      await expect(title.locator('.controls button')).toHaveText([en['ui.start'], en['ui.settings']]);
      await expect(title.locator('button.primary')).toHaveText('Begin');
      // Begin is the amber primary; Settings is the quiet one.
      const colours = await title.evaluate((el) => ({
        begin: getComputedStyle(el.querySelector('button.begin')!).backgroundColor,
        settings: getComputedStyle(el.querySelector('button.title-settings')!).backgroundColor,
      }));
      expect(colours.begin).toBe('rgb(217, 164, 65)');
      expect(colours.settings).toBe('rgba(0, 0, 0, 0)');
      await expect(page.locator('main.level-step, .levels')).toHaveCount(0);
      await expect(page.locator('.title-screen button.resume, .title-screen button.new-crossing')).toHaveCount(0);
      await expect(page.locator('.open-questions')).toHaveCount(0);
      await expect(page.getByText('Still to find out')).toHaveCount(0);
      await fits(page, 'the fresh title');

      // Settings opens the sheet, and a change is saved.
      await title.locator('button.title-settings').click();
      const sheet = page.locator('dialog.sheet[open]');
      await expect(sheet).toBeVisible();
      await sheet.getByLabel(en['ui.reduceWait']).check();
      expect((await readSave(page)).settings.reduceWait).toBe(true);
      expect(errors).toEqual([]);
    });

    test('a saved run sees Resume crossing and New crossing; New crossing starts a new run with endings kept', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      const settings = { reduceWait: true, reduceMotion: false, sound: false };
      const run: RunState = { ...lenaRun(), time: 6, checkpoint: 1, screen: { kind: 'encounter', id: 'c_cash' }, reaction: null, slot: 1 };
      await withSave(page, { ...freshSave(), run, endingsSeen: ['tooLate'], settings });

      const title = page.locator('main.title-screen');
      await expect(title.locator('.title-scene svg[role="img"]')).toBeVisible();
      await expect(title.locator('.controls button')).toHaveText([en['ui.resume'], en['ui.newCrossing'], en['ui.settings']]);
      await expect(title.locator('button.primary')).toHaveText('Resume crossing');
      await expect(title.locator('button.begin')).toHaveCount(0);
      await expect(page.locator('main.run')).toHaveCount(0);
      await fits(page, 'the title with a saved run');

      // Resume crossing returns to the saved desk with the saved clock.
      await title.locator('button.resume').click();
      await expect(page.locator('main.run .strip')).toContainText('6 hours');
      await expect(page.locator('main.run .strip')).toContainText('2 / 3');

      // A reload offers it again; New crossing drops it and keeps endings and settings.
      await page.reload();
      await title.locator('button.new-crossing').click();
      await expect(page.locator('main.traveler-step')).toBeVisible();
      await expect(page.locator('main.level-step')).toHaveCount(0);
      const cleared = await readSave(page);
      expect(cleared.run).toBeNull();
      expect(cleared.endingsSeen).toEqual(['tooLate']);
      expect(cleared.settings).toEqual(settings);

      // Through to a new run at the first desk, endings still kept.
      await page.getByRole('radio').first().click();
      await page.locator('.traveler-step .controls button.primary').click();
      const docs = page.locator('.documents-step .doc');
      const cont = page.locator('.documents-step .controls button.primary');
      for (let i = 0; i < (await docs.count()) && !(await cont.isEnabled()); i++) await docs.nth(i).click();
      await cont.click();
      await page.locator('.begin-step .controls button.primary').click();
      await expect(page.locator('main.run .strip')).toContainText('1 / 3 · In the queue');
      await expect(page.locator('main.run .strip')).toContainText('8 hours');
      const fresh = await readSave(page);
      expect(fresh.run!.time).toBe(8);
      expect(fresh.run!.checkpoint).toBe(0);
      expect(fresh.endingsSeen).toEqual(['tooLate']);
      expect(fresh.settings).toEqual(settings);
      expect(errors).toEqual([]);
    });
  });
}

test('with one level open the level list never shows, fresh or returning', async ({ page }) => {
  await page.goto('./');
  await page.locator('.title-screen button.begin').click();
  await expect(page.locator('main.begin-step')).toBeVisible();
  await expect(page.locator('main.level-step')).toHaveCount(0);

  // Every ending seen but no level finished on this save: still one level, still no list.
  await openReturning(page);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['homeInTime', 'homeAtCost', 'tooLate', 'turnedBack'], levelsFinished: [] })] as const);
  await page.reload();
  await expect(page.locator('main.title-screen .levels')).toHaveCount(0);
  await page.locator('.title-screen button.begin').click();
  await expect(page.locator('main.traveler-step')).toBeVisible();
  await expect(page.locator('main.level-step')).toHaveCount(0);
  await expect(page.getByText(en['ui.pickLevel'])).toHaveCount(0);
});

test('a finished crossing shows one replay prompt and no list of endings left', async ({ page }) => {
  const run: RunState = { ...lenaRun(), time: 0, checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending: 'tooLate' };
  await withSave(page, { ...freshSave(), run, endingsSeen: ['tooLate'] });
  await page.locator('.title-screen button.resume').click();
  const card = page.locator('.ending-card');
  await expect(card.locator('.replay-prompt')).toHaveCount(1);
  await expect(card.locator('.replay-prompt')).toHaveText(en['ui.replayPrompt']);
  await expect(page.locator('.open-questions')).toHaveCount(0);
  await expect(page.getByText('Still to find out')).toHaveCount(0);
});
