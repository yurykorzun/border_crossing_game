// The rules. Pure: newRun() builds a state, step() takes a state and an action
// and returns the next state. The UI only renders state and sends actions.

import type {
  Action, Approach, BulletinId, CharacterId, CheckCase, Checkpoint, ClaimId, Cond, ContactId, Effect, Encounter,
  CheckId, EndingId, EvidenceId, FactId, FactMap, Inspection, LogEntry, RunState, Screen, ScrutinyReason, Topic, WaitAction,
} from './types';
import { CHECKPOINTS } from './types';
import {
  BEAT_COUNT, CHARACTERS, EVIDENCE, HARMLESS_FACTS, LAST_HOURS, MAX_SCRUTINY, MISSION_MIN_TIME, OFFICERS, SCRUTINY_AFTER_INSPECTION, SPOT_CHECK_HOURS, START_TIME, BULLETIN_TOPICS, canConfirm, coversWarning, writesDown,
} from './content/world';
import { CHALLENGES, CHALLENGE_PAIRS, CHECKS, CLARIFIED_BY, ENCOUNTERS,ENCOUNTER_BY_ID, INSPECTIONS, INSPECTION_BY_ID } from './content/encounters';
import { has, own } from '../i18n';
import { nextRandom, randomDealer } from './rng';
import type { Dealer } from './rng';

export interface RunSetup {
  character: CharacterId;
  loadout: EvidenceId[];
  bulletin: BulletinId;
  seed: number;
}

export function newRun(setup: RunSetup): RunState {
  const ch = CHARACTERS[setup.character];
  if (setup.loadout.length !== ch.evidenceSlots) throw new Error(`${ch.id} takes ${ch.evidenceSlots} evidence cards`);
  return {
    v: 2,
    seed: setup.seed,
    rng: setup.seed,
    character: ch.id,
    bulletin: setup.bulletin,
    loadout: [...setup.loadout],
    used: [],
    exposed: [],
    calledIn: [],
    time: START_TIME,
    travel: MISSION_MIN_TIME,
    scrutiny: ch.startScrutiny,
    facts: {},
    claims: [],
    logged: {},
    saidAt: {},
    medicine: true,
    perkUsed: false,
    withdrew: false,
    checkpoint: 0,
    slot: 0,
    seen: [],
    streak: 0,
    pending: [],
    screen: { kind: 'between', next: 0 },
    reaction: null,
    log: [],
    decisions: 0,
    inspections: 0,
    ending: null,
  };
}

// ── What each official knows

/** The desk the run is at: where a fact that comes out now is known. */
export const deskOf = (s: RunState): Checkpoint => CHECKPOINTS[Math.min(s.checkpoint, CHECKPOINTS.length - 1)];

/** Every fact that came out anywhere, in the order it came out. */
export const factIds = (s: RunState): FactId[] => Object.keys(s.facts) as FactId[];

/** Whether the official at `desk` (the current one by default) knows `f`. */
export const knows = (s: RunState, f: FactId, desk: Checkpoint = deskOf(s)): boolean => !!s.facts[f]?.includes(desk);

/** What the official at `desk` knows, in the order it came out. */
export const knownAt = (s: RunState, desk: Checkpoint = deskOf(s)): FactId[] => factIds(s).filter((f) => knows(s, f, desk));

/** The desk after `desk`, or undefined after the last one. */
export const nextDesk = (desk: Checkpoint): Checkpoint | undefined => CHECKPOINTS[CHECKPOINTS.indexOf(desk) + 1];

/** `facts` with `f` known at `desks` too, desks kept in CHECKPOINTS order. */
function teach(facts: FactMap, f: FactId, desks: Checkpoint[]): FactMap {
  const had = facts[f] ?? [];
  if (facts[f] && desks.every((d) => had.includes(d))) return facts;
  return { ...facts, [f]: CHECKPOINTS.filter((d) => had.includes(d) || desks.includes(d)) };
}

/**
 * The desks that learn a fact when it comes out at `desk`: that desk, and with
 * the records bulletin every later one, through the shared records system.
 */
export function desksLearning(bulletin: BulletinId, desk: Checkpoint): Checkpoint[] {
  return bulletin === 'records' ? CHECKPOINTS.slice(CHECKPOINTS.indexOf(desk)) : [desk];
}

/** The desks that wrote `c` down, in CHECKPOINTS order. Empty: only said aloud, or not said. */
export const loggedAt = (s: RunState, c: ClaimId): Checkpoint[] => s.logged?.[c] ?? [];

/** `s` after claiming `c` here: on the record of what you said, and written down if this officer does (writesDown). */
function claim(s: RunState, c: ClaimId): RunState {
  const desk = deskOf(s);
  const n = s.claims.includes(c) ? s : { ...s, claims: [...s.claims, c], saidAt: { ...s.saidAt, [c]: desk } };
  const had = loggedAt(n, c);
  if (!writesDown(desk, c) || had.includes(desk)) return n;
  return { ...n, logged: { ...n.logged, [c]: CHECKPOINTS.filter((d) => had.includes(d) || d === desk) } };
}

/** The facts a send effect passes on: the ones it names (all by default) that this desk knows. */
export const sentFacts = (s: RunState, e: { facts?: FactId[] }): FactId[] => (e.facts ?? knownAt(s)).filter((f) => knows(s, f));

// ── Conditions

