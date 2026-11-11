// Contacts as people (border_crossing_game-4qd.9): your mother, Ilya and Tom each
// say something ordinary before a card can offer to name them, your mother's
// message between desks follows what happened at the desk, a stranger or an
// officer is sometimes kind, and what your mother volunteers is her account,
// never a record.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { CHECKS, TESTIMONY, catchKind } from './content/encounters';
import { PERSONAL_LINES, PREPARATION_MESSAGE, QUEUES, messagesSoFar, queueBeats } from './content/queues';
import { CHARACTERS, CHARACTER_IDS } from './content/world';
import { LEVELS } from './content/levels';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { legalActions, newRun, options, queueMood, step, waitActions } from './engine';
import type { RunSetup } from './engine';
import { playStep } from './play';
import type { Action, Checkpoint, RunState } from './types';
import { CHECKPOINTS } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['hospitalNote', 'returnTicket', 'deed'], bulletin: 'customs', seed: 3 };

const at = (s: RunState, id: string, desk: Checkpoint): RunState => ({
  ...s, reaction: null, checkpoint: CHECKPOINTS.indexOf(desk), slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id],
});

/** Plays passport control from the start: `pick` answers where it has a preference, else the first answer, and waits out every check. */
function passport(setup: RunSetup, pick: Record<string, string>): RunState {
  let s = step(newRun(setup), { type: 'ack' });
  for (let n = 0; n < 100 && !(s.screen.kind === 'between' && !s.reaction); n++) {
    const legal = legalActions(s);
    const id = !s.reaction && s.screen.kind === 'encounter' ? s.screen.id : '';
    const want = legal.find((a) => a.type === 'choose' && a.approach === pick[id]);
    const wait = legal.find((a) => a.type === 'waitAction' && a.action === 'wait');
    s = step(s, want ?? wait ?? legal[0]);
  }
  expect(s.screen).toEqual({ kind: 'between', next: 1 });
  return s;
}

describe("your mother's message between desks follows what happened", () => {
  it('after a delay, after a call and after a smooth check are three different lines', () => {
    // The hospital note and the deed answer both questions for free.
    const smooth = passport(lena, { p_purpose: 'evidence', p_host: 'evidence', p_stay: 'evidence' });
    // Naming her: the clerk phones your mother.
    const call = passport(lena, { p_purpose: 'evidence', p_host: 'mother', p_stay: 'evidence' });
    // Checking the family visit, then an open stay: two hours at the desk.
    const delay = passport({ ...lena, loadout: ['deed', 'employerLetter', 'hotel'] }, { p_purpose: 'family', p_host: 'evidence', p_stay: 'unsure' });

    expect(smooth.after?.[1]).toBe('smooth');
    expect(call.after?.[1]).toBe('call');
    expect(delay.after?.[1]).toBe('delay');
    expect(newRun(lena).time - delay.time).toBeGreaterThanOrEqual(2);

    const first = (s: RunState) => queueBeats(1, s)[0];
    const lines = [smooth, call, delay].map(first);
    for (const b of lines) {
      expect(b.kind).toBe('phone');
      expect(b.from).toBe('mother');
    }
    expect(new Set(lines.map((b) => b.key)).size).toBe(3);
    expect(new Set(lines.map((b) => t(b.key))).size).toBe(3);
    // After the call she says the officer asked about this traveler's own relative.
    expect(t(first(call).key)).toContain('Ilya');
    expect(t(queueBeats(1, { character: 'mark', after: { 1: 'call' } })[0].key)).toContain('Tom');
    // The queue after customs has its own three.
    const customs = (['smooth', 'call', 'delay'] as const).map((m) => queueBeats(2, { character: 'lena', after: { 2: m } })[0].key);
    expect(new Set(customs).size).toBe(3);
  });

  it('each queue shows exactly one of the three, and only the message changes', () => {
    for (const character of CHARACTER_IDS)
      for (const q of [1, 2])
        for (const mood of ['smooth', 'call', 'delay'] as const) {
          const beats = queueBeats(q, { character, after: { [q]: mood } });
          expect(beats.filter((b) => b.after)).toHaveLength(1);
          expect(beats.filter((b) => !b.after).map((b) => b.key)).toEqual(queueBeats(q, { character }).filter((b) => !b.after).map((b) => b.key));
        }
  });

  it('arranging a lift with her at an inspection is not a call', () => {
    const run = newRun({ ...lena, loadout: ['hospitalNote', 'returnTicket', 'employerLetter'] });
    const s: RunState = { ...run, reaction: null, deskStart: { time: run.time, log: run.log.length }, screen: { kind: 'inspection', id: 's_connection' } };
    const drive = options(s).find((o) => o.approach.id === 'drive');
    expect(drive?.contact).toBe('mother');
    const after = step(s, { type: 'choose', approach: 'drive' });
    expect(after.exposed).toContain('mother');
    expect(queueMood(after)).toBe('smooth');
  });

  it('a desk with no start recorded (an old save) reads as smooth', () => {
    expect(queueMood(newRun(lena))).toBe('smooth');
  });
});

