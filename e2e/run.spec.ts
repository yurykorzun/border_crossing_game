import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newRun, options } from '../src/game/engine';
import { ENCOUNTERS, INSPECTIONS } from '../src/game/content/encounters';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import { SAVE_KEY, freshSave } from '../src/game/save';
import { own, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import type { RunState, Screen } from '../src/game/types';
import { CHECKPOINTS } from '../src/game/types';

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
  await expect(page.locator('main.run .queue-scene')).toBeVisible();
  expect(errors).toEqual([]);
});

test('My story shows which desk knows each fact', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const reaction = page.locator('main.run .panel.reaction');

  // Accommodation bulletin: the letter puts her address on file at passport control, and the clerk phones customs.
  const run = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'accommodation', seed: 7 });
  await openAt(page, { ...run, screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 1 });
  await page.getByRole('button', { name: /Show your mother's letter/ }).click();
  await expect(reaction).toContainText("Your mother's address is now on file.");
  await expect(reaction).toContainText('Sent on to Customs: Family address.');
  await page.locator('main.run .controls button.primary').click();

  await page.getByRole('button', { name: 'My story' }).click();
  const sheet = page.locator('dialog.sheet[open]');
  await expect(sheet).toContainText('Each desk sees what it learns or receives from another desk.');
  const row = sheet.locator('.record li[data-fact="familyAddress"]');
  await expect(row).toContainText('Family address');
  // Passport control and customs know it; the interview does not.
  await expect(row.locator('.tag.desk')).toHaveText(['Passport', 'Customs']);
  await noHorizontalScroll(page, 'My story with desks');
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

test('a Home in time ending is a short result card that fits the screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const run: RunState = { ...lenaRun(), time: 5, checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending: 'homeInTime' };
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run, endingsSeen: ['homeInTime'] })] as const);
  await page.reload();

  const card = page.locator('.ending-card');
  await expect(card).toBeVisible();
  await expect(page.locator('.ending .setup-title')).toHaveText('Purpose of Visit');
  await expect(card.locator('.outcome')).toHaveText('Crossing complete');
  await expect(card.locator('h1')).toHaveText('Home in time');
  await expect(card.locator('.summary')).toHaveText("You make the last bus with your father's medicine.");
  const rows = card.locator('.result-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveText(/Hours left\s*5$/);
  await expect(rows.nth(1)).toHaveText(/Medicine\s*Kept/);
  await expect(rows.nth(2)).toHaveText(/Your cousin Ilya\s*Not named/);
  // The longer text is behind "See what's on file", not on the card.
  await expect(card).not.toContainText('visiting hours end');

  // The whole ending fits the phone: no page scroll, nothing cut off.
  await noHorizontalScroll(page, 'ending');
  const fits = await page.evaluate(() => {
    const main = document.querySelector('main.ending') as HTMLElement;
    return { doc: document.documentElement.scrollHeight <= window.innerHeight, main: main.scrollHeight <= main.clientHeight };
  });
  expect(fits, 'ending scrolls').toEqual({ doc: true, main: true });
  await expect(page.getByRole('button', { name: 'Play again' })).toBeInViewport();

  // See what's on file opens My story, with the longer ending text on top.
  await page.getByRole('button', { name: "See what's on file" }).click();
  const sheet = page.locator('dialog.sheet[open]');
  await expect(sheet.locator('h2')).toHaveText('My story');
  await expect(sheet).toContainText('visiting hours end');
  await expect(sheet).toContainText('Background');
  // Each contact's abilities, from the table in src/game/content/world.ts.
  await expect(sheet.locator('.people .can')).toHaveText([
    'Can confirm: address, visit, prescription',
    /^Can confirm: (a place to stay|a job offer abroad)$/,
  ]);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);

  // Play again goes back to picking a traveler.
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('.traveler-step')).toBeVisible();
  await expect(page.getByRole('radio').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('once the bus is out of reach, the card says so and finishes the crossing quickly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await openAt(page, { ...lenaRun(), time: 1, screen: { kind: 'encounter', id: 'c_cash' }, checkpoint: 1, slot: 1, seen: ['c_cash'] });
  await expect(page.locator('main.run .panel.ask')).toContainText('You will not make the bus now.');
  await page.getByRole('button', { name: 'Finish the crossing quickly' }).click();
  await expect(page.locator('main.run .panel.reaction')).toContainText('Nobody asks anything more.');
  await page.getByRole('button', { name: 'See how it ends' }).click();
  await expect(page.locator('.ending-card h1')).toHaveText('Too late');
  expect(errors).toEqual([]);
});

// No hours left at all: the bus left during the checks. Some hours but fewer than the trip:
// through, but after visiting hours. Each shows its own title, sentence and longer text.
for (const [time, text] of [[0, 'missedBus'], [1, 'tooLate']] as const) {
  test(`a Too late run with ${time} hours left shows the ${text} text on the ending card`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./');
    const run: RunState = { ...lenaRun(), time, checkpoint: 2, screen: { kind: 'ending' }, reaction: null, ending: 'tooLate' };
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run, endingsSeen: ['tooLate'] })] as const);
    await page.reload();

    const card = page.locator('.ending-card');
    await expect(card.locator('h1')).toHaveText(en[`ending.${text}.title`]);
    await expect(card.locator('.summary')).toHaveText(en[`ending.${text}.summary`]);
    await expect(card).toBeInViewport();
    await noHorizontalScroll(page, `${text} ending`);
    await page.getByRole('button', { name: "See what's on file" }).click();
    await expect(page.locator('dialog.sheet[open] .ending-record > p').first()).toHaveText(en[`ending.${text}.body`]);
    expect(errors).toEqual([]);
  });
}

