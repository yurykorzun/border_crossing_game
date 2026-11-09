// Plays every possible run of every setup: every player choice and every card
// the dealer could deal. Used by walk.test.ts and `npm run walk`.
//
// The dealer is the only randomness that matters (wait beats are cosmetic), so
// each action is replayed with a scripted dealer until every pick has been
// tried. States that differ only in log, rng or beat order are merged, which
// keeps the walk small even though the number of distinct paths is huge.
//
// It checks `checkState` at every state and `checkMove` on every move. Anything
// broken goes into `problems` with a replay record (content version, setup,
// seed, moves with dealer picks), so `replay(problem.repro)` reproduces it.
//
// What this proves: rule and structural correctness for every reachable state.
// What it does not: balance (bots) or whether the game feels right (people).

import {
  checkEffects, checkFindings, currentCard, deskOf, endingFor, factIds, knows, legalActions, newRun, nextDesk, options, topicOf,
} from './engine';
import type { RunSetup } from './engine';
import type { Dealer } from './rng';
import type { Action, CharacterId, ClaimId, Effect, EndingId, EvidenceId, FactId, RunState } from './types';
import { CHECKPOINTS } from './types';
import {
  BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, MAX_SCRUTINY, START_TIME, canConfirm,
} from './content/world';
import { CHECKS, DISPROOFS, INCONSISTENCIES } from './content/encounters';
import { t } from '../i18n';
import { CONTENT_VERSION, tryStep } from './play';
import type { Move, ReplayRecord } from './play';

