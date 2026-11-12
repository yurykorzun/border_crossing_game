// Believable rules: each answer records only what its words say. One case per
// question we fixed, so a failure names the answer that started lying for you.

import { describe, expect, it } from 'vitest';
import { own, t, tn } from '../i18n';
import { CHALLENGES, CHECKS, CONTRADICTIONS, CORE_CARDS, ENCOUNTERS, INCONSISTENCIES, INSPECTIONS, TESTIMONY, catchKind } from './content/encounters';
import { CHARACTERS, CONTACTS, EVIDENCE, LAST_HOURS, MISSION_MIN_TIME, OFFICERS } from './content/world';
import { changeLines, consequence, consequences, SEPARATOR } from './consequence';
import { FOLLOW_UP_SLOT, cardFor, chooseAction, choices, costsOf, deskIntro, endingFor, factIds, factTier, knows, legalActions, newRun, officerFlags, options, step, waitActions } from './engine';
import type { Option, RunSetup } from './engine';
import { hoursOf, unexplained } from './lint';
import { tryStep } from './play';
import { SAMPLE_FILES, defaultFile } from './carry';
import { LEVELS } from './content/levels';
import { FACT_IDS } from './types';
import type { Action, CheckId, ClaimId, ContactId, Effect, FactId, FactMap, RunState } from './types';

/** Facts the interview officer knows: the desk most fixtures here are at. */
const known = (...f: FactId[]): FactMap => Object.fromEntries(f.map((x) => [x, ['interview']]));

const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'hotel', 'employerLetter'], bulletin: 'records', seed: 7 };
const mark: RunSetup = { character: 'mark', loadout: ['motherLetter', 'hotel', 'employerLetter', 'returnTicket'], bulletin: 'records', seed: 7 };
const at = (s: RunState, id: string): RunState => ({
  ...s, reaction: null, checkpoint: 2, slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id],
});

