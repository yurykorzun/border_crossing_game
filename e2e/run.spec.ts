import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { knownLine, newRun, options } from '../src/game/engine';
import { CHECKS, ENCOUNTERS, INSPECTIONS } from '../src/game/content/encounters';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import { freshSave } from '../src/game/save';
import { own, t } from '../src/i18n';
import { en } from '../src/i18n/en';
import type { CheckId, RunState, Screen } from '../src/game/types';
import { CHECKPOINTS } from '../src/game/types';
import { openReturning, openSaved, pickArrival } from './returning';

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

  await openReturning(page);

  // Title
  await expect(page.locator('.title-screen')).toBeVisible();
  await noHorizontalScroll(page, 'title');
  await page.locator('.title-screen button.primary').click();
  await pickArrival(page);

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
  await expect(mission).toContainText('Last bus leaves in 8 hours.');
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
  const cards: (AnswerCard & { step: number })[] = [];

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
      timeChips.push(...(await page.locator('main.run .consequence .part', { hasText: /: \d+ hours?$/ }).allInnerTexts()));
      cards.push(...(await answerCards(page)).map((c) => ({ ...c, step: steps })));
      previous = 'option';
      await option.click();
    }
  }

  expect(steps, 'run did not end').toBeLessThan(MAX_STEPS);
  expect(timeChips.length, 'time costs seen').toBeGreaterThan(0);
  // Each time cost names its event: "Lab test: 2 hours".
  for (const chip of timeChips) expect(chip).toMatch(/^\S.*: \d+ hours?$/);
  // Every answer card: the action row, then one consequence row, and no answer
  // outweighs another (colour marks the protected contact, never bold).
  expect(cards.length, 'answer cards seen').toBeGreaterThan(0);
  for (const c of cards) {
    const where = `step ${c.step}: ${c.rows.join(' / ')}`;
    expect(c.rows, where).toHaveLength(2);
    expect(c.rows.every((r) => r.trim() !== ''), where).toBe(true);
    expect(c.stacked, where).toBe(true);
  }
  expect(new Set(cards.map((c) => c.labelWeight)), 'action row weights').toEqual(new Set([cards[0].labelWeight]));
  expect(new Set(cards.flatMap((c) => c.lineWeights)), 'consequence row weights').toEqual(new Set([cards[0].lineWeights[0]]));
  await expect(ending).toBeVisible();
  await expect(ending.locator('h1')).not.toBeEmpty();
  await expect(page.locator('.ending .controls button.primary')).toBeVisible();
  await noHorizontalScroll(page, 'ending');

  // The last officer reaction showed right before the ending card (bug fixed 2026-11-07).
  expect(previous, 'screen before the ending card').toBe('reaction');
  expect(lastReaction).not.toBe('');

  expect(errors, 'console errors').toEqual([]);
});

interface AnswerCard {
  /** The text of each row: the button's direct children. */
  rows: string[];
  /** The consequence row sits below the action row. */
  stacked: boolean;
  labelWeight: string;
  /** The weight of every piece of text on the consequence row. */
  lineWeights: string[];
}

/** The answer cards on screen, as rows and font weights. */
async function answerCards(page: Page): Promise<AnswerCard[]> {
  return page.locator('main.run .controls button.choice').evaluateAll((buttons) =>
    buttons.map((b) => {
      const rows = [...b.children] as HTMLElement[];
      const [label, line] = rows;
      const pieces = line ? [line, ...line.querySelectorAll<HTMLElement>('.consequence-text, .part')] : [];
      return {
        rows: rows.map((r) => r.innerText),
        stacked: !!label && !!line && line.getBoundingClientRect().top >= label.getBoundingClientRect().bottom,
        labelWeight: label ? getComputedStyle(label).fontWeight : '',
        lineWeights: pieces.map((el) => getComputedStyle(el).fontWeight),
      };
    }),
  );
}

