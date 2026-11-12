import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL, LEVELS, LEVEL_IDS, LISTED_LEVELS, dealsCard, isLevelId, levelOf, levelRows, showsLevelList } from './content/levels';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { MISSION_MIN_TIME, START_TIME } from './content/world';
import { newRun, travelOf } from './engine';
import { pickKey, playRun, ruleOf, ruleShares, setupFor } from './bots';
import { allSetups } from './walk';
import { SAVE_KEY, freshSave, load } from './save';
import type { Store } from './save';
import { en } from '../i18n/en';
import type { Level, LevelRule, RunState } from './types';

const ALL_CARDS = [...ENCOUNTERS.map((e) => e.id), ...INSPECTIONS.map((i) => i.id)];

describe('levels as data', () => {
  it('holds today\'s mission as Level 1 Arrival, with no new rule', () => {
    const a = LEVELS.arrival;
    expect(LEVEL_IDS[0]).toBe('arrival');
    expect(DEFAULT_LEVEL).toBe('arrival');
    expect(a.number).toBe(1);
    expect(en[a.title]).toBe('Arrival');
    expect([a.goalTitle, a.goalBody]).toEqual(['mission.title', 'mission.body']);
    expect([a.startTime, a.minTripTime]).toEqual([START_TIME, MISSION_MIN_TIME]);
    expect([START_TIME, MISSION_MIN_TIME]).toEqual([8, 2]);
    // Every card but Departure's own (rwf.3), which ask about a file Arrival has not made yet,
    // and the one only The funeral deals: how long you stay (rwf.4).
    const departureOnly = LEVELS.departure.cards.filter((c) => c.startsWith('d_'));
    expect([...a.cards].sort()).toEqual(ALL_CARDS.filter((c) => !departureOnly.includes(c) && c !== 'p_days').sort());
    // There it takes the place of the other stay question and of who pays you.
    expect(LEVELS.funeral.cards.filter((id) => !a.cards.includes(id))).toEqual(['p_days']);
    expect(a.cards.filter((id) => !LEVELS.funeral.cards.includes(id))).toEqual(['p_stay', 'p_employer']);
    // Departure never deals it.
    expect(LEVELS.departure.cards).not.toContain('p_days');
    expect(a.rules).toEqual([]);
  });

  it('names only real cards and keys that have English text, numbered 1 up in list order', () => {
    LEVEL_IDS.forEach((id, i) => {
      const l = LEVELS[id];
      expect(l.id).toBe(id);
      expect(l.number).toBe(i + 1);
      expect(l.cards.filter((c) => !ALL_CARDS.includes(c)), id).toEqual([]);
      for (const k of [l.title, l.blurb, l.goalTitle, l.goalBody]) expect(en[k], `${id}: ${k}`).toBeTruthy();
      expect(new Set(l.rules.map((r) => r.id)).size, id).toBe(l.rules.length);
    });
    for (const k of ['ui.level', 'ui.pickLevel', 'ui.levelNumber']) expect(en[k], k).toBeTruthy();
  });

  it('shows the level list only when more than one level is open (g0q.2)', () => {
    // A fresh save has only Arrival open, so it does not see the list; Departure opens after it.
    expect(showsLevelList([])).toBe(false);
    expect(showsLevelList(['arrival'])).toBe(true);
    // A second level opens once Arrival is finished: the list appears then.
    const two: Level[] = [LEVELS.arrival, { ...LEVELS.arrival, id: 'second' as Level['id'], number: 2 }];
    expect(showsLevelList([], two)).toBe(false);
    expect(showsLevelList(['arrival'], two)).toBe(true);
  });

  it('keeps The funeral off the level list until it has its own story (dap.2)', () => {
    // It shares Arrival's core cards and carries Dad's medicine, so it reads as the hospital mission.
    expect(LEVELS.funeral.hidden).toBe(true);
    expect(LISTED_LEVELS.map((l) => l.id)).toEqual(['arrival', 'departure']);
    // With Arrival and Departure finished, the list shows those two, both open, and nothing locked after them.
    expect(levelRows(['arrival', 'departure']).map((r) => [r.level.id, r.open])).toEqual([['arrival', true], ['departure', true]]);
    expect(showsLevelList(['arrival', 'departure'])).toBe(true);
    // Its content stays: it is still a level a setup or a saved run can name.
    expect(isLevelId('funeral')).toBe(true);
    expect(LEVEL_IDS).toContain('funeral');
  });

  it('loads a save that already holds funeral progress, run under way and all', () => {
    const map = new Map<string, string>();
    const store: Store = { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
    const run = newRun({ level: 'funeral', character: 'lena', loadout: ['hotel', 'hospitalNote', 'returnTicket'], bulletin: 'customs', seed: 4 });
    map.set(SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['tooLate'], levelsFinished: ['arrival', 'departure', 'funeral'], run }));
    const d = load(store);
    expect(d.levelsFinished).toEqual(['arrival', 'departure', 'funeral']);
    expect(d.run?.level).toBe('funeral');
    expect(levelOf(d.run!).id).toBe('funeral');
    expect(levelRows(d.levelsFinished).map((r) => r.level.id)).toEqual(['arrival', 'departure']);
  });

  it('tells a level id from anything else', () => {
    expect(isLevelId('arrival')).toBe(true);
    expect(isLevelId('nowhere')).toBe(false);
    expect(isLevelId(undefined)).toBe(false);
  });
});

