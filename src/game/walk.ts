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
  DELAY_HOURS, callInsDue, check, checkEffects, claimsTouched, checkFindings, costsOf, explainEffects, currentCard, deskOf, doomed, endingFor, escalates, factIds, knows, legalActions, newRun, nextDesk, noCost,
  choices, destinationOf, optionFor, options, routinesLeft, topicOf, travelOf, tripTime,
} from './engine';
import { consequences } from './consequence';
import { SAMPLE_FILES, defaultFile } from './carry';
import type { Option, RunSetup } from './engine';
import type { Dealer } from './rng';
import type { Action, BulletinId, CarriedFile, CharacterId, ClaimId, DestinationId, Effect, EndingId, EvidenceId, FactId, LevelId, LogEntry, Requirement, RunState } from './types';
import { CHECKPOINTS } from './types';
import {
  BULLETINS, CHARACTERS, CHARACTER_IDS, CONTACTS, DEFAULT_DESTINATION, DESTINATIONS, DESTINATION_IDS, EVIDENCE, EVIDENCE_IDS, LAST_HOURS, MAX_REQUIREMENTS, MAX_SCRUTINY, OFFICERS,
  canConfirm, coversWarning,
} from './content/world';
import { CHECKS, CONTRADICTIONS, ENCOUNTERS, ENCOUNTER_BY_ID, INCONSISTENCIES, INSPECTIONS, INSPECTION_BY_ID, STATEMENTS } from './content/encounters';
import { queueBeats } from './content/queues';
import { DEFAULT_LEVEL, LEVELS, levelOf } from './content/levels';
import { en } from '../i18n/en';
import { has, t } from '../i18n';
import { CONTENT_VERSION, tryStep } from './play';
import type { Move, ReplayRecord } from './play';

export function combinations<T>(list: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const [head, ...rest] = list;
  return [...combinations(rest, k - 1).map((c) => [head, ...c]), ...combinations(rest, k)];
}

const defaults = new Map<CharacterId, CarriedFile>();
/** The seeded default file for a traveler (defaultFile(1) in src/game/carry.ts), built once. */
const defaultFor = (c: CharacterId): CarriedFile => {
  if (!defaults.has(c)) defaults.set(c, defaultFile(1, c));
  return defaults.get(c)!;
};

/**
 * Every character x packing x bulletin in one level, for each of `destinations` in a level that
 * has them (Level.destinations; Capital alone by default, so the bot sweeps stay their size).
 * The seed only moves cosmetic beats here.
 * A level that reads a file (Level.readsFile) gets the traveler's seeded default file and a
 * played-looking one (SAMPLE_FILES) in a checkerboard over packing and bulletin, so both
 * files meet every packing and every bulletin without doubling the walk. A level with
 * contact statements (Level.statements) gets each of them on every setup. The destinations of one
 * packing and bulletin sit next to each other, so the walk can share a memo between them (rulesSee()).
 */
export function allSetups(level: LevelId = DEFAULT_LEVEL, destinations: readonly DestinationId[] = [DEFAULT_DESTINATION]): RunSetup[] {
  const out: RunSetup[] = [];
  const reads = levelOf({ level }).readsFile;
  const statements = levelOf({ level }).statements ?? [undefined];
  const goes = levelOf({ level }).destinations ? destinations : [undefined];
  for (const character of CHARACTER_IDS as CharacterId[])
    combinations<EvidenceId>(EVIDENCE_IDS, CHARACTERS[character].evidenceSlots).forEach((loadout, i) =>
      BULLETINS.forEach((bulletin, j) => goes.forEach((destination) => statements.forEach((statement) => out.push({
        level, ...(destination ? { destination } : {}), character, loadout, bulletin, seed: 1,
        ...(reads ? { file: (i + j) % 2 ? SAMPLE_FILES[character] : defaultFor(character) } : {}),
        ...(statement ? { statement } : {}),
      })))));
  return out;
}

