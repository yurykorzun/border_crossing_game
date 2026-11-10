import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newRun } from '../src/game/engine';
import { CHECKS, ENCOUNTERS, INSPECTIONS } from '../src/game/content/encounters';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, MISSION_MIN_TIME, START_TIME } from '../src/game/content/world';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { RunState, Screen } from '../src/game/types';
import { CHECKPOINTS } from '../src/game/types';
import { openReturning } from './returning';

// The run screen at 390x844, a border counter: the header says where you stand, the
// scene and the question sit in the middle with the question right on top of the
// answers, and the tray stays at the bottom. Everything fits with no page scroll.

const MAX_GAP = 16;
/** The question sits right on top of its answers. */
const MAX_QUESTION_GAP = 24;

async function measure(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const scene = box('main.run .scene');
    const panel = box('main.run .panel');
    const buttons = [...document.querySelectorAll('main.run .controls button, main.run .tools button')]
      .map((b) => b.getBoundingClientRect().bottom);
    const question = box('main.run .ask .question');
    const firstAnswer = box('main.run .controls button');
    return {
      questionGap: question && firstAnswer ? firstAnswer.top - question.bottom : null,
      pageScroll: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      gap: scene && panel ? panel.top - scene.bottom : null,
      lowestButton: Math.max(...buttons),
      viewport: window.innerHeight,
    };
  });
}

async function expectFits(page: Page, where: string, card = false) {
  const m = await measure(page);
  if (card) {
    expect(m.questionGap, `question on ${where}`).not.toBeNull();
    expect(m.questionGap!, `question-to-answer gap on ${where}`).toBeLessThanOrEqual(MAX_QUESTION_GAP);
  }
  expect(m.pageScroll, `page scroll on ${where}`).toBeLessThanOrEqual(0);
  expect(m.gap, `scene-to-dialogue gap on ${where}`).not.toBeNull();
  expect(m.gap!, `scene-to-dialogue gap on ${where}`).toBeLessThanOrEqual(MAX_GAP);
  expect(m.lowestButton, `a button below the screen on ${where}`).toBeLessThanOrEqual(m.viewport);
}

test('run screen: strip, scrutiny sheet, settings sheet and fit at 390x844', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();

  // Mark starts with 1 scrutiny.
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('mark')).click();
  await page.locator('.traveler-step .controls button.primary').click();
  const cont = page.locator('.documents-step .controls button.primary');
  const docs = page.locator('.documents-step .doc');
  for (let i = 0; !(await cont.isEnabled()); i++) await docs.nth(i).click();
  await cont.click();
  await page.locator('.begin-step .controls button.primary').click();

  const strip = page.locator('main.run .strip');
  await expect(strip).toContainText('1 / 3 · In the queue');
  // The first queue: phone, phone, two lines in the queue, then the booth.
  await expectFits(page, 'first queue');
  for (let i = 0; i < 3; i++) await page.locator('main.run .controls button.primary').click();
  await expectFits(page, 'end of the first queue');
  await page.getByRole('button', { name: 'Approach the booth' }).click();
  await expect(strip).toContainText('1 / 3 · Passport control');
  const scrutiny = strip.getByRole('button', { name: 'Scrutiny 1/3' });
  await expect(scrutiny).toBeVisible();
  await expect(strip).not.toContainText('Noticed');
  await expectFits(page, 'first question', true);

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

  // The tray holds My story, Evidence and a gear-only Settings.
  await expect(page.locator('main.run .tools button')).toHaveText([/My story/, /Evidence/, '']);
  expect(errors).toEqual([]);
});

