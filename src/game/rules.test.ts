// Believable rules: each answer records only what its words say. One case per
// question we fixed, so a failure names the answer that started lying for you.

import { describe, expect, it } from 'vitest';
import { t, tn } from '../i18n';
import { CHECKS, DISPROOFS, ENCOUNTERS, INCONSISTENCIES, INSPECTIONS } from './content/encounters';
import { CHARACTERS, CONTACTS, EVIDENCE } from './content/world';
import { consequence, SEPARATOR } from './consequence';
import { cardFor, newRun, options, step, waitActions } from './engine';
import type { Option, RunSetup } from './engine';
import { tryStep } from './play';
import { FACT_IDS } from './types';
import type { CheckId, ClaimId, ContactId, Effect, FactId, RunState } from './types';

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
      // 2-3 time or +2 scrutiny. Nobody can vouch away a fact on file.
      expect(cost(s, 'review').time).toBeGreaterThanOrEqual(2);
      expect(cost(s, 'review').time).toBeLessThanOrEqual(3);
      expect(cost(s, 'apologise')).toMatchObject({ time: 0, scrutiny: 2 });
      expect(options(s).filter((o) => o.approach.kind === 'contact')).toEqual([]);
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

describe('a challenge is dealt even when the last interview answer creates it', () => {
  // Slot 3: the third interview card a quiet run gets, so nothing else would follow it.
  const last = (s: RunState, id: string, extra: Partial<RunState>): RunState => ({ ...at(s, id), slot: 3, ...extra });

  it('denying relatives on the final card, with the brother on file, deals the disproof card', () => {
    const s = last(newRun(mark), 'i_family', { facts: ['brotherAbroad'] });
    const r = tryStep(s, { type: 'choose', approach: 'deny' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.screen).toEqual({ kind: 'encounter', id: 'i_contradiction' });
  });

  // One row per pair: the claim and the fact are both standing when the final card ends.
  const rows = [...DISPROOFS.map((p) => [...p, 'i_contradiction']), ...INCONSISTENCIES.map((p) => [...p, 'i_clarify'])] as const;
  it.each(rows)('%s + %s at the end of the interview deals %s', (claim, fact, challenge) => {
    const s = last(newRun(lena), 'i_family', { claims: [claim as ClaimId], facts: [fact as FactId] });
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
    expect(t('weak.work.reaction')).toMatch(/another hour/);
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
    const s = at({ ...newRun(mark), facts: ['employer'] }, 'i_employer');
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
    expect(text.slice(0, 2)).toEqual(['Puts your mother on file', 'May confirm the address']);
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
