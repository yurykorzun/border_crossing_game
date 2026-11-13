import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { playRun } from '../src/game/bots';
import { newRun } from '../src/game/engine';
import type { RunSetup } from '../src/game/engine';
import { EXPLANATIONS, explanationsOn } from '../src/game/explain';
import { playStep } from '../src/game/play';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { RunState } from '../src/game/types';
import { en } from '../src/i18n/en';
import { openSaved, resume } from './returning';

// First-run explanations (border_crossing_game-dap.9, dap.40): on a fresh save the first
// hour lost explains, under the reaction, how time works; the next hour lost does not.
// The save keeps it from the moment it shows, so a reload, Retry or a later run never
// shows it again.

const MAX_STEPS = 120;
const card = (page: Page, id: string) => page.locator(`main.run .explain p[data-explain-id="${id}"]`);
const savedExplained = (page: Page) =>
  page.evaluate((k) => (JSON.parse(localStorage.getItem(k) ?? '{}').explained ?? []) as string[], SAVE_KEY);

/** Plays Arrival on screen, answers that cost hours first; calls onLost on each hour-lost reaction before tapping on. */
async function playArrival(page: Page, onLost: (n: number) => Promise<void>, until = Infinity): Promise<number> {
  const reaction = page.locator('main.run .panel.reaction');
  const waitingSkip = page.locator('.panel.waiting .skip');
  const lost = /\d+ hours? lost\./;
  let hoursLost = 0;
  for (let steps = 0; steps < MAX_STEPS && hoursLost < until; steps++) {
    if (await page.locator('.ending-card').isVisible()) break;
    if (await reaction.isVisible()) {
      if (lost.test(await reaction.innerText())) await onLost(++hoursLost);
      else await expect(card(page, 'time')).toHaveCount(0);
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
  return hoursLost;
}

test('a fresh save explains time once, saves it as it shows, and not after a reload or on Retry, at 390x844', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // A first run: Begin opens the begin screen straight away, with the first run's packing.
  await page.locator('.title-screen button.primary').click();
  await page.locator('.begin-step .controls button.primary').click();
  await expect(page.locator('main.run')).toBeVisible();

  const first = await playArrival(page, async (n) => {
    if (n === 1) {
      await expect(card(page, 'time')).toHaveText(en['explain.time']);
      await expect(card(page, 'time')).toBeInViewport();
      const box = await card(page, 'time').boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(844);
      // Saved while it shows, before any tap.
      expect(await savedExplained(page)).toContain('time');
      // A reload on the same reaction brings the run back without it.
      await page.reload();
      await resume(page);
      await expect(page.locator('main.run .panel.reaction')).toContainText(/\d+ hours? lost\./);
      await expect(card(page, 'time')).toHaveCount(0);
    } else {
      await expect(card(page, 'time')).toHaveCount(0);
    }
  });
  expect(first, 'hours lost on the first run').toBeGreaterThanOrEqual(2);
  await expect(page.locator('.ending-card')).toBeVisible();
  expect(await savedExplained(page)).toContain('time');

  // Retry Arrival: the same run again, and no hour lost explains anything.
  await page.getByRole('button', { name: 'Retry Arrival', exact: true }).click();
  await page.locator('.begin-step .controls button.primary').click();
  await expect(page.locator('main.run')).toBeVisible();
  const again = await playArrival(page, async () => {
    await expect(page.locator('main.run .explain')).toHaveCount(0);
  });
  expect(again, 'hours lost on the retry').toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

/** A long Mark run that loses hours, gains scrutiny and meets a challenge card (as in src/game/explain.test.ts). */
const MARK: RunSetup = { level: 'arrival', character: 'mark', loadout: ['hotel', 'employerLetter', 'hospitalNote', 'deed'], bulletin: 'records', seed: 128 };
/** The same packing on another day, a later run that reaches all three triggers too. */
const LATER: RunSetup = { ...MARK, seed: 139 };

function screens(setup: RunSetup): RunState[] {
  let s = newRun(setup);
  const out = [s];
  for (const a of playRun('random', setup).actions) out.push((s = playStep(s, a)));
  return out;
}

test('time, scrutiny and a caught claim each show on the first run, are saved, and not after a reload or in a later run, at 390x844', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const firstRun = screens(MARK);
  const laterRun = screens(LATER);
  let explained: string[] = [];
  for (const id of EXPLANATIONS) {
    const at = firstRun.find((s) => explanationsOn(s).includes(id));
    const later = laterRun.find((s) => explanationsOn(s).includes(id));
    expect(at, `${id} on the first run`).toBeDefined();
    expect(later, `${id} on the later run`).toBeDefined();

    // The first run, on the screen where it first matters.
    await openSaved(page, { ...freshSave(), explained, run: at! });
    await expect(card(page, id)).toHaveText(en[`explain.${id}`]);
    await expect(card(page, id)).toBeInViewport();
    const box = await card(page, id).boundingBox();
    expect(box!.y + box!.height, id).toBeLessThanOrEqual(844);
    explained = await savedExplained(page);
    expect(explained, id).toContain(id);

    // A reload on that screen.
    await page.reload();
    await resume(page);
    await expect(page.locator('main.run')).toBeVisible();
    await expect(card(page, id)).toHaveCount(0);

    // A later run on the same save, at the screen that would trigger it.
    await openSaved(page, { ...freshSave(), explained, run: later! });
    await expect(page.locator('main.run')).toBeVisible();
    await expect(card(page, id)).toHaveCount(0);
  }
  expect([...explained].sort()).toEqual([...EXPLANATIONS].sort());
  expect(errors).toEqual([]);
});
