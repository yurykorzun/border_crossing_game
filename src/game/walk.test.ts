import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/design.md?raw';
import { ENDING_RANK, allSetups, checkState, neverPicked, outcomes, walk, warningShares } from './walk';
import { pickedAnswers } from './bots';
import { legalActions, newRun, step } from './engine';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { BULLETINS, BULLETIN_TOPICS } from './content/world';
import { LEVELS, LEVEL_IDS } from './content/levels';
import { t } from '../i18n';

// One walk per level shared by every assertion: every character, packing and
// bulletin, every player choice and every card the dealer could deal (about 11 s a level).
for (const level of LEVEL_IDS) {
  const report = walk(allSetups(level));
  const cards = new Set(LEVELS[level].cards);

  describe(`every possible run in ${level}`, () => {
    it('covers every setup', () => {
      expect(report.setups.length).toBe(allSetups(level).length);
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

    it('deals every encounter and inspection the level lists somewhere, and nothing else', () => {
      const all = [...ENCOUNTERS.map((e) => e.id), ...INSPECTIONS.map((i) => i.id)];
      expect(all.filter((id) => cards.has(id) && !report.seenCards.has(id))).toEqual([]);
      // Follow-ups come from what was dealt, so only routine, related and inspection cards are held to the list.
      const dealtOutside = [...report.seenCards].filter((id) => !cards.has(id) && ENCOUNTERS.find((e) => e.id === id)?.kind !== 'followup');
      expect(dealtOutside).toEqual([]);
    });

    it('offers every approach somewhere', () => {
      const missing: string[] = [];
      for (const card of [...ENCOUNTERS, ...INSPECTIONS].filter((c) => cards.has(c.id)))
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

    it('makes every bulletin warning worth heeding: covering packings reach homeInTime more often', () => {
      // Like with like: within one character, because characters differ in
      // difficulty and every Mark packing covers accommodation, so a pooled
      // comparison would put Mark's extra scrutiny on the covered side.
      const shares = warningShares(report.setups);
      expect(shares.map((w) => w.bulletin)).toEqual(BULLETINS);
      for (const w of shares) {
        const compared = w.byCharacter.filter((c) => c.coveredCount * c.ignoredCount > 0);
        expect(compared.length, `${w.bulletin}: no character has packings on both sides`).toBeGreaterThan(0);
        for (const c of compared)
          expect(c.covered, `${w.bulletin} / ${c.character}: covered ${c.covered} vs ignored ${c.ignored}`).toBeGreaterThan(c.ignored);
      }
    });

    it('gives every bulletin a warning string and a warned topic', () => {
      for (const b of BULLETINS) {
        expect(t(`bulletin.${b}`).trim(), b).not.toBe('');
        expect(BULLETIN_TOPICS[b], b).toBeDefined();
      }
    });

    it('never rates the guaranteed ending above the lucky one', () => {
      expect(report.setups.filter((s) => ENDING_RANK.indexOf(s.guaranteed) > ENDING_RANK.indexOf(s.best))).toEqual([]);
    });
  });

  describe(`answers no style of play picks in ${level}`, () => {
    const picked = pickedAnswers(undefined, undefined, level);

    it.runIf(level === 'arrival')('lists an answer that no style picks', () => {
      // Take an answer the bots do pick out of their picks: the report must then name it.
      expect(report.offered.get('p_purpose')?.has('tourism')).toBe(true);
      expect(picked.has('p_purpose.tourism')).toBe(true);
      const without = new Set([...picked].filter((k) => k !== 'p_purpose.tourism'));
      expect(neverPicked(report.offered, without)).toContain('p_purpose.tourism');
      expect(neverPicked(report.offered, picked)).not.toContain('p_purpose.tourism');
    });

    it('keeps only answers docs/design.md names with a reason', () => {
      // Each one left is named on a list line of the "Answers no style picks" section,
      // among the ids before the " - " that starts the reason.
      const doc: string = designDoc;
      const at = doc.indexOf('\n## Answers no style picks\n');
      expect(at).toBeGreaterThanOrEqual(0);
      const end = doc.indexOf('\n## ', at + 1);
      const named = doc.slice(at, end < 0 ? undefined : end).split('\n')
        .filter((l) => l.startsWith('- ') && l.includes(' - '))
        .map((l) => l.slice(2, l.indexOf(' - ')));
      const missing = neverPicked(report.offered, picked).filter((a) => !named.some((ids) => ids.includes(`\`${a}\``)));
      expect(missing).toEqual([]);
    });
  });
}

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
