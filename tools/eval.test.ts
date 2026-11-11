// Runs `npm run eval` itself (tools/eval.ts) and checks its exit code and output.
// The rules one by one are in src/game/transcript.test.ts.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIN_TIMED_PICKS, hoursSummary, packingSummary } from '../src/game/transcript';
import type { PackingResult, TimedPick } from '../src/game/transcript';

// setupFor() cycles Lena's setups first; 60 is Mark's first, so its run seed is 61.
const MARK = 60;

function evalCli(args: string[]) {
  const out = mkdtempSync(join(tmpdir(), 'eval-'));
  try {
    const r = spawnSync('npx', ['tsx', 'tools/eval.ts', ...args, '--out', out], { encoding: 'utf8' });
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, files: readdirSync(out) };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe('npm run eval', () => {
  it('exits 1 with seed and step when a rule breaks (a short run against a 6-minute floor)', () => {
    // Lena's cautious run on seed 6 estimates about 4.6 minutes (measured 2026-11-10, with every desk's core cards dealt).
    const r = evalCli(['--seed', '4', '--seeds', '3', '--min-minutes', '6']);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toMatch(/rule 4: cautious seed 6 step \d+ \(lena, tooShort\)/);
    expect(r.stdout).toContain('eval: FAIL');
    // 3 transcripts for each of the 5 bot styles.
    expect(r.files).toHaveLength(15);
  }, 30_000);

  it('exits 0 when no rule breaks', () => {
    const r = evalCli(['--seed', String(MARK), '--seeds', '3']);
    expect(r.status, r.stdout).toBe(0);
    // Mark's first queue names Tom, not Lena's cousin Ilya (fixed in border_crossing_game-67a.6).
    expect(r.stdout).toMatch(/ok {4}rule 1/);
    expect(r.stdout).toContain('eval: PASS');
    // 3 seeds say nothing about a share, so the balance rules report and do not decide.
    expect(r.stdout).toMatch(/rule 7: honest homeInTime [\d.]+% of 3 runs \(not checked/);
    expect(r.stdout).toMatch(/rule 10: memorised homeInTime [\d.]+% of 3 runs \(not checked/);
    expect(r.stdout).toMatch(/rule 11: .*\(not checked: 3 runs per style/);
    expect(r.stdout).toMatch(/rule 12: .*\(not checked: 3 runs per style/);
  }, 30_000);

  it('checks the balance shares and the memorised script on the default 200 seeds', () => {
    const r = evalCli([]);
    expect(r.status, r.stdout).toBe(0);
    for (const id of [7, 8, 9, 10, 11, 12]) expect(r.stdout).toMatch(new RegExp(`ok {4}rule ${id}:`));
    expect(r.stdout).toMatch(/rule 11: best style differs across 35 packings .*every packing home in time at least once\n/);
    expect(r.stdout).toMatch(/rule 12: best answer changes with hours left on [1-9]\d* of \d+ cards \(/);
    expect(r.stdout).toMatch(/rule 9: runs with an inspection [\d.]+% of 1000 runs\n/);
    expect(r.stdout).toMatch(/rule 10: memorised homeInTime [\d.]+% of 200 runs\n/);
  }, 60_000);

  it('refuses a bad flag with exit 2', () => {
    expect(evalCli(['--seeds', '0']).status).toBe(2);
  }, 30_000);
});

/** `n` made-up runs per style: `home(style, i)` says whether run i got home in time. */
function packingRuns(packings: string[], home: (style: string, packing: string, i: number) => boolean, n = 100): PackingResult[] {
  const out: PackingResult[] = [];
  for (const style of ['honest', 'liar'])
    for (let i = 0; i < n; i++) {
      const packing = packings[i % packings.length];
      out.push({ style, packing, home: home(style, packing, i) });
    }
  return out;
}

describe('rule 11: packings need different strategies', () => {
  it('passes when two packings have different best styles and every packing wins once', () => {
    const x = packingSummary(packingRuns(['a', 'b'], (style, packing) => (packing === 'a') === (style === 'honest')));
    expect(x).toMatchObject({ rule: 11, ok: true });
    expect(x.text).toBe('best style differs across 2 packings (best in: honest 1, liar 1; ties count for each), every packing home in time at least once');
  });

  it('fails when one style is best for every packing', () => {
    const x = packingSummary(packingRuns(['a', 'b'], (style, _p, i) => style === 'honest' || i % 4 === 0));
    expect(x).toMatchObject({ rule: 11, ok: false });
    expect(x.text).toMatch(/^best style never differs across 2 packings \(best in: honest 2;/);
  });

  it('fails when a tie leaves every packing sharing a best style', () => {
    expect(packingSummary(packingRuns(['a', 'b'], (style, packing) => style === 'honest' || packing === 'b')).ok).toBe(false);
  });

  it('fails when a packing never gets home in time, even though best styles differ', () => {
    const x = packingSummary(packingRuns(['a', 'b', 'c'], (style, packing) => packing !== 'c' && (packing === 'a') === (style === 'honest')));
    expect(x).toMatchObject({ rule: 11, ok: false });
    expect(x.text).toMatch(/never home in time: c$/);
  });

  it('does not decide with fewer than 100 runs per style', () => {
    const x = packingSummary(packingRuns(['a', 'b'], (style) => style === 'honest', 99));
    expect(x.ok).toBe(true);
    expect(x.text).toMatch(/\(not checked: 99 runs per style, needs 100\)$/);
  });
});

/** `n` made-up picks on one card at `hours`, `won` of them in runs that got home in time. */
function picks(card: string, pick: string, hours: number, won: number, n = MIN_TIMED_PICKS): TimedPick[] {
  return Array.from({ length: n }, (_, i) => ({ card, pick, hours, home: i < won }));
}

describe('rule 12: hours left change the best choice', () => {
  // With many hours counting the cash wins; with few, showing the receipt does.
  const turning = [...picks('c_cash', 'count', 6, 18), ...picks('c_cash', 'evidence', 6, 10),
    ...picks('c_cash', 'count', 2, 5), ...picks('c_cash', 'evidence', 2, 12)];

  it('passes when a card has a different best answer with many and few hours left', () => {
    const x = hoursSummary(turning, 200);
    expect(x).toMatchObject({ rule: 12, ok: true });
    expect(x.text).toBe('best answer changes with hours left on 1 of 1 cards (c_cash: count with more than 2 h, evidence with 2 h or less)');
  });

  it('fails when every card has the same best answer however many hours are left', () => {
    const same = [...picks('c_cash', 'count', 6, 18), ...picks('c_cash', 'evidence', 6, 10),
      ...picks('c_cash', 'count', 2, 12), ...picks('c_cash', 'evidence', 2, 5)];
    expect(hoursSummary(same, 200)).toMatchObject({ rule: 12, ok: false, text: 'best answer changes with hours left on 0 of 1 cards' });
  });

  it('fails when the answer that turns was picked too rarely to count', () => {
    const rare = [...picks('c_cash', 'count', 6, 18), ...picks('c_cash', 'count', 2, 5),
      ...picks('c_cash', 'evidence', 2, MIN_TIMED_PICKS - 2, MIN_TIMED_PICKS - 1)];
    expect(hoursSummary(rare, 200).ok).toBe(false);
  });

  it('does not decide with fewer than 100 runs per style', () => {
    expect(hoursSummary([], 3)).toMatchObject({ ok: true, text: 'best answer changes with hours left on 0 of 0 cards (not checked: 3 runs per style, needs 100)' });
  });
});
