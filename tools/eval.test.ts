// Runs `npm run eval` itself (tools/eval.ts) and checks its exit code and output.
// The rules one by one are in src/game/transcript.test.ts.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
    // Lena's liar run on seed 5 estimates about 4.6 minutes (measured 2026-11-09, after the short packing screen).
    const r = evalCli(['--seed', '4', '--seeds', '3', '--min-minutes', '6']);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toMatch(/rule 4: liar seed 5 step \d+ \(lena, tooShort\)/);
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
    expect(r.stdout).toMatch(/report: memorised homeInTime [\d.]+% of 3 runs \(not checked\)/);
  }, 30_000);

  it('checks the balance shares on the default 200 seeds and prints the memorised rate without failing on it', () => {
    const r = evalCli([]);
    expect(r.status, r.stdout).toBe(0);
    for (const id of [7, 8, 9]) expect(r.stdout).toMatch(new RegExp(`ok {4}rule ${id}:`));
    expect(r.stdout).toMatch(/rule 9: runs with an inspection [\d.]+% of 1000 runs\n/);
    expect(r.stdout).toMatch(/report: memorised homeInTime [\d.]+% of 200 runs \(not checked\)/);
  }, 60_000);

  it('refuses a bad flag with exit 2', () => {
    expect(evalCli(['--seeds', '0']).status).toBe(2);
  }, 30_000);
});
