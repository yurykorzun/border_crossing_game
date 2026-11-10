// The daily crossing: one shared setup per date. The date picks a seed, and the
// seed picks the level, the traveler and the three bulletins in force that day,
// one per desk, so everyone gets the same crossing on the same date. You still
// pack your own documents, and the cards are dealt from the date and that
// packing: the same date and the same packing always deal the same cards.
//
// Why the packing goes into the deal: with one dealer seed per date, a script of
// answers learnt on that date's runs got home in time in 85-92% of eval runs
// (rule 10 caps it at 80%), because every run of the day replays the same cards.
// The setup everyone shares stays the date's alone.
//
// The date always comes in from outside (the screen reads the clock once, tests
// pass a string), so nothing here depends on when it runs.
//
// Carry-over is optional and off by default (Settings.dailyMemory in
// src/game/save.ts). With it on, the officers remember what you claimed in your
// last daily crossing, if you cross as the same traveler: the shuttle trader,
// who goes through the same desks day after day.

import { LEVEL_IDS } from './content/levels';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from './content/world';
import type { RunSetup } from './engine';
import { pick } from './rng';
import { combinations } from './walk';
import type { BulletinId, CarriedFile, CharacterId, ClaimId, EvidenceId, LevelId } from './types';
import { CHECKPOINTS } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The local calendar date of `d` as YYYY-MM-DD: the key a daily crossing is picked by. */
export function dateKey(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The date `days` after `date` (YYYY-MM-DD), by the calendar. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

/** A 32-bit hash of `text` (FNV-1a), the same on every device. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h | 0;
}

const checkDate = (date: string) => {
  if (!DATE.test(date)) throw new Error(`a daily crossing needs a YYYY-MM-DD date, not ${date}`);
};

/** The seed for a date: a hash of its YYYY-MM-DD text. It picks the day's setup (dailySetup()). */
export function dailySeed(date: string): number {
  checkDate(date);
  return hash(date);
}

/** The dealer's seed for a daily run: the date and the packing, in a fixed order, so the same pair deals the same cards. */
export function dealSeed(date: string, loadout: readonly EvidenceId[]): number {
  checkDate(date);
  return hash(`${date}|${EVIDENCE_IDS.filter((id) => loadout.includes(id)).join(',')}`);
}

/** What a date's daily crossing is, before you pack. */
export interface DailySetup {
  date: string;
  /** The date's seed, which picked the rest (dailySeed()). */
  seed: number;
  level: LevelId;
  character: CharacterId;
  /** One per desk, in CHECKPOINTS order. Two desks can share one. */
  bulletins: BulletinId[];
}

/** The daily crossing for `date`: its seed picks the level, then the traveler, then a bulletin for each desk. */
export function dailySetup(date: string): DailySetup {
  const seed = dailySeed(date);
  const level = pick(seed, LEVEL_IDS);
  const character = pick(level.rng, CHARACTER_IDS);
  let rng = character.rng;
  const bulletins = CHECKPOINTS.map(() => {
    const b = pick(rng, BULLETINS);
    rng = b.rng;
    return b.value;
  });
  return { date, seed, level: level.value, character: character.value, bulletins };
}

/**
 * The claims the officers remember from `last`, your last daily crossing: all of
 * them when it was a daily crossing as the same traveler, else none (nobody at
 * the desk has seen this person before).
 */
export function remembered(day: Pick<DailySetup, 'character'>, last: CarriedFile | null): ClaimId[] {
  return last?.daily && last.character === day.character ? [...last.claims] : [];
}

/**
 * The run setup for a daily crossing with your packing. `last` is your last daily
 * file when carry-over is on (remembered()); null or left out plays it fresh.
 */
export function dailyRunSetup(day: DailySetup, loadout: readonly EvidenceId[], last: CarriedFile | null = null): RunSetup {
  const memory = remembered(day, last);
  return {
    level: day.level,
    character: day.character,
    loadout: [...loadout],
    bulletin: day.bulletins[0],
    bulletins: [...day.bulletins],
    daily: day.date,
    seed: dealSeed(day.date, loadout),
    ...(memory.length ? { remembered: memory } : {}),
  };
}

/** Days a daily eval covers (tools/eval.ts). */
export const EVAL_DAYS = 30;

/**
 * The daily setup for eval run `i`, over EVAL_DAYS dates from `from`: run i plays
 * day i mod EVAL_DAYS, and each round over the dates moves every date on to
 * another packing its traveler can take, so each date is played with several
 * packings and no two dates walk them in step. Carry-over off, as by default.
 */
export function dailyEvalSetup(i: number, from: string, days = EVAL_DAYS): RunSetup {
  const n = Math.max(0, i);
  const day = dailySetup(addDays(from, n % days));
  const packings = combinations<EvidenceId>(EVIDENCE_IDS, CHARACTERS[day.character].evidenceSlots);
  return dailyRunSetup(day, packings[(n + Math.floor(n / days)) % packings.length]);
}
