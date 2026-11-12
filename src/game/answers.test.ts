// Answers that establish what the question asks (border_crossing_game-dap.5): a cash
// count answers how much you carry, not where it is from; a salary line shows income,
// not how much you take out; a property deed says nothing about two passports. And the
// amount, over the limit, is on the screen before the inspector asks.

import { afterEach, describe, expect, it } from 'vitest';
import { has, setStory, t } from '../i18n';
import { SAMPLE_FILES } from './carry';
import { ENCOUNTERS } from './content/encounters';
import { queueBeats } from './content/queues';
import { choices, newRun, pointVerified } from './engine';
import { playStep } from './play';
import type { RunState } from './types';
import { CHECKPOINTS } from './types';

const at = (s: RunState, id: string): RunState => ({ ...s, reaction: null, screen: { kind: 'encounter', id }, seen: [...s.seen, id] });
const card = (id: string) => ENCOUNTERS.find((e) => e.id === id)!;
/** Every packed document an answer on this card would show. */
const shown = (s: RunState) => choices(s).flatMap((o) => (o.card ? [o.card] : []));

afterEach(() => setStory(undefined));

describe('a cash count answers a question about the amount', () => {
  // Every answer that counts your cash, on any card.
  const counting = ENCOUNTERS.filter((e) => e.approaches.some((a) => a.effects.some((x) => 'fact' in x && x.fact === 'cashCount' && !x.when)));

  it('c_cash offers the count, and asks how much you carry as well as where it is from', () => {
    expect(card('c_cash').approaches.map((a) => a.id)).toContain('count');
    expect(t('enc.c_cash.q')).toBe('"How much cash, and where from?"');
  });

  it.each(counting.map((e) => [e.id]))('%s asks how much cash', (id) => {
    expect(t(`enc.${id}.q`)).toMatch(/how much cash/i);
  });

  it('on c_cash the employer letter answers where the cash is from, the count how much', () => {
    const lena = newRun({ character: 'lena', loadout: ['employerLetter', 'returnTicket', 'deed'], bulletin: 'records', seed: 7 });
    expect(shown(at(lena, 'c_cash'))).toEqual(['employerLetter']);
    expect(t('enc.c_cash.evidence.reaction')).toMatch(/salary/);
    expect(t('enc.c_cash.count.reaction')).toMatch(/total/);
  });
});

describe('d_declared no longer takes the employer letter', () => {
  it('Lena with the letter packed is offered the count or her word, not the letter', () => {
    setStory('departure');
    const lena = newRun({ level: 'departure', character: 'lena', loadout: ['employerLetter', 'returnTicket', 'deed'], bulletin: 'records', seed: 7, file: SAMPLE_FILES.lena });
    const s = at(lena, 'd_declared');
    expect(shown(s)).not.toContain('employerLetter');
    expect(choices(s).map((o) => o.approach.id)).toEqual(['count', 'under']);
    expect(card('d_declared').approaches.some((a) => a.kind === 'evidence')).toBe(false);
  });
});

describe('p_secondPassport no longer takes the deed', () => {
  it('Mark with the deed packed on a records day answers for himself or hands both over', () => {
    const mark = newRun({ character: 'mark', loadout: ['deed', 'motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
    const s = at(mark, 'p_secondPassport');
    expect(shown(s)).not.toContain('deed');
    expect(choices(s).map((o) => o.approach.id)).toEqual(['both', 'handOver']);
    expect(has('enc.p_secondPassport.evidence.reaction')).toBe(false);
  });

  it('a deed shown for where he stays confirms who he is, so handing over both passports needs no records scan', () => {
    const mark = newRun({ character: 'mark', loadout: ['deed', 'motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
    const plain = playStep(at(mark, 'p_secondPassport'), { type: 'choose', approach: 'handOver' });
    expect(plain.screen.kind).toBe('wait');
    const shownAtHost = playStep(at(mark, 'p_host'), { type: 'choose', approach: 'evidence', card: 'deed' });
    expect(pointVerified(shownAtHost, 'identity')).toBe(true);
    const n = playStep(at(shownAtHost, 'p_secondPassport'), { type: 'choose', approach: 'handOver' });
    expect(n.screen.kind).not.toBe('wait');
    expect(n.time).toBe(shownAtHost.time - 1);
  });
});

describe('the player sees how much cash they carry before customs', () => {
  const customs = CHECKPOINTS.indexOf('customs');

  it.each([
    ['arrival', 'lena'], ['arrival', 'mark'], ['departure', 'lena'], ['departure', 'mark'],
  ] as const)('%s, %s: the queue before customs gives the amount and the limit', (level, character) => {
    setStory(level === 'arrival' ? undefined : level);
    const beats = queueBeats(customs, { character });
    const cash = beats.find((b) => b.key === 'msg.1.cash');
    expect(cash, 'cash beat in the customs queue').toBeTruthy();
    const line = t(cash!.key);
    const [limit, carried] = [/over ([\d,]+)/.exec(line), /(?:carry|taking out) ([\d,]+)/.exec(line)].map((m) => Number(m![1].replace(/,/g, '')));
    // Over the limit, so "It's under the limit" is a claim a count disproves.
    expect(carried).toBeGreaterThan(limit);
  });
});
