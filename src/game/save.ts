// Autosave: one JSON object in localStorage, written after every action.
// Pure helpers take a Store so tests use a Map (pattern from
// alexis_adventure_game/src/core/save.ts). A broken or old save falls back to fresh.

import type { EndingId, RunState } from './types';

export interface Settings {
  reduceWait: boolean;
  reduceMotion: boolean;
  sound: boolean;
}

export interface SaveData {
  v: typeof SAVE_VERSION;
  run: RunState | null;
  endingsSeen: EndingId[];
  settings: Settings;
}

export interface Store {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const SAVE_KEY = 'purpose-of-visit-save';
export const SAVE_VERSION = 1 as const;

/** Every ending, in the order its open question is listed. */
export const ENDINGS: readonly EndingId[] = ['homeInTime', 'homeAtCost', 'tooLate', 'turnedBack'];

/**
 * What the player has not found out yet: one question per ending not seen, as the
 * i18n key `question.<ending>`. Seeing an ending crosses its question off. The list
 * comes from endingsSeen, so an older save keeps its progress with no new field.
 */
export const openQuestions = (data: Pick<SaveData, 'endingsSeen'>): string[] =>
  ENDINGS.filter((e) => !data.endingsSeen.includes(e)).map((e) => `question.${e}`);

export const freshSave = (): SaveData => ({
  v: SAVE_VERSION,
  run: null,
  endingsSeen: [],
  settings: { reduceWait: false, reduceMotion: false, sound: true },
});

export function load(store: Store): SaveData {
  try {
    const raw = store.get(SAVE_KEY);
    if (!raw) return freshSave();
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.v !== SAVE_VERSION) return freshSave();
    const base = freshSave();
    return {
      v: SAVE_VERSION,
      run: data.run && data.run.v === 2 ? data.run : null,
      endingsSeen: Array.isArray(data.endingsSeen) ? data.endingsSeen.filter((e) => ENDINGS.includes(e)) : [],
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
