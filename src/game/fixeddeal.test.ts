// Arrival deals by fixed rules (border_crossing_game-azv.2, Yury's call on dap.25): its
// spot-check takes the worst claim on file, and the seed only picks among claims tied on
// that rank. Departure and The funeral keep the random pick.

import { describe, expect, it } from 'vitest';
import { SAMPLE_FILES } from './carry';
import { CORE_CARDS } from './content/encounters';
import { LEVELS } from './content/levels';
import { SPOT_CHECK_HOURS } from './content/world';
import { caught, newRun, spotCheckOf, spotRank, step } from './engine';
import type { RunSetup } from './engine';
import { randomDealer } from './rng';
import type { ClaimId, RunState, SpotFound } from './types';

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

  it('does not bill an explained claim again at a later desk while another claim is on file', () => {
    // Leaving the interview with a short trip and nowhere booked, explained by the family visit.
    const claims: ClaimId[] = ['familyVisit', 'shortTrip', 'cashUnderLimit'];
    const at = (spotClaims?: SpotFound[]): RunState => ({
      ...newRun(lena), checkpoint: 2, slot: 3, claims, spotChecked: ['passport', 'customs'], spotClaims,
      facts: { noBooking: ['customs', 'interview'] },
      logged: Object.fromEntries(claims.map((c) => [c, ['customs']])),
      screen: { kind: 'encounter', id: 'i_water' }, seen: [...CORE_CARDS.interview, 'i_water'],
    }) as RunState;
    const drink = { type: 'choose', approach: 'drink' } as const;
    expect(spotCheckOf(at(), 'shortTrip')).toEqual({ result: 'explained' });
    // Not checked before: it is the worst claim, so it is checked and billed.
    expect(step(at(), drink, randomDealer).time).toBe(at().time - SPOT_CHECK_HOURS);
    // Checked at customs already: a claim not checked yet goes first, for every rng.
    for (const rng of SEEDS) {
      const s = { ...at([{ claim: 'shortTrip', found: 'explained' }]), rng };
      const n = step(s, drink, randomDealer);
      expect(n.time).toBe(s.time);
      // The clean pass it took instead is not kept, because checking it again costs nothing.
      expect(n.spotClaims).toEqual([{ claim: 'shortTrip', found: 'explained' }]);
    }
  });

  it('checks a claim explained at an earlier desk again once a record contradicts it', () => {
    // The hotel stay was explained at passport control; now your mother's account at customs disproves it.
    const s = { ...arrival(1), spotClaims: [{ claim: 'hotelStay', found: 'explained' }] } as RunState;
    for (const rng of SEEDS) {
      const n = step({ ...s, rng }, answer, randomDealer);
      expect(n.reaction).toContainEqual({ key: 'spot.flaw', vars: { claim: 'hotelStay', n: SPOT_CHECK_HOURS } });
      expect(n.spotClaims).toEqual([{ claim: 'hotelStay', found: 'explained' }, { claim: 'hotelStay', found: 'i_contradiction' }]);
    }
  });

  it('names the claim the challenge card asks about when two flaws tie', () => {
    // A hotel stay against your mother's account and cash against the count: both open i_contradiction.
    const s = { ...arrival(1), claims: ['hotelStay', 'cashUnderLimit'] as ClaimId[], facts: { hostStatement: ['customs'], cashCount: ['customs'] } } as RunState;
    for (const rng of SEEDS) {
      const n = step({ ...s, rng }, answer, randomDealer);
      expect(n.screen).toEqual({ kind: 'encounter', id: 'i_contradiction' });
      expect(n.reaction).toContainEqual({ key: 'spot.flaw', vars: { claim: caught(n, 'i_contradiction')?.claim, n: SPOT_CHECK_HOURS } });
    }
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

  it('charges what the picked claim finds: a clean pass nothing, an explained claim the check hours', () => {
    // A family visit that fits, and a short trip with nowhere booked that the visit explains.
    const s = { ...departure(1), claims: ['familyVisit', 'shortTrip'] as ClaimId[], facts: { noBooking: ['customs'] }, logged: { familyVisit: ['customs'], shortTrip: ['customs'] } } as RunState;
    const pick = (index: number) => step(s, answer, (rng) => ({ index, rng }));
    expect(pick(0).time).toBe(s.time);
    expect(pick(1).time).toBe(s.time - SPOT_CHECK_HOURS);
    // The random levels keep no record of the claims checked.
    expect(pick(1).spotClaims).toBeUndefined();
  });

  it('while Arrival draws from the flawed claim alone over the same values', () => {
    expect(SEEDS.map((rng) => draw(arrival(rng)))).toEqual(SEEDS.map(() => ({ size: 1, index: 0 })));
  });
});
