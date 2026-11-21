// Arrival deals by fixed rules (border_crossing_game-azv.2, Yury's call on dap.25): its
// spot-check takes the worst claim on file, and the seed only picks among claims tied on
// that rank. Departure and The funeral keep the random pick.

import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from './carry';
import { CORE_CARDS } from './content/encounters';
import { LEVELS } from './content/levels';
import { SPOT_CHECK_HOURS } from './content/world';
import { newRun, spotCheckOf, spotRank, step } from './engine';
import type { RunSetup } from './engine';
import { randomDealer } from './rng';
import type { ClaimId, RunState } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['deed', 'hotel', 'motherLetter'], bulletin: 'customs', seed: 3 };
const CLAIMS: ClaimId[] = ['familyVisit', 'hotelStay', 'cashUnderLimit'];
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * Leaving customs with three claims written down there: a hotel stay, which your mother's
 * account disproves (a flaw), and two that fit the file. The last card's answer costs
 * nothing, so the step after it is the spot-check.
 */
function leaving(setup: RunSetup, rng: number, core: readonly string[]): RunState {
  return {
    ...newRun(setup),
    rng, checkpoint: 1, slot: 3, claims: CLAIMS,
    facts: { familyAddress: ['customs'], hostStatement: ['customs'] },
    logged: Object.fromEntries(CLAIMS.map((c) => [c, ['customs']])),
    screen: { kind: 'encounter', id: 'c_pen' }, seen: [...core, 'c_pen'],
  } as RunState;
}

const answer = { type: 'choose', approach: 'yes' } as const;
const arrival = (rng: number) => leaving(lena, rng, CORE_CARDS.customs);
const departure = (rng: number) =>
  leaving({ ...lena, level: 'departure', file: SAMPLE_FILES.lena }, rng, LEVELS.departure.core!.customs!);

/** What the spot-check offered the dealer and what it picked: the claims drawn from, and the pick. */
function draw(s: RunState): { size: number; index: number } {
  let seen = { size: 0, index: -1 };
  step(s, answer, (rng, size) => {
    const r = randomDealer(rng, size);
    seen = { size, index: r.index };
    return r;
  });
  return seen;
}

describe('Arrival spot-checks by rule', () => {
  it('has a flaw on file and two claims that fit it', () => {
    const s = arrival(1);
    expect(spotCheckOf(s, 'hotelStay')).toEqual({ result: 'flaw', card: 'i_contradiction' });
    expect(spotCheckOf(s, 'familyVisit')).toEqual({ result: 'clear' });
    expect(spotCheckOf(s, 'cashUnderLimit')).toEqual({ result: 'clear' });
  });

  it.each(SEEDS)('checks the flawed claim with rng %i', (rng) => {
    const n = step(arrival(rng), answer, randomDealer);
    expect(n.reaction).toContainEqual({ key: 'spot.flaw', vars: { claim: 'hotelStay', n: SPOT_CHECK_HOURS } });
    expect(n.screen).toEqual({ kind: 'encounter', id: 'i_contradiction' });
  });

  it('lets the seed pick only among tied claims, which changes only the line', () => {
    // Two clean claims tied, the last answer touching neither: any pick says nothing and plays the same.
    const s = { ...arrival(1), claims: ['familyVisit', 'cashUnderLimit'] as ClaimId[] };
    const sizes: number[] = [];
    const runs = [0, 1].map((index) => step(s, answer, (rng, size) => (sizes.push(size), { index, rng })));
    expect(sizes).toEqual([2, 2]);
    expect(runs[0]).toEqual(runs[1]);
  });

  it('ranks a flaw first, then an explained claim, then an answered one, then a clean pass', () => {
    const order = [
      spotRank({ result: 'flaw', card: 'i_contradiction' }),
      spotRank({ result: 'flaw', card: 'i_clarify' }),
      spotRank({ result: 'explained' }),
      spotRank({ result: 'answered' }),
      spotRank({ result: 'clear' }),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
  });
});

describe('Departure keeps the random spot-check', () => {
  it('has the same flaw on file', () => {
    expect(spotCheckOf(departure(1), 'hotelStay')).toEqual({ result: 'flaw', card: 'i_contradiction' });
  });

  it('checks different claims over 20 rng values', () => {
    // All three claims on file are drawn from, in file order, and the seed picks among them.
    const draws = SEEDS.map((rng) => draw(departure(rng)));
    expect(new Set(draws.map((d) => d.size))).toEqual(new Set([CLAIMS.length]));
    expect(new Set(draws.map((d) => CLAIMS[d.index])).size).toBeGreaterThan(1);
    // And the run itself changes: only some seeds open the challenge.
    const screens = new Set(SEEDS.map((rng) => JSON.stringify(step(departure(rng), answer, randomDealer).screen)));
    expect(screens.size).toBeGreaterThan(1);
  });

  it('while Arrival draws from the flawed claim alone over the same values', () => {
    expect(SEEDS.map((rng) => draw(arrival(rng)))).toEqual(SEEDS.map(() => ({ size: 1, index: 0 })));
  });
});