/** The label as the answer button shows it (optionLabel() in src/App.tsx), in the traveler's own words. */
const label = (o: Option, traveler: RunState['character'] = 'lena') =>
  t(own(`enc.i_family.${o.approach.id}.label`, traveler), o.contact ? { contact: o.contact, contactMine: o.contact } : {});
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
    expect(opts.map((o) => label(o))).toEqual([
      '"My cousin Ilya lives here."',
      '"I have no other relatives here."',
      'Ask why they need to know',
    ]);
    // A records day: the old register lists relatives, so the denial shows it puts one on file.
    expect(opts.map((o) => line(s, o))).toEqual(['His name goes on file', 'Reveals another relative', 'Supervisor called: 1 hour']);
    const customs = at(newRun({ ...lena, bulletin: 'customs' }), 'i_family');
    expect(options(customs).map((o) => line(customs, o))).toEqual(['His name goes on file', 'Recorded as a denial', 'Supervisor called: 1 hour']);
  });

  it('the day decides whether a denial holds: the register on a records day, your mother on a hosts day, nothing on a customs day (2op.12)', () => {
    for (const bulletin of ['records', 'accommodation', 'customs'] as const) {
      const r = tryStep(at(newRun({ ...lena, bulletin }), 'i_family'), { type: 'choose', approach: 'deny' });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      // The register is a record; your mother's word is testimony (TESTIMONY).
      expect(knows(r.state, 'relativeContact'), bulletin).toBe(bulletin === 'records');
      expect(knows(r.state, 'relativeNamed'), bulletin).toBe(bulletin === 'accommodation');
    }
  });

  it('names the relation from the character, not a fixed word', () => {
    const s = at(newRun(mark), 'i_family');
    expect(label(options(s)[0], 'mark')).toBe('"My brother Tom lives across the border."');
  });

  // Lena's cousin Ilya lives here, Mark's brother Tom lives across the border,
  // so each traveler is asked about the side their relative is on.
  it.each([
    ['lena', lena, /\bhere\b/, /across the border/],
    ['mark', mark, /across the border/, /\bhere\b/],
  ] as const)('asks %s about the side their relative lives on', (_, setup, says, never) => {
    const s = at(newRun(setup), 'i_family');
    const [name, deny] = options(s);
    const shown = [t(own('enc.i_family.q', s.character)), label(name, s.character), label(deny, s.character)];
    for (const line of shown) {
      expect(line).toMatch(says);
      expect(line).not.toMatch(never);
    }
  });

  it("records Mark's denial in the words he said", () => {
    const s = at(newRun(mark), 'i_family');
    expect(label(options(s)[1], 'mark')).toBe('"No family across the border."');
    const r = tryStep(s, { type: 'choose', approach: 'deny' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.claims).toContain('noOtherFamily');
    expect(t(own('claim.noOtherFamily', 'mark'))).toBe('No family across the border');
    expect(t(own('claim.noOtherFamily', 'lena'))).toBe('No other relatives');
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
    expect(r.events).toContainEqual({ type: 'contactExposed', id: 'cousin', desk: 'interview', shares: 'name' });
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

/**
 * The interview's last core card answered with the employer letter and its
 * follow-up slot spent, so the next card is whatever the desk deals on leaving.
 */
const leavingInterview = (setup: RunSetup, extra: Partial<RunState>): RunState => {
  const s: RunState = { ...at(newRun(setup), 'i_employer'), checkpoint: 2, slot: FOLLOW_UP_SLOT + 1, seen: [...CORE_CARDS.interview], ...extra };
  return step(step(s, { type: 'choose', approach: 'evidence' }), { type: 'ack' });
};

describe('claims: unchallenged, inconsistency, disproof', () => {
  const interview = (extra: Partial<RunState>, setup = lena): RunState => leavingInterview(setup, extra);

  it('an unchallenged lie stands for free: "under the limit" adds a claim and no scrutiny', () => {
    const s = at(newRun(lena), 'c_cash');
    expect(cost(s, 'under')).toEqual({ time: 0, scrutiny: 0, contact: undefined, claims: ['cashUnderLimit'] });
    const r = tryStep({ ...s, checkpoint: 1, slot: 1 }, { type: 'choose', approach: 'under' });
    expect(r.ok && r.state.scrutiny).toBe(0);
  });

  it('an inconsistency (shortTrip + family address) deals the cheaper clarify card, with no free answer', () => {
    for (const fact of ['familyAddress', 'fatherCondition'] as const) {
      const s = interview({ claims: ['shortTrip'], facts: known(fact) });
      expect(s.screen, fact).toEqual({ kind: 'encounter', id: 'i_clarify' });
      // clarify: the new story is checked, 1 hour; evidence; or accept +1 scrutiny
      expect(options(s).map((o) => o.approach.id)).toEqual(['clarify', 'evidence', 'accept']);
      expect(cost(s, 'clarify')).toEqual({ time: 1, scrutiny: 0, contact: undefined, claims: ['familyVisit'] });
      expect(options(s)[1].approach.kind).toBe('evidence');
      expect(cost(s, 'accept')).toEqual({ time: 0, scrutiny: 1, contact: undefined, claims: [] });
    }
  });

  it('a disproof (no other relatives + brother abroad, under the limit + a count) deals the expensive card', () => {
    const cases: Partial<RunState>[] = [
      { claims: ['noOtherFamily'], facts: known('brotherAbroad') },
      { claims: ['cashUnderLimit'], facts: known('cashCount') },
      { claims: ['noOtherFamily', 'cashUnderLimit', 'shortTrip'], facts: known('brotherAbroad', 'cashCount', 'familyAddress') },
    ];
    for (const extra of cases) {
      const s = interview(extra, mark);
      expect(s.screen, JSON.stringify(extra)).toEqual({ kind: 'encounter', id: 'i_contradiction' });
      // 2-3 time or +2 scrutiny. Nobody can vouch away a fact on file.
      expect(cost(s, 'review').time).toBeGreaterThanOrEqual(2);
      expect(cost(s, 'review').time).toBeLessThanOrEqual(3);
      expect(cost(s, 'apologise')).toMatchObject({ time: 0, scrutiny: 2 });
      expect(options(s).filter((o) => o.approach.kind === 'contact')).toEqual([]);
    }
  });

  it('the disproof costs more than the inconsistency on every axis it charges', () => {
    const clarify = interview({ claims: ['shortTrip'], facts: known('familyAddress') });
    const disproof = interview({ claims: ['noOtherFamily'], facts: known('brotherAbroad') }, mark);
    expect(cost(disproof, 'apologise').scrutiny).toBeGreaterThan(cost(clarify, 'accept').scrutiny);
    expect(cost(disproof, 'review').time).toBeGreaterThan(cost(clarify, 'clarify').time);
  });

  it('the bag search counts the cash, which is what disproves "under the limit"', () => {
    const bag = INSPECTIONS.find((i) => i.id === 's_bag')!;
    expect(bag.approaches.find((a) => a.id === 'wait')!.effects).toContainEqual({ fact: 'cashCount' });
  });
});

describe('claim-versus-fact pairs from real procedure', () => {
  const interview = (extra: Partial<RunState>, setup = lena): RunState => leavingInterview(setup, extra);
  const challenge = (s: RunState) => (s.screen.kind === 'encounter' && ['i_clarify', 'i_contradiction'].includes(s.screen.id) ? s.screen.id : undefined);

  // The pairs the balance review asked for (docs/research/2026-11-09-balance-and-levels.md), each with the card that catches it.
  const pairs: [string, ClaimId, FactId, 'i_clarify' | 'i_contradiction', RunSetup][] = [
    ['a tourist with no booking to show', 'shortTrip', 'noBooking', 'i_clarify', lena],
    ['a hotel stay against the family address on file', 'hotelStay', 'familyAddress', 'i_clarify', lena],
    ["a hotel stay against the host's account", 'hotelStay', 'hostStatement', 'i_contradiction', lena],
    ['"I never donated" against the bank notice on the phone', 'neverDonated', 'bankNotice', 'i_contradiction', lena],
    ['no other relatives against Ilya in the contacts', 'noOtherFamily', 'relativeContact', 'i_contradiction', lena],
    ['no other relatives against Tom in the contacts', 'noOtherFamily', 'relativeContact', 'i_contradiction', mark],
  ];

  it.each(pairs)('%s: the claim and the fact deal the card, the claim alone does not', (_, claim, fact, card, setup) => {
    expect(card === 'i_clarify' ? INCONSISTENCIES : CONTRADICTIONS).toContainEqual([claim, fact]);
    expect(challenge(interview({ claims: [claim], facts: known(fact) }, setup))).toBe(card);
    expect(challenge(interview({ claims: [claim] }, setup))).toBeUndefined();
    expect(challenge(interview({ facts: known(fact) }, setup))).toBeUndefined();
  });

  it.each(pairs)('%s: answering the card charges its own fact', (_, claim, fact, card, setup) => {
    const s = interview({ claims: [claim], facts: known(fact) }, setup);
    const o = options(s).find((x) => x.approach.id === (card === 'i_clarify' ? 'accept' : 'apologise'))!;
    expect(o.effects.filter((e) => 'scrutiny' in e)).toEqual([{ scrutiny: card === 'i_clarify' ? 1 : 2, reason: fact, when: expect.anything() }]);
  });

  it('a tourist who has not decided where to stay puts "no booking" on file, a family visitor does not', () => {
    const tourist = tryStep(at({ ...newRun(lena), claims: ['shortTrip'] }, 'p_host'), { type: 'choose', approach: 'undecided' });
    expect(tourist.ok && knows(tourist.state, 'noBooking', 'interview')).toBe(true);
    const visitor = tryStep(at({ ...newRun(lena), claims: ['familyVisit'] }, 'p_host'), { type: 'choose', approach: 'undecided' });
    expect(visitor.ok && factIds(visitor.state)).not.toContain('noBooking');
  });

  it('the phone search finds the bank notice (donation only) and a relative in the contacts, and prints both', () => {
    const unlock = ENCOUNTERS.find((e) => e.id === 'c_phone')!.approaches.find((a) => a.id === 'unlock')!;
    expect(unlock.effects).toContainEqual({ fact: 'bankNotice', when: { background: 'donation' } });
    expect(unlock.effects).toContainEqual({ fact: 'relativeContact' });
    for (const c of CHECKS.phoneSearch.cases)
      expect(c.effects).toContainEqual({ send: 'printout', facts: expect.arrayContaining(['bankNotice', 'relativeContact']) });
  });

  it("the host call puts your mother's account and the other relative on file, and prints them", () => {
    const clear = CHECKS.hostCall.cases.find((c) => c.result === 'clear')!;
    expect(clear.effects).toEqual(expect.arrayContaining([
      { fact: 'hostStatement' },
      { fact: 'relativeNamed' },
      { send: 'printout', facts: expect.arrayContaining(['familyAddress', 'hostStatement', 'relativeNamed']) },
    ]));
  });

  /** Plays from the start: `pick` answers where it has a preference, else the first answer, and waits out every check. */
  function play(setup: RunSetup, pick: Record<string, string>, from: RunState = newRun(setup)): RunState {
    let s = from;
    for (let n = 0; n < 200 && !s.ending; n++) {
      const legal = legalActions(s);
      const id = !s.reaction && (s.screen.kind === 'encounter' || s.screen.kind === 'inspection') ? s.screen.id : '';
      const want = legal.find((a) => a.type === 'choose' && a.approach === pick[id]);
      const wait = legal.find((a) => a.type === 'waitAction' && a.action === 'wait');
      const answer = legal.find((a) => a.type === 'choose' && a.approach !== 'withdraw');
      const a = want ?? wait ?? answer ?? legal[0];
      s = step(s, a);
      if (s.screen.kind === 'encounter' && s.screen.id === 'i_contradiction' && !s.reaction) return s;
    }
    return s;
  }

  it("Lena's denial on i_family is disproved in a real run: the phone search finds Ilya, and the interview deals the contradiction", () => {
    // From the walk to customs with something flagged on the file, the open issue the phone search follows up.
    const setup: RunSetup = { character: 'lena', loadout: ['employerLetter', 'returnTicket', 'deed'], bulletin: 'customs', seed: 2 };
    const atCustoms: RunState = {
      ...newRun(setup), checkpoint: 1, slot: 0, screen: { kind: 'between', next: 1 },
      facts: { noBooking: ['passport', 'customs'] }, flagged: ['noBooking'],
    };
    const s = play(setup, { c_medicine: 'evidence', c_phone: 'unlock', i_family: 'deny' }, atCustoms);
    expect(s.screen).toEqual({ kind: 'encounter', id: 'i_contradiction' });
    expect(s.claims).toContain('noOtherFamily');
    expect(knows(s, 'relativeContact', 'interview')).toBe(true);
    expect(s.seen).toContain('c_phone');
    const o = options(s).find((x) => x.approach.id === 'apologise')!;
    expect(o.effects).toContainEqual(expect.objectContaining({ scrutiny: 2, reason: 'relativeContact' }));
  });
});

describe('documents are blocked only by claims that truly exclude them', () => {
  const lenaHotel: RunSetup = { character: 'lena', loadout: ['hotel', 'employerLetter', 'hospitalNote'], bulletin: 'records', seed: 7 };

  it('the hotel fits with visiting family', () => {
    const s = { ...newRun(lenaHotel), claims: ['familyVisit' as const] };
    expect(cardFor(s, 'accommodation')).toBe('hotel');
    const r = tryStep(at(s, 'p_host'), { type: 'choose', approach: 'evidence' });
    expect(r.ok && r.state.used).toEqual(['hotel']);
  });

  it('the hotel is blocked once you say you stay with family', () => {
    expect(EVIDENCE.hotel.blockedBy).toEqual({ claims: ['stayingWithFamily'] });
    const s = { ...newRun(lenaHotel), claims: ['familyVisit' as const, 'stayingWithFamily' as const] };
    expect(cardFor(s, 'accommodation')).toBeUndefined();
  });

  it('giving your mother\'s address as where you stay records staying with family', () => {
    const r = tryStep(at(newRun(lenaHotel), 'p_host'), { type: 'choose', approach: 'mother' });
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
    const free = at(newRun(lena), 'p_host');
    expect(options(free).map((o) => o.approach.id)).toContain('undecided');
    expect(cost(free, 'undecided').scrutiny).toBe(0);
    const onFile = at({ ...newRun(lena), facts: known('familyAddress') }, 'p_host');
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
      expect(factIds(r.state), card).toContain(fact);
      expect(r.state.scrutiny, card).toBeGreaterThan(newRun(mark).scrutiny);
    }
  });
});

describe('a challenge is dealt even when the last interview answer creates it', () => {
  // Both core cards seen and the follow-up slot spent, so nothing else would follow this card.
  const last = (s: RunState, id: string, extra: Partial<RunState>): RunState =>
    ({ ...at(s, id), seen: [...CORE_CARDS.interview], slot: FOLLOW_UP_SLOT + 1, ...extra });

  it('denying relatives on the final card, with the brother on file, deals the disproof card', () => {
    const s = last(newRun(mark), 'i_family', { facts: known('brotherAbroad') });
    const r = tryStep(s, { type: 'choose', approach: 'deny' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.screen).toEqual({ kind: 'encounter', id: 'i_contradiction' });
  });

  // One row per pair: the claim and the fact are both standing when the final card ends.
  const rows = [...CONTRADICTIONS.map((p) => [...p, 'i_contradiction']), ...INCONSISTENCIES.map((p) => [...p, 'i_clarify'])] as const;
  it.each(rows)('%s + %s at the end of the interview deals %s', (claim, fact, challenge) => {
    const s = last(newRun(lena), 'i_family', { claims: [claim as ClaimId], facts: known(fact as FactId) });
    const r = tryStep(s, { type: 'choose', approach: 'why' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.screen).toEqual({ kind: 'encounter', id: challenge });
  });

  it('with nothing to challenge, the final card still ends the run', () => {
    const r = tryStep(last(newRun(lena), 'i_family', {}), { type: 'choose', approach: 'why' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.screen.kind).not.toBe('encounter');
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
    expect(t('weak.work.reaction')).toMatch(/check it again/);
    const m = tryStep(at(newRun(mark), 'p_employer'), { type: 'choose', approach: 'check' });
    expect(m.ok).toBe(true);
    if (m.ok) expect(m.state.reaction?.map((e) => e.key)).not.toContain('weak.work.reaction');
  });
});

describe('contacts confirm only what they know', () => {
  const allContacts: ContactId[] = ['mother', 'cousin', 'brother'];
  /** The waiting room for `check`, beats done, with `exposed` already named. */
  const waitRoom = (setup: RunSetup, check: CheckId, exposed: ContactId[], bulletin = setup.bulletin): RunState => ({
    ...newRun({ ...setup, bulletin }),
    exposed,
    checkpoint: 1,
    slot: 1,
    screen: { kind: 'wait', check, beats: [0, 1, 2], shown: 3, resolved: { result: 'clear' }, asked: false },
  });
  const assist = (s: RunState) => waitActions(s).find((w) => w.action === 'assist');

  it('the abilities table: mother the address, visit and prescription, Ilya hosting, Tom work', () => {
    expect(CONTACTS.mother.abilities).toEqual(['accommodation', 'purpose', 'medicine']);
    expect(CONTACTS.cousin.abilities).toEqual(['accommodation']);
    expect(CONTACTS.brother.abilities).toEqual(['work']);
  });

  it('a phoneSearch wait room offers no assist action', () => {
    for (const setup of [lena, mark]) {
      const s = waitRoom(setup, 'phoneSearch', []);
      expect(waitActions(s).map((w) => w.action)).toEqual(['wait', 'explain', 'ask']);
      expect(tryStep(s, { type: 'waitAction', action: 'assist' }).ok).toBe(false);
    }
  });

  it('asking shows the hint before the decision: you stay in the room, and only wait or vouch is left', () => {
    const resolved = CHECKS.hostCall.cases[0];
    const s: RunState = { ...waitRoom(lena, 'hostCall', [], 'accommodation'), screen: { kind: 'wait', check: 'hostCall', beats: [0], shown: 1, resolved, asked: false } };
    expect(waitActions(s).map((w) => w.action)).toEqual(['wait', 'ask', 'assist']);
    const r = tryStep(s, { type: 'waitAction', action: 'ask' });
    if (!r.ok) throw new Error('ask is offered');
    expect(r.state.reaction?.map((l) => l.key)).toEqual([`check.hostCall.hint.${resolved.result}`]);
    expect(factIds(r.state)).toContain('urgency');
    expect(r.state.decisions).toBe(s.decisions + 1);
    // Nothing else is chosen until the hint is read, and then the result is still to come.
    expect(legalActions(r.state)).toEqual([{ type: 'ack' }]);
    const read = step(r.state, { type: 'ack' });
    expect(read.screen).toMatchObject({ kind: 'wait', check: 'hostCall', asked: true });
    expect(waitActions(read).map((w) => w.action)).toEqual(['wait', 'assist']);
    const done = step(read, { type: 'waitAction', action: 'wait' });
    expect(done.reaction?.map((l) => l.key)).toContain(`check.hostCall.${resolved.result}`);
  });

  it('the photo card has two open answers for every packing, so the deed is never the only way out', () => {
    const photo = ENCOUNTERS.find((e) => e.id === 'p_photo')!;
    const ids = Object.keys(EVIDENCE) as (keyof typeof EVIDENCE)[];
    // Every packing (a full set of documents), each bulletin, both travelers.
    for (let mask = 0; mask < 1 << ids.length; mask++)
      for (const bulletin of ['customs', 'accommodation', 'records'] as const)
        for (const character of ['lena', 'mark'] as const) {
          const loadout = ids.filter((_, i) => mask & (1 << i));
          if (loadout.length !== CHARACTERS[character].evidenceSlots) continue;
          const s = at(newRun({ character, loadout, bulletin, seed: 1 }), photo.id);
          const open = options(s).filter((o) => !o.blocked).map((o) => o.approach.id);
          expect(open.length, `${character} ${bulletin} ${loadout}`).toBeGreaterThanOrEqual(2);
        }
  });

  it('the records check offers no assist either: nobody vouches away data', () => {
    expect(assist(waitRoom(lena, 'recordsCheck', []))).toBeUndefined();
    expect(assist(waitRoom(mark, 'recordsCheck', []))).toBeUndefined();
  });

  it('hostCall offers assist only when the mother or Ilya is free', () => {
    const rows: [RunSetup, ContactId[], ContactId | undefined][] = [
      [lena, [], 'mother'],
      [lena, ['mother'], 'cousin'],
      [lena, ['cousin'], 'mother'],
      [lena, ['mother', 'cousin'], undefined],
      [mark, [], 'mother'],
      // Tom is free, but he can't confirm where you stay.
      [mark, ['mother'], undefined],
    ];
    for (const [setup, exposed, who] of rows) {
      const a = assist(waitRoom(setup, 'hostCall', exposed));
      expect(a?.contact, `${setup.character} with ${exposed} named`).toBe(who);
      if (a) expect(a.blocked).toBeNull();
      // The option names what they may confirm, after the cost: "May verify your address".
      if (a) expect(a.vouches).toBe('accommodation');
    }
  });

  it('Tom never appears as an option on a medicine card', () => {
    const medicine = [...ENCOUNTERS, ...INSPECTIONS].filter((c) => c.topic === 'medicine');
    expect(medicine.map((c) => c.id).sort()).toEqual(['c_medicine', 'd_out', 'f_lab', 's_bag']);
    for (const card of medicine)
      for (const exposed of [[], ['mother']] as ContactId[][]) {
        const s = { ...at({ ...newRun(mark), exposed }, card.id), screen: { kind: card.id.startsWith('s_') ? 'inspection' : 'encounter', id: card.id } } as RunState;
        expect(options(s).map((o) => o.contact), card.id).not.toContain('brother');
      }
  });

  it('Tom can confirm a job offer: he shows on the work question', () => {
    const s = at({ ...newRun(mark), facts: known('employer') }, 'i_employer');
    const o = options(s).find((x) => x.approach.id === 'brother');
    expect(o?.contact).toBe('brother');
    expect(o?.vouches).toBe('work');
    // Lena has no brother, so the answer is hidden for her.
    expect(options(at(newRun(lena), 'i_employer')).map((x) => x.approach.id)).not.toContain('brother');
  });

  it('every contact answer names only someone who can confirm the card topic', () => {
    for (const card of [...ENCOUNTERS, ...INSPECTIONS])
      for (const a of card.approaches) {
        if (a.kind !== 'contact' || a.namesOnly) continue;
        const able = (a.contacts ?? allContacts).filter((c) => !!card.topic && CONTACTS[c].abilities.includes(card.topic));
        expect(able, `${card.id}.${a.id}`).toEqual(a.contacts ?? allContacts);
      }
  });

  it('the answer says the guaranteed cost, then the possible gain', () => {
    const s = at(newRun(lena), 'p_host');
    const o = options(s).find((x) => x.approach.id === 'mother')!;
    const text = consequence(o, 'enc.p_host.mother', 'cousin').parts.map((p) => (p.n === undefined ? t(p.key, p.vars) : tn(p.key, p.n, p.vars)));
    expect(text.slice(0, 2)).toEqual(['Shares her number', 'May verify your address']);
  });

  it('a contact explains a finding but cannot erase it', () => {
    // With the accommodation bulletin nobody answers the host call; the mother settles it, so no follow-up.
    const s = { ...waitRoom(lena, 'hostCall', [], 'accommodation'), screen: { kind: 'wait', check: 'hostCall', beats: [0], shown: 1, resolved: CHECKS.hostCall.cases[0], asked: false } } as RunState;
    const r = tryStep(s, { type: 'waitAction', action: 'assist' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.exposed).toEqual(['mother']);
    expect(r.state.pending).not.toContain('f_host');
  });

  it('My story lists what each contact can confirm', () => {
    expect(t('contact.mother.can')).toBe('Can confirm: address, why you came, prescription');
    for (const c of allContacts) expect(t(`contact.${c}.can`)).toMatch(/^Can confirm: /);
  });
});

describe('what each official knows: facts travel between desks only through a channel', () => {
  const lenaWith = (bulletin: RunSetup['bulletin']): RunState =>
    newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'employerLetter'], bulletin, seed: 7 });
  const play = (s: RunState, action: Action): RunState => {
    const r = tryStep(s, action);
    if (!r.ok) throw new Error(`${JSON.stringify(action)} rejected: ${r.reason}`);
    return r.state;
  };
  /** Shows the mother's letter at passport control: her address comes out at that desk. */
  const letterAtPassport = (bulletin: RunSetup['bulletin']) =>
    play({ ...lenaWith(bulletin), checkpoint: 0, slot: 1, screen: { kind: 'encounter', id: 'p_purpose' }, seen: ['p_purpose'] }, { type: 'choose', approach: 'evidence' });
  /** Walks to the end of the interview with "shortTrip" said (the employer letter on its last core card), and lets the desk deal what follows. */
  const toInterview = (s: RunState): RunState => {
    const last: RunState = {
      ...s, reaction: null, pending: [], claims: [...s.claims, 'shortTrip'], checkpoint: 2, slot: FOLLOW_UP_SLOT + 1,
      screen: { kind: 'encounter', id: 'i_employer' }, seen: [...s.seen, ...CORE_CARDS.interview],
    };
    return step(step(last, { type: 'choose', approach: 'evidence' }), { type: 'ack' });
  };

  it('a fact is known only at the desk where it came out', () => {
    const s = letterAtPassport('customs');
    expect(s.facts).toEqual({ familyAddress: ['passport'] });
    expect(knows(s, 'familyAddress', 'customs')).toBe(false);
  });

  it('a passport-desk fact does not deal the interview clarify card without a channel', () => {
    const s = toInterview(letterAtPassport('customs'));
    expect(s.claims).toContain('shortTrip');
    expect(s.screen).not.toEqual({ kind: 'encounter', id: 'i_clarify' });
    expect(knows(s, 'familyAddress')).toBe(false);
  });

  it('through the shared records (records bulletin) it reaches every later desk at once and deals the card', () => {
    const s = letterAtPassport('records');
    expect(s.facts).toEqual({ familyAddress: ['passport', 'customs', 'interview'] });
    expect(toInterview(s).screen).toEqual({ kind: 'encounter', id: 'i_clarify' });
  });

  it('through a call to customs and the address check printout it reaches the interview and deals the card', () => {
    // Accommodation bulletin: the passport clerk phones customs about the address.
    let s = letterAtPassport('accommodation');
    expect(s.facts).toEqual({ familyAddress: ['passport', 'customs'] });
    // A call reaches only the next desk, so the interview still knows nothing.
    expect(toInterview(s).screen).not.toEqual({ kind: 'encounter', id: 'i_clarify' });
    // Customs checks the address, and the call note goes with your file.
    s = play({ ...s, reaction: null, checkpoint: 1, slot: 1, screen: { kind: 'encounter', id: 'c_host' }, seen: [...s.seen, 'c_host'] }, { type: 'choose', approach: 'call' });
    while (s.screen.kind === 'wait' && (s.reaction || s.screen.shown < s.screen.beats.length)) s = play(s, { type: s.reaction ? 'ack' : 'beat' });
    s = play(s, { type: 'waitAction', action: 'wait' });
    expect(s.facts.familyAddress).toEqual(['passport', 'customs', 'interview']);
    expect(toInterview(s).screen).toEqual({ kind: 'encounter', id: 'i_clarify' });
  });

  it('a send effect passes on only what this desk knows', () => {
    // The phone report names the brother, but nothing came out at customs, so nothing reaches the interview.
    const wait: RunState = {
      ...newRun(mark), checkpoint: 1, slot: 1, facts: { brotherAbroad: ['passport'] },
      screen: { kind: 'wait', check: 'phoneSearch', beats: [0], shown: 1, resolved: CHECKS.phoneSearch.cases[0], asked: false },
    };
    const s = play(wait, { type: 'waitAction', action: 'wait' });
    expect(s.facts.brotherAbroad).toEqual(['passport']);
  });

  it('the reaction says where a fact was sent', () => {
    const r = tryStep({ ...lenaWith('accommodation'), checkpoint: 0, slot: 1, screen: { kind: 'encounter', id: 'p_purpose' }, seen: ['p_purpose'] }, { type: 'choose', approach: 'evidence' });
    expect(r.ok && r.events).toContainEqual({ type: 'factSent', id: 'familyAddress', desks: ['customs'], via: 'desk' });
    expect(t('change.sent', { fact: 'familyAddress', desk: 'customs' })).toBe('Passed to Customs: Your family address.');
  });
});

describe('every exposure has a consequence (fsx.3)', () => {
  /** Lena names her mother on the tourist card at customs. */
  const motherNamed = (): RunState => {
    const s = { ...at(newRun(lena), 'c_shortTrip'), checkpoint: 1, claims: ['shortTrip'] as ClaimId[] };
    const r = tryStep(s, { type: 'choose', approach: 'mother' });
    expect(r.ok).toBe(true);
    return r.ok ? r.state : s;
  };

  it('an exposed mother costs 1 hour on the next card that asks what she can confirm', () => {
    const named = motherNamed();
    expect(named.exposed).toEqual(['mother']);
    expect(named.calledIn).toEqual(['mother']);
    // The same evasive answer at the interview, with and without her called in.
    // Her call sent her address on, so the interview has it and the evasion is the on-file one.
    const free = at(newRun(lena), 'p_host');
    const after = at(named, 'p_host');
    expect(cost(free, 'undecided').time).toBe(0);
    expect(cost(after, 'undecidedOnFile').time).toBe(1);
    const r = tryStep(after, { type: 'choose', approach: 'undecidedOnFile' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.time).toBe(after.time - 1);
    expect(r.state.calledIn).toEqual([]);
    expect(r.state.reaction?.map((l) => l.key)).toContain('calledIn.reaction');
    expect(t('calledIn.reaction', { contact: 'mother' })).toBe('You named your mother earlier. The officer checks that first.');
    // Once checked, the next card about her costs nothing extra, and she cannot help again.
    const later = at(r.state, 'c_host');
    expect(cost(later, 'evidence').time).toBe(0);
    expect(options(later).find((o) => o.approach.id === 'mother')?.blocked).toBe('noContact');
  });

  it('a card she cannot speak to does not take the hour', () => {
    const s = at(motherNamed(), 'p_photo');
    expect(cost(s, 'evidence').time).toBe(0);
    expect(s.calledIn).toEqual(['mother']);
  });

  it('the protected contact is never called in: the cost is the ending', () => {
    const r = tryStep(at(newRun(lena), 'i_family'), { type: 'choose', approach: 'name' });
    expect(r.ok && r.state.exposed).toEqual(['cousin']);
    expect(r.ok && r.state.calledIn).toEqual([]);
  });

  it('endingFor is unchanged: exposing the mother alone still allows homeInTime', () => {
    const end = (extra: Partial<RunState>) => endingFor({ ...newRun(lena), ...extra });
    expect(end({ exposed: ['mother'] })).toBe('homeInTime');
    expect(end({ exposed: ['mother', 'cousin'] })).toBe('homeAtCost');
    expect(end({ exposed: ['mother'], medicine: false })).toBe('homeAtCost');
    expect(end({ exposed: ['mother'], time: 1 })).toBe('tooLate');
    expect(end({ exposed: ['cousin'], withdrew: true })).toBe('turnedBack');
  });

  it('consequences() lists each exposure and the medicine, worst first, under any ending', () => {
    const base = newRun(lena);
    expect(consequences(base)).toEqual([]);
    // A phone call: minor. Her address on file alone sends nobody, so it stays a call.
    const call = { kind: 'contact', key: 'exposure.mother.call', vars: { contact: 'mother' }, severity: 1, reason: 'exposure.mother.call.reason' };
    expect(consequences({ ...base, exposed: ['mother'] })).toEqual([call]);
    expect(consequences({ ...base, exposed: ['mother'], facts: known('familyAddress') })).toEqual([call]);
    // Worst first, the protected contact ahead of the medicine; what is on file has no line (the records sheet lists it).
    // Her address flagged at customs gives the visit its reason, named from the run: serious.
    const tooLate: RunState = {
      ...base, time: 1, exposed: ['mother', 'cousin'], medicine: false, facts: known('familyAddress', 'employer', 'urgency', 'cashCount'),
      flagged: ['familyAddress'], flaggedAt: { familyAddress: 'customs' },
    };
    expect(endingFor(tooLate)).toBe('tooLate');
    expect(consequences(tooLate)).toEqual([
      { kind: 'contact', key: 'exposure.cousin.protected', vars: { contact: 'cousin' }, severity: 3, reason: 'exposure.cousin.protected.reason' },
      { kind: 'medicine', key: 'ending.line.medicineLost', severity: 3 },
      { kind: 'contact', key: 'exposure.mother.home', vars: { contact: 'mother', desk: 'customs' }, severity: 2, reason: 'exposure.mother.home.reason.familyAddress' },
    ]);
    expect(t('exposure.mother.home.reason.familyAddress', { desk: 'customs' })).toBe('Customs flagged her address, and it is on the report.');
    // Each line is something the player can picture: a heading, then one line.
    expect(t('exposure.mother.call.title', { contact: 'mother' })).toBe('The border calls your mother');
    expect(t('exposure.mother.home.title', { contact: 'mother' })).toBe("Officers go to your mother's address");
    // The visit is the following morning, so it agrees with every epilogue, where she is at the hospital that night.
    // The ending lists every consequence under that time heading (Ending in src/App.tsx), so the line itself does not repeat it.
    expect(t('ending.later.heading')).toBe('The following morning');
    expect(t('exposure.mother.home', { contact: 'mother' })).toMatch(/^Officers ask her to come in\./);
    expect(consequences({ ...base, facts: known('employer') })).toEqual([]);
    // Mark's brother is his protected contact.
    expect(consequences({ ...newRun(mark), exposed: ['brother'] })[0]).toMatchObject({ key: 'exposure.brother.protected', severity: 3 });
  });
});

describe('officers with one stated priority each (fsx.10)', () => {
  /** Mark on the relatives question at `checkpoint` (an index into CHECKPOINTS). Naming his brother brings him out. */
  const relatives = (checkpoint: number, facts: FactMap = {}): RunState => ({ ...at(newRun(mark), 'i_family'), checkpoint, facts });

  it('the same answer costs 0 at the passport desk and +1 scrutiny with a stated reason at the security desk', () => {
    const passport = relatives(0);
    const interview = relatives(2);
    expect(cost(passport, 'name').scrutiny).toBe(0);
    expect(cost(interview, 'name').scrutiny).toBe(1);
    expect(options(interview).find((o) => o.approach.id === 'name')?.effects).toContainEqual({ scrutiny: 1, reason: 'brotherAbroad' });

    const atPassport = tryStep(passport, { type: 'choose', approach: 'name' });
    const atInterview = tryStep(interview, { type: 'choose', approach: 'name' });
    expect(atPassport.ok && atInterview.ok).toBe(true);
    if (!atPassport.ok || !atInterview.ok) return;
    // Both answers put the brother on file; only the security officer cares.
    expect(knows(atPassport.state, 'brotherAbroad', 'passport')).toBe(true);
    expect(knows(atInterview.state, 'brotherAbroad', 'interview')).toBe(true);
    expect(atPassport.state.scrutiny).toBe(passport.scrutiny);
    expect(atInterview.state.scrutiny).toBe(interview.scrutiny + 1);
    expect(atPassport.state.reaction?.map((l) => l.key)).not.toContain('officer.passport.flags');
    // The reason is stated in the reaction.
    expect(atInterview.state.reaction).toContainEqual({ key: 'officer.interview.flags', vars: { fact: 'brotherAbroad' }, kind: 'suspicion' });
    expect(t('officer.interview.flags', { fact: 'brotherAbroad' })).toBe('Your brother abroad: the officer marks it as a security matter.');
  });

  it('a political fact already on file at the interview costs nothing more', () => {
    expect(cost(relatives(2, known('brotherAbroad')), 'name').scrutiny).toBe(0);
  });

  it('an answer that already adds scrutiny for the fact is not counted twice', () => {
    const s = at(newRun(mark), 'p_secondPassport');
    expect(cost(s, 'both').scrutiny).toBe(1);
    expect(options(s).find((o) => o.approach.id === 'both')?.flagged).toBeUndefined();
  });

  it('a non-political answer at the interview costs nothing extra', () => {
    expect(cost(at(newRun(lena), 'i_family'), 'name').scrutiny).toBe(0);
  });

  it('the officer reacts only on their own cards, not in an inspection', () => {
    const s: RunState = { ...relatives(2), screen: { kind: 'inspection', id: 's_connection' } };
    expect(officerFlags(s, [{ fact: 'brotherAbroad' }])).toEqual([]);
  });

  it('each officer has one priority, stated when you reach the desk', () => {
    expect(Object.values(OFFICERS).map((o) => o.priority)).toEqual(['paperwork', 'goods', 'politics']);
    const first = { ...at(newRun(lena), 'p_purpose'), checkpoint: 0 };
    expect(deskIntro(first)).toBe('passport');
    expect(deskIntro({ ...first, slot: 2 })).toBeUndefined();
    expect(deskIntro({ ...first, reaction: [{ key: 'ui.continue' }] })).toBeUndefined();
    expect(deskIntro({ ...at(newRun(lena), 'i_family'), checkpoint: 2 })).toBe('interview');
    expect(t('officer.passport.priority')).toBe('The clerk checks every stamp and date.');
  });
});

describe('inspections change the problem, and doomed runs end quickly', () => {
  /** An inspection at customs, as dealt when scrutiny reaches the max. */
  const inspection = (id: string, extra: Partial<RunState> = {}): RunState => ({
    ...newRun(lena), checkpoint: 1, slot: 1, scrutiny: 3, inspections: 1, seen: [id], screen: { kind: 'inspection', id }, ...extra,
  });
  const play = (s: RunState, approach: string): RunState => {
    const r = tryStep(s, { type: 'choose', approach });
    expect(r.ok, approach).toBe(true);
    // "Show a document" opens the list: show the first packed document in it.
    if (!r.state.documentList) return r.state;
    const first = tryStep(r.state, chooseAction(options(r.state)[0]));
    expect(first.ok, approach).toBe(true);
    return first.state;
  };

  it('has one inspection of each kind that changes the problem', () => {
    const kinds = INSPECTIONS.map((i) => i.kind).filter((k) => k !== 'search').sort();
    expect(kinds).toEqual(['confiscation', 'connection', 'verification']);
  });

  it('confiscation: leaving without the medicine loses it, getting it back costs hours', () => {
    const s = inspection('s_medicine');
    const left = play(s, 'surrender');
    expect(left.medicine).toBe(false);
    expect(left.time).toBe(s.time);
    const waited = play(s, 'wait');
    expect(waited.medicine).toBe(true);
    expect(waited.time).toBe(s.time - 3);
  });

  it('missed connection: the later shuttle moves the deadline, a lift exposes a contact', () => {
    const s = inspection('s_connection');
    const later = play(s, 'later');
    expect(later.time).toBe(s.time);
    expect(later.travel).toBe(3);
    // The same hours left now miss the bus: the deadline moved, not the clock.
    expect(endingFor({ ...later, time: 2 })).toBe('tooLate');
    expect(endingFor({ ...s, time: 2 })).toBe('homeInTime');
    // A paper with where you stay books the transfer; without one, someone drives out.
    const booked = play(s, 'evidence');
    expect(booked.used).toHaveLength(1);
    expect(booked.travel).toBe(2);
    const noPaper = inspection('s_connection', { loadout: ['employerLetter', 'returnTicket', 'hospitalNote'] });
    const drive = play(noPaper, 'drive');
    expect(drive.exposed).toEqual(['mother']);
    expect(drive.travel).toBe(2);
    expect(drive.time).toBe(s.time);
  });

  it('extra verification: spend the document, or name your mother or let her phone the hospital, each for an hour', () => {
    const s = inspection('s_supervisor');
    const shown = play(s, 'evidence');
    expect(shown.used).toEqual(['motherLetter']);
    expect(knows(shown, 'fatherCondition')).toBe(false);
    const accepted = play(s, 'accept');
    expect(accepted.used).toEqual([]);
    expect(knows(accepted, 'fatherCondition')).toBe(true);
    // The phone call is no longer free, even at the last desk.
    expect(accepted.time).toBe(s.time - 1);
    // Without a paper on why you travel, your mother is the other answer.
    const noPaper = inspection('s_supervisor', { loadout: ['hotel', 'employerLetter', 'deed'] });
    const named = play(noPaper, 'contact');
    expect(named.exposed).toEqual(['mother']);
    // Her call is no free exit either (2op.12).
    expect(named.time).toBe(s.time - 1);
  });

  it('shows at most two answers and a way out: the conditions pick which two', () => {
    const ids = (s: RunState) => options(s).map((o) => o.approach.id);
    expect(ids(inspection('s_bag'))).toEqual(['wait', 'contact']);
    expect(ids(inspection('s_bag', { exposed: ['mother'] }))).toEqual(['wait', 'declare']);
    expect(ids(inspection('s_supervisor'))).toEqual(['evidence', 'accept', 'withdraw']);
    expect(ids(inspection('s_supervisor', { loadout: ['hotel', 'employerLetter', 'deed'] }))).toEqual(['contact', 'accept', 'withdraw']);
    expect(ids(inspection('s_connection'))).toEqual(['later', 'evidence']);
    expect(ids(inspection('s_connection', { loadout: ['employerLetter', 'returnTicket', 'hospitalNote'], exposed: ['mother', 'cousin'] })))
      .toEqual(['later', 'transfer']);
  });

  it('every inspection lists two answers that cost different things, and a way out only where it can be asked for', () => {
    for (const i of INSPECTIONS) {
      const answers = i.approaches.filter((a) => a.kind !== 'withdraw');
      expect(answers.length, i.id).toBeGreaterThanOrEqual(2);
    }
    expect(INSPECTIONS.filter((i) => i.approaches.some((a) => a.kind === 'withdraw')).map((i) => i.id)).toEqual(['s_supervisor', 's_medicine']);
  });

  it('with LAST_HOURS left, an inspection offers no wait, only a sacrifice', () => {
    const atLast = (id: string, extra: Partial<RunState> = {}) => inspection(id, { time: LAST_HOURS, ...extra });
    // Every answer, one per packed document behind "Show a document" (choices()).
    const answers = (s: RunState) => choices(s).filter((o) => !o.blocked && o.approach.kind !== 'withdraw');
    for (const id of ['s_bag', 's_medicine', 's_connection', 's_supervisor']) {
      const s = atLast(id);
      expect(answers(s).length, id).toBeGreaterThan(0);
      for (const o of answers(s)) {
        expect(costsOf(s, o), `${id}.${o.approach.id}`).not.toContain('time');
        expect(costsOf(s, o).length, `${id}.${o.approach.id}`).toBeGreaterThan(0);
      }
      // With more hours left the wait comes back.
      const early = inspection(id, { time: LAST_HOURS + 1 });
      expect(new Set(answers(early).map((o) => costsOf(early, o).sort().join('+'))).size, id).toBeGreaterThanOrEqual(2);
    }
    // An inspection is the supervisor's: a call-in hour waits for a later desk card.
    for (const time of [LAST_HOURS, 8]) {
      const called = inspection('s_bag', { time, exposed: ['mother'], calledIn: ['mother'] });
      expect(costsOf(called, options(called).find((o) => o.approach.id === 'declare')!)).toEqual(['disclosure']);
      expect(play(called, 'declare').calledIn).toEqual(['mother']);
    }
  });

  it('under MISSION_MIN_TIME a card says the bus is gone and offers to finish quickly', () => {
    const s = { ...at(newRun(lena), 'p_host'), time: MISSION_MIN_TIME - 1 };
    expect(t('ui.doomed')).toBe('You will not make the bus now.');
    expect(legalActions(s)).toContainEqual({ type: 'finish' });
    const r = tryStep(s, { type: 'finish' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.ending).toBe('tooLate');
    expect(r.state.decisions).toBe(s.decisions);
    // With enough hours left, there is nothing to finish early.
    const fine = { ...s, time: MISSION_MIN_TIME };
    expect(legalActions(fine)).not.toContainEqual({ type: 'finish' });
    expect(tryStep(fine, { type: 'finish' }).ok).toBe(false);
  });

  it('a later shuttle that would miss the bus is not offered: the inspection asks for a sacrifice instead', () => {
    const ids = (s: RunState) => options(s).map((o) => o.approach.id);
    expect(ids(inspection('s_connection', { time: 3 }))).toContain('later');
    expect(ids(inspection('s_connection', { time: LAST_HOURS }))).toEqual(['evidence']);
  });
});

describe('before admission, scrutiny is a risk', () => {
  /** The last answer of the interview, with every dealer draw fixed at `pick`. */
  const lastAnswer = (scrutiny: number, pick: number, extra: Partial<RunState> = {}, setup: RunSetup = lena) => {
    const s: RunState = {
      // Both core cards seen and the follow-up slot spent: i_family is the interview's last card.
      ...newRun(setup), checkpoint: 2, slot: FOLLOW_UP_SLOT + 1, scrutiny, seen: ['p_host', ...CORE_CARDS.interview], decisions: 6,
      screen: { kind: 'encounter', id: 'i_family' }, ...extra,
    };
    const draws: number[] = [];
    const n = step(s, { type: 'choose', approach: 'why' }, (rng, size) => {
      draws.push(size);
      return { index: Math.min(pick, size - 1), rng };
    });
    return { n, draws };
  };

  it('sends you to secondary inspection when scrutiny rose this run', () => {
    for (const scrutiny of [1, 2]) {
      const { n } = lastAnswer(scrutiny, 0);
      expect(n.screen.kind, `scrutiny ${scrutiny}`).toBe('inspection');
      expect(n.inspections).toBe(1);
    }
  });

  it('counts the scrutiny a character starts with (2op.9)', () => {
    const start = CHARACTERS.mark.startScrutiny;
    expect(start).toBeGreaterThan(0);
    expect(lastAnswer(start, 0, {}, mark).n.screen.kind).toBe('inspection');
    expect(lastAnswer(start + 1, 0, {}, mark).n.screen.kind).toBe('inspection');
  });

  it('lets a paper on the bulletin topic, shown on the way, settle her, with no draw (4qd.11)', () => {
    // The records bulletin warns about identity, and the deed shown for who you are covers it.
    const shown: Partial<RunState> = { loadout: ['deed', 'hotel', 'employerLetter'], used: ['deed'], verified: { identity: { desk: 'passport', flags: 0 } } };
    for (const pick of [0, 1, 2]) expect(lastAnswer(1, pick, shown)).toMatchObject({ draws: [], n: { ending: 'homeInTime' } });
    // Held but not shown, it settles nothing: what decides is the file.
    expect(lastAnswer(1, 0, { loadout: ['deed', 'hotel', 'employerLetter'] }).n.screen.kind).toBe('inspection');
    // Shown only for where you stay (4qd.8), the deed leaves who you are open.
    expect(lastAnswer(1, 0, { ...shown, verified: { accommodation: { desk: 'passport', flags: 0 } } }).n.screen.kind).toBe('inspection');
  });

  it('inspects on the bulletin topic when an inspection takes such a paper', () => {
    const day: RunSetup = { ...lena, bulletin: 'accommodation' };
    for (const pick of [0, 1, 2]) {
      const { n, draws } = lastAnswer(1, pick, {}, day);
      expect(n.screen, `pick ${pick}`).toEqual({ kind: 'inspection', id: 's_connection' });
      expect(draws).toEqual([]);
    }
  });

  it('waves a run through that can no longer make the bus', () => {
    expect(lastAnswer(2, 0, { time: 2, travel: 3 })).toMatchObject({ draws: [], n: { ending: 'tooLate' } });
  });

  it('never looks at Scrutiny 0 or after an inspection this run', () => {
    expect(lastAnswer(0, 0)).toMatchObject({ draws: [], n: { ending: 'homeInTime' } });
    expect(lastAnswer(1, 0, { inspections: 1 })).toMatchObject({ draws: [], n: { ending: 'homeInTime' } });
  });

  it('ends the run once the inspection is answered', () => {
    const { n } = lastAnswer(1, 0);
    const answer = options(n).find((o) => !o.blocked && o.approach.kind !== 'withdraw')!;
    const after = step({ ...n, reaction: null }, { type: 'choose', approach: answer.approach.id });
    expect(after.screen.kind).toBe('ending');
  });
});

describe('every time loss names its cause in the reaction (fsx.12)', () => {
  // unexplained() lives in src/game/lint.ts, so the content lint applies the same test.
  const vars = { contact: 'mother', contactMine: 'mother', cardThe: 'motherLetter' };
  const costly = [
    ...ENCOUNTERS.flatMap((c) => c.approaches.map((a) => ({ key: `enc.${c.id}.${a.id}.reaction`, effects: a.effects }))),
    ...INSPECTIONS.flatMap((c) => c.approaches.map((a) => ({ key: `insp.${c.id}.${a.id}.reaction`, effects: a.effects }))),
  ]
    .map(({ key, effects }) => ({ key, ...hoursOf(effects) }))
    .filter((x) => x.most > 0);

  it('finds the time-costing answers', () => {
    expect(costly.length).toBeGreaterThanOrEqual(20);
  });

  it.each(costly)('$key says what its hours are spent on, and leaves the count to the engine', ({ key }) => {
    expect(unexplained(t(key, vars))).toBeNull();
  });

  it('the extra hours added on top say what they are spent on', () => {
    const weak = [...new Set(Object.values(CHARACTERS).flatMap((c) => c.weakTopics))];
    expect(weak.length).toBeGreaterThan(0);
    for (const topic of weak) expect(unexplained(t(`weak.${topic}.reaction`))).toBeNull();
    expect(unexplained(t('calledIn.reaction', vars))).toBeNull();
  });

  it('a reaction that counts the hours or only says it takes a while fails the check', () => {
    expect(unexplained('Hours later, the bag comes back.')).not.toBeNull();
    expect(unexplained('They search everything. Three hours.')).not.toBeNull();
    expect(unexplained('Counting the cash takes an hour.')).not.toBeNull();
    expect(unexplained('Matching the scan takes an hour, two on records days.')).not.toBeNull();
    expect(unexplained('He takes the bag away. That takes a while.')).not.toBeNull();
    expect(unexplained('Waiting.')).not.toBeNull();
    expect(unexplained('He counts your cash twice.')).toBeNull();
  });
});

describe('exposure needs a stated reason, and each reaction says which of three it is (4qd.3)', () => {
  it('every consequence that harms a contact carries a reason key that renders non-empty text', () => {
    // Every person each traveler can name, with and without their home and record on file,
    // flagged or not, at each desk or (an old save) with no desk kept.
    const keys = new Set<string>();
    const flaggable: FactId[] = ['familyAddress', 'brotherAbroad', 'hostStatement', 'relativeNamed'];
    const sets: FactId[][] = [[], ['familyAddress'], ['brotherAbroad'], ['familyAddress', 'brotherAbroad'], ['familyAddress', 'hostStatement'], ['familyAddress', 'relativeNamed']];
    for (const setup of [lena, mark])
      for (const c of CHARACTERS[setup.character].contacts)
        for (const facts of sets)
          for (const flagged of [[], facts])
            for (const desk of [undefined, 'passport', 'customs', 'interview'] as const)
              for (const l of consequences({
                ...newRun(setup), exposed: [c], facts: known(...facts), flagged,
                ...(desk ? { flaggedAt: Object.fromEntries(flagged.map((f) => [f, desk])) } : {}),
              })) {
                if (l.kind !== 'contact') continue;
                keys.add(l.key);
                expect(l.reason, l.key).toMatch(new RegExp(`^${l.key.replace(/\./g, '\\.')}\\.reason`));
                expect(t(l.reason!, l.vars).trim(), l.reason).not.toBe('');
                expect(t(l.reason!, l.vars), l.reason).not.toMatch(/[{}]/);
                // A visit only ever comes with something about them flagged, and the reason names it.
                if (l.key.endsWith('.home')) expect(flaggable.some((f) => flagged.includes(f) && l.reason!.includes(f)), l.reason).toBe(true);
              }
    expect([...keys].sort()).toEqual(['exposure.brother.protected', 'exposure.brother.protected.record', 'exposure.cousin.protected', 'exposure.mother.call', 'exposure.mother.home']);
    // The cousin's reason is the one the player can already read on his contact card.
    expect(t('exposure.cousin.protected.reason')).toBe('Ilya was already questioned about the fundraiser.');
  });

  it("the visit to the mother fires only once the run flags something about her, and the reason names the desk that did", () => {
    // Her address on file, then an evasion at the interview: that answer flags it there.
    const s = at({ ...newRun(lena), exposed: ['mother'], facts: known('familyAddress') }, 'p_host');
    expect(consequences(s).map((l) => l.key)).toEqual(['exposure.mother.call']);
    const r = tryStep(s, { type: 'choose', approach: 'undecidedOnFile' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.flaggedAt).toEqual({ familyAddress: 'interview' });
    const [visit] = consequences(r.state);
    expect(visit).toMatchObject({ key: 'exposure.mother.home', reason: 'exposure.mother.home.reason.familyAddress' });
    expect(t(visit.reason!, visit.vars)).toBe('Security interview flagged her address, and it is on the report.');
  });

  // Every pair each challenge card catches, answered every way it can be.
  const rows = [
    ...CONTRADICTIONS.map(([c, f]) => ['i_contradiction', c, f] as const),
    ...INCONSISTENCIES.map(([c, f]) => ['i_clarify', c, f] as const),
  ];
  it.each(rows)('%s on %s + %s: the reaction is tagged, and only a disproof records the claim as disproved', (card, claim, fact) => {
    const kind = catchKind(card, fact);
    expect(kind).toBe(card === 'i_clarify' ? 'suspicion' : TESTIMONY.includes(fact) ? 'testimony' : 'disproof');
    const s = at({ ...newRun(lena), claims: [claim], facts: known(fact) }, card);
    let answered = 0;
    for (const o of options(s)) {
      const r = tryStep(s, { type: 'choose', approach: o.approach.id, ...(o.card ? { card: o.card } : {}), ...(o.contact ? { contact: o.contact } : {}) } as Action);
      if (!r.ok) continue;
      answered++;
      expect(r.state.reaction?.[0]?.kind, o.approach.id).toBe(kind);
      expect((r.state.disproved ?? []).includes(claim), o.approach.id).toBe(kind === 'disproof');
      expect(r.events.find((x) => x.type === 'claimChallenged'), o.approach.id).toMatchObject({ claim, fact, kind });
      const said = changeLines(r.events, 'cousin').find((l) => l.key.startsWith('change.claim.'));
      expect(said?.key).toBe(`change.claim.${kind}`);
      expect(t(said!.key, said!.vars)).not.toBe('');
    }
    expect(answered).toBeGreaterThan(0);
  });

  it('every other answer that adds scrutiny says which of three it is, and only a disproof records its claim', () => {
    // The answers a reaction is held against outside the challenge cards: each names its kind.
    const held = [...ENCOUNTERS, ...INSPECTIONS]
      .filter((c) => !(CHALLENGES as readonly string[]).includes(c.id))
      .flatMap((c) => c.approaches.filter((a) => a.effects.some((e) => 'scrutiny' in e && e.scrutiny > 0)).map((a) => [c.id, a] as const));
    expect(held.length).toBeGreaterThan(0);
    for (const [card, a] of held) expect(a.reacts, `${card}.${a.id}`).toMatch(/^(suspicion|testimony|disproof)$/);
    // Each one answered on every day, with her address or the donation record on file or neither: tagged exactly when it adds scrutiny.
    // A Departure card (rwf.3) is answered in Departure, from a file that says "a short trip" and from one that
    // says "family", with the entry record on file at every desk as newRun() puts it there.
    const tagged = new Set<string>();
    const departureOnly = (card: string) => !LEVELS.arrival.cards.includes(card);
    const files = [SAMPLE_FILES.lena, defaultFile(1, 'lena')];
    for (const [card, a] of held)
      for (const bulletin of ['records', 'accommodation', 'customs'] as const)
        for (const file of departureOnly(card) ? files : [undefined])
        for (const facts of [known(), known('familyAddress'), known('donationRecord')]) {
          const base = newRun({ ...lena, bulletin, ...(file ? { level: 'departure' as const, file } : {}) });
          const s = at({ ...base, facts: { ...base.facts, ...facts } }, card);
          const o = options(s).find((x) => x.approach.id === a.id);
          if (!o || o.blocked) continue;
          const r = tryStep(s, { type: 'choose', approach: a.id } as Action);
          expect(r.ok, `${card}.${a.id}`).toBe(true);
          if (!r.ok) continue;
          const adds = o.effects.some((e) => 'scrutiny' in e && e.scrutiny > 0);
          expect(r.state.reaction?.[0]?.kind, `${card}.${a.id} ${bulletin}`).toBe(adds ? a.reacts : undefined);
          const claims = o.effects.flatMap((e) => ('claim' in e ? [e.claim] : []));
          for (const c of claims) expect((r.state.disproved ?? []).includes(c), `${card}.${a.id}`).toBe(adds && a.reacts === 'disproof');
          if (adds) tagged.add(`${card}.${a.id}`);
        }
    expect([...tagged].sort()).toEqual(held.map(([c, a]) => `${c}.${a.id}`).sort());
  });

  it('denying the donation the record shows is a disproof, and the player is told so', () => {
    const s = at({ ...newRun(lena), facts: known('donationRecord') }, 'f_donation');
    const r = tryStep(s, { type: 'choose', approach: 'deny' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.reaction?.[0]).toMatchObject({ key: 'enc.f_donation.deny.reaction', kind: 'disproof' });
    expect(r.state.disproved).toEqual(['neverDonated']);
    expect(r.events.find((x) => x.type === 'claimChallenged')).toMatchObject({ claim: 'neverDonated', fact: 'donationRecord', kind: 'disproof' });
    const said = changeLines(r.events, 'cousin').find((l) => l.key.startsWith('change.claim.'));
    expect(t(said!.key, said!.vars)).toBe('Shown untrue: "Never donated".');
    // Explaining it instead keeps the record and makes it a question, not a disproof.
    const e = tryStep(s, { type: 'choose', approach: 'explain' });
    expect(e.ok && e.state.reaction?.[0]?.kind).toBe('suspicion');
    expect(e.ok && e.state.disproved).toBeFalsy();
  });

  it("a check that confirms Lena's foreign employer records that fact, and the officer's reading stays a separate suspicion", () => {
    for (const [card, checkpoint, approach, desk] of [['p_employer', 0, 'check', 'passport'], ['i_employer', 2, 'contract', 'interview']] as const) {
      const s: RunState = { ...at({ ...newRun(lena), claims: ['shortTrip'] }, card), checkpoint };
      const r = tryStep(s, { type: 'choose', approach });
      expect(r.ok, card).toBe(true);
      if (!r.ok) continue;
      // The fact, and only the fact, goes on file, confirmed and never flagged.
      expect(factIds(r.state).filter((f) => !factIds(s).includes(f)), card).toEqual(['employer']);
      expect(factTier(r.state, 'employer'), card).toBe('confirmed');
      expect(r.state.flagged ?? [], card).not.toContain('employer');
      // What the officer reads into it is a line of its own, tagged suspicion.
      expect(r.state.reaction, card).toContainEqual({ key: `reading.employer.${desk}`, kind: 'suspicion' });
      expect(t(`reading.employer.${desk}`)).toMatch(/questions your employer's connection/);
      // "Employer verified" sits apart, under the reaction, as an on-file line.
      const changes = changeLines(r.events, 'cousin').map((l) => l.key);
      expect(changes, card).toContain('change.onFile.confirmed');
      expect(changes, card).not.toContain(`reading.employer.${desk}`);
    }
    // Nothing on file can record political involvement: no fact exists for it.
    expect(FACT_IDS.filter((f) => /politic|involve|loyal/i.test(f))).toEqual([]);
  });
});
