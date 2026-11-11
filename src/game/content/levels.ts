// The levels: what makes one crossing different from another. No prose here:
// names and goals are in src/i18n/en.ts under the keys each level names.
// Every level uses the same three desks and officers (epic border_crossing_game-rwf).

import type { ClaimId, Level, LevelId } from '../types';
import { MISSION_MIN_TIME, START_TIME } from './world';
import { ENCOUNTERS, INSPECTIONS, STATEMENTS } from './encounters';

/** Cards only Departure deals: the desks open with your carried file (rwf.3). */
const DEPARTURE_ONLY = ['d_entry', 'd_stay', 'd_hold', 'd_declared', 'd_named'];
/** Arrival cards Departure asks in its own words, from the file: why you came, how long, your cash, your family. */
const DEPARTURE_REPLACES = ['p_purpose', 'p_stay', 'c_cash', 'i_family'];
/** Cards only The funeral deals: how long you stay, against her sister's statement (rwf.4). */
const FUNERAL_ONLY = ['p_days'];
/** Passport follow-ups The funeral asks how long you stay in place of (p_days). */
const FUNERAL_REPLACES = ['p_stay', 'p_employer'];
/** The p_days answer that makes each stay claim. */
const STAY_ANSWER: Partial<Record<ClaimId, string>> = { stayDays: 'days', stayWeeks: 'weeks' };
const ALL_CARDS = [...ENCOUNTERS.map((e) => e.id), ...INSPECTIONS.map((i) => i.id)];
const without = (...lists: readonly string[][]) => ALL_CARDS.filter((id) => !lists.some((l) => l.includes(id)));

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
    cards: without(DEPARTURE_ONLY, FUNERAL_ONLY),
    rules: [],
  },
  // Level 2: the return ticket. Your father needs another week of care, and on the way
  // in you said five days. Every desk opens with the file from your last crossing
  // (RunSetup.file): what you said, who you named, what customs kept.
  departure: {
    id: 'departure',
    number: 2,
    title: 'level.departure.title',
    blurb: 'level.departure.blurb',
    goalTitle: 'departure:mission.title',
    goalBody: 'departure:mission.body',
    startTime: START_TIME,
    minTripTime: MISSION_MIN_TIME,
    cards: without(DEPARTURE_REPLACES, FUNERAL_ONLY),
    core: { passport: ['d_entry', 'p_host'], customs: ['c_medicine', 'd_declared'], interview: ['d_named', 'i_employer'] },
    readsFile: true,
    rules: [
      // Giving the reason your file already holds, and explaining the longer stay.
      // Ignoring the file puts your entry record against you or costs the longer check.
      // A file that says "a short trip" has nothing true to agree with, so no pick there heeds it.
      {
        id: 'file',
        heeds: ['d_stay.father', 'd_stay.evidence'],
        heedsWhen: [
          { pick: 'd_entry.family', when: { fileSaid: ['familyVisit'] } },
          { pick: 'd_entry.evidence', when: { fileSaid: ['familyVisit'] } },
        ],
      },
    ],
  },
  // Level 3: an old friend's funeral; your father is still in care. Her sister has told
  // the border how long you stay, and the setup picks what she said. A stay you
  // claim that disagrees with her is a contradiction, caught like any other.
  funeral: {
    id: 'funeral',
    number: 3,
    title: 'level.funeral.title',
    blurb: 'level.funeral.blurb',
    goalTitle: 'funeral:mission.title',
    goalBody: 'funeral:mission.body',
    startTime: START_TIME,
    minTripTime: MISSION_MIN_TIME,
    // How long you stay is the clerk's follow-up here (p_days), in the place of the
    // other stay question (p_stay, the return ticket's date out) and of who pays you
    // (p_employer), so the run keeps Arrival's length.
    cards: without(DEPARTURE_ONLY, FUNERAL_REPLACES),
    // Telling the clerk the stay her sister already gave the border.
    rules: [{
      id: 'statements',
      heeds: [],
      heedsWhen: STATEMENTS.map((x) => ({ pick: `p_days.${STAY_ANSWER[x.agrees]}`, when: { facts: [x.fact] } })),
    }],
    statements: STATEMENTS.map((x) => x.fact),
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
