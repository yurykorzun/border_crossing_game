import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';

// The three setup screens at 390x844: Choose your traveler, Prepare your documents, Begin the crossing.

async function fits(page: Page, where: string) {
  const m = await page.evaluate(() => {
    const button = document.querySelector('.traveler-step .controls button')!.getBoundingClientRect();
    return {
      pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      bodyScroll: (() => { const b = document.querySelector('.setup-body')!; return b.scrollHeight - b.clientHeight; })(),
      buttonBottom: button.bottom,
      viewport: window.innerHeight,
    };
  });
  expect(m.pageScroll, `page scroll on ${where}`).toBeLessThanOrEqual(0);
  expect(m.bodyScroll, `content scroll on ${where}`).toBeLessThanOrEqual(0);
  expect(m.buttonBottom, `button below the screen on ${where}`).toBeLessThanOrEqual(m.viewport);
}

test('choose your traveler: radio cards, history, and Continue as the pick', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await page.locator('.title-screen button.primary').click();

  const screen = page.locator('main.traveler-step');
  await expect(screen.getByText('Purpose of Visit')).toBeVisible();
  await expect(screen.getByRole('heading', { name: 'Choose your traveler' })).toBeVisible();

  // A two-sentence premise at most: count every sentence that ends in . ! or ?
  const premise = (await screen.locator('.premise').innerText()).trim();
  const sentences = premise.match(/[^.!?]+[.!?]+/g) ?? [];
  // Every character belongs to a counted sentence, so an unpunctuated tail cannot hide.
  expect(sentences.join(''), premise).toBe(premise);
  expect(sentences.length, premise).toBeGreaterThan(0);
  expect(sentences.length, premise).toBeLessThanOrEqual(2);

  const group = screen.getByRole('radiogroup', { name: 'Choose your traveler' });
  const cards = group.getByRole('radio');
  await expect(cards).toHaveCount(CHARACTER_IDS.length);
  for (const [i, id] of CHARACTER_IDS.entries()) {
    const card = cards.nth(i);
    await expect(card).toHaveAttribute('aria-checked', 'false');
    await expect(card).toContainText(en[`char.${id}.name`]);
    await expect(card).toContainText('Advantage');
    await expect(card).toContainText('Complication');
    await expect(card).toContainText(en[`char.${id}.advantage`]);
    await expect(card).toContainText(en[`char.${id}.complication`]);
    // Each card names its 3 history traits.
    const traits = card.locator('.trait');
    await expect(traits).toHaveText(CHARACTERS[id].background.map((b) => en[`bg.${b}.short`]));
    await expect(card.locator('.portrait')).toBeVisible();
  }
  expect(en['char.lena.advantage']).toBe('Resolve one work question without a document.');
  expect(en['char.lena.complication']).toBe('Employer checks take one extra hour.');
  expect(en['char.mark.advantage']).toBe('Pack 4 documents instead of 3.');
  expect(en['char.mark.complication']).toBe('Start with Scrutiny 1/3.');

  await expect(screen.locator('.chip')).toHaveCount(0);

  const cont = screen.locator('.controls button.primary');
  await expect(cont).toBeDisabled();
  const detail = screen.locator('.history-detail');
  await expect(detail.locator('li')).toHaveCount(0);
  await fits(page, 'no pick');

  // Tapping Lena selects her and stays on this screen.
  const lena = cards.nth(CHARACTER_IDS.indexOf('lena'));
  const mark = cards.nth(CHARACTER_IDS.indexOf('mark'));
  await lena.click();
  await expect(lena).toHaveAttribute('aria-checked', 'true');
  await expect(mark).toHaveAttribute('aria-checked', 'false');
  await expect(cont).toBeEnabled();
  await expect(cont).toHaveText('Continue as Lena');
  await expect(screen).toBeVisible();
  // Only the selected traveler's history is spelled out.
  await expect(detail.locator('li')).toHaveText(CHARACTERS.lena.background.map((b) => en[`bg.${b}`]));
  await fits(page, 'Lena picked');

  // Arrow keys move the selection, as in a radio group.
  await lena.press('ArrowDown');
  await expect(mark).toHaveAttribute('aria-checked', 'true');
  await expect(mark).toBeFocused();
  await expect(cont).toHaveText('Continue as Mark');
  await expect(detail.locator('li')).toHaveText(CHARACTERS.mark.background.map((b) => en[`bg.${b}`]));
  await fits(page, 'Mark picked');

  await cont.click();
  await expect(page.locator('.setup .doc').first()).toBeVisible();
  await expect(page.locator('.setup .controls button.primary')).toHaveText('Continue');
  expect(errors).toEqual([]);
});

