import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { en } from '../src/i18n/en';
import { CHARACTERS, CHARACTER_IDS } from '../src/game/content/world';

// Setup 1: Choose your traveler, at 390x844.

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

  // A two-sentence premise at most: "You're going home. Your father has had a stroke. Your mother needs help."
  const premise = (await screen.locator('.premise').innerText()).trim();
  expect(premise.split('. ').length - 1, premise).toBeLessThanOrEqual(2);

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