/** What the full walk plays in a level: every setup, at every destination the level has. */
export const walkSetups = (level: LevelId = DEFAULT_LEVEL): RunSetup[] => allSetups(level, DESTINATION_IDS);

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
    const r = tryStep(s, action, dealer, false);
    const used = sizes.map((_, i) => script[i] ?? 0);
    out.push(r.ok ? { state: r.state, picks: used } : { state: s, picks: used, rejected: r.reason });
    let j = used.length - 1;
    while (j >= 0 && used[j] + 1 >= sizes[j]) j--;
    if (j < 0) return out;
    script = [...used.slice(0, j), used[j] + 1];
  }
}

/**
 * Whether the dealer's picks led to states that differ in more than the reaction line
 * (and the log that keeps it), so the seed changed the run itself, not only what it says.
 */
export function dealtBeyondLine(next: Outcome[]): boolean {
  const bare = (o: Outcome) => JSON.stringify({ ...o.state, reaction: null, log: [] });
  return new Set(next.map(bare)).size > 1;
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
  /**
   * Chance nodes whose picks differ in more than the reaction line (dealtBeyondLine()). In a
   * level that spot-checks by rule (Level.spotByRule) each one is a problem, because there the
   * seed only names which tied claim was checked.
   */
  dealerBranches: number;
  /** Moves afterAnswerLines() looked at: a "Checks out" shown, a question settled, a bag search answered. */
  afterAnswer: AfterAnswerTally;
  /** Your mother's after-desk messages queuePremises() looked at, by kind. */
  queues: QueueTally;
  /**
   * Per standing rule (Requirement.id), at its destination: states that showed its enforcing card,
   * and how many of them offered an answer that needs no document and costs something.
   */
  requirements: Map<string, { shown: number; costly: number }>;
}

export interface AfterAnswerTally {
  checksOut: number;
  settles: number;
  bagSearches: number;
}

/**
 * Facts for the merge key: which came out, and which desks from here on know
 * them. A desk already passed never reads its facts again, so runs that differ
 * only there play the same from now on.
 */
const factsKey = (s: RunState) =>
  factIds(s).sort().map((f) => `${f}:${(s.facts[f] ?? []).filter((d) => CHECKPOINTS.indexOf(d) >= s.checkpoint)}`).join();

/**
 * The contact statement on file and the stay you claimed, as how they relate:
 * whether you agreed with it. Both statements play the same apart from their
 * words, so runs that differ only in which one the setup picked merge.
 */
function statementKey(s: RunState): RunState {
  const said = STATEMENTS.find((x) => s.facts[x.fact]);
  if (!said) return s;
  const as = (c: string) => (c === said.agrees ? 'agrees' : c === said.disproves ? 'disagrees' : c) as ClaimId;
  const rename = <T>(o: Partial<Record<ClaimId, T>> | undefined) => o && Object.fromEntries(Object.entries(o).map(([c, v]) => [as(c), v]));
  const { [said.fact]: desks, ...facts } = s.facts;
  return { ...s, facts: { ...facts, statement: desks } as RunState['facts'], claims: s.claims.map(as), logged: rename(s.logged), saidAt: rename(s.saidAt) };
}

/**
 * Destinations the rules tell apart: one a card, effect or level names in a condition
 * (Cond.destination), or one with its own wording (`<key>.destination.<id>.<part>`).
 */
const NAMED_DESTINATIONS: ReadonlySet<DestinationId> = (() => {
  const content = JSON.stringify([ENCOUNTERS, INSPECTIONS, CHECKS, EVIDENCE, OFFICERS, CONTACTS, CHARACTERS, LEVELS]);
  const named = new Set<string>([...content.matchAll(/"destination":"(\w+)"/g)].map((m) => m[1]));
  for (const k of Object.keys(en)) for (const m of k.matchAll(/\.destination\.(\w+)\./g)) named.add(m[1]);
  return new Set(DESTINATION_IDS.filter((d) => named.has(d)));
})();

