// "Leave the medicine" at the first customs card (c_medicine, dap.22): offered only
// where the declare wait and the bus compete, and never as a free wrong answer.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { DESTINATION_IDS } from './content/world';
import { costsOf, newRun, options, spareAfter, travelOf } from './engine';
import type { RunSetup } from './engine';
import { tryStep } from './play';
import type { BulletinId, DestinationId, RunState } from './types';

const lena = (bulletin: BulletinId, destination?: DestinationId): RunSetup =>
  ({ character: 'lena', loadout: ['motherLetter', 'hotel', 'employerLetter'], bulletin, seed: 7, ...(destination ? { destination } : {}) });

/** Lena at the cool bag question with `time` hours left. */
const atMedicine = (time: number, bulletin: BulletinId = 'records', destination?: DestinationId): RunState => {
  const s = newRun(lena(bulletin, destination));
  return { ...s, time, reaction: null, checkpoint: 1, slot: 0, screen: { kind: 'encounter', id: 'c_medicine' }, seen: [...s.seen, 'c_medicine'] };
};
const ids = (s: RunState) => options(s).map((o) => o.approach.id);
/** The hours on the declare button. */
const declareHours = (s: RunState) => -options(s).find((o) => o.approach.id === 'declare')!.effects.reduce((n, e) => n + ('time' in e ? e.time : 0), 0);

describe('leave the medicine (c_medicine)', () => {
  it("is offered exactly when hours left minus the declare hours minus the run's own trip is 1 or less", () => {
    // A customs day makes the declare wait 2 hours, and Orvek's trip is 3 hours where the
    // others are 2, so both move the line (azv.3).
    for (const destination of DESTINATION_IDS) {
      for (const bulletin of ['records', 'customs'] as const) {
        for (let time = 0; time <= 8; time++) {
          const s = atMedicine(time, bulletin, destination);
          const tight = time - declareHours(s) - travelOf(s) <= 1;
          expect(ids(s).includes('leave'), `${destination}, ${bulletin}, ${time} h left`).toBe(tight);
          expect(spareAfter(s, 'declare')).toBe(time - declareHours(s) - travelOf(s));
        }
      }
    }
    expect(declareHours(atMedicine(4, 'records'))).toBe(1);
    expect(declareHours(atMedicine(4, 'customs'))).toBe(2);
  });

  it('at 6 hours left it is offered only in Orvek on a customs day', () => {
    // 6 hours, minus the 2-hour declare wait on a customs day, minus the 3-hour trip north, leaves 1.
    expect(travelOf(atMedicine(6, 'customs', 'north'))).toBe(3);
    expect(ids(atMedicine(6, 'customs', 'north'))).toEqual(['evidence', 'declare', 'leave']);
    expect(ids(atMedicine(6, 'records', 'north'))).toEqual(['evidence', 'declare']);
    for (const destination of DESTINATION_IDS.filter((d) => d !== 'north')) {
      for (const bulletin of ['records', 'customs'] as const) expect(ids(atMedicine(6, bulletin, destination))).toEqual(['evidence', 'declare']);
    }
  });

  it('counts a trip a missed connection made longer', () => {
    const s: RunState = { ...atMedicine(6, 'records', 'capital'), travel: 4 };
    expect(spareAfter(s, 'declare')).toBe(1);
    expect(ids(s)).toContain('leave');
  });

  it('at 4 hours left with no hospital note it stands beside the wait', () => {
    expect(ids(atMedicine(4))).toEqual(['evidence', 'declare', 'leave']);
    expect(t('enc.c_medicine.leave.label')).toBe('Leave the medicine');
  });

  it('costs 0 hours and the medicine', () => {
    const s = atMedicine(4);
    const leave = options(s).find((o) => o.approach.id === 'leave')!;
    expect(costsOf(s, leave)).toEqual(['belongings']);
    const r = tryStep(s, { type: 'choose', approach: 'leave' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.time).toBe(4);
    expect(r.state.medicine).toBe(false);
  });

  it('a condition naming an answer the card does not have never holds', () => {
    expect(Number.isNaN(spareAfter(atMedicine(4), 'nope'))).toBe(true);
  });
});
