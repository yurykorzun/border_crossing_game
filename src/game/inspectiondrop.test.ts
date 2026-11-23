// Scrutiny falls after an inspection, and the reaction says why (border_crossing_game-azv.11).
// A playtest on ff102e8 (Lena, Departure) took the later shuttle at the missed-connection
// inspection, and scrutiny fell from 3/3 to 1/3 under a reaction that only said "Scrutiny 1/3.".
import { afterEach, describe, expect, it } from 'vitest';
import { setStory } from '../i18n';
import { setupFor } from './bots';
import { changeText } from './consequence';
import { newRun, travelOf } from './engine';
import { playStep } from './play';
import { MAX_SCRUTINY, SCRUTINY_AFTER_INSPECTION } from './content/world';
import type { RunState } from './types';

afterEach(() => setStory(undefined));

/** The missed-connection inspection at Scrutiny 3/3 in a Departure run, with time to spare. */
function connection(): RunState {
  setStory('departure');
  const run = newRun(setupFor(0, 'departure'));
  return { ...run, checkpoint: 2, scrutiny: MAX_SCRUTINY, time: travelOf(run) + 6, screen: { kind: 'inspection', id: 's_connection', reason: 'scrutiny' } };
}

describe('scrutiny falling after an inspection', () => {
  it('the reaction to the later shuttle says scrutiny fell because the inspection is done', () => {
    const n = playStep(connection(), { type: 'choose', approach: 'later' });
    expect(n.scrutiny).toBe(SCRUTINY_AFTER_INSPECTION);
    const lines = (n.changes ?? []).map(changeText);
    expect(lines).toContain('Scrutiny down to 1/3, because the inspection is done.');
    expect(lines).not.toContain('Scrutiny 1/3.');
  });

  it('a rise anywhere else keeps the plain line', () => {
    const s = connection();
    const n = playStep({ ...s, scrutiny: 1, screen: { kind: 'encounter', id: 'p_secondPassport' }, facts: { ...s.facts, secondPassport: ['passport'] }, checkpoint: 0 }, { type: 'choose', approach: 'both' });
    expect((n.changes ?? []).map(changeText)).toContain('Scrutiny 2/3.');
  });
});
