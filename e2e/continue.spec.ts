// Explicit continuation (border_crossing_game-dap.8, docs/design.md rule 7): a finished
// Arrival offers Retry Arrival, Continue to Departure and Choose a crossing, each going where
// it says. Continue to Departure opens Departure as the same traveler with this run's file,
// and the file screen says in one line what carrying it changes. The title offers Resume
// crossing only while a run is unfinished.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { newRun } from '../src/game/engine';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { SaveData } from '../src/game/save';
import { CHARACTERS, CHARACTER_IDS } from '../src/game/content/world';
import type { CharacterId } from '../src/game/types';
import { openReturning } from './returning';

const readSave = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), SAVE_KEY) as Promise<SaveData>;

/** Packs the first slots and begins. */
async function packAndBegin(page: Page, slots: number) {
  const docs = page.locator('.documents-step .doc');
  for (let i = 0; i < slots; i++) await docs.nth(i).click();
  await page.locator('.documents-step .controls button.primary').click();
  await page.locator('.begin-step .controls button.primary').click();
  await expect(page.locator('main.run')).toBeVisible();
}

/** Leaves the passport queue: the quickest real end to a run. Skip what you have read is a quiet button too, so it is left out. */
async function turnBack(page: Page) {
  const run = page.locator('main.run');
  const button = run.locator('.controls button.turn-back:not(.skip-read)');
  for (let i = 0; i < 20 && !(await button.isVisible()); i++) await run.locator('.controls button.primary').click();
  await button.click();
  await run.locator('.controls button.primary').click();
  await expect(page.locator('.ending-card')).toBeVisible();
}

/** Plays Arrival as `who` from a returning save with only Arrival open, to its ending. */
async function finishArrival(page: Page, who: CharacterId) {
  await openReturning(page, []);
  await page.locator('.title-screen button.begin').click();
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf(who)).click();
  await page.locator('.traveler-step .controls button.primary').click();
  await packAndBegin(page, CHARACTERS[who].evidenceSlots);
  await turnBack(page);
}

const endingButtons = (page: Page) => page.locator('main.ending .controls button');

for (const who of ['lena', 'mark'] as const) {
  test(`after Arrival as ${who}, Continue to Departure opens Departure with that traveler and that run's file`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await finishArrival(page, who);

    // The three next steps, beside See border records, all on screen at 390x844.
    await expect(endingButtons(page)).toHaveText([en['ui.seeOnFile'], 'Retry Arrival', 'Choose a crossing', 'Continue to Departure']);
    for (let i = 0; i < 4; i++) await expect(endingButtons(page).nth(i)).toBeInViewport({ ratio: 1 });
    await expect(page.locator('main.ending .controls button.primary')).toHaveText('Continue to Departure');
    const file = (await readSave(page)).file!;
    expect(file.level).toBe('arrival');
    expect(file.character).toBe(who);

    await page.getByRole('button', { name: 'Continue to Departure', exact: true }).click();
    // No level list and no traveler screen: Departure's file screen, this traveler's own file.
    const record = page.locator('main.record-step');
    await expect(record).toBeVisible();
    await expect(page.locator('main.level-step, main.traveler-step')).toHaveCount(0);
    await expect(record.locator('[data-record] h2')).toHaveText(en['ui.record.title']);
    await expect(record.locator('.record-carries')).toHaveText(en['ui.record.carries']);
    const name = en[`char.${who}.name`];
    await record.getByRole('button', { name: `Continue ${name}'s crossing` }).click();

    await packAndBegin(page, CHARACTERS[who].evidenceSlots);
    const run = (await readSave(page)).run!;
    expect(run.level).toBe('departure');
    expect(run.character).toBe(who);
    expect(run.file).toEqual(file);
    expect(errors).toEqual([]);
  });
}

test('after Arrival, Retry Arrival opens the same setup and Choose a crossing opens the level list', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await finishArrival(page, 'lena');
  const ended = (await readSave(page)).run!;

  await page.getByRole('button', { name: 'Retry Arrival', exact: true }).click();
  const begin = page.locator('main.begin-step.same-setup');
  await expect(begin).toBeVisible();
  await expect(begin.locator('.begin-traveler')).toContainText('Lena');
  await begin.locator('.controls button.primary').click();
  const retried = (await readSave(page)).run!;
  expect(retried.level ?? 'arrival').toBe('arrival');
  expect([retried.character, retried.loadout, retried.seed]).toEqual([ended.character, ended.loadout, ended.seed]);

  await turnBack(page);
  await page.getByRole('button', { name: 'Choose a crossing', exact: true }).click();
  const list = page.locator('main.level-step');
  await expect(list).toBeVisible();
  await expect(list.locator('button.level[data-level="arrival"]')).toBeEnabled();
  await expect(list.locator('button.level[data-level="departure"]')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('after Departure, the last crossing, the ending offers Retry Departure and Choose a crossing', async ({ page }) => {
  await finishArrival(page, 'lena');
  await page.getByRole('button', { name: 'Continue to Departure', exact: true }).click();
  await page.locator('main.record-step button.record-continue').click();
  await packAndBegin(page, CHARACTERS.lena.evidenceSlots);
  await turnBack(page);
  await expect(endingButtons(page)).toHaveText([en['ui.seeOnFile'], 'Retry Departure', 'Choose a crossing']);
  await expect(page.locator('main.ending .controls button.primary')).toHaveText('Choose a crossing');
});

test('the title shows Resume crossing only while a run is unfinished', async ({ page }) => {
  const run = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
  const open = async (data: SaveData) => {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(data)] as const);
    await page.reload();
  };
  await page.goto('./');

  // Unfinished: the title, with Resume crossing.
  await open({ ...freshSave(), endingsSeen: ['tooLate'], levelsFinished: ['arrival'], run });
  await expect(page.locator('.title-screen button.resume')).toHaveText(en['ui.resume']);

  // Finished: no Resume crossing anywhere; the ending and its next steps.
  await open({ ...freshSave(), endingsSeen: ['tooLate'], levelsFinished: ['arrival'], run: { ...run, screen: { kind: 'ending' }, checkpoint: 3, ending: 'turnedBack' } });
  await expect(page.locator('.ending-card')).toBeVisible();
  await expect(page.getByRole('button', { name: en['ui.resume'] })).toHaveCount(0);

  // No run: Begin.
  await open({ ...freshSave(), endingsSeen: ['tooLate'], levelsFinished: ['arrival'] });
  await expect(page.locator('.title-screen button.begin')).toBeVisible();
  await expect(page.getByRole('button', { name: en['ui.resume'] })).toHaveCount(0);
});
