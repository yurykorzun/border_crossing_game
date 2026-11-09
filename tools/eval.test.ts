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
  it('exits 1 with seed and step when a rule breaks (the Ilya line, not marked known)', () => {
    const r = evalCli(['--seed', String(MARK), '--seeds', '3', '--no-known']);
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toMatch(/rule 1: honest seed 61 step 0 \(mark, msg\.0\.1\): names cousin: "Mother: Don't mention Ilya/);
    expect(r.stdout).toContain('eval: FAIL');
    expect(r.files).toHaveLength(12);
  }, 30_000);

  it('exits 0 when the only failures are the known ones', () => {
    const r = evalCli(['--seed', String(MARK), '--seeds', '3']);
    expect(r.status, r.stdout).toBe(0);
    expect(r.stdout).toMatch(/known rule 1/);
    expect(r.stdout).toContain('eval: PASS');
  }, 30_000);

  it('refuses a bad flag with exit 2', () => {
    expect(evalCli(['--seeds', '0']).status).toBe(2);
  }, 30_000);
});
