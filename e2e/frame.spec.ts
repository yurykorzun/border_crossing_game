import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newRun } from '../src/game/engine';
import { freshSave } from '../src/game/save';
import type { RunState } from '../src/game/types';
import { openReturning, openSaved, pickArrival } from './returning';

// One frame on every screen (src/index.css "One frame on every screen" and the type scale in
// :root): every button at least 52 px tall, main text 18 px on about 26 px, no sans text under
// 16 px (mono labels are captions), headings 24-28 px, the title 32-36 px, and one content width.

const MIN_BUTTON = 52;

interface Frame {
  buttons: { text: string; height: number }[];
  small: { text: string; size: number }[];
  main: { size: number; leading: number };
  mainText: { text: string; size: number }[];
  headings: { text: string; size: number }[];
  title: number | null;
  width: number;
  controls: number[];
}

/** Sizes on the current screen. `mainSel` names the main text there. */
async function frame(page: Page, mainSel: string): Promise<Frame> {
  return page.evaluate((sel) => {
    const main = document.querySelector('.shell > main')!;
    const visible = (el: Element) => el.checkVisibility() && el.getBoundingClientRect().height > 0;
    const label = (el: Element) => (el.textContent ?? '').trim().slice(0, 40) || el.getAttribute('aria-label') || el.className;
    const px = (el: Element) => parseFloat(getComputedStyle(el).fontSize);
    const buttons = [...main.querySelectorAll('button')].filter(visible)
      .map((b) => ({ text: label(b), height: Math.round(b.getBoundingClientRect().height * 10) / 10 }));
    // Every element that holds text of its own, in the sans face.
    const small = [...main.querySelectorAll('*')]
      .filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()))
      .filter((el) => !/mono/i.test(getComputedStyle(el).fontFamily))
      .map((el) => ({ text: label(el), size: px(el) }))
      .filter((x) => x.size < 16);
    const cs = getComputedStyle(main);
    return {
      buttons,
      small,
      main: { size: parseFloat(cs.fontSize), leading: parseFloat(cs.lineHeight) },
      mainText: [...main.querySelectorAll(sel)].filter(visible).map((el) => ({ text: label(el), size: px(el) })),
      headings: [...main.querySelectorAll('h2.on-dark, h2.premise, .ask-short h2.question')].filter(visible).map((el) => ({ text: label(el), size: px(el) })),
      title: main.querySelector('.title-card h1') ? px(main.querySelector('.title-card h1')!) : null,
      width: Math.round(main.getBoundingClientRect().width),
      controls: [...main.querySelectorAll(':scope > .controls, .levels')].filter(visible).map((c) => Math.round(c.getBoundingClientRect().width)),
    };
  }, mainSel);
}

/** Checks one screen and returns its content width. */
async function expectFrame(page: Page, where: string, mainSel: string): Promise<number> {
  const f = await frame(page, mainSel);
  expect(f.buttons.length, `buttons on ${where}`).toBeGreaterThan(0);
  for (const b of f.buttons) expect(b.height, `button "${b.text}" on ${where}`).toBeGreaterThanOrEqual(MIN_BUTTON);
  expect(f.small, `text under 16 px on ${where}`).toEqual([]);
  expect(f.main.size, `main text on ${where}`).toBe(18);
  expect(f.main.leading, `main line height on ${where}`).toBeGreaterThanOrEqual(25);
  expect(f.main.leading, `main line height on ${where}`).toBeLessThanOrEqual(27);
  expect(f.mainText.length, `main text found on ${where}`).toBeGreaterThan(0);
  for (const m of f.mainText) expect(m.size, `"${m.text}" on ${where}`).toBeGreaterThanOrEqual(18);
  for (const h of f.headings) {
    expect(h.size, `heading "${h.text}" on ${where}`).toBeGreaterThanOrEqual(24);
    expect(h.size, `heading "${h.text}" on ${where}`).toBeLessThanOrEqual(28);
  }
  if (f.title !== null) {
    expect(f.title, `title on ${where}`).toBeGreaterThanOrEqual(32);
    expect(f.title, `title on ${where}`).toBeLessThanOrEqual(36);
  }
  expect(f.controls.length, `decisions on ${where}`).toBeGreaterThan(0);
  for (const c of f.controls) expect(c, `decisions width on ${where}`).toBe(f.width);
  return f.width;
}

