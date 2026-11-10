// Prints what the full walk found. `npm run walk -- [--level arrival] [--ignore <rule>]`.
// "guaranteed" is the best ending a player can force whatever the dealer deals;
// "lucky" is the best ending with the kindest deal. Ending shares count
// branches, not players, so they are a smell, not a balance verdict.
//
// Every level in turn (LEVEL_IDS in src/game/content/levels.ts), or only --level.
// Each level's rules are then played by bots that ignore them (ruleShares() in
// src/game/bots.ts): a rule earns its place when ignoring it gets home in time
// less often. --ignore <rule> plays only that rule, in the level that has it.
import { writeFileSync } from 'node:fs';
import { ENDING_RANK, allSetups, neverPicked, walk, warningShares } from '../src/game/walk';
import { PICKING_STYLES, WALK_SEEDS, pickedAnswers, ruleOf, ruleShares } from '../src/game/bots';
import { BULLETIN_TOPICS } from '../src/game/content/world';
import { LEVELS, LEVEL_IDS, isLevelId } from '../src/game/content/levels';
import type { SetupResult } from '../src/game/walk';
import type { EndingId, LevelId, LevelRule } from '../src/game/types';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) {
    console.error(`--${name} needs a value`);
    process.exit(2);
  }
  return v;
}

const onlyLevel = arg('level');
if (onlyLevel !== undefined && !isLevelId(onlyLevel)) {
  console.error(`--level needs one of: ${LEVEL_IDS.join(', ')}`);
  process.exit(2);
}
const ignore = arg('ignore');
const withRule = (id: string) => LEVEL_IDS.filter((l) => ruleOf(LEVELS[l], id));
if (ignore !== undefined) {
  const where = withRule(ignore).filter((l) => onlyLevel === undefined || l === onlyLevel);
  if (!where.length) {
    const named = LEVEL_IDS.flatMap((l) => LEVELS[l].rules.map((r) => `${r.id} (${l})`));
    console.error(`no level${onlyLevel ? ` ${onlyLevel}` : ''} has a rule called ${ignore}. Rules: ${named.length ? named.join(', ') : 'none yet'}`);
    process.exit(2);
  }
}
const levels: LevelId[] = onlyLevel !== undefined ? [onlyLevel] : ignore !== undefined ? withRule(ignore) : LEVEL_IDS;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Bots that ignore the rule against the same bots heeding it, per style. */
function printRule(level: LevelId, rule: LevelRule): void {
  const shares = ruleShares(LEVELS[level], rule);
  const worse = shares.every((x) => x.ignoring < x.heeding);
  console.log(`  ${rule.id.padEnd(22)} ${worse ? 'ok' : 'IGNORING IT DOES NOT DO WORSE'}`);
  for (const x of shares)
    console.log(`    ${x.style.padEnd(12)} heeding ${pct(x.heeding)}   ignoring ${pct(x.ignoring)}   (${x.runs} runs each)`);
}

let problems = 0;
for (const level of levels) {
  console.log(`== Level ${LEVELS[level].number} ${level}`);
  if (ignore !== undefined) {
    console.log(`\nIgnoring a level rule: homeInTime with each style as it plays vs never making the rule's picks (seeds 1-${WALK_SEEDS})`);
    printRule(level, ruleOf(LEVELS[level], ignore)!);
    console.log('');
    continue;
  }

  const started = Date.now();
  const r = walk(allSetups(level));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const total = Object.values(r.endings).reduce((a, b) => a + b, 0);
  problems += r.problems.length;

  console.log('dealer: all picks');
  console.log(`setups: ${r.setups.length}, states walked: ${r.states}, time: ${seconds}s`);
  console.log(`max decisions: ${r.maxDecisions}, max inspections: ${r.maxInspections}, problems: ${r.problems.length}`);
  for (const p of r.problems.slice(0, 10)) {
    console.log(`  PROBLEM ${p.rule}: ${p.detail}`);
    console.log(`    repro: ${JSON.stringify(p.repro)}`);
  }
  if (r.problems.length) {
    // The first failure as a file, ready for replay() in a test.
    writeFileSync('walk-failure.json', JSON.stringify(r.problems[0], null, 2));
    console.log('  first failure saved to walk-failure.json');
  }

  const best = [...ENDING_RANK].reverse();
  const row = (label: string, list: SetupResult[], pickEnding: (x: SetupResult) => EndingId) =>
    `  ${label.padEnd(22)} ${best.map((e) => String(list.filter((x) => pickEnding(x) === e).length).padStart(11)).join('')}`;

  for (const [title, pickEnding] of [
    ['Guaranteed ending (any deal), packings per group', (x: SetupResult) => x.guaranteed],
    ['Lucky ending (best deal), packings per group', (x: SetupResult) => x.best],
  ] as const) {
    console.log(`\n${title}`);
    console.log(`  ${''.padEnd(22)} ${best.map((e) => e.padStart(11)).join('')}`);
    const groups = new Map<string, SetupResult[]>();
    for (const s of r.setups) {
      const g = `${s.setup.character} / ${s.setup.bulletin}`;
      groups.set(g, [...(groups.get(g) ?? []), s]);
    }
    for (const [g, list] of groups) console.log(row(g, list, pickEnding));
    console.log(row('all', r.setups, pickEnding));
  }

  console.log(`\nSetups where homeInTime is reachable at all: ${r.setups.filter((s) => s.best === 'homeInTime').length} of ${r.setups.length}`);

  // Random answers against a random dealer, so a packing's documents show in the number.
  console.log('\nBulletin warnings: homeInTime chance with random answers and deals, packings that cover the warned topic vs ignore it');
  console.log('  (the verdict compares within one character, because characters differ in difficulty)');
  for (const w of warningShares(r.setups)) {
    const compared = w.byCharacter.filter((c) => c.coveredCount * c.ignoredCount > 0);
    const verdict = compared.length && compared.every((c) => c.covered > c.ignored) ? 'ok' : 'WARNING MEANS NOTHING';
    console.log(`  ${w.bulletin.padEnd(14)} ${BULLETIN_TOPICS[w.bulletin].padEnd(14)} covered ${pct(w.covered)} (${w.coveredCount})   ignored ${pct(w.ignored)} (${w.ignoredCount})   ${verdict}`);
    for (const c of w.byCharacter) {
      const side = (x: number, n: number) => (n ? `${pct(x)} (${n})` : '-');
      console.log(`    ${c.character.padEnd(27)} covered ${side(c.covered, c.coveredCount)}   ignored ${side(c.ignored, c.ignoredCount)}`);
    }
  }
  console.log(`\nEnd states by ending (share of branches, not of players), ${total} total:`);
  for (const [e, n] of Object.entries(r.endings)) console.log(`  ${e.padEnd(12)} ${n} (${((n / total) * 100).toFixed(1)}%)`);

  // Answers no style of play picks: cut them, rework them, or say in docs/design.md why they stay.
  const never = neverPicked(r.offered, pickedAnswers(WALK_SEEDS, PICKING_STYLES, level));
  console.log(`\nNever picked by ${PICKING_STYLES.join(', ')} (every setup, seeds 1-${WALK_SEEDS}): ${never.length}`);
  for (const a of never) console.log(`  ${a}`);

  // The level's own rules, each played by bots that ignore it.
  const rules = LEVELS[level].rules;
  console.log(`\nLevel rules, ignored by each style (seeds 1-${WALK_SEEDS}): ${rules.length ? '' : 'none'}`);
  for (const rule of rules) printRule(level, rule);
  console.log('');
}
if (problems) process.exitCode = 1;
