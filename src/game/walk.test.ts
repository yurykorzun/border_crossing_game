import { describe, expect, it } from 'vitest';
import { ENDING_RANK, allSetups, checkState, outcomes, walk } from './walk';
import { legalActions, newRun, step } from './engine';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';

// One walk shared by every assertion: every character, packing and bulletin,
// every player choice and every card the dealer could deal (about 11 s).
const report = walk();

describe('every possible run', () => {
  it('covers every setup', () => {
    expect(report.setups.length).toBe(allSetups().length);
  });

  it('breaks no rule in any reachable state', () => {
    // bounds, subsets, no dead ends, no loops, every action moves, endings match
    // the state, every reaction line has English text, the engine never throws
    // Each problem carries a replay record; `npm run walk` saves the first to walk-failure.json.
    expect(report.problems.map((p) => `${p.rule}: ${p.detail}`)).toEqual([]);
  });

  it('really branches on the dealer', () => {
    expect(report.chanceNodes).toBeGreaterThan(0);
  });

  it('can reach all four endings', () => {
    for (const [ending, n] of Object.entries(report.endings)) expect(n, ending).toBeGreaterThan(0);
  });

  it('deals every encounter and inspection somewhere', () => {
    const all = [...ENCOUNTERS.map((e) => e.id), ...INSPECTIONS.map((i) => i.id)];
    expect(all.filter((id) => !report.seenCards.has(id))).toEqual([]);
  });

  it('offers every approach somewhere', () => {
    const missing: string[] = [];
    for (const card of [...ENCOUNTERS, ...INSPECTIONS])
      for (const a of card.approaches) if (!report.offered.get(card.id)?.get(a.id)) missing.push(`${card.id}.${a.id}`);
    expect(missing).toEqual([]);
  });

  it('stays inside the decision budget', () => {
    expect(report.maxDecisions).toBeLessThanOrEqual(14);
  });

  it('lets every setup reach at least tooLate whatever the deal', () => {
    const atLeast = ENDING_RANK.indexOf('tooLate');
    const bad = report.setups.filter((s) => ENDING_RANK.indexOf(s.guaranteed) < atLeast);
    expect(bad.map((s) => s.setup)).toEqual([]);
  });

  it('never rates the guaranteed ending above the lucky one', () => {
    expect(report.setups.filter((s) => ENDING_RANK.indexOf(s.guaranteed) > ENDING_RANK.indexOf(s.best))).toEqual([]);
  });
});

describe('the walker itself', () => {
  it('flags a broken state', () => {
    const s = newRun(allSetups()[0]);
    expect(checkState({ ...s, scrutiny: 9 })).toHaveLength(1);
    expect(checkState({ ...s, time: -1, used: ['nope' as never] })).toHaveLength(2);
    expect(checkState({ ...s, ending: 'homeInTime' })).not.toEqual([]);
    expect(checkState({ ...s, reaction: [{ key: 'no.such.key' }] })).toEqual(['missing text: no.such.key']);
  });

  it('tries every pick the dealer could make', () => {
    // Walk one run until the dealer has a real choice, then expect one outcome per card.
    let s = newRun(allSetups()[0]);
    for (let i = 0; i < 200 && !s.ending; i++) {
      const a = legalActions(s)[0];
      const next = outcomes(s, a);
      if (next.length > 1) {
        const ids = next.map((n) => JSON.stringify(n.state.screen));
        expect(new Set(ids).size).toBe(next.length);
        expect(ids).toContain(JSON.stringify(step(s, a).screen));
        return;
      }
      s = next[0].state;
    }
    throw new Error('no dealer choice on the first-option path');
  });
});
