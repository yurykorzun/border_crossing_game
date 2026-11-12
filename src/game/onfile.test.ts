// "On file" in three kinds the card can name (docs/design.md "Truth, claims,
// official knowledge"): found in the old records (the registered address, the
// exit record), confirmed on this crossing, or flagged for attention.

import { describe, expect, it } from 'vitest';
import { t, tn } from '../i18n';
import { en } from '../i18n/en';
import { caughtLine, questionKey } from './consequence';
import { FACT_TIERS } from './content/world';
import { factTier, newRun } from './engine';
import type { RunSetup } from './engine';
import { playStep } from './play';
import type { ChangeLine, ClaimId, FactId, OnFileTier, RunState } from './types';

const TIERS: OnFileTier[] = ['recorded', 'confirmed', 'flagged'];
const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'employerLetter', 'hotel'], bulletin: 'customs', seed: 7 };
const mark: RunSetup = { character: 'mark', loadout: ['deed', 'returnTicket', 'hotel', 'hospitalNote'], bulletin: 'customs', seed: 3 };

const at = (s: RunState, id: string, checkpoint: number, extra: Partial<RunState> = {}): RunState => ({
  ...s, reaction: null, checkpoint, slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id], ...extra,
});
const text = (c: ChangeLine) => (c.n === undefined ? t(c.key, c.vars) : tn(c.key, c.n, c.vars));
const onFileLines = (s: RunState) => (s.changes ?? []).filter((c) => c.key.startsWith('change.onFile.')).map(text);

describe('a fact is on file as recorded, confirmed or flagged, and the card says which', () => {
  it('every fact has a tier, and every tier has its words', () => {
    for (const tier of TIERS) {
      expect(Object.values(FACT_TIERS)).toContain(tier);
      for (const key of [`ui.tier.${tier}`, `change.onFile.${tier}`, `caught.line.${tier}`]) expect(key in en, key).toBe(true);
    }
  });

  it('recorded: the clerk finds your registered address in the old records', () => {
    const n = playStep(at(newRun(lena), 'p_purpose', 0), { type: 'choose', approach: 'evidence' });
    expect(factTier(n, 'familyAddress')).toBe('recorded');
    expect(onFileLines(n)).toEqual(['On record: Your family address.']);
  });

  it('confirmed: the employer letter puts your employer on file on this crossing', () => {
    const n = playStep(at(newRun(lena), 'c_cash', 1), { type: 'choose', approach: 'evidence' });
    expect(factTier(n, 'employer')).toBe('confirmed');
    expect(onFileLines(n)).toEqual(['Noted: Your employer.']);
  });

  it('flagged: a refused search is flagged the moment it is on file', () => {
    const n = playStep(at(newRun(lena), 'c_phone', 1), { type: 'choose', approach: 'refuse' });
    expect(factTier(n, 'phoneRefused')).toBe('flagged');
    expect(onFileLines(n)).toEqual(['Marked: You refused a phone search.']);
  });

  it('a recorded fact becomes flagged once it is the reason scrutiny rises', () => {
    // The exit record shows which passport Mark left on; saying he holds both flags it.
    expect(FACT_TIERS.secondPassport).toBe('recorded');
    const n = playStep(at(newRun(mark), 'p_secondPassport', 0), { type: 'choose', approach: 'both' });
    expect(n.scrutiny).toBe(2);
    expect(factTier(n, 'secondPassport')).toBe('flagged');
    expect(onFileLines(n)).toEqual(['Marked: Your second passport.']);
    // A fact that came out without raising scrutiny keeps its tier.
    const quiet = playStep(at(newRun(lena), 'p_purpose', 0), { type: 'choose', approach: 'evidence' });
    expect(quiet.flagged ?? []).toEqual([]);
  });

  it('the line under a challenge card names the tier of the fact that catches you', () => {
    const facing = (card: string, claim: ClaimId, fact: FactId, extra: Partial<RunState> = {}): string => {
      const s: RunState = {
        ...newRun(lena), checkpoint: 2, slot: 2, claims: [claim], saidAt: { [claim]: 'passport' },
        facts: { [fact]: ['interview'] }, seen: [card], screen: { kind: 'encounter', id: card }, ...extra,
      };
      const line = caughtLine(s, card)!;
      return t(line.key, line.vars);
    };
    expect(facing('i_clarify', 'shortTrip', 'familyAddress'))
      .toBe('You said: "No reason, a short trip" (Passport control). In the old records: Your family address.');
    expect(facing('i_contradiction', 'noOtherFamily', 'relativeContact'))
      .toBe('You said: "I have no other relatives here" (Passport control). Confirmed: Another relative.');
    expect(facing('i_clarify', 'shortTrip', 'familyAddress', { flagged: ['familyAddress'] }))
      .toBe('You said: "No reason, a short trip" (Passport control). Flagged on file: Your family address.');
  });
});

describe('Lena and Mark come home as citizens', () => {
  it('passport control asks about the years away, not the purpose of a visit', () => {
    expect(en['enc.p_purpose.q']).toBe('"You haven\'t been back for six years. Why now?"');
    expect(en['enc.p_purpose.mark.q']).toBe('"Four years away. Why now?"');
  });

  it('the host card names the registered address only when customs has it on file', () => {
    const host = (facts: RunState['facts']) => t(questionKey({ ...at(newRun({ ...lena, bulletin: 'accommodation' }), 'c_host', 1), facts }, 'enc', 'c_host'));
    expect(host({ familyAddress: ['passport', 'customs'] })).toMatch(/registered address/);
    // An accommodation day deals the card with nothing on file, or the address left at passport control.
    for (const facts of [{}, { familyAddress: ['passport'] }] as RunState['facts'][]) {
      expect(host(facts)).not.toMatch(/address/);
      expect(host(facts)).toMatch(/phone every host/);
    }
  });

  it('no line frames them as tourists, visa holders or visitors under entry rules', () => {
    // The game's own title, "Purpose of Visit", is the only visitor word left.
    const lines = Object.entries(en).filter(([k]) => k !== 'ui.title');
    expect(lines.filter(([k, v]) => /touris|\bvisa\b|\bvisitors?\b|entry rules|permitted stay|purpose of (your )?visit/i.test(`${k} ${v}`))).toEqual([]);
  });
});
