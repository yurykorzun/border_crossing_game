import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import type { CharacterId } from '../src/game/types';
import { openReturning, pickArrival } from './returning';

// The queue before each checkpoint at 390x844: one beat per tap, a scene cropped around
// the booth (200-240 px), the current beat alone under it at 18/26 px, then one button up
// to the officer. Earlier messages stay readable in My story.

const MAX_STEPS = 400;

async function startRun(page: Page, id: CharacterId) {
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();
  await pickArrival(page);
  await page.getByRole('radio').nth(CHARACTER_IDS.indexOf(id)).click();
  await page.locator('.traveler-step .controls button.primary').click();
  const docs = page.locator('.documents-step .doc');
  for (let i = 0; i < CHARACTERS[id].evidenceSlots; i++) await docs.nth(i).click();
  await page.locator('.documents-step .controls button.primary').click();
  await page.locator('.begin-step .controls button.primary').click();
}

/** Nothing scrolls the page: the queue fits in the phone screen on every beat. */
async function expectFits(page: Page, where: string) {
  const scroll = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
  expect(scroll, `page scroll on ${where}`).toBeLessThanOrEqual(0);
}

/**
 * The scene is 200-240 px tall, and exactly one message sits right under it
 * (within 16 px of its bottom edge, or overlapping) at 18 px text on a 26 px line.
 */
async function expectOneMessageUnderScene(page: Page, where: string) {
  const msgs = page.locator('main.run .queue-beat .msg');
  await expect(msgs, `one message on ${where}`).toHaveCount(1);
  const scene = await page.locator('main.run .scene').boundingBox();
  const msg = await msgs.boundingBox();
  expect(scene && msg, 'scene and message on screen').toBeTruthy();
  expect(scene!.height, `scene height on ${where}`).toBeGreaterThanOrEqual(200);
  expect(scene!.height, `scene height on ${where}`).toBeLessThanOrEqual(240);
  expect(msg!.y - (scene!.y + scene!.height), `gap between scene and message on ${where}`).toBeLessThanOrEqual(16);
  expect(msg!.y, `message below the scene on ${where}`).toBeGreaterThan(scene!.y + scene!.height - 1);
  const font = await msgs.evaluate((el) => [getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight]);
  expect(font, `message type on ${where}`).toEqual(['18px', '26px']);
}

