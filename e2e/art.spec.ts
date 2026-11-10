import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { en } from '../src/i18n/en';
import { CHARACTERS, CHARACTER_IDS } from '../src/game/content/world';
import { openReturning } from './returning';

// The pixel art (src/ui/art, inline SVG): drawn in code, so it adds no requests and little weight.

// JS gzip before the art pass was 87.4 kB (vite build, 2026-11-09); the art may add at most 40 kB.
const JS_GZIP_BUDGET = 87.4 * 1024 + 40 * 1024;

test('portraits on the traveler cards and in My story, the queue scene, and no request leaves the origin', async ({ page, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await openReturning(page);
  await page.locator('.title-screen button.primary').click();

  // Each traveler card has its own passport photo, named for screen readers.
  const cards = page.getByRole('radio');
  await expect(cards).toHaveCount(CHARACTER_IDS.length);
  for (const [i, id] of CHARACTER_IDS.entries()) {
    const portrait = cards.nth(i).locator(`svg.portrait-art[data-portrait="${id}"]`);
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveAttribute('aria-label', `Passport photo of ${en[`char.${id}.name`]}`);
  }

  await cards.first().click();
  await page.locator('.traveler-step .controls button.primary').click();
  const docs = page.locator('.documents-step .doc');
  for (let i = 0; i < CHARACTERS[CHARACTER_IDS[0]].evidenceSlots; i++) await docs.nth(i).click();
  await page.locator('.documents-step .controls button.primary').click();
  await page.locator('.begin-step .controls button.primary').click();

  // The passport queue is a drawn scene with the booth and its light.
  const scene = page.locator('main.run .scene svg.queue-art');
  await expect(scene).toBeVisible();
  await expect(scene.locator('.booth-light')).toHaveCount(1);

  // My story shows the traveler's photo, small.
  await page.getByRole('button', { name: 'My story' }).click();
  await expect(page.getByRole('dialog').locator('svg.portrait-art')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  // Walk up to the booth: the officer is a silhouette behind the glass.
  const button = page.locator('main.run .controls button.primary');
  while ((await button.innerText()).trim() !== 'Approach the booth') await button.click();
  await button.click();
  await expect(page.locator('main.run .officer svg.checkpoint-art g.officer-art')).toBeVisible();

  const origin = new URL(baseURL!).origin;
  const foreign = requests.filter((u) => !u.startsWith('data:') && new URL(u).origin !== origin);
  expect(foreign).toEqual([]);
  expect(errors).toEqual([]);
});

test(`JS bundle stays within ${Math.round(JS_GZIP_BUDGET / 1024)} kB gzip`, () => {
  // playwright.config.ts builds into dist/ before the run.
  const dir = join(process.cwd(), 'dist', 'assets');
  const js = readdirSync(dir).filter((f) => f.endsWith('.js'));
  expect(js.length).toBeGreaterThan(0);
  const total = js.reduce((sum, f) => sum + gzipSync(readFileSync(join(dir, f))).length, 0);
  expect(total).toBeLessThanOrEqual(JS_GZIP_BUDGET);
});
