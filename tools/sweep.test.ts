// Runs tools/sweep.ts: every Arrival and The funeral setup over seeds 1-200 with every bot style,
// and no run over rule 4's 8 minutes (border_crossing_game-rwf.15). The eval's
// 200 seeds play one seed per setup, so they missed runs of up to 9 minutes.
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { describe, expect, it } from 'vitest';

// Half the cores at most, so the other test files running beside it keep their time limits.
// SWEEP_ALONE=1 says nothing runs beside it (the deploy's own sweep job in
// .github/workflows/pages.yml), so it takes every core.
const cores = availableParallelism();
const jobs = process.env.SWEEP_ALONE === '1' ? Math.max(2, cores) : Math.max(2, Math.min(4, Math.floor(cores / 2)));
const sweep = (args: string[]) => spawnSync('npx', ['tsx', 'tools/sweep.ts', ...args], { encoding: 'utf8' });

describe('npx tsx tools/sweep.ts', () => {
  it('finds no Arrival run over 8 minutes on any setup, seed 1-200 or style', () => {
    const r = sweep(['--level', 'arrival', '--seeds', '200', '--jobs', String(jobs)]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    // 105 setups (every character x packing x bulletin) x 200 seeds x 5 styles.
    expect(r.stdout).toContain('= 105000 runs');
    expect(r.stdout).toMatch(/longest [\d.]+ of 8 min/);
    expect(r.stdout).toContain('sweep: PASS');
  }, 300_000);

  it('finds no run of The funeral over 8 minutes on any setup, statement, seed 1-200 or style', () => {
    const r = sweep(['--level', 'funeral', '--seeds', '200', '--jobs', String(jobs)]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    // 105 setups x her sister's 2 statements x 200 seeds x 5 styles (border_crossing_game-rwf.4).
    expect(r.stdout).toContain('= 210000 runs');
    expect(r.stdout).toContain('sweep: PASS');
  }, 600_000);

  it('exits 1 and names the runs over a lower ceiling', () => {
    const r = sweep(['--seeds', '1', '--jobs', '2', '--max', '5']);
    expect(r.status, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/over: [\d.]+ min, \w+ seed 1 (lena|mark) /);
    expect(r.stdout).toMatch(/sweep: FAIL, \d+ runs over 5 min/);
  }, 60_000);

  it('refuses a bad flag with exit 2', () => {
    expect(sweep(['--level', 'nowhere']).status).toBe(2);
    expect(sweep(['--max', '0']).status).toBe(2);
  }, 60_000);
});