test('a Too late ending still lists the exposed mother, scored', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const run: RunState = {
    ...lenaRun(), time: 1, exposed: ['mother'], facts: { urgency: ['customs'] }, checkpoint: 3,
    screen: { kind: 'ending' }, reaction: null, ending: 'tooLate',
  };
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run, endingsSeen: ['tooLate'] })] as const);
  await page.reload();

  const card = page.locator('.ending-card');
  await expect(card.locator('h1')).toHaveText('Too late');
  // The headline stays the same; the cost of each exposure is behind "See what's on file".
  await page.getByRole('button', { name: "See what's on file" }).click();
  const sheet = page.locator('dialog.sheet[open]');
  await expect(sheet.locator('.what-it-cost')).toHaveText('What it cost');
  const lines = sheet.locator('.costs li');
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toHaveText(/^Minor Your mother gets a call from the border/);
  await expect(lines.nth(1)).toHaveText('Minor 1 thing about you is on file now.');
  expect(errors).toEqual([]);
});

// The counter scene keeps one box on the run screen: answering does not let the officer
// grow into the space the buttons freed (2026-11-09 screenshot review). The box gives
// way first when the answers need the room.
const sceneBox = (page: Page) => page.locator('main.run .scene').evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), height: Math.round(r.height) };
});

test('the interview scene keeps its top and height through question, reaction and next question', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await openAt(page, { ...lenaRun(), reaction: null, screen: { kind: 'encounter', id: 'i_water' }, checkpoint: 2, slot: 0, seen: ['i_water'] });
  const question = page.locator('main.run .panel.ask .question');
  const first = (await question.innerText()).trim();
  const asked = await sceneBox(page);
  expect(asked.height, 'scene height on the question').toBeGreaterThanOrEqual(180);
  expect(asked.height, 'scene height on the question').toBeLessThanOrEqual(220);

  await page.locator('main.run .controls button.choice:enabled').first().click();
  await expect(page.locator('main.run .panel.reaction')).toBeVisible();
  expect(await sceneBox(page), 'scene on the reaction').toEqual(asked);

  await page.locator('main.run .controls button.primary').click();
  await expect(question).toBeVisible();
  expect((await question.innerText()).trim(), 'a new question').not.toBe(first);
  expect(await sceneBox(page), 'scene on the next question').toEqual(asked);
  expect(errors).toEqual([]);
});

test('with the longest question and three answers, the scene shrinks before an answer leaves the screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  // The longest question with three answers, of every card and traveler.
  let worst: { run: RunState; length: number } | null = null;
  for (const id of CHARACTER_IDS) {
    const base = newRun({ character: id, loadout: EVIDENCE_IDS.slice(0, CHARACTERS[id].evidenceSlots), bulletin: 'records', seed: 7 });
    const cards: [Screen, number][] = [
      ...ENCOUNTERS.map((e): [Screen, number] => [{ kind: 'encounter', id: e.id }, e.checkpoint === 'followup' ? 2 : CHECKPOINTS.indexOf(e.checkpoint)]),
      ...INSPECTIONS.map((i): [Screen, number] => [{ kind: 'inspection', id: i.id }, 2]),
    ];
    for (const [screen, checkpoint] of cards) {
      const run: RunState = { ...base, reaction: null, screen, checkpoint, slot: 1 };
      if (options(run).length !== 3) continue;
      const prefix = screen.kind === 'inspection' ? 'insp' : 'enc';
      const length = t(own(`${prefix}.${(screen as { id: string }).id}.q`, id)).length;
      if (!worst || length > worst.length) worst = { run, length };
    }
  }
  expect(worst, 'a card with three answers').not.toBeNull();

  // At the default text size, and at a larger one where the answers wrap more.
  for (const fontSize of ['16px', '20px']) {
    await openAt(page, worst!.run);
    await page.addStyleTag({ content: `html { font-size: ${fontSize}; }` });
    const scene = await sceneBox(page);
    const lowest = await page.locator('main.run .controls button').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
    const viewport = page.viewportSize()!.height;
    expect(lowest, `an answer below the screen at ${fontSize}`).toBeLessThanOrEqual(viewport);
    expect(scene.height, `scene height at ${fontSize}`).toBeLessThanOrEqual(220);
    if (fontSize === '20px') expect(scene.height, 'the scene gave up height at 20px').toBeLessThan(180);
  }
  expect(errors).toEqual([]);
});

test('the bag search scene has an open suitcase, and the supervisor comes in for an inspection', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  await openAt(page, { ...lenaRun(), reaction: null, screen: { kind: 'inspection', id: 's_bag' }, checkpoint: 1, slot: 1 });
  const scene = page.locator('main.run .scene svg[data-scene="customs"]');
  await expect(scene.locator('[data-name="open suitcase"]')).toHaveCount(1);
  await expect(scene.locator('[data-name="supervisor"]')).toHaveCount(1);
  // An ordinary customs card has neither.
  await openAt(page, { ...lenaRun(), reaction: null, screen: { kind: 'encounter', id: 'c_medicine' }, checkpoint: 1, slot: 1 });
  await expect(scene.locator('[data-name="open suitcase"]')).toHaveCount(0);
  await expect(scene.locator('[data-name="supervisor"]')).toHaveCount(0);
  // At passport control the clerk holds your passport behind the glass.
  await openAt(page, { ...lenaRun(), reaction: null, screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 1 });
  await expect(page.locator('main.run .scene svg[data-scene="passport"] [data-name="passport behind the glass"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