export function check(cond: Cond | undefined, s: RunState): boolean {
  if (!cond) return true;
  const ch = CHARACTERS[s.character];
  if (cond.character && cond.character !== s.character) return false;
  if (cond.background && !ch.background.includes(cond.background)) return false;
  if (cond.bulletin && cond.bulletin !== s.bulletin) return false;
  if (cond.facts && !cond.facts.every((f) => knows(s, f))) return false;
  if (cond.noFacts && cond.noFacts.some((f) => knows(s, f))) return false;
  if (cond.claims && !cond.claims.every((c) => s.claims.includes(c))) return false;
  if (cond.noClaims && cond.noClaims.some((c) => s.claims.includes(c))) return false;
  if (cond.contactFree && !cond.contactFree.some((c) => ch.contacts.includes(c) && !s.exposed.includes(c))) return false;
  if (cond.lastHours !== undefined && (s.time <= LAST_HOURS) !== cond.lastHours) return false;
  if (cond.holds && !cardFor(s, cond.holds)) return false;
  if (cond.any && !cond.any.some((c) => check(c, s))) return false;
  if (cond.not && check(cond.not, s)) return false;
  return true;
}

// ── What is on screen

/**
 * The checkpoint the screen is at, as an index into CHECKPOINTS. The last
 * reaction at a checkpoint shows with the next queue already set, so until it
 * is acknowledged the strip, scene and officer stay on the one just finished.
 */
export function shownCheckpoint(s: RunState): number {
  if (s.screen.kind === 'between') return Math.max(0, s.screen.next - (s.reaction ? 1 : 0));
  return Math.min(s.checkpoint, CHECKPOINTS.length - 1);
}

export function currentCard(s: RunState): Encounter | Inspection | null {
  if (s.screen.kind === 'encounter') return ENCOUNTER_BY_ID.get(s.screen.id) ?? null;
  if (s.screen.kind === 'inspection') return INSPECTION_BY_ID.get(s.screen.id) ?? null;
  return null;
}

export const topicOf = (card: Encounter | Inspection | null): Topic | undefined => card?.topic;

export function cardFor(s: RunState, topic: Topic): EvidenceId | undefined {
  return s.loadout.find((id) => {
    const c = EVIDENCE[id];
    return !s.used.includes(id) && c.topics.includes(topic) && !(c.blockedBy && check(c.blockedBy, s));
  });
}

/**
 * The character's contacts from `wanted` (all of them when undefined). With
 * `topic`, only those who can confirm it; null is a topic nobody can confirm.
 */
export function contactsFor(s: RunState, wanted: ContactId[] | undefined, topic?: Topic | null): ContactId[] {
  const ch = CHARACTERS[s.character];
  return (wanted ?? ch.contacts).filter((c) => ch.contacts.includes(c) && (topic === undefined || canConfirm(c, topic ?? undefined)));
}

/** The first unexposed one of contactsFor(). */
export function freeContact(s: RunState, wanted: ContactId[] | undefined, topic?: Topic | null): ContactId | undefined {
  return contactsFor(s, wanted, topic).find((c) => !s.exposed.includes(c));
}

export type Unavailable = 'noCard' | 'noContact' | null;

export interface Option {
  approach: Approach;
  /** Why it can't be picked right now; null when it can. */
  blocked: Unavailable;
  card?: EvidenceId;
  contact?: ContactId;
  /** contact: what they are asked to confirm (the card's topic). Unset when the answer only names them. */
  vouches?: Topic;
  /** Effects as they would apply now (conditions resolved, character weakness and the officer's reaction added). */
  effects: Effect[];
  /** Facts this answer brings out that the officer here reacts to (officerFlags()). */
  flagged?: FactId[];
}

/**
 * For a contact answer, the topic the contact must be able to confirm: the
 * card's, or null when the card has none. Undefined when no ability is needed.
 */
export const vouchTopic = (a: Approach, topic: Topic | undefined): Topic | null | undefined =>
  a.kind !== 'contact' || a.namesOnly ? undefined : (topic ?? null);

/**
 * The approaches the player sees. Ones that can never apply to this character
 * (a contact they don't have or who can't confirm the card's topic, someone
 * else's perk) are hidden; ones missing a
 * card or an unexposed contact are shown but blocked, so the cost of the loadout
 * is visible.
 */
export function options(s: RunState): Option[] {
  const card = currentCard(s);
  if (!card) return [];
  const ch = CHARACTERS[s.character];
  const topic = topicOf(card);
  const out: Option[] = [];
  for (const a of card.approaches) {
    if (!check(a.requires, s)) continue;
    if (a.kind === 'perk' && !(topic && ch.perkTopics.includes(topic))) continue;
    const vouches = vouchTopic(a, topic);
    if (a.kind === 'contact' && !contactsFor(s, a.contacts, vouches).length) continue;
    let blocked: Unavailable = null;
    let ev: EvidenceId | undefined;
    let contact: ContactId | undefined;
    if (a.kind === 'perk' && s.perkUsed) continue;
    if (a.kind === 'evidence') {
      ev = cardFor(s, a.topic!);
      if (!ev) blocked = 'noCard';
    }
    if (a.kind === 'contact') {
      contact = freeContact(s, a.contacts, vouches);
      if (!contact) blocked = 'noContact';
    }
    const effects = resolvedEffects(s, a, topic, ev);
    const flagged = officerFlags(s, effects);
    const o: Option = { approach: a, blocked, card: ev, contact, effects: [...effects, ...flagged.map(officerScrutiny(s))] };
    if (vouches) o.vouches = vouches;
    if (flagged.length) o.flagged = flagged;
    out.push(o);
  }
  return out;
}

