import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL, LEVELS, LEVEL_IDS, dealsCard, isLevelId, levelOf } from './content/levels';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { MISSION_MIN_TIME, START_TIME } from './content/world';
import { newRun, travelOf } from './engine';
import { pickKey, playRun, ruleOf, ruleShares, setupFor } from './bots';
import { allSetups } from './walk';
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
    expect([...a.cards].sort()).toEqual([...ALL_CARDS].sort());
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
  // at the first desk. The liar style picks tourism there, so it ignores the rule
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
    expect(ignoring.choices[0]).toEqual({ card: 'p_purpose', pick: 'tourism' });
    for (const style of ['honest', 'cautious', 'random', 'situational'] as const)
      for (let i = 0; i < 20; i++)
        expect(playRun(style, setupFor(i), rule).choices.map((c) => `${c.card}.${c.pick}`).filter((k) => rule.heeds.includes(k))).toEqual([]);
  });

  it('names picks the way the walk does', () => {
    const s = newRun(setupFor(0));
    expect(pickKey({ ...s, screen: { kind: 'encounter', id: 'p_purpose' } }, { type: 'choose', approach: 'tourism' })).toBe('p_purpose.tourism');
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
