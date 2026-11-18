// The tabletop prototype (tools/tabletop.ts): the cards it builds from the content, the
// missing-key failure, and one real `npm run tabletop` that writes the PDF.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { BULLETINS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import { CONTACT_CARDS, INSPECTION_CARDS, QUESTION_CARDS, buildTabletop } from './tabletop-cards';

describe('tabletop cards', () => {
  const tt = buildTabletop(en);

  it('has the starting set: 6 questions, 3 inspections, the 6 documents, 2 travelers, 2 contacts, the bulletins', () => {
    expect(QUESTION_CARDS).toHaveLength(6);
    expect(INSPECTION_CARDS).toHaveLength(3);
    expect(EVIDENCE_IDS).toHaveLength(6);
    expect(CHARACTER_IDS).toEqual(['lena', 'mark']);
    expect(CONTACT_CARDS).toHaveLength(2);
    expect(tt.cards).toBe(6 + 3 + 6 + 2 + 2 + BULLETINS.length);
    expect(tt.missing).toEqual([]);
  });

  it('gives every question card 2-3 approaches, each with a printed cost', () => {
    for (const id of QUESTION_CARDS) expect(tt.approaches[id], id).toBeGreaterThanOrEqual(2);
    for (const id of QUESTION_CARDS) expect(tt.approaches[id], id).toBeLessThanOrEqual(3);
    // Every approach row prints a cost line, "No cost now" when it is free.
    const rows = tt.html.match(/<li><div class="al">/g)?.length ?? 0;
    expect(tt.html.match(/<div class="cost">/g)?.length ?? 0).toBeGreaterThanOrEqual(rows);
  });

  it('prints the text from en.ts, with Mark and Lena naming their own people', () => {
    expect(tt.html).toContain(en['enc.p_purpose.q']);
    expect(tt.html).toContain('"My cousin Ilya lives here."');
    expect(tt.html).toContain('"My brother Tom lives across the border."');
    expect(tt.html).toContain(en['ev.deed.desc']);
    expect(tt.html).toContain(en['ui.medicine']);
  });

  it('reports a missing card text key', () => {
    const rest = { ...en }; delete rest['enc.c_cash.q'];
    expect(buildTabletop(rest).missing).toEqual(['enc.c_cash.q']);
  });
});

describe('npm run tabletop', () => {
  it('writes an A4 PDF with the rules page, the card sheets and the tracks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tabletop-test-'));
    try {
      const out = join(dir, 'tabletop.pdf');
      const r = spawnSync('npx', ['tsx', 'tools/tabletop.ts', out], { encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      expect(existsSync(out)).toBe(true);
      const pdf = readFileSync(out).toString('latin1');
      // 1 rules page, 3 sheets of 9 cards for 22 cards, 1 tokens page. A4 is 595 × 842 pt.
      expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(5);
      expect(pdf).toMatch(/MediaBox\s*\[0 0 594\.9\d* 841\.9\d*\]/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);
});