export function combinations<T>(list: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const [head, ...rest] = list;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

/** Every character x packing x bulletin. The seed only moves cosmetic beats here. */
export function allSetups(): RunSetup[] {
  const out: RunSetup[] = [];
  for (const character of CHARACTER_IDS as CharacterId[])
    for (const loadout of combinations<EvidenceId>(EVIDENCE_IDS, CHARACTERS[character].evidenceSlots))
      for (const bulletin of BULLETINS) out.push({ character, loadout, bulletin, seed: 1 });
  return out;
}

/** Worst to best, so a higher rank is a better ending. */
export const ENDING_RANK: EndingId[] = ['turnedBack', 'tooLate', 'homeAtCost', 'homeInTime'];

export interface Outcome {
  state: RunState;
  /** The dealer's pick at each random draw that led here. */
  picks: number[];
  /** Why the engine refused the move, if it did. */
  rejected?: string;
}

/**
 * Every state `action` can lead to from `s`, one per possible run of dealer
 * picks. A step makes at most a few picks, so this counts through them like an
 * odometer: replay, then bump the last pick that still has options left.
 */
export function outcomes(s: RunState, action: Action): Outcome[] {
  const out: Outcome[] = [];
  let script: number[] = [];
  for (;;) {
    const sizes: number[] = [];
    const dealer: Dealer = (rng, size) => {
      const index = script[sizes.length] ?? 0;
      sizes.push(size);
      return { index, rng };
    };
    const r = tryStep(s, action, dealer);
    const used = sizes.map((_, i) => script[i] ?? 0);
    out.push(r.ok ? { state: r.state, picks: used } : { state: s, picks: used, rejected: r.reason });
    let j = used.length - 1;
    while (j >= 0 && used[j] + 1 >= sizes[j]) j--;
    if (j < 0) return out;
    script = [...used.slice(0, j), used[j] + 1];
  }
}

export interface Problem {
  rule: string;
  detail: string;
  /** Replays to the state where the rule broke: `replay(repro)`. */
  repro: ReplayRecord;
}

export interface SetupResult {
  setup: RunSetup;
  /** Best ending the player can force whatever the dealer deals. */
  guaranteed: EndingId;
  /** Best ending with the luckiest deal. */
  best: EndingId;
}

export interface WalkReport {
  states: number;
  endings: Record<EndingId, number>;
  problems: Problem[];
  maxDecisions: number;
  maxInspections: number;
  seenCards: Set<string>;
  /** card id -> approach id -> times it was available */
  offered: Map<string, Map<string, number>>;
  setups: SetupResult[];
  /** (state, action) pairs where the dealer had more than one card to deal. */
  chanceNodes: number;
}

/**
 * Facts for the merge key: which came out, and which desks from here on know
 * them. A desk already passed never reads its facts again, so runs that differ
 * only there play the same from now on.
 */
const factsKey = (s: RunState) =>
  factIds(s).sort().map((f) => `${f}:${(s.facts[f] ?? []).filter((d) => CHECKPOINTS.indexOf(d) >= s.checkpoint)}`).join();

const key = (s: RunState) =>
  JSON.stringify({
    ...s,
    facts: factsKey(s),
    seed: 0,
    rng: 0,
    log: 0,
    reaction: s.reaction ? 1 : 0,
    screen: s.screen.kind === 'wait' ? { ...s.screen, beats: s.screen.beats.length } : s.screen,
  });

const unique = <T>(list: T[]) => new Set(list).size === list.length;
/** A claim and a fact that catches it, the fact known by the official at this desk. */
const holds = (pairs: readonly [ClaimId, FactId][], s: RunState) => pairs.some(([c, f]) => s.claims.includes(c) && knows(s, f));

/** Cards that challenge a claim, and the claim and fact pairs that let them be dealt. */
const CHALLENGES: Record<string, readonly [ClaimId, FactId][]> = { i_clarify: INCONSISTENCIES, i_contradiction: DISPROOFS };

/** The effects a move applied, or null for a move that applies none of its own (ack, beat). An assisted check applies only its findings. */
function moveEffects(s: RunState, action: Action): Effect[] | null {
  if (action.type === 'choose') return options(s).find((o) => o.approach.id === action.approach)?.effects ?? null;
  if (action.type === 'waitAction' && s.screen.kind === 'wait')
    return action.action === 'assist' ? checkFindings(s, s.screen.check, s.screen.resolved) : checkEffects(s, s.screen.check, s.screen.resolved);
  return null;
}
const keeps = <T>(before: T[], after: T[]) => before.every((x) => after.includes(x));

/** The rules every reachable state must keep. Returns what is broken. */
export function checkState(s: RunState): string[] {
  const bad: string[] = [];
  const ch = CHARACTERS[s.character];
  if (s.time < 0 || s.time > START_TIME) bad.push(`time ${s.time} outside 0..${START_TIME}`);
  if (s.scrutiny < 0 || s.scrutiny > MAX_SCRUTINY) bad.push(`scrutiny ${s.scrutiny} outside 0..${MAX_SCRUTINY}`);
  if (!s.used.every((id) => s.loadout.includes(id)) || !unique(s.used)) bad.push(`used ${s.used} not a subset of loadout`);
  if (!s.exposed.every((c) => ch.contacts.includes(c)) || !unique(s.exposed)) bad.push(`exposed ${s.exposed} not a subset of contacts`);
  if (!unique(s.claims) || !unique(s.seen)) bad.push('claims or seen repeat');
  // Every fact is known somewhere, each desk once, in crossing order.
  for (const f of factIds(s)) {
    const desks = s.facts[f] ?? [];
    if (!desks.length || desks.join() !== CHECKPOINTS.filter((d) => desks.includes(d)).join()) bad.push(`${f} known at [${desks}]`);
  }
  if ((s.screen.kind === 'encounter' || s.screen.kind === 'inspection') && !currentCard(s)) bad.push(`unknown card ${s.screen.id}`);
  // A clarify card needs an inconsistency on file, a contradiction card a disproof.
  const pairs = s.screen.kind === 'encounter' ? CHALLENGES[s.screen.id] : undefined;
  if (pairs && !holds(pairs, s))
    bad.push(`${(s.screen as { id: string }).id} dealt with claims [${s.claims}] and ${deskOf(s)} knowing [${factIds(s).filter((f) => knows(s, f))}]`);
  if (s.ending) {
    if (s.screen.kind !== 'ending') bad.push(`ending ${s.ending} on a ${s.screen.kind} screen`);
    if (s.ending !== endingFor(s)) bad.push(`ending ${s.ending} but the state says ${endingFor(s)}`);
    if (!s.withdrew && s.pending.length) bad.push(`run ended with follow-ups still queued: ${s.pending}`);
  } else if (s.screen.kind === 'ending') bad.push('ending screen with no ending');
  for (const line of s.reaction ?? []) {
    try {
      t(line.key, line.vars);
    } catch (e) {
      bad.push((e as Error).message);
    }
  }
  return bad;
}

/** The rules every move must keep, comparing the state before and after. */
export function checkMove(s: RunState, n: RunState, action: Action): string[] {
  const bad: string[] = [];
  if (!keeps(s.used, n.used)) bad.push('a spent document came back');
  if (!keeps(s.exposed, n.exposed)) bad.push('a contact exposure disappeared');
  if (!factIds(s).every((f) => keeps(s.facts[f] ?? [], n.facts[f] ?? [])) || !keeps(s.claims, n.claims) || !keeps(s.seen, n.seen))
    bad.push('a fact, claim or seen card disappeared');
  if (s.perkUsed && !n.perkUsed) bad.push('the once-per-run advantage came back');
  if (!s.medicine && n.medicine) bad.push('lost medicine came back');
  if (n.time > s.time) bad.push(`time went up from ${s.time} to ${n.time}`);
  if (n.inspections - s.inspections > 1) bad.push('one move started two inspections');
  if (n.inspections > s.inspections && n.screen.kind !== 'inspection') bad.push('an inspection was counted but not shown');
  if (n.decisions - s.decisions > 1) bad.push('one move counted as two decisions');
  // Only staying with family rules out the hotel.
  if (!s.used.includes('hotel') && n.used.includes('hotel') && s.claims.includes('stayingWithFamily'))
    bad.push('the hotel was shown after claiming to stay with family');
  // Every scrutiny gain has a reason officials can point at: a fact on file, or
  // the check whose result this is (or whose result dealt this card).
  const effects = moveEffects(s, action) ?? [];
  let reasoned = 0;
  for (const e of effects) {
    if (!('scrutiny' in e)) continue;
    const r = e.reason;
    const isCheck = r in CHECKS;
    const ok = isCheck
      ? (s.screen.kind === 'wait' && s.screen.check === r)
        || (s.screen.kind === 'encounter' && CHECKS[r as keyof typeof CHECKS].cases.some((c) => c.followUp === (s.screen as { id: string }).id))
      : knows(n, r as FactId, deskOf(s));
    if (!ok) bad.push(`scrutiny ${e.scrutiny} with reason ${r}, which does not hold`);
    else if (e.scrutiny > 0) reasoned += e.scrutiny;
  }
  if (n.scrutiny > s.scrutiny && !reasoned)
    bad.push(`scrutiny rose from ${s.scrutiny} to ${n.scrutiny} with no reason`);
  // A desk learns a fact only where it came out, or through a channel: the
  // records system with the records bulletin (every later desk at once), or a
  // call or printout this move sent on to the next desk.
  const here = deskOf(s);
  const sent = effects.filter((e): e is Extract<Effect, { send: unknown }> => 'send' in e);
  for (const f of factIds(n)) {
    for (const d of (n.facts[f] ?? []).filter((x) => !(s.facts[f] ?? []).includes(x))) {
      if (d === here) continue;
      const later = CHECKPOINTS.indexOf(d) > CHECKPOINTS.indexOf(here);
      if (s.bulletin === 'records' && later && knows(n, f, here)) continue;
      if (d === nextDesk(here) && knows(n, f, here) && sent.some((e) => !e.facts || e.facts.includes(f))) continue;
      bad.push(`${f} reached ${d} from ${here} through no channel`);
    }
  }
  // A contact is only named for what they can confirm: the card's topic, or the
  // check's in the waiting room. Naming a relative (namesOnly) confirms nothing.
  const named = n.exposed.filter((c) => !s.exposed.includes(c));
  if (action.type === 'choose' && named.length) {
    const o = options(s).find((x) => x.approach.id === action.approach);
    const topic = topicOf(currentCard(s));
    if (!o?.approach.namesOnly && !named.every((c) => canConfirm(c, topic)))
      bad.push(`${named} named on ${(s.screen as { id: string }).id}, which asks about ${topic ?? 'nothing they can confirm'}`);
  }
  if (action.type === 'waitAction' && action.action === 'assist' && s.screen.kind === 'wait') {
    const topic = CHECKS[s.screen.check].topic;
    if (!named.every((c) => canConfirm(c, topic))) bad.push(`${named} vouched on ${s.screen.check}, which asks about ${topic ?? 'data nobody can vouch away'}`);
    // A contact explains what a check found; the finding stays on file.
    const lost = checkFindings(s, s.screen.check, s.screen.resolved).flatMap((e) => ('fact' in e && !knows(n, e.fact, deskOf(s)) ? [e.fact] : []));
    if (lost.length) bad.push(`${lost} found by ${s.screen.check} is not on file after a contact vouched`);
  }
  // A double tap, or resolving the same check twice, must be refused.
  if ((action.type === 'choose' || action.type === 'waitAction') && tryStep(n, action).ok)
    bad.push(`${JSON.stringify(action)} could be played twice in a row`);
  return bad;
}

export function walk(setups: RunSetup[] = allSetups()): WalkReport {
  const report: WalkReport = {
    states: 0,
    endings: { homeInTime: 0, homeAtCost: 0, tooLate: 0, turnedBack: 0 },
    problems: [],
    maxDecisions: 0,
    maxInspections: 0,
    seenCards: new Set(),
    offered: new Map(),
    setups: [],
    chanceNodes: 0,
  };

  for (const setup of setups) {
    // key -> [guaranteed rank, best rank]; null while that state is being explored
    const memo = new Map<string, [number, number] | null>();
    const path: Move[] = [];
    const problem = (rule: string, detail: string, extra?: Move) => {
      if (report.problems.length >= 50) return;
      const moves = extra ? [...path, extra] : [...path];
      report.problems.push({ rule, detail, repro: { contentVersion: CONTENT_VERSION, setup, moves } });
    };

    const visit = (s: RunState): [number, number] => {
      const k = key(s);
      const known = memo.get(k);
      if (known) return known;
      if (known === null) {
        problem('every run ends', `state repeats on its own path at ${JSON.stringify(s.screen)}`);
        return [0, 0];
      }
      memo.set(k, null);
      report.states++;
      for (const d of checkState(s)) problem('state rules', d);
      if (s.screen.kind === 'encounter' || s.screen.kind === 'inspection') report.seenCards.add(s.screen.id);

      let value: [number, number];
      const actions = legalActions(s);
      if (s.ending) {
        report.endings[s.ending]++;
        report.maxDecisions = Math.max(report.maxDecisions, s.decisions);
        report.maxInspections = Math.max(report.maxInspections, s.inspections);
        const rank = ENDING_RANK.indexOf(s.ending);
        value = [rank, rank];
        for (const a of [{ type: 'ack' }, { type: 'beat' }] as Action[])
          if (tryStep(s, a).ok) problem('the end is final', `${JSON.stringify(a)} accepted after the ending`);
      } else if (!actions.length) {
        problem('no dead ends', `nothing to do on ${JSON.stringify(s.screen)}`);
        value = [0, 0];
      } else {
        value = [-1, -1];
        for (const a of actions) {
          if (a.type === 'choose' && !s.reaction) {
            const id = (s.screen as { id: string }).id;
            const m = report.offered.get(id) ?? new Map<string, number>();
            m.set(a.approach, (m.get(a.approach) ?? 0) + 1);
            report.offered.set(id, m);
          }
          let worst = Infinity;
          let best = -1;
          let next: Outcome[];
          try {
            next = outcomes(s, a);
          } catch (e) {
            problem('engine never throws', (e as Error).message, { action: a });
            continue;
          }
          if (next.length > 1) report.chanceNodes++;
          for (const o of next) {
            const move = { action: a, picks: o.picks };
            if (o.rejected) {
              problem('legal actions are accepted', `${JSON.stringify(a)} rejected: ${o.rejected}`, move);
              continue;
            }
            if (o.state === s) {
              problem('every action moves', `${JSON.stringify(a)} changed nothing on ${JSON.stringify(s.screen)}`, move);
              continue;
            }
            for (const d of checkMove(s, o.state, a)) problem('move rules', d, move);
            path.push(move);
            const [g, b] = visit(o.state);
            path.pop();
            worst = Math.min(worst, g);
            best = Math.max(best, b);
          }
          if (best >= 0) value = [Math.max(value[0], worst), Math.max(value[1], best)];
        }
        if (value[1] < 0) value = [0, 0];
      }
      memo.set(k, value);
      return value;
    };

    let start: RunState;
    try {
      start = newRun(setup);
    } catch (e) {
      problem('setup starts', (e as Error).message);
      continue;
    }
    const value = visit(start);
    report.setups.push({ setup, guaranteed: ENDING_RANK[value[0]], best: ENDING_RANK[value[1]] });
  }
  return report;
}
