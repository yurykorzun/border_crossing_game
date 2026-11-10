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
  callInsDue, check, checkEffects, checkFindings, costsOf, currentCard, deskOf, doomed, endingFor, escalates, factIds, knows, legalActions, newRun, nextDesk, noCost,
  options, routinesLeft, topicOf, travelOf,
} from './engine';
import { consequences } from './consequence';
import type { Option, RunSetup } from './engine';
import type { Dealer } from './rng';
import type { Action, BulletinId, CharacterId, ClaimId, Effect, EndingId, EvidenceId, FactId, LevelId, RunState } from './types';
import { CHECKPOINTS } from './types';
import {
  BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, LAST_HOURS, MAX_SCRUTINY, OFFICERS, canConfirm, coversWarning,
} from './content/world';
import { CHALLENGE_PAIRS, CHECKS, ENCOUNTER_BY_ID, INSPECTION_BY_ID, STATEMENTS } from './content/encounters';
import { DEFAULT_LEVEL, levelOf } from './content/levels';
import { t } from '../i18n';
import { CONTENT_VERSION, tryStep } from './play';
import type { Move, ReplayRecord } from './play';

export function combinations<T>(list: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const [head, ...rest] = list;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

/** Every character x packing x bulletin in one level, and every contact statement in a level that has them. The seed only moves cosmetic beats here. */
export function allSetups(level: LevelId = DEFAULT_LEVEL): RunSetup[] {
  const out: RunSetup[] = [];
  for (const character of CHARACTER_IDS as CharacterId[])
    for (const loadout of combinations<EvidenceId>(EVIDENCE_IDS, CHARACTERS[character].evidenceSlots))
      for (const bulletin of BULLETINS)
        for (const statement of levelOf({ level }).statements ?? [undefined])
          out.push({ level, character, loadout, bulletin, seed: 1, ...(statement ? { statement } : {}) });
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
  /**
   * Chance of homeInTime for a player who picks every answer at random, against
   * a dealer who deals at random. Unlike the two above it can tell packings apart.
   */
  homeChance: number;
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

/** The claims a contact statement is about (STATEMENTS), and the statements themselves. */
const STAY_CLAIMS: readonly ClaimId[] = STATEMENTS.flatMap((x) => [x.agrees, x.disproves]);
const STATEMENT_FACTS: readonly FactId[] = STATEMENTS.map((x) => x.fact);

/**
 * Past the passport desk, a contact statement and the stay you claimed against it
 * are spent: only p_statement reads them, no desk writes the stay down, so no
 * spot-check picks it. Runs that differ only there play the same from now on.
 */
function spent(s: RunState): RunState {
  if (s.checkpoint < 1 || !levelOf(s).statements?.length) return s;
  const keep = <T>(o: Partial<Record<ClaimId, T>> | undefined) =>
    o && Object.fromEntries(Object.entries(o).filter(([c]) => !STAY_CLAIMS.includes(c as ClaimId)));
  return {
    ...s,
    facts: Object.fromEntries(Object.entries(s.facts).filter(([f]) => !STATEMENT_FACTS.includes(f as FactId))),
    claims: s.claims.filter((c) => !STAY_CLAIMS.includes(c)),
    logged: keep(s.logged),
    saidAt: keep(s.saidAt),
    seen: s.seen.filter((id) => id !== 'p_statement'),
  };
}

const key = (state: RunState) => {
  const s = spent(state);
  return JSON.stringify({
    ...s,
    facts: factsKey(s),
    seed: 0,
    rng: 0,
    log: 0,
    reaction: s.reaction ? 1 : 0,
    screen: s.screen.kind === 'wait' ? { ...s.screen, beats: s.screen.beats.length } : s.screen,
  });
};

const unique = <T>(list: T[]) => new Set(list).size === list.length;
/** A claim and a fact that catches it, the fact known by the official at this desk. */
const holds = (pairs: readonly [ClaimId, FactId][], s: RunState) => pairs.some(([c, f]) => s.claims.includes(c) && knows(s, f));

/** Cards that challenge a claim, and the claim and fact pairs that let them be dealt. */
const CHALLENGES: Record<string, readonly [ClaimId, FactId][]> = CHALLENGE_PAIRS;

/** The effects a move applied, or null for a move that applies none of its own (ack, beat). An assisted check applies only its findings; an ask only the urgency. */
function moveEffects(s: RunState, action: Action): Effect[] | null {
  if (action.type === 'choose') return options(s).find((o) => o.approach.id === action.approach)?.effects ?? null;
  if (action.type === 'waitAction' && s.screen.kind === 'wait')
    return action.action === 'ask' ? [{ fact: 'urgency' }]
      : action.action === 'assist' ? checkFindings(s, s.screen.check, s.screen.resolved) : checkEffects(s, s.screen.check, s.screen.resolved);
  return null;
}
const keeps = <T>(before: T[], after: T[]) => before.every((x) => after.includes(x));

/** Whether an answer changes something besides time: the medicine, the trip, a new fact here, a document or a contact. */
export function changesProblem(s: RunState, o: Option): boolean {
  if (o.card || o.contact) return true;
  return o.effects.some((e) =>
    ('loseMedicine' in e && s.medicine) || ('travel' in e && e.travel > 0) || ('fact' in e && !knows(s, e.fact)));
}

/**
 * No free exits, on a challenge card (i_clarify, i_contradiction) or in an
 * inspection: every open answer but walking away costs something (costsOf(): a
 * document counts). An inspection offers two open answers that cost different
 * things; with LAST_HOURS left or fewer it offers no wait at all, only a
 * sacrifice, so a delay never decides the run for you. A doomed run is past
 * saving, so only the first rule holds there.
 */
export function noFreeExits(s: RunState): string[] {
  if (s.reaction || (s.screen.kind !== 'inspection' && !(s.screen.kind === 'encounter' && s.screen.id in CHALLENGES))) return [];
  const id = s.screen.id;
  const open = options(s).filter((o) => !o.blocked && o.approach.kind !== 'withdraw');
  const bad = open.filter((o) => !costsOf(s, o).length).map((o) => `${id}.${o.approach.id} is free`);
  if (s.screen.kind !== 'inspection' || doomed(s)) return bad;
  const sets = new Set(open.map((o) => costsOf(s, o).sort().join('+')));
  if (s.time <= LAST_HOURS) {
    if (!open.length) bad.push(`${id} asks for no sacrifice with ${s.time} hours left`);
    for (const o of open) if (costsOf(s, o).includes('time')) bad.push(`${id}.${o.approach.id} costs time with ${s.time} hours left`);
  } else if (sets.size < 2) bad.push(`${id} offers [${open.map((o) => o.approach.id)}], not two answers that cost different things`);
  return bad;
}

/** The rules every reachable state must keep. Returns what is broken. */
export function checkState(s: RunState): string[] {
  const bad: string[] = [];
  const ch = CHARACTERS[s.character];
  const { startTime, minTripTime } = levelOf(s);
  if (s.time < 0 || s.time > startTime) bad.push(`time ${s.time} outside 0..${startTime}`);
  if (s.scrutiny < 0 || s.scrutiny > MAX_SCRUTINY) bad.push(`scrutiny ${s.scrutiny} outside 0..${MAX_SCRUTINY}`);
  if (!s.used.every((id) => s.loadout.includes(id)) || !unique(s.used)) bad.push(`used ${s.used} not a subset of loadout`);
  if (!s.exposed.every((c) => ch.contacts.includes(c)) || !unique(s.exposed)) bad.push(`exposed ${s.exposed} not a subset of contacts`);
  if (!unique(s.claims) || !unique(s.seen)) bad.push('claims or seen repeat');
  // Only someone exposed waits to be checked, never the protected contact, whose cost is the ending.
  const calledIn = s.calledIn ?? [];
  if (!calledIn.every((c) => s.exposed.includes(c) && c !== ch.protectedContact) || !unique(calledIn))
    bad.push(`called in [${calledIn}] with exposed [${s.exposed}]`);
  // Every exposure and loss has its own line, worst first, whatever the ending, and its heading and text exist.
  const cost = consequences(s);
  if (cost.filter((l) => l.kind === 'contact').length !== s.exposed.length) bad.push(`exposed [${s.exposed}] but ${cost.length} lines on the ending list`);
  if (cost.some((l) => l.kind === 'medicine') === s.medicine) bad.push('medicine line does not match the state');
  if (cost.some((l, i) => i > 0 && l.severity > cost[i - 1].severity)) bad.push('ending list is not worst first');
  for (const l of cost) {
    if (l.kind === 'contact' && (l.vars?.contact === ch.protectedContact) !== (l.severity === 3))
      bad.push(`${l.vars?.contact} exposed with severity ${l.severity}`);
    try {
      t(`${l.key}.title`, l.vars);
      t(l.key, l.vars);
    } catch (e) {
      bad.push((e as Error).message);
    }
  }
  // Every fact is known somewhere, each desk once, in crossing order.
  for (const f of factIds(s)) {
    const desks = s.facts[f] ?? [];
    if (!desks.length || desks.join() !== CHECKPOINTS.filter((d) => desks.includes(d)).join()) bad.push(`${f} known at [${desks}]`);
  }
  // A level with contact statements has exactly one on file at every desk, from the start.
  const statements = levelOf(s).statements ?? [];
  const onFile = statements.filter((f) => s.facts[f]);
  if (statements.length && (onFile.length !== 1 || s.facts[onFile[0]]!.length !== CHECKPOINTS.length))
    bad.push(`statements on file: [${onFile.map((f) => `${f} at ${s.facts[f]}`)}]`);
  if ((s.screen.kind === 'encounter' || s.screen.kind === 'inspection') && !currentCard(s)) bad.push(`unknown card ${s.screen.id}`);
  if (travelOf(s) < minTripTime || travelOf(s) > startTime) bad.push(`trip of ${travelOf(s)} hours outside ${minTripTime}..${startTime}`);
  // Once the bus is out of reach, every card offers to finish quickly instead of more clicking.
  const finishing = legalActions(s).some((a) => a.type === 'finish');
  const onCard = !s.reaction && (s.screen.kind === 'encounter' || s.screen.kind === 'inspection');
  if (finishing !== (doomed(s) && onCard)) bad.push(`finish ${finishing ? 'offered' : 'missing'} with ${s.time} hours left and a ${travelOf(s)}-hour trip`);
  // An inspection that changes the problem offers an answer that changes something
  // besides time: the medicine, the trip, a fact on file, a document or a contact.
  const insp = s.screen.kind === 'inspection' && !s.reaction ? INSPECTION_BY_ID.get(s.screen.id) : undefined;
  if (insp && insp.kind !== 'search' && !options(s).some((o) => !o.blocked && o.approach.kind !== 'withdraw' && changesProblem(s, o)))
    bad.push(`${insp.id} (${insp.kind}) offers nothing but time`);
  for (const d of noFreeExits(s)) bad.push(d);
  // A card keeps to three answers on screen, the crowded case the layout is built for (docs/design.md, screen rule 8).
  if ((s.screen.kind === 'encounter' || s.screen.kind === 'inspection') && !s.reaction && options(s).length > 3)
    bad.push(`${s.screen.id} shows ${options(s).length} answers`);
  // A calm card has one answer, and it costs nothing.
  const calm = s.screen.kind === 'encounter' && !s.reaction && ENCOUNTER_BY_ID.get(s.screen.id)?.calm;
  if (calm && !(options(s).length === 1 && options(s).every((o) => !o.blocked && noCost(s, o))))
    bad.push(`calm card ${(s.screen as { id: string }).id} does not have one answer that costs nothing`);
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
  // Exposing anyone but the protected contact puts them on the call-in list, and
  // the next card that asks about what they can confirm takes the hour.
  const before = s.calledIn ?? [];
  const after = n.calledIn ?? [];
  for (const c of after.filter((x) => !before.includes(x)))
    if (s.exposed.includes(c)) bad.push(`${c} called in again`);
  for (const c of n.exposed.filter((x) => !s.exposed.includes(x)))
    if (c !== CHARACTERS[s.character].protectedContact && !after.includes(c)) bad.push(`${c} exposed but not called in`);
  if (action.type === 'choose') {
    const o = options(s).find((x) => x.approach.id === action.approach);
    const due = o ? callInsDue(s, o.approach, topicOf(currentCard(s))) : [];
    if (due.some((c) => after.includes(c))) bad.push(`${due} checked on ${(s.screen as { id: string }).id} but still called in`);
    if (s.time - n.time < Math.min(due.length, s.time)) bad.push(`${due} checked on ${(s.screen as { id: string }).id} for less than an hour each`);
    if (before.some((c) => !due.includes(c) && !after.includes(c))) bad.push('a call-in disappeared without being checked');
  } else if (before.some((c) => !after.includes(c))) bad.push('a call-in disappeared without a card checking it');
  if (!factIds(s).every((f) => keeps(s.facts[f] ?? [], n.facts[f] ?? [])) || !keeps(s.claims, n.claims) || !keeps(s.seen, n.seen))
    bad.push('a fact, claim or seen card disappeared');
  if (s.perkUsed && !n.perkUsed) bad.push('the once-per-run advantage came back');
  if (!s.medicine && n.medicine) bad.push('lost medicine came back');
  if (n.time > s.time) bad.push(`time went up from ${s.time} to ${n.time}`);
  if (travelOf(n) < travelOf(s)) bad.push(`the trip got shorter, from ${travelOf(s)} to ${travelOf(n)} hours`);
  // Finishing quickly ends the run Too late and spends nothing more.
  if (action.type === 'finish') {
    if (n.ending !== 'tooLate') bad.push(`finishing quickly ended ${n.ending}`);
    if (n.time !== s.time || n.decisions !== s.decisions || n.used.length !== s.used.length || n.exposed.length !== s.exposed.length || n.medicine !== s.medicine)
      bad.push('finishing quickly spent something');
  }
  // The pacing rule: a third escalating card in a row only once the desk has no routine card left.
  const dealt = (n.screen.kind === 'encounter' || n.screen.kind === 'inspection') && JSON.stringify(n.screen) !== JSON.stringify(s.screen);
  if (dealt && (n.screen.kind === 'inspection' || escalates((n.screen as { id: string }).id)) && (n.streak ?? 0) > 2 && routinesLeft(n).length)
    bad.push(`${(n.screen as { id: string }).id} is escalating card ${n.streak} in a row with ${routinesLeft(n).map((e) => e.id)} still to ask`);
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
  // The officer reacts to what their priority covers: a fact it lists that comes
  // out at this desk for the first time, on one of the desk's own cards, costs
  // that officer's scrutiny with the fact as the reason, and the reaction says so.
  if (action.type === 'choose' && s.screen.kind === 'encounter') {
    for (const r of OFFICERS[here].reactions) {
      if (!check(r.when, s)) continue;
      for (const f of r.reveals) {
        if (knows(s, f) || !knows(n, f, here)) continue;
        if (!effects.some((e) => 'scrutiny' in e && e.reason === f && e.scrutiny >= r.scrutiny))
          bad.push(`${f} came out at ${here} on ${s.screen.id} with no scrutiny from the officer`);
      }
    }
    for (const f of options(s).find((o) => o.approach.id === action.approach)?.flagged ?? [])
      if (!(n.reaction ?? []).some((l) => l.key === `officer.${here}.flags` && l.vars?.fact === f))
        bad.push(`the officer flagged ${f} on ${s.screen.id} without saying why`);
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

export interface WarningShare {
  bulletin: BulletinId;
  /** Mean homeChance of packings with a document on the warned topic, and how many there are. */
  covered: number;
  coveredCount: number;
  /** The same for packings without one. */
  ignored: number;
  ignoredCount: number;
  /**
   * The same split within each character. Characters differ in difficulty
   * (Mark starts with scrutiny and faces more scrutiny cards), so when one of
   * them always covers a topic the pooled numbers put that difficulty on the
   * covered side. A character whose packings all fall on one side has a zero count.
   */
  byCharacter: WarningSplit[];
}

export interface WarningSplit {
  character: CharacterId;
  covered: number;
  coveredCount: number;
  ignored: number;
  ignoredCount: number;
}

/**
 * Answers the walk offered somewhere that no style of play picked, as
 * `card.approach`, sorted. `picked` holds the same keys for what the bots chose
 * (pickedAnswers() in src/game/bots.ts). An answer listed here never changes
 * play, so it is cut, reworked or named in docs/design.md with why it stays.
 */
export function neverPicked(offered: WalkReport['offered'], picked: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const [card, approaches] of offered)
    for (const approach of approaches.keys()) if (!picked.has(`${card}.${approach}`)) out.push(`${card}.${approach}`);
  return out.sort();
}

/** Per bulletin: do packings that heed its warning get home in time more often? */
export function warningShares(setups: SetupResult[]): WarningShare[] {
  const mean = (list: SetupResult[]) => list.reduce((a, s) => a + s.homeChance, 0) / (list.length || 1);
  const split = (bulletin: BulletinId, list: SetupResult[]) => {
    const covered = list.filter((s) => coversWarning(s.setup.loadout, bulletin));
    const ignored = list.filter((s) => !coversWarning(s.setup.loadout, bulletin));
    return { covered: mean(covered), coveredCount: covered.length, ignored: mean(ignored), ignoredCount: ignored.length };
  };
  return BULLETINS.map((bulletin) => {
    const today = setups.filter((s) => s.setup.bulletin === bulletin);
    const byCharacter = CHARACTER_IDS.map((character) => ({ character, ...split(bulletin, today.filter((s) => s.setup.character === character)) }));
    return { bulletin, ...split(bulletin, today), byCharacter };
  });
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

  // key -> [guaranteed rank, best rank, homeInTime chance]; null while that state is being explored.
  // The key holds the whole setup, so setups that differ only in the contact
  // statement share one map: past the passport desk their runs merge (spent()).
  let memo = new Map<string, [number, number, number] | null>();
  let group = '';
  for (const setup of setups) {
    const same = JSON.stringify({ ...setup, statement: 0 });
    if (same !== group) memo = new Map();
    group = same;
    const path: Move[] = [];
    const problem = (rule: string, detail: string, extra?: Move) => {
      if (report.problems.length >= 50) return;
      const moves = extra ? [...path, extra] : [...path];
      report.problems.push({ rule, detail, repro: { contentVersion: CONTENT_VERSION, setup, moves } });
    };

    const visit = (s: RunState): [number, number, number] => {
      const k = key(s);
      const known = memo.get(k);
      if (known) return known;
      if (known === null) {
        problem('every run ends', `state repeats on its own path at ${JSON.stringify(s.screen)}`);
        return [0, 0, 0];
      }
      memo.set(k, null);
      report.states++;
      for (const d of checkState(s)) problem('state rules', d);
      if (s.screen.kind === 'encounter' || s.screen.kind === 'inspection') report.seenCards.add(s.screen.id);

      let value: [number, number, number];
      const actions = legalActions(s);
      if (s.ending) {
        report.endings[s.ending]++;
        report.maxDecisions = Math.max(report.maxDecisions, s.decisions);
        report.maxInspections = Math.max(report.maxInspections, s.inspections);
        const rank = ENDING_RANK.indexOf(s.ending);
        value = [rank, rank, s.ending === 'homeInTime' ? 1 : 0];
        for (const a of [{ type: 'ack' }, { type: 'beat' }] as Action[])
          if (tryStep(s, a).ok) problem('the end is final', `${JSON.stringify(a)} accepted after the ending`);
      } else if (!actions.length) {
        problem('no dead ends', `nothing to do on ${JSON.stringify(s.screen)}`);
        value = [0, 0, 0];
      } else {
        value = [-1, -1, 0];
        let tried = 0;
        for (const a of actions) {
          if (a.type === 'choose' && !s.reaction) {
            const id = (s.screen as { id: string }).id;
            const m = report.offered.get(id) ?? new Map<string, number>();
            m.set(a.approach, (m.get(a.approach) ?? 0) + 1);
            report.offered.set(id, m);
          }
          let worst = Infinity;
          let best = -1;
          let chance = 0;
          let dealt = 0;
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
            const [g, b, c] = visit(o.state);
            path.pop();
            worst = Math.min(worst, g);
            best = Math.max(best, b);
            chance += c;
            dealt++;
          }
          if (best >= 0) {
            value = [Math.max(value[0], worst), Math.max(value[1], best), value[2] + chance / dealt];
            tried++;
          }
        }
        if (value[1] < 0) value = [0, 0, 0];
        else value[2] /= tried;
        // Finishing quickly is only fair if nothing better was left: from a doomed state no deal reaches the bus.
        if (doomed(s) && value[1] > ENDING_RANK.indexOf('tooLate'))
          problem('doomed runs stay doomed', `${ENDING_RANK[value[1]]} reachable with ${s.time} hours left and a ${travelOf(s)}-hour trip`);
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
    report.setups.push({ setup, guaranteed: ENDING_RANK[value[0]], best: ENDING_RANK[value[1]], homeChance: value[2] });
  }
  return report;
}
