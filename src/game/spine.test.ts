// The stable spine (border_crossing_game-4qd.5): each desk asks its two core
// questions in a fixed order on every run, a follow-up only comes from an issue
// still open on the file, and every desk card says what the officer already knows.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { CORE_CARDS, ENCOUNTER_BY_ID, ENCOUNTERS } from './content/encounters';
import { issueOpen, knownAt, knownLine, newRun, step } from './engine';
import type { RunSetup } from './engine';
import type { RunState } from './types';

const SEEDS = 200;
const DESKS = ['passport', 'customs', 'interview'] as const;

/** Every state a run passes through, the first one included. */
function states(style: (typeof BOT_STYLES)[number], i: number): RunState[] {
  const run = playRun(style, setupFor(i, 'arrival'));
  const out = [newRun(setupFor(i, 'arrival'))];
  for (const a of run.actions) out.push(step(out[out.length - 1], a));
  return out;
}

const deskCards = (s: RunState, desk: string) => s.seen.filter((id) => ENCOUNTER_BY_ID.get(id)?.checkpoint === desk);

describe('each desk asks its two core questions, in order, on every run', () => {
  it(`over ${SEEDS} Arrival seeds per style, every desk asks its core cards in order, and passport asks where you stay`, () => {
    let past = 0;
    for (const style of BOT_STYLES)
      for (let i = 0; i < SEEDS; i++) {
        const s = playRun(style, setupFor(i, 'arrival')).final;
        const where = `${style} seed ${i + 1}`;
        // A challenge card can come first (a claim caught against the file is put at once),
        // and a withdrawal can end a run at any desk, so a desk left early has asked a prefix.
        for (const desk of DESKS) {
          const core = CORE_CARDS[desk];
          const asked = deskCards(s, desk).filter((id) => core.includes(id));
          expect(asked, `${where} ${desk}`).toEqual(core.slice(0, asked.length));
          if (s.checkpoint > DESKS.indexOf(desk)) expect(asked, `${where} ${desk} finished`).toEqual([...core]);
        }
        if (s.checkpoint > 0) past++;
      }
    // Most runs get past passport, so its finished check ran, and the stay question is the clerk's (it was the interview's i_stay).
    expect(past).toBeGreaterThan(BOT_STYLES.length * SEEDS * 0.8);
    expect(CORE_CARDS.passport).toContain('p_host');
    expect(ENCOUNTER_BY_ID.get('p_host')?.checkpoint).toBe('passport');
    expect(ENCOUNTER_BY_ID.has('i_stay')).toBe(false);
  });
});

describe('a follow-up is dealt only while its issue is open on the file', () => {
  it('every related or follow-up card has an issue', () => {
    for (const e of ENCOUNTERS) if (e.kind === 'related' || e.kind === 'followup') expect(e.issue, e.id).toBeDefined();
  });

  it(`over ${SEEDS} Arrival seeds per style, the issue is open on the file the moment its card is dealt`, () => {
    let dealt = 0;
    for (const style of BOT_STYLES)
      for (let i = 0; i < SEEDS; i++)
        for (const s of states(style, i)) {
          if (s.reaction || s.screen.kind !== 'encounter') continue;
          const kind = ENCOUNTER_BY_ID.get(s.screen.id)?.kind;
          if (kind !== 'related' && kind !== 'followup') continue;
          dealt++;
          expect(issueOpen(s, s.screen.id), `${style} seed ${i + 1} ${s.screen.id}`).toBe(true);
        }
    expect(dealt).toBeGreaterThan(0);
  });

  // Passport after both core cards: the stay card comes only while no return date has been shown.
  const leavingPassport = (extra: Partial<RunState>): RunState => {
    const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'returnTicket', 'employerLetter'], bulletin: 'customs', seed: 7 };
    const s: RunState = { ...newRun(lena), screen: { kind: 'encounter', id: 'p_host' }, slot: 2, decisions: 1, seen: [...CORE_CARDS.passport], claims: ['familyVisit'], ...extra };
    return step(step(s, { type: 'choose', approach: 'evidence' }), { type: 'ack' });
  };

  it('the stay card is dealt while how long you stay is open, and not once the return ticket answered it', () => {
    expect(leavingPassport({}).screen).toEqual({ kind: 'encounter', id: 'p_stay' });
    const answered = leavingPassport({ used: ['returnTicket'] });
    expect(issueOpen(answered, 'p_stay')).toBe(false);
    expect(answered.screen).toEqual({ kind: 'between', next: 1 });
  });

  it('an unused paper alone is not an open issue: the stay and photo cards need a claim or fact on file', () => {
    // No reason for the trip on the form: nothing to ask a date out for.
    const records = (extra: Partial<RunState>): RunState => ({ ...newRun({ character: 'lena', loadout: ['motherLetter', 'returnTicket', 'employerLetter'], bulletin: 'records', seed: 7 }), ...extra });
    expect(issueOpen(records({}), 'p_stay')).toBe(false);
    expect(issueOpen(records({ claims: ['shortTrip'] }), 'p_stay')).toBe(true);
    // On a records day the photo card needs an address on file to look up, and the deed closes it.
    expect(issueOpen(records({}), 'p_photo')).toBe(false);
    const withAddress = records({ facts: { familyAddress: ['passport'] } });
    expect(issueOpen(withAddress, 'p_photo')).toBe(true);
    expect(issueOpen({ ...withAddress, used: ['deed'] }, 'p_photo')).toBe(false);
  });
});

describe('every desk card says what the officer already knows', () => {
  it(`over ${SEEDS} Arrival seeds per style, every desk card has one non-empty line built from the file`, () => {
    for (const style of BOT_STYLES)
      for (let i = 0; i < SEEDS; i++)
        for (const s of states(style, i)) {
          if (s.screen.kind !== 'encounter') continue;
          const where = `${style} seed ${i + 1} ${s.screen.id}`;
          const line = knownLine(s);
          expect(line, where).toHaveLength(1);
          const [part] = line;
          expect(t(part.key, part.vars).trim(), where).not.toBe('');
          // A fact named is one this desk knows; with none, the line says the file is empty, not a guess.
          if (part.key.startsWith('known.fact.')) expect(knownAt(s), where).toContain(part.vars?.fact);
          if (part.key === 'known.none') expect(knownAt(s), where).toEqual([]);
        }
  });

  it('the line changes when a fact is confirmed', () => {
    const mark: RunSetup = { character: 'mark', loadout: ['deed', 'returnTicket', 'hotel', 'hospitalNote'], bulletin: 'customs', seed: 3 };
    const before: RunState = { ...newRun(mark), screen: { kind: 'encounter', id: 'p_purpose' }, slot: 1, seen: ['p_purpose'] };
    // The hospital note puts his father's condition on file as confirmed on this crossing.
    const after = step(step(before, { type: 'choose', approach: 'evidence' }), { type: 'ack' });
    expect(after.screen.kind).toBe('encounter');
    const [was] = knownLine(before);
    const [now] = knownLine(after);
    expect(now).toEqual({ key: 'known.fact.confirmed', vars: { fact: 'fatherCondition' } });
    expect(t(now.key, now.vars)).not.toBe(t(was.key, was.vars));
  });
});
