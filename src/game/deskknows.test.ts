// Calls and checks match what the desk knows (border_crossing_game-dap.12, rule 2:
// how does the officer know this). Customs dials your mother only with a number for
// her. The father answers phone the hospital only when his condition is not on file yet,
// and the brother card does not put on file what dealt it.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { SAMPLE_FILES } from './carry';
import { ENCOUNTER_BY_ID, HOST_NUMBER } from './content/encounters';
import { answerKey, check, costsOf, knows, newRun, options, step } from './engine';
import type { Option, RunSetup } from './engine';
import { allSetups } from './walk';
import type { Checkpoint, FactMap, LevelId, RunState } from './types';
import { CHECKPOINTS } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['hotel', 'returnTicket', 'deed'], bulletin: 'accommodation', seed: 7 };
const mark: RunSetup = { character: 'mark', loadout: ['motherLetter', 'hotel', 'employerLetter', 'returnTicket'], bulletin: 'records', seed: 7 };

const at = (s: RunState, id: string, desk: Checkpoint): RunState => ({
  ...s, reaction: null, checkpoint: CHECKPOINTS.indexOf(desk), slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id],
});
const choose = (s: RunState, approach: string): RunState => step(s, { type: 'choose', approach });
const ids = (s: RunState): string[] => options(s).map((o) => o.approach.id);
const option = (s: RunState, id: string): Option => options(s).find((o) => o.approach.id === id)!;
const hours = (o: Option): number => o.effects.reduce((n, e) => n + ('time' in e && e.time < 0 ? -e.time : 0), 0);
const reactionKeys = (s: RunState): string[] => (s.reaction ?? []).map((l) => l.key);
const at$ = (desk: Checkpoint, ...facts: (keyof FactMap)[]): FactMap => Object.fromEntries(facts.map((f) => [f, [desk]]));

/** Every walk setup of a level, seed 1, per bot style, with each state the run passed through. */
function* states(levels: LevelId[] = ['arrival', 'departure', 'funeral']): Generator<{ s: RunState; next: RunState; name: string }> {
  for (const level of levels)
    for (const style of BOT_STYLES)
      for (let i = 0; i < allSetups(level).length; i++)
        for (let seed = 1; seed <= 1; seed++) {
          const setup = { ...setupFor(i, level), seed };
          let s = newRun(setup);
          for (const a of playRun(style, setup).actions) {
            const next = step(s, a);
            yield { s, next, name: `${level} ${style} ${i} seed ${seed}` };
            s = next;
          }
        }
}

describe('customs phones your mother only with a number for her', () => {
  it('with a hotel claimed and no address on file, the desk phones the hotel, not your mother', () => {
    const s = at({ ...newRun(lena), claims: ['hotelStay'] }, 'c_host', 'customs');
    expect(check(HOST_NUMBER, s)).toBe(false);
    expect(ids(s)).toContain('hotel');
    expect(ids(s)).not.toContain('call');
    const n = choose(s, 'hotel');
    expect(n.screen.kind).not.toBe('wait');
    expect(n.time).toBe(s.time - 1);
    expect(reactionKeys(n)).toContain('enc.c_host.hotel.reaction');
    expect(t('enc.c_host.hotel.reaction')).not.toMatch(/mother/i);
    expect(n.deskStart?.phoned).toBeFalsy();
  });

  it('with her address on file, or her named as your host, the call goes to her', () => {
    for (const s of [
      at({ ...newRun(lena), claims: ['hotelStay'], facts: at$('customs', 'familyAddress') }, 'c_host', 'customs'),
      at({ ...newRun(lena), claims: ['stayingWithFamily'] }, 'c_host', 'customs'),
    ]) {
      expect(ids(s)).toContain('call');
      expect(ids(s)).not.toContain('hotel');
      expect(choose(s, 'call').screen).toMatchObject({ kind: 'wait', check: 'hostCall' });
    }
  });

  it('over every setup, seed 1 and every bot style, the host call opens only where the desk has a number', () => {
    let hotel = 0;
    let call = 0;
    for (const { s, next, name } of states()) {
      // With the document list open, only the documents show (options()).
      if (s.screen.kind !== 'encounter' || s.screen.id !== 'c_host' || s.reaction || s.documentList) continue;
      const number = check(HOST_NUMBER, s);
      expect(ids(s).includes('call'), name).toBe(number);
      expect(ids(s).includes('hotel'), name).toBe(!number);
      if (next.screen.kind === 'wait' && next.screen.check === 'hostCall') {
        expect(number, name).toBe(true);
        call++;
      }
      if (!number) hotel++;
      // The hotel call never dials her: no wait room opens.
      if (reactionKeys(next).includes('enc.c_host.hotel.reaction')) expect(next.screen.kind, name).not.toBe('wait');
    }
    expect(call).toBeGreaterThan(0);
    expect(hotel).toBeGreaterThan(0);
  });
});

