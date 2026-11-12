// The funeral (border_crossing_game-rwf.4): Level 3. Off the level list until it has its
// own story (dap.2), so with Arrival and Departure finished the list shows those two only.
// A save that already holds funeral progress still loads, and its run resumes: her sister
// has told the border how long you stay, so the first queue has her message.
import { expect, test } from '@playwright/test';
import { en } from '../src/i18n/en';
import { openReturning, openSaved } from './returning';
import { newRun } from '../src/game/engine';
import { freshSave } from '../src/game/save';

for (const viewport of [{ width: 390, height: 844 }, { width: 390, height: 667 }]) {
  test(`The funeral is off the level list and a saved funeral run resumes (${viewport.width}x${viewport.height})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.setViewportSize(viewport);

    // Arrival and Departure finished: the list shows those two, and no funeral row.
    await openReturning(page, ['arrival', 'departure']);
    await page.locator('.title-screen button.primary').click();
    const rows = page.locator('main.level-step button.level');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toHaveAttribute('data-level', 'arrival');
    await expect(rows.nth(1)).toHaveAttribute('data-level', 'departure');
    await expect(page.getByText(en['level.funeral.title'])).toHaveCount(0);

    // A save with funeral progress: finished once, and a run under way on it.
    const run = newRun({ level: 'funeral', character: 'lena', loadout: ['hotel', 'hospitalNote', 'returnTicket'], bulletin: 'customs', seed: 4 });
    await openSaved(page, { ...freshSave(), endingsSeen: ['tooLate'], levelsFinished: ['arrival', 'departure', 'funeral'], run });

    // The first queue: her sister's message, one of the two statements.
    const shown = page.locator('main.run');
    const said = [en['msg.0.sister.sisterSaysDays'], en['msg.0.sister.sisterSaysWeeks']];
    let seen = false;
    for (let i = 0; i < 12 && !seen; i++) {
      const text = await shown.innerText();
      seen = said.some((m) => text.includes(m));
      if (!seen) await shown.locator('.controls button.primary').click();
    }
    expect(seen, "her sister's message in the first queue").toBe(true);
    await page.screenshot({ path: `test-results/funeral-queue-${viewport.height}.png` });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('purpose-of-visit-save') ?? '{}'));
    expect(saved.run.level).toBe('funeral');
    expect(saved.levelsFinished).toEqual(['arrival', 'departure', 'funeral']);
    expect(errors).toEqual([]);
  });
}