/**
 * A no-cost answer: it spends no time, adds no scrutiny, names nobody and puts
 * no new fact on file here or at the next desk. Spending a document is allowed,
 * because the document is the preparation that earned it. Walking away is not
 * an answer, and losing the medicine or the bus connection is a cost.
 */
export function noCost(s: RunState, o: Option): boolean {
  return o.approach.kind !== 'withdraw' && costsOf(s, o).every((c) => c === 'document');
}

/**
 * What an answer spends. time: hours, or a longer trip to the bus. scrutiny:
 * officers watch closer. document: a card from the packing. person: a contact
 * named. belongings: the medicine. disclosure: a fact new to this desk, or sent
 * on new to the next one. Walking away spends none of these: it ends the run.
 */
export type Cost = 'time' | 'scrutiny' | 'document' | 'person' | 'belongings' | 'disclosure';

export function costsOf(s: RunState, o: Option): Cost[] {
  const to = nextDesk(deskOf(s));
  const out = new Set<Cost>();
  if (o.card) out.add('document');
  if (o.contact) out.add('person');
  for (const e of o.effects) {
    if (('time' in e && e.time < 0) || ('travel' in e && e.travel > 0)) out.add('time');
    else if ('scrutiny' in e && e.scrutiny > 0) out.add('scrutiny');
    else if ('loseMedicine' in e && s.medicine) out.add('belongings');
    else if (('fact' in e && !knows(s, e.fact)) || ('send' in e && !!to && sentFacts(s, e).some((f) => !knows(s, f, to)))) out.add('disclosure');
  }
  return [...out];
}

/**
 * What showing document `ev` does on a card about `topic`. A document that
 * settles the question keeps its harmless facts off file: the officer reads it
 * and hands it back.
 */
export function documentEffects(ev: EvidenceId, topic: Topic | undefined): Effect[] {
  const card = EVIDENCE[ev];
  if (!topic || !card.settles?.includes(topic)) return card.onUse;
  return card.onUse.filter((e) => !('fact' in e && HARMLESS_FACTS.includes(e.fact)));
}

function resolvedEffects(s: RunState, a: Approach, topic: Topic | undefined, ev: EvidenceId | undefined): Effect[] {
  const list: Effect[] = [];
  if (ev) list.push(...documentEffects(ev, topic));
  list.push(...a.effects);
  const weak = topic && CHARACTERS[s.character].weakTopics.includes(topic);
  if (a.kind === 'verify' && weak) list.push({ time: -1 });
  // Checking a statement from someone called in earlier takes an hour each.
  for (let i = callInsDue(s, a, topic).length; i > 0; i--) list.push({ time: -1 });
  const card = s.screen.kind === 'encounter' ? s.screen.id : undefined;
  return activeEffects(s, list.filter((e) => check(e.when, s)), { card });
}

// ── The officer at the desk

/**
 * The facts in `effects` that the officer at this desk reacts to: ones their
 * priority covers that come out here for the first time, and that the answer
 * does not already add scrutiny for. Only on a desk's own cards, not in an
 * inspection, which a supervisor runs.
 */
export function officerFlags(s: RunState, effects: Effect[]): FactId[] {
  if (s.screen.kind !== 'encounter') return [];
  const out: FactId[] = [];
  for (const r of OFFICERS[deskOf(s)].reactions) {
    if (!check(r.when, s)) continue;
    for (const e of effects) {
      if (!('fact' in e) || !r.reveals.includes(e.fact) || knows(s, e.fact) || out.includes(e.fact)) continue;
      if (effects.some((x) => 'scrutiny' in x && x.reason === e.fact)) continue;
      out.push(e.fact);
    }
  }
  return out;
}

/** The scrutiny the officer here adds for a flagged fact, with the fact as the reason. */
const officerScrutiny = (s: RunState) => (f: FactId): Effect => {
  const r = OFFICERS[deskOf(s)].reactions.find((x) => x.reveals.includes(f) && check(x.when, s));
  return { scrutiny: r?.scrutiny ?? 0, reason: f };
};

/**
 * The desk the player has just reached: the first card dealt there is on screen,
 * so the officer's priority line shows above it. Undefined anywhere else.
 */
export function deskIntro(s: RunState): Checkpoint | undefined {
  if (s.reaction || s.screen.kind !== 'encounter' || s.slot !== 1) return undefined;
  const card = ENCOUNTER_BY_ID.get(s.screen.id);
  return card && card.checkpoint === CHECKPOINTS[s.checkpoint] ? card.checkpoint : undefined;
}

/**
 * The contacts called in earlier whose statement this card checks: the ones who
 * can confirm its topic. Each costs 1 hour on whatever the player answers, except
 * walking away. Only on a desk's own cards: an inspection is the supervisor's,
 * and its answers keep the price they show, so the statements wait for a
 * later card.
 */
export function callInsDue(s: RunState, a: Approach, topic: Topic | undefined): ContactId[] {
  if (a.kind === 'withdraw' || s.screen.kind === 'inspection') return [];
  return (s.calledIn ?? []).filter((c) => canConfirm(c, topic));
}

