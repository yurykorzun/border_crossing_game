import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newRun } from '../src/game/engine';
import { CHECKS, ENCOUNTERS, INSPECTIONS } from '../src/game/content/encounters';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { RunState, Screen } from '../src/game/types';
import { CHECKPOINTS } from '../src/game/types';

// The run screen at 390x844: scene, dialogue and answers fit together with no page
// scroll, the dialogue sits right under the scene, and the tray stays at the bottom.

const MAX_GAP = 16;

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const scene = box('main.run .scene');
    const panel = box('main.run .panel');
    const buttons = [...document.querySelectorAll('main.run .controls button, main.run .tools button')]
      .map((b) => b.getBoundingClientRect().bottom);
    return {
      pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      gap: scene && panel ? panel.top - scene.bottom : null,
      lowestButton: Math.max(...buttons),
      viewport: window.innerHeight,
    };
  });
}

async function expectFits(page: Page, where: string) {
  const m = await measure(page);
  expect(m.pageScroll, `page scroll on ${where}`).toBeLessThanOrEqual(0);
  expect(m.gap, `scene-to-dialogue gap on ${where}`).not.toBeNull();
  expect(m.gap!, `scene-to-dialogue gap on ${where}`).toBeLessThanOrEqual(MAX_GAP);
  expect(m.lowestButton, `a button below the screen on ${where}`).toBeLessThanOrEqual(m.viewport);
}

test('run screen: strip, scrutiny sheet, settings sheet and fit at 390x844', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await page.locator('.title-screen button.primary').click();

  // Mark starts with 1 scrutiny.
  await page.locator('.setup .choice').nth(CHARACTER_IDS.indexOf('mark')).click();
  const cont = page.locator('.setup .controls button.primary');
  const docs = page.locator('.setup .doc');
  for (let i = 0; !(await cont.isEnabled()); i++) await docs.nth(i).click();
  await cont.click();

  const strip = page.locator('main.run .strip');
  await expect(strip).toContainText('1/3 · Passport control');
  const scrutiny = strip.getByRole('button', { name: 'Scrutiny 1/3' });
  await expect(scrutiny).toBeVisible();
  await expect(strip).not.toContainText('Noticed');
  await expectFits(page, 'first question');

  // Tapping scrutiny explains it in a sheet.
  await scrutiny.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('how closely the officers are watching you');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();

  // Shorter waits, sound and reduced motion live in Settings, not on the run screen.
  await expect(page.locator('main.run').getByText('Shorter waits')).toBeHidden();
  await page.locator('main.run .tools').getByRole('button', { name: 'Settings' }).click();
  await expect(dialog).toBeVisible();
  const shorter = dialog.getByRole('checkbox', { name: 'Shorter waits' });
  await expect(shorter).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Sound' })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Reduce motion' })).not.toBeChecked();
  await shorter.check();
  await dialog.getByRole('button', { name: 'Close' }).click();
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}'), SAVE_KEY);
  expect(saved.settings.reduceWait).toBe(true);

  // The tray holds My story, Evidence and Settings.
  await expect(page.locator('main.run .tools button')).toHaveText([/My story/, /Evidence/, /Settings/]);
  expect(errors).toEqual([]);
});

/** Every card and every finished waiting room, for each character: the crowded states. */
function crowdedStates(): { name: string; run: RunState }[] {
  const out: { name: string; run: RunState }[] = [];
  for (const id of CHARACTER_IDS) {
    const base = newRun({ character: id, loadout: EVIDENCE_IDS.slice(0, CHARACTERS[id].evidenceSlots), bulletin: 'records', seed: 7 });
    const at = (screen: Screen, checkpoint: number): RunState => ({ ...base, reaction: null, screen, checkpoint, slot: 1 });
    for (const e of ENCOUNTERS) {
      const cp = e.checkpoint === 'followup' ? 2 : CHECKPOINTS.indexOf(e.checkpoint);
      out.push({ name: `${id} ${e.id}`, run: at({ kind: 'encounter', id: e.id }, cp) });
    }
    for (const i of INSPECTIONS) out.push({ name: `${id} ${i.id}`, run: at({ kind: 'inspection', id: i.id }, 1) });
    for (const c of Object.values(CHECKS)) {
      const beats = Array.from({ length: c.beats }, (_, n) => n);
      const screen: Screen = { kind: 'wait', check: c.id, beats, shown: beats.length, resolved: { result: 'clear' }, asked: false };
      out.push({ name: `${id} wait ${c.id}`, run: at(screen, 1) });
    }
  }
  return out;
}

test('every card and waiting room fits at 390x844 with no page scroll', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  for (const { name, run } of crowdedStates()) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run })] as const);
    await page.reload();
    await expect(page.locator('main.run .controls button').first(), name).toBeVisible();
    await expectFits(page, name);
  }
  expect(errors).toEqual([]);
});
