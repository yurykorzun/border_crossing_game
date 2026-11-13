import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, FIRST_RUN } from '../src/game/content/world';
import { DEFAULT_LEVEL, LEVELS } from '../src/game/content/levels';
import { openReturning, pickArrival } from './returning';

// The three setup screens at 390x844: Choose your traveler, Pack your documents, Begin the crossing.
// They show once an ending is seen (openReturning); a fresh save skips to Begin as Lena.

test('fresh save: Start opens Before you cross as Lena with the fixed packing, no traveler or documents screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await page.locator('.title-screen button.primary').click();

  const begin = page.locator('main.begin-step');
  await expect(begin).toBeVisible();
  await expect(page.locator('main.level-step')).toHaveCount(0);
  await expect(page.locator('main.traveler-step')).toHaveCount(0);
  await expect(page.locator('main.documents-step')).toHaveCount(0);
  await expect(begin.locator('.begin-who')).toHaveText(`${en['char.lena.name']} · ${en['char.lena.role']}`);
  await expect(begin.locator('.begin-packed')).toHaveText("Packed: Mother's letter, hospital note, apartment deed");

  await begin.locator('.controls button.primary').click();
  await expect(page.locator('main.run .strip')).toContainText('1 / 3 · In the queue');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('purpose-of-visit-save') ?? '{}'));
  expect(saved.run.character).toBe('lena');
  expect(saved.run.level).toBe('arrival');
  expect([...saved.run.loadout].sort()).toEqual([...FIRST_RUN.loadout].sort());
  expect(errors).toEqual([]);
});

