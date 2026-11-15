// A short trip is questioned only when the file says otherwise (dap.16).
// People visit family for a few days all the time, so a family address on
// file is no reason to ask. A stay written down in weeks still is.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { CORE_CARDS, INCONSISTENCIES } from './content/encounters';
import { issueOpen, newRun, spotCheckOf, step } from './engine';
import type { RunSetup } from './engine';
import type { Dealer } from './rng';
import { CHECKPOINTS } from './types';
import type { FactId, RunState } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['deed', 'hotel', 'motherLetter'], bulletin: 'customs', seed: 3 };

/** Leaving customs with only "a short trip" written down and `facts` known there. */
function leavingCustoms(facts: FactId[]): RunState {
  return {
    ...newRun(lena),
    checkpoint: CHECKPOINTS.indexOf('customs'), slot: 3, claims: ['shortTrip'],
    facts: Object.fromEntries(facts.map((f) => [f, ['customs']])),
    logged: { shortTrip: ['customs'] },
    screen: { kind: 'encounter', id: 'c_pen' }, seen: [...CORE_CARDS.customs, 'c_pen'],
  };
}

const first: Dealer = (rng) => ({ index: 0, rng });

describe('a short trip and the file', () => {
  it('a family address on file and nothing else is not an inconsistency', () => {
    expect(INCONSISTENCIES).not.toContainEqual(['shortTrip', 'familyAddress']);
    const s = leavingCustoms(['familyAddress']);
    expect(spotCheckOf(s, 'shortTrip')).toEqual({ result: 'clear' });
    const n = step(s, { type: 'choose', approach: 'yes' }, first);
    expect(n.screen).toEqual({ kind: 'between', next: 2 });
    expect(n.time).toBe(s.time);
    expect(n.scrutiny).toBe(s.scrutiny);
  });

  it('a stay written down in weeks still is, and the officer says which', () => {
    expect(INCONSISTENCIES).toContainEqual(['shortTrip', 'sisterSaysWeeks']);
    const s = leavingCustoms(['familyAddress', 'sisterSaysWeeks']);
    expect(spotCheckOf(s, 'shortTrip')).toEqual({ result: 'flaw', card: 'i_clarify' });
    const n = step(s, { type: 'choose', approach: 'yes' }, first);
    expect(n.screen).toEqual({ kind: 'encounter', id: 'i_clarify' });
    expect(t('enc.i_clarify.shortTrip.sisterSaysWeeks.accept.reaction')).toContain('two weeks');
  });

  it('the clarify card opens on a stay in weeks and not on a family address alone', () => {
    const at = (facts: FactId[]) => ({ ...leavingCustoms(facts), checkpoint: CHECKPOINTS.indexOf('interview'), facts: Object.fromEntries(facts.map((f) => [f, ['interview']])) });
    expect(issueOpen(at(['familyAddress']), 'i_clarify')).toBe(false);
    expect(issueOpen(at(['sisterSaysWeeks']), 'i_clarify')).toBe(true);
    // A short trip with no return booking stays a discrepancy too.
    expect(issueOpen(at(['noBooking']), 'i_clarify')).toBe(true);
  });
});