describe('the father answers phone the hospital only when his condition is not on file', () => {
  const cases = [
    { id: 'p_stay', desk: 'passport' as Checkpoint, setup: { ...lena, bulletin: 'records' as const } },
    { id: 'd_stay', desk: 'passport' as Checkpoint, setup: { ...lena, bulletin: 'records' as const, level: 'departure' as LevelId, file: SAMPLE_FILES.lena } },
  ];

  it.each(cases)('$id: a call and its hours without it on file, the file read and no hours with it', ({ id, desk, setup }) => {
    const fresh = at({ ...newRun(setup), claims: ['familyVisit'] }, id, desk);
    expect(knows(fresh, 'fatherCondition')).toBe(false);
    expect(hours(option(fresh, 'father'))).toBeGreaterThan(0);
    const called = choose(fresh, 'father');
    expect(reactionKeys(called)).toContain(`enc.${id}.father.reaction`);
    expect(t(`enc.${id}.father.reaction`)).toMatch(/hospital/);

    const known = at({ ...newRun(setup), claims: ['familyVisit'], facts: at$(desk, 'fatherCondition') }, id, desk);
    expect(hours(option(known, 'father'))).toBe(0);
    expect(answerKey(known, 'father', 'reaction')).toBe(`enc.${id}.father.onFile.reaction`);
    const read = choose(known, 'father');
    expect(read.time).toBe(known.time);
    expect(reactionKeys(read)).toContain(`enc.${id}.father.onFile.reaction`);
    expect(t(`enc.${id}.father.onFile.reaction`)).not.toMatch(/phone|hospital|call/i);
    expect(t(`enc.${id}.father.onFile.reaction`)).toMatch(/already on your file/);
  });

  it('over every setup, seed 1 and every bot style, the father reaction says a call only when hours are spent', () => {
    let both = { call: 0, read: 0 };
    for (const { s, next, name } of states()) {
      if (s.screen.kind !== 'encounter' || !['p_stay', 'd_stay'].includes(s.screen.id) || s.reaction) continue;
      const keys = reactionKeys(next);
      const id = s.screen.id;
      if (keys.includes(`enc.${id}.father.reaction`)) {
        expect(next.time, name).toBeLessThan(s.time);
        both = { ...both, call: both.call + 1 };
      }
      if (keys.includes(`enc.${id}.father.onFile.reaction`)) {
        expect(next.time, name).toBe(s.time);
        both = { ...both, read: both.read + 1 };
      }
    }
    expect(both.call).toBeGreaterThan(0);
    expect(both.read).toBeGreaterThan(0);
  });
});

describe('the brother card does not claim a new fact', () => {
  it('Tom is on file before the card is dealt, so the honest answer discloses nothing new and says so', () => {
    expect(ENCOUNTER_BY_ID.get('i_brother')!.when).toEqual({ facts: ['brotherAbroad'] });
    const s = at({ ...newRun(mark), facts: at$('interview', 'brotherAbroad') }, 'i_brother', 'interview');
    expect(costsOf(s, option(s, 'honest'))).not.toContain('disclosure');
    const n = choose(s, 'honest');
    expect(reactionKeys(n)).toContain('enc.i_brother.honest.reaction');
    expect(t('enc.i_brother.honest.reaction')).not.toMatch(/goes on file|on file now/i);
  });
});
