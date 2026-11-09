import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newRun } from '../src/game/engine';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { RunState, Screen } from '../src/game/types';

// One full run on a phone-size screen: title → character → documents → begin → play by
// always taking the first enabled option → ending card.

const MAX_STEPS = 400;

async function noHorizontalScroll(page: Page, where: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, `horizontal scroll on ${where}`).toBeLessThanOrEqual(client);
}

test('plays a full run to an ending at 390x844', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');

  // Title
  await expect(page.locator('.title-screen')).toBeVisible();
  await noHorizontalScroll(page, 'title');
  await page.locator('.title-screen button.primary').click();

  // Character: a tap selects, Continue moves on.
  await expect(page.getByRole('radio').first()).toBeVisible();
  await noHorizontalScroll(page, 'character pick');
  await page.getByRole('radio').first().click();
  await page.locator('.traveler-step .controls button.primary').click();

  // Documents: pack until Continue enables
  const cont = page.locator('.documents-step .controls button.primary');
  const docs = page.locator('.documents-step .doc');
  await expect(docs.first()).toBeVisible();
  await noHorizontalScroll(page, 'document pick');
  const docCount = await docs.count();
  for (let i = 0; i < docCount && !(await cont.isEnabled()); i++) await docs.nth(i).click();
  await expect(cont).toBeEnabled();
  await cont.click();

  // Mission card sets up the one clock: the last bus in 8 hours.
  const mission = page.locator('.begin-step .mission');
  await expect(mission).toContainText('The last bus to the hospital leaves in 8 hours');
  await expect(mission).not.toContainText('days of leave');
  await noHorizontalScroll(page, 'begin');
  await page.locator('.begin-step .controls button.primary').click();

  // Play
  const ending = page.locator('.ending-card');
  const reaction = page.locator('.panel.reaction');
  const waitingSkip = page.locator('.panel.waiting .skip');
  let previous = '';
  let lastReaction = '';
  let steps = 0;

  await expect(page.locator('main.run')).toBeVisible();

  // Time reads as hours until the last bus. Both routine passport cards have a 1-hour
  // option, so the first options screen shows a time cost on an answer's line.
  await expect(page.locator('.strip .stat.time')).toContainText('8 hours left');
  const timeChips: string[] = [];

  for (; steps < MAX_STEPS; steps++) {
    if (await ending.isVisible()) break;
    await noHorizontalScroll(page, `step ${steps}`);

    if (await reaction.isVisible()) {
      lastReaction = (await reaction.innerText()).trim();
      previous = 'reaction';
      await page.locator('main.run .controls button.primary').click();
    } else if (await waitingSkip.isVisible()) {
      previous = 'waiting';
      await page.locator('.panel.waiting').click();
    } else {
      const option = page.locator('main.run .controls button:enabled').first();
      // The waiting screen swaps its skip hint for buttons; give the screen a moment.
      await expect(option).toBeVisible();
      timeChips.push(...(await page.locator('main.run .consequence .part', { hasText: /^Costs / }).allInnerTexts()));
      previous = 'option';
      await option.click();
    }
  }

  expect(steps, 'run did not end').toBeLessThan(MAX_STEPS);
  expect(timeChips.length, 'time costs seen').toBeGreaterThan(0);
  for (const chip of timeChips) expect(chip).toMatch(/^Costs \d+ hours?$/);
  await expect(ending).toBeVisible();
  await expect(ending.locator('h1')).not.toBeEmpty();
  await expect(page.locator('.ending .controls button.primary')).toBeVisible();
  await noHorizontalScroll(page, 'ending');

  // The last officer reaction showed right before the ending card (bug fixed 2026-11-07).
  expect(previous, 'screen before the ending card').toBe('reaction');
  expect(lastReaction).not.toBe('');

  expect(errors, 'console errors').toEqual([]);
});

/** Opens the run on a saved state, as a returning player would. */
async function openAt(page: Page, run: RunState) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run })] as const);
  await page.reload();
  await expect(page.locator('main.run .controls button').first()).toBeVisible();
}

const lenaRun = () => newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });

test('after an answer: the reaction, what changed, and the next action', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const reaction = page.locator('main.run .panel.reaction');
  const next = page.locator('main.run .controls button.primary');

  // Within the checkpoint: the letter puts the address on file, and Continue stays.
  await openAt(page, { ...lenaRun(), screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 1 });
  await page.getByRole('button', { name: /Show your mother's letter/ }).click();
  await expect(reaction).toContainText("Your mother's address is now on file.");
  await expect(next).toHaveText('Continue');

  // The last passport card: the button walks on to customs.
  await openAt(page, { ...lenaRun(), screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 2 });
  await page.getByRole('button', { name: /Show your mother's letter/ }).click();
  await expect(reaction).toContainText("Your mother's address is now on file.");
  await expect(next).toHaveText('Proceed to customs');
  await next.click();
  await expect(page.locator('main.run .queue-title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the medicine check says what is verified, with the header still on screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const screen: Screen = { kind: 'wait', check: 'medicineLab', beats: [0, 1], shown: 2, resolved: { result: 'clear' }, asked: false };
  await openAt(page, { ...lenaRun(), screen, checkpoint: 1, slot: 1 });

  const panel = page.locator('main.run .panel.waiting');
  await expect(panel.locator('h2')).toHaveText('Medicine check');
  await expect(panel).toContainText('The medicine has gone for testing.');
  await expect(panel.locator('.verifying')).toHaveText('Verification in progress');
  await expect(panel.locator('.dots i')).toHaveCount(3);
  await expect(panel.locator('.dots i.now')).toHaveCount(1);

  const buttons = page.locator('main.run .controls button');
  await expect(buttons.nth(0)).toHaveText('Wait for the result');
  await expect(buttons.nth(0)).toHaveClass(/wait-go/);
  await expect(buttons.nth(1)).toContainText('Ask for an update');
  await expect(buttons.nth(1).locator('.consequence')).toHaveText('Your urgency goes on file');
  await expect(page.locator('.strip .stat.time')).toContainText('8 hours left');
  await expect(page.locator('.strip .scrutiny')).toContainText('Scrutiny');

  // Asking puts the urgency on file, and the reaction says so.
  await buttons.nth(1).click();
  await expect(page.locator('main.run .panel.reaction')).toContainText('Your urgency is now on file.');
  expect(errors).toEqual([]);
});