/**
 * How the rules see a destination: its own id when they name it (NAMED_DESTINATIONS), else
 * only its travel time. Runs at two unnamed destinations with the same travel time play the
 * same move for move, so they share one memo and their states merge (the Capital and the South
 * today), which keeps the walk of every destination inside its budget. The standing rules are
 * still judged for each of them (enforced()).
 */
export const rulesSee = (d: DestinationId | undefined): string =>
  !d ? '' : NAMED_DESTINATIONS.has(d) ? d : `travel ${DESTINATIONS[d].travel}`;

/**
 * Fields the merge key leaves out or writes its own way. Left out: the seed and the log move
 * nothing; the level, traveler, bulletin, packing and file are fixed for the whole setup (the
 * memo is per setup); where and how each claim was said or shown is only read into the next
 * file; the answers so far are only read by the ending (decisive()).
 */
const UNKEYED: ReadonlySet<string> = new Set([
  'seed', 'rng', 'log', 'file', 'level', 'character', 'bulletin', 'loadout',
  'saidOn', 'saidAs', 'shownOn', 'shownBy', 'answers', 'destination', 'facts', 'reaction', 'screen',
]);

/** Each list of field names seen, as a small number, so the key names its fields once. */
const SHAPES = new Map<string, number>();

/**
 * The merge key: the state's field names (as their SHAPES number) and their values, with the
 * destination as the rules see it, the facts as factsKey() and only whether a reaction shows.
 */
const key = (state: RunState) => {
  const s = statementKey(state);
  const fields = s as unknown as Record<string, unknown>;
  const names = Object.keys(fields);
  const shape = names.join();
  let id = SHAPES.get(shape);
  if (id === undefined) SHAPES.set(shape, (id = SHAPES.size));
  const values: unknown[] = [id];
  for (const k of names) if (!UNKEYED.has(k)) values.push(fields[k]);
  values.push(
    rulesSee(destinationOf(s)),
    factsKey(s),
    s.reaction ? 1 : 0,
    s.screen.kind === 'wait' ? { ...s.screen, beats: s.screen.beats.length } : s.screen,
  );
  return JSON.stringify(values);
};

const unique = <T>(list: T[]) => new Set(list).size === list.length;
/** A claim and a fact that catches it, the fact known by the official at this desk. */
const holds = (pairs: readonly [ClaimId, FactId][], s: RunState) => pairs.some(([c, f]) => s.claims.includes(c) && knows(s, f));

/** Cards that challenge a claim, and the claim and fact pairs that let them be dealt. */
const CHALLENGES: Record<string, readonly [ClaimId, FactId][]> = { i_clarify: INCONSISTENCIES, i_contradiction: CONTRADICTIONS };

/** The effects a move applied, or null for a move that applies none of its own (ack, beat). An assisted check applies only its findings; an ask only the urgency; explaining first adds Check.explain. */
function moveEffects(s: RunState, action: Action): Effect[] | null {
  if (action.type === 'choose') return optionFor(s, action)?.effects ?? null;
  if (action.type === 'waitAction' && s.screen.kind === 'wait')
    return action.action === 'ask' ? [{ fact: 'urgency' }]
      : action.action === 'assist' ? checkFindings(s, s.screen.check, s.screen.resolved)
      : [...(action.action === 'explain' ? explainEffects(s, s.screen.check) : []), ...checkEffects(s, s.screen.check, s.screen.resolved)];
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
  const open = choices(s).filter((o) => !o.blocked && o.approach.kind !== 'withdraw');
  const bad = open.filter((o) => !costsOf(s, o).length).map((o) => `${id}.${o.approach.id} is free`);
  if (s.screen.kind !== 'inspection' || doomed(s)) return bad;
  const sets = new Set(open.map((o) => costsOf(s, o).sort().join('+')));
  if (s.time <= LAST_HOURS) {
    if (!open.length) bad.push(`${id} asks for no sacrifice with ${s.time} hours left`);
    for (const o of open) if (costsOf(s, o).includes('time')) bad.push(`${id}.${o.approach.id} costs time with ${s.time} hours left`);
  } else if (sets.size < 2) bad.push(`${id} offers [${open.map((o) => o.approach.id)}], not two answers that cost different things`);
  return bad;
}