test('the run header, the tray and its pixel icons, at the first checkpoint', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();

  // Lena starts with no scrutiny.
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena')).click();
  await page.locator('.traveler-step .controls button.primary').click();
  const cont = page.locator('.documents-step .controls button.primary');
  const docs = page.locator('.documents-step .doc');
  for (let i = 0; !(await cont.isEnabled()); i++) await docs.nth(i).click();
  await cont.click();
  await page.locator('.begin-step .controls button.primary').click();
  for (let i = 0; i < 3; i++) await page.locator('main.run .controls button.primary').click();
  await page.getByRole('button', { name: 'Approach the booth' }).click();

  const run = page.locator('main.run');
  const strip = run.locator('.strip');
  await expect(strip.locator('.goal')).toHaveText('Reach the hospital');
  await expect(strip).toContainText('8 hours left');
  await expect(strip.locator('.stat.time .amber')).toHaveText('8 hours');
  await expect(strip).toContainText('Scrutiny 0/3');
  await expect(strip.locator('.progress-label')).toHaveText('1 / 3 · Passport control');
  await expect(strip.locator('.progress-label .amber')).toHaveText('1 / 3');
  await expect(strip.locator('.time-bar i')).toHaveAttribute('style', /width: 100%/);
  // The game name stays on the setup screens.
  await expect(run).not.toContainText('Purpose of Visit');

  // The tray: Settings is a gear with a name, narrower than the other two; Evidence counts the cards in hand.
  const tools = run.locator('.tools');
  const story = tools.getByRole('button', { name: 'My story' });
  const evidence = tools.getByRole('button', { name: /^Evidence/ });
  const settings = tools.getByRole('button', { name: 'Settings', exact: true });
  await expect(settings).toHaveText('');
  await expect(evidence).toHaveText(`Evidence · ${CHARACTERS.lena.evidenceSlots}`);
  const width = async (l: typeof story) => (await l.boundingBox())!.width;
  expect(await width(settings)).toBeLessThan(await width(story));
  expect(await width(settings)).toBeLessThan(await width(evidence));

  // Every icon in the header and the tray is drawn on a pixel grid.
  const icons = run.locator('.strip svg, .tools svg');
  await expect(icons).toHaveCount(5);
  for (const icon of await icons.all()) await expect(icon).toHaveAttribute('shape-rendering', 'crispEdges');

  // A 1-hour answer takes the header to 7 hours and shortens the time bar.
  const oneHour = run.locator('.controls button.choice', { has: page.locator('.consequence .part', { hasText: /^Costs 1 hour$/ }) }).first();
  await oneHour.click();
  await expect(strip).toContainText('7 hours left');
  await expect(strip.locator('.time-bar i')).toHaveAttribute('style', /width: 87\.5%/);
  expect(errors).toEqual([]);
});

/** Where the time bar and its reserve mark sit, and the clock group they belong to. */
async function timeBar(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('main.run .strip .time-bar')!;
    const mark = bar.querySelector('.reserve')!.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    return {
      inClock: !!bar.closest('.stat.time')?.querySelector('.stat-label.hours'),
      left: b.left,
      width: b.width,
      mark: mark.left + mark.width / 2,
    };
  });
}

test('in a secondary inspection the header names it with the checkpoint, and the time bar sits on the clock with the travel reserve marked', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
  const strip = page.locator('main.run .strip');

  for (const [travel, cp] of [[MISSION_MIN_TIME, 1], [5, 2]] as const) {
    await openAt(page, { ...base, reaction: null, screen: { kind: 'inspection', id: INSPECTIONS[0].id }, checkpoint: cp, slot: 1, time: 6, travel });
    const name = cp === 1 ? 'Customs' : 'Security interview';
    // Checkpoint and phase on one line, the clock and scrutiny below it.
    await expect(strip.locator('.progress-label')).toHaveText(`${cp + 1} / 3 · ${name} · Secondary inspection`);
    const label = (await strip.locator('.progress-label').boundingBox())!;
    const lineHeight = await strip.locator('.progress-label').evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(label.height, `${name}: checkpoint and phase on one line`).toBeLessThan(lineHeight * 1.5);
    const clock = (await strip.locator('.stat.time').boundingBox())!;
    const scrutiny = (await strip.locator('.scrutiny').boundingBox())!;
    expect(clock.y, 'clock below the checkpoint line').toBeGreaterThanOrEqual(label.y + label.height);
    expect(scrutiny.y, 'scrutiny below the checkpoint line').toBeGreaterThanOrEqual(label.y + label.height);
    // The bar is part of the clock group and its reserve mark is at travel / start hours.
    const bar = await timeBar(page);
    expect(bar.inClock, 'time bar in the clock group').toBe(true);
    expect(Math.abs(bar.mark - (bar.left + (bar.width * travel) / START_TIME)), `reserve mark at ${travel} hours`).toBeLessThanOrEqual(2);
    await expect(strip.locator('.time-bar i')).toHaveAttribute('style', /width: 75%/);
  }
  // The red stripe stays on the inspection card.
  await expect(page.locator('main.run .panel.inspection')).toHaveCSS('border-left-width', '6px');
  await expectFits(page, 'secondary inspection', true);
  expect(errors).toEqual([]);
});

