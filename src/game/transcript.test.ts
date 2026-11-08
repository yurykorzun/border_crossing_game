// The story rules on one transcript at a time, each broken on purpose.
// tools/eval.test.ts runs the real command.
import { describe, expect, it } from 'vitest';
import { playRun, setupFor } from './bots';
import { RULES, evaluate, formatFailure, transcriptOf } from './transcript';
import type { KnownFailure, Transcript } from './transcript';

// setupFor() cycles Lena's setups first, then Mark's; 60 is Mark's first.
const LENA = 4;
const MARK = 60;

function run(i: number, style: 'honest' | 'liar' = 'honest'): Transcript {
  const setup = setupFor(i);
  return transcriptOf(playRun(style, setup), setup);
}

/** Evaluates one rule only, so the other rules' findings don't decide the exit code. */
const only = (id: number, trs: Transcript[], known: KnownFailure[] = []) =>
  evaluate(trs, known, RULES.filter((r) => r.id === id));

describe('scenario evals', () => {
  it('the clean runs pass rules 1, 2, 3 and 5', () => {
    const trs = [run(LENA), run(LENA, 'liar'), run(LENA + 1)];
    for (const id of [1, 2, 3, 5]) expect(only(id, trs).exitCode, `rule ${id}`).toBe(0);
  });

  it('rule 1: a line naming someone else\'s contact exits 1 with seed and step', () => {
    const tr = run(LENA);
    tr.lines.push({ step: 7, key: 'msg.test', text: 'Mother: Say hi to Tom for me.' });
    const r = only(1, [tr]);
    expect(r.exitCode).toBe(1);
    expect(r.fresh.map(formatFailure)).toEqual([
      `rule 1: honest seed ${LENA + 1} step 7 (lena, msg.test): names brother: "Mother: Say hi to Tom for me."`,
    ]);
  });

  it('rule 1: the picker shows both travelers without failing either', () => {
    const tr = run(MARK);
    expect(tr.lines.some((l) => l.who === 'lena')).toBe(true);
    // Mark's real run fails only on the shared msg.0.1, the Ilya line.
    expect(only(1, [tr]).fresh.map((f) => f.key)).toEqual(['msg.0.1']);
  });

  it('rule 2: a follow-up nobody queued exits 1 with seed and step', () => {
    const tr = run(LENA);
    tr.happenings.push({ step: 9, type: 'cardDealt', id: 'f_lab', claims: [], facts: [] });
    const r = only(2, [tr]);
    expect(r.exitCode).toBe(1);
    expect(formatFailure(r.fresh[0])).toMatch(new RegExp(`^rule 2: honest seed ${LENA + 1} step 9 \\(lena, f_lab\\)`));
  });

  it('rule 2: a follow-up after its check result passes', () => {
    const tr = run(LENA);
    tr.happenings.push(
      { step: 3, type: 'checkStarted', id: 'medicineLab' },
      { step: 4, type: 'checkResolved', id: 'medicineLab', result: 'lab' },
      { step: 5, type: 'cardDealt', id: 'f_lab', claims: [], facts: [] },
    );
    expect(only(2, [tr]).exitCode).toBe(0);
  });

  it('rule 3: a contradiction card with nothing to contradict exits 1 with seed and step', () => {
    const tr = run(LENA);
    tr.happenings.push({ step: 12, type: 'cardDealt', id: 'i_contradiction', claims: ['tourism'], facts: ['employer'] });
    const r = only(3, [tr]);
    expect(r.exitCode).toBe(1);
    expect(formatFailure(r.fresh[0])).toBe(
      `rule 3: honest seed ${LENA + 1} step 12 (lena, i_contradiction): dealt with claims [tourism] and facts [employer]`,
    );
  });

  it('rule 4: a run far over 8 minutes exits 1 with seed and step', () => {
    const tr = run(LENA);
    const short: KnownFailure[] = [{ rule: 4, key: 'tooShort', bead: 'test' }];
    const before = only(4, [tr], short);
    tr.beatSeconds += 600;
    const after = only(4, [tr], short);
    expect(after.exitCode).toBe(1);
    expect(after.fresh).toHaveLength(1);
    expect(after.fresh[0]).toMatchObject({ rule: 4, seed: LENA + 1, key: 'tooLong' });
    expect(formatFailure(after.fresh[0])).toMatch(/step \d+ /);
    // Before the extra beats the run was short (covered) or in range: either way it passed.
    expect(before.fresh).toEqual([]);
  });

  it('rule 5: a missing key or an unfilled {var} exits 1 with seed and step', () => {
    const tr = run(LENA);
    const r0 = only(5, [tr]);
    expect(r0.exitCode).toBe(0);
    tr.lines.push({ step: 3, key: 'enc.nope.q', text: '[enc.nope.q]', problem: 'missing text: enc.nope.q' });
    const r = only(5, [tr]);
    expect(r.exitCode).toBe(1);
    expect(formatFailure(r.fresh[0])).toBe(`rule 5: honest seed ${LENA + 1} step 3 (lena, enc.nope.q): missing text: enc.nope.q`);
  });

  it('a known entry covers its failures, and a stale one exits 1', () => {
    const mark = run(MARK);
    const entry: KnownFailure = { rule: 1, key: 'msg.0.1', character: 'mark', bead: 'test' };
    expect(only(1, [mark], [entry]).exitCode).toBe(0);
    // Lena's runs never show it, so the same entry is stale there.
    const lena = only(1, [run(LENA)], [entry]);
    expect(lena.fresh).toEqual([]);
    expect(lena.exitCode).toBe(1);
  });
});
