import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/design.md?raw';
import { ENDING_RANK, allSetups, checkState, fairnessProblems, mergeReports, neverPicked, outcomes, requirementAnswers, walk, walkGroups, walkSetups, warningShares } from './walk';
import type { WalkReport } from './walk';
import type { RunSetup } from './engine';
import { pickedAnswers } from './bots';
import { legalActions, newRun, step } from './engine';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { BULLETINS, BULLETIN_TOPICS, DESTINATIONS, DESTINATION_IDS } from './content/world';
import { LEVELS, LEVEL_IDS } from './content/levels';
import { t } from '../i18n';
import type { RunState } from './types';

// Node's worker threads, which src/ has no types for: the test runner always runs on Node.
interface Worker {
  once(event: 'message', on: (report: WalkReport) => void): void;
  once(event: 'error', on: (e: Error) => void): void;
  terminate(): Promise<number>;
}
type Threads = { Worker: new (url: URL, options: { workerData: unknown }) => Worker };
const { Worker } = (globalThis as unknown as { process: { getBuiltinModule(id: string): Threads } }).process.getBuiltinModule('node:worker_threads');

/** walk(setups) on a worker thread (walk.worker.mjs). */
const walkAside = (setups: RunSetup[]) =>
  new Promise<WalkReport>((done, fail) => {
    const worker = new Worker(new URL('./walk.worker.mjs', import.meta.url), { workerData: setups });
    worker.once('message', (report) => {
      done(report);
      void worker.terminate();
    });
    worker.once('error', fail);
  });