/** Every card and every finished waiting room, for each character: the crowded states. */
function crowdedStates(): { name: string; run: RunState; card: boolean }[] {
  const out: { name: string; run: RunState; card: boolean }[] = [];
  for (const id of CHARACTER_IDS) {
    const base = newRun({ character: id, loadout: EVIDENCE_IDS.slice(0, CHARACTERS[id].evidenceSlots), bulletin: 'records', seed: 7 });
    const at = (screen: Screen, checkpoint: number): RunState => ({ ...base, reaction: null, screen, checkpoint, slot: 1 });
    for (const e of ENCOUNTERS) {
      const cp = e.checkpoint === 'followup' ? 2 : CHECKPOINTS.indexOf(e.checkpoint);
      out.push({ name: `${id} ${e.id}`, run: at({ kind: 'encounter', id: e.id }, cp), card: true });
    }
    for (const i of INSPECTIONS) out.push({ name: `${id} ${i.id}`, run: at({ kind: 'inspection', id: i.id }, 1), card: true });
    for (const c of Object.values(CHECKS)) {
      const beats = Array.from({ length: c.beats }, (_, n) => n);
      const screen: Screen = { kind: 'wait', check: c.id, beats, shown: beats.length, resolved: { result: 'clear' }, asked: false };
      out.push({ name: `${id} wait ${c.id}`, run: at(screen, 1), card: false });
    }
  }
  return out;
}

/** Opens the run on a saved state, as a returning player would. */
async function openAt(page: Page, run: RunState) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run })] as const);
  await page.reload();
  await expect(page.locator('main.run .controls button').first()).toBeVisible();
}

/** Every answer's consequence line is on screen, inside its button and not cut off. */
async function expectLinesVisible(page: Page, where: string) {
  const lines = page.locator('main.run .controls button .consequence');
  const viewport = page.viewportSize()!;
  for (const line of await lines.all()) {
    await expect(line, where).toBeVisible();
    const box = (await line.boundingBox())!;
    expect(box.y + box.height, `a line below the screen on ${where}`).toBeLessThanOrEqual(viewport.height);
    expect(box.x + box.width, `a line off the side on ${where}`).toBeLessThanOrEqual(viewport.width);
    const clipped = await line.evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
    expect(clipped, `a clipped line on ${where}`).toBe(false);
  }
}

test('the passport question: answers as speech or an action, one icon and one line each', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
  await openAt(page, { ...base, reaction: null, screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 1 });

  const answers = page.locator('main.run .controls button.choice');
  await expect(answers).toHaveCount(3);
  await expect(answers.locator('.choice-label')).toHaveText([
    "Show your mother's letter",
    '"I\'m visiting family."',
    '"I\'m here as a tourist."',
  ]);
  await expect(answers.locator('.consequence-text')).toHaveText([
    'Uses letter · Reveals her address',
    'Costs 1 hour · Register check',
    'Recorded as your reason for visiting',
  ]);
  for (const answer of await answers.all()) {
    await expect(answer.locator('svg')).toHaveCount(1);
    await expect(answer.locator('svg')).toHaveAttribute('shape-rendering', 'crispEdges');
  }
  // Amber marks the check; nothing on this card is red.
  await expect(answers.nth(1).locator('.part.amber')).toHaveText('Register check');
  await expect(page.locator('main.run .part.red')).toHaveCount(0);
  await expectFits(page, 'passport question', true);
  await expectLinesVisible(page, 'passport question');
  expect(errors).toEqual([]);
});

