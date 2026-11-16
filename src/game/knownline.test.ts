// The known-facts line on a desk card (border_crossing_game-dap.47): it never says
// "Old records" for a fact first put on file on this crossing, and it names the
// newest fact this desk has not already shown on the card before.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { ENCOUNTER_BY_ID } from './content/encounters';
import { caught, deskOf, knownAt, knownLine, newRun, step } from './engine';
import type { RunSetup } from './engine';
import type { Checkpoint, FactId, LevelId, RunState } from './types';

const SEEDS = 60;
const LEVELS: LevelId[] = ['arrival', 'departure'];
// The bot runs are the slow part, so both sweeps share one set.
const TIMEOUT = 60_000;
const played = new Map<string, RunState[]>();

/** Every state a run passes through, the first one included. */
function states(style: (typeof BOT_STYLES)[number], setup: RunSetup): RunState[] {
  const id = `${style} ${setup.level ?? 'arrival'} ${setup.character} ${setup.seed}`;
  const had = played.get(id);
  if (had) return had;
  const run = playRun(style, setup);
  const out = [newRun(setup)];
  for (const a of run.actions) out.push(step(out[out.length - 1], a));
  played.set(id, out);
  return out;
}

/** The fact a line names, if it names one. */
const named = (s: RunState): FactId | undefined => {
  const [part] = knownLine(s);
  return part?.key.startsWith('known.fact.') ? (part.vars?.fact as FactId) : undefined;
};

/** The facts a card asks about: its own list, or on a challenge card the fact it caught. */
const asksOn = (s: RunState, id: string): FactId[] | undefined => {
  const c = caught(s, id);
  return c ? [c.fact] : ENCOUNTER_BY_ID.get(id)?.asks;
};

describe('the known-facts line', () => {
  it(`over ${SEEDS} seeds per style and level, never says Old records for a fact put on file on this crossing`, () => {
    let found = 0;
    let old = 0;
    for (const level of LEVELS)
      for (const style of BOT_STYLES)
        for (let i = 0; i < SEEDS; i++) {
          const setup = setupFor(i, level);
          // What was on file before the traveler said a word: the run as newRun() opens it.
          const before = Object.keys(newRun(setup).facts);
          for (const s of states(style, setup)) {
            if (s.screen.kind !== 'encounter') continue;
            const [part] = knownLine(s);
            const where = `${level} ${style} seed ${i + 1} ${s.screen.id}`;
            if (part.key === 'known.fact.recorded') {
              old++;
              expect(before, where).toContain(part.vars?.fact);
            }
            if (part.key === 'known.fact.found') {
              found++;
              expect(before, where).not.toContain(part.vars?.fact);
            }
          }
        }
    // Both kinds come up: Mark's second passport and the Departure entry record are old records,
    // and a family address a desk turns up reads "On record".
    expect(old).toBeGreaterThan(0);
    expect(found).toBeGreaterThan(0);
    expect(t('known.fact.found', { fact: 'familyAddress' })).not.toMatch(/old records/i);
  }, TIMEOUT);

  it(`over ${SEEDS} seeds per style and level, names the newest fact this desk has not shown on the card before`, () => {
    let checked = 0;
    let moved = 0;
    for (const level of LEVELS)
      for (const style of BOT_STYLES)
        for (let i = 0; i < SEEDS; i++) {
          let prev: { id: string; desk: Checkpoint; named?: FactId; known: FactId[] } | undefined;
          for (const s of states(style, setupFor(i, level))) {
            if (s.screen.kind !== 'encounter' || s.screen.id === prev?.id) continue;
            const id = s.screen.id;
            const desk = deskOf(s);
            const known = knownAt(s);
            const now = named(s);
            const where = `${level} ${style} seed ${i + 1} ${id}`;
            if (prev?.desk === desk) {
              // Shown on the card before: the fact its line named, and what its answer put on file.
              const shown = new Set([...(prev.named ? [prev.named] : []), ...known.filter((f) => !prev!.known.includes(f))]);
              const asks = asksOn(s, id);
              const fresh = known.filter((f) => (!asks || asks.includes(f)) && !shown.has(f));
              if (fresh.length) {
                checked++;
                expect(now, where).toBe(fresh.at(-1));
                if (known.at(-1) !== fresh.at(-1)) moved++;
              }
            }
            prev = { id, desk, known, ...(now ? { named: now } : {}) };
          }
        }
    expect(checked).toBeGreaterThan(100);
    // The rule changed what some cards name, so the runs reach the case at all.
    expect(moved).toBeGreaterThan(0);
  }, TIMEOUT);

  it('a family address found on this crossing reads On record, and the next customs card shows the father instead', () => {
    const setup = Array.from({ length: 20 }, (_, i) => setupFor(i, 'arrival')).find((x) => x.character === 'lena')!;
    const base = newRun(setup);
    const facts = { ...base.facts, fatherCondition: ['passport', 'customs'] as Checkpoint[], familyAddress: ['passport', 'customs'] as Checkpoint[] };
    // A desk's first card: nothing shown yet, so the newest fact, as On record, not Old records.
    const first: RunState = { ...base, facts, checkpoint: 1, screen: { kind: 'encounter', id: 'c_medicine' } };
    expect(knownLine(first)).toEqual([{ key: 'known.fact.found', vars: { fact: 'familyAddress' } }]);
    expect(t('known.fact.found', { fact: 'familyAddress' })).toMatch(/^On record: /);
    // The next customs card, after the first named the address: the father's condition noted at passport.
    const next: RunState = {
      ...first, screen: { kind: 'encounter', id: 'c_pen' },
      knownShown: { card: 'c_pen', desk: 'customs', known: ['fatherCondition', 'familyAddress'], named: 'fatherCondition', skip: ['familyAddress'] },
    };
    expect(knownLine(next)).toEqual([{ key: 'known.fact.confirmed', vars: { fact: 'fatherCondition' } }]);
    // A save from before knownShown existed shows the newest fact, as before.
    const { knownShown: _, ...old } = next;
    expect(knownLine(old)).toEqual([{ key: 'known.fact.found', vars: { fact: 'familyAddress' } }]);
  });
});
