import { describe, expect, it } from 'vitest';
import { walk } from './walk';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';

// One walk shared by every assertion: it covers every character, loadout,
// bulletin and four seeds.
const report = walk();

describe('every branch', () => {
  it('never reaches a screen with nothing to do', () => {
    expect(report.deadEnds.map((d) => ({ setup: d.setup, screen: d.state.screen }))).toEqual([]);
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
});
