// Prints what the full walk found. `npm run walk`.
// "guaranteed" is the best ending a player can force whatever the dealer deals;
// "lucky" is the best ending with the kindest deal. Ending shares count
// branches, not players, so they are a smell, not a balance verdict.
import { writeFileSync } from 'node:fs';
import { ENDING_RANK, walk } from '../src/game/walk';
import type { SetupResult } from '../src/game/walk';
import type { EndingId } from '../src/game/types';

const started = Date.now();
const r = walk();
const seconds = ((Date.now() - started) / 1000).toFixed(1);
const total = Object.values(r.endings).reduce((a, b) => a + b, 0);

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
console.log(`\nEnd states by ending (share of branches, not of players), ${total} total:`);
for (const [e, n] of Object.entries(r.endings)) console.log(`  ${e.padEnd(12)} ${n} (${((n / total) * 100).toFixed(1)}%)`);