test('the security interview with three answers fits at 390x844 with every line visible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  let seen = 0;
  for (const id of CHARACTER_IDS) {
    const base = newRun({ character: id, loadout: EVIDENCE_IDS.slice(0, CHARACTERS[id].evidenceSlots), bulletin: 'records', seed: 7 });
    for (const e of ENCOUNTERS.filter((x) => x.checkpoint === 'interview' || x.checkpoint === 'followup')) {
      await openAt(page, { ...base, reaction: null, screen: { kind: 'encounter', id: e.id }, checkpoint: 2, slot: 1 });
      const answers = page.locator('main.run .controls button.choice');
      if ((await answers.count()) !== 3) continue;
      seen++;
      const where = `${id} ${e.id}`;
      await expect(answers.locator('.consequence'), where).toHaveCount(3);
      for (const answer of await answers.all()) await expect(answer.locator('svg'), where).toHaveCount(1);
      await expectFits(page, where, true);
      await expectLinesVisible(page, where);
    }
  }
  expect(seen, 'interview cards with three answers').toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('every card and waiting room fits at 390x844 with no page scroll', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const weights = new Set<string>();
  for (const { name, run, card } of crowdedStates()) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run })] as const);
    await page.reload();
    await expect(page.locator('main.run .controls button').first(), name).toBeVisible();
    await expectFits(page, name, card);
    await expectLinesVisible(page, name);
    // Each answer card: an action row and one consequence row, and the consequence text
    // in one weight on every card, contacts included (colour marks the protected one).
    const answers = await page.locator('main.run .controls button.choice').evaluateAll((buttons) =>
      buttons.map((b) => ({
        rows: [...b.children].map((r) => r.className.split(' ')[0]),
        weights: [...b.querySelectorAll('.consequence-text, .part')].map((el) => getComputedStyle(el).fontWeight),
      })),
    );
    for (const a of answers) {
      expect(a.rows, name).toEqual(['choice-label', 'consequence']);
      a.weights.forEach((w) => weights.add(w));
    }
  }
  expect([...weights], 'consequence row weights across every card').toHaveLength(1);
  expect(errors).toEqual([]);
});

// ── Scenes (src/ui/art): one per checkpoint, named for screen readers, and the counter
// changes after you act. The traveler, packing and ending screens each have one too.

