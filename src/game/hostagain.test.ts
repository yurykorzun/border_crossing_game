// The second host call closes the question like the first (border_crossing_game-azv.1).
// On a hosts day the first call goes unanswered and f_host asks again. When she picks
// up, her account goes on file the same way it does when the first call reaches her
// (hostCall clear). The hotel booking shown after that is not read as a new hotel stay,
// because her account already says you stay with her (EVIDENCE.hotel.blockedBy).

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { CHECKS, ENCOUNTER_BY_ID } from './content/encounters';
import { consequence } from './consequence';
import { cardFor, knows, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import type { Checkpoint, Effect, FactId, RunState } from './types';
import { CHECKPOINTS } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['hotel', 'motherLetter', 'hospitalNote'], bulletin: 'accommodation', seed: 93 };

const at = (s: RunState, id: string, desk: Checkpoint): RunState => ({
  ...s, reaction: null, checkpoint: CHECKPOINTS.indexOf(desk), slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id],
});

const factsOf = (effects: readonly Effect[]): FactId[] => effects.flatMap((e) => ('fact' in e ? [e.fact] : []));
const sentOf = (effects: readonly Effect[]): FactId[] => effects.flatMap((e) => ('send' in e ? e.facts ?? [] : []));
const clear = CHECKS.hostCall.cases.find((c) => c.result === 'clear')!.effects ?? [];
const again = ENCOUNTER_BY_ID.get('f_host')!.approaches.find((a) => a.id === 'again')!;

describe('the second host call puts her account on file like the first', () => {
  it('"picks up" has the same facts and the same printout as hostCall clear', () => {
    expect(factsOf(clear)).toEqual(['hostStatement', 'relativeNamed']);
    expect(factsOf(again.effects)).toEqual(factsOf(clear));
    expect(sentOf(again.effects)).toEqual(sentOf(clear));
  });

  it('after she picks up, customs knows what she said and the interview gets it on the printout', () => {
    const s = at({ ...newRun(lena), facts: { familyAddress: ['passport', 'customs'] } }, 'f_host', 'customs');
    const n = step(s, { type: 'choose', approach: 'again' });
    for (const f of ['hostStatement', 'relativeNamed'] as const) {
      expect(knows(n, f, 'customs'), f).toBe(true);
      expect(knows(n, f, 'interview'), f).toBe(true);
    }
    expect(n.time).toBe(s.time - 1);
  });

  it('closes f_host\'s own open issue', () => {
    const s = at({ ...newRun(lena), facts: { familyAddress: ['passport', 'customs'] } }, 'f_host', 'customs');
    const n = step(s, { type: 'choose', approach: 'again' });
    expect(knows(s, 'hostStatement', 'customs')).toBe(false);
    expect(knows(n, 'hostStatement', 'customs')).toBe(true);
  });

  it('the cost line names her account as one part', () => {
    const s = at({ ...newRun(lena), facts: { familyAddress: ['passport', 'customs'] } }, 'f_host', 'customs');
    const o = options(s).find((x) => x.approach.id === 'again')!;
    const keys = consequence(o, 'enc.f_host.again', 'cousin', 'customs', s).parts.map((p) => p.key);
    expect(keys).toContain('enc.f_host.again.reveal');
    expect(keys).not.toContain('fact.hostStatement.reveal');
    expect(t('enc.f_host.again.reveal')).toBeTruthy();
  });
});

describe('the hotel booking after her account', () => {
  it('no longer answers where you stay, so it cannot claim a hotel stay her account then catches', () => {
    const before = at(newRun(lena), 's_connection', 'interview');
    expect(cardFor(before, 'accommodation')).toBe('hotel');
    const after = { ...before, facts: { ...before.facts, hostStatement: ['interview' as const] } };
    expect(cardFor(after, 'accommodation')).not.toBe('hotel');
  });
});