// Before you cross (g0q.3): one heading, the mission card in four short lines with the
// hours from the level data, the traveler and packed list, and Begin the crossing once,
// with Change documents and Back beside it.
for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }]) {
  test(`Before you cross at ${viewport.width}x${viewport.height}: mission, traveler, packed list, Change documents keeps the picks`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.locator('.title-screen button.primary').click();

    const begin = page.locator('main.begin-step');
    await expect(begin.getByRole('heading', { level: 2 })).toHaveText(en['ui.beforeYouCross']);
    await expect(begin.getByRole('heading', { name: en['ui.beforeYouCross'] })).toBeVisible();
    const level = LEVELS[DEFAULT_LEVEL];
    const mission = begin.locator('.mission');
    await expect(mission.locator('h3')).toHaveText('Your father has had a stroke.');
    await expect(mission.locator('p').first()).toHaveText("Your mother needs help with him. You carry his medicine.");
    await expect(mission.locator('.mission-clock span')).toHaveText([
      `Last bus leaves in ${level.startTime} hours.`,
      `Allow ${level.minTripTime} hours from the border to the station.`,
    ]);
    // Cash and the phone wait until they matter; the bus sum is said once.
    await expect(begin).not.toContainText('cash');
    await expect(begin).not.toContainText('phone');
    await expect(begin).not.toContainText('Get through with');
    await expect(begin.locator('.begin-who')).toHaveText('Lena · Software tester');
    await expect(begin.locator('.begin-packed')).toHaveText("Packed: Mother's letter, hospital note, apartment deed");

    // "Begin the crossing" once: the primary button, not a heading too.
    const text = await begin.innerText();
    expect(text.match(/Begin the crossing/g), text).toHaveLength(1);
    const go = begin.locator('.controls button.primary');
    await expect(go).toHaveText('Begin the crossing');
    const change = begin.getByRole('button', { name: 'Change documents' });
    const back = begin.getByRole('button', { name: 'Back', exact: true });
    await expect(change).toBeVisible();
    await expect(back).toBeVisible();
    // Everything fits: no page scroll, all three buttons on screen and at least 52 px tall,
    // and Back and Change documents side by side right under the primary.
    const m = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      return {
        page: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        viewport: window.innerHeight,
        go: box('.begin-step .controls .primary'),
        back: box('.begin-step .back-quiet'),
        change: box('.begin-step .change-docs'),
      };
    });
    expect(m.page, 'page scroll').toBeLessThanOrEqual(0);
    for (const [name, b] of [['Begin', m.go], ['Back', m.back], ['Change documents', m.change]] as const) {
      expect(b.height, `${name} height`).toBeGreaterThanOrEqual(52);
      expect(b.bottom, `${name} on screen`).toBeLessThanOrEqual(m.viewport);
    }
    expect(Math.abs(m.back.top - m.change.top), 'Back and Change documents on one row').toBeLessThan(1);
    expect(m.back.top - m.go.bottom, 'the row right under Begin').toBeLessThanOrEqual(16);

    // Change documents opens packing with the picks kept; Continue comes back here.
    await change.click();
    const docsScreen = page.locator('main.documents-step');
    await expect(docsScreen.getByRole('heading', { name: 'Pack your documents' })).toBeVisible();
    const kept = EVIDENCE_IDS.filter((id) => FIRST_RUN.loadout.includes(id)).map((id) => en[`ev.${id}.label`]);
    await expect(docsScreen.locator('.doc[aria-pressed="true"] strong')).toHaveText(kept);
    // Swap the deed for the hotel booking, and the check shows the new packing.
    await docsScreen.locator('.doc', { hasText: en['ev.deed.label'] }).click();
    await docsScreen.locator('.doc', { hasText: en['ev.hotel.label'] }).click();
    await docsScreen.locator('.controls button.primary').click();
    await expect(begin.locator('.begin-packed')).toHaveText("Packed: Hotel booking, mother's letter, hospital note");

    // Packing's Back also returns here, with the new picks; the check's Back goes to the title.
    await change.click();
    await docsScreen.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(begin.locator('.begin-packed')).toHaveText("Packed: Hotel booking, mother's letter, hospital note");
    await back.click();
    await expect(page.locator('.title-screen')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('one ending seen, one level open: Begin goes straight to the traveler, never the level list, and plays today\'s mission', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await openReturning(page, []);
  await page.locator('.title-screen button.primary').click();

  // Only Level 1 Arrival is open, so there is nothing to choose and no level list (g0q.2).
  const traveler = page.locator('main.traveler-step');
  await expect(traveler).toBeVisible();
  await expect(page.locator('main.level-step')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: en['ui.pickLevel'] })).toHaveCount(0);
  await expect(traveler.locator('.stage-label')).toHaveText('1 / 3 · Traveler');
  await expect(page.getByRole('radiogroup', { name: 'Choose your traveler' })).toBeVisible();
  await expect(page.locator('main.begin-step')).toHaveCount(0);

  // Back from the first step returns to the title; Begin again still skips the list.
  await traveler.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('.title-screen')).toBeVisible();
  await page.locator('.title-screen button.primary').click();
  await expect(traveler).toBeVisible();
  await expect(page.locator('main.level-step')).toHaveCount(0);

  // Through to the begin screen: today's mission, 8 hours with a 2-hour trip.
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena')).click();
  await page.locator('.traveler-step .controls button.primary').click();
  for (const id of FIRST_RUN.loadout) await page.locator('.doc').nth(EVIDENCE_IDS.indexOf(id)).click();
  await page.locator('.documents-step .controls button.primary').click();
  const mission = page.locator('main.begin-step .mission');
  await expect(mission.locator('h3')).toHaveText(en['mission.title']);
  await expect(mission).toContainText('Last bus leaves in 8 hours.');
  await expect(mission).toContainText('Allow 2 hours from the border to the station.');
  await page.locator('main.begin-step .controls button.primary').click();
  await expect(page.locator('main.run .strip')).toContainText('1 / 3 · In the queue');
  await expect(page.locator('main.run .strip')).toContainText('8 hours');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('purpose-of-visit-save') ?? '{}'));
  expect(saved.run.level).toBe('arrival');
  expect(saved.run.time).toBe(8);
  expect(errors).toEqual([]);
});

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
  await openReturning(page, []);
  await page.locator('.title-screen button.primary').click();
  await pickArrival(page);

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
  // Lena's line names her old donation, before any desk can raise it (dap.10).
  await expect(lena.locator('.traveler-line')).toHaveText('Settles one work question · An old donation');
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
  // The five details: why now, what she can do, what officials may look at, whom she protects, what she wants.
  await expect(detail.locator('.traveler-details dd')).toHaveText(['why', 'can', 'complication', 'protects', 'wants'].map((k) => en[`char.lena.${k}`]));
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
  await expect(detail.locator('.traveler-details dd')).toHaveText(['why', 'can', 'complication', 'protects', 'wants'].map((k) => en[`char.mark.${k}`]));
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
  await openReturning(page, []);

  // Title, then each setup heading in order, into the first queue.
  await expect(page.locator('.title-screen h1')).toHaveText('Purpose of Visit');
  await page.locator('.title-screen button.primary').click();
  await pickArrival(page);
  await expect(page.getByRole('radiogroup', { name: 'Choose your traveler' })).toBeVisible();
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena')).click();
  await page.locator('.traveler-step .controls button.primary').click();

  // Screen 2: stage, title and count, the bulletin bar, six rows whose lines do not wrap.
  const docsScreen = page.locator('main.documents-step');
  await expect(docsScreen.getByRole('heading', { name: 'Pack your documents' })).toBeVisible();
  await expect(docsScreen.locator('.stage-label')).toHaveText('2 / 3 · Preparation');
  await expect(docsScreen.locator('.stage-label .amber')).toHaveText('2 / 3');
  await expect(docsScreen.locator('.pack-count')).toHaveText('0 of 3 packed');

  // One bar, one icon, and each line is one sentence: exactly one terminal . ! or ?, at the end.
  // A customs day has a second line for cash.
  const bulletin = docsScreen.getByRole('note', { name: "Today's bulletin" });
  await expect(bulletin.locator('svg.icon')).toHaveCount(1);
  for (const line of await bulletin.locator('.bulletin-line').all()) {
    const sentence = (await line.innerText()).trim();
    expect(sentence.match(/[.!?]/g), sentence).toHaveLength(1);
    expect(sentence, sentence).toMatch(/[.!?]$/);
  }

  // Every row: a short name, a topics line, and a Reveals line for a document that
  // puts something on file. No line of label text wraps at 390x844.
  const rows = docsScreen.locator('.doc');
  await expect(rows).toHaveCount(EVIDENCE_IDS.length);
  for (const [i, id] of EVIDENCE_IDS.entries()) {
    await expect(rows.nth(i).locator('strong')).toHaveText(en[`ev.${id}.label`]);
    await expect(rows.nth(i).locator('.doc-topics')).toHaveCount(1);
    for (const el of [rows.nth(i).locator('strong'), ...(await rows.nth(i).locator('.doc-detail').all())]) {
      const box = await el.boundingBox();
      const lineHeight = await el.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
      expect(box!.height, `${id}: "${await el.innerText()}" is one line`).toBeLessThan(lineHeight * 1.5);
    }
  }
  // Every topic a document answers is in its row, not only the first.
  const hospital = docsScreen.locator('.doc', { hasText: 'Hospital note' });
  await expect(hospital.locator('.doc-topics')).toHaveText('Medicine · Why you came back');
  await expect(hospital.locator('.doc-reveals')).toHaveText("Reveals your father's condition");
  const letter = docsScreen.locator('.doc', { hasText: "Mother's letter" });
  await expect(letter.locator('.doc-topics')).toHaveText('Why you came back · Accommodation');
  await expect(letter.locator('.doc-reveals')).toHaveText('Reveals her address');
  await expect(docsScreen.locator('.doc', { hasText: 'Hotel booking' }).locator('.doc-reveals')).toHaveCount(0);

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

  // Screen 3, Before you cross: the mission, who you are and exactly the packed documents.
  const begin = page.locator('main.begin-step');
  await expect(begin.getByRole('heading', { name: 'Before you cross' })).toBeVisible();
  // One clock only (67a.11): the title says whose care it is, and no days of leave.
  await expect(begin.locator('.mission')).toContainText('Your father has had a stroke');
  await expect(begin.locator('.mission')).toContainText('medicine');
  await expect(begin.locator('.mission')).not.toContainText('days');
  await expect(begin.locator('.begin-who')).toHaveText('Lena · Software tester');
  await expect(begin.locator('.begin-packed')).toHaveText(`Packed: ${en[`ev.${chosen[0]}.label`]}, ${chosen.slice(1).map((id) => en[`ev.${id}.label`].toLowerCase()).join(', ')}`);
  await stepFits(page, 'begin');

  // Change documents: back to packing, the same documents still marked Packed.
  await begin.getByRole('button', { name: 'Change documents' }).click();
  await expect(docsScreen.getByRole('heading', { name: 'Pack your documents' })).toBeVisible();
  await expect(docsScreen.locator('.doc[aria-pressed="true"] strong')).toHaveText(chosen.map((id) => en[`ev.${id}.label`]));
  await expect(docsScreen.locator('.doc.picked .checkbox svg')).toHaveCount(chosen.length);
  await cont.click();

  // Back from Before you cross skips packing (Change documents goes there) to the traveler: Lena is still the pick.
  await begin.getByRole('button', { name: 'Back', exact: true }).click();
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
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();
  await pickArrival(page);
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