/** Opens the run on a saved state, as a returning player would. */
async function openAt(page: Page, run: RunState) {
  await openSaved(page, { ...freshSave(), run });
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
  await expect(reaction).toContainText('Found in the old records: Your registered family address.');
  await expect(next).toHaveText('Continue');

  // The last passport card (both core cards asked, the follow-up slot spent): the button walks on to customs.
  await openAt(page, { ...lenaRun(), screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 3, seen: ['p_host', 'p_purpose'] });
  await page.getByRole('button', { name: /Show your mother's letter/ }).click();
  await expect(reaction).toContainText('Found in the old records: Your registered family address.');
  await expect(next).toHaveText('Proceed to customs');
  await next.click();
  await expect(page.locator('main.run .queue-scene')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a contact who vouches: the story beat, then separate result rows for what was verified and what went on file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  // A short trip home with a pensioner's prescription: customs asks, and Lena's mother can confirm why she came.
  await openAt(page, { ...lenaRun(), claims: ['shortTrip'], screen: { kind: 'encounter', id: 'c_shortTrip' }, checkpoint: 1, slot: 1 });
  await page.getByRole('button', { name: /Ask him to call your mother/ }).click();
  const reaction = page.locator('main.run .panel.reaction');
  const beat = reaction.locator('.story-beat');
  const rows = reaction.locator('.changes li');
  await expect(beat).toHaveText('Your mother answers on the second ring. He asks for her address and who else lives there, and writes down both.');
  // Her address and the family go on file too. On a records day both reach the desks ahead,
  // which their known-facts line shows, so no row repeats them.
  await expect(rows).toHaveText([
    'Your reason verified.', "On file at Customs: your mother's number.",
    'Found in the old records: Your registered family address.', 'Confirmed: Your mother names another relative.',
  ]);
  // Separate elements: the beat holds no result text, and the rows sit under it.
  await expect(beat).not.toContainText('verified');
  const beatBox = (await beat.boundingBox())!;
  const firstRow = (await rows.first().boundingBox())!;
  expect(firstRow.y, 'first result row below the beat').toBeGreaterThanOrEqual(beatBox.y + beatBox.height);
  await noHorizontalScroll(page, 'contact reaction');
  expect(errors).toEqual([]);
});

test('the passport and customs cards each say what the officer already knows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const line = page.locator('main.run [data-known]');
  // Passport, first card: nothing has come out at this desk yet.
  const passport: RunState = { ...lenaRun(), reaction: null, screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 1, seen: ['p_purpose'] };
  await openAt(page, passport);
  await expect(line).toHaveCount(1);
  await expect(line).toHaveText('Nothing on your file yet.');
  // Customs, after a fact was confirmed at passport and shared: the line names it.
  const customs: RunState = {
    ...lenaRun(), reaction: null, screen: { kind: 'encounter', id: 'c_medicine' }, checkpoint: 1, slot: 1,
    seen: ['p_purpose', 'p_host', 'c_medicine'], facts: { ...lenaRun().facts, fatherCondition: ['passport', 'customs', 'interview'] },
  };
  const [part] = knownLine(customs);
  expect(part.key).toBe('known.fact.confirmed');
  await openAt(page, customs);
  await expect(line).toHaveText(t(part.key, part.vars));
  await expect(line).not.toHaveText('');
  await noHorizontalScroll(page, 'known-facts line');
  // A secondary inspection names the open issue it is about instead (4qd.11).
  const inspection: RunState = { ...lenaRun(), reaction: null, screen: { kind: 'inspection', id: 's_bag' }, checkpoint: 1, slot: 1, inspections: 1, seen: ['p_purpose', 'p_host', 's_bag'] };
  await openAt(page, inspection);
  await expect(line).toHaveText('Not verified yet: the prescription.');
  await noHorizontalScroll(page, 'inspection issue line');
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
  await expect(reaction).toContainText('Found in the old records: Your registered family address.');
  await expect(reaction).toContainText('Sent on to Customs: Your registered family address.');
  await page.locator('main.run .controls button.primary').click();

  await page.getByRole('button', { name: 'My story' }).click();
  const sheet = page.locator('dialog.sheet[open]');
  const row = sheet.locator('.record li[data-fact="familyAddress"]');
  await expect(row).toContainText('Your registered family address');
  // Found in the old records, not something new she told them.
  await expect(row.locator('.tier')).toHaveText('In the old records');
  // Passport control and customs know it; the interview does not.
  await expect(row.locator('.desks')).toHaveText('Passport control and Customs have this on file');
  await noHorizontalScroll(page, 'My story with desks');

  // Records first, then the messages so far, the biography below, every section one full-width column (2026-11-09 review).
  await expect(sheet.locator('h3')).toHaveText(['Your answers', 'Information recorded', 'Messages', 'People', 'Background']);
  const widths = await sheet.locator('.story-section').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(widths).toHaveLength(5);
  for (const w of widths) expect(w, 'My story section width').toBeGreaterThanOrEqual(300);
  // Each contact's abilities, from the table in src/game/content/world.ts.
  await expect(sheet.locator('.people .can')).toHaveText([
    'Can confirm: address, why you came, prescription',
    /^Can confirm: (a place to stay|a job offer abroad)$/,
  ]);
  expect(errors).toEqual([]);
});

// Every check reads the same: one plain line for what they are doing, one observation, the actions.
for (const check of Object.keys(CHECKS) as CheckId[]) {
  test(`the ${check} wait shows one plain line, one observation and the actions, with the header still on screen`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./');
    const screen: Screen = { kind: 'wait', check, beats: [0, 1], shown: 2, resolved: { result: 'clear' }, asked: false };
    await openAt(page, { ...lenaRun(), screen, checkpoint: 1, slot: 1 });

    const panel = page.locator('main.run .panel.waiting');
    await expect(panel.locator('h2')).toHaveText(en[`check.${check}.title`]);
    // A check in stages ends on its observation instead of the last beat, and words its own answers.
    const staged = !!CHECKS[check].explain;
    await expect(panel.locator('p')).toHaveText([staged ? en[`check.${check}.observe.clear`] : en['beat.customs.1']]);
    // The old labels are gone: no "Waiting", no "Verification in progress", no check name.
    await expect(page.locator('main.run')).not.toContainText('Waiting');
    await expect(page.locator('main.run')).not.toContainText('Verification in progress');
    await expect(page.locator('main.run')).not.toContainText(/(Address|Medicine|Records) check|Phone search/);

    const buttons = page.locator('main.run .controls button');
    await expect(buttons.nth(0)).toHaveText(staged ? en[`check.${check}.wait.label`] : 'Wait for the result');
    await expect(buttons.nth(0)).toHaveClass(/wait-go/);
    const ask = buttons.nth(staged ? 2 : 1);
    if (staged) await expect(buttons.nth(1)).toContainText(en[`check.${check}.explain.label`]);
    await expect(ask).toContainText(staged ? en[`check.${check}.ask.label`] : 'Ask for an update');
    await expect(ask.locator('.consequence')).toHaveText('Your urgency goes on file');
    await expect(page.locator('.strip .stat.time')).toContainText('8 hours left');
    await expect(page.locator('.strip .scrutiny')).toContainText('Scrutiny');

    if (check === 'medicineLab') {
      // Asking puts the urgency on file and gives the hint, and the reaction says both.
      await buttons.nth(1).click();
      await expect(page.locator('main.run .panel.reaction')).toContainText('Confirmed: You\'re in a hurry.');
      await expect(page.locator('main.run .panel.reaction')).toContainText(en['check.medicineLab.hint.clear']);
      // The hint comes before the decision: back in the waiting room, with the result still to come.
      await page.locator('main.run .controls button.primary').click();
      await expect(buttons.nth(0)).toHaveText('Wait for the result');
      await expect(page.locator('main.run .controls')).not.toContainText('Ask for an update');
    }
    expect(errors).toEqual([]);
  });
}

