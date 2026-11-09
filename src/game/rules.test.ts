// Believable rules: each answer records only what its words say. One case per
// question we fixed, so a failure names the answer that started lying for you.

import { describe, expect, it } from 'vitest';
import { own, t, tn } from '../i18n';
import { CHECKS, DISPROOFS, ENCOUNTERS, INCONSISTENCIES, INSPECTIONS } from './content/encounters';
import { CHARACTERS, CONTACTS, EVIDENCE, MISSION_MIN_TIME, OFFICERS } from './content/world';
import { consequence, consequences, SEPARATOR } from './consequence';
import { cardFor, deskIntro, endingFor, factIds, knows, legalActions, newRun, officerFlags, options, step, waitActions } from './engine';
import type { Option, RunSetup } from './engine';
import { hoursOf, unexplained } from './lint';
import { tryStep } from './play';
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
      '"Why do you need to know?"',
    ]);
    expect(opts.map((o) => line(s, o))).toEqual(['His name goes on file', 'Recorded as a denial', 'Costs 1 hour']);
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
      const s = interview({ claims: ['tourism'], facts: known(fact) });
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
      { claims: ['noOtherFamily'], facts: known('brotherAbroad') },
      { claims: ['cashUnderLimit'], facts: known('cashCount') },
      { claims: ['noOtherFamily', 'cashUnderLimit', 'tourism'], facts: known('brotherAbroad', 'cashCount', 'familyAddress') },
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
    const clarify = interview({ claims: ['tourism'], facts: known('familyAddress') });
    const disproof = interview({ claims: ['noOtherFamily'], facts: known('brotherAbroad') }, mark);
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
    const onFile = at({ ...newRun(lena), facts: known('familyAddress') }, 'i_stay');
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
  // Slot 3: the third interview card a quiet run gets, so nothing else would follow it.
  const last = (s: RunState, id: string, extra: Partial<RunState>): RunState => ({ ...at(s, id), slot: 3, ...extra });

  it('denying relatives on the final card, with the brother on file, deals the disproof card', () => {
    const s = last(newRun(mark), 'i_family', { facts: known('brotherAbroad') });
    const r = tryStep(s, { type: 'choose', approach: 'deny' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.screen).toEqual({ kind: 'encounter', id: 'i_contradiction' });
  });

  // One row per pair: the claim and the fact are both standing when the final card ends.
  const rows = [...DISPROOFS.map((p) => [...p, 'i_contradiction']), ...INCONSISTENCIES.map((p) => [...p, 'i_clarify'])] as const;
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
      expect(waitActions(s).map((w) => w.action)).toEqual(['wait', 'ask']);
      expect(tryStep(s, { type: 'waitAction', action: 'assist' }).ok).toBe(false);
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
    expect(medicine.map((c) => c.id).sort()).toEqual(['c_medicine', 'f_lab', 's_bag']);
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
    const s = at(newRun(lena), 'i_stay');
    const o = options(s).find((x) => x.approach.id === 'mother')!;
    const text = consequence(o, 'enc.i_stay.mother', 'cousin').parts.map((p) => (p.n === undefined ? t(p.key, p.vars) : tn(p.key, p.n, p.vars)));
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
    expect(t('contact.mother.can')).toBe('Can confirm: address, visit, prescription');
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
  /** Walks up to the interview with "tourism" said, and lets the director deal its related card. */
  const toInterview = (s: RunState): RunState =>
    step({ ...s, reaction: null, pending: [], claims: [...s.claims, 'tourism'], checkpoint: 2, slot: 1, screen: { kind: 'between', next: 2 } }, { type: 'ack' });

  it('a fact is known only at the desk where it came out', () => {
    const s = letterAtPassport('customs');
    expect(s.facts).toEqual({ familyAddress: ['passport'] });
    expect(knows(s, 'familyAddress', 'customs')).toBe(false);
  });

  it('a passport-desk fact does not deal the interview clarify card without a channel', () => {
    const s = toInterview(letterAtPassport('customs'));
    expect(s.claims).toContain('tourism');
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
    expect(t('change.sent', { fact: 'familyAddress', desk: 'customs' })).toBe('Sent on to Customs: Family address.');
  });
});