test('each checkpoint has its own named scene, and so do the traveler, packing and ending screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await openReturning(page);

  await page.locator('.title-screen button.primary').click();
  await expect(page.locator('.traveler-scene svg[role="img"]')).toBeVisible();
  await page.getByRole('radio').first().click();
  await page.locator('.traveler-step .controls button.primary').click();
  await expect(page.locator('.pack-scene svg[role="img"]')).toBeVisible();

  const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
  const labels: string[] = [];
  for (const [id, cp] of [['p_purpose', 0], ['c_medicine', 1], ['i_stay', 2]] as const) {
    await openAt(page, { ...base, reaction: null, screen: { kind: 'encounter', id }, checkpoint: cp, slot: 1 });
    const scene = page.locator('main.run .scene svg[role="img"]');
    await expect(scene, id).toHaveCount(1);
    await expect(scene, id).toBeVisible();
    labels.push((await scene.getAttribute('aria-label')) ?? '');
  }
  expect(labels[0]).toMatch(/booth/);
  expect(labels[1]).toMatch(/inspection table/);
  expect(labels[2]).toMatch(/interview room/);
  expect(new Set(labels).size).toBe(3);

  // The ending: the night bus, or the border post if you were turned back.
  for (const ending of ['homeInTime', 'turnedBack'] as const) {
    const run: RunState = { ...base, reaction: null, screen: { kind: 'ending' }, ending };
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run })] as const);
    await page.reload();
    await expect(page.locator('.ending-scene svg[role="img"]'), ending).toBeVisible();
  }

  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => !u.startsWith('data:') && new URL(u).origin !== origin)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const reduceMotion of [false, true]) {
  test(`showing the letter puts a document on the clerk's side${reduceMotion ? ', with no animation under Reduce motion' : ''}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./');
    const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
    const run: RunState = { ...base, reaction: null, screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 1 };
    const save = { ...freshSave(), run };
    save.settings = { ...save.settings, reduceMotion };
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify(save)] as const);
    await page.reload();

    const scene = page.locator('main.run .scene svg[data-scene="passport"]');
    await expect(scene).toBeVisible();
    await expect(scene.locator('[data-doc]')).toHaveCount(0);
    await page.getByRole('button', { name: "Show your mother's letter" }).click();
    await expect(page.locator('main.run .panel.reaction')).toBeVisible();
    const doc = scene.locator('[data-doc]');
    await expect(doc).toHaveCount(1);
    await expect(doc).toBeVisible();
    const running = await doc.evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
    if (reduceMotion) expect(running, 'animations on the document under Reduce motion').toBe(0);
    await expectFits(page, 'reaction to the letter');
    expect(errors).toEqual([]);
  });
}

// The setup screens' Continue: under the cards on a wide window, pinned in view on a phone.
const MAX_CONTINUE_GAP = 48;

/** Pixels from the bottom of the last `card` to the top of the screen's Continue. */
async function continueGap(page: Page, step: string, card: string) {
  const button = await page.locator(`.${step} .controls button.primary`).boundingBox();
  const last = await page.locator(`.${step} ${card}`).last().boundingBox();
  return button!.y - (last!.y + last!.height);
}

test.describe('on a 1280x800 desktop window', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false });

  test('Continue sits within 48 px under the last card on every setup screen', async ({ page }) => {
    await openReturning(page);
    await page.locator('.title-screen button.primary').click();

    const gaps: Record<string, number> = {};
    gaps.traveler = await continueGap(page, 'traveler-step', '.traveler');
    await page.getByRole('radio').first().click();
    // With a pick, the history link joins the cards and Continue stays right under it.
    gaps.travelerPicked = await continueGap(page, 'traveler-step', '.history');
    await page.locator('.traveler-step .controls button.primary').click();

    gaps.packing = await continueGap(page, 'documents-step', '.doc');
    const cont = page.locator('.documents-step .controls button.primary');
    const docs = page.locator('.documents-step .doc');
    for (let i = 0; !(await cont.isEnabled()); i++) await docs.nth(i).click();
    await cont.click();

    gaps.begin = await continueGap(page, 'begin-step', '.packed-list');
    for (const [where, gap] of Object.entries(gaps)) {
      expect(gap, `Continue under the cards on ${where}`).toBeGreaterThanOrEqual(0);
      expect(gap, `Continue under the cards on ${where}`).toBeLessThanOrEqual(MAX_CONTINUE_GAP);
    }
  });
});

test('at 390x844 Continue stays pinned in view while the packing list scrolls', async ({ page }) => {
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();
  await page.getByRole('radio').first().click();
  await page.locator('.traveler-step .controls button.primary').click();
  // Large text, so the list is sure to be longer than the screen.
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; });

  const body = page.locator('.documents-step .setup-body');
  const cont = page.locator('.documents-step .controls button.primary');
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight), 'the packing list scrolls').toBe(true);
  const inView = async () => {
    const b = (await cont.boundingBox())!;
    return b.y >= 0 && b.y + b.height <= 844;
  };
  expect(await inView(), 'Continue in view at the top of the list').toBe(true);
  const before = (await cont.boundingBox())!.y;
  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await inView(), 'Continue in view at the end of the list').toBe(true);
  expect((await cont.boundingBox())!.y).toBe(before);
  const pageScroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(pageScroll, 'page scroll').toBeLessThanOrEqual(0);
});
