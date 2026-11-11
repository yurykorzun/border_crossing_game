// The phone search in stages (Check.explain): behind the partition, an
// observation, a decision with three answers, then a result fixed by
// background and bulletin.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { factIds, newRun, observation, step, waitActions } from './engine';
import type { RunSetup } from './engine';
import { tryStep } from './play';
import type { BulletinId, CharacterId, RunState, WaitAction } from './types';

const setup = (character: CharacterId, bulletin: BulletinId, seed = 1): RunSetup =>
  ({ character, loadout: ['motherLetter', 'hotel', 'employerLetter', ...(character === 'mark' ? ['returnTicket' as const] : [])], bulletin, seed });

/** Unlock the phone at customs, then let the beats play out. */
function searched(character: CharacterId, bulletin: BulletinId, seed = 1): RunState {
  const at: RunState = { ...newRun(setup(character, bulletin, seed)), checkpoint: 1, slot: 1, seen: ['c_phone'], screen: { kind: 'encounter', id: 'c_phone' } };
  let s = step(at, { type: 'choose', approach: 'unlock' });
  if (s.reaction) s = step(s, { type: 'ack' });
  if (s.screen.kind !== 'wait') throw new Error('the phone search starts');
  while (s.screen.kind === 'wait' && s.screen.shown < s.screen.beats.length) {
    expect(observation(s)).toBeUndefined();
    s = step(s, { type: 'beat' });
  }
  return s;
}
const resultOf = (s: RunState) => (s.screen.kind === 'wait' ? s.screen.resolved.result : undefined);
const answer = (s: RunState, action: WaitAction) => {
  const r = tryStep(s, { type: 'waitAction', action });
  if (!r.ok) throw new Error(`${action} is offered`);
  return r.state;
};

describe('the phone search in stages', () => {
  it('shows an observation before the result, then three answers', () => {
    const s = searched('lena', 'records');
    expect(observation(s)).toBe('check.phoneSearch.observe.donation');
    expect(t(observation(s)!)).toContain('Which bank do you use?');
    expect(s.log.some((l) => l.key.startsWith('check.phoneSearch.donation'))).toBe(false);
    expect(waitActions(s).map((w) => w.action)).toEqual(['wait', 'explain', 'ask']);
  });

  it('asking what the check concerns names the topic, and the decision is still open', () => {
    for (const [who, bulletin, topic] of [['lena', 'records', 'payment to a fund'], ['lena', 'customs', 'money you get from abroad'], ['lena', 'accommodation', 'messages'], ['mark', 'records', 'photos']] as const) {
      const asked = answer(searched(who, bulletin), 'ask');
      expect(t(asked.reaction![0].key)).toContain(topic);
      const after = step(asked, { type: 'ack' });
      expect(waitActions(after).map((w) => w.action)).toEqual(['wait', 'explain']);
    }
  });

  it('the result is clear, a specific payment, or a misunderstanding, and the same background and bulletin always give the same one', () => {
    const results = new Set<string>();
    for (const [who, bulletin, want] of [['lena', 'accommodation', 'clear'], ['lena', 'records', 'donation'], ['lena', 'customs', 'misread'], ['mark', 'customs', 'photo']] as const) {
      for (let seed = 1; seed <= 20; seed++) expect(resultOf(searched(who, bulletin, seed))).toBe(want);
      results.add(want);
    }
    expect([...results]).toEqual(expect.arrayContaining(['clear', 'donation', 'misread']));
    // Answering narrowly brings the payment question; the misunderstanding costs an hour.
    expect(step(searched('lena', 'records'), { type: 'waitAction', action: 'wait' }).screen).toEqual({ kind: 'encounter', id: 'f_donation' });
    const misread = searched('lena', 'customs');
    expect(answer(misread, 'wait').time).toBe(misread.time - 1);
  });

  it('explaining first answers the payment question before it is asked, at a cost on file', () => {
    const s = searched('lena', 'records');
    const n = answer(s, 'explain');
    expect(n.pending).not.toContain('f_donation');
    expect(n.screen).not.toEqual({ kind: 'encounter', id: 'f_donation' });
    expect(factIds(n)).toContain('donationRecord');
    expect(n.log.map((l) => l.key)).toContain('check.phoneSearch.explain.reaction');
    // Explaining when nothing was coming: the rare uneasy ending.
    expect(answer(searched('lena', 'accommodation'), 'explain').log.map((l) => l.key)).toContain('check.phoneSearch.clear.explained');
  });

  it('no answer takes a background fact or anything found off the file', () => {
    for (const [who, bulletin] of [['lena', 'records'], ['lena', 'customs'], ['lena', 'accommodation'], ['mark', 'records']] as const) {
      const s = searched(who, bulletin);
      for (const action of ['wait', 'explain', 'ask'] as const) {
        const n = answer(s, action);
        expect(n.character).toBe(s.character);
        for (const f of factIds(s)) expect(factIds(n)).toContain(f);
        for (const c of s.claims) expect(n.claims).toContain(c);
      }
    }
  });
});