/** `calledIn` after `c` is exposed: anyone but the protected contact waits to be checked. */
function callIn(s: RunState, c: ContactId): ContactId[] {
  const list = s.calledIn ?? [];
  return c === CHARACTERS[s.character].protectedContact || list.includes(c) ? list : [...list, c];
}

/** Where a scrutiny effect comes from: the card on screen, or the check being resolved. */
export interface ReasonSource {
  card?: string;
  check?: CheckId;
}

/**
 * Whether a scrutiny reason holds: this desk knows the fact (`facts`), or the reason
 * is a check and the effect belongs to its result or to a follow-up only that
 * check deals. Officials need something they can point at.
 */
export function scrutinyApplies(reason: ScrutinyReason, facts: readonly FactId[], from: ReasonSource): boolean {
  if (reason in CHECKS) {
    if (from.check === reason) return true;
    return !!from.card && CHECKS[reason as CheckId].cases.some((c) => c.followUp === from.card);
  }
  return facts.includes(reason as FactId);
}

/**
 * Drops scrutiny effects whose reason this desk does not know. Facts recorded
 * earlier in the same list count, so "Yes, I have both" can put the passport on
 * file and then add scrutiny for it.
 */
export function activeEffects(s: RunState, effects: Effect[], from: ReasonSource): Effect[] {
  const facts = knownAt(s);
  const out: Effect[] = [];
  for (const e of effects) {
    if ('fact' in e && !facts.includes(e.fact)) facts.push(e.fact);
    if ('scrutiny' in e && !scrutinyApplies(e.reason, facts, from)) continue;
    out.push(e);
  }
  return out;
}

/** The effects a check result applies, with conditions and scrutiny reasons resolved. */
export function checkEffects(s: RunState, checkId: CheckId, result: CheckCase): Effect[] {
  return activeEffects(s, (result.effects ?? []).filter((e) => check(e.when, s)), { check: checkId });
}

/** The facts a check result puts on file. A contact can explain them, never erase them. */
export function checkFindings(s: RunState, checkId: CheckId, result: CheckCase): Effect[] {
  return checkEffects(s, checkId, result).filter((e) => 'fact' in e);
}

// ── Applying things

function apply(s: RunState, effects: Effect[]): RunState {
  let n = s;
  for (const e of effects) {
    if (!check(e.when, n)) continue;
    if ('time' in e) n = { ...n, time: Math.max(0, n.time + e.time) };
    // Capped at the max, because anything at the max already means an inspection.
    else if ('scrutiny' in e) n = { ...n, scrutiny: Math.min(MAX_SCRUTINY, Math.max(0, n.scrutiny + e.scrutiny)) };
    else if ('fact' in e) n = { ...n, facts: teach(n.facts, e.fact, desksLearning(n.bulletin, deskOf(n))) };
    else if ('send' in e) {
      const to = nextDesk(deskOf(n));
      if (to) for (const f of sentFacts(n, e)) n = { ...n, facts: teach(n.facts, f, [to]) };
    }
    else if ('claim' in e) n = claim(n, e.claim);
    else if ('loseMedicine' in e) n = { ...n, medicine: false };
    else if ('travel' in e) n = { ...n, travel: travelOf(n) + Math.max(0, e.travel) };
  }
  return n;
}

/** Hours the trip from the border to the bus takes: the run needs at least this many left. */
export const travelOf = (s: Pick<RunState, 'travel'>): number => s.travel ?? MISSION_MIN_TIME;

/**
 * The bus is out of reach: fewer hours left than the trip takes. Time never
 * comes back and the trip never gets shorter, so only Too late or walking away
 * can follow (the walk checks it on every state), and the player may finish quickly.
 */
export const doomed = (s: RunState): boolean => !s.ending && !s.withdrew && s.time < travelOf(s);

function say(s: RunState, lines: LogEntry[]): RunState {
  return { ...s, reaction: [...(s.reaction ?? []), ...lines], log: [...s.log, ...lines] };
}

export function endingFor(s: RunState): EndingId {
  if (s.withdrew) return 'turnedBack';
  if (s.time < travelOf(s)) return 'tooLate';
  if (!s.medicine || s.exposed.includes(CHARACTERS[s.character].protectedContact)) return 'homeAtCost';
  return 'homeInTime';
}

/**
 * Which text the ending shows, as the part after `ending.` in the key. Too late
 * splits on what the engine knows: no hours left at all means the bus left while
 * you were still at the desks; some hours but fewer than the trip means you got
 * through and arrive after visiting hours. Time never comes back, so 0 at the end
 * means it ran out before the last checkpoint was done.
 */
export function endingText(s: RunState): string {
  const ending = s.ending ?? endingFor(s);
  return ending === 'tooLate' && s.time === 0 ? 'missedBus' : ending;
}

function finish(s: RunState): RunState {
  return { ...s, screen: { kind: 'ending' }, ending: endingFor(s) };
}

// ── The director

function eligible(s: RunState, e: Encounter): boolean {
  return !s.seen.includes(e.id) && check(e.when, s);
}

/** A calm card has one answer, so tapping it is not a decision. */
export const isCalm = (id: string): boolean => !!ENCOUNTER_BY_ID.get(id)?.calm;

/** Related cards, follow-ups and inspections escalate; a routine card is a breather. */
export const escalates = (id: string): boolean => ENCOUNTER_BY_ID.get(id)?.kind !== 'routine';

