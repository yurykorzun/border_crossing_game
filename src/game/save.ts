// Autosave: one JSON object in localStorage, written after every action.
// Pure helpers take a Store so tests use a Map (pattern from
// alexis_adventure_game/src/core/save.ts). A broken or old save falls back to fresh.

import type { CarriedClaim, CarriedFile, Declaration, EndingId, LevelId, RunState } from './types';
import { CHECKPOINTS, LATER_IDS } from './types';
import { DEFAULT_LEVEL, isLevelId } from './content/levels';

export interface Settings {
  reduceWait: boolean;
  reduceMotion: boolean;
  sound: boolean;
}

export interface SaveData {
  v: typeof SAVE_VERSION;
  run: RunState | null;
  endingsSeen: EndingId[];
  /**
   * Levels finished at least once, with any ending: what opens the next level
   * (levelOpen() in src/game/content/levels.ts). Unset in saves from before it existed.
   */
  levelsFinished: LevelId[];
  /**
   * The file from the last finished crossing (src/game/carry.ts), for a later level
   * to read. Null until a crossing ends; unset in saves from before it existed.
   */
  file: CarriedFile | null;
  /**
   * Queue beats read on any run so far (QueueBeat.key), so a later run can skip
   * them with one tap. Unset in saves from before it existed: none read.
   */
  beatsSeen: string[];
  settings: Settings;
}

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const SAVE_KEY = 'purpose-of-visit-save';
export const SAVE_VERSION = 1 as const;

/** Every ending the game knows, so a save from an older build drops ids it no longer has. */
export const ENDINGS: readonly EndingId[] = ['homeInTime', 'homeAtCost', 'tooLate', 'turnedBack'];

/** How many different endings the player has seen. A collection only: finishing a level is what opens the next. */
export const distinctEndings = (endingsSeen: readonly EndingId[]): number =>
  new Set(endingsSeen.filter((e) => ENDINGS.includes(e))).size;

/**
 * New crossing (on the title, under Resume crossing) and Start over (the settings sheet):
 * the current run is dropped, and everything kept across runs (endings seen, the carried
 * file, beats read, settings) stays. Without it a reload only offers to resume the saved run.
 */
export const startOver = (d: SaveData): SaveData => ({ ...d, run: null });

const isList = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === 'string');

/** A saved file, or null when it is missing or broken, so a bad file never costs the rest of the save. */
function loadFile(x: unknown): CarriedFile | null {
  if (!x || typeof x !== 'object') return null;
  const f = x as Partial<CarriedFile>;
  const ok = typeof f.level === 'string' && typeof f.character === 'string' && ENDINGS.includes(f.ending as EndingId)
    && isList(f.claims) && isList(f.named) && isList(f.kept) && isList(f.spent) && typeof f.medicine === 'boolean';
  if (!ok) return null;
  // A broken later beat, quote list or declaration is dropped on its own, so the rest of the file still carries.
  const { later, said, disproved, declared, ...rest } = f as CarriedFile;
  const laterOk = !!later && LATER_IDS.includes(later.id) && !!later.vars && typeof later.vars === 'object'
    && Object.values(later.vars).every((v) => typeof v === 'string');
  const claimOk = (c: Partial<CarriedClaim>) => !!c && typeof c.claim === 'string' && typeof c.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && isLevelId(c.crossing) && CHECKPOINTS.includes(c.desk as never) && typeof c.context === 'string';
  return {
    ...rest,
    ...(laterOk ? { later } : {}),
    ...(Array.isArray(said) && said.every(claimOk) ? { said } : {}),
    ...(isList(disproved) ? { disproved } : {}),
    ...(DECLARATIONS.includes(declared as Declaration) ? { declared } : {}),
  };
}

const DECLARATIONS: readonly Declaration[] = ['under', 'counted', 'shown', 'none'];

/**
 * The levels a save has finished. A save from before the list existed only ever played
 * Arrival, so any ending in it means Arrival was finished.
 */
function loadFinished(x: unknown, endingsSeen: readonly EndingId[]): LevelId[] {
  if (x === undefined) return endingsSeen.length > 0 ? [DEFAULT_LEVEL] : [];
  return Array.isArray(x) ? [...new Set(x.filter(isLevelId))] : [];
}

export const freshSave = (): SaveData => ({
  v: SAVE_VERSION,
  run: null,
  endingsSeen: [],
  levelsFinished: [],
  file: null,
  beatsSeen: [],
  settings: { reduceWait: false, reduceMotion: false, sound: true },
});

export function load(store: Store): SaveData {
  try {
    const raw = store.get(SAVE_KEY);
    if (!raw) return freshSave();
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.v !== SAVE_VERSION) return freshSave();
    const base = freshSave();
    const endingsSeen = Array.isArray(data.endingsSeen) ? data.endingsSeen.filter((e) => ENDINGS.includes(e)) : [];
    return {
      v: SAVE_VERSION,
      run: data.run && data.run.v === 2 ? data.run : null,
      endingsSeen,
      levelsFinished: loadFinished(data.levelsFinished, endingsSeen),
      file: loadFile(data.file),
      beatsSeen: isList(data.beatsSeen) ? data.beatsSeen : [],
      settings: { ...base.settings, ...(data.settings ?? {}) },
    };
  } catch {
    return freshSave();
  }
}

export function save(store: Store, data: SaveData): void {
  try {
    store.set(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage full or blocked: the run still plays, it just won't resume */
  }
}

/** localStorage, or nothing when it is blocked (private mode, previews). */
export function browserStore(): Store {
  return {
    get: (k) => {
      try { return localStorage.getItem(k); } catch { return null; }
    },
    set: (k, v) => {
      try { localStorage.setItem(k, v); } catch { /* blocked */ }
    },
  };
}