describe('level as a setup field', () => {
  const setup = { character: 'lena', loadout: ['motherLetter', 'hospitalNote', 'deed'], bulletin: 'customs', seed: 3 } as const;

  it('starts a run on the level clock, and a setup with no level plays Arrival', () => {
    const plain = newRun({ ...setup, loadout: [...setup.loadout] });
    const arrival = newRun({ ...setup, loadout: [...setup.loadout], level: 'arrival' });
    expect(arrival).toEqual(plain);
    expect(arrival.level).toBe('arrival');
    expect(arrival.time).toBe(LEVELS.arrival.startTime);
    expect(travelOf(arrival)).toBe(LEVELS.arrival.minTripTime);
  });

  it('plays a save from before levels as Arrival', () => {
    const { level: _, travel: __, ...rest } = newRun({ ...setup, loadout: [...setup.loadout] });
    const old: RunState = rest;
    expect(levelOf(old).id).toBe('arrival');
    expect(travelOf(old)).toBe(MISSION_MIN_TIME);
    expect(dealsCard(old, 'p_purpose')).toBe(true);
  });

  it('gives every walk and bot setup its level', () => {
    for (const level of LEVEL_IDS) {
      expect(allSetups(level).every((s) => s.level === level)).toBe(true);
      expect(setupFor(7, level).level).toBe(level);
    }
  });
});

describe('a bot that ignores a level rule', () => {
  // A made-up rule on Arrival: heeding it means telling the truth about the trip
  // at the first desk. The liar style picks shortTrip there, so it ignores the rule
  // already; the honest style shows evidence, which the rule's heeders do.
  const rule: LevelRule = { id: 'test', heeds: ['p_purpose.evidence', 'p_purpose.family'] };
  const level: Level = { ...LEVELS.arrival, rules: [rule] };

  it('finds the rule by name', () => {
    expect(ruleOf(level, 'test')).toBe(rule);
    expect(ruleOf(level, 'nope')).toBeUndefined();
  });

  it('never makes a heeded pick while another is open, and plays its style otherwise', () => {
    const setup = setupFor(0);
    const heeding = playRun('honest', setup);
    const ignoring = playRun('honest', setup, rule);
    expect(heeding.choices[0]).toEqual({ card: 'p_purpose', pick: 'evidence' });
    expect(ignoring.choices[0]).toEqual({ card: 'p_purpose', pick: 'shortTrip' });
    for (const style of ['honest', 'cautious', 'random', 'situational'] as const)
      for (let i = 0; i < 20; i++)
        expect(playRun(style, setupFor(i), rule).choices.map((c) => `${c.card}.${c.pick}`).filter((k) => rule.heeds.includes(k))).toEqual([]);
  });

  it('names picks the way the walk does', () => {
    const s = newRun(setupFor(0));
    expect(pickKey({ ...s, screen: { kind: 'encounter', id: 'p_purpose' } }, { type: 'choose', approach: 'shortTrip' })).toBe('p_purpose.shortTrip');
    expect(pickKey(s, { type: 'ack' })).toBeUndefined();
  });

  it('reports homeInTime heeding and ignoring per style over the same runs', () => {
    const [honest] = ruleShares(level, rule, 1, ['honest']);
    expect(honest.style).toBe('honest');
    expect(honest.runs).toBe(allSetups().length);
    for (const x of [honest.heeding, honest.ignoring]) expect(x).toBeGreaterThanOrEqual(0);
    expect(honest.heeding).not.toBe(honest.ignoring);
  });
});