test('a Home in time ending is a short result card that fits the screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  // One answer recorded at a desk, one only said aloud, and a fact two desks have, for the Border records sheet.
  const run: RunState = {
    ...lenaRun(), time: 5, checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending: 'homeInTime',
    claims: ['familyVisit', 'cashUnderLimit'], logged: { cashUnderLimit: ['customs'] }, facts: { familyAddress: ['customs', 'interview'] },
  };
  await openSaved(page, { ...freshSave(), run, endingsSeen: ['homeInTime'] });

  const card = page.locator('.ending-card');
  await expect(card).toBeVisible();
  await expect(page.locator('.ending .setup-title')).toHaveText('Purpose of Visit');
  await expect(card.locator('.outcome')).toHaveText('Crossing complete');
  await expect(card.locator('h1')).toHaveText('Home in time');
  await expect(card.locator('.kept')).toHaveText("Your father's medicine is still in the cool bag. You keep your cousin Ilya out of the file.");
  // Nothing went wrong, so there is no consequence.
  await expect(card.locator('.cost')).toHaveCount(0);
  await expect(card.locator('.epilogue')).toContainText('visiting hours end');
  // Hours left and the other stats sit in the run summary under the story.
  const rows = card.locator('.run-summary .result-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveText(/Hours left\s*5$/);
  await expect(rows.nth(1)).toHaveText(/Medicine\s*Kept/);
  await expect(rows.nth(2)).toHaveText(/Your cousin Ilya\s*Not named/);

  // The whole ending fits the phone: no page scroll, nothing cut off.
  await noHorizontalScroll(page, 'ending');
  const fits = await page.evaluate(() => {
    const main = document.querySelector('main.ending') as HTMLElement;
    return { doc: document.documentElement.scrollHeight <= window.innerHeight, main: main.scrollHeight <= main.clientHeight };
  });
  expect(fits, 'ending scrolls').toEqual({ doc: true, main: true });
  await expect(page.getByRole('button', { name: 'Play again', exact: true })).toBeInViewport();

  // See border records opens Border records alone: no epilogue, no costs, no biography.
  await page.getByRole('button', { name: 'See border records' }).click();
  const sheet = page.locator('dialog.sheet[open]');
  await expect(sheet.locator('h2')).toHaveText('Border records');
  await expect(sheet.locator('h3')).toHaveText(['Your answers', 'Information recorded']);
  // Each item written out with the desks that have it, and no ON FILE badge or help paragraph.
  await expect(sheet.locator('li[data-claim="cashUnderLimit"] .desks')).toHaveText('Recorded at Customs');
  await expect(sheet.locator('li[data-claim="familyVisit"] .desks')).toHaveText('Said aloud, not recorded');
  await expect(sheet.locator('li[data-fact="familyAddress"]')).toHaveText(/Your registered family address\s*In the old records\s*Customs and Security interview have this on file/);
  await expect(sheet.locator('.tag')).toHaveCount(0);
  await expect(sheet).not.toContainText('Each desk sees');
  const sizes = await sheet.locator('.record li > *').evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  for (const px of sizes) expect(px, 'records text size').toBeGreaterThanOrEqual(15);
  await expect(sheet).not.toContainText('visiting hours end');
  await expect(sheet).not.toContainText('Background');
  await expect(sheet.locator('.what-it-cost')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);

  // Play again goes back to the level list, then to picking a traveler.
  await page.getByRole('button', { name: 'Play again', exact: true }).click();
  await pickArrival(page);
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
    await openSaved(page, { ...freshSave(), run, endingsSeen: ['tooLate'] });

    const card = page.locator('.ending-card');
    await expect(card.locator('h1')).toHaveText(en[`ending.${text}.title`]);
    await expect(card.locator('.kept')).toHaveText(`${en['ending.kept.medicine']} You keep your cousin Ilya out of the file.`);
    await expect(card).toBeInViewport();
    await noHorizontalScroll(page, `${text} ending`);
    await expect(card.locator('.epilogue')).toHaveText(en[`ending.${text}.body`]);
    // The bus left without you: an empty stop under a streetlight, not the inside of the bus.
    const scene = page.locator('.ending-scene svg[role="img"]');
    await expect(scene).toHaveCount(1);
    await expect(scene).toBeVisible();
    if (text === 'missedBus') {
      await expect(scene).toHaveAttribute('data-scene', 'emptyStop');
      await expect(scene).toHaveAttribute('aria-label', en['scene.emptyStop']);
    } else await expect(scene).toHaveAttribute('data-scene', 'bus');
    expect(errors).toEqual([]);
  });
}

