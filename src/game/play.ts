// The engine's outside face: tryStep() checks an action is legal, plays it and
// says what happened as events, and replay() rebuilds a run from its record.
// The UI can animate the events; tests read them. step() stays the raw rule.

import { deskOf, factIds, legalActions, newRun, step } from './engine';
import { changeLines } from './consequence';
import { CHARACTERS } from './content/world';
import type { RunSetup } from './engine';
import { randomDealer } from './rng';
import type { Dealer } from './rng';
import type { Action, CheckId, Checkpoint, ClaimId, ContactId, EndingId, EvidenceId, FactId, RunState } from './types';

/**
 * Bump when rules or content change in a way that changes how a run plays, so
 * a saved replay from an older build is flagged instead of silently diverging.
 */
export const CONTENT_VERSION = 6;

export type GameEvent =
  | { type: 'timeSpent'; hours: number }
  | { type: 'scrutinyChanged'; from: number; to: number }
  | { type: 'documentUsed'; id: EvidenceId }
  | { type: 'contactExposed'; id: ContactId }
  | { type: 'factRecorded'; id: FactId }
  /** A desk ahead learned the fact: through the shared records (records bulletin) or a call or printout from this desk. */
  | { type: 'factSent'; id: FactId; desks: Checkpoint[]; via: 'records' | 'desk' }
  | { type: 'claimRecorded'; id: ClaimId }
  | { type: 'medicineLost' }
  | { type: 'perkUsed' }
  | { type: 'checkStarted'; id: CheckId }
  | { type: 'checkResolved'; id: CheckId; result: string }
  | { type: 'cardDealt'; id: string }
  | { type: 'inspectionStarted'; id: string }
  | { type: 'checkpointReached'; index: number }
  | { type: 'runEnded'; ending: EndingId };

export type Rejection = 'runOver' | 'notAllowed';

export type StepResult =
  | { ok: true; state: RunState; events: GameEvent[] }
  | { ok: false; state: RunState; reason: Rejection };

export const sameAction = (a: Action, b: Action) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Plays `action` if it is legal right now. An action from an earlier screen, a
 * spent document, an exposed contact or a double tap is rejected and the state
 * is returned untouched, so nothing is ever spent twice.
 */
export function tryStep(s: RunState, action: Action, dealer: Dealer = randomDealer): StepResult {
  if (s.ending) return { ok: false, state: s, reason: 'runOver' };
  if (!legalActions(s).some((a) => sameAction(a, action))) return { ok: false, state: s, reason: 'notAllowed' };
  const n = step(s, action, dealer);
  return { ok: true, state: n, events: eventsBetween(s, n, action) };
}

/**
 * step() plus what it changed, for the screen: while a reaction shows, `changes`
 * holds its lines ("1 hour lost."), and any step that clears the reaction clears
 * them. The game and the transcript move a run with this.
 */
export function playStep(s: RunState, action: Action, dealer: Dealer = randomDealer): RunState {
  const n = step(s, action, dealer);
  if (n === s) return s;
  const changes = n.reaction ? changeLines(eventsBetween(s, n, action), CHARACTERS[n.character].protectedContact) : null;
  return { ...n, changes };
}

const added = <T>(before: T[], after: T[]) => after.filter((x) => !before.includes(x));

/** What changed from `s` to `n`, in the order a player would notice it. */
export function eventsBetween(s: RunState, n: RunState, action: Action): GameEvent[] {
  const ev: GameEvent[] = [];
  if (action.type === 'waitAction' && s.screen.kind === 'wait')
    ev.push({ type: 'checkResolved', id: s.screen.check, result: action.action === 'assist' ? 'clear' : s.screen.resolved.result });
  for (const id of added(s.used, n.used)) ev.push({ type: 'documentUsed', id });
  for (const id of added(s.exposed, n.exposed)) ev.push({ type: 'contactExposed', id });
  if (!s.perkUsed && n.perkUsed) ev.push({ type: 'perkUsed' });
  if (n.time < s.time) ev.push({ type: 'timeSpent', hours: s.time - n.time });
  if (n.scrutiny !== s.scrutiny) ev.push({ type: 'scrutinyChanged', from: s.scrutiny, to: n.scrutiny });
  for (const id of added(s.claims, n.claims)) ev.push({ type: 'claimRecorded', id });
  for (const id of added(factIds(s), factIds(n))) ev.push({ type: 'factRecorded', id });
  const here = deskOf(s);
  for (const id of factIds(n)) {
    const desks = added(s.facts[id] ?? [], n.facts[id] ?? []).filter((d) => d !== here);
    if (desks.length) ev.push({ type: 'factSent', id, desks, via: s.bulletin === 'records' ? 'records' : 'desk' });
  }
  if (s.medicine && !n.medicine) ev.push({ type: 'medicineLost' });
  if (n.checkpoint !== s.checkpoint) ev.push({ type: 'checkpointReached', index: n.checkpoint });
  if (n.screen.kind === 'wait' && s.screen.kind !== 'wait') ev.push({ type: 'checkStarted', id: n.screen.check });
  if (n.inspections > s.inspections && n.screen.kind === 'inspection') ev.push({ type: 'inspectionStarted', id: n.screen.id });
  else if (n.screen.kind === 'encounter' && JSON.stringify(n.screen) !== JSON.stringify(s.screen))
    ev.push({ type: 'cardDealt', id: n.screen.id });
  if (n.ending && !s.ending) ev.push({ type: 'runEnded', ending: n.ending });
  return ev;
}

/** One move in a replay: the action, plus the dealer's picks when they were scripted. */
export interface Move {
  action: Action;
  /** Index the dealer picked at each random draw in this step; absent means the seeded dealer. */
  picks?: number[];
}

/** Everything needed to rebuild a run exactly, or reproduce a failure. */
export interface ReplayRecord {
  contentVersion: number;
  setup: RunSetup;
  moves: Move[];
}

export const scriptedDealer = (picks: number[]): Dealer => {
  let i = 0;
  return (rng, size) => {
    const index = picks[i++] ?? 0;
    if (index >= size) throw new Error(`replay pick ${index} but only ${size} cards to deal`);
    return { index, rng };
  };
};

/** Rebuilds a run. Throws on a record from another content version or an illegal move. */
export function replay(record: ReplayRecord): RunState {
  if (record.contentVersion !== CONTENT_VERSION)
    throw new Error(`replay is for content v${record.contentVersion}, this build is v${CONTENT_VERSION}`);
  let s = newRun(record.setup);
  record.moves.forEach((m, i) => {
    const r = tryStep(s, m.action, m.picks ? scriptedDealer(m.picks) : randomDealer);
    if (!r.ok) throw new Error(`move ${i} ${JSON.stringify(m.action)} rejected: ${r.reason}`);
    s = r.state;
  });
  return s;
}