describe('every exposure has a consequence (fsx.3)', () => {
  /** Lena names her mother on the tourist card at customs. */
  const motherNamed = (): RunState => {
    const s = { ...at(newRun(lena), 'c_tourist'), checkpoint: 1, claims: ['tourism'] as ClaimId[] };
    const r = tryStep(s, { type: 'choose', approach: 'mother' });
    expect(r.ok).toBe(true);
    return r.ok ? r.state : s;
  };

  it('an exposed mother costs 1 hour on the next card that asks what she can confirm', () => {
    const named = motherNamed();
    expect(named.exposed).toEqual(['mother']);
    expect(named.calledIn).toEqual(['mother']);
    // The same evasive answer at the interview, with and without her called in.
    const free = at(newRun(lena), 'i_stay');
    const after = at(named, 'i_stay');
    expect(cost(free, 'undecided').time).toBe(0);
    expect(cost(after, 'undecided').time).toBe(1);
    const r = tryStep(after, { type: 'choose', approach: 'undecided' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.time).toBe(after.time - 1);
    expect(r.state.calledIn).toEqual([]);
    expect(r.state.reaction?.map((l) => l.key)).toContain('calledIn.reaction');
    expect(t('calledIn.reaction', { contact: 'mother' })).toBe('Earlier you named your mother. The officer checks that statement first.');
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

  it('consequences() scores each exposure, the medicine and the record, under any ending', () => {
    const base = newRun(lena);
    expect(consequences(base)).toEqual([]);
    // A phone call: minor. Her address on file turns it into a visit: serious.
    expect(consequences({ ...base, exposed: ['mother'] })).toEqual([
      { kind: 'contact', key: 'exposure.mother.call', vars: { contact: 'mother' }, severity: 1 },
    ]);
    const tooLate: RunState = { ...base, time: 1, exposed: ['mother', 'cousin'], medicine: false, facts: known('familyAddress', 'employer', 'urgency', 'cashCount') };
    expect(endingFor(tooLate)).toBe('tooLate');
    expect(consequences(tooLate)).toEqual([
      { kind: 'medicine', key: 'ending.line.medicineLost', severity: 3 },
      { kind: 'contact', key: 'exposure.mother.home', vars: { contact: 'mother' }, severity: 2 },
      { kind: 'contact', key: 'exposure.cousin.protected', vars: { contact: 'cousin' }, severity: 3 },
      { kind: 'facts', key: 'ending.line.facts', n: 4, severity: 2 },
    ]);
    // Each line is something the player can picture, and the grades differ.
    expect(t('exposure.mother.call', { contact: 'mother' })).toMatch(/^Your mother gets a call/);
    expect(t('exposure.mother.home', { contact: 'mother' })).toMatch(/^Officers come to your mother's address/);
    expect(tn('ending.line.facts', 1)).toBe('1 thing about you is on file now.');
    expect(consequences({ ...base, facts: known('employer') })).toEqual([{ kind: 'facts', key: 'ending.line.facts', n: 1, severity: 1 }]);
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
    expect(atInterview.state.reaction).toContainEqual({ key: 'officer.interview.flags', vars: { fact: 'brotherAbroad' } });
    expect(t('officer.interview.flags', { fact: 'brotherAbroad' })).toBe('Your brother across the border: the officer marks it as a security matter.');
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
    expect(deskIntro(at(newRun(lena), 'i_stay'))).toBe('interview');
    expect(t('officer.passport.priority')).toBe('The clerk checks every stamp and every date.');
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
    return r.state;
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
    const drive = play(s, 'drive');
    expect(drive.exposed).toEqual(['mother']);
    expect(drive.travel).toBe(2);
    expect(drive.time).toBe(s.time);
  });

  it('extra verification: spend the document that backs the claim, or a fact goes on file', () => {
    const s = inspection('s_supervisor');
    const shown = play(s, 'evidence');
    expect(shown.used).toEqual(['motherLetter']);
    expect(knows(shown, 'fatherCondition')).toBe(false);
    const accepted = play(s, 'accept');
    expect(accepted.used).toEqual([]);
    expect(knows(accepted, 'fatherCondition')).toBe(true);
    expect(accepted.time).toBe(s.time);
  });

  it('under MISSION_MIN_TIME a card says the bus is gone and offers to finish quickly', () => {
    const s = { ...at(newRun(lena), 'i_stay'), time: MISSION_MIN_TIME - 1 };
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

  it('a later shuttle can be what dooms the run', () => {
    const later = play(inspection('s_connection', { time: 2 }), 'later');
    const next: RunState = { ...later, reaction: null, screen: { kind: 'encounter', id: 'c_cash' } };
    expect(legalActions(next)).toContainEqual({ type: 'finish' });
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
