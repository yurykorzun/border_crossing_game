// Turning back (turnedBack) is offered at one early point, the passport queue,
// before any desk has asked or decided anything. After it no desk card offers a
// way out, and an inspection offers "Ask to return" only where its situation
// allows it: the medicine is held, or the supervisor has not decided yet.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { BOT_STYLES, playRun } from './bots';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { LEVEL_IDS } from './content/levels';
import { TURN_BACK_QUEUE, canTurnBack, legalActions, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import { tryStep } from './play';
import type { RunState } from './types';
import { allSetups } from './walk';

const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'hotel', 'employerLetter'], bulletin: 'records', seed: 7 };
const RETURN_ALLOWED = ['s_medicine', 's_supervisor'];

const offersWithdraw = (s: RunState) => options(s).some((o) => o.approach.kind === 'withdraw');
const offersTurnBack = (s: RunState) => legalActions(s).some((a) => a.type === 'turnBack');

/** Every state a run passes through, replayed from its setup (step() is seeded, so it replays exactly). */
function statesOf(setup: RunSetup, actions: ReturnType<typeof playRun>['actions']): RunState[] {
  let s = newRun(setup);
  const out = [s];
  for (const a of actions) out.push((s = step(s, a)));
  return out;
}

describe('turning back is offered only at the early point', () => {
  it('is offered in the passport queue, before the first desk asks anything', () => {
    const s = newRun(lena);
    expect(s.screen).toEqual({ kind: 'between', next: TURN_BACK_QUEUE });
    expect(TURN_BACK_QUEUE).toBe(0);
    expect(canTurnBack(s)).toBe(true);
    expect(legalActions(s)).toEqual([{ type: 'ack' }, { type: 'turnBack' }]);
    expect(t('queue.0.turnBack')).toBe('Leave the queue and go back');
  });

  it('ends the run Turned back, spending nothing and counting one decision', () => {
    const s = newRun(lena);
    const r = tryStep(s, { type: 'turnBack' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.ending).toBe('turnedBack');
    expect(r.state.withdrew).toBe(true);
    expect(r.state.decisions).toBe(1);
    expect(r.state.time).toBe(s.time);
    expect(r.state.facts).toEqual({});
    expect(r.state.claims).toEqual([]);
    expect(r.state.reaction?.map((l) => l.key)).toEqual(['turnBack.reaction']);
  });

  it('is gone once you walk up to the booth: no desk card has a way out', () => {
    expect(ENCOUNTERS.filter((e) => e.approaches.some((a) => a.kind === 'withdraw')).map((e) => e.id)).toEqual([]);
    const desk = step(newRun(lena), { type: 'ack' });
    expect(desk.screen.kind).toBe('encounter');
    expect(offersTurnBack(desk)).toBe(false);
    expect(offersWithdraw(desk)).toBe(false);
    expect(tryStep(desk, { type: 'turnBack' }).ok).toBe(false);
    // The later queues walk you on; only the passport queue lets you leave.
    for (const next of [1, 2]) {
      const queue: RunState = { ...newRun(lena), checkpoint: next, screen: { kind: 'between', next } };
      expect(canTurnBack(queue), `queue ${next}`).toBe(false);
      expect(legalActions(queue)).toEqual([{ type: 'ack' }]);
    }
    // While a reaction is still showing, it is read first.
    expect(canTurnBack({ ...newRun(lena), reaction: [{ key: 'ui.continue' }] })).toBe(false);
  });

  it('offers "Ask to return" on an inspection only where its situation allows', () => {
    const inspection = (id: string): RunState => ({
      ...newRun(lena), checkpoint: 1, slot: 1, scrutiny: 3, inspections: 1, seen: [id], screen: { kind: 'inspection', id },
    });
    for (const i of INSPECTIONS) expect(offersWithdraw(inspection(i.id)), i.id).toBe(RETURN_ALLOWED.includes(i.id));
    expect(t('insp.s_medicine.withdraw.label')).toBe('Ask to return with the medicine');
    expect(t('insp.s_supervisor.withdraw.label')).toBe('Ask to return before she decides');
    const r = tryStep(inspection('s_medicine'), { type: 'choose', approach: 'withdraw' });
    expect(r.ok && r.state.ending).toBe('turnedBack');
    expect(r.ok && r.state.medicine).toBe(true);
  });

  it('holds in every bot run over every setup: the queue first, then only the allowed inspections', () => {
    const bad: string[] = [];
    let queues = 0;
    let returns = 0;
    for (const level of LEVEL_IDS)
      for (const setup of allSetups(level))
        for (const style of BOT_STYLES) {
          const run = playRun(style, setup);
          for (const s of statesOf(setup, run.actions)) {
            const sc = s.screen;
            const where = `${level} ${style} ${setup.character} ${setup.loadout} ${setup.bulletin} ${sc.kind}`;
            if (offersTurnBack(s)) {
              queues++;
              if (!(sc.kind === 'between' && sc.next === TURN_BACK_QUEUE && s.decisions === 0)) bad.push(`turn back offered at ${where}`);
            }
            if (s.reaction) continue;
            if (sc.kind === 'encounter' && offersWithdraw(s)) bad.push(`withdraw on desk card ${sc.id} (${where})`);
            if (sc.kind === 'inspection') {
              if (offersWithdraw(s)) returns++;
              if (offersWithdraw(s) !== RETURN_ALLOWED.includes(sc.id)) bad.push(`inspection ${sc.id} withdraw ${offersWithdraw(s)} (${where})`);
            }
          }
        }
    expect(bad).toEqual([]);
    // Every run starts in the passport queue, and some reach an inspection that allows a return.
    expect(queues).toBeGreaterThan(0);
    expect(returns).toBeGreaterThan(0);
  });
});
