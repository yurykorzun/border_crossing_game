// An inspection names the open issue it is about (border_crossing_game-4qd.11):
// one is dealt only while a point on the file is still open, its screen says
// which, and whether the supervisor inspects at all is decided by the file,
// not by a draw.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { INSPECTIONS } from './content/encounters';
import { CHECKPOINTS } from './types';
import { inspectionIssue, knownLine, newRun, options, pointVerified, step } from './engine';
import type { Action, RunState } from './types';

const SEEDS = 200;
const DRAWS = 50;

/** Every state a run passes through with the action taken from it, the last one excluded. */
function steps(style: (typeof BOT_STYLES)[number], i: number): { s: RunState; a: Action }[] {
  const run = playRun(style, setupFor(i, 'arrival'));
  let s = newRun(setupFor(i, 'arrival'));
  const out: { s: RunState; a: Action }[] = [];
  for (const a of run.actions) {
    out.push({ s, a });
    s = step(s, a);
  }
  return out;
}

describe('an inspection names the open issue it is about', () => {
  it('every inspection has an issue and copy that names it', () => {
    for (const i of INSPECTIONS) {
      expect(i.issue, i.id).toBeDefined();
      expect(t(`insp.issue.${i.issue}`), i.id).not.toBe(`insp.issue.${i.issue}`);
    }
  });

  it(`over ${SEEDS} Arrival seeds per style, every inspection screen names an issue still open on the file, and none starts without one`, () => {
    let screens = 0;
    let started = 0;
    for (const style of BOT_STYLES)
      for (let i = 0; i < SEEDS; i++)
        for (const { s, a } of steps(style, i)) {
          const next = step(s, a);
          if (next.screen.kind !== 'inspection') continue;
          const where = `${style} seed ${i + 1} ${next.screen.id}`;
          screens++;
          const issue = inspectionIssue(next);
          expect(issue, where).toBeDefined();
          // The line on screen names that issue.
          expect(knownLine(next), where).toEqual([{ key: `insp.issue.${issue}` }]);
          // Dealt just now: the issue was open on the file the moment it started.
          if (s.screen.kind !== 'inspection' || s.screen.id !== next.screen.id || s.reaction) {
            started++;
            expect(pointVerified(next, issue!), `${where} starts on a verified point`).toBe(false);
          }
        }
    expect(started).toBeGreaterThan(0);
    expect(screens).toBeGreaterThanOrEqual(started);
  });

  it('a paper shown at an inspection settles its issue; an answer without one changes it instead', () => {
    // The supervisor asks why Lena came back: the employer letter answers it.
    const lena = { character: 'lena' as const, loadout: ['hotel', 'motherLetter', 'employerLetter'] as const, bulletin: 'records' as const, seed: 3 };
    const at: RunState = { ...newRun({ ...lena, loadout: [...lena.loadout] }), checkpoint: CHECKPOINTS.length - 1, screen: { kind: 'inspection', id: 's_supervisor' }, inspections: 1, seen: ['s_supervisor'] };
    expect(pointVerified(at, 'purpose')).toBe(false);
    expect(pointVerified(step(at, { type: 'choose', approach: 'evidence' }), 'purpose')).toBe(true);
    // Letting her phone the hospital leaves the point open, but puts your father's condition on file.
    const accepted = step(at, { type: 'choose', approach: 'accept' });
    expect(pointVerified(accepted, 'purpose')).toBe(false);
    expect(accepted.facts.fatherCondition).toBeDefined();
  });

  it('waiting for the lab at the medicine inspection verifies the prescription', () => {
    const lena = { character: 'lena' as const, bulletin: 'customs' as const, seed: 3 };
    const at: RunState = { ...newRun({ ...lena, loadout: ['hotel', 'motherLetter', 'employerLetter'] }), checkpoint: CHECKPOINTS.length - 1, screen: { kind: 'inspection', id: 's_medicine' }, inspections: 1, seen: ['s_medicine'] };
    expect(at.medicine).toBe(true);
    expect(pointVerified(at, 'medicine')).toBe(false);
    const waited = step(at, { type: 'choose', approach: 'wait' });
    expect(pointVerified(waited, 'medicine')).toBe(true);
    expect(waited.medicine).toBe(true);
  });

  it(`over ${SEEDS} Arrival seeds per style, every answer offered at an inspection settles its issue or changes the file`, () => {
    const answers = new Set<string>();
    for (const style of BOT_STYLES)
      for (let i = 0; i < SEEDS; i++)
        for (const { s } of steps(style, i)) {
          if (s.screen.kind !== 'inspection' || s.reaction) continue;
          const issue = inspectionIssue(s)!;
          for (const o of options(s)) {
            if (o.blocked || o.approach.kind === 'withdraw') continue;
            const where = `${style} seed ${i + 1} ${s.screen.id}.${o.approach.id}`;
            answers.add(`${s.screen.id}.${o.approach.id}`);
            const n = step(s, { type: 'choose', approach: o.approach.id });
            const changed = pointVerified(n, issue)
              || JSON.stringify(n.facts) !== JSON.stringify(s.facts)
              || n.medicine !== s.medicine
              || (n.travel ?? 0) !== (s.travel ?? 0)
              || n.exposed.length > s.exposed.length;
            expect(changed, where).toBe(true);
          }
        }
    expect(answers.has('s_medicine.wait')).toBe(true);
  });
});

describe('the supervisor decides from the file, not from a draw', () => {
  it(`for the same file the supervisor's decision before admission is the same across ${DRAWS} seeds`, () => {
    let files = 0;
    let inspected = 0;
    for (const style of BOT_STYLES)
      for (let i = 0; i < 40; i++)
        for (const { s, a } of steps(style, i)) {
          // The step that reaches the supervisor: the last desk's own spot-check is
          // done, so nothing random is left before she reads the file.
          const next = step(s, a);
          const reachedHer = s.checkpoint === CHECKPOINTS.length - 1 && !s.inspections && (s.spotChecked ?? []).includes('interview')
            && !next.withdrew && (next.ending !== null || (next.screen.kind === 'inspection' && next.inspections === 1));
          if (!reachedHer || s.ending) continue;
          files++;
          const decide = (rng: number) => {
            const r = step({ ...s, rng }, a);
            return r.screen.kind === 'inspection' ? r.screen.id : r.ending;
          };
          const first = decide(1);
          if (first?.startsWith('s_')) inspected++;
          for (let k = 2; k <= DRAWS; k++) expect(decide(k * 7919), `${style} seed ${i + 1}, draw ${k}`).toBe(first);
        }
    expect(files).toBeGreaterThan(20);
    expect(inspected).toBeGreaterThan(0);
  });
});
