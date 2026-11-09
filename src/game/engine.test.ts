// Rule, boundary, scenario, illegal-action, replay and save tests for the
// engine. The exhaustive walk lives in walk.test.ts; these pin single rules
// down with hand-built states so a failure names the rule that broke.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { factIds, legalActions, loggedAt, newRun, step } from './engine';
import { StoryContent } from '../ui/parts';
import { t } from '../i18n';
import type { RunSetup } from './engine';
import { CONTENT_VERSION, replay, tryStep } from './play';
import type { Move } from './play';
import { load, save, freshSave } from './save';
import { nextRandom } from './rng';
import { allSetups } from './walk';
import { MAX_SCRUTINY, SCRUTINY_AFTER_INSPECTION } from './content/world';
import type { Action, FactId, FactMap, RunState } from './types';

/** Facts the interview officer knows: the desk most fixtures here are at. */
const known = (...f: FactId[]): FactMap => Object.fromEntries(f.map((x) => [x, ['interview']]));

const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'hotel', 'employerLetter'], bulletin: 'records', seed: 7 };
const at = (s: RunState, id: string, extra: Partial<RunState> = {}): RunState => ({
  ...s, reaction: null, screen: { kind: 'encounter', id }, seen: [...s.seen, id], ...extra,
});

describe('rules', () => {
  it('spending a document exhausts it and records its facts and claims', () => {
    const s = at(newRun(lena), 'p_purpose', { slot: 1 });
    const r = tryStep(s, { type: 'choose', approach: 'evidence' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.used).toEqual(['motherLetter']);
    expect(factIds(r.state)).toContain('familyAddress');
    expect(r.state.claims).toContain('familyVisit');
    expect(r.events).toContainEqual({ type: 'documentUsed', id: 'motherLetter' });
    expect(r.events).toContainEqual({ type: 'factRecorded', id: 'familyAddress' });
  });

  it('a spent document cannot be played again', () => {
    const s = at(newRun(lena), 'i_stay', { checkpoint: 2, slot: 1, used: ['motherLetter'], claims: ['stayingWithFamily'] });
    // the hotel is blocked by the staying-with-family claim, the letter is spent: no card fits
    expect(tryStep(s, { type: 'choose', approach: 'evidence' })).toMatchObject({ ok: false, reason: 'notAllowed' });
  });

  it('an exposed contact cannot be used again', () => {
    const s = at(newRun(lena), 'i_stay', { checkpoint: 2, slot: 1, exposed: ['mother'] });
    expect(tryStep(s, { type: 'choose', approach: 'mother' }).ok).toBe(false);
  });

  it('a spoken claim the officer writes down is on file at that desk; one only said aloud is not', () => {
    // The inspector writes down a cash declaration (goods), but not a reason for visiting.
    const declared = tryStep(at(newRun(lena), 'c_cash', { checkpoint: 1, slot: 1 }), { type: 'choose', approach: 'under' });
    const admitted = tryStep(at(newRun(lena), 'c_tourist', { checkpoint: 1, slot: 1 }), { type: 'choose', approach: 'admit' });
    if (!declared.ok || !admitted.ok) throw new Error('both answers are legal here');
    expect(declared.state.claims).toContain('cashUnderLimit');
    expect(loggedAt(declared.state, 'cashUnderLimit')).toEqual(['customs']);
    expect(admitted.state.claims).toContain('familyVisit');
    expect(loggedAt(admitted.state, 'familyVisit')).toEqual([]);

    // My story: the written-down claim carries "on file" and the desk name, the spoken one neither.
    const story = (s: RunState) => {
      const html = renderToStaticMarkup(createElement(StoryContent, { s }));
      return (c: string) => html.match(new RegExp(`<li data-claim="${c}"[^>]*>.*?</li>`))?.[0] ?? '';
    };
    const logged = story(declared.state)('cashUnderLimit');
    expect(logged).toContain(t('ui.writtenDown'));
    expect(logged).toContain(`data-desk="customs">${t('desk.customs')}<`);
    const said = story(admitted.state)('familyVisit');
    expect(said).toContain(t('claim.familyVisit'));
    expect(said).toContain(t('ui.saidAloud'));
    expect(said).not.toContain(t('ui.writtenDown'));
    expect(said).not.toContain('data-desk');
  });

  it('the same claim made again at a desk that writes it down goes on file there too', () => {
    const s = at(newRun(lena), 'i_stay', { checkpoint: 2, slot: 1, claims: ['familyVisit'] });
    const r = tryStep(s, { type: 'choose', approach: 'mother' });
    if (!r.ok) throw new Error('naming the mother is legal here');
    expect(loggedAt(r.state, 'stayingWithFamily')).toEqual(['interview']);
    expect(loggedAt(r.state, 'familyVisit')).toEqual([]);
    // An old save without the record reads as nothing written down.
    expect(loggedAt({ ...s, logged: undefined }, 'familyVisit')).toEqual([]);
  });

  it('time never goes below zero', () => {
    const s = at(newRun(lena), 'i_contradiction', { checkpoint: 2, slot: 2, time: 1 });
    const r = tryStep(s, { type: 'choose', approach: 'review' });
    expect(r.ok && r.state.time).toBe(0);
  });
});

describe('boundaries', () => {
  it('scrutiny rising from 2 to 3 starts exactly one inspection and resets after it', () => {
    const s = at(newRun(lena), 'c_phone', { checkpoint: 1, slot: 1, scrutiny: MAX_SCRUTINY - 1 });
    const r = tryStep(s, { type: 'choose', approach: 'refuse' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.screen.kind).toBe('inspection');
    expect(r.state.inspections).toBe(1);
    expect(r.events.filter((e) => e.type === 'inspectionStarted')).toHaveLength(1);
    const after = step(step(r.state, { type: 'ack' }), legalActions(step(r.state, { type: 'ack' }))[0]);
    expect(after.scrutiny).toBeLessThanOrEqual(SCRUTINY_AFTER_INSPECTION);
  });

  it('scrutiny overflow does not carry over: +2 at 2 stops at the max', () => {
    const s = at(newRun(lena), 'i_contradiction', { checkpoint: 2, slot: 2, scrutiny: 2, claims: ['cashUnderLimit'], facts: known('cashCount') });
    const r = tryStep(s, { type: 'choose', approach: 'apologise' });
    expect(r.ok && r.events).toContainEqual({ type: 'scrutinyChanged', from: 2, to: MAX_SCRUTINY });
  });
});

describe('scenarios', () => {
  const interviewSlot2 = (extra: Partial<RunState>): RunState =>
    ({ ...newRun(lena), checkpoint: 2, slot: 1, screen: { kind: 'between', next: 2 }, ...extra });

  it('a tourism claim plus the family address on file deals the clarify card', () => {
    const s = step(interviewSlot2({ claims: ['tourism'], facts: known('familyAddress') }), { type: 'ack' });
    expect(s.screen).toEqual({ kind: 'encounter', id: 'i_clarify' });
  });

  it('a family-visit claim with the same address deals neither', () => {
    const s = step(interviewSlot2({ claims: ['familyVisit'], facts: known('familyAddress') }), { type: 'ack' });
    expect(s.screen).not.toEqual({ kind: 'encounter', id: 'i_contradiction' });
    expect(s.screen).not.toEqual({ kind: 'encounter', id: 'i_clarify' });
  });

  // Passport after "tourism" and the employer card: 2 decisions, both checkpoint cards.
  const quietPassport = (extra: Partial<RunState> = {}): RunState =>
    at(newRun(lena), 'p_employer', {
      slot: 2, decisions: 1, seen: ['p_purpose', 'p_employer'], claims: ['tourism'], ...extra,
    });

  it('a quiet run gets a third card: the routine question not asked yet', () => {
    const s = step(quietPassport({ bulletin: 'customs' }), { type: 'choose', approach: 'perk' });
    expect(s.screen).toEqual({ kind: 'encounter', id: 'p_photo' });
    expect(s.checkpoint).toBe(0);
    let after = step(s, { type: 'choose', approach: 'scan' });
    while (after.screen.kind === 'wait' && after.screen.shown < after.screen.beats.length) after = step(after, { type: 'beat' });
    after = step(step(after, { type: 'waitAction', action: 'wait' }), { type: 'ack' });
    expect(after.screen).toEqual({ kind: 'between', next: 1 });
  });

  it('a run that asked in a waiting room or met an inspection gets only 2 cards', () => {
    const asked = step(quietPassport({ decisions: 2 }), { type: 'choose', approach: 'perk' });
    expect(asked.screen).toEqual({ kind: 'between', next: 1 });
    const inspected = step(quietPassport({ inspections: 1 }), { type: 'choose', approach: 'perk' });
    expect(inspected.screen).toEqual({ kind: 'between', next: 1 });
  });
});

describe('illegal actions', () => {
  const junk: Action[] = [
    { type: 'ack' }, { type: 'beat' }, { type: 'choose', approach: 'nope' },
    { type: 'waitAction', action: 'wait' }, { type: 'waitAction', action: 'assist' },
  ];

  it('never throw, and a rejected action leaves the state untouched', () => {
    for (const s of playouts(60).flatMap((p) => p.states)) {
      for (const a of junk) {
        const r = tryStep(s, a);
        if (!r.ok) expect(r.state).toBe(s);
      }
    }
  });

  it('a finished run accepts nothing', () => {
    for (const p of playouts(20)) {
      const end = p.states[p.states.length - 1];
      expect(end.ending).not.toBeNull();
      for (const a of junk) expect(tryStep(end, a)).toMatchObject({ ok: false, reason: 'runOver' });
    }
  });
});

describe('replay and save', () => {
  it('replaying the action log reproduces the run exactly', () => {
    for (const p of playouts(200)) {
      const final = replay({ contentVersion: CONTENT_VERSION, setup: p.setup, moves: p.moves });
      expect(final).toEqual(p.states[p.states.length - 1]);
    }
  });

  it('refuses a replay from another content version', () => {
    const p = playouts(1)[0];
    expect(() => replay({ contentVersion: CONTENT_VERSION + 1, setup: p.setup, moves: p.moves })).toThrow(/content v/);
  });

  it('a run saved mid-way and loaded plays on to the same ending', () => {
    for (const p of playouts(100)) {
      const mid = Math.floor(p.moves.length / 2);
      const store = new Map<string, string>();
      save({ get: (k) => store.get(k) ?? null, set: (k, v) => void store.set(k, v) }, { ...freshSave(), run: p.states[mid] });
      let s = load({ get: (k) => store.get(k) ?? null, set: () => {} }).run!;
      for (const m of p.moves.slice(mid)) s = step(s, m.action);
      expect(s).toEqual(p.states[p.states.length - 1]);
    }
  });
});

/** Random full runs with the real seeded dealer: setup, moves, and every state on the way. */
function playouts(n: number): { setup: RunSetup; moves: Move[]; states: RunState[] }[] {
  const setups = allSetups();
  const out = [];
  let r = 12345;
  const roll = (size: number) => {
    const x = nextRandom(r);
    r = x.rng;
    return Math.floor(x.value * size);
  };
  for (let i = 0; i < n; i++) {
    const setup = { ...setups[roll(setups.length)], seed: i + 1 };
    let s = newRun(setup);
    const states = [s];
    const moves: Move[] = [];
    while (!s.ending) {
      const acts = legalActions(s);
      const action = acts[roll(acts.length)];
      s = step(s, action);
      moves.push({ action });
      states.push(s);
      if (moves.length > 200) throw new Error('run did not end in 200 moves');
    }
    out.push({ setup, moves, states });
  }
  return out;
}
