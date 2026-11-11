// Verified once, asked once (border_crossing_game-4qd.7): a point resolved at
// one desk stays resolved. A document shown or a contact who confirmed it at a
// desk settles the point for the later desks, which skip the check
// (Approach.ifVerified) and the call-in hour until a new reason appears (a fact
// flagged since).

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { ENCOUNTER_BY_ID } from './content/encounters';
import { answerKey, costsOf, newRun, options, pointVerified, step } from './engine';
import type { Option, RunSetup } from './engine';
import { scriptedDealer } from './play';
import type { Action, Checkpoint, EvidenceId, RunState } from './types';
import { CHECKPOINTS } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['hospitalNote', 'returnTicket', 'deed'], bulletin: 'accommodation', seed: 7 };
const mark: RunSetup = { character: 'mark', loadout: ['motherLetter', 'hotel', 'employerLetter', 'returnTicket'], bulletin: 'records', seed: 7 };

/** The run put on card `id` at `desk`, as if dealt there. */
const at = (s: RunState, id: string, desk: Checkpoint): RunState => ({
  ...s, reaction: null, checkpoint: CHECKPOINTS.indexOf(desk), slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id],
});
const choose = (s: RunState, approach: string): RunState => step(s, { type: 'choose', approach });
const option = (s: RunState, id: string): Option | undefined => options(s).find((o) => o.approach.id === id);
const hours = (o: Option | undefined): number =>
  (o?.effects ?? []).reduce((n, e) => n + ('time' in e && e.time < 0 ? -e.time : 0), 0);

describe('a point verified at passport is not charged again later', () => {
  it('the hospital note at passport verifies the prescription, and customs uses the forwarded details for free', () => {
    const shown = choose(at(newRun(lena), 'p_purpose', 'passport'), 'evidence');
    expect(shown.used).toEqual(['hospitalNote']);
    expect(pointVerified(shown, 'purpose')).toBe(true);
    expect(pointVerified(shown, 'medicine')).toBe(true);
    expect(shown.verified?.medicine?.desk).toBe('passport');
    // The clerk forwards the prescription details to customs.
    expect(shown.facts.fatherCondition).toEqual(['passport', 'customs']);

    // Declaring it costs nothing and opens no lab check: he uses the details on file.
    const customs = at(shown, 'c_medicine', 'customs');
    const declare = option(customs, 'declare')!;
    expect(declare.blocked).toBeNull();
    expect(costsOf(customs, declare)).toEqual([]);
    expect(answerKey(customs, 'declare', 'label')).toBe('enc.c_medicine.declare.verified.label');
    const after = choose(customs, 'declare');
    expect(after.time).toBe(customs.time);
    expect(after.screen.kind).not.toBe('wait');
    expect(after.reaction?.map((l) => l.key)).toContain('enc.c_medicine.declare.verified.reaction');
    expect(t('enc.c_medicine.declare.verified.reaction')).not.toMatch(/\u2014/);

    // Not verified: the same answer takes the medicine to the lab, with its hours.
    const fresh = at(newRun(lena), 'c_medicine', 'customs');
    expect(hours(option(fresh, 'declare'))).toBe(1);
    expect(choose(fresh, 'declare').screen.kind).toBe('wait');
    expect(answerKey(fresh, 'declare', 'label')).toBe('enc.c_medicine.declare.label');
  });

  it('who pays you, verified at passport with the letter, is not checked again at the interview', () => {
    const shown = choose(at(newRun(mark), 'p_employer', 'passport'), 'evidence');
    expect(pointVerified(shown, 'work')).toBe(true);
    const interview = at(shown, 'i_employer', 'interview');
    const contract = option(interview, 'contract')!;
    expect(costsOf(interview, contract)).toEqual([]);
    expect(choose(interview, 'contract').time).toBe(interview.time);
    // Unverified, the contract check costs its hour.
    const fresh = at(newRun(mark), 'i_employer', 'interview');
    expect(hours(option(fresh, 'contract'))).toBe(1);
    // Lena's weakness on work is in checking it, so a verified entry takes no extra hour either.
    const lenaLetter: RunSetup = { ...lena, loadout: ['hospitalNote', 'employerLetter', 'deed'] };
    const hers = at(choose(at(newRun(lenaLetter), 'p_employer', 'passport'), 'evidence'), 'i_employer', 'interview');
    expect(hours(option(hers, 'contract'))).toBe(0);
    expect(choose(hers, 'contract').reaction?.map((l) => l.key)).not.toContain('weak.work.reaction');
  });

  it('a new reason since (a fact flagged after the point was verified) opens the check again', () => {
    const shown = choose(at(newRun(lena), 'p_purpose', 'passport'), 'evidence');
    const flagged: RunState = { ...shown, flagged: [...(shown.flagged ?? []), 'cashCount'] };
    expect(pointVerified(flagged, 'medicine')).toBe(false);
    const customs = at(flagged, 'c_medicine', 'customs');
    expect(hours(option(customs, 'declare'))).toBe(1);
    expect(choose(customs, 'declare').screen.kind).toBe('wait');
  });

  it('a point a supervisor settles in an inspection stays the inspection\'s', () => {
    const s: RunState = { ...newRun(lena), reaction: null, checkpoint: 0, slot: 1, screen: { kind: 'inspection', id: 's_supervisor' } };
    const after = choose(s, 'evidence');
    expect(after.used).toEqual(['hospitalNote']);
    expect(after.verified?.purpose).toBeUndefined();
  });
});

