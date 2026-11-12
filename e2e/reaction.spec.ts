import { expect, test } from '@playwright/test';
import { newRun, options } from '../src/game/engine';
import { freshSave } from '../src/game/save';
import { en } from '../src/i18n/en';
import type { RunState } from '../src/game/types';
import { openSaved } from './returning';

// Design rule 3 (border_crossing_game-dap.6): after an answer the screen shows what happened,
// what changed and what it resolves. At 390x844 all three fit on the screen right after the
// answer, so the player reads them without scrolling.

test('a verified answer shows happened, changed and resolves without scrolling at 390x844', async ({ page }) => {
  // Lena at passport, asked how long she stays, with the return ticket packed: it answers outright.
  const base = newRun({ character: 'lena', loadout: ['returnTicket', 'employerLetter', 'deed'], bulletin: 'records', seed: 7 });
  const run: RunState = { ...base, reaction: null, screen: { kind: 'encounter', id: 'p_stay' }, seen: ['p_stay'], slot: 2 };
  const index = options(run).findIndex((o) => o.approach.id === 'evidence' && o.card === 'returnTicket');
  expect(index).toBeGreaterThanOrEqual(0);

  await page.goto('./');
  await openSaved(page, { ...freshSave(), run });
  const choices = page.locator('main.run .controls button.choice');
  await expect(choices.first()).toBeVisible();
  await choices.nth(index).click();

  const reaction = page.locator('.panel.reaction');
  await expect(reaction).toBeVisible();
  const happened = reaction.locator('[data-line="happened"]');
  const changed = reaction.locator('[data-line="changed"]');
  const resolves = reaction.locator('[data-line="resolves"]');
  await expect(happened).not.toBeEmpty();
  await expect(changed).not.toBeEmpty();
  await expect(resolves).toHaveText(en['resolve.stay']);
  await expect(reaction).not.toContainText(/disproof|suspicion|testimony/i);

  // Nothing scrolled, and each of the three ends inside the screen.
  await page.waitForTimeout(500); // the lines fade in
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const height = page.viewportSize()!.height;
  for (const [name, el] of [['happened', happened], ['changed', changed], ['resolves', resolves]] as const) {
    const box = await el.boundingBox();
    expect(box, name).not.toBeNull();
    expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(height);
  }
});
