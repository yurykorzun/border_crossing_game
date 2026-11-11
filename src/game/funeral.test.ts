// The funeral (border_crossing_game-rwf.4): your friend's sister told the border
// how long you stay before you came. A stay that disagrees with her statement is
// caught like any claim against a fact, with both lines quoted; one that agrees is not.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { botAction, botSeed, heeds, ruleShares } from './bots';
import { caughtLine } from './consequence';
import { STATEMENTS } from './content/encounters';
import { LEVELS } from './content/levels';
import { queueBeats } from './content/queues';
import { caught, knownLine, newRun, setupOf, statementOf, step } from './engine';
import type { RunSetup } from './engine';
import { CHECKPOINTS } from './types';
import type { Action, ClaimId, FactId, RunState } from './types';

const base: Omit<RunSetup, 'seed'> = { level: 'funeral', character: 'lena', loadout: ['hotel', 'hospitalNote', 'returnTicket'], bulletin: 'customs' };
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

/** The answer on p_days that makes `claim`. */
const answerFor = (claim: ClaimId) => (claim === 'stayDays' ? 'days' : 'weeks');

interface Played {
  final: RunState;
  /** Every challenge card that put the stay to you, with the line it showed. */
  caughtStay: { card: string; text: string }[];
}

/** Lena's honest run, saying `claim` on p_days. Honest play tells no lie, so only the stay can be caught. */
function play(statement: FactId, claim: ClaimId, seed: number): Played {
  let s = newRun({ ...base, seed, statement });
  let rng = botSeed(seed);
  const caughtStay: Played['caughtStay'] = [];
  for (let i = 0; i < 200 && !s.ending; i++) {
    const sc = s.screen;
    if (sc.kind === 'encounter' && !s.reaction) {
      const c = caught(s, sc.id);
      if (c && (c.claim === 'stayDays' || c.claim === 'stayWeeks')) {
        const line = caughtLine(s, sc.id)!;
        caughtStay.push({ card: sc.id, text: t(line.key, line.vars) });
      }
    }
    let action: Action;
    if (sc.kind === 'encounter' && sc.id === 'p_days' && !s.reaction) action = { type: 'choose', approach: answerFor(claim) };
    else {
      const pick = botAction('honest', s, rng)!;
      action = pick.action;
      rng = pick.botRng;
    }
    s = step(s, action);
  }
  return { final: s, caughtStay };
}

describe('The funeral: a contact statement on file', () => {
  it('has one statement on file at every desk from the start, from the setup or the seed', () => {
    for (const x of STATEMENTS) {
      const s = newRun({ ...base, seed: 1, statement: x.fact });
      expect(s.facts[x.fact]).toEqual([...CHECKPOINTS]);
      expect(STATEMENTS.filter((y) => s.facts[y.fact])).toHaveLength(1);
      // Play again with the same setup keeps the statement.
      expect(setupOf(s).statement).toBe(x.fact);
      // The sister's message in the first queue says it.
      expect(queueBeats(0, s).filter((b) => b.from === 'sister').map((b) => b.key)).toEqual([`msg.0.sister.${x.fact}`]);
    }
    const drawn = new Set(SEEDS.map((seed) => statementOf({ ...base, seed })));
    expect(drawn).toEqual(new Set(STATEMENTS.map((x) => x.fact)));
    expect(statementOf({ ...base, level: 'arrival', seed: 1 })).toBeUndefined();
    expect(() => newRun({ ...base, seed: 1, statement: 'familyAddress' })).toThrow();
  });

  it('names the statement on the first card and asks how long you stay right after it', () => {
    let s = newRun({ ...base, seed: 1, statement: 'sisterSaysDays' });
    const dealt: string[] = [];
    for (let i = 0; i < 20 && dealt.length < 3; i++) {
      const sc = s.screen;
      if (sc.kind === 'encounter' && !s.reaction) {
        dealt.push(sc.id);
        if (dealt.length === 1) expect(knownLine(s)).toContainEqual({ key: 'known.fact.confirmed', vars: { fact: 'sisterSaysDays' } });
      }
      s = step(s, botAction('honest', s, 0)!.action);
    }
    expect(dealt).toEqual(['p_purpose', 'p_days', 'p_host']);
  });

  for (const x of STATEMENTS) {
    describe(`${x.fact}`, () => {
      it(`catches "${x.disproves}" with both lines quoted`, () => {
        for (const seed of SEEDS) {
          const { final, caughtStay } = play(x.fact, x.disproves, seed);
          expect(final.claims, `seed ${seed}`).toContain(x.disproves);
          expect(caughtStay.length, `seed ${seed}`).toBeGreaterThan(0);
          for (const c of caughtStay) {
            // Your words, in quotes, and her statement.
            expect(c.text).toContain(`"${t(`said.${x.disproves}`)}"`);
            expect(c.text).toContain(t(`fact.${x.fact}`));
          }
        }
      });

      it(`lets "${x.agrees}" stand`, () => {
        for (const seed of SEEDS) {
          const { final, caughtStay } = play(x.fact, x.agrees, seed);
          expect(final.claims, `seed ${seed}`).toContain(x.agrees);
          expect(caughtStay, `seed ${seed}`).toEqual([]);
          expect(final.log.some((l) => l.vars?.claim === x.agrees && l.key === 'spot.flaw'), `seed ${seed}`).toBe(false);
        }
      });
    });
  }

  it("the level's rule: agreeing heeds it, disagreeing does not", () => {
    const rule = LEVELS.funeral.rules[0];
    for (const x of STATEMENTS) {
      let s = newRun({ ...base, seed: 1, statement: x.fact });
      for (let i = 0; i < 20 && !(s.screen.kind === 'encounter' && s.screen.id === 'p_days' && !s.reaction); i++) s = step(s, botAction('honest', s, 0)!.action);
      expect(heeds(rule, s, { type: 'choose', approach: answerFor(x.agrees) })).toBe(true);
      expect(heeds(rule, s, { type: 'choose', approach: answerFor(x.disproves) })).toBe(false);
    }
  });

  it('bots that ignore the statement get home in time less often than the same bots heeding it', () => {
    for (const share of ruleShares(LEVELS.funeral, LEVELS.funeral.rules[0], 2))
      expect(share.ignoring, share.style).toBeLessThan(share.heeding);
  }, 60_000);
});