async function openAt(page: Page, run: RunState) {
  await openSaved(page, { ...freshSave(), run });
  await expect(page.locator('main.run .controls button').first()).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }]) {
  test.describe(`at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('title, setup, queue and desk: 52 px buttons, 18 px main text, 16 px supporting text, one content width', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      const widths: Record<string, number> = {};
      await openReturning(page);
      widths.title = await expectFrame(page, 'title', '.title-card p:not(.mono)');
      await page.locator('.title-screen button.primary').click();
      // No level list while only Arrival is open (g0q.2), so the traveler screen comes next.
      await pickArrival(page);
      widths.traveler = await expectFrame(page, 'traveler', '.traveler-name');
      await page.getByRole('radio').first().click();
      widths.travelerPicked = await expectFrame(page, 'traveler, picked', '.traveler-name');
      await page.locator('.traveler-step .controls button.primary').click();
      widths.packing = await expectFrame(page, 'packing', '.doc-name');
      const cont = page.locator('.documents-step .controls button.primary');
      const docs = page.locator('.documents-step .doc');
      for (let i = 0; !(await cont.isEnabled()); i++) await docs.nth(i).click();
      await cont.click();
      widths.begin = await expectFrame(page, 'begin', '.mission p:not(.mono):not(.rule)');
      await page.locator('.begin-step .controls button.primary').click();
      widths.queue = await expectFrame(page, 'queue', '.queue-beat .msg');
      for (let i = 0; i < 4; i++) await page.locator('main.run .controls button.primary').click();
      widths.queueEnd = await expectFrame(page, 'end of the queue', '.queue-beat .msg');
      await page.getByRole('button', { name: 'Approach the booth' }).click();
      widths.desk = await expectFrame(page, 'desk', '.choice-label');
      await page.locator('main.run .controls button.choice').first().click();
      widths.reaction = await expectFrame(page, 'reaction', '.reaction .said');

      // A longer question in its card, at the interview desk.
      const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
      await openAt(page, { ...base, reaction: null, screen: { kind: 'encounter', id: 'i_family' }, checkpoint: 2, slot: 1 });
      widths.interview = await expectFrame(page, 'interview desk', '.choice-label, .ask-card .question');

      expect(new Set(Object.values(widths)).size, `one content width: ${JSON.stringify(widths)}`).toBe(1);
      expect(widths.title, 'content width at 390 px').toBe(viewport.width - 32);
      expect(errors).toEqual([]);
    });

    // The ending card on the same scale: 18 px story text, nothing under 16 px, 52 px buttons,
    // the same content width. Every ending kind, the bus missed too, and a consequence card.
    test('ending: 52 px buttons, 18 px story text, 16 px supporting text, one content width', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto('./');
      const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
      const endings: [string, Partial<RunState>][] = [
        ['Home in time', { time: 5, ending: 'homeInTime' }],
        // A beat days later (rwf.10): the cash declaration a record disproved.
        ['Home in time, a beat later', {
          time: 5, ending: 'homeInTime', claims: ['cashUnderLimit'], logged: { cashUnderLimit: ['customs'] },
          facts: { cashCount: ['customs'] }, disproved: ['cashUnderLimit'],
        }],
        ['Home at a cost', { time: 4, ending: 'homeAtCost', medicine: false, exposed: ['cousin'] }],
        ['Too late', { time: 1, ending: 'tooLate' }],
        ['missed bus', { time: 0, ending: 'tooLate' }],
        ['You turned back', { time: 6, ending: 'turnedBack' }],
      ];
      const widths = new Set<number>();
      for (const [name, patch] of endings) {
        const run: RunState = { ...base, checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ...patch };
        await openSaved(page, { ...freshSave(), run, endingsSeen: [run.ending!] });
        await expect(page.locator('.ending-card')).toBeVisible();
        widths.add(await expectFrame(page, `the ${name} ending`, '.ending-card .cost-line, .ending-card .epilogue, .ending-card .beat-line'));
      }
      expect([...widths], 'one content width on every ending').toEqual([viewport.width - 32]);
      expect(errors).toEqual([]);
    });
  });
}

/** The gap from the decisions to the tray, and the scene's height, on the run screen. */
async function trayGap(page: Page) {
  return page.evaluate(() => {
    const run = document.querySelector('main.run')!;
    const controls = run.querySelector(':scope > .controls')!;
    const tools = run.querySelector(':scope > .tools')!;
    return {
      next: controls.nextElementSibling === tools,
      gap: tools.getBoundingClientRect().top - controls.getBoundingClientRect().bottom,
      scene: run.querySelector(':scope > .scene')!.getBoundingClientRect().height,
    };
  });
}

test('at 390x844 the tray sits directly under the decisions on the queue, desk and reaction screens', async ({ page }) => {
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();
  await pickArrival(page);
  await page.getByRole('radio').first().click();
  await page.locator('.traveler-step .controls button.primary').click();
  const cont = page.locator('.documents-step .controls button.primary');
  const docs = page.locator('.documents-step .doc');
  for (let i = 0; !(await cont.isEnabled()); i++) await docs.nth(i).click();
  await cont.click();
  await page.locator('.begin-step .controls button.primary').click();

  const check = async (where: string) => {
    const g = await trayGap(page);
    expect(g.next, `tray right after the decisions on ${where}`).toBe(true);
    expect(g.gap, `decisions-to-tray gap on ${where}`).toBeGreaterThanOrEqual(0);
    expect(g.gap, `decisions-to-tray gap on ${where}`).toBeLessThanOrEqual(16);
    expect(g.gap, `decisions-to-tray gap on ${where}`).toBeLessThan(g.scene);
  };
  await check('queue');
  for (let i = 0; i < 4; i++) await page.locator('main.run .controls button.primary').click();
  await check('end of the queue');
  await page.getByRole('button', { name: 'Approach the booth' }).click();
  await check('desk');
  await page.locator('main.run .controls button.choice').first().click();
  await check('reaction');
});
