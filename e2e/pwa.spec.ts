import { expect, test } from '@playwright/test';

// Installable PWA: the build links a manifest, registers a service worker, and the
// title screen still opens with the network gone.

const BASE = '/border_crossing_game/';

test('manifest, service worker, and the title screen offline', async ({ page, context, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  // Offline, any file the cache missed shows up here.
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  await page.goto('./');
  await expect(page.locator('.title-screen h1')).toHaveText('Purpose of Visit');

  // The manifest link resolves to a manifest with what an install needs.
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe(`${BASE}manifest.webmanifest`);
  const res = await page.request.get(new URL(href!, baseURL).href);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe('Purpose of Visit');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe(BASE);
  expect(manifest.scope).toBe(BASE);
  const sizes = (manifest.icons as { sizes: string; src: string }[]).map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons as { src: string; type: string }[]) {
    const img = await page.request.get(new URL(icon.src, new URL(href!, baseURL)).href);
    expect(img.ok(), icon.src).toBe(true);
    expect(img.headers()['content-type'], icon.src).toContain('image/png');
  }

  // A service worker is registered for the game's scope and controls the page.
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe(BASE);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // Offline, a reload still shows the title screen, served by the worker.
  await context.setOffline(true);
  const reload = await page.reload();
  expect(reload?.fromServiceWorker()).toBe(true);
  await expect(page.locator('.title-screen h1')).toHaveText('Purpose of Visit');
  await expect(page.locator('.title-screen button.primary')).toBeVisible();
  // The script and styles came from the cache too: the game starts.
  await page.locator('.title-screen button.primary').click();
  await expect(page.getByRole('heading', { name: 'Choose your traveler' })).toBeVisible();
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
  await context.setOffline(false);
});
