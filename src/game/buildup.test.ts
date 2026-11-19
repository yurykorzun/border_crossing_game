// Inspections build up and end in one of three ways (border_crossing_game-dap.17).
// The card reminds you of a claim on file it may touch, the answer that lets it run
// shows two or three progression lines, and it ends clear, explained or found.
// The sweep part plays what `npm run sweep` plays (tools/sweep.ts: every setup of
// every level, seeds 1-200, every bot style) until each inspection has reached each
// of its three results, and checks the reminder on every inspection card it passes.
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { own, t } from '../i18n';
import { BOT_STYLES, playRun } from './bots';
import { INSPECTIONS } from './content/encounters';
import { LEVEL_IDS } from './content/levels';
import { inspectionResult, newRun, optionFor, remindLine, step } from './engine';
import { allSetups } from './walk';
import type { InspectionResult, RunState } from './types';

const RESULTS: readonly InspectionResult[] = ['clear', 'explained', 'found'];

describe('every inspection has a reminder, 2-3 progression lines and three results', () => {
  for (const insp of INSPECTIONS) {
    describe(insp.id, () => {
      it('reminds you of a claim, named by its label', () => {
        expect(insp.remind.length).toBeGreaterThan(0);
        const key = `insp.${insp.id}.remind`;
        expect(en[key], key).toContain('{claim}');
        for (const claim of insp.remind) {
          const label = t(`claim.${claim}`);
          expect(t(key, { claim: own(`claim.${claim}`, 'lena').slice('claim.'.length) })).toContain(label);
        }
      });

      it('has 2 or 3 progression lines in en.ts, and no more', () => {
        expect([2, 3]).toContain(insp.steps);
        for (let n = 1; n <= insp.steps; n++) expect(en[`insp.${insp.id}.step.${n}`], `step ${n}`).toBeTruthy();
        expect(en[`insp.${insp.id}.step.${insp.steps + 1}`]).toBeUndefined();
      });

      it('ends in one of three results, each with its line, and one answer lets it run', () => {
        expect(insp.results.map((r) => r.result).sort()).toEqual([...RESULTS].sort());
        expect(insp.results.at(-1)?.when).toBeUndefined();
        for (const r of RESULTS) expect(en[`insp.${insp.id}.result.${r}`], r).toBeTruthy();
        expect(insp.approaches.filter((a) => a.runs).length).toBe(1);
      });
    });
  }
});

describe('across the sweep runs', () => {
  it('each inspection reaches each of its three results, and every inspection card names a claim on file', () => {
    const want = new Set(INSPECTIONS.flatMap((i) => RESULTS.map((r) => `${i.id}:${r}`)));
    const reached = new Set<string>();
    let cards = 0;
    const unnamed: string[] = [];
    const onCard = (s: RunState) => {
      if (s.screen.kind !== 'inspection' || s.reaction || s.documentList) return;
      cards++;
      const line = remindLine(s);
      const claim = line?.vars?.claim.split('.')[0];
      if (!line || !claim || !s.claims.includes(claim as never)) unnamed.push(`${s.screen.id} with ${s.claims.join(', ') || 'no claims'}`);
    };
    // The sweep's order: level, setup, seed, style. It stops once every result is reached.
    sweep: for (const level of LEVEL_IDS)
      for (const base of allSetups(level))
        for (let seed = 1; seed <= 200; seed++)
          for (const style of BOT_STYLES) {
            const setup = { ...base, seed };
            let s = newRun(setup);
            for (const action of playRun(style, setup).actions) {
              onCard(s);
              if (action.type === 'choose' && s.screen.kind === 'inspection' && optionFor(s, action)?.approach.runs)
                reached.add(`${s.screen.id}:${inspectionResult(s)}`);
              s = step(s, action);
            }
            if (reached.size === want.size) break sweep;
          }
    expect([...want].filter((w) => !reached.has(w))).toEqual([]);
    expect(cards).toBeGreaterThan(100);
    expect(unnamed).toEqual([]);
  }, 300_000);
});

describe('the build-up on screen', () => {
  // The first sweep run that lets an inspection run: its reaction reads in that order.
  it('shows the progression before the reaction and the result after it', () => {
    for (const level of LEVEL_IDS)
      for (const base of allSetups(level))
        for (let seed = 1; seed <= 20; seed++)
          for (const style of BOT_STYLES) {
            const setup = { ...base, seed };
            let s = newRun(setup);
            for (const action of playRun(style, setup).actions) {
              const opt = action.type === 'choose' && s.screen.kind === 'inspection' ? optionFor(s, action) : undefined;
              const id = s.screen.kind === 'inspection' ? s.screen.id : '';
              const result = opt?.approach.runs ? inspectionResult(s) : undefined;
              s = step(s, action);
              if (!opt || !result) continue;
              const insp = INSPECTIONS.find((i) => i.id === id)!;
              const keys = (s.reaction ?? []).map((r) => r.key);
              const steps = Array.from({ length: insp.steps }, (_, i) => `insp.${id}.step.${i + 1}`);
              expect(keys.slice(0, insp.steps)).toEqual(steps);
              expect(keys[insp.steps]).toMatch(new RegExp(`^insp\\.${id}\\.${opt.approach.id}\\.`));
              expect(keys[insp.steps + 1]).toBe(`insp.${id}.result.${result}`);
              return;
            }
          }
    throw new Error('no run let an inspection run');
  });
});
