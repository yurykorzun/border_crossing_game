// The funeral (border_crossing_game-rwf.4): Level 3, open once Departure is finished.
// Her sister has told the border how long you stay, so the first queue has her message
// and the passport desk has her statement on file from the first card.
import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { openReturning } from './returning';
import { CHARACTER_IDS } from '../src/game/content/world';

for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }]) {
  test(`The funeral opens after Departure and starts with her sister's statement (${viewport.width}x${viewport.height})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.setViewportSize(viewport);

    // Arrival finished only: The funeral is listed but locked, and names Departure.
    await openReturning(page, ['arrival']);
    await page.locator('.title-screen button.primary').click();
    const locked = page.locator('main.level-step button.level[data-level="funeral"]');
    await expect(locked).toBeDisabled();
    await expect(locked).toContainText('Level 3');
    await expect(locked).toContainText(en['ui.levelOpensAfter'].replace('{level}', en['level.departure.title']));

    // Departure finished too: it opens.
    await openReturning(page, ['arrival', 'departure']);
    await page.locator('.title-screen button.primary').click();
    const row = page.locator('main.level-step button.level[data-level="funeral"]');
    await expect(row).toBeEnabled();
    await expect(row).toContainText(en['level.funeral.blurb']);
    await row.click();
    await page.getByRole('radio').nth(CHARACTER_IDS.indexOf('lena')).click();
    await page.locator('.traveler-step .controls button.primary').click();
    const docs = page.locator('.documents-step .doc');
    for (let i = 0; i < 3; i++) await docs.nth(i).click();
    await page.locator('.documents-step .controls button.primary').click();

    // Its own goal on Before you cross.
    const mission = page.locator('main.begin-step .mission');
    await expect(mission.locator('h3')).toHaveText(en['funeral:mission.title']);
    await expect(mission).toContainText(en['funeral:mission.body']);
    await page.screenshot({ path: `test-results/funeral-begin-${viewport.height}.png` });
    await page.locator('main.begin-step .controls button.primary').click();

    // The first queue: her sister's message, one of the two statements.
    const run = page.locator('main.run');
    const said = [en['msg.0.sister.sisterSaysDays'], en['msg.0.sister.sisterSaysWeeks']];
    let seen = false;
    for (let i = 0; i < 12 && !seen; i++) {
      const text = await run.innerText();
      seen = said.some((m) => text.includes(m));
      if (!seen) await run.locator('.controls button.primary').click();
    }
    expect(seen, "her sister's message in the first queue").toBe(true);
    await page.screenshot({ path: `test-results/funeral-queue-${viewport.height}.png` });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('purpose-of-visit-save') ?? '{}'));
    expect(saved.run.level).toBe('funeral');
    expect(errors).toEqual([]);
  });
}