test('a Too late ending still lists the exposed mother, with no severity tag', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  const run: RunState = {
    ...lenaRun(), time: 1, exposed: ['mother'], facts: { urgency: ['customs'] }, checkpoint: 3,
    screen: { kind: 'ending' }, reaction: null, ending: 'tooLate',
  };
  await openSaved(page, { ...freshSave(), run, endingsSeen: ['tooLate'] });

  const card = page.locator('.ending-card');
  await expect(card.locator('h1')).toHaveText('Too late');
  // The headline stays the same; the cost of the exposure is on the ending screen too,
  // as a heading and a line. What is on file has no line, because the records sheet lists it.
  const lines = card.locator('.costs li');
  await expect(lines).toHaveCount(1);
  await expect(lines.nth(0).locator('.cost-title')).toHaveText('The border calls your mother');
  await expect(lines.nth(0).locator('.cost-line')).toHaveText("She has to leave your father's bedside to answer questions.");
  await expect(card).not.toContainText(/on file now|Minor|Serious|Severe/);
  expect(errors).toEqual([]);
});

// Every ending, each with something to lose, down to the worst case: the medicine lost,
// the protected contact named and the mother's address on file (pfi.13, pfi.9).
const endingCases: { name: string; run: () => RunState; worst: string }[] = [
  { name: 'homeInTime', worst: 'exposure.mother.call', run: () => ({ ...lenaRun(), time: 5, exposed: ['mother'], ending: 'homeInTime' }) },
  { name: 'tooLate', worst: 'exposure.mother.home', run: () => ({ ...lenaRun(), time: 1, exposed: ['mother'], facts: { familyAddress: ['interview'] }, flagged: ['familyAddress'], flaggedAt: { familyAddress: 'interview' }, ending: 'tooLate' }) },
  { name: 'missedBus', worst: 'ending.line.medicineLost', run: () => ({ ...lenaRun(), time: 0, medicine: false, ending: 'tooLate' }) },
  { name: 'turnedBack', worst: 'exposure.cousin.protected', run: () => ({ ...lenaRun(), time: 4, exposed: ['cousin'], withdrew: true, ending: 'turnedBack' }) },
  {
    name: 'homeAtCost, the worst case', worst: 'exposure.cousin.protected',
    run: () => ({ ...lenaRun(), time: 5, medicine: false, exposed: ['mother', 'cousin'], facts: { familyAddress: ['interview'], employer: ['passport'], urgency: ['customs'], cashCount: ['customs'] }, flagged: ['familyAddress'], flaggedAt: { familyAddress: 'interview' }, ending: 'homeAtCost' }),
  },
];
for (const c of endingCases) {
  test(`the ${c.name} ending reads title, what you kept, the worst consequence, then the epilogue, with Play again in view`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('./');
    const run: RunState = { ...c.run(), checkpoint: 3, screen: { kind: 'ending' }, reaction: null };
    await openSaved(page, { ...freshSave(), run });

    const card = page.locator('.ending-card');
    await expect(card.locator('h1')).toBeVisible();
    const worst = card.locator('.cost').first();
    await expect(worst).toHaveClass(/worst/);
    await expect(worst.locator('.cost-title')).toHaveText(en[`${c.worst}.title`]);
    await expect(worst.locator('.cost-line')).toHaveText(en[c.worst]);
    // A person harmed always comes with the reason, before what it did to them.
    if (c.worst.startsWith('exposure.')) await expect(worst.locator('.cost-reason')).not.toBeEmpty();
    // In reading order: title, kept line, worst heading and line, epilogue, then the run summary with hours left.
    const order = ['h1', '.kept', '.worst .cost-title', '.worst .cost-line', '.epilogue', '.run-summary'];
    const tops: number[] = [];
    for (const sel of order) tops.push((await card.locator(sel).boundingBox())!.y);
    expect(tops, order.join(' > ')).toEqual([...tops].sort((a, b) => a - b));
    await expect(card.locator('.run-summary .result-row').first()).toHaveText(new RegExp(`^Hours left\\s*${run.time}$`));
    // Story text at 17-18 px in the sans face, not monospace, at regular weight.
    for (const sel of ['.kept', '.cost-line', '.epilogue']) {
      const style = await card.locator(sel).first().evaluate((el) => {
        const cs = getComputedStyle(el);
        return { size: parseFloat(cs.fontSize), family: cs.fontFamily, weight: cs.fontWeight };
      });
      expect(style.size, sel).toBeGreaterThanOrEqual(17);
      expect(style.size, sel).toBeLessThanOrEqual(18);
      expect(style.family, sel).not.toMatch(/mono/i);
      expect(style.weight, sel).toBe('400');
    }
    // No on-file count and no severity tag on any consequence.
    await expect(card).not.toContainText(/on file now|Minor|Serious|Severe/);
    await expect(card.locator('.tag')).toHaveCount(0);
    // Play again is on screen without scrolling.
    const scrolled = await page.evaluate(() => ({ doc: window.scrollY, main: document.querySelector('main.ending')!.scrollTop }));
    expect(scrolled).toEqual({ doc: 0, main: 0 });
    await expect(page.getByRole('button', { name: 'Play again', exact: true })).toBeInViewport({ ratio: 1 });
    await noHorizontalScroll(page, `${c.name} ending`);
    // The sheet button names the sheet it opens (pfi.18).
    await expect(page.getByRole('button', { name: "See what's on file" })).toHaveCount(0);
    await page.getByRole('button', { name: 'See border records' }).click();
    await expect(page.locator('dialog.sheet[open] h2')).toHaveText('Border records');
    expect(errors).toEqual([]);
  });
}

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
  // The bag search can be dealt at any checkpoint, so every scene opens the suitcase.
  for (const [checkpoint, name] of [[0, 'passport'], [2, 'interview']] as const) {
    await openAt(page, { ...lenaRun(), reaction: null, screen: { kind: 'inspection', id: 's_bag' }, checkpoint, slot: 1 });
    await expect(page.locator(`main.run .scene svg[data-scene="${name}"] [data-name="open suitcase"]`), name).toHaveCount(1);
  }
  // An ordinary customs card has neither.
  await openAt(page, { ...lenaRun(), reaction: null, screen: { kind: 'encounter', id: 'c_medicine' }, checkpoint: 1, slot: 1 });
  await expect(scene.locator('[data-name="open suitcase"]')).toHaveCount(0);
  await expect(scene.locator('[data-name="supervisor"]')).toHaveCount(0);
  // At passport control the clerk holds your passport behind the glass.
  await openAt(page, { ...lenaRun(), reaction: null, screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 1 });
  await expect(page.locator('main.run .scene svg[data-scene="passport"] [data-name="passport behind the glass"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

// "Why now?" with the letter and the hospital note packed: one "Show a document" answer
// opens both under the same question, each with its own cost line, and Back to answers
// returns to the card. Both phone heights, so the way back is never below the screen.
for (const height of [844, 667]) {
  test(`at 390x${height} the document list shows both documents and the way back on screen`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.setViewportSize({ width: 390, height });
    await page.goto('./');
    const run = newRun({ character: 'lena', loadout: ['motherLetter', 'hospitalNote', 'employerLetter'], bulletin: 'records', seed: 7 });
    await openAt(page, { ...run, reaction: null, screen: { kind: 'encounter', id: 'p_purpose' }, checkpoint: 0, slot: 1 });
    const answers = page.locator('main.run .controls button.choice');
    await expect(answers).toHaveCount(3);
    await expect(answers.first()).toHaveText(/Show a document\s*2 documents fit/);

    await answers.first().click();
    const question = (await page.locator('main.run .question').innerText()).trim();
    expect(question).toContain('Why now?');
    expect((await answerCards(page)).map((c) => c.rows)).toEqual([
      ["Show your mother's letter", 'Uses letter · Reveals her address'],
      ['Show the hospital note', "Uses note · Reveals your father's condition"],
    ]);
    const back = page.locator('main.run .controls button.back-to-answers');
    await expect(back).toHaveText('Back to answers');
    const lowest = await page.locator('main.run .controls button').evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)));
    expect(lowest, 'the last button below the screen').toBeLessThanOrEqual(height);
    await noHorizontalScroll(page, `the document list at 390x${height}`);
    await page.screenshot({ path: `test-results/document-list-390x${height}.png` });

    await back.click();
    await expect(answers).toHaveCount(3);
    await expect(answers.first()).toHaveText(/Show a document/);
    expect(errors).toEqual([]);
  });
}
