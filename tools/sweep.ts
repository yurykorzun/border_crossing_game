// Plays every setup of a level (every character x packing x bulletin) on every
// seed 1..seeds with every bot style, and checks no run goes over rule 4's
// ceiling (PLAY_MINUTES.max by playMinutes()). `npm run eval` only plays one
// seed per setup in turn (setupFor()), so a long path its 200 seeds never draw
// can hide there (border_crossing_game-rwf.15). Exits 1 when a run goes over.
// `npx tsx tools/sweep.ts [--level arrival] [--seeds 200] [--jobs 8] [--max 8]`
//
// --jobs splits the setups over that many child processes. A child gets
// --part i --parts n and prints one JSON line, which the parent adds up.
// --max tries another ceiling, so a test can see the failing path.
import { spawn } from 'node:child_process';
import { BOT_STYLES, playRun } from '../src/game/bots';
import { LEVEL_IDS, isLevelId } from '../src/game/content/levels';
import { PLAY_MINUTES, playMinutes, transcriptOf } from '../src/game/transcript';
import { allSetups } from '../src/game/walk';
import type { LevelId } from '../src/game/types';

type Long = { minutes: number; run: string };
type Part = { runs: number; over: Long[]; longest: Long };

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const n = Number(process.argv[i + 1]);
  const ok = name === 'max' ? Number.isFinite(n) && n > 0 : Number.isInteger(n) && n >= (name === 'part' ? 0 : 1);
  if (!ok) {
    console.error(`--${name} needs a ${name === 'max' ? 'number of minutes' : 'whole number'}${name === 'part' ? '' : ' above 0'}`);
    process.exit(2);
  }
  return n;
}

const levelAt = process.argv.indexOf('--level');
const LEVEL = levelAt < 0 ? 'arrival' : process.argv[levelAt + 1];
if (!isLevelId(LEVEL)) {
  console.error(`--level needs one of: ${LEVEL_IDS.join(', ')}`);
  process.exit(2);
}
const SEEDS = flag('seeds', 200);
const JOBS = flag('jobs', 1);
const PARTS = flag('parts', 1);
const PART = flag('part', 0);
const MAX = flag('max', PLAY_MINUTES.max);

function sweep(level: LevelId, part: number, parts: number): Part {
  const out: Part = { runs: 0, over: [], longest: { minutes: 0, run: '' } };
  allSetups(level).forEach((base, i) => {
    if (i % parts !== part) return;
    for (let seed = 1; seed <= SEEDS; seed++)
      for (const style of BOT_STYLES) {
        const setup = { ...base, seed };
        const minutes = playMinutes(transcriptOf(playRun(style, setup), setup));
        out.runs++;
        const run = `${style} seed ${seed} ${base.character} ${base.bulletin} bulletin, packed ${base.loadout.join(', ')}`;
        if (minutes > out.longest.minutes) out.longest = { minutes, run };
        if (minutes > MAX) out.over.push({ minutes, run });
      }
  });
  return out;
}

function child(i: number): Promise<Part> {
  return new Promise((resolve, reject) => {
    const args = ['tsx', 'tools/sweep.ts', '--level', LEVEL, '--seeds', String(SEEDS), '--max', String(MAX), '--part', String(i), '--parts', String(JOBS)];
    const p = spawn('npx', args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    p.stdout.on('data', (d) => { text += d; });
    p.on('error', reject);
    p.on('close', (code) => {
      try {
        // A part exits 1 when it found a run over, and still prints its JSON.
        if (code !== 0 && code !== 1) throw new Error(`exit ${code}`);
        resolve(JSON.parse(text) as Part);
      } catch (e) {
        reject(new Error(`sweep part ${i} failed: ${String(e)}`));
      }
    });
  });
}

if (process.argv.includes('--part')) {
  const r = sweep(LEVEL, PART, PARTS);
  console.log(JSON.stringify(r));
  process.exit(r.over.length ? 1 : 0);
}

const parts = JOBS === 1 ? [sweep(LEVEL, 0, 1)] : await Promise.all(Array.from({ length: JOBS }, (_, i) => child(i)));
const runs = parts.reduce((n, p) => n + p.runs, 0);
const over = parts.flatMap((p) => p.over).sort((a, b) => b.minutes - a.minutes);
const longest = parts.map((p) => p.longest).sort((a, b) => b.minutes - a.minutes)[0];
console.log(`sweep: level ${LEVEL}, ${allSetups(LEVEL).length} setups x ${SEEDS} seeds x ${BOT_STYLES.length} styles = ${runs} runs`);
console.log(`  longest ${longest.minutes.toFixed(2)} of ${MAX} min: ${longest.run}`);
for (const o of over.slice(0, 20)) console.log(`  over: ${o.minutes.toFixed(2)} min, ${o.run}`);
console.log(over.length ? `sweep: FAIL, ${over.length} runs over ${MAX} min` : 'sweep: PASS');
process.exit(over.length ? 1 : 0);
