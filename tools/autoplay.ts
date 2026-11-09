// Plays seeded runs with every bot style and prints what happened.
// `npm run autoplay -- --runs 200 [--seed 0]`
//
// Run i of a style uses setupFor(seed + i): every character x packing x bulletin
// in turn, with seed + i + 1 as the run seed. No clock and no Math.random, so the
// same flags always print the same tables. Bead plj (balance) reads these numbers.
//
// The memorised row is the harshest probe: a first pass of every style over the
// same setups picks, per card id, the answer that won most often (buildScript()),
// and that script then plays the setups again without reading state. It is
// reported, not enforced, and stays out of the all-styles tables below.
import { BOT_STYLES, firstPassScript, playRun, playScript, setupFor } from '../src/game/bots';
import type { BotRun, BotStyle } from '../src/game/bots';
import { CHARACTERS } from '../src/game/content/world';
import { ENDING_RANK } from '../src/game/walk';
import type { EndingId } from '../src/game/types';

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const n = Number(process.argv[i + 1]);
  if (!Number.isInteger(n) || (name === 'runs' && n < 1)) {
    console.error(`--${name} needs a whole number${name === 'runs' ? ' above 0' : ''}`);
    process.exit(2);
  }
  return n;
}

const RUNS = flag('runs', 200);
const SEED = flag('seed', 0);
const ENDINGS: EndingId[] = [...ENDING_RANK].reverse();

const runs = new Map<BotStyle, BotRun[]>();
for (const style of BOT_STYLES) {
  const list: BotRun[] = [];
  for (let i = 0; i < RUNS; i++) list.push(playRun(style, setupFor(SEED + i)));
  runs.set(style, list);
}
const all = [...runs.values()].flat();
const script = firstPassScript(RUNS, SEED);
const memorised: BotRun[] = [];
for (let i = 0; i < RUNS; i++) memorised.push(playScript(script, setupFor(SEED + i)));
const rows: [string, BotRun[]][] = [...runs, ['memorised', memorised]];

const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : '-');
const mean = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '-');
const won = (r: BotRun) => r.final.ending === 'homeInTime';
const cells = (xs: (string | number)[], w: number) => xs.map((x) => String(x).padStart(w)).join('');

/**
 * Ending shares that add up to exactly 100.0: largest-remainder rounding to
 * tenths, so the row never reads 99.9 or 100.1.
 */
function shares(counts: number[], total: number): string[] {
  const raw = counts.map((c) => (c * 1000) / total);
  const tenths = raw.map(Math.floor);
  let left = 1000 - tenths.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left-- <= 0) break; tenths[i]++; }
  return tenths.map((t) => (t / 10).toFixed(1));
}

console.log(`autoplay: ${RUNS} runs per style, setups ${SEED}..${SEED + RUNS - 1}`);

// ── 1. One row per style
// no-cost/run: answers that spent no time, scrutiny or contact and put no new fact on file (noCost() in src/game/engine.ts).
// lies/run: untrue claims made plus photo denials. lies caught: the share of those lies a challenge card put to the player (caughtLies()).
console.log('\nEndings (% of runs) and run stats per style');
console.log(`  ${'style'.padEnd(12)}${cells(ENDINGS, 11)}${cells(['time mean', 'time min', 'decisions', 'inspect/run', 'no-cost/run', 'lies/run', 'lies caught'], 12)}`);
for (const [style, list] of rows) {
  const counts = ENDINGS.map((e) => list.filter((r) => r.final.ending === e).length);
  const times = list.map((r) => r.final.time);
  console.log(`  ${style.padEnd(12)}${cells(shares(counts, list.length), 11)}${cells([
    mean(times), Math.min(...times), mean(list.map((r) => r.final.decisions)), mean(list.map((r) => r.final.inspections)),
    mean(list.map((r) => r.noCost)), mean(list.map((r) => r.lies)),
    pct(list.reduce((n, r) => n + r.caught, 0), list.reduce((n, r) => n + r.lies, 0)),
  ], 12)}`);
}