/**
 * Plays from the start to the first card at the interview: `plan` answers the
 * cards it names, any other card gets its first answer that spends no document
 * and names nobody, and the dealer always deals its first card.
 */
function toInterview(plan: Record<string, string>): { s: RunState; answered: Record<string, string> } {
  const dealer = scriptedDealer([]);
  let s = newRun(lena);
  const answered: Record<string, string> = {};
  for (let i = 0; i < 200; i++) {
    if (!s.reaction && s.screen.kind === 'encounter' && s.checkpoint === 2) return { s, answered };
    let a: Action;
    if (s.reaction) a = { type: 'ack' };
    else if (s.screen.kind === 'between') a = { type: 'ack' };
    else if (s.screen.kind === 'wait') a = s.screen.shown < s.screen.beats.length ? { type: 'beat' } : { type: 'waitAction', action: 'wait' };
    else if (s.screen.kind === 'encounter' || s.screen.kind === 'inspection') {
      const id = s.screen.id;
      const pick = plan[id] ?? options(s).find((o) => !o.blocked && !o.card && !o.contact && o.approach.kind !== 'withdraw')?.approach.id;
      if (!pick) throw new Error(`no answer on ${id}`);
      answered[id] = pick;
      a = { type: 'choose', approach: pick };
    } else throw new Error(`stuck on ${s.screen.kind}`);
    s = step(s, a, dealer);
  }
  throw new Error('never reached the interview');
}

/** Which document was shown at which desk, from the answers' log lines. */
const documentsShown = (s: RunState): string[] =>
  s.log.filter((l) => l.vars?.card).map((l) => `${l.vars!.card as EvidenceId}@${ENCOUNTER_BY_ID.get(l.key.split('.')[1])?.checkpoint}`);
const file = (s: RunState) => JSON.stringify({ facts: s.facts, claims: [...s.claims].sort() });