function show(s: RunState, id: string): RunState {
  return { ...s, seen: [...s.seen, id], streak: escalates(id) ? (s.streak ?? 0) + 1 : 0, screen: { kind: 'encounter', id } };
}

/** The routine cards still to be asked at this desk. */
export function routinesLeft(s: RunState): Encounter[] {
  const cp = CHECKPOINTS[Math.min(s.checkpoint, CHECKPOINTS.length - 1)];
  return ENCOUNTERS.filter((e) => e.checkpoint === cp && e.kind === 'routine' && eligible(s, e));
}

/** The best related card left at this desk: the one slot 1 deals. */
function relatedCard(s: RunState): Encounter | undefined {
  const cp = CHECKPOINTS[s.checkpoint];
  const related = ENCOUNTERS.filter((e) => e.checkpoint === cp && e.kind === 'related' && eligible(s, e));
  return related.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
}

/** Whether advance() would deal an escalating card next: an inspection, a follow-up, a challenge or a related card. */
function escalatesNext(s: RunState): boolean {
  if (s.scrutiny >= MAX_SCRUTINY || s.pending.some((id) => !s.seen.includes(id))) return true;
  if (s.slot >= 2) return !!pendingChallenge(s);
  return s.slot === 1 && !!relatedCard(s);
}

/**
 * The pacing rule: after 2 escalating cards in a row, a routine card still left
 * at this desk comes first, a calm one if there is one. It is one more card, and
 * whatever was next still comes after it. Calm cards are only dealt here.
 */
function breather(s: RunState): Encounter | undefined {
  if ((s.streak ?? 0) < 2 || !escalatesNext(s)) return undefined;
  return restCard(s);
}

/**
 * The card a breather deals: a calm one if any is left at this desk, else any
 * routine card left. After an inspection the calm cards come in reverse order,
 * so the interruption differs between runs (the officer's phone, not the water).
 */
function restCard(s: RunState): Encounter | undefined {
  const left = routinesLeft(s);
  const calm = left.filter((e) => e.calm);
  return (s.inspections ? calm[calm.length - 1] : calm[0]) ?? left[0];
}

/** Deal the next card: a pending follow-up, an inspection, the next slot, or the end. */
function advance(s: RunState, dealer: Dealer): RunState {
  if (s.withdrew) return finish(s);
  const rest = breather(s);
  if (rest) return show(s, rest.id);
  if (s.scrutiny >= MAX_SCRUTINY) return inspect(s, dealer);
  while (s.pending.length) {
    const [id, ...rest] = s.pending;
    s = { ...s, pending: rest };
    if (!s.seen.includes(id)) return show(s, id);
  }
  if (s.slot >= 2) {
    if (!(s.spotChecked ?? []).includes(deskOf(s))) return advance(spotCheck(s, dealer), dealer);
    const challenge = pendingChallenge(s);
    if (challenge) return show(s, challenge);
    const next = s.checkpoint + 1;
    if (next >= CHECKPOINTS.length) return admission(s, dealer);
    return { ...s, checkpoint: next, slot: 0, screen: { kind: 'between', next } };
  }
  return deal(s, dealer);
}

/**
 * Before admission a supervisor reads the file once, on a run with no
 * inspection yet that can still make the bus (a doomed run is waved through,
 * because one more card changes nothing). She sends you to secondary
 * inspection whenever scrutiny is above 0, the scrutiny a character starts
 * with included: Mark's second passport is on file before he says a word. A
 * paper on the topic the bulletin warned about, shown on the way, settles her
 * two times in three: the dealer draws one of 3. She inspects on that topic when an
 * inspection takes such a paper (an evidence answer), else the dealer picks one
 * as usual.
 *
 * This is what puts an inspection in a quarter to a third of runs (`npm run
 * autoplay`). Once spot-checks caught lies at the desks, counting only the
 * scrutiny gained on the way left the share under a quarter, so the start
 * value counts too (2op.9). Once the day and the file decided which lies get
 * caught, caught liars pushed it over a third, so a warned-about paper settles
 * her more often (2op.12). The pacing rule still holds: after 2 escalating
 * cards a routine card left comes first, and the supervisor reads the file
 * again after it, drawing only then.
 */
function admission(s: RunState, dealer: Dealer): RunState {
  if (s.inspections || s.scrutiny <= 0 || doomed(s) || !inspectionsFitting(s).length) return finish(s);
  const rest = (s.streak ?? 0) >= 2 ? restCard(s) : undefined;
  if (rest) return show(s, rest.id);
  let n = s;
  if (coversWarning(s.used, s.bulletin)) {
    const r = dealer(s.rng, 3);
    n = { ...s, rng: r.rng };
    if (r.index !== 0) return finish(n);
  }
  const topic = BULLETIN_TOPICS[n.bulletin];
  return inspect(n, dealer, (i) => i.approaches.some((a) => a.kind === 'evidence' && a.topic === topic));
}

/**
 * A challenge card for this checkpoint that applies and has not been dealt yet.
 * Once a run has been inspected, one per desk: an inspection answer (a phone
 * search, say) can put a new fact on file, and a second challenge on top would
 * push the run past the decision budget.
 */
function pendingChallenge(s: RunState): string | undefined {
  const cp = CHECKPOINTS[s.checkpoint];
  if (s.inspections && CHALLENGES.some((id) => s.seen.includes(id) && ENCOUNTER_BY_ID.get(id)?.checkpoint === cp)) return undefined;
  return CHALLENGES.find((id) => {
    const e = ENCOUNTER_BY_ID.get(id);
    return !!e && e.checkpoint === cp && eligible(s, e);
  });
}

