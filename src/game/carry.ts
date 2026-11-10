// Carry-over between crossings: the file from your last finished crossing goes
// into the save (SaveData.file in src/game/save.ts), and a later level reads it
// with fileFor(). With no crossing saved (a fresh device), fileFor() builds a
// default file from the run's seed, so a level that reads the file never breaks.

import { DEFAULT_LEVEL } from './content/levels';
import { playRun, setupFor } from './bots';
import type { SaveData } from './save';
import type { CarriedFile, RunState } from './types';

/** The file a finished run leaves behind: its claims, the contacts it named, the documents kept and spent. */
export function fileOf(s: RunState): CarriedFile {
  if (!s.ending) throw new Error('only a finished crossing leaves a file');
  return {
    level: s.level ?? DEFAULT_LEVEL,
    character: s.character,
    ending: s.ending,
    claims: [...s.claims],
    named: [...s.exposed],
    kept: s.loadout.filter((e) => !s.used.includes(e)),
    spent: s.loadout.filter((e) => s.used.includes(e)),
    medicine: s.medicine,
  };
}

/**
 * The save after a run step: once the run has ended, its ending counts as seen and
 * its file replaces the last one. A run still under way leaves both alone.
 */
export function recordRun(d: SaveData, run: RunState): SaveData {
  if (!run.ending) return { ...d, run };
  const endingsSeen = d.endingsSeen.includes(run.ending) ? d.endingsSeen : [...d.endingsSeen, run.ending];
  return { ...d, run, endingsSeen, file: fileOf(run) };
}

/**
 * Stands in for a last crossing nobody played: the cautious bot plays Level 1 for
 * this seed, so the same seed always gives the same file. Marked `seeded`.
 */
export function defaultFile(seed: number): CarriedFile {
  const setup = { ...setupFor(seed), level: DEFAULT_LEVEL, seed };
  return { ...fileOf(playRun('cautious', setup).final), seeded: true };
}

/** The file a level reads: the saved one, or the seeded default when there is none. */
export const fileFor = (saved: CarriedFile | null, seed: number): CarriedFile => saved ?? defaultFile(seed);
