import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { newRun, options } from '../src/game/engine';
import { ENCOUNTERS, INSPECTIONS } from '../src/game/content/encounters';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import { en } from '../src/i18n/en';
import { SAVE_KEY, freshSave } from '../src/game/save';
import type { CharacterId, RunState } from '../src/game/types';
import { CHECKPOINTS } from '../src/game/types';

// Screen rule 8 in docs/design.md: design for the crowded screen. The longest question in
// src/i18n/en.ts with all three of its answers, at 390x844 and again at 200 percent text.
// Every answer must be reachable and nothing may be clipped: with big text the screen
// scrolls, it never cuts text off. The card is picked from the strings, so a longer
// question added later becomes the one under test.

/** The longest card question in English, as `enc.<id>.q`, `insp.<id>.q` or a traveler's own `enc.<id>.<traveler>.q`. */
function longestQuestion() {
  const qs = Object.entries(en)
    .map(([key, text]) => ({ key, text, m: /^(enc|insp)\.([^.]+)\.(?:([a-z]+)\.)?q$/.exec(key) }))
    .filter((q) => q.m)
    .sort((a, b) => b.text.length - a.text.length);
  const { key, text, m } = qs[0];
  return { key, text, prefix: m![1] as 'enc' | 'insp', id: m![2], traveler: m![3] as CharacterId | undefined };
}

/** A saved run on that card for a traveler who gets three answers on it. */
function crowdedRun(): { run: RunState; question: string; key: string } {
  const q = longestQuestion();
  const travelers = q.traveler ? [q.traveler] : CHARACTER_IDS;
  for (const character of travelers) {
    const base = newRun({ character, loadout: EVIDENCE_IDS.slice(0, CHARACTERS[character].evidenceSlots), bulletin: 'records', seed: 7 });
    let run: RunState;
    if (q.prefix === 'insp') {
      if (!INSPECTIONS.some((i) => i.id === q.id)) continue;
      run = { ...base, reaction: null, screen: { kind: 'inspection', id: q.id }, checkpoint: 1, slot: 1 };
    } else {
      const e = ENCOUNTERS.find((x) => x.id === q.id);
      if (!e) continue;
      const cp = e.checkpoint === 'followup' ? 2 : CHECKPOINTS.indexOf(e.checkpoint);
      run = { ...base, reaction: null, screen: { kind: 'encounter', id: q.id }, checkpoint: cp, slot: 1 };
    }
    if (options(run).length === 3) return { run, question: q.text, key: q.key };
  }
  throw new Error(`no traveler gets three answers on the longest question (${q.key})`);
}

async function openAt(page: Page, run: RunState) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, JSON.stringify({ ...freshSave(), run })] as const);
  await page.reload();
  await expect(page.locator('main.run .controls button').first()).toBeVisible();
}

/**
 * Text on the run screen that is cut off: a line past the edge of a box that clips
 * (overflow hidden or clip) and does not scroll, or past the side of the screen, where
 * the page never scrolls sideways. A box that scrolls keeps its text reachable.
 */
async function clippedText(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.querySelector('main.run')!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent!.trim();
      // Closed sheets stay in the page, hidden; only what is drawn counts.
      if (!text || !n.parentElement!.checkVisibility()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
      if (rects.length === 0) { out.push(`not drawn: ${text}`); continue; }
      for (const r of rects) {
        if (r.left < -1 || r.right > document.documentElement.clientWidth + 1) out.push(`off the side: ${text}`);
        for (let el = n.parentElement; el && el !== document.body; el = el.parentElement) {
          const s = getComputedStyle(el);
          if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) out.push(`ellipsis: ${text}`);
          const clipX = s.overflowX === 'hidden' || s.overflowX === 'clip';
          const clipY = s.overflowY === 'hidden' || s.overflowY === 'clip';
          if (!clipX && !clipY) continue;
          const b = el.getBoundingClientRect();
          if (clipX && (r.left < b.left - 1 || r.right > b.right + 1)) out.push(`cut at the side by .${el.className}: ${text}`);
          if (clipY && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) out.push(`cut at the bottom by .${el.className}: ${text}`);
        }
      }
    }
    return [...new Set(out)];
  });
}

/**
 * Scrolls an element into view and says whether all of it is then on screen: inside the
 * viewport, inside every box around it that clips or scrolls, and not covered at its middle.
 */
async function wholeInView(page: Page, selector: string, index: number) {
  return page.evaluate(([sel, i]) => {
    const el = document.querySelectorAll<HTMLElement>(sel)[i];
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const inside = (b: { left: number; right: number; top: number; bottom: number }) =>
      r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
    if (!inside({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight })) return `${sel} #${i} not inside the screen`;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflow !== 'visible' && !inside(p.getBoundingClientRect())) return `${sel} #${i} cut by .${p.className}`;
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !el.contains(hit)) return `${sel} #${i} covered at its middle`;
    return 'ok';
  }, [selector, index] as const);
}

for (const scale of [1, 2]) {
  const size = scale === 1 ? '' : `, ${scale * 100} percent text`;
  test(`the longest question with three answers at 390x844${size}: every answer reachable, nothing clipped`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    const { run, question, key } = crowdedRun();
    await page.goto('./');
    await openAt(page, run);
    // The reader's text size: the root font size, which every rem in the stylesheet follows.
    if (scale !== 1) await page.evaluate((s) => { document.documentElement.style.fontSize = `${s * 100}%`; }, scale);

    await expect(page.locator('main.run .question'), key).toHaveText(question);
    const answers = page.locator('main.run .controls button.choice');
    await expect(answers, key).toHaveCount(3);
    expect(await clippedText(page), `clipped text${size}`).toEqual([]);

    // The question, every answer and the tray can each be scrolled to and seen whole.
    expect(await wholeInView(page, 'main.run .question', 0), `question${size}`).toBe('ok');
    for (let i = 0; i < 3; i++) {
      expect(await wholeInView(page, 'main.run .controls button.choice', i), `answer ${i + 1}${size}`).toBe('ok');
      await answers.nth(i).click({ trial: true });
    }
    const tools = await page.locator('main.run .tools button').count();
    for (let i = 0; i < tools; i++) expect(await wholeInView(page, 'main.run .tools button', i), `tray button ${i + 1}${size}`).toBe('ok');

    if (scale !== 1) {
      // Big text makes this the crowded screen: the answers wrap onto more lines and the
      // screen scrolls to fit them, instead of shrinking or cutting them.
      const lines = await answers.locator('.choice-label').evaluateAll((labels) =>
        labels.map((l) => Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight))),
      );
      expect(Math.max(...lines), `an answer wraps${size}`).toBeGreaterThan(1);
      const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight);
      expect(scrolls, `the run screen scrolls${size}`).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}