describe('each contact speaks before any card offers them', () => {
  it('every contact of each traveler has an ordinary line of their own in the passport queue', () => {
    for (const id of CHARACTER_IDS) {
      const first = queueBeats(0, { character: id }).map((b) => b.key);
      for (const c of CHARACTERS[id].contacts) {
        const key = PERSONAL_LINES[id][c];
        expect(key, `${id} ${c}`).toBeDefined();
        expect(first, `${id} ${c}`).toContain(key);
        const beat = QUEUES[0].find((b) => b.key === key)!;
        expect(beat.from).toBe(c);
        expect(t(key!)).not.toMatch(/—/);
      }
    }
  });

  it('in bot runs of every style, a contact offered on a card or in a waiting room has already spoken', () => {
    let offers = 0;
    for (const style of BOT_STYLES)
      for (let i = 0; i < 40; i++) {
        const setup = setupFor(i);
        const run = playRun(style, setup);
        let s = newRun(setup);
        const check = () => {
          const offered = [...options(s).map((o) => o.contact), ...waitActions(s).map((w) => w.contact)].filter((c) => c !== undefined);
          const heard = messagesSoFar(s).map((b) => b.key);
          for (const c of offered) {
            offers++;
            expect(heard, `${style} ${i} ${c}`).toContain(PERSONAL_LINES[s.character][c]);
          }
        };
        for (const a of run.actions as Action[]) {
          check();
          s = playStep(s, a);
        }
        check();
      }
    expect(offers).toBeGreaterThan(0);
  });

  it('the packing screen shows one short message, from work, asking for a return date', () => {
    expect(PREPARATION_MESSAGE.from).toBe('work');
    expect(t(PREPARATION_MESSAGE.key)).toBe("Hope your dad's OK. Do you know when you'll be back? The client meeting is Monday.");
  });
});

describe('kindness in the queues', () => {
  it('Arrival can show at least two kind beats: an officer explains the missing copy, a stranger lends a charger', () => {
    expect(LEVELS.arrival.id).toBe('arrival');
    for (const character of CHARACTER_IDS) {
      const kind = QUEUES.flatMap((_, q) => queueBeats(q, { character })).filter((b) => b.kindness);
      expect(kind.length).toBeGreaterThanOrEqual(2);
      const text = kind.map((b) => t(b.key)).join(' ');
      expect(text).toMatch(/officer[^.]*which copy is missing/i);
      expect(text).toMatch(/charger/i);
    }
  });
});

describe('what your mother volunteers is testimony, not disproof', () => {
  it('asked where you stay, she also names the rest of the family, and a denial against it is only conflicting accounts', () => {
    // The host call asks her one thing: where you stay.
    expect(CHECKS.hostCall.topic).toBe('accommodation');
    let s = at({ ...newRun(lena), facts: { familyAddress: ['customs'] } }, 'c_host', 'customs');
    s = step(s, { type: 'choose', approach: 'call' });
    expect(s.screen.kind).toBe('wait');
    while (s.reaction || legalActions(s).some((a) => a.type === 'beat')) s = step(s, s.reaction ? { type: 'ack' } : { type: 'beat' });
    s = step(s, { type: 'waitAction', action: 'wait' });
    // She answers, and tells more than she was asked: another relative goes on file, and on to the interview.
    expect(s.log.map((l) => l.key)).toContain('check.hostCall.clear');
    expect(t('check.hostCall.clear')).toMatch(/more than he asked/);
    expect(s.facts.relativeNamed).toEqual(['customs', 'interview']);
    expect(TESTIMONY).toContain('relativeNamed');

    // At the interview you deny other family: her account and yours differ.
    s = step(at(s, 'i_family', 'interview'), { type: 'choose', approach: 'deny' });
    expect(s.claims).toContain('noOtherFamily');
    expect(catchKind('i_contradiction', 'relativeNamed')).toBe('testimony');
    const caught = step(at(s, 'i_contradiction', 'interview'), { type: 'choose', approach: 'apologise' });
    const line = caught.log.find((l) => l.key === 'enc.i_contradiction.noOtherFamily.relativeNamed.apologise.reaction');
    expect(line?.kind).toBe('testimony');
    expect(caught.disproved ?? []).not.toContain('noOtherFamily');
  });
});
