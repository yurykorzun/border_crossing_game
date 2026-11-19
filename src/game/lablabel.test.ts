// The declare button says when the lab will ask about the prescription
// (border_crossing_game-dap.21). medicineLab clears the medicine, except on a
// customs day with no father's condition on file, where it deals the f_lab
// follow-up. The c_medicine "Declare it and wait" line says which, before it is
// picked, and the run then does what the line said.
import { describe, expect, it } from 'vitest';
import { botAction, botSeed } from './bots';
import { consequence } from './consequence';
import { CHARACTERS, CHARACTER_IDS } from './content/world';
import { deskOf, knows, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import { allSetups } from './walk';
import { t, tn } from '../i18n';
import type { RunState } from './types';

const SEEDS = 50;
const LAB = t('enc.c_medicine.declare.check.lab');
const CLEAR = t('enc.c_medicine.declare.check.clear');

/** The declare button's line on c_medicine, as ConsequenceLine in src/ui/parts.tsx words it. */
function declareLine(s: RunState): string | undefined {
  const o = options(s).find((x) => x.approach.id === 'declare');
  if (!o) return undefined;
  return consequence(o, 'enc.c_medicine.declare', CHARACTERS[s.character].protectedContact, deskOf(s), s)
    .parts.map((p) => (p.n === undefined ? t(p.key, p.vars) : tn(p.key, p.n, p.vars)))
    .join(' · ');
}

interface Seen {
  said: 'lab' | 'clear' | 'none';
  /** At the card: a customs day with no father's condition on file (medicineLab's follow-up case). */
  asks: boolean;
  dealt: boolean;
  result?: string;
}

/**
 * Plays the honest bot to c_medicine, picks Declare there, waits out the lab, and
 * plays on to the end. Undefined when the run never reaches the card.
 */
function declareRun(setup: RunSetup): Seen | undefined {
  let s = newRun(setup);
  let rng = botSeed(setup.seed);
  let seen: Seen | undefined;
  for (let n = 0; n < 300 && !s.ending; n++) {
    if (!seen && !s.reaction && s.screen.kind === 'encounter' && s.screen.id === 'c_medicine' && !s.documentList) {
      const line = declareLine(s);
      if (line === undefined) return undefined;
      const asks = s.bulletin === 'customs' && !knows(s, 'fatherCondition');
      seen = { said: line.includes(LAB) ? 'lab' : line.includes(CLEAR) ? 'clear' : 'none', asks, dealt: false };
      if (seen.said === 'lab') expect(line).not.toContain(CLEAR);
      s = step(s, { type: 'choose', approach: 'declare' });
      continue;
    }
    // In the lab's waiting room, wait it out: the line speaks of the lab, not of a contact vouching.
    if (seen && s.screen.kind === 'wait' && s.screen.check === 'medicineLab' && !s.reaction) {
      if (s.screen.shown >= s.screen.beats.length) {
        seen.result = s.screen.resolved.result;
        s = step(s, { type: 'waitAction', action: 'wait' });
      } else s = step(s, { type: 'beat' });
      continue;
    }
    if (s.screen.kind === 'encounter' && s.screen.id === 'f_lab') { if (seen) seen.dealt = true; }
    const pick = botAction('honest', s, rng);
    if (!pick) break;
    s = step(s, pick.action);
    rng = pick.botRng;
  }
  return seen;
}

describe('the declare button says when the lab will ask about the prescription', () => {
  it(`over seeds 1-${SEEDS} per character, the line names the follow-up exactly when f_lab is dealt`, () => {
    const setups = allSetups('arrival');
    const tally = { lab: 0, clear: 0 };
    for (const character of CHARACTER_IDS) {
      const mine = setups.filter((x) => x.character === character);
      expect(mine.length).toBeGreaterThan(0);
      for (let seed = 1; seed <= SEEDS; seed++) {
        const setup = { ...mine[seed % mine.length], seed };
        const r = declareRun(setup);
        if (!r) continue;
        // On a customs day with nothing on file the lab asks; everywhere else it clears (or the
        // prescription was verified earlier, and no check starts).
        if (r.said === 'lab') {
          expect(r.asks, `${character} seed ${seed}: said lab off a customs day or with the condition on file`).toBe(true);
          expect(r.result).toBe('lab');
          expect(r.dealt, `${character} seed ${seed}: said lab, f_lab not dealt`).toBe(true);
          tally.lab++;
        } else {
          expect(r.dealt, `${character} seed ${seed}: said ${r.said}, f_lab dealt`).toBe(false);
          // "none": the prescription was verified earlier, so no check starts at all.
          if (r.said === 'none') expect(r.result, `${character} seed ${seed}: a check ran with no lab line`).toBeUndefined();
          else expect(r.asks, `${character} seed ${seed}: said clear on a customs day with nothing on file`).toBe(false);
          if (r.said === 'clear') {
            expect(r.result).toBe('clear');
            tally.clear++;
          }
        }
      }
    }
    // Both readings are reached, so the test is not passing on one branch alone.
    expect(tally.lab).toBeGreaterThan(0);
    expect(tally.clear).toBeGreaterThan(0);
  });
});
