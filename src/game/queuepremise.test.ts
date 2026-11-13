// Your mother's messages match what happened at the desks (border_crossing_game-dap.33).
// Over every Arrival and Departure setup in seeds 1-10, every bot style plays the run,
// and each queue after a desk is checked against that desk: "Customs called me" only
// after she picked up there, "they asked about Ilya" only when you named him there,
// "Still nothing?" only after a long desk with no call. Departure never shows the lines
// that only fit coming home to Dad (the spare key, the sandwich, "Come straight here").

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { BOT_STYLES, playRun } from './bots';
import { newRun, step } from './engine';
import { playStep } from './play';
import { COMING_HOME_LINES, allSetups, queueLevelLines, queuePremises } from './walk';
import type { QueueTally } from './walk';
import { queueBeats } from './content/queues';
import type { Action, LevelId, RunState } from './types';

const SEEDS = 10;

function sweep(level: LevelId): { bad: string[]; tally: QueueTally; queues: Set<string> } {
  const tally: QueueTally = { call: 0, callRelative: 0, delay: 0, smooth: 0 };
  const bad: string[] = [];
  const queues = new Set<string>();
  for (const setup of allSetups(level))
    for (let seed = 1; seed <= SEEDS; seed++)
      for (const style of BOT_STYLES) {
        const run = playRun(style, { ...setup, seed });
        let s: RunState = newRun({ ...setup, seed });
        const look = (prev: RunState | undefined, n: RunState) => {
          const where = `${level} ${style} seed ${seed} ${setup.character} ${setup.loadout} ${setup.bulletin}`;
          if (prev) for (const d of queuePremises(prev, n, tally)) bad.push(`${where}: ${d}`);
          for (const d of queueLevelLines(n)) bad.push(`${where}: ${d}`);
          if (n.screen.kind === 'between') for (const b of queueBeats(n.screen.next, n)) queues.add(b.key);
        };
        look(undefined, s);
        for (const a of run.actions as Action[]) {
          const n = playStep(s, a);
          look(s, n);
          s = n;
        }
      }
  return { bad, tally, queues };
}

for (const level of ['arrival', 'departure'] as const) {
  describe(`your mother's messages in ${level}, every setup, seeds 1-${SEEDS}`, () => {
    const { bad, tally, queues } = sweep(level);

    it('each after-desk message holds its premise: a call happened or not, which desk, which contact', () => {
      expect(bad.slice(0, 10)).toEqual([]);
    });

    it('the rule was really exercised: calls, delays and smooth desks all came up', () => {
      expect(tally.call).toBeGreaterThan(0);
      expect(tally.delay).toBeGreaterThan(0);
      expect(tally.smooth).toBeGreaterThan(0);
    });

    if (level === 'departure')
      it('shows none of the lines about coming home to Dad, and its own in their place', () => {
        for (const k of COMING_HOME_LINES) expect(queues.has(k), k).toBe(false);
        expect([...queues].filter((k) => k.endsWith('.departure')).length).toBeGreaterThan(0);
        expect([...queues].map((k) => t(k)).join(' ')).not.toMatch(/flowerpot|sandwich|straight here/);
      });
    else
      it("shows none of Departure's lines", () => {
        expect([...queues].filter((k) => k.endsWith('.departure'))).toEqual([]);
      });
  });
}

describe('the second call at customs', () => {
  it('"The phone rings and rings. Then she picks up." reads as a call in the next queue', () => {
    // An accommodation day: the host call goes unanswered, then the follow-up's second call reaches her.
    let s = step(newRun({ character: 'lena', loadout: ['hospitalNote', 'returnTicket', 'deed'], bulletin: 'accommodation', seed: 1 }), { type: 'ack' });
    s = { ...s, reaction: null, checkpoint: 1, screen: { kind: 'encounter', id: 'f_host' }, deskStart: { time: s.time, log: s.log.length, exposed: s.exposed.length } };
    const n = step(s, { type: 'choose', approach: 'again' });
    expect(n.deskStart?.phoned).toBe(true);
  });
});
