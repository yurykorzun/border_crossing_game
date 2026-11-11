// The levels: what makes one crossing different from another. No prose here:
// names and goals are in src/i18n/en.ts under the keys each level names.
// Every level uses the same three desks and officers (epic border_crossing_game-rwf).

import type { Level, LevelId } from '../types';
import { MISSION_MIN_TIME, START_TIME } from './world';
import { ENCOUNTERS, INSPECTIONS } from './encounters';

export const LEVELS: Record<LevelId, Level> = {
  // Level 1, today's mission: every card, no new rule.
  arrival: {
    id: 'arrival',
    number: 1,
    title: 'level.arrival.title',
    blurb: 'level.arrival.blurb',
    goalTitle: 'mission.title',
    goalBody: 'mission.body',
    startTime: START_TIME,
    minTripTime: MISSION_MIN_TIME,
    cards: [...ENCOUNTERS.map((e) => e.id), ...INSPECTIONS.map((i) => i.id)],
    rules: [],
  },
};

/** Level list order. */
export const LEVEL_IDS = (Object.keys(LEVELS) as LevelId[]).sort((a, b) => LEVELS[a].number - LEVELS[b].number);

export const DEFAULT_LEVEL: LevelId = 'arrival';

export const isLevelId = (x: unknown): x is LevelId => typeof x === 'string' && x in LEVELS;

/** The level a run or setup plays. Unset (a setup or save from before levels): Arrival. */
export const levelOf = (s: { level?: LevelId }): Level => LEVELS[s.level ?? DEFAULT_LEVEL];

const DEALS = new Map(LEVEL_IDS.map((id) => [id, new Set(LEVELS[id].cards)]));

/** Whether this level can deal the encounter or inspection `card`. */
export const dealsCard = (s: { level?: LevelId }, card: string): boolean => DEALS.get(s.level ?? DEFAULT_LEVEL)!.has(card);

const ALL_LEVELS = (): Level[] => LEVEL_IDS.map((id) => LEVELS[id]);

/**
 * Whether the level at `index` of `levels` (list order) is open: the first always is, and
 * any other once the player has finished the one before it, with any ending (rwf.12).
 * Endings stay a collection to fill, not a key, so nobody has to lose a relative to move on.
 */
export const levelOpen = (index: number, levelsFinished: readonly LevelId[], levels: readonly Level[] = ALL_LEVELS()): boolean =>
  index === 0 || levelsFinished.includes(levels[index - 1].id);

/** One row of the level list. A locked row names the level that opens it: `ui.levelOpensAfter` with {level} its title. */
export interface LevelRow {
  level: Level;
  open: boolean;
  opensAfter?: { key: 'ui.levelOpensAfter'; level: Level };
}

/** The level list for a player who has finished `levelsFinished`, in list order. */
export const levelRows = (levelsFinished: readonly LevelId[], levels: readonly Level[] = ALL_LEVELS()): LevelRow[] =>
  levels.map((level, i) => (levelOpen(i, levelsFinished, levels)
    ? { level, open: true }
    : { level, open: false, opensAfter: { key: 'ui.levelOpensAfter', level: levels[i - 1] } }));

/** Whether setup shows the level list: only when there is a choice, more than one level open (g0q.2). */
export const showsLevelList = (levelsFinished: readonly LevelId[], levels: readonly Level[] = ALL_LEVELS()): boolean =>
  levelRows(levelsFinished, levels).filter((r) => r.open).length > 1;
