// Believable rules: each answer records only what its words say. One case per
// question we fixed, so a failure names the answer that started lying for you.

import { describe, expect, it } from 'vitest';
import { t, tn } from '../i18n';
import { ENCOUNTERS } from './content/encounters';
import { CHARACTERS } from './content/world';
import { consequence, SEPARATOR } from './consequence';
import { newRun, options } from './engine';
import type { Option, RunSetup } from './engine';
import { tryStep } from './play';
import type { RunState } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'hotel', 'employerLetter'], bulletin: 'records', seed: 7 };
const mark: RunSetup = { character: 'mark', loadout: ['motherLetter', 'hotel', 'employerLetter', 'returnTicket'], bulletin: 'records', seed: 7 };
const at = (s: RunState, id: string): RunState => ({
  ...s, reaction: null, checkpoint: 2, slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id],
});

/** The label as the answer button shows it (optionLabel() in src/App.tsx). */
const label = (o: Option) =>
  t(`enc.i_family.${o.approach.id}.label`, o.contact ? { contact: o.contact, contactMine: o.contact } : {});
/** The line under the answer, as the player reads it. */
const line = (s: RunState, o: Option) =>
  consequence(o, `enc.i_family.${o.approach.id}`, CHARACTERS[s.character].protectedContact)
    .parts.map((p) => (p.n === undefined ? t(p.key, p.vars) : tn(p.key, p.n, p.vars)))
    .join(SEPARATOR);

describe('relatives question (i_family)', () => {
  const card = ENCOUNTERS.find((e) => e.id === 'i_family')!;

  it('asks plainly and has exactly three answers: name, deny, ask why', () => {
    expect(t('enc.i_family.q')).toBe('"Do you have any other relatives here?"');
    expect(card.approaches.map((a) => a.id)).toEqual(['name', 'deny', 'why']);
  });

  it("reads word for word for Lena, each with its own line", () => {
    const s = at(newRun(lena), 'i_family');
    const opts = options(s);
    expect(opts.map(label)).toEqual([
      '"My cousin Ilya lives here."',
      '"I have no other relatives here."',
      '"Why do you need to know?"',
    ]);
    expect(opts.map((o) => line(s, o))).toEqual(['His name goes on file', 'Recorded as a denial', 'Costs 1 hour']);
  });

  it('names the relation from the character, not a fixed word', () => {
    const s = at(newRun(mark), 'i_family');
    expect(label(options(s)[0])).toBe('"My brother Tom lives here."');
  });

  it('only "I have no other relatives here." records noOtherFamily', () => {
    const recorders = card.approaches.filter((a) => a.effects.some((e) => 'claim' in e && e.claim === 'noOtherFamily'));
    expect(recorders.map((a) => a.id)).toEqual(['deny']);
    for (const approach of ['name', 'deny', 'why']) {
      const r = tryStep(at(newRun(lena), 'i_family'), { type: 'choose', approach });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      // My story's "No other relatives" row comes from this claim, so it shows only after the denial.
      expect(r.state.claims.includes('noOtherFamily'), approach).toBe(approach === 'deny');
    }
  });

  it('naming the contact records familyVisit and puts the contact on file', () => {
    const r = tryStep(at(newRun(lena), 'i_family'), { type: 'choose', approach: 'name' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.claims).toContain('familyVisit');
    expect(r.state.exposed).toEqual(['cousin']);
    expect(r.events).toContainEqual({ type: 'contactExposed', id: 'cousin' });
  });

  it('asking why costs an hour and records nothing', () => {
    const s = at(newRun(lena), 'i_family');
    const r = tryStep(s, { type: 'choose', approach: 'why' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.time).toBe(s.time - 1);
    expect(r.state.claims).toEqual([]);
    expect(r.state.exposed).toEqual([]);
  });
});
