// Mark's family answers record what he said (border_crossing_game-dap.11, rule 5).
// His denial is about the border, so only his brother abroad on file disproves it.
// Naming Tom says where Tom lives, not why Mark came back. The employer question
// is asked only of a traveler with an employer abroad, and naming Tom puts the
// same fact on file wherever an answer offers him.

import { describe, expect, it } from 'vitest';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { CONTRADICTIONS, CORE_CARDS, ENCOUNTERS, ENCOUNTER_BY_ID, INCONSISTENCIES, INSPECTIONS } from './content/encounters';
import { CHARACTERS } from './content/world';
import { FOLLOW_UP_SLOT, knows, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import { tryStep } from './play';
import { allSetups } from './walk';
import type { FactId, FactMap, LevelId, RunState } from './types';

const known = (...f: FactId[]): FactMap => Object.fromEntries(f.map((x) => [x, ['interview']]));
const mark: RunSetup = { character: 'mark', loadout: ['motherLetter', 'hotel', 'employerLetter', 'returnTicket'], bulletin: 'records', seed: 7 };
const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'hotel', 'employerLetter'], bulletin: 'records', seed: 7 };
const at = (s: RunState, id: string): RunState => ({
  ...s, reaction: null, checkpoint: 2, slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id],
});
const BULLETINS = ['records', 'accommodation', 'customs'] as const;
/** Every setup of a level once (setupFor() walks them in order, Lena's first). */
const setupsOf = (level: LevelId) => allSetups(level).length;

/** The challenge card dealt on leaving the interview with this file, if any. */
function challengeOnLeaving(extra: Partial<RunState>): string | undefined {
  const s: RunState = { ...at(newRun(mark), 'i_family'), slot: FOLLOW_UP_SLOT + 1, seen: [...CORE_CARDS.interview], ...extra };
  const next = step(step(s, { type: 'choose', approach: 'why' }), { type: 'ack' });
  return next.screen.kind === 'encounter' && ['i_clarify', 'i_contradiction'].includes(next.screen.id) ? next.screen.id : undefined;
}

