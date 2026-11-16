// The question area is a scroll container, so a scrollbar can show at its right edge
// (border_crossing_game-dap.27: at 390x844 it touched "papers." in the security interview).
// On a phone or a Mac the bar overlays the text column instead of taking its own room,
// which is the geometry Playwright's hidden scrollbars give too (clientWidth stays the
// full width). So at the customs and security interview desks every text line in the
// question area ends at least 4px left of the scroll container's inner edge. A line can
// run to its block's content edge, so the check takes that edge, not only where today's
// words happen to wrap.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SAMPLE_FILES } from '../src/game/carry';
import { newRun } from '../src/game/engine';
import { ENCOUNTERS, INSPECTIONS } from '../src/game/content/encounters';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import { freshSave } from '../src/game/save';
import type { LevelId, RunState, Screen } from '../src/game/types';
import { openSaved } from './returning';

const MIN_ROOM = 4;

/** Every customs and security interview card, for each traveler and bulletin, in Arrival and Departure. */
function deskStates(): { name: string; run: RunState }[] {
  const out: { name: string; run: RunState }[] = [];
  for (const level of ['arrival', 'departure'] as LevelId[]) {
    for (const id of CHARACTER_IDS) for (const bulletin of BULLETINS) {
      const loadout = EVIDENCE_IDS.slice(0, CHARACTERS[id].evidenceSlots);
      const base = newRun({ level, character: id, loadout, bulletin, seed: 7, ...(level === 'departure' ? { file: SAMPLE_FILES[id] } : {}) });
      const at = (screen: Screen, checkpoint: number): RunState => ({ ...base, reaction: null, screen, checkpoint, slot: 1 });
      for (const e of ENCOUNTERS) {
        if (e.checkpoint === 'passport') continue;
        const cp = e.checkpoint === 'customs' ? 1 : 2;
        out.push({ name: `${level} ${id} ${bulletin} ${e.id}`, run: at({ kind: 'encounter', id: e.id }, cp) });
      }
      for (const i of INSPECTIONS) {
        for (const cp of [1, 2]) out.push({ name: `${level} ${id} ${bulletin} ${i.id} at ${cp}`, run: at({ kind: 'inspection', id: i.id }, cp) });
      }
    }
  }
  return out;
}

/**
 * How far each text line in the question area ends from its scroll container's inner
 * right edge: where the words end, and where the line box ends (its block's content edge).
 */
async function room(page: Page) {
  return page.evaluate(() => {
    const ask = document.querySelector('main.run .panel.ask')!;
    let box: Element | null = ask;
    while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (!box) return { scroller: false, lines: [] as { text: string; room: number }[] };
    const r = box.getBoundingClientRect();
    const inner = r.left + box.clientLeft + box.clientWidth;
    const lines: { text: string; room: number }[] = [];
    const walker = document.createTreeWalker(ask, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent?.trim() ?? '';
      if (!text) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const line of range.getClientRects()) {
        if (line.width > 0) lines.push({ text: text.slice(0, 40), room: inner - line.right });
      }
      // The block the line wraps in: a longer word would run to its content edge.
      let block = n.parentElement!;
      while (getComputedStyle(block).display.startsWith('inline')) block = block.parentElement!;
      const b = block.getBoundingClientRect();
      const cs = getComputedStyle(block);
      const edge = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      lines.push({ text: `${text.slice(0, 40)} (line box)`, room: inner - edge });
    }
    return { scroller: true, lines };
  });
}

test('no text line in the question area comes within 4px of its scrollbar at customs and the security interview', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./');
  let checked = 0;
  for (const { name, run } of deskStates()) {
    await openSaved(page, { ...freshSave(), run });
    await expect(page.locator('main.run .panel.ask .question'), name).toBeVisible();
    const m = await room(page);
    expect(m.scroller, `a scroll container around the question on ${name}`).toBe(true);
    expect(m.lines.length, `text lines on ${name}`).toBeGreaterThan(0);
    for (const line of m.lines) {
      expect(line.room, `"${line.text}" on ${name}`).toBeGreaterThanOrEqual(MIN_ROOM);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