/**
 * One bounded resolution slot per desk (Branching Rules, page 3): no desk runs a
 * second inspection in the run. Two inspections at two different desks are allowed.
 * An inspection with no desk on record could have been at any desk, so once the run
 * has two or more, one unrecorded is reported too: the rule errs toward failing.
 */
export function repeatInspections(s: RunState): string[] {
  const at = s.inspectedAt ?? [];
  const bad: string[] = [];
  const twice = CHECKPOINTS.filter((d) => at.filter((a) => a === d).length > 1);
  if (twice.length) bad.push(`second inspection at the same desk: [${twice}] in [${at}]`);
  if (at.length !== s.inspections && (s.inspections > 1 || at.length > s.inspections))
    bad.push(`${s.inspections} inspections but desks on record [${at}]`);
  return bad;
}

/** The rules every reachable state must keep. Returns what is broken. */
export function checkState(s: RunState): string[] {
  const bad: string[] = [];
  const ch = CHARACTERS[s.character];
  const { startTime } = levelOf(s);
  const minTripTime = tripTime(s);
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
  if ((s.screen.kind === 'encounter' || s.screen.kind === 'inspection') && !currentCard(s)) bad.push(`unknown card ${s.screen.id}`);
  if (travelOf(s) < minTripTime || travelOf(s) > startTime) bad.push(`trip of ${travelOf(s)} hours outside ${minTripTime}..${startTime}`);
  // Once the bus is out of reach, every card offers to finish quickly instead of more clicking.
  const finishing = legalActions(s).some((a) => a.type === 'finish');
  const onCard = !s.reaction && (s.screen.kind === 'encounter' || s.screen.kind === 'inspection');
  if (finishing !== (doomed(s) && onCard)) bad.push(`finish ${finishing ? 'offered' : 'missing'} with ${s.time} hours left and a ${travelOf(s)}-hour trip`);
  // An inspection that changes the problem offers an answer that changes something
  // besides time: the medicine, the trip, a fact on file, a document or a contact.
  const insp = s.screen.kind === 'inspection' && !s.reaction ? INSPECTION_BY_ID.get(s.screen.id) : undefined;
  if (insp && insp.kind !== 'search' && !choices(s).some((o) => !o.blocked && o.approach.kind !== 'withdraw' && changesProblem(s, o)))
    bad.push(`${insp.id} (${insp.kind}) offers nothing but time`);
  for (const d of noFreeExits(s)) bad.push(d);
  // A level with contact statements has exactly one on file, at every desk, from the start.
  const statements = levelOf(s).statements ?? [];
  const onFile = statements.filter((f) => s.facts[f]);
  if (statements.length && (onFile.length !== 1 || s.facts[onFile[0]]!.length !== CHECKPOINTS.length))
    bad.push(`statements on file: [${onFile.map((f) => `${f} at ${s.facts[f]}`)}]`);
  for (const d of repeatInspections(s)) bad.push(d);
  for (const d of requirementAnswers(s)) bad.push(d);
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

/**
 * The standing rules this card enforces (Requirement.enforcedBy) at the run's destination, and
 * at every destination the rules see the same way (rulesSee()), whose runs share this state.
 */
export function enforced(s: RunState): Requirement[] {
  const to = destinationOf(s);
  if (!to || s.reaction || s.screen.kind !== 'encounter') return [];
  const id = s.screen.id;
  return DESTINATION_IDS.filter((d) => rulesSee(d) === rulesSee(to))
    .flatMap((d) => DESTINATIONS[d].requirements.filter((r) => r.enforcedBy === id));
}

/** The open answers on the card that need no document: not a document, not walking away. */
const noDocument = (s: RunState): Option[] =>
  choices(s).filter((o) => !o.blocked && !o.card && o.approach.kind !== 'evidence' && o.approach.kind !== 'withdraw');

/**
 * A standing rule is never a wall: whenever its enforcing card is on screen at its destination,
 * some open answer needs no document (fairness, epic 70r). Whether one of them costs something
 * is counted across the walk (WalkReport.requirements), because a point settled earlier can
 * rightly make the answer free on one path.
 */
export function requirementAnswers(s: RunState): string[] {
  const rules = enforced(s);
  if (!rules.length || noDocument(s).length) return [];
  return rules.map((r) => `${r.id}: ${r.enforcedBy} offers no answer without a document`);
}

/**
 * The fairness rules of the destinations (epic 70r), once the walk is done: every standing rule
 * has briefing text, published before packing; at most MAX_REQUIREMENTS per destination; every
 * enforcing card is a card the level deals, is shown at its destination somewhere in the walk, and
 * there offers an answer that needs no document, at a cost; every setup guarantees at least tooLate
 * and can reach homeAtCost. Only the destinations among `setups` are judged.
 */
export function fairnessProblems(report: Pick<WalkReport, 'setups' | 'requirements'>, setups: readonly RunSetup[]): string[] {
  const bad: string[] = [];
  const going = DESTINATION_IDS.filter((d) => setups.some((x) => levelOf(x).destinations && destinationOf(x) === d));
  for (const d of going) {
    const rules = DESTINATIONS[d].requirements;
    if (rules.length > MAX_REQUIREMENTS) bad.push(`${d} has ${rules.length} standing rules, more than ${MAX_REQUIREMENTS}`);
    if (!has(DESTINATIONS[d].town)) bad.push(`${d} has no text for its town ${DESTINATIONS[d].town}`);
    for (const r of rules) {
      if (!has(r.briefing) || !t(r.briefing).trim()) bad.push(`${r.id} has no briefing text at ${r.briefing}`);
      if (!r.evidence.length && !r.facts.length) bad.push(`${r.id} names nothing that satisfies it`);
      const card = ENCOUNTER_BY_ID.get(r.enforcedBy);
      if (!card) {
        bad.push(`${r.id} is enforced by ${r.enforcedBy}, which is no encounter`);
        continue;
      }
      if (card.topic !== r.topic) bad.push(`${r.id} is about ${r.topic} but ${card.id} asks about ${card.topic ?? 'nothing'}`);
      const levels = setups.filter((x) => destinationOf(x) === d).map((x) => levelOf(x));
      if (!levels.some((l) => l.cards.includes(card.id))) bad.push(`${r.id}: no level going to ${d} deals ${card.id}`);
      const tally = report.requirements.get(r.id);
      if (!tally?.shown) bad.push(`${r.id}: ${card.id} is never shown going to ${d}`);
      else if (!tally.costly) bad.push(`${r.id}: ${card.id} never offers an answer without a document that costs something`);
    }
  }
  const atLeast = ENDING_RANK.indexOf('tooLate');
  const reach = ENDING_RANK.indexOf('homeAtCost');
  for (const x of report.setups) {
    const where = `${destinationOf(x.setup) ?? x.setup.level} ${x.setup.character} ${x.setup.bulletin} [${x.setup.loadout}]`;
    if (ENDING_RANK.indexOf(x.guaranteed) < atLeast) bad.push(`${where} guarantees only ${x.guaranteed}`);
    if (ENDING_RANK.indexOf(x.best) < reach) bad.push(`${where} can reach only ${x.best}`);
  }
  return bad;
}

/** The topics a move settled for the desks ahead: verified now, freshly or again. */
const settledBy = (s: RunState, n: RunState): string[] =>
  Object.keys(n.verified ?? {}).filter((t) => n.verified?.[t as keyof RunState['verified']] !== s.verified?.[t as keyof RunState['verified']]);

/**
 * The after-answer lines say what this answer did (border_crossing_game-dap.31): a
 * spot-check's "Checks out" names only a claim the move's own effects touch
 * (claimsTouched()), a move that settles a question shows no officer's doubt or
 * challenge next to it, and a bag search (Encounter.noCallIns) names no contact.
 */
export function afterAnswerLines(s: RunState, n: RunState, action: Action, tally?: AfterAnswerTally): string[] {
  const bad: string[] = [];
  const said = n.log.slice(s.log.length);
  const where = s.screen.kind === 'encounter' || s.screen.kind === 'inspection' ? `${s.screen.id}.${'approach' in action ? action.approach : action.type}` : `${s.screen.kind} ${JSON.stringify(action)}`;
  const touched = claimsTouched(moveEffects(s, action) ?? []);
  for (const l of said)
    if (l.key === 'spot.clear' && tally) tally.checksOut++;
  for (const l of said)
    if (l.key === 'spot.clear' && !touched.includes(String(l.vars?.claim).split('.')[0] as ClaimId))
      bad.push(`"Checks out: ${l.vars?.claim}" under ${where}, which touches [${touched}]`);
  const settled = settledBy(s, n);
  if (settled.length && tally) tally.settles++;
  const doubts = said.filter((l) => l.key.startsWith('reading.') || /^officer\.\w+\.flags$/.test(l.key));
  if (settled.length && doubts.length) bad.push(`${where} settles [${settled}] and says ${doubts.map((l) => l.key)}`);
  const card = s.screen.kind === 'encounter' ? ENCOUNTER_BY_ID.get(s.screen.id) : undefined;
  if (card?.noCallIns && action.type === 'choose' && (s.calledIn ?? []).length && tally) tally.bagSearches++;
  if (card?.noCallIns && said.some((l) => l.key === 'calledIn.reaction')) bad.push(`the bag search ${where} names a contact`);
  return bad;
}

/** Arrival's queue lines that only fit coming home to Dad: the hospital, the spare key, a kiss for him. Departure never shows them. */
export const COMING_HOME_LINES = ['msg.0.0', 'msg.0.personal.lena', 'msg.0.personal.mark', 'msg.2.after.smooth'];

/** Log lines that say your mother picked up an officer's call: the host call, the second call, a waiting-room assist. */
const motherAnswers = (l: LogEntry): boolean => l.key === 'check.hostCall.clear' || l.key === 'enc.f_host.again.reaction'
  || (l.key === 'wait.assist.reaction' && l.vars?.contact === 'mother');

/** The approaches that name your mother to vouch for you (not only for a lift), as their reaction keys start. */
const MOTHER_VOUCHES = [...ENCOUNTERS, ...INSPECTIONS].flatMap((c) => c.approaches
  .filter((a) => a.kind === 'contact' && a.contacts?.includes('mother') && !a.namesOnly)
  .map((a) => `${'checkpoint' in c ? 'enc' : 'insp'}.${c.id}.${a.id}.`));

export interface QueueTally {
  call: number;
  callRelative: number;
  delay: number;
  smooth: number;
}

/**
 * Your mother's message in the queue after a desk holds its premise there
 * (border_crossing_game-dap.33), read from what that desk said and did, not from
 * queueMood(): "X called me" only after she picked up at that desk, "they asked
 * about Ilya" only when you named him there too, "Still nothing?" only after a
 * desk of DELAY_HOURS or more with no call, and the ordinary line only after
 * neither. Departure shows none of COMING_HOME_LINES and Arrival none of Departure's.
 * `s` is the last state at the desk and `n` the queue after it.
 */
export function queuePremises(s: RunState, n: RunState, tally?: QueueTally): string[] {
  if (n.screen.kind !== 'between' || s.screen.kind === 'between' || !s.deskStart) return [];
  const start = s.deskStart;
  const said = n.log.slice(start.log);
  const called = said.some(motherAnswers) || said.some((l) => MOTHER_VOUCHES.some((p) => l.key.startsWith(p)));
  const relative = n.exposed.slice(start.exposed ?? n.exposed.length).some((c) => c !== 'mother');
  const slow = start.time - n.time >= DELAY_HOURS;
  const beats = queueBeats(n.screen.next, n);
  const mother = beats.filter((b) => b.from === 'mother' && b.after);
  const bad: string[] = [];
  const where = `queue ${n.screen.next} (${n.level})`;
  if (mother.length !== 1) return [`${where} shows ${mother.length} after-desk messages from your mother`];
  const key = mother[0].key;
  const kind = /\.after\.call\.(lena|mark)$/.test(key) ? 'callRelative' : /\.after\.call$/.test(key) ? 'call' : /\.after\.delay$/.test(key) ? 'delay' : 'smooth';
  if (tally) tally[kind]++;
  const holds = kind === 'callRelative' ? called && relative : kind === 'call' ? called && !relative : kind === 'delay' ? !called && slow : !called && !slow;
  if (!holds) bad.push(`${where} says ${key} after a desk where she was ${called ? '' : 'not '}phoned, ${relative ? 'a relative was' : 'no relative was'} named, ${start.time - n.time}h passed`);
  return bad;
}

/** The queue beats a level shows fit it: Departure none of COMING_HOME_LINES, the others none of Departure's own. */
export function queueLevelLines(s: RunState): string[] {
  if (s.screen.kind !== 'between') return [];
  const keys = queueBeats(s.screen.next, s).map((b) => b.key);
  const wrong = s.level === 'departure' ? keys.filter((k) => COMING_HOME_LINES.includes(k)) : keys.filter((k) => k.endsWith('.departure'));
  return wrong.map((k) => `queue ${s.screen.kind === 'between' ? s.screen.next : ''} in ${s.level} shows ${k}`);
}

/** The rules every move must keep, comparing the state before and after. */
export function checkMove(s: RunState, n: RunState, action: Action, tally?: AfterAnswerTally, queueTally?: QueueTally): string[] {
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
    const o = optionFor(s, action);
    // Opening the list behind "Show a document" answers nothing yet, so it checks no call-in.
    const due = o && !o.documents ? callInsDue(s, o.approach, topicOf(currentCard(s))) : [];
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
  // Only staying with family rules out the hotel, as where you stay. It still answers
  // how long (its dates), and then no hotel stay goes on file.
  if (!s.used.includes('hotel') && n.used.includes('hotel') && s.claims.includes('stayingWithFamily')) {
    if (topicOf(currentCard(s)) !== 'stay') bad.push('the hotel was shown for where you stay after claiming to stay with family');
    else if (!s.claims.includes('hotelStay') && n.claims.includes('hotelStay')) bad.push('the hotel, shown for its dates while staying with family, put a hotel stay on file');
  }
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
    for (const f of optionFor(s, action)?.flagged ?? [])
      if (!(n.reaction ?? []).some((l) => l.key === `officer.${here}.flags` && l.vars?.fact === f))
        bad.push(`the officer flagged ${f} on ${s.screen.id} without saying why`);
  }
  // A contact is only named for what they can confirm: the card's topic, or the
  // check's in the waiting room. Naming a relative (namesOnly) confirms nothing.
  const named = n.exposed.filter((c) => !s.exposed.includes(c));
  if (action.type === 'choose' && named.length) {
    const o = optionFor(s, action);
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
  bad.push(...afterAnswerLines(s, n, action, tally));
  bad.push(...queuePremises(s, n, queueTally));
  bad.push(...queueLevelLines(n));
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
    dealerBranches: 0,
    afterAnswer: { checksOut: 0, settles: 0, bagSearches: 0 },
    queues: { call: 0, callRelative: 0, delay: 0, smooth: 0 },
    requirements: new Map(),
  };

  // key -> [guaranteed rank, best rank, homeInTime chance]; null while that state is being explored.
  // Setups that differ only in the contact statement share one map, because
  // their runs merge (statementKey()).
  // Setups that differ only in a destination the rules see the same way (rulesSee()) share
  // one too. The last few memos stay, so those setups need only be near each other (allSetups()).
  const memos = new Map<string, Map<string, [number, number, number] | null>>();
  for (const setup of setups) {
    const same = JSON.stringify({ ...setup, statement: 0, destination: rulesSee(destinationOf(setup)) });
    const memo = memos.get(same) ?? new Map<string, [number, number, number] | null>();
    if (!memos.has(same)) {
      memos.set(same, memo);
      for (const old of memos.keys()) if (memos.size > DESTINATION_IDS.length) memos.delete(old);
    }
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
      for (const r of enforced(s)) {
        const tally = report.requirements.get(r.id) ?? { shown: 0, costly: 0 };
        tally.shown++;
        if (noDocument(s).some((o) => costsOf(s, o).length)) tally.costly++;
        report.requirements.set(r.id, tally);
      }

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
          if (next.length > 1) {
            report.chanceNodes++;
            if (dealtBeyondLine(next)) {
              report.dealerBranches++;
              if (levelOf(s).spotByRule) problem('the seed only breaks ties', `dealer picks after ${JSON.stringify(a)} on ${JSON.stringify(s.screen)} differ in more than the reaction line`, { action: a, picks: next[1].picks });
            }
          }
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
            for (const d of checkMove(s, o.state, a, report.afterAnswer, report.queues)) problem('move rules', d, move);
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
  if (setups.length) {
    const repro: ReplayRecord = { contentVersion: CONTENT_VERSION, setup: setups[0], moves: [] };
    for (const d of fairnessProblems(report, setups))
      if (report.problems.length < 50) report.problems.push({ rule: 'fairness', detail: d, repro });
  }
  return report;
}

/**
 * Setups split by how the rules see their destination (rulesSee()): runs in different groups
 * never merge, so each group can be walked on its own, at the same time as the others, and
 * the reports joined with mergeReports(). A level with no destinations is one group.
 */
export function walkGroups(setups: RunSetup[]): RunSetup[][] {
  const groups = new Map<string, RunSetup[]>();
  for (const x of setups) {
    const seen = rulesSee(destinationOf(x));
    groups.set(seen, [...(groups.get(seen) ?? []), x]);
  }
  return [...groups.values()];
}

/** The reports of walks over separate setups (walkGroups()) as one report. */
export function mergeReports(reports: WalkReport[]): WalkReport {
  const [first, ...rest] = reports;
  const out: WalkReport = {
    ...first,
    endings: { ...first.endings },
    problems: [...first.problems],
    seenCards: new Set(first.seenCards),
    offered: new Map([...first.offered].map(([card, m]) => [card, new Map(m)])),
    setups: [...first.setups],
    afterAnswer: { ...first.afterAnswer },
    queues: { ...first.queues },
    requirements: new Map([...first.requirements].map(([id, n]) => [id, { ...n }])),
  };
  for (const r of rest) {
    out.states += r.states;
    for (const e of ENDING_RANK) out.endings[e] += r.endings[e];
    out.problems.push(...r.problems.slice(0, 50 - out.problems.length));
    out.maxDecisions = Math.max(out.maxDecisions, r.maxDecisions);
    out.maxInspections = Math.max(out.maxInspections, r.maxInspections);
    for (const c of r.seenCards) out.seenCards.add(c);
    for (const [card, m] of r.offered) {
      const mine = out.offered.get(card) ?? new Map<string, number>();
      for (const [a, n] of m) mine.set(a, (mine.get(a) ?? 0) + n);
      out.offered.set(card, mine);
    }
    out.setups.push(...r.setups);
    out.chanceNodes += r.chanceNodes;
    out.dealerBranches += r.dealerBranches;
    for (const k of Object.keys(out.afterAnswer) as (keyof AfterAnswerTally)[]) out.afterAnswer[k] += r.afterAnswer[k];
    for (const k of Object.keys(out.queues) as (keyof QueueTally)[]) out.queues[k] += r.queues[k];
    for (const [id, n] of r.requirements) {
      const mine = out.requirements.get(id) ?? { shown: 0, costly: 0 };
      out.requirements.set(id, { shown: mine.shown + n.shown, costly: mine.costly + n.costly });
    }
  }
  return out;
}
