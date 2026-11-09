import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';

// The three setup screens at 390x844: Choose your traveler, Pack your documents, Begin the crossing.

/** The traveler screen: no page scroll, and Continue in view. `bodyMayScroll` for the open history. */
async function fits(page: Page, where: string, bodyMayScroll = false) {
  const m = await page.evaluate(() => {
    const button = document.querySelector('.traveler-step .controls button')!.getBoundingClientRect();
    return {
      pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      bodyScroll: (() => { const b = document.querySelector('.setup-body')!; return b.scrollHeight - b.clientHeight; })(),
      buttonTop: button.top,
      buttonBottom: button.bottom,
      viewport: window.innerHeight,
    };
  });
  expect(m.pageScroll, `page scroll on ${where}`).toBeLessThanOrEqual(0);
  if (!bodyMayScroll) expect(m.bodyScroll, `content scroll on ${where}`).toBeLessThanOrEqual(0);
  expect(m.buttonTop, `button off the top on ${where}`).toBeGreaterThanOrEqual(0);
  expect(m.buttonBottom, `button below the screen on ${where}`).toBeLessThanOrEqual(m.viewport);
}

test('choose your traveler: premise heading, role lines, history link, Continue as the pick', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await page.locator('.title-screen button.primary').click();

  const screen = page.locator('main.traveler-step');
  await expect(screen.locator('.setup-title')).toHaveText('Purpose of Visit');
  await expect(screen.locator('.traveler-scene')).toBeVisible();
  await expect(screen.locator('.stage-label')).toHaveText('1 / 3 · Traveler');
  await expect(screen.locator('.stage-label .amber')).toHaveText('1 / 3');
  await expect(screen.getByRole('heading', { name: "You're going home. Your father is in the hospital." })).toBeVisible();

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
  const lena = cards.nth(CHARACTER_IDS.indexOf('lena'));
  const mark = cards.nth(CHARACTER_IDS.indexOf('mark'));
  // One bold name line and one short line per card, and the portrait.
  await expect(lena.locator('.traveler-name')).toHaveText('Lena · Software tester');
  await expect(mark.locator('.traveler-name')).toHaveText('Mark · Dual citizen');
  await expect(lena.locator('.traveler-line')).toHaveText('Resolve one work question without a document.');
  await expect(mark.locator('.traveler-line')).toHaveText('Pack 4 documents · Start at Scrutiny 1/3');
  for (const card of [lena, mark]) {
    await expect(card).toHaveAttribute('aria-checked', 'false');
    await expect(card.locator('.portrait')).toBeVisible();
    await expect(card.locator('.radio svg')).toHaveCount(0);
  }

  await expect(screen.locator('.consequence')).toHaveCount(0);

  const cont = screen.locator('.controls button.primary');
  await expect(cont).toBeDisabled();
  await expect(screen.locator('.history-toggle')).toHaveCount(0);
  await fits(page, 'no pick');

  // Tapping Lena selects her and stays on this screen; the picked card gets the amber check.
  await lena.click();
  await expect(lena).toHaveAttribute('aria-checked', 'true');
  await expect(mark).toHaveAttribute('aria-checked', 'false');
  await expect(lena.locator('.radio svg')).toHaveCount(1);
  await expect(cont).toBeEnabled();
  await expect(cont).toHaveText('Continue as Lena');
  await expect(screen).toBeVisible();

  // Her history is closed until the link is activated.
  const toggle = screen.getByRole('button', { name: "Read Lena's history" });
  const detail = screen.locator('.history-detail');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(detail).toBeHidden();
  await fits(page, 'Lena picked, history closed');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(detail.locator('li')).toHaveText(CHARACTERS.lena.background.map((b) => en[`bg.${b}`]));
  await expect(detail).toBeVisible();
  await fits(page, 'Lena picked, history open', true);
  await expect(cont).toBeInViewport();

  // Arrow keys move the selection, as in a radio group; the new pick starts closed.
  await lena.press('ArrowDown');
  await expect(mark).toHaveAttribute('aria-checked', 'true');
  await expect(mark).toBeFocused();
  await expect(cont).toHaveText('Continue as Mark');
  const markToggle = screen.getByRole('button', { name: "Read Mark's history" });
  await expect(markToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(detail).toBeHidden();
  await fits(page, 'Mark picked, history closed');
  await markToggle.click();
  await expect(markToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(detail.locator('li')).toHaveText(CHARACTERS.mark.background.map((b) => en[`bg.${b}`]));
  await fits(page, 'Mark picked, history open', true);

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
  await expect(page.getByRole('radiogroup', { name: 'Choose your traveler' })).toBeVisible();
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena')).click();
  await page.locator('.traveler-step .controls button.primary').click();

  // Screen 2: stage, title and count, the bulletin bar, six one-line rows.
  const docsScreen = page.locator('main.documents-step');
  await expect(docsScreen.getByRole('heading', { name: 'Pack your documents' })).toBeVisible();
  await expect(docsScreen.locator('.stage-label')).toHaveText('2 / 3 · Preparation');
  await expect(docsScreen.locator('.stage-label .amber')).toHaveText('2 / 3');
  await expect(docsScreen.locator('.pack-count')).toHaveText('0 of 3 packed');

  // The bulletin is one sentence: exactly one terminal . ! or ?, at the end.
  const bulletin = docsScreen.getByRole('note', { name: "Today's bulletin" });
  await expect(bulletin.locator('svg.icon')).toHaveCount(1);
  const sentence = (await bulletin.innerText()).trim();
  expect(sentence.match(/[.!?]/g), sentence).toHaveLength(1);
  expect(sentence, sentence).toMatch(/[.!?]$/);

  // Every row: a short name and one detail line.
  const rows = docsScreen.locator('.doc');
  await expect(rows).toHaveCount(EVIDENCE_IDS.length);
  for (const [i, id] of EVIDENCE_IDS.entries()) {
    await expect(rows.nth(i).locator('strong')).toHaveText(en[`ev.${id}.label`]);
    const detail = rows.nth(i).locator('.doc-detail');
    await expect(detail).toHaveCount(1);
    const box = await detail.boundingBox();
    const lineHeight = await detail.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(box!.height, `${id} detail is one line`).toBeLessThan(lineHeight * 1.5);
  }
  await expect(docsScreen.locator('.doc', { hasText: "Mother's letter" }).locator('.doc-detail')).toHaveText('Visit purpose · Reveals her address');

  // All six rows and Continue are on screen with no scroll, and no "more below" cue.
  const inView = await page.evaluate(() => {
    const body = document.querySelector('.documents-step .setup-body')!;
    const bottoms = [...document.querySelectorAll('.documents-step .doc, .documents-step .controls button.primary')].map((el) => el.getBoundingClientRect().bottom);
    return { scrolls: body.scrollHeight - body.clientHeight, page: document.documentElement.scrollHeight - document.documentElement.clientHeight, worst: Math.max(...bottoms), viewport: window.innerHeight };
  });
  expect(inView.scrolls, 'packing list scrolls at 390x844').toBeLessThanOrEqual(0);
  expect(inView.page, 'page scrolls at 390x844').toBeLessThanOrEqual(0);
  expect(inView.worst, 'a row or Continue below the screen').toBeLessThanOrEqual(inView.viewport);
  await expect(docsScreen.locator('.more-below')).toHaveCount(0);
  await stepFits(page, 'documents, nothing packed');

  // Pack Lena's 3: the second, fourth and fifth documents.
  const chosen = [EVIDENCE_IDS[1], EVIDENCE_IDS[3], EVIDENCE_IDS[4]];
  const cont = docsScreen.locator('.controls button.primary');
  for (const id of chosen) await docsScreen.locator('.doc', { hasText: en[`ev.${id}.label`] }).click();
  await expect(cont).toBeEnabled();
  await expect(docsScreen.locator('.pack-count')).toHaveText('3 of 3 packed');
  await expect(docsScreen.locator('.doc[aria-pressed="true"] strong')).toHaveText(chosen.map((id) => en[`ev.${id}.label`]));
  await expect(docsScreen.locator('.doc.picked .checkbox svg')).toHaveCount(chosen.length);
  await stepFits(page, 'documents, 3 packed');
  await cont.click();

  // Screen 3: the mission, the rest of the premise, exactly the packed documents.
  const begin = page.locator('main.begin-step');
  await expect(begin.getByRole('heading', { name: 'Begin the crossing' })).toBeVisible();
  await expect(begin.locator('.mission')).toContainText('Get through with at least 2 hours left to reach the bus.');
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
  await expect(docsScreen.getByRole('heading', { name: 'Pack your documents' })).toBeVisible();
  await expect(docsScreen.locator('.doc[aria-pressed="true"] strong')).toHaveText(chosen.map((id) => en[`ev.${id}.label`]));
  await expect(docsScreen.locator('.doc.picked .checkbox svg')).toHaveCount(chosen.length);

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
  await expect(page.locator('main.run .strip')).toContainText('1 / 3 · In the queue');
  expect(errors).toEqual([]);
});

test('packing at large text: a "more below" cue until the list is scrolled to the end', async ({ page }) => {
  await page.goto('./');
  await page.locator('.title-screen button.primary').click();
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena')).click();
  await page.locator('.traveler-step .controls button.primary').click();
  const docsScreen = page.locator('main.documents-step');
  await expect(docsScreen.locator('.doc')).toHaveCount(EVIDENCE_IDS.length);
  await expect(docsScreen.locator('.more-below')).toHaveCount(0);

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const cue = docsScreen.locator('.more-below');
  await expect(cue).toBeVisible();
  await expect(cue).toContainText(en['ui.moreBelow']);
  await stepFits(page, 'documents at 200% text');

  await docsScreen.locator('.setup-body').evaluate((b) => { b.scrollTop = b.scrollHeight; });
  await expect(cue).toHaveCount(0);
  await expect(docsScreen.locator('.doc').last()).toBeInViewport();
});