/**
 * What a spot-check of claim `c` finds at this desk. clear: no fact this desk
 * knows speaks against it. Otherwise there is a flaw, a disproof before an
 * inconsistency, and the check decides: answered when its challenge card was
 * already put to you; explained when it is an inconsistency and you have since
 * said what the clarify answer says (CLARIFIED_BY), so checking that takes
 * SPOT_CHECK_HOURS; else flaw, and `card` is the challenge to answer.
 */
export type SpotResult = { result: 'clear' | 'answered' | 'explained' } | { result: 'flaw'; card: (typeof CHALLENGES)[number] };

export function spotCheckOf(s: RunState, c: ClaimId): SpotResult {
  const card = CHALLENGES.find((id) => CHALLENGE_PAIRS[id].some(([claim, f]) => claim === c && knows(s, f)));
  if (!card) return { result: 'clear' };
  if (s.seen.includes(card)) return { result: 'answered' };
  if (card === 'i_clarify' && s.claims.includes(CLARIFIED_BY)) return { result: 'explained' };
  return { result: 'flaw', card };
}

/**
 * What a challenge card puts to you: the claim, the desk where you first said
 * it, and the fact on file that catches it. The pair is the first that holds
 * here, the one an answer is charged for (firstCaught). Undefined on any other
 * card. A save from before saidAt existed names the first desk that wrote the
 * claim down, else this one.
 */
export function caught(s: RunState, card: string): { claim: ClaimId; desk: Checkpoint; fact: FactId } | undefined {
  const pairs = (CHALLENGE_PAIRS as Record<string, readonly (readonly [ClaimId, FactId])[]>)[card];
  const pair = pairs?.find(([c, f]) => s.claims.includes(c) && knows(s, f));
  if (!pair) return undefined;
  const [claim, fact] = pair;
  return { claim, desk: saidDesk(s, claim), fact };
}

/**
 * The text key for an answer on the card showing, `part` being its label or its
 * reaction. A challenge card can word an answer for the pair that dealt it
 * (caught()): `enc.i_clarify.hotelStay.familyAddress.accept.label`, because
 * "I came as a tourist" is the wrong answer to a hotel booking. Else the
 * day's wording, when the bulletin changes what the answer does
 * (`enc.c_cash.under.bulletin.customs.reaction`: on a customs day the cash is
 * counted anyway). Else the traveler's own wording (own()), else the key itself.
 */
export function answerKey(s: RunState, approach: string, part: 'label' | 'reaction'): string {
  const sc = s.screen;
  const id = sc.kind === 'encounter' || sc.kind === 'inspection' ? sc.id : '';
  const prefix = sc.kind === 'inspection' ? 'insp' : 'enc';
  const pair = sc.kind === 'encounter' ? caught(s, id) : undefined;
  const paired = pair && `${prefix}.${id}.${pair.claim}.${pair.fact}.${approach}.${part}`;
  if (paired && has(paired)) return paired;
  const daily = `${prefix}.${id}.${approach}.bulletin.${s.bulletin}.${part}`;
  if (has(daily)) return daily;
  return own(`${prefix}.${id}.${approach}.${part}`, s.character);
}

/** Where you first said `c`; a save from before saidAt existed names the first desk that wrote it down, else this one. */
const saidDesk = (s: RunState, c: ClaimId): Checkpoint => s.saidAt?.[c] ?? loggedAt(s, c)[0] ?? deskOf(s);

/**
 * Each desk spot-checks one claim you made before you leave it, once: the
 * dealer picks which, among the claims on file (written down at some desk, so
 * one only said aloud to an officer who does not write it down is never
 * checked). A claim that fits what this desk has on file passes
 * cleanly, at no cost. A flaw opens a check and the check decides
 * (spotCheckOf()): the challenge card is queued like a follow-up, so the pacing
 * rule still puts a routine card first, and its answers keep the price they
 * show. Randomness picks the problem; the answer is a known cost. A challenge
 * that applies at the interview is still always dealt there (pendingChallenge()).
 */
function spotCheck(s: RunState, dealer: Dealer): RunState {
  const n: RunState = { ...s, spotChecked: [...(s.spotChecked ?? []), deskOf(s)] };
  // After a secondary inspection the whole file has been read, so the desks stop
  // spot-checking. It also keeps a long run inside the decision budget.
  const onFile = s.claims.filter((c) => loggedAt(s, c).length);
  if (!onFile.length || s.inspections) return n;
  const r = dealer(s.rng, onFile.length);
  const claimed = onFile[r.index];
  const found = spotCheckOf(s, claimed);
  // The claim in this traveler's own wording when there is one: Mark's denial is
  // claim.noOtherFamily.mark, about the border, not Lena's relatives here.
  const vars: Record<string, string> = { claim: own(`claim.${claimed}`, s.character).slice('claim.'.length), hours: String(SPOT_CHECK_HOURS) };
  if (found.result === 'explained') {
    // Like a challenge card (caught()): your words, where you said them, and the fact
    // that makes them look odd. No inconsistency claim has a traveler's own wording,
    // so `said` is the claim id (spotcheck.test.ts checks that).
    const [, fact] = CHALLENGE_PAIRS.i_clarify.find(([c, f]) => c === claimed && knows(s, f))!;
    Object.assign(vars, { said: claimed, desk: saidDesk(s, claimed), fact });
  }
  const checked = say({ ...n, rng: r.rng }, [{ key: `spot.${found.result}`, vars }]);
  if (found.result === 'explained') return { ...checked, time: Math.max(0, checked.time - SPOT_CHECK_HOURS) };
  if (found.result === 'flaw') return { ...checked, pending: [...checked.pending, found.card] };
  return checked;
}

