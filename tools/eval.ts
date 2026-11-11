// Plays the autoplay bots over many seeds and checks every run's transcript
// against the story rules in src/game/transcript.ts. Exits 1 on any failure no
// known entry covers, on a known entry that no longer happens, or on a
// whole-eval check that is not ok (rule 4 only reports the median full run;
// rules 7-9 check balance shares once every style has 100 runs, rule 10 the
// memorised script's homeInTime once it has 100 runs, rules 11-12 that packing
// and hours left change the best play, also from 100 runs per style).
// `npm run eval -- [--seeds 200] [--seed 0] [--level arrival] [--no-known] [--min-minutes 4.5] [--out dir]`
//
// Every level in turn (LEVEL_IDS in src/game/content/levels.ts), or only --level,
// each judged by the same rules. Any level failing fails the command.
//
// Run i uses setupFor(seed + i), like `npm run autoplay`, so a failure's
// "seed N" is setupFor(N - 1). Also writes 3 transcripts per style to eval-out/
// as plain text, for reading, named <level>-<style>-seed<n>.txt.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOT_STYLES, firstPassScript, playRun, playScript, setupFor, timedChoices } from '../src/game/bots';
import type { BotStyle } from '../src/game/bots';
import { HOURS_RULE, KNOWN_FAILURES, MEMORISED_RULE, PACKING_RULE, PLAY_MINUTES, RULES, evaluate, formatFailure, formatSummary, hoursSummary, memorisedSummary, packingOf, packingSummary, playTimeRule, transcriptOf, transcriptText } from '../src/game/transcript';
import type { PackingResult, Summary, TimedPick, Transcript } from '../src/game/transcript';
import { LEVELS, LEVEL_IDS, isLevelId } from '../src/game/content/levels';
import type { LevelId } from '../src/game/types';

/**
 * Every bot style `npm run autoplay` plays, so rule 9's share of runs with an
 * inspection across all styles is the number autoplay prints.
 */
const STYLES: readonly BotStyle[] = BOT_STYLES;
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

const levelAt = process.argv.indexOf('--level');
const ONLY = levelAt < 0 ? undefined : process.argv[levelAt + 1];
if (ONLY !== undefined && !isLevelId(ONLY)) {
  console.error(`--level needs one of: ${LEVEL_IDS.join(', ')}`);
  process.exit(2);
}
const PLAYED: LevelId[] = ONLY === undefined ? LEVEL_IDS : [ONLY];

if (outAt < 0) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
let written = 0;
let exitCode = 0;

for (const level of PLAYED) {
  const transcripts: Transcript[] = [];
  const packings: PackingResult[] = [];
  const timed: TimedPick[] = [];
  for (const style of STYLES)
    for (let i = 0; i < SEEDS; i++) {
      const setup = setupFor(START + i, level);
      const run = playRun(style, setup);
      transcripts.push(transcriptOf(run, setup));
      const home = run.final.ending === 'homeInTime';
      packings.push({ style, packing: packingOf(setup), home });
      for (const c of timedChoices(run, setup)) timed.push({ ...c, home });
    }

  for (const style of STYLES)
    for (const tr of transcripts.filter((x) => x.style === style).slice(0, SAMPLES_PER_STYLE)) {
      writeFileSync(join(OUT, `${level}-${style}-seed${tr.setup.seed}.txt`), transcriptText(tr));
      written++;
    }

  // A known entry with no level is Arrival's, from before levels existed.
  const r = evaluate(transcripts, known.filter((k) => (k.level ?? 'arrival') === level), rules);
  console.log(`eval: level ${LEVELS[level].number} ${level}, ${SEEDS} seeds x ${STYLES.length} styles (${STYLES.join(', ')}) = ${r.runs} runs`);
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
  // Rule 10, the memorised script (see tools/autoplay.ts): played here, judged by memorisedSummary().
  const script = firstPassScript(SEEDS, START, level);
  let memorisedHome = 0;
  for (let i = 0; i < SEEDS; i++) if (playScript(script, setupFor(START + i, level)).final.ending === 'homeInTime') memorisedHome++;
  // Rules 11 and 12 read the same style runs as the rules above, by packing and by hours left at each card.
  const whole: [{ id: number; name: string }, Summary][] = [
    [MEMORISED_RULE, memorisedSummary(memorisedHome, SEEDS)],
    [PACKING_RULE, packingSummary(packings)],
    [HOURS_RULE, hoursSummary(timed, SEEDS)],
  ];
  for (const [rule, x] of whole) {
    console.log(`  ${(x.ok ? 'ok' : 'FAIL').padEnd(6)}rule ${rule.id}: ${rule.name}`);
    console.log(`        ${x.ok ? '' : 'FAIL '}${formatSummary(x)}`);
  }
  if (r.exitCode || whole.some(([, x]) => !x.ok)) exitCode = 1;
  if (r.fresh.length) {
    console.log(`\n${r.fresh.length} failures${r.fresh.length > SHOW ? `, first ${SHOW}` : ''}:`);
    for (const f of r.fresh.slice(0, SHOW)) console.log(`  ${formatFailure(f)}`);
  }
  console.log('');
}
console.log(`${written} transcripts in ${OUT}/`);
console.log(exitCode ? 'eval: FAIL' : 'eval: PASS');
process.exit(exitCode);
