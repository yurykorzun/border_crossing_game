// Walks every reachable state of every setup. Used by the branch test and
// `npm run walk`. States that differ only in their log are merged, so the walk
// stays small even though the number of distinct paths is large.

import { legalActions, newRun, step } from './engine';
import type { RunSetup } from './engine';
import type { CharacterId, EndingId, EvidenceId, RunState } from './types';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS } from './content/world';

export function combinations<T>(list: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const [head, ...rest] = list;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

export function allSetups(seeds: number[] = [1, 2, 3, 4]): RunSetup[] {
  const out: RunSetup[] = [];
  for (const character of CHARACTER_IDS as CharacterId[])
    for (const loadout of combinations<EvidenceId>(EVIDENCE_IDS, CHARACTERS[character].evidenceSlots))
      for (const bulletin of BULLETINS) for (const seed of seeds) out.push({ character, loadout, bulletin, seed });
  return out;
}

export interface WalkReport {
  states: number;
  endings: Record<EndingId, number>;
  deadEnds: { setup: RunSetup; state: RunState }[];
  maxDecisions: number;
  seenCards: Set<string>;
  /** card id -> approach id -> times it was available */
  offered: Map<string, Map<string, number>>;
}

const key = (s: RunState) => JSON.stringify({ ...s, log: undefined, reaction: s.reaction ? 1 : 0 });

export function walk(setups: RunSetup[] = allSetups()): WalkReport {
  const report: WalkReport = {
    states: 0,
    endings: { homeInTime: 0, homeAtCost: 0, tooLate: 0, turnedBack: 0 },
    deadEnds: [],
    maxDecisions: 0,
    seenCards: new Set(),
    offered: new Map(),
  };
  for (const setup of setups) {
    const seen = new Set<string>();
    const stack: RunState[] = [newRun(setup)];
    while (stack.length) {
      const s = stack.pop()!;
      const k = key(s);
      if (seen.has(k)) continue;
      seen.add(k);
      report.states++;
      if (s.screen.kind === 'encounter' || s.screen.kind === 'inspection') report.seenCards.add(s.screen.id);
      if (s.ending) {
        report.endings[s.ending]++;
        report.maxDecisions = Math.max(report.maxDecisions, s.decisions);
        continue;
      }
      const actions = legalActions(s);
      if (!actions.length) {
        report.deadEnds.push({ setup, state: s });
        continue;
      }
      for (const a of actions) {
        if (a.type === 'choose' && !s.reaction) {
          const id = (s.screen as { id: string }).id;
          const m = report.offered.get(id) ?? new Map<string, number>();
          m.set(a.approach, (m.get(a.approach) ?? 0) + 1);
          report.offered.set(id, m);
        }
        const n = step(s, a);
        if (n === s) {
          report.deadEnds.push({ setup, state: s });
          continue;
        }
        stack.push(n);
      }
    }
  }
  return report;
}