// One walk per level shared by every assertion: every character, packing and
// bulletin, at every destination in Arrival, every player choice and every card the dealer could deal.
for (const level of LEVEL_IDS) {
  // Each group of setups the rules tell apart (walkGroups(): in Arrival the North, and the Capital
  // with the South) walks on its own thread at the same time, because their runs never merge and
  // one thread for all three took about 135 s while every other test file loads.
  const started = Date.now();
  const [here, ...aside] = walkGroups(walkSetups(level));
  const others = aside.map(walkAside);
  const report = mergeReports([walk(here), ...(await Promise.all(others))]);
  const seconds = (Date.now() - started) / 1000;
  const cards = new Set(LEVELS[level].cards);

  describe(`every possible run in ${level}`, () => {
    it('covers every setup', () => {
      expect(report.setups.length).toBe(walkSetups(level).length);
    });

    if (LEVELS[level].destinations)
      it('covers all three destinations with the fairness rules, under 120 s', () => {
        expect(new Set(report.setups.map((s) => s.setup.destination))).toEqual(new Set(DESTINATION_IDS));
        expect(DESTINATION_IDS).toHaveLength(3);
        // Each standing rule's card was shown at its destination and offered a costly answer without a document.
        for (const d of DESTINATION_IDS)
          for (const r of DESTINATIONS[d].requirements) {
            expect(report.requirements.get(r.id)?.shown, r.id).toBeGreaterThan(0);
            expect(report.requirements.get(r.id)?.costly, r.id).toBeGreaterThan(0);
          }
        expect(report.problems.filter((p) => p.rule === 'fairness').map((p) => p.detail)).toEqual([]);
        expect(seconds).toBeLessThan(120);
      });

    it('breaks no rule in any reachable state', () => {
      // bounds, subsets, no dead ends, no loops, every action moves, endings match
      // the state, every reaction line has English text, the engine never throws
      // Each problem carries a replay record; `npm run walk` saves the first to walk-failure.json.
      expect(report.problems.map((p) => `${p.rule}: ${p.detail}`)).toEqual([]);
    });

    // dap.31: every approach of every reachable state, through afterAnswerLines() in checkMove().
    if (level === 'arrival' || level === 'departure')
      it('shows after-answer lines only for what the answer touched', () => {
        const lines = report.problems.filter((p) => /Checks out|settles \[|bag search/.test(p.detail));
        expect(lines.map((p) => p.detail)).toEqual([]);
        // The rule was really exercised: clean passes shown, questions settled, bag searches answered.
        expect(report.afterAnswer.checksOut).toBeGreaterThan(0);
        expect(report.afterAnswer.settles).toBeGreaterThan(0);
        if (level === 'departure') expect(report.afterAnswer.bagSearches).toBeGreaterThan(0);
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
      expect(report.offered.get('p_purpose')?.has('shortTrip')).toBe(true);
      expect(picked.has('p_purpose.shortTrip')).toBe(true);
      const without = new Set([...picked].filter((k) => k !== 'p_purpose.shortTrip'));
      expect(neverPicked(report.offered, without)).toContain('p_purpose.shortTrip');
      expect(neverPicked(report.offered, picked)).not.toContain('p_purpose.shortTrip');
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
  it('flags each broken fairness rule of the destinations', () => {
    const setups = walkSetups('arrival').filter((x) => x.destination === 'north').slice(0, 1);
    const requirements = new Map(DESTINATION_IDS.flatMap((d) => DESTINATIONS[d].requirements.map((r) => [r.id, { shown: 1, costly: 1 }] as [string, { shown: number; costly: number }])));
    const fine = { setup: setups[0], guaranteed: 'tooLate' as const, best: 'homeAtCost' as const, homeChance: 0 };
    expect(fairnessProblems({ setups: [fine], requirements }, setups)).toEqual([]);
    // A setup that can be turned back whatever you do, or never gets home.
    expect(fairnessProblems({ setups: [{ ...fine, guaranteed: 'turnedBack' }], requirements }, setups)).toEqual([expect.stringMatching(/guarantees only turnedBack/)]);
    expect(fairnessProblems({ setups: [{ ...fine, best: 'tooLate' }], requirements }, setups)).toEqual([expect.stringMatching(/can reach only tooLate/)]);
    // A standing rule whose card never shows, or only ever offers free or document answers there.
    const unseen = new Map(requirements).set('north.sponsor', { shown: 0, costly: 0 });
    expect(fairnessProblems({ setups: [fine], requirements: unseen }, setups)).toEqual(['north.sponsor: p_host is never shown going to north']);
    const free = new Map(requirements).set('north.electronics', { shown: 4, costly: 0 });
    expect(fairnessProblems({ setups: [fine], requirements: free }, setups)).toEqual(['north.electronics: c_phone never offers an answer without a document that costs something']);
  });

  it("finds an answer without a document on a standing rule's card, with or without your mother named", () => {
    const s = { ...newRun({ ...allSetups()[0], destination: 'north', loadout: ['motherLetter', 'hotel', 'deed'] }), screen: { kind: 'encounter', id: 'p_host' } } as RunState;
    expect(requirementAnswers(s)).toEqual([]);
    expect(requirementAnswers({ ...s, exposed: ['mother'] })).toEqual([]);
    expect(requirementAnswers({ ...s, exposed: ['mother'], facts: { familyAddress: ['passport'] } })).toEqual([]);
  });

  it('flags a broken state', () => {
    const s = newRun(allSetups()[0]);
    expect(checkState({ ...s, scrutiny: 9 })).toHaveLength(1);
    expect(checkState({ ...s, time: -1, used: ['nope' as never] })).toHaveLength(2);
    expect(checkState({ ...s, ending: 'homeInTime' })).not.toEqual([]);
    expect(checkState({ ...s, reaction: [{ key: 'no.such.key' }] })).toEqual(['missing text: no.such.key']);
  });

  it('flags a second inspection at a desk that already ran one, and allows one each at two desks', () => {
    const s = newRun(allSetups()[0]);
    // The step: customs already ran an inspection, and now starts another.
    const repeat: RunState = { ...s, checkpoint: 1, inspections: 2, inspectedAt: ['customs', 'customs'] };
    expect(checkState(repeat)).toContain('second inspection at the same desk: [customs] in [customs,customs]');
    const twoDesks: RunState = { ...s, checkpoint: 1, inspections: 2, inspectedAt: ['passport', 'customs'] };
    expect(checkState(twoDesks)).toEqual(checkState({ ...s, checkpoint: 1 }));
    expect(checkState(twoDesks).filter((d) => d.includes('inspection'))).toEqual([]);
    // Two inspections with a desk missing from the record could be a repeat, so it fails.
    expect(checkState({ ...s, inspections: 2, inspectedAt: ['passport'] })).toContain('2 inspections but desks on record [passport]');
    expect(checkState({ ...s, inspections: 1 })).toEqual(checkState(s));
  });

  it('tries every pick the dealer could make', () => {
    // Walk one run until the dealer has a real choice, then expect one outcome per pick: a card
    // dealt, or the claim a spot-check picks (same screen, its own reaction line).
    let s = newRun(allSetups()[0]);
    for (let i = 0; i < 200 && !s.ending; i++) {
      const a = legalActions(s)[0];
      const next = outcomes(s, a);
      if (next.length > 1) {
        const shown = (x: RunState) => JSON.stringify([x.screen, x.reaction]);
        const ids = next.map((n) => shown(n.state));
        expect(new Set(ids).size).toBe(next.length);
        expect(ids).toContain(shown(step(s, a)));
        return;
      }
      s = next[0].state;
    }
    throw new Error('no dealer choice on the first-option path');
  });
});