describe("Mark's denial is challenged only by his brother abroad", () => {
  it('the only pair against "No family across the border" is the brother abroad', () => {
    const facts = [...CONTRADICTIONS, ...INCONSISTENCIES].filter(([c]) => c === 'noFamilyAbroad').map(([, f]) => f);
    expect(facts).toEqual(['brotherAbroad']);
    // Nothing still pairs the old shared denial with the brother: Lena has none abroad.
    expect(CONTRADICTIONS).not.toContainEqual(['noOtherFamily', 'brotherAbroad']);
  });

  it.each(['i_family', 'd_named'])('at %s his denial records noFamilyAbroad, never Lena\'s noOtherFamily', (id) => {
    for (const bulletin of BULLETINS) {
      const r = tryStep(at(newRun({ ...mark, bulletin }), id), { type: 'choose', approach: 'deny' });
      expect(r.ok, `${id} ${bulletin}`).toBe(true);
      if (!r.ok) continue;
      expect(r.state.claims, `${id} ${bulletin}`).toContain('noFamilyAbroad');
      expect(r.state.claims, `${id} ${bulletin}`).not.toContain('noOtherFamily');
      // Lena's denial is still about relatives here.
      const l = tryStep(at(newRun({ ...lena, bulletin }), id), { type: 'choose', approach: 'deny' });
      expect(l.ok && l.state.claims, `${id} ${bulletin} lena`).toEqual(expect.arrayContaining(['noOtherFamily']));
      expect(l.ok && l.state.claims, `${id} ${bulletin} lena`).not.toContain('noFamilyAbroad');
    }
  });

  it.each(['i_family', 'd_named'])('on a hosts day at %s, his mother says Tom lives across the border, which puts Tom on file and catches the denial', (id) => {
    const r = tryStep(at(newRun({ ...mark, bulletin: 'accommodation' }), id), { type: 'choose', approach: 'deny' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.claims).toContain('noFamilyAbroad');
    expect(knows(r.state, 'brotherAbroad')).toBe(true);
    // Lena's mother still names a relative here instead.
    const l = tryStep(at(newRun({ ...lena, bulletin: 'accommodation' }), id), { type: 'choose', approach: 'deny' });
    expect(l.ok && knows(l.state, 'relativeNamed')).toBe(true);
    expect(l.ok && knows(l.state, 'brotherAbroad')).toBe(false);
    // Leaving the interview with that file, the denial is caught.
    expect(challengeOnLeaving({ claims: r.state.claims, facts: r.state.facts, bulletin: 'accommodation' })).toBe('i_contradiction');
  });

  it('a relative in the contacts or named by his mother does not challenge it, the brother abroad does', () => {
    expect(challengeOnLeaving({ claims: ['noFamilyAbroad'], facts: known('relativeContact') })).toBeUndefined();
    expect(challengeOnLeaving({ claims: ['noFamilyAbroad'], facts: known('relativeNamed') })).toBeUndefined();
    expect(challengeOnLeaving({ claims: ['noFamilyAbroad'], facts: known('relativeContact', 'relativeNamed') })).toBeUndefined();
    expect(challengeOnLeaving({ claims: ['noFamilyAbroad'], facts: known('brotherAbroad') })).toBe('i_contradiction');
  });

  it("over every setup per style and level, Mark's denial is only ever caught by the brother abroad", () => {
    let denied = 0;
    for (const level of ['arrival', 'departure'] as LevelId[])
      for (const style of BOT_STYLES)
        for (let i = 0; i < setupsOf(level); i++) {
          const setup = setupFor(i, level);
          if (setup.character !== 'mark') continue;
          const s = playRun(style, setup).final;
          expect(s.claims, `${level} ${style} ${i}`).not.toContain('noOtherFamily');
          if (!s.claims.includes('noFamilyAbroad')) continue;
          denied++;
          const caught = s.seen.includes('i_contradiction') && s.log.some((l) => l.key.startsWith('enc.i_contradiction.') && l.vars?.fact !== undefined && l.vars.fact !== 'brotherAbroad');
          expect(caught, `${level} ${style} ${i}`).toBe(false);
        }
    expect(denied).toBeGreaterThan(0);
  });
});

describe("Mark's name answer records no familyVisit", () => {
  it.each(['i_family', 'd_named'])('at %s, "Tom lives across the border" puts Tom on file and claims nothing', (id) => {
    for (const bulletin of BULLETINS) {
      const s = at(newRun({ ...mark, bulletin }), id);
      expect(options(s).some((o) => o.approach.id === 'name' && o.contact === 'brother'), `${id} ${bulletin}`).toBe(true);
      const r = tryStep(s, { type: 'choose', approach: 'name' });
      expect(r.ok, `${id} ${bulletin}`).toBe(true);
      if (!r.ok) continue;
      expect(r.state.claims, `${id} ${bulletin}`).not.toContain('familyVisit');
      expect(knows(r.state, 'brotherAbroad'), `${id} ${bulletin}`).toBe(true);
    }
  });
});

describe('the employer abroad is asked only of a traveler who has one', () => {
  it('i_employer needs the foreignEmployer background, which Mark does not have', () => {
    expect(ENCOUNTER_BY_ID.get('i_employer')?.when).toEqual({ background: 'foreignEmployer' });
    expect(CHARACTERS.mark.background).not.toContain('foreignEmployer');
    expect(CHARACTERS.lena.background).toContain('foreignEmployer');
  });

  it('over every setup per style and level, i_employer is dealt only to a traveler with an employer abroad', () => {
    const dealt = { lena: 0, mark: 0 };
    let markInterviews = 0;
    for (const level of ['arrival', 'departure'] as LevelId[])
      for (const style of BOT_STYLES)
        for (let i = 0; i < setupsOf(level); i++) {
          const setup = setupFor(i, level);
          const s = playRun(style, setup).final;
          const asked = s.seen.includes('i_employer');
          if (asked) dealt[setup.character]++;
          if (asked) expect(CHARACTERS[setup.character].background, `${level} ${style} ${i}`).toContain('foreignEmployer');
          if (setup.character === 'mark' && s.checkpoint >= 2) markInterviews++;
        }
    expect(dealt.mark).toBe(0);
    expect(dealt.lena).toBeGreaterThan(0);
    // Mark reaches the interview in these runs, so the card was not dealt there.
    expect(markInterviews).toBeGreaterThan(0);
  });
});

describe('naming Tom puts the same fact on file at every desk that offers him', () => {
  const offering = [...ENCOUNTERS, ...INSPECTIONS].flatMap((card) =>
    card.approaches.filter((a) => a.kind === 'contact' && a.contacts?.includes('brother')).map((a) => [card.id, a.id] as const));

  it('the cards that offer Tom are the two relatives questions', () => {
    expect(offering).toEqual([['i_family', 'name'], ['d_named', 'name']]);
  });

  it.each(offering)('at %s, naming Tom (%s) puts his brother abroad on file', (id, approach) => {
    const s = at(newRun(mark), id);
    expect(options(s).some((o) => o.approach.id === approach && o.contact === 'brother'), id).toBe(true);
    const r = tryStep(s, { type: 'choose', approach });
    expect(r.ok, id).toBe(true);
    if (!r.ok) return;
    expect(r.state.exposed, id).toContain('brother');
    expect(knows(r.state, 'brotherAbroad'), id).toBe(true);
  });
});
