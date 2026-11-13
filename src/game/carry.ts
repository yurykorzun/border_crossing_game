// Carry-over between crossings: the file from your last finished crossing goes
// into the save (SaveData.file in src/game/save.ts), and a later level reads it
// with fileFor(). With no crossing saved (a fresh device), fileFor() builds a
// default file from the run's seed, so a level that reads the file never breaks.

import { DEFAULT_LEVEL } from './content/levels';
import { playRun } from './bots';
import { laterBeat } from './consequence';
import { deskOf } from './engine';
import type { SaveData } from './save';
import type { CarriedClaim, CarriedFile, CharacterId, Checkpoint, Declaration, RunState } from './types';
import { allSetups } from './walk';

/** The first day a crossing can fall on; the seed moves it across four weeks. */
const FIRST_DAY = Date.UTC(2026, 2, 2);

/** The date of the crossing a seed plays, YYYY-MM-DD: the same seed, the same day. */
export function crossingDate(seed: number): string {
  const day = ((seed % 28) + 28) % 28;
  return new Date(FIRST_DAY + day * 86_400_000).toISOString().slice(0, 10);
}

/** What customs kept of your cash: what you said, what it counted, a paper, or nothing. */
function declarationOf(s: RunState): Declaration {
  if (s.claims.includes('cashUnderLimit')) return 'under';
  if (s.facts.cashCount?.length) return 'counted';
  if (s.log.some((l) => /^enc\.(c_cash|d_declared)\.(\w+\.)?evidence\./.test(l.key))) return 'shown';
  return 'none';
}

/**
 * The file a finished run leaves behind: its claims, each with the date, crossing, desk
 * and card it was said on, the claims a record showed false, what customs kept of your
 * cash, the contacts it named, the documents kept and spent, and what came back days
 * later (laterBeat()), so the next crossing opens with it.
 */
export function fileOf(s: RunState): CarriedFile {
  if (!s.ending) throw new Error('only a finished crossing leaves a file');
  const later = laterBeat(s);
  const level = s.level ?? DEFAULT_LEVEL;
  const date = crossingDate(s.seed);
  const said: CarriedClaim[] = s.claims.map((claim) => ({
    claim,
    date,
    crossing: level,
    desk: (s.saidAt?.[claim] ?? s.logged?.[claim]?.[0] ?? deskOf(s)) as Checkpoint,
    context: s.saidOn?.[claim] ?? '',
    ...(s.shownBy?.[claim] ? { shown: s.shownBy[claim] } : {}),
  }));
  return {
    ...(later ? { later } : {}),
    level,
    character: s.character,
    ending: s.ending,
    claims: [...s.claims],
    said,
    disproved: [...(s.disproved ?? [])],
    declared: declarationOf(s),
    named: [...s.exposed],
    kept: s.loadout.filter((e) => !s.used.includes(e)),
    spent: s.loadout.filter((e) => s.used.includes(e)),
    medicine: s.medicine,
  };
}

/**
 * The save after a run step: once the run has ended, its ending counts as seen, its
 * level counts as finished and its file replaces the last one. A run still under way
 * leaves all three alone, and a standalone run (one opened with a seeded default
 * file) never replaces the saved file.
 */
export function recordRun(d: SaveData, run: RunState): SaveData {
  if (!run.ending) return { ...d, run };
  const endingsSeen = d.endingsSeen.includes(run.ending) ? d.endingsSeen : [...d.endingsSeen, run.ending];
  const level = run.level ?? DEFAULT_LEVEL;
  const levelsFinished = d.levelsFinished.includes(level) ? d.levelsFinished : [...d.levelsFinished, level];
  const file = run.file?.seeded ? d.file : fileOf(run);
  return { ...d, run, endingsSeen, levelsFinished, file };
}

/**
 * Stands in for a last crossing nobody played: the cautious bot plays Level 1 for
 * this seed, so the same seed always gives the same file. Marked `seeded`. With a
 * traveler, the file is that traveler's.
 */
export function defaultFile(seed: number, character?: CharacterId): CarriedFile {
  const all = allSetups(DEFAULT_LEVEL).filter((x) => !character || x.character === character);
  const setup = { ...all[((seed % all.length) + all.length) % all.length], seed };
  return { ...fileOf(playRun('cautious', setup).final), seeded: true };
}

/** The file a level reads: the saved one, or the seeded default when there is none. */
export const fileFor = (saved: CarriedFile | null, seed: number): CarriedFile => saved ?? defaultFile(seed);

/** The saved file when it is this traveler's own, and so can open their next crossing; else null. */
export const ownFile = (saved: CarriedFile | null, character: CharacterId): CarriedFile | null =>
  saved && !saved.seeded && saved.character === character ? saved : null;

const said = (claim: CarriedClaim['claim'], desk: Checkpoint, context: string): CarriedClaim =>
  ({ claim, date: '2026-03-09', crossing: 'arrival', desk, context });

/**
 * A played-looking file per traveler, for the walk and the tests: Lena told the
 * passport desk it was a short trip, the register showed otherwise, and she said her
 * cash was under the limit. Mark said he came for family, named his brother and let
 * customs count his cash. Between them they open every Departure card.
 */
export const SAMPLE_FILES: Record<CharacterId, CarriedFile> = {
  lena: {
    level: 'arrival', character: 'lena', ending: 'homeInTime',
    claims: ['shortTrip', 'cashUnderLimit'],
    said: [said('shortTrip', 'passport', 'p_purpose'), said('cashUnderLimit', 'customs', 'c_cash')],
    disproved: ['shortTrip'], declared: 'under',
    named: [], kept: [], spent: [], medicine: true,
  },
  mark: {
    level: 'arrival', character: 'mark', ending: 'homeAtCost',
    claims: ['familyVisit'],
    said: [said('familyVisit', 'passport', 'p_purpose')],
    disproved: [], declared: 'counted',
    named: ['brother'], kept: [], spent: [], medicine: true,
  },
};