/** Each setup screen fits at 390x844, or its body scrolls and the primary button stays in view. */
async function stepFits(page: Page, where: string) {
  const m = await page.evaluate(() => {
    const body = document.querySelector('.setup-step .setup-body')!;
    const button = document.querySelector('.setup-step .controls button.primary')!.getBoundingClientRect();
    return {
      pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      bodyScrolls: body.scrollHeight > body.clientHeight,
      buttonTop: button.top,
      buttonBottom: button.bottom,
      viewport: window.innerHeight,
    };
  });
  expect(m.pageScroll, `page scroll on ${where}`).toBeLessThanOrEqual(0);
  expect(m.buttonTop, `button off the top on ${where}`).toBeGreaterThanOrEqual(0);
  expect(m.buttonBottom, `button below the screen on ${where}`).toBeLessThanOrEqual(m.viewport);
  if (m.bodyScrolls) {
    // Scrolled to the end, the button is still pinned in view.
    await page.locator('.setup-step .setup-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
    const after = await page.locator('.setup-step .controls button.primary').boundingBox();
    expect(after!.y + after!.height, `pinned button after scrolling ${where}`).toBeLessThanOrEqual(m.viewport);
  }
}

test('prepare your documents, begin the crossing, and Back keeps the picks', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');

  // Title, then each setup heading in order, into the first queue.
  await expect(page.locator('.title-screen h1')).toHaveText('Purpose of Visit');
  await page.locator('.title-screen button.primary').click();
  await expect(page.getByRole('heading', { name: 'Choose your traveler' })).toBeVisible();
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena')).click();
  await page.locator('.traveler-step .controls button.primary').click();

  // Screen 2: bulletin, hours and 3/3 explained, the packing list.
  const docsScreen = page.locator('main.documents-step');
  await expect(docsScreen.getByRole('heading', { name: 'Prepare your documents' })).toBeVisible();
  await expect(docsScreen.getByRole('note')).toContainText("Today's bulletin");
  await expect(docsScreen.locator('.explain-hours')).toHaveText('Every check costs hours. The bus leaves in 8 hours. You need 2 hours to reach the station.');
  await expect(docsScreen.locator('.explain-scrutiny')).toHaveText('Officers grow suspicious. At 3/3 you are taken aside.');
  await expect(docsScreen.locator('.doc')).toHaveCount(EVIDENCE_IDS.length);
  await stepFits(page, 'documents, nothing packed');

  // Pack Lena's 3: the second, fourth and fifth documents.
  const chosen = [EVIDENCE_IDS[1], EVIDENCE_IDS[3], EVIDENCE_IDS[4]];
  const cont = docsScreen.locator('.controls button.primary');
  for (const id of chosen) await docsScreen.locator('.doc', { hasText: en[`ev.${id}.name`] }).click();
  await expect(cont).toBeEnabled();
  await expect(docsScreen.locator('.doc[aria-pressed="true"] strong')).toHaveText(chosen.map((id) => en[`ev.${id}.name`]));
  await stepFits(page, 'documents, 3 packed');
  await cont.click();

  // Screen 3: the mission, the rest of the premise, exactly the packed documents.
  const begin = page.locator('main.begin-step');
  await expect(begin.getByRole('heading', { name: 'Begin the crossing' })).toBeVisible();
  await expect(begin.locator('.mission')).toContainText('Reach the last bus with at least 2 hours left.');
  await expect(begin.locator('.mission')).toContainText('medicine');
  await expect(begin.locator('.mission')).toContainText('cash');
  await expect(begin.locator('.mission')).toContainText('phone');
  // One clock only (67a.11): the title says whose care it is, and no days of leave.
  await expect(begin.locator('.mission')).toContainText('Your father has had a stroke');
  await expect(begin.locator('.mission')).not.toContainText('days');
  await expect(begin.locator('.packed-list li')).toHaveText(chosen.map((id) => en[`ev.${id}.name`]));
  await stepFits(page, 'begin');

  // Back to screen 2: the same documents are still marked Packed.
  await begin.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(docsScreen.getByRole('heading', { name: 'Prepare your documents' })).toBeVisible();
  await expect(docsScreen.locator('.doc[aria-pressed="true"] strong')).toHaveText(chosen.map((id) => en[`ev.${id}.name`]));
  await expect(docsScreen.locator('.doc.picked .tag.packed')).toHaveCount(chosen.length);

  // Back to screen 1: Lena is still the pick.
  await docsScreen.getByRole('button', { name: 'Back', exact: true }).click();
  const lena = page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena'));
  await expect(lena).toHaveAttribute('aria-checked', 'true');
  await page.locator('.traveler-step .controls button.primary').click();
  await expect(docsScreen.locator('.doc[aria-pressed="true"]')).toHaveCount(chosen.length);
  await cont.click();

  // The primary button starts the first queue.
  const go = begin.locator('.controls button.primary');
  await expect(go).toHaveText('Begin the crossing');
  await go.click();
  await expect(page.locator('main.run .strip')).toContainText('1/3 · Passport control');
  expect(errors).toEqual([]);
});