describe('the three routes through the hospital note meet at the interview differently', () => {
  // Note at passport: customs uses the forwarded details.
  // Every route answers where you stay with the deed and gives no date out.
  const same = { p_host: 'evidence', p_stay: 'unsure' };
  const note = toInterview({ ...same, p_purpose: 'evidence', c_medicine: 'declare' });
  // A verbal answer at passport costs an hour and keeps the note for customs.
  const verbal = toInterview({ ...same, p_purpose: 'family', c_medicine: 'evidence' });
  // Claiming tourism saves the hour, but the medicine asks you to explain the mismatch.
  const tourism = toInterview({ ...same, p_purpose: 'shortTrip', c_medicine: 'declare', c_shortTrip: 'admit' });

  it('each route took its own answers', () => {
    expect(note.answered.c_medicine).toBe('declare');
    expect(verbal.answered.c_medicine).toBe('evidence');
    expect(tourism.answered.c_shortTrip).toBe('admit');
    expect(note.answered.c_shortTrip).toBeUndefined();
    expect(verbal.answered.c_shortTrip).toBeUndefined();
  });

  it('they reach the interview with different hours, documents and file', () => {
    const routes = [note.s, verbal.s, tourism.s];
    for (const s of routes) expect(s.screen.kind === 'encounter' && s.checkpoint).toBe(2);
    expect(new Set(routes.map((s) => s.time)).size).toBe(3);
    expect(new Set(routes.map((s) => documentsShown(s).join())).size).toBe(3);
    expect(new Set(routes.map(file)).size).toBe(3);
    // The note route is the quickest and the tourism route the slowest.
    expect(note.s.time).toBeGreaterThan(verbal.s.time);
    expect(verbal.s.time).toBeGreaterThan(tourism.s.time);
    expect(documentsShown(note.s)).toEqual(['hospitalNote@passport', 'deed@passport']);
    expect(documentsShown(verbal.s)).toEqual(['deed@passport', 'hospitalNote@customs']);
    // The tourist keeps the note: the medicine went to the lab instead.
    expect(documentsShown(tourism.s)).toEqual(['deed@passport']);
    expect(tourism.s.claims).toContain('shortTrip');
    expect(note.s.facts.fatherCondition).toContain('passport');
    expect(verbal.s.facts.fatherCondition).not.toContain('passport');
  });
});

describe('a contact who confirmed a point is not charged again for it', () => {
  // On a records day nothing orders the host phoned, so her word at passport settles the address.
  const lenaRecords: RunSetup = { ...lena, bulletin: 'records' };

  it('your mother confirms the address at passport, and the host card at customs adds no hour', () => {
    const named = choose(at(newRun(lenaRecords), 'p_host', 'passport'), 'mother');
    expect(named.exposed).toEqual(['mother']);
    expect(named.calledIn).toEqual(['mother']);
    expect(pointVerified(named, 'accommodation')).toBe(true);

    const customs = at(named, 'c_host', 'customs');
    // Her statement about where you stay was already checked: no call-in hour on any answer.
    expect(hours(option(customs, 'evidence'))).toBe(0);
    // Waiting for the call uses the address on file instead: no hour, no call.
    expect(hours(option(customs, 'call'))).toBe(0);
    expect(answerKey(customs, 'call', 'label')).toBe('enc.c_host.call.verified.label');
    const waited = choose(customs, 'call');
    expect(waited.time).toBe(customs.time);
    expect(waited.screen.kind).not.toBe('wait');
    const after = choose(customs, 'evidence');
    expect(after.time).toBe(customs.time);
    expect(after.reaction?.map((l) => l.key)).not.toContain('calledIn.reaction');
    // She stays called in for a card about something else she can confirm.
    expect(after.calledIn).toEqual(['mother']);

    // Without the point verified, the same card charges her hour.
    const unverified = at({ ...named, verified: {} }, 'c_host', 'customs');
    expect(hours(option(unverified, 'evidence'))).toBe(1);
    expect(hours(option(unverified, 'call'))).toBe(2);
  });

  it('a card about something else she can confirm still takes the hour', () => {
    const named = choose(at(newRun(lenaRecords), 'p_host', 'passport'), 'mother');
    const medicine = at(named, 'c_medicine', 'customs');
    expect(hours(option(medicine, 'evidence'))).toBe(1);
  });

  it('on the day every host is phoned, naming her at passport is not yet a confirmation', () => {
    const named = choose(at(newRun(lena), 'p_host', 'passport'), 'mother');
    expect(named.exposed).toEqual(['mother']);
    expect(pointVerified(named, 'accommodation')).toBe(false);
    // The call at customs is the check, with her hour.
    const customs = at(named, 'c_host', 'customs');
    expect(hours(option(customs, 'call'))).toBe(2);
    expect(choose(customs, 'call').screen.kind).toBe('wait');
  });
});
