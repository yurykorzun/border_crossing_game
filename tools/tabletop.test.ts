// The tabletop prototype (tools/tabletop.ts): the cards it builds from the content, the
// missing-key failure, and one real `npm run tabletop` that writes the PDF.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from '../src/game/content/world';
import { ENCOUNTER_BY_ID } from '../src/game/content/encounters';
import { check, choices, newRun } from '../src/game/engine';
import type { RunSetup } from '../src/game/engine';
import type { Checkpoint, RunState } from '../src/game/types';
import { CHECKPOINTS } from '../src/game/types';
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

  it('takes the words around the game text from en.ts too, so a missing one fails the same way', () => {
    for (const k of ['tabletop.document', 'tabletop.answers', 'tabletop.part.aDocument', 'tabletop.names', 'tabletop.only', 'tabletop.part.as']) {
      const rest = { ...en }; delete rest[k];
      expect(buildTabletop(rest).missing, k).toEqual([k]);
    }
  });

  it("prints the security officer's scrutiny for naming Tom, as the engine adds it (officerFlags)", () => {
    const card = tt.html.split('<div class="card').find((c) => c.includes('<div class="id">i_family</div>'))!;
    const row = card.split('<li>').find((r) => r.includes(en['fact.brotherAbroad.reveal']))!;
    expect(row).toContain(`${en['ui.line.scrutiny#other'].replace('{n}', '1')} <i>(`);
    expect(row).toContain(`${en['fact.brotherAbroad'].toLowerCase()} not on file`);
  });
});

// The printed costs held to the engine: every question card, every answer the engine offers
// there, for each traveler under each bulletin, on a fresh run at that desk. The printed
// hours and scrutiny whose condition holds must add up to what options() charges, so a cost
// the engine adds outside the answer's own effects (an officer's reaction, a weak point)
// shows up here as a row that does not add up.
describe('printed costs match the engine', () => {
  const tt = buildTabletop(en);
  const sum = (xs: (number | undefined)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
  for (const id of QUESTION_CARDS) {
    const card = ENCOUNTER_BY_ID.get(id)!;
    for (const character of CHARACTER_IDS) {
      for (const bulletin of BULLETINS) {
        it(`${id}, ${character}, ${bulletin} bulletin`, () => {
          const setup: RunSetup = { character, loadout: EVIDENCE_IDS.slice(0, CHARACTERS[character].evidenceSlots), bulletin, seed: 1 };
          const s: RunState = {
            ...newRun(setup), checkpoint: CHECKPOINTS.indexOf(card.checkpoint as Checkpoint), slot: 0,
            screen: { kind: 'encounter', id }, seen: [id],
          };
          const rows = choices(s);
          expect(rows.length, id).toBeGreaterThan(0);
          for (const o of rows) {
            const printed = (tt.prices[`enc.${id}.${o.approach.id}`] ?? []).filter((p) => check(p.when, s));
            const engine = { hours: sum(o.effects.map((e) => ('time' in e ? -e.time : 0))), scrutiny: sum(o.effects.map((e) => ('scrutiny' in e ? e.scrutiny : 0))) };
            expect({ hours: sum(printed.map((p) => p.hours)), scrutiny: sum(printed.map((p) => p.scrutiny)) }, o.approach.id).toEqual(engine);
          }
        });
      }
    }
  }
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
