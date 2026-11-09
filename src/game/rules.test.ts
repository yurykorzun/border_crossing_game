// Believable rules: each answer records only what its words say. One case per
// question we fixed, so a failure names the answer that started lying for you.

import { describe, expect, it } from 'vitest';
import { t, tn } from '../i18n';
import { CHECKS, ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { CHARACTERS, EVIDENCE } from './content/world';
import { consequence, SEPARATOR } from './consequence';
import { cardFor, newRun, options, step } from './engine';
import type { Option, RunSetup } from './engine';
import { tryStep } from './play';
import { FACT_IDS } from './types';
import type { Effect, RunState } from './types';

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

/** Time and scrutiny an answer would cost right now, summed. */
const cost = (s: RunState, approach: string) => {
  const o = options(s).find((x) => x.approach.id === approach)!;
  let time = 0;
  let scrutiny = 0;
  for (const e of o.effects) {
    if ('time' in e) time -= e.time;
    else if ('scrutiny' in e) scrutiny += e.scrutiny;
  }
  return { time, scrutiny, contact: o.contact, claims: o.effects.flatMap((e) => ('claim' in e ? [e.claim] : [])) };
};

describe('claims: unchallenged, inconsistency, disproof', () => {
  const interview = (extra: Partial<RunState>, setup = lena): RunState =>
    step({ ...newRun(setup), checkpoint: 2, slot: 1, screen: { kind: 'between', next: 2 }, ...extra }, { type: 'ack' });

  it('an unchallenged lie stands for free: "under the limit" adds a claim and no scrutiny', () => {
    const s = at(newRun(lena), 'c_cash');
    expect(cost(s, 'under')).toEqual({ time: 0, scrutiny: 0, contact: undefined, claims: ['cashUnderLimit'] });
    const r = tryStep({ ...s, checkpoint: 1, slot: 1 }, { type: 'choose', approach: 'under' });
    expect(r.ok && r.state.scrutiny).toBe(0);
  });

  it('an inconsistency (tourism + family address) deals the cheap clarify card', () => {
    for (const fact of ['familyAddress', 'fatherCondition'] as const) {
      const s = interview({ claims: ['tourism'], facts: [fact] });
      expect(s.screen, fact).toEqual({ kind: 'encounter', id: 'i_clarify' });
      // clarify: +0 and a new claim; evidence; or accept +1 scrutiny
      expect(options(s).map((o) => o.approach.id)).toEqual(['clarify', 'evidence', 'accept']);
      expect(cost(s, 'clarify')).toEqual({ time: 0, scrutiny: 0, contact: undefined, claims: ['familyVisit'] });
      expect(options(s)[1].approach.kind).toBe('evidence');
      expect(cost(s, 'accept')).toEqual({ time: 0, scrutiny: 1, contact: undefined, claims: [] });
    }
  });

  it('a disproof (no other relatives + brother abroad, under the limit + a count) deals the expensive card', () => {
    const cases: Partial<RunState>[] = [
      { claims: ['noOtherFamily'], facts: ['brotherAbroad'] },
      { claims: ['cashUnderLimit'], facts: ['cashCount'] },
      { claims: ['noOtherFamily', 'cashUnderLimit', 'tourism'], facts: ['brotherAbroad', 'cashCount', 'familyAddress'] },
    ];
    for (const extra of cases) {
      const s = interview(extra, mark);
      expect(s.screen, JSON.stringify(extra)).toEqual({ kind: 'encounter', id: 'i_contradiction' });
      // 2-3 time, +2 scrutiny, or a contact
      expect(cost(s, 'review').time).toBeGreaterThanOrEqual(2);
      expect(cost(s, 'review').time).toBeLessThanOrEqual(3);
      expect(cost(s, 'apologise')).toMatchObject({ time: 0, scrutiny: 2 });
      expect(cost(s, 'mother')).toMatchObject({ time: 0, scrutiny: 0, contact: 'mother' });
    }
  });

  it('the disproof costs more than the inconsistency on every axis it charges', () => {
    const clarify = interview({ claims: ['tourism'], facts: ['familyAddress'] });
    const disproof = interview({ claims: ['noOtherFamily'], facts: ['brotherAbroad'] }, mark);
    expect(cost(disproof, 'apologise').scrutiny).toBeGreaterThan(cost(clarify, 'accept').scrutiny);
    expect(cost(disproof, 'review').time).toBeGreaterThan(cost(clarify, 'clarify').time);
  });

  it('the bag search counts the cash, which is what disproves "under the limit"', () => {
    const bag = INSPECTIONS.find((i) => i.id === 's_bag')!;
    expect(bag.approaches.find((a) => a.id === 'wait')!.effects).toContainEqual({ fact: 'cashCount' });
  });
});

describe('documents are blocked only by claims that truly exclude them', () => {
  const lenaHotel: RunSetup = { character: 'lena', loadout: ['hotel', 'employerLetter', 'hospitalNote'], bulletin: 'records', seed: 7 };

  it('the hotel fits with visiting family', () => {
    const s = { ...newRun(lenaHotel), claims: ['familyVisit' as const] };
    expect(cardFor(s, 'accommodation')).toBe('hotel');
    const r = tryStep(at(s, 'i_stay'), { type: 'choose', approach: 'evidence' });
    expect(r.ok && r.state.used).toEqual(['hotel']);
  });

  it('the hotel is blocked once you say you stay with family', () => {
    expect(EVIDENCE.hotel.blockedBy).toEqual({ claims: ['stayingWithFamily'] });
    const s = { ...newRun(lenaHotel), claims: ['familyVisit' as const, 'stayingWithFamily' as const] };
    expect(cardFor(s, 'accommodation')).toBeUndefined();
  });

  it('giving your mother\'s address as where you stay records staying with family', () => {
    const r = tryStep(at(newRun(lenaHotel), 'i_stay'), { type: 'choose', approach: 'mother' });
    expect(r.ok && r.state.claims).toContain('stayingWithFamily');
  });
});

describe('no scrutiny without a reason', () => {
  const effects: { where: string; e: Effect }[] = [
    ...ENCOUNTERS.flatMap((c) => c.approaches.flatMap((a) => a.effects.map((e) => ({ where: `${c.id}.${a.id}`, e })))),
    ...INSPECTIONS.flatMap((c) => c.approaches.flatMap((a) => a.effects.map((e) => ({ where: `${c.id}.${a.id}`, e })))),
    ...Object.values(CHECKS).flatMap((c) => c.cases.flatMap((k) => (k.effects ?? []).map((e) => ({ where: `${c.id}.${k.result}`, e })))),
    ...Object.values(EVIDENCE).flatMap((c) => c.onUse.map((e) => ({ where: c.id, e }))),
  ];

  it('every scrutiny effect carries a reason: a fact id or a check id', () => {
    const scrutiny = effects.filter((x) => 'scrutiny' in x.e);
    expect(scrutiny.length).toBeGreaterThan(0);
    const bad = scrutiny.filter(({ e }) => {
      const reason = (e as { reason?: string }).reason;
      return !reason || !((FACT_IDS as readonly string[]).includes(reason) || reason in CHECKS);
    });
    expect(bad.map((x) => x.where)).toEqual([]);
  });

  it('a lie adds scrutiny only when a fact on file activates it', () => {
    // "I haven't decided yet" is free with nothing on file, and +1 once her address is there.
    const free = at(newRun(lena), 'i_stay');
    expect(options(free).map((o) => o.approach.id)).toContain('undecided');
    expect(cost(free, 'undecided').scrutiny).toBe(0);
    const onFile = at({ ...newRun(lena), facts: ['familyAddress'] }, 'i_stay');
    expect(options(onFile).map((o) => o.approach.id)).not.toContain('undecided');
    expect(cost(onFile, 'undecidedOnFile').scrutiny).toBe(1);
  });

  it('a scrutiny effect whose reason does not hold does not apply', () => {
    // The contradiction card forced onto a state with nothing to contradict costs no scrutiny.
    const s = at(newRun(mark), 'i_contradiction');
    expect(cost(s, 'apologise').scrutiny).toBe(0);
    expect(tryStep(s, { type: 'choose', approach: 'apologise' }).state.scrutiny).toBe(s.scrutiny);
  });

  it('honest answers that add scrutiny put their reason on file first', () => {
    for (const [card, approach, fact] of [
      ['p_secondPassport', 'both', 'secondPassport'],
      ['c_phone', 'refuse', 'phoneRefused'],
      ['i_brother', 'honest', 'brotherAbroad'],
    ] as const) {
      const r = tryStep(at(newRun(mark), card), { type: 'choose', approach });
      expect(r.ok, card).toBe(true);
      if (!r.ok) continue;
      expect(r.state.facts, card).toContain(fact);
      expect(r.state.scrutiny, card).toBeGreaterThan(newRun(mark).scrutiny);
    }
  });
});

describe('detection needs something on file', () => {
  it('the brother question comes only once the brother is on file, not from the background alone', () => {
    const card = ENCOUNTERS.find((e) => e.id === 'i_brother')!;
    expect(card.when).toEqual({ facts: ['brotherAbroad'] });
  });

  it("Lena's extra verification hour says what it is spent on", () => {
    const r = tryStep(at(newRun(lena), 'p_employer'), { type: 'choose', approach: 'check' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.reaction?.map((e) => e.key)).toContain('weak.work.reaction');
    expect(t('weak.work.reaction')).toMatch(/another hour/);
    const m = tryStep(at(newRun(mark), 'p_employer'), { type: 'choose', approach: 'check' });
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.reaction?.map((e) => e.key)).not.toContain('weak.work.reaction');
  });
});