// One cue above the list says what officers are doing today, in place of a Relevant today
// tag on each row (2026-11-09 design review). Names are 17-18 px and both detail lines 16 px.
// The bulletin comes from the setup seed, so the test pins the seed's two sources for the
// one click that draws it: seed 3, 4 and 5 give the bulletins in BULLETINS order.
for (const [n, bulletin] of BULLETINS.entries()) {
  test(`packing under the ${bulletin} bulletin: one cue above the list, no row tags, readable rows`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await openReturning(page);
    await page.evaluate((seed) => {
      const w = window as unknown as { __now: () => number; __random: () => number };
      w.__now = Date.now; w.__random = Math.random;
      Date.now = () => seed; Math.random = () => 0;
    }, BULLETINS.length + n);
    await page.locator('.title-screen button.primary').click();
    await pickArrival(page);
    await page.evaluate(() => {
      const w = window as unknown as { __now: () => number; __random: () => number };
      Date.now = w.__now; Math.random = w.__random;
    });
    await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena')).click();
    await page.locator('.traveler-step .controls button.primary').click();

    const docsScreen = page.locator('main.documents-step');
    // The day's warning, then on a customs day a second line for cash.
    const also = (en as Record<string, string>)[`bulletin.${bulletin}.also`];
    await expect(docsScreen.getByRole('note', { name: "Today's bulletin" }).locator('.bulletin-line')).toHaveText(also ? [en[`bulletin.${bulletin}`], also] : [en[`bulletin.${bulletin}`]]);
    // Exactly one cue, one sentence, and it sits between the bulletin and the list.
    const cue = docsScreen.locator('.pack-cue');
    await expect(cue).toHaveCount(1);
    await expect(cue).toHaveText(en[`bulletin.${bulletin}.cue`]);
    const sentence = (await cue.innerText()).trim();
    expect(sentence.match(/[.!?]/g), sentence).toHaveLength(1);
    const order = await page.evaluate(() => {
      const top = (s: string) => document.querySelector(`.documents-step ${s}`)!.getBoundingClientRect();
      return { bulletin: top('.bulletin').bottom, cueTop: top('.pack-cue').top, cueBottom: top('.pack-cue').bottom, list: top('.cards.pick').top };
    });
    expect(order.cueTop, 'cue below the bulletin').toBeGreaterThanOrEqual(order.bulletin);
    expect(order.cueBottom, 'cue above the list').toBeLessThanOrEqual(order.list);
    await expect(docsScreen.locator('.tag')).toHaveCount(0);
    await expect(docsScreen).not.toContainText('Relevant today');

    // Every row: name 17-18 px, topics and Reveals at 16 px, each on its own line.
    const rows = docsScreen.locator('.doc');
    await expect(rows).toHaveCount(EVIDENCE_IDS.length);
    for (const [i, id] of EVIDENCE_IDS.entries()) {
      const px = (el: import('@playwright/test').Locator) => el.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      const name = await px(rows.nth(i).locator('strong'));
      expect(name, `${id} name size`).toBeGreaterThanOrEqual(17);
      expect(name, `${id} name size`).toBeLessThanOrEqual(18);
      const details = await rows.nth(i).locator('.doc-detail').all();
      for (const d of details) expect(await px(d), `${id} detail size`).toBe(16);
      const reveals = rows.nth(i).locator('.doc-reveals');
      if (await reveals.count()) {
        const topics = await rows.nth(i).locator('.doc-topics').boundingBox();
        const below = await reveals.boundingBox();
        expect(below!.y, `${id}: Reveals on its own line under the topics`).toBeGreaterThanOrEqual(topics!.y + topics!.height - 1);
      }
    }
    // The cue and the bigger rows still fit: six rows and Continue with no scroll.
    const scrolls = await page.evaluate(() => { const b = document.querySelector('.documents-step .setup-body')!; return b.scrollHeight - b.clientHeight; });
    expect(scrolls, `packing list scrolls under the ${bulletin} bulletin`).toBeLessThanOrEqual(0);
    await stepFits(page, `documents, ${bulletin} bulletin`);
    expect(errors).toEqual([]);
  });
}
