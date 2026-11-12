// First-run explanations (dap.9): one short line on how time, scrutiny and a
// caught claim work, shown the first time each one matters and never again once
// seen. The save keeps the ones shown (SaveData.explained), so a second run shows
// none. Each line is explain.<id> in src/i18n/en.ts.
//
// - time: the first reaction that loses an hour ("1 hour lost.").
// - scrutiny: the first reaction that moves scrutiny ("Scrutiny 2/3."). Scrutiny
//   only drops after reaching 3, so the first move is always a rise.
// - caught: the first challenge card, where a record speaks against what you said.

import { caughtLine } from './consequence';
import type { RunState } from './types';

export const EXPLANATIONS = ['time', 'scrutiny', 'caught'] as const;
export type Explanation = (typeof EXPLANATIONS)[number];

/** The explanations this screen is the trigger for, whether or not they were shown before. */
export function explanationsOn(s: RunState): Explanation[] {
  if (s.ending && !s.reaction) return [];
  if (s.reaction) {
    const keys = (s.changes ?? []).map((c) => c.key);
    return EXPLANATIONS.filter((e) => (e === 'time' && keys.includes('change.time')) || (e === 'scrutiny' && keys.includes('change.scrutiny')));
  }
  const sc = s.screen;
  if (sc.kind === 'encounter' && !s.documentList && caughtLine(s, sc.id)?.key.startsWith('caught.line.')) return ['caught'];
  return [];
}

/** The explanations to show on this screen: its triggers not yet shown on this save. */
export const explanationsDue = (s: RunState, shown: readonly string[]): Explanation[] =>
  explanationsOn(s).filter((e) => !shown.includes(e));

/** The shown list after this screen, so each explanation is shown once. */
export function markShown(shown: readonly string[], due: readonly Explanation[]): string[] {
  const fresh = due.filter((e) => !shown.includes(e));
  return fresh.length ? [...shown, ...fresh] : [...shown];
}
