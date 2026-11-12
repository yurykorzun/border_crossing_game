import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { BOT_STYLES, playRun, setupFor } from '../src/game/bots';
import { axisLines, decisive } from '../src/game/consequence';
import { endingText, newRun } from '../src/game/engine';
import { tryStep } from '../src/game/play';
import { freshSave } from '../src/game/save';
import { t } from '../src/i18n';
import type { RunState } from '../src/game/types';
import { openSaved } from './returning';

// The ending names the choices that decided it (border_crossing_game-dap.7): at 390x844
// the list of decisive answers and the three axis lines are on the ending, and "Your run"
// above them stays reachable, clear of the sticky buttons, however long the aftermath.

function seeded(text: string): RunState {
  for (let i = 0; i < 300; i++)
    for (const style of BOT_STYLES) {
      // Played again through tryStep(), as the game moves a run, so it carries its answers.
      let s = newRun(setupFor(i));
      for (const a of playRun(style, setupFor(i)).actions) s = tryStep(s, a).state;
      // The last officer line already read, so the save opens on the ending itself.
      if (endingText(s) === text) return { ...s, reaction: null, changes: null };
    }
  throw new Error(`no seeded run ends ${text}`);
}

/** Scrolls `el` into view and checks it sits on screen, above the sticky controls. */
async function readable(page: Page, el: Locator, name: string) {
  // As a player would scroll to it: to the middle of the screen, or as far as the page goes.
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await expect(el, name).toBeInViewport();
  const box = (await el.boundingBox())!;
  const controls = (await page.locator('main.ending .controls').boundingBox())!;
  expect(box.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${name} above the buttons`).toBeLessThanOrEqual(controls.y + 1);
}

for (const text of ['homeAtCost', 'missedBus']) {
  test(`the ${text} ending lists the decisive answers and the three axis lines at 390x844`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const run = seeded(text);
    const decided = decisive(run);
    await page.goto('./');
    await openSaved(page, { ...freshSave(), run });

    const card = page.locator('.ending-card');
    await expect(card.locator('h1')).toHaveText(t(`ending.${text}.title`));
    const section = card.locator('.decided');
    await expect(section.locator('h3')).toHaveText(t('ending.decided.heading'));
    const items = section.locator('.decisive-answer');
    await expect(items).toHaveCount(decided.length);
    expect(decided.length).toBeGreaterThanOrEqual(2);
    expect(decided.length).toBeLessThanOrEqual(3);
    for (const [i, d] of decided.entries()) {
      await expect(items.nth(i).locator('.decisive-desk')).toHaveText(t('ending.decided.at', { desk: d.desk }));
      await expect(items.nth(i).locator('.decisive-label')).toHaveText(t(d.key, d.vars));
      await expect(items.nth(i).locator('.decisive-cost')).not.toBeEmpty();
      await readable(page, items.nth(i), `answer ${i + 1}`);
    }
    const axes = section.locator('.axis');
    await expect(axes).toHaveCount(3);
    for (const [i, l] of axisLines(run).entries()) {
      await expect(axes.nth(i)).toHaveText(`${t(`ending.axis.${l.axis}`)}: ${t(l.key, l.vars)}`);
      await readable(page, axes.nth(i), `${l.axis} line`);
    }
    // "Your run" is still there to read, and the next step stays in view.
    await readable(page, card.locator('.run-summary h3'), 'Your run');
    await expect(card.locator('.run-summary h3')).toHaveText(t('ui.runSummary'));
    await readable(page, card.locator('.run-summary .result-rows'), 'the summary rows');
    await expect(page.getByRole('button', { name: 'Continue to Departure', exact: true })).toBeInViewport({ ratio: 1 });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
  });
}
