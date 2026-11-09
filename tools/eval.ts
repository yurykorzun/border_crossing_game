// Plays the autoplay bots over many seeds and checks every run's transcript
// against the story rules in src/game/transcript.ts. Exits 1 on any failure no
// known entry covers, on a known entry that no longer happens, or on a
// whole-eval check (rule 4: the median full run under 5 minutes).
// `npm run eval -- [--seeds 200] [--seed 0] [--no-known] [--min-minutes 4.5] [--out dir]`
//
// Run i uses setupFor(seed + i), like `npm run autoplay`, so a failure's
// "seed N" is setupFor(N - 1). Also writes 3 transcripts per style to eval-out/
// as plain text, for reading.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { playRun, setupFor } from '../src/game/bots';
import type { BotStyle } from '../src/game/bots';
import { KNOWN_FAILURES, PLAY_MINUTES, RULES, evaluate, formatFailure, formatSummary, playTimeRule, transcriptOf, transcriptText } from '../src/game/transcript';
import type { Transcript } from '../src/game/transcript';

/**
 * The four player styles the plan asks for (4 styles, 12 sample transcripts).
 * The situational bot is the balance probe for `npm run autoplay`; adding it
 * here is one more entry.
 */
const STYLES: BotStyle[] = ['honest', 'liar', 'cautious', 'random'];
const SAMPLES_PER_STYLE = 3;
const SHOW = 20;

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const n = Number(process.argv[i + 1]);
  // --min-minutes can be a fraction (the floor is 4.5); seeds are whole numbers.
  const ok = name === 'min-minutes' ? Number.isFinite(n) && n >= 0 : Number.isInteger(n);
  if (!ok || (name === 'seeds' && n < 1)) {
    console.error(`--${name} needs a ${name === 'min-minutes' ? 'number of minutes' : 'whole number'}${name === 'seeds' ? ' above 0' : ''}`);
    process.exit(2);
  }
  return n;
}

const SEEDS = flag('seeds', 200);
const START = flag('seed', 0);
const known = process.argv.includes('--no-known') ? [] : KNOWN_FAILURES;
// Tries another per-run floor for rule 4, to see how many runs a longer floor would fail.
const MIN_MINUTES = flag('min-minutes', PLAY_MINUTES.floor);
const rules = RULES.map((rule) => (rule.id === 4 ? playTimeRule({ ...PLAY_MINUTES, floor: MIN_MINUTES }) : rule));
// eval-out/ is ours, so it is cleared first; a directory named with --out (tests use one) is only added to.
const outAt = process.argv.indexOf('--out');
const OUT = outAt < 0 ? 'eval-out' : process.argv[outAt + 1];
if (!OUT) {
  console.error('--out needs a directory');
  process.exit(2);
}

const transcripts: Transcript[] = [];
for (const style of STYLES)
  for (let i = 0; i < SEEDS; i++) {
    const setup = setupFor(START + i);
    transcripts.push(transcriptOf(playRun(style, setup), setup));
  }

if (outAt < 0) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let written = 0;
for (const style of STYLES)
  for (const tr of transcripts.filter((x) => x.style === style).slice(0, SAMPLES_PER_STYLE)) {
    writeFileSync(join(OUT, `${style}-seed${tr.setup.seed}.txt`), transcriptText(tr));
    written++;
  }

const r = evaluate(transcripts, known, rules);
console.log(`eval: ${SEEDS} seeds x ${STYLES.length} styles (${STYLES.join(', ')}) = ${r.runs} runs`);
for (const rule of rules) {
  const all = r.byRule.get(rule.id)!;
  const fresh = r.fresh.filter((f) => f.rule === rule.id).length;
  const runs = new Set(all.map((f) => `${f.style}:${f.seed}`)).size;
  const sums = r.summaries.filter((x) => x.rule === rule.id);
  const verdict = fresh || sums.some((x) => !x.ok) ? 'FAIL' : all.length ? 'known' : 'ok';
  console.log(`  ${verdict.padEnd(6)}rule ${rule.id}: ${rule.name}${all.length ? ` (${all.length} failures in ${runs} runs)` : ''}`);
  for (const x of sums) console.log(`        ${x.ok ? '' : 'FAIL '}${formatSummary(x)}`);
}
for (const k of r.known)
  console.log(k.count
    ? `  known: rule ${k.entry.rule} ${k.entry.key}${k.entry.character ? ` (${k.entry.character})` : ''}, ${k.count} failures, fixed by ${k.entry.bead}`
    : `  STALE known entry: rule ${k.entry.rule} ${k.entry.key} no longer fails; remove it (${k.entry.bead})`);
if (r.fresh.length) {
  console.log(`\n${r.fresh.length} failures${r.fresh.length > SHOW ? `, first ${SHOW}` : ''}:`);
  for (const f of r.fresh.slice(0, SHOW)) console.log(`  ${formatFailure(f)}`);
}
console.log(`\n${written} transcripts in ${OUT}/`);
console.log(r.exitCode ? 'eval: FAIL' : 'eval: PASS');
process.exit(r.exitCode);
