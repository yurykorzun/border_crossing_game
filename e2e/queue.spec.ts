import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import type { CharacterId } from '../src/game/types';

// The queue before each checkpoint at 390x844: one beat per tap, phone messages in the
// phone panel, said lines as a caption over the scene, then one button up to the officer.

const MAX_STEPS = 400;

async function startRun(page: Page, id: CharacterId) {
  await page.goto('./');
  await page.locator('.title-screen button.primary').click();
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

/** The first message starts within 16 px of the scene's bottom edge, or overlaps it. */
async function expectPhoneAgainstScene(page: Page) {
  const scene = await page.locator('main.run .scene').boundingBox();
  const msg = await page.locator('main.run .panel.phone .msg').first().boundingBox();
  expect(scene && msg, 'scene and first message on screen').toBeTruthy();
  expect(msg!.y - (scene!.y + scene!.height), 'gap between scene and first message').toBeLessThanOrEqual(16);
}

for (const [id, own, other] of [['lena', 'Ilya', 'Tom'], ['mark', 'Tom', 'Ilya']] as const) {
  test(`first queue for ${id}: one beat per tap, ending in Approach the booth`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await startRun(page, id);

    const run = page.locator('main.run');
    const scene = run.locator('.scene');
    const caption = scene.locator('.caption');
    const phone = run.locator('.panel.phone');
    const msgs = phone.locator('.msg');
    const button = run.locator('.controls button.primary');
    const strip = run.locator('.strip');

    // The queue is not named after the checkpoint yet, and the strip says so once:
    // the scene carries no title of its own.
    await expect(strip).toContainText('1 / 3 · In the queue');
    await expect(run.getByText('In the queue')).toHaveCount(1);
    await expectFits(page, 'beat 1');
    await expectPhoneAgainstScene(page);
    for (const part of ['.strip', '.scene', '.panel', '.controls'])
      await expect(run.locator(part)).not.toContainText('Passport control');

    // 1. The phone vibrates: mother's first message, in the phone.
    await expect(msgs).toHaveCount(1);
    await expect(msgs.first()).toContainText(en['msg.0.0']);
    await expect(msgs.first()).toContainText('Mother');
    await expect(caption).toHaveCount(0);
    await expect(button).toHaveText('Continue');

    // 2. A tap on the scene: the second message names this traveler's own protected contact.
    await scene.click();
    await expect(msgs).toHaveCount(2);
    await expect(msgs.nth(1)).toContainText(own);
    await expect(phone).not.toContainText(other);
    await expectFits(page, 'beat 2');

    // 3. The phone goes down; the passenger ahead speaks, as a caption over the scene.
    await button.click();
    await expect(caption).toHaveText(en['msg.0.2']);
    await expect(phone).not.toContainText('Six times');
    await expect(msgs).toHaveCount(2);
    await expect(button).toHaveText('Continue');
    await expectFits(page, 'beat 3');

    // 4. A tap on the phone works too: the booth light changes, red to green, on "Next.".
    const light = scene.locator('svg.queue-art .booth-light');
    const fill = () => light.evaluate((el) => getComputedStyle(el).fill);
    await expect(light).toHaveAttribute('data-light', 'red');
    const red = await fill();
    await phone.click();
    await expect(caption).toHaveText(en['msg.0.3']);
    await expect(caption).toHaveCount(1);
    await expect(light).toHaveAttribute('data-light', 'green');
    expect(await fill()).not.toBe(red);

    // 5. The walk up to the officer. The checkpoint is named only now.
    await expect(button).toHaveText('Approach the booth');
    await expect(run.getByText('In the queue')).toHaveCount(1);
    await expectFits(page, 'beat 4');
    await expectPhoneAgainstScene(page);
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
    if (queueGo.includes(label)) seenGo.push(label);
    await option.click();
  }
  expect(steps, 'run did not end').toBeLessThan(MAX_STEPS);
  // Every run reaches the first booth; later queues show only their own label.
  expect(seenGo[0]).toBe(en['queue.0.go']);
  seenGo.forEach((label, i) => expect(label).toBe(queueGo[i]));
  expect(errors).toEqual([]);
});
