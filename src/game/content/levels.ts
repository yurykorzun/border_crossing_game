// The levels: what makes one crossing different from another. No prose here:
// names and goals are in src/i18n/en.ts under the keys each level names.
// Every level uses the same three desks and officers (epic border_crossing_game-rwf).

import type { EndingId, Level, LevelId } from '../types';
import { distinctEndings } from '../save';
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
    opensAt: 0,
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

/** Whether `level` is open: the player has seen at least its opensAt different endings (distinctEndings() in src/game/save.ts). */
export const levelOpen = (level: Pick<Level, 'opensAt'>, endingsSeen: readonly EndingId[]): boolean =>
  distinctEndings(endingsSeen) >= level.opensAt;

/** One row of the level list. A locked row says what opens it: `ui.levelOpensAt`, read with tn() and the endings count. */
export interface LevelRow {
  level: Level;
  open: boolean;
  opensAt?: { key: 'ui.levelOpensAt'; n: number };
}

/** The level list for a player who has seen `endingsSeen`, in list order. */
export const levelRows = (endingsSeen: readonly EndingId[], levels: readonly Level[] = LEVEL_IDS.map((id) => LEVELS[id])): LevelRow[] =>
  levels.map((level) => (levelOpen(level, endingsSeen) ? { level, open: true } : { level, open: false, opensAt: { key: 'ui.levelOpensAt', n: level.opensAt } }));