function deal(s: RunState, dealer: Dealer): RunState {
  const cp = CHECKPOINTS[s.checkpoint];
  // Calm cards are kept for breathers, so a desk always has one when the pacing rule needs it.
  const routine = ENCOUNTERS.filter((e) => e.checkpoint === cp && e.kind === 'routine' && !e.calm && eligible(s, e));
  let chosen: Encounter | undefined;
  let rng = s.rng;
  if (s.slot === 0) chosen = routine.find((e) => e.opening);
  if (s.slot === 1) chosen = relatedCard(s);
  if (!chosen) {
    if (!routine.length) throw new Error(`no card left for ${cp} slot ${s.slot}`);
    const r = dealer(rng, routine.length);
    chosen = routine[r.index];
    rng = r.rng;
  }
  return show({ ...s, rng, slot: s.slot + 1 }, chosen.id);
}

/** The inspections that can be dealt now: their condition holds, and a confiscation needs the medicine. */
const inspectionsFitting = (s: RunState): Inspection[] =>
  INSPECTIONS.filter((i) => check(i.when, s) && (i.kind !== 'confiscation' || s.medicine));

/** Deal an inspection: the first fitting one `prefer` accepts, else the dealer picks. */
function inspect(s: RunState, dealer: Dealer, prefer?: (i: Inspection) => boolean): RunState {
  const fits = inspectionsFitting(s);
  const fresh = fits.filter((i) => !s.seen.includes(i.id));
  const pool = fresh.length ? fresh : fits;
  // Nothing left to ask for: the medicine, your mother and every fact an
  // inspection could take are already gone or on file. The supervisor reads
  // the file and sends you back, and scrutiny drops as after an inspection.
  if (!pool.length) return advance(say({ ...s, scrutiny: SCRUTINY_AFTER_INSPECTION }, [{ key: 'insp.none' }]), dealer);
  const preferred = prefer && pool.find(prefer);
  const r = preferred ? { rng: s.rng, index: pool.indexOf(preferred) } : dealer(s.rng, pool.length);
  const id = pool[r.index].id;
  return {
    ...s,
    rng: r.rng,
    seen: s.seen.includes(id) ? s.seen : [...s.seen, id],
    streak: (s.streak ?? 0) + 1,
    inspections: s.inspections + 1,
    screen: { kind: 'inspection', id },
  };
}

// ── Waiting room

function startWait(s: RunState, checkId: NonNullable<Approach['check']>): RunState {
  const c = CHECKS[checkId];
  const resolved: CheckCase = c.cases.find((k) => check(k.when, s)) ?? { result: 'clear' };
  let rng = s.rng;
  const beats: number[] = [];
  while (beats.length < c.beats) {
    const r = nextRandom(rng);
    rng = r.rng;
    const b = Math.floor(r.value * BEAT_COUNT);
    if (!beats.includes(b)) beats.push(b);
  }
  return { ...s, rng, screen: { kind: 'wait', check: checkId, beats, shown: 0, resolved, asked: false } };
}

export function waitActions(s: RunState): { action: WaitAction; blocked: Unavailable; contact?: ContactId; vouches?: Topic }[] {
  if (s.screen.kind !== 'wait') return [];
  const done = s.screen.shown >= s.screen.beats.length;
  if (!done) return [];
  // Every check can be waited out, and asked about once: the hint comes before
  // you decide whether to wait or call someone. Someone can vouch only when a
  // free contact can confirm what the check is about; nobody vouches away data.
  const out: { action: WaitAction; blocked: Unavailable; contact?: ContactId; vouches?: Topic }[] = [
    { action: 'wait', blocked: null },
    ...(s.screen.asked ? [] : [{ action: 'ask' as const, blocked: null }]),
  ];
  const contact = assistContact(s);
  // vouches: the check's topic, so the option can say what the contact may confirm.
  const vouches = CHECKS[s.screen.check].topic;
  return contact && vouches ? [...out, { action: 'assist', blocked: null, contact, vouches }] : out;
}

/** Who could vouch on the check in the waiting room, if anyone. */
function assistContact(s: RunState): ContactId | undefined {
  if (s.screen.kind !== 'wait') return undefined;
  const topic = CHECKS[s.screen.check].topic;
  return topic ? freeContact(s, undefined, topic) : undefined;
}