for (const [id, own, other] of [['lena', 'Ilya', 'Tom'], ['mark', 'Tom', 'Ilya']] as const) {
  test(`first queue for ${id}: one message at a time, ending in Approach the booth`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await startRun(page, id);

    const run = page.locator('main.run');
    const scene = run.locator('.scene');
    const beat = run.locator('.queue-beat');
    const msg = beat.locator('.msg');
    const button = run.locator('.controls button.primary');
    const strip = run.locator('.strip');

    // The queue is not named after the checkpoint yet, and the strip says so once:
    // the scene carries no title of its own.
    await expect(strip).toContainText('1 / 3 · In the queue');
    await expect(run.getByText('In the queue')).toHaveCount(1);
    await expectFits(page, 'beat 1');
    await expectOneMessageUnderScene(page, 'beat 1');
    for (const part of ['.strip', '.scene', '.panel', '.controls'])
      await expect(run.locator(part)).not.toContainText('Passport control');

    // 1. The phone vibrates: Mom's first message, alone under the scene.
    await expect(msg).toContainText(en['msg.0.0']);
    await expect(msg.locator('.msg-from')).toHaveText('Mom');
    await expect(msg).toContainText("The doctor says Dad can hear me. Come straight here.");
    await expect(button).toHaveText('Continue');

    // 2. A tap on the scene: the warning about this traveler's own protected contact replaces it.
    await scene.click();
    await expectOneMessageUnderScene(page, 'beat 2');
    await expect(msg).toContainText(own);
    await expect(msg).not.toContainText(en['msg.0.0']);
    await expect(beat).not.toContainText(other);
    await expectFits(page, 'beat 2');

    // 3. The relative writes too, something ordinary, signed with their own name.
    await button.click();
    await expectOneMessageUnderScene(page, 'beat 3');
    await expect(msg).toContainText(en[`msg.0.personal.${id}`]);
    await expect(msg.locator('.msg-from')).toHaveText(own);
    await expectFits(page, 'beat 3');

    // 4. The passenger ahead speaks, in the same place.
    await button.click();
    await expectOneMessageUnderScene(page, 'beat 4');
    await expect(msg).toHaveText(en['msg.0.2']);
    await expect(button).toHaveText('Continue');
    await expectFits(page, 'beat 4');

    // The earlier messages, the warning included, are in My story.
    await run.getByRole('button', { name: 'My story' }).click();
    const story = page.locator('dialog.sheet[open] .messages');
    await expect(story.locator('.msg')).toHaveCount(3);
    await expect(story.locator('.msg').first()).toContainText(en['msg.0.0']);
    await expect(story.locator('.msg').first()).toContainText('Mom');
    await expect(story.locator('.msg').nth(1)).toContainText(own);
    await expect(story.locator('.msg').nth(2)).toContainText(en[`msg.0.personal.${id}`]);
    await expect(story).not.toContainText(other);
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog.sheet[open]')).toHaveCount(0);

    // 5. A tap on the message works too: the clerk's "Next." replaces it, and the booth
    // light changes, red to green.
    const light = scene.locator('svg.queue-art .booth-light');
    const fill = () => light.evaluate((el) => getComputedStyle(el).fill);
    await expect(light).toHaveAttribute('data-light', 'red');
    const red = await fill();
    await beat.click();
    await expectOneMessageUnderScene(page, 'beat 5');
    await expect(msg).toHaveText(en['msg.0.3']);
    await expect(light).toHaveAttribute('data-light', 'green');
    expect(await fill()).not.toBe(red);

    // 6. The walk up to the officer, or the one early point to turn back. The checkpoint is named only now.
    await expect(button).toHaveText('Approach the booth');
    await expect(run.locator('.controls button.turn-back')).toHaveText(en['queue.0.turnBack']);
    await expect(run.getByText('In the queue')).toHaveCount(1);
    await expectFits(page, 'beat 5');
    await button.click();
    await expect(run.getByText('In the queue')).toHaveCount(0);
    await expect(strip).toContainText('1 / 3 · Passport control');
    await expect(run.locator('.officer')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('a whole Mark run never shows Ilya, and each queue ends in its own button', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await startRun(page, 'mark');

  const ending = page.locator('.ending-card');
  const waitingSkip = page.locator('.panel.waiting .skip');
  const queueGo = [en['queue.0.go'], en['queue.1.go'], en['queue.2.go']];
  const seenGo: string[] = [];
  let steps = 0;
  for (; steps < MAX_STEPS; steps++) {
    const shown = await page.locator('.shell').innerText();
    expect(shown, `step ${steps}`).not.toContain('Ilya');
    if (await ending.isVisible()) break;
    if (await waitingSkip.isVisible()) {
      await page.locator('.panel.waiting').click();
      continue;
    }
    const option = page.locator('main.run .controls button:enabled').first();
    await expect(option).toBeVisible();
    const label = (await option.innerText()).trim();
    if (queueGo.includes(label)) {
      seenGo.push(label);
      // Only the passport queue offers to leave it (canTurnBack() in src/game/engine.ts).
      await expect(page.locator('main.run .controls button.turn-back'), label).toHaveCount(seenGo.length === 1 ? 1 : 0);
      // Every queue is a drawn scene, not a blank panel.
      await expect(page.locator('main.run .queue-scene svg.queue-art'), label).toBeVisible();
    }
    await option.click();
  }
  expect(steps, 'run did not end').toBeLessThan(MAX_STEPS);
  // Every run reaches the first booth; later queues show only their own label.
  expect(seenGo[0]).toBe(en['queue.0.go']);
  seenGo.forEach((label, i) => expect(label).toBe(queueGo[i]));
  expect(errors).toEqual([]);
});

test('leaving the passport queue ends the crossing, Turned back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await startRun(page, 'lena');
  const run = page.locator('main.run');
  const button = run.locator('.controls button.primary');
  while ((await button.innerText()).trim() !== en['queue.0.go']) await button.click();
  await expectFits(page, 'the last passport queue beat');
  await run.locator('.controls button.turn-back').click();
  await expect(run.locator('.reaction')).toContainText(en['turnBack.reaction']);
  await run.locator('.controls button.primary').click();
  await expect(page.locator('.ending-card')).toContainText(en['ending.turnedBack.title']);
  expect(errors).toEqual([]);
});

test('the packing screen shows one message, and a queue beat read on an earlier run is skipped with one tap', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const run = page.locator('main.run');
  const button = run.locator('.controls button.primary');
  const skip = run.locator('.controls button.skip-read');

  // First run: work writes before you pack.
  await openReturning(page);
  await page.locator('.title-screen button.primary').click();
  await pickArrival(page);
  await page.getByRole('radio').first().click();
  await page.locator('.traveler-step .controls button.primary').click();
  const prep = page.locator('main.documents-step .prep-message');
  await expect(prep).toHaveCount(1);
  await expect(prep).toContainText(en['msg.prep']);
  await expect(prep.locator('.msg-from')).toHaveText(en['msg.from.work']);
  const docs = page.locator('.documents-step .doc');
  for (let i = 0; i < CHARACTERS.lena.evidenceSlots; i++) await docs.nth(i).click();
  await page.locator('.documents-step .controls button.primary').click();
  await page.locator('.begin-step .controls button.primary').click();

  // Nothing is read yet, so nothing offers a skip: read the whole passport queue, then turn back.
  await expect(run.locator('.queue-beat .msg')).toContainText(en['msg.0.0']);
  while ((await button.innerText()).trim() !== en['queue.0.go']) {
    await expect(skip).toHaveCount(0);
    await button.click();
  }
  await run.locator('.controls button.turn-back').click();
  await button.click();
  await expect(page.locator('.ending-card')).toBeVisible();

  // Second run: the first beat was read before, and one tap goes past every read beat to the booth.
  await page.locator('button.choose-crossing').click();
  await pickArrival(page);
  await page.getByRole('radio').first().click();
  await page.locator('.traveler-step .controls button.primary').click();
  for (let i = 0; i < CHARACTERS.lena.evidenceSlots; i++) await docs.nth(i).click();
  await page.locator('.documents-step .controls button.primary').click();
  await page.locator('.begin-step .controls button.primary').click();
  await expect(run.locator('.queue-beat .msg')).toContainText(en['msg.0.0']);
  await expect(skip).toHaveText(en['ui.skipRead']);
  await expectFits(page, 'a read beat with Skip');
  await skip.click();
  await expect(run.locator('.queue-beat .msg')).toHaveText(en['msg.0.3']);
  await expect(button).toHaveText(en['queue.0.go']);
  await expect(skip).toHaveCount(0);
  expect(errors).toEqual([]);
});