// ── 2. Success by setup
console.log('\nhomeInTime by character x packing x bulletin (won/played per style)');
console.log(`  ${'character'.padEnd(10)}${'packing'.padEnd(44)}${'bulletin'.padEnd(14)}${cells([...BOT_STYLES], 13)}`);
const bySetup = new Map<string, Map<BotStyle, BotRun[]>>();
for (const r of all) {
  const { character, loadout, bulletin } = r.final;
  const key = `${character.padEnd(10)}${loadout.join(' ').padEnd(44)}${bulletin.padEnd(14)}`;
  const row = bySetup.get(key) ?? new Map<BotStyle, BotRun[]>();
  row.set(r.style, [...(row.get(r.style) ?? []), r]);
  bySetup.set(key, row);
}
for (const [key, row] of bySetup)
  console.log(`  ${key}${cells(BOT_STYLES.map((st) => { const l = row.get(st) ?? []; return `${l.filter(won).length}/${l.length}`; }), 13)}`);

// ── 3. What winners chose
console.log('\nChoice frequency in homeInTime runs (all styles): picked / times that card was answered by a winner');
const wins = all.filter(won);
const seen = new Map<string, number>();
const picked = new Map<string, number>();
for (const r of wins)
  for (const c of r.choices) {
    seen.set(c.card, (seen.get(c.card) ?? 0) + 1);
    picked.set(`${c.card}.${c.pick}`, (picked.get(`${c.card}.${c.pick}`) ?? 0) + 1);
  }
for (const key of [...picked.keys()].sort()) {
  const card = key.slice(0, key.lastIndexOf('.'));
  const n = picked.get(key)!;
  console.log(`  ${key.padEnd(30)}${cells([n, pct(n, seen.get(card)!)], 9)}`);
}
console.log(`  (${wins.length} winning runs)`);

// ── 4. Contacts spent
console.log('\nContact-spend effect (all styles): runs by contacts named');
console.log(`  ${'contacts'.padEnd(24)}${cells(['runs', 'homeInTime', 'homeAtCost', 'time mean'], 12)}`);
const contactRows: [string, (r: BotRun) => boolean][] = [
  ['0', (r) => r.final.exposed.length === 0],
  ['1', (r) => r.final.exposed.length === 1],
  ['2', (r) => r.final.exposed.length >= 2],
  ['protected one named', (r) => r.final.exposed.includes(CHARACTERS[r.final.character].protectedContact)],
];
for (const [label, test] of contactRows) {
  const l = all.filter(test);
  console.log(`  ${label.padEnd(24)}${cells([l.length, pct(l.filter(won).length, l.length),
    pct(l.filter((r) => r.final.ending === 'homeAtCost').length, l.length), mean(l.map((r) => r.final.time))], 12)}`);
}

// ── 5. Inspections
// "any → home" is the inspection recovery rate: the share of runs with an inspection that still end homeInTime or homeAtCost.
console.log('\nInspection recovery: homeInTime share by inspections in the run, and recovery rate (any → home: homeInTime or homeAtCost)');
console.log(`  ${'style'.padEnd(12)}${cells(['0', '1', '2+', 'any → home'], 16)}`);
const inspRow = (list: BotRun[]) => {
  const bucket = (test: (n: number) => boolean) => {
    const l = list.filter((r) => test(r.final.inspections));
    return `${l.filter(won).length}/${l.length}`;
  };
  const hit = list.filter((r) => r.final.inspections > 0);
  const home = hit.filter((r) => r.final.ending === 'homeInTime' || r.final.ending === 'homeAtCost');
  return cells([bucket((n) => n === 0), bucket((n) => n === 1), bucket((n) => n >= 2), pct(home.length, hit.length)], 16);
};
for (const [style, list] of rows) console.log(`  ${style.padEnd(12)}${inspRow(list)}`);
console.log(`  ${'all'.padEnd(12)}${inspRow(all)}`);
