// The story rules on one transcript at a time, each broken on purpose.
// tools/eval.test.ts runs the real command.
import { describe, expect, it } from 'vitest';
import appSource from '../App.tsx?raw';
import partsSource from '../ui/parts.tsx?raw';
import { playRun, setupFor } from './bots';
import type { BotStyle } from './bots';
import { INSPECTIONS } from './content/encounters';
import { BALANCE, KNOWN_FAILURES, PLAY_MINUTES, RULES, evaluate, formatFailure, formatSummary, playMinutes, playTimeRule, transcriptOf } from './transcript';
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
    expect(only(1, [tr]).fresh).toEqual([]);
  });

  it('rule 1: each traveler\'s first queue names their own protected contact', () => {
    const lena = run(LENA);
    const mark = run(MARK);
    expect(lena.lines.find((l) => l.key === 'msg.0.1.lena')?.text).toContain('Ilya');
    expect(lena.lines.some((l) => l.key === 'msg.0.1.mark')).toBe(false);
    expect(mark.lines.find((l) => l.key === 'msg.0.1.mark')?.text).toContain('Tom');
    expect(mark.lines.some((l) => /Ilya/.test(l.text))).toBe(false);
  });

  it('rule 2: a follow-up nobody queued exits 1 with seed and step', () => {
    const tr = run(LENA);
    tr.happenings.push({ step: 9, type: 'cardDealt', id: 'f_lab', claims: [], facts: [], routinesLeft: [] });
    const r = only(2, [tr]);
    expect(r.exitCode).toBe(1);
    expect(formatFailure(r.fresh[0])).toMatch(new RegExp(`^rule 2: honest seed ${LENA + 1} step 9 \\(lena, f_lab\\)`));
  });

  it('rule 2: a follow-up after its check result passes', () => {
    const tr = run(LENA);
    tr.happenings.push(
      { step: 3, type: 'checkStarted', id: 'medicineLab' },
      { step: 4, type: 'checkResolved', id: 'medicineLab', result: 'lab' },
      { step: 5, type: 'cardDealt', id: 'f_lab', claims: [], facts: [], routinesLeft: [] },
    );
    expect(only(2, [tr]).exitCode).toBe(0);
  });

  it('rule 3: a contradiction card with nothing to contradict exits 1 with seed and step', () => {
    const tr = run(LENA);
    tr.happenings.push({ step: 12, type: 'cardDealt', id: 'i_contradiction', claims: ['tourism'], facts: ['employer'], routinesLeft: [] });
    const r = only(3, [tr]);
    expect(r.exitCode).toBe(1);
    expect(formatFailure(r.fresh[0])).toBe(
      `rule 3: honest seed ${LENA + 1} step 12 (lena, i_contradiction): dealt with claims [tourism] and facts [employer]`,
    );
  });

  it('rule 6: a third escalating card in a row while a routine card is left exits 1 with seed and step', () => {
    const tr = run(LENA);
    const dealt = (step: number, id: string, routinesLeft: string[]) =>
      ({ step, type: 'cardDealt' as const, id, claims: [], facts: [], routinesLeft });
    tr.happenings = [dealt(1, 'c_medicine', ['c_cash']), dealt(2, 'f_lab', ['c_cash']), dealt(3, 's_bag', ['c_cash']), dealt(4, 'c_host', ['c_cash'])];
    const r = only(6, [tr]);
    expect(r.exitCode).toBe(1);
    expect(r.fresh.map(formatFailure)).toEqual([
      `rule 6: honest seed ${LENA + 1} step 4 (lena, c_host): escalating card 3 in a row with c_cash still to ask`,
    ]);
    // With no routine card left at the desk, the same run of cards passes, and a routine card breaks the row.
    tr.happenings[3] = dealt(4, 'c_host', []);
    expect(only(6, [tr]).exitCode).toBe(0);
    tr.happenings = [dealt(1, 'f_lab', ['c_cash']), dealt(2, 's_bag', ['c_cash']), dealt(3, 'c_cash', []), dealt(4, 'c_host', ['c_pen'])];
    expect(only(6, [tr]).exitCode).toBe(0);
  });

  it('rule 6: real runs keep the pacing rule', () => {
    const trs = [];
    for (let i = 0; i < 105; i++) trs.push(run(i), run(i, 'liar'));
    expect(only(6, trs).fresh).toEqual([]);
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

  it('rule 4: clean runs pass with no known entry, and no rule 4 entry is left', () => {
    const trs = [run(LENA), run(LENA, 'liar'), run(MARK), run(MARK, 'liar')];
    expect(only(4, trs).fresh).toEqual([]);
    expect(KNOWN_FAILURES.filter((k) => k.rule === 4)).toEqual([]);
  });

  it('rule 4: a run just under the 4-minute floor fails, one at the floor passes', () => {
    const tr = run(LENA);
    // Pad or trim with beats so the estimate lands exactly where we want it.
    const at = (minutes: number) => ({ ...tr, beatSeconds: tr.beatSeconds + (minutes - playMinutes(tr)) * 60 });
    expect(playMinutes(at(3.9))).toBeCloseTo(3.9);
    expect(only(4, [at(3.9)]).fresh[0]).toMatchObject({ rule: 4, key: 'tooShort' });
    expect(only(4, [at(4)]).fresh).toEqual([]);
  });

  it('rule 4: the median full run is reported, and a median under 5 minutes no longer fails', () => {
    const tr = run(LENA);
    const at = (minutes: number, ending = tr.ending) =>
      ({ ...tr, ending, beatSeconds: tr.beatSeconds + (minutes - playMinutes(tr)) * 60 });
    // Every run is within 4-8, and a median of 4.2 passes: only the floor and the ceiling decide.
    const below = only(4, [at(4.1), at(4.2), at(5.5)]);
    expect(below.fresh).toEqual([]);
    expect(below.exitCode).toBe(0);
    expect(below.summaries.map(formatSummary)).toEqual(['rule 4: median full run 4.2 min (aim 5, not checked), longest 5.50 of 8 (3 runs)']);
    // Even count: the median is the mean of the middle two (4.8 and 5.2 = 5).
    expect(only(4, [at(4.6), at(4.8), at(5.2), at(6)]).summaries.map(formatSummary)[0]).toContain('median full run 5.0 min');
    // A run you withdraw from does not count toward the median.
    const withdrawn = only(4, [at(4.6), at(5.5), at(1, 'turnedBack'), at(1, 'turnedBack')]);
    expect(withdrawn.exitCode).toBe(0);
    expect(withdrawn.summaries.map(formatSummary)).toEqual(['rule 4: median full run 5.0 min (aim 5, not checked), longest 5.50 of 8 (2 runs)']);
    // With only withdrawn runs there is no median to check.
    expect(only(4, [at(1, 'turnedBack')]).summaries).toEqual([]);
  });

  describe('rules 7-9: balance shares', () => {
    const base = run(LENA);
    const inspection = { step: 1, type: 'cardDealt' as const, id: INSPECTIONS[0].id, claims: [], facts: [], routinesLeft: [] };
    /** n runs of `style`, the first `hits` of them home in time (or, with `insp`, inspected). */
    const runs = (style: BotStyle, n: number, hits: number, insp = false): Transcript[] =>
      Array.from({ length: n }, (_, i) => ({
        ...base, style,
        ending: !insp && i < hits ? 'homeInTime' as const : 'tooLate' as const,
        happenings: insp && i < hits ? [inspection] : [],
      }));

    it('rule 7: honest under 50% fails, 50% passes', () => {
      expect(only(7, runs('honest', 100, 49)).exitCode).toBe(1);
      const ok = only(7, runs('honest', 100, 50));
      expect(ok.exitCode).toBe(0);
      expect(ok.summaries.map(formatSummary)).toEqual(['rule 7: honest homeInTime 50.0% of 100 runs']);
    });

    it('rule 8: liar over 80% fails, 80% passes', () => {
      expect(only(8, runs('liar', 100, 81)).exitCode).toBe(1);
      expect(only(8, runs('liar', 100, 80)).exitCode).toBe(0);
    });

    it('rule 9: inspections outside 25-33% of all runs fail', () => {
      const all = (hits: number) => [...runs('honest', 100, hits, true), ...runs('liar', 100, 0, true)];
      expect(only(9, all(48)).exitCode).toBe(1);
      expect(only(9, all(50)).exitCode).toBe(0);
      expect(only(9, all(66)).exitCode).toBe(0);
      expect(only(9, all(67)).exitCode).toBe(1);
    });

    it('a share over fewer than 100 runs per style is reported, not checked', () => {
      const few = only(7, runs('honest', 3, 0));
      expect(few.exitCode).toBe(0);
      expect(few.summaries.map(formatSummary)).toEqual(['rule 7: honest homeInTime 0.0% of 3 runs (not checked: 3 runs per style, needs 100)']);
      // Rule 9 counts the smallest style, so one short style keeps it unchecked.
      expect(only(9, [...runs('honest', 100, 0, true), ...runs('liar', 3, 0, true)]).exitCode).toBe(0);
    });

    it('the targets are the balance review numbers', () => {
      expect(BALANCE).toEqual({ honestHomeMin: 50, liarHomeMax: 80, inspected: { min: 25, max: 33 }, minRuns: 100 });
    });
  });

  it('rule 4: the default range is a 4 floor and 8 ceiling, with 5 minutes as the reported aim', () => {
    expect(PLAY_MINUTES).toEqual({ floor: 4, target: 5, max: 8 });
    expect(RULES.find((r) => r.id === 4)!.name).toBe(playTimeRule(PLAY_MINUTES).name);
  });

  it('rule 4: a short run fails, unless you withdrew from it', () => {
    const tr = run(LENA);
    tr.lines = tr.lines.map((l) => ({ ...l, text: '' }));
    tr.beatSeconds = 0;
    const r = only(4, [tr]);
    expect(r.exitCode).toBe(1);
    expect(r.fresh[0]).toMatchObject({ rule: 4, key: 'tooShort' });
    expect(only(4, [{ ...tr, ending: 'turnedBack' }]).exitCode).toBe(0);
    // A withdrawn run still has the 8-minute ceiling.
    expect(only(4, [{ ...tr, ending: 'turnedBack', beatSeconds: 600 }]).fresh[0]).toMatchObject({ key: 'tooLong' });
  });

  it('rule 4: the known tooShort entry covers only runs at or above its floor', () => {
    const tr = run(LENA);
    const short: KnownFailure[] = [{ rule: 4, key: 'tooShort', atLeastMinutes: 2.5, bead: 'test' }];
    // Strip the words so the estimate drops far below the floor.
    tr.lines = tr.lines.map((l) => ({ ...l, text: '' }));
    tr.beatSeconds = 0;
    const r = only(4, [tr], short);
    expect(r.exitCode).toBe(1);
    expect(r.fresh[0]).toMatchObject({ rule: 4, key: 'tooShort' });
    expect(r.fresh[0].minutes!).toBeLessThan(2.5);
  });

  it('rule 5 sees the top strip and sheets, and the ending after a last officer line', () => {
    let ended: Transcript | undefined;
    for (let i = 0; i < 200 && !ended; i++) {
      const setup = setupFor(i);
      const r = playRun('random', setup);
      const tr = transcriptOf(r, setup);
      const lastStep = r.actions.length;
      if (tr.lines.some((l) => l.step === lastStep + 1)) ended = tr;
    }
    expect(ended, 'some run ends on an officer line').toBeDefined();
    expect(ended!.lines.some((l) => l.key === `ending.${ended!.ending}.title`)).toBe(true);
    const tr = run(LENA);
    for (const key of ['ui.goal', 'ui.hoursLeft', 'ui.scrutinyCount', 'ui.progress', 'ui.myStory'])
      expect(tr.lines.some((l) => l.key === key && l.chrome), key).toBe(true);
  });

  it('rule 5: the UI renders no words outside t(), so the transcript can see them all', () => {
    // JSX text between tags, or a text attribute, with a word in it.
    const literal = />[^<>{}]*[A-Za-z]{2,}[^<>{}]*<\/|\b(title|alt|aria-label|placeholder)="[^"]*[A-Za-z]/;
    for (const [file, source] of [['src/App.tsx', appSource], ['src/ui/parts.tsx', partsSource]]) {
      const found = source.split('\n').filter((l) => literal.test(l));
      expect(found, file).toEqual([]);
    }
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
    mark.lines.push({ step: 2, key: 'msg.test', text: 'Mother: Say hi to Ilya for me.' });
    const entry: KnownFailure = { rule: 1, key: 'msg.test', character: 'mark', bead: 'test' };
    expect(only(1, [mark], [entry]).exitCode).toBe(0);
    // Lena's runs never show it, so the same entry is stale there.
    const lena = only(1, [run(LENA)], [entry]);
    expect(lena.fresh).toEqual([]);
    expect(lena.exitCode).toBe(1);
  });
});