function resolveWait(s: RunState, how: WaitAction, dealer: Dealer): RunState {
  if (s.screen.kind !== 'wait') return s;
  const w = s.screen;
  let result = w.resolved;
  let n = s;
  // Asking puts your urgency on file and tells you how it is going. You stay in
  // the waiting room, so the hint can decide whether to wait or call someone.
  if (how === 'ask') {
    n = say(apply(n, [{ fact: 'urgency' }]), [{ key: `check.${w.check}.hint.${result.result}` }]);
    return { ...n, decisions: n.decisions + 1, screen: { ...w, asked: true } };
  }
  if (how === 'assist') {
    const c = assistContact(n);
    if (!c) return s;
    n = { ...n, exposed: [...n.exposed, c], calledIn: callIn(n, c) };
    n = say(n, [{ key: 'wait.assist.reaction', vars: { contact: c } }]);
    // The finding stays on file; the contact only settles what it means, so
    // the check clears with no follow-up and no scrutiny from it.
    n = apply(n, checkFindings(n, w.check, result));
    result = { result: 'clear' };
  }
  n = apply(n, checkEffects(n, w.check, result));
  n = say(n, [{ key: `check.${w.check}.${result.result}` }]);
  if (result.followUp && !n.seen.includes(result.followUp)) n = { ...n, pending: [result.followUp, ...n.pending] };
  return advance({ ...n, decisions: n.decisions + (how === 'wait' ? 0 : 1) }, dealer);
}

// ── Choosing

function choose(s: RunState, approachId: string, dealer: Dealer): RunState {
  const card = currentCard(s);
  const opt = options(s).find((o) => o.approach.id === approachId);
  if (!card || !opt || opt.blocked) return s;
  const topic = topicOf(card);
  // The statements this card checks are settled now, whatever the answer.
  const due = callInsDue(s, opt.approach, topic);
  const decided = s.screen.kind === 'encounter' && isCalm(s.screen.id) ? 0 : 1;
  let n: RunState = { ...s, reaction: null, decisions: s.decisions + decided, calledIn: (s.calledIn ?? []).filter((c) => !due.includes(c)) };
  if (opt.card) n = { ...n, used: [...n.used, opt.card] };
  if (opt.contact) n = { ...n, exposed: [...n.exposed, opt.contact], calledIn: callIn(n, opt.contact) };
  if (opt.approach.kind === 'perk') n = { ...n, perkUsed: true };
  n = apply(n, opt.effects);
  const vars: Record<string, string> = {};
  if (opt.card) vars.card = opt.card;
  if (opt.contact) vars.contact = opt.contact;
  n = say(n, [{ key: answerKey(s, approachId, 'reaction'), vars }]);
  // The officer's priority is the reason for the scrutiny, so the reaction says it.
  for (const f of opt.flagged ?? []) n = say(n, [{ key: `officer.${deskOf(s)}.flags`, vars: { fact: f } }]);
  // The call-in hour is a real cost too, so the reaction names whose statement it checks.
  for (const c of due) n = say(n, [{ key: 'calledIn.reaction', vars: { contact: c } }]);
  // The weakness hour is a real cost, so the reaction says what it is spent on.
  if (opt.approach.kind === 'verify' && topic && CHARACTERS[s.character].weakTopics.includes(topic)) {
    n = say(n, [{ key: `weak.${topic}.reaction` }]);
  }
  if (opt.approach.kind === 'withdraw') return finish({ ...n, withdrew: true });
  if (s.screen.kind === 'inspection') n = { ...n, scrutiny: SCRUTINY_AFTER_INSPECTION };
  if (opt.approach.check) return startWait(n, opt.approach.check);
  return advance(n, dealer);
}

/**
 * The only way a run moves. `dealer` picks routine cards and inspections; the
 * game uses the seeded one, tests pass a scripted one to try every pick.
 */
export function step(s: RunState, action: Action, dealer: Dealer = randomDealer): RunState {
  switch (action.type) {
    case 'choose':
      return choose(s, action.approach, dealer);
    case 'beat':
      if (s.screen.kind !== 'wait' || s.screen.shown >= s.screen.beats.length) return s;
      return { ...s, reaction: null, screen: { ...s.screen, shown: s.screen.shown + 1 } };
    case 'waitAction': {
      const a = waitActions(s).find((w) => w.action === action.action);
      // After an ask, its hint is read (ack) before anything else is chosen.
      if (!a || a.blocked || s.reaction) return s;
      return resolveWait({ ...s, reaction: null }, action.action, dealer);
    }
    case 'ack':
      if (s.reaction) return { ...s, reaction: null };
      if (s.screen.kind === 'between') return deal(s, dealer);
      return s;
    case 'finish':
      if (!canFinish(s)) return s;
      // Nothing more is asked or spent: the remaining desks wave you through, too late for the bus.
      return say(finish({ ...s, reaction: null, pending: [] }), [{ key: 'finish.reaction' }]);
  }
}

/** The finish-quickly option shows on a card once the bus is out of reach. */
export const canFinish = (s: RunState): boolean =>
  doomed(s) && !s.reaction && (s.screen.kind === 'encounter' || s.screen.kind === 'inspection');

/** Everything the player can do right now, for tests and the autoplay bot. */
export function legalActions(s: RunState): Action[] {
  if (s.ending) return [];
  if (s.reaction) return [{ type: 'ack' }];
  const sc: Screen = s.screen;
  if (sc.kind === 'between') return [{ type: 'ack' }];
  if (sc.kind === 'wait') {
    if (sc.shown < sc.beats.length) return [{ type: 'beat' }];
    return waitActions(s).filter((w) => !w.blocked).map((w) => ({ type: 'waitAction', action: w.action }));
  }
  const answers: Action[] = options(s).filter((o) => !o.blocked).map((o) => ({ type: 'choose', approach: o.approach.id }));
  return canFinish(s) ? [...answers, { type: 'finish' }] : answers;
}
