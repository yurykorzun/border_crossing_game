// The rules. Pure: newRun() builds a state, step() takes a state and an action
// and returns the next state. The UI only renders state and sends actions.

import type {
  Action, Approach, BulletinId, CharacterId, CheckCase, Checkpoint, ClaimId, Cond, ContactId, Effect, Encounter,
  CheckId, EndingId, EvidenceId, FactId, FactMap, Inspection, LogEntry, RunState, Screen, ScrutinyReason, Topic, WaitAction,
} from './types';
import { CHECKPOINTS } from './types';
import {
  BEAT_COUNT, CHARACTERS, EVIDENCE, MAX_SCRUTINY, MISSION_MIN_TIME, OFFICERS, SCRUTINY_AFTER_INSPECTION, START_TIME, canConfirm, writesDown,
} from './content/world';
import { CHALLENGES, CHECKS, ENCOUNTERS,ENCOUNTER_BY_ID, INSPECTIONS, INSPECTION_BY_ID } from './content/encounters';
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
    medicine: true,
    perkUsed: false,
    withdrew: false,
    checkpoint: 0,
    slot: 0,
    seen: [],
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
  const n = s.claims.includes(c) ? s : { ...s, claims: [...s.claims, c] };
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
  if (cond.any && !cond.any.some((c) => check(c, s))) return false;
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

function resolvedEffects(s: RunState, a: Approach, topic: Topic | undefined, ev: EvidenceId | undefined): Effect[] {
  const list: Effect[] = [];
  if (ev) list.push(...EVIDENCE[ev].onUse);
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
 * walking away.
 */
export function callInsDue(s: RunState, a: Approach, topic: Topic | undefined): ContactId[] {
  if (a.kind === 'withdraw') return [];
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
export const travelOf = (s: RunState): number => s.travel ?? MISSION_MIN_TIME;

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

function show(s: RunState, id: string): RunState {
  return { ...s, seen: [...s.seen, id], screen: { kind: 'encounter', id } };
}

/** Deal the next card: a pending follow-up, an inspection, the next slot, or the end. */
function advance(s: RunState, dealer: Dealer): RunState {
  if (s.withdrew) return finish(s);
  if (s.scrutiny >= MAX_SCRUTINY) return inspect(s, dealer);
  while (s.pending.length) {
    const [id, ...rest] = s.pending;
    s = { ...s, pending: rest };
    if (!s.seen.includes(id)) return show(s, id);
  }
  if (s.slot >= 2 && !(s.slot === 2 && quiet(s) && extraCard(s))) {
    const challenge = pendingChallenge(s);
    if (challenge) return show(s, challenge);
    const next = s.checkpoint + 1;
    if (next >= CHECKPOINTS.length) return finish(s);
    return { ...s, checkpoint: next, slot: 0, screen: { kind: 'between', next } };
  }
  return deal(s, dealer);
}

/** A challenge card for this checkpoint that applies and has not been dealt yet. */
function pendingChallenge(s: RunState): string | undefined {
  const cp = CHECKPOINTS[s.checkpoint];
  return CHALLENGES.find((id) => {
    const e = ENCOUNTER_BY_ID.get(id);
    return !!e && e.checkpoint === cp && eligible(s, e);
  });
}

/**
 * The run has been quiet so far: every decision was a checkpoint card, with no
 * follow-up, no inspection and no question asked in a waiting room. Only such a
 * run gets a third card, so a short run grows and a long one does not.
 */
function quiet(s: RunState): boolean {
  if (s.inspections || s.decisions !== s.seen.length) return false;
  return s.seen.every((id) => {
    const kind = ENCOUNTER_BY_ID.get(id)?.kind;
    return kind === 'routine' || kind === 'related';
  });
}

/**
 * The third card for a quiet run: the routine question not asked yet, so
 * everyone hears both, else the related card that fits best. Nothing new to
 * read, only one more decision.
 */
function extraCard(s: RunState): Encounter | undefined {
  const cp = CHECKPOINTS[s.checkpoint];
  const fits = ENCOUNTERS.filter((e) => e.checkpoint === cp && eligible(s, e));
  return fits.find((e) => e.kind === 'routine')
    ?? fits.filter((e) => e.kind === 'related').sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
}

function deal(s: RunState, dealer: Dealer): RunState {
  const cp = CHECKPOINTS[s.checkpoint];
  const routine = ENCOUNTERS.filter((e) => e.checkpoint === cp && e.kind === 'routine' && eligible(s, e));
  let chosen: Encounter | undefined;
  let rng = s.rng;
  if (s.slot === 2) return show({ ...s, slot: 3 }, extraCard(s)!.id);
  if (s.slot === 0) chosen = routine.find((e) => e.opening);
  if (s.slot === 1) {
    const related = ENCOUNTERS.filter((e) => e.checkpoint === cp && e.kind === 'related' && eligible(s, e));
    related.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    chosen = related[0];
  }
  if (!chosen) {
    if (!routine.length) throw new Error(`no card left for ${cp} slot ${s.slot}`);
    const r = dealer(rng, routine.length);
    chosen = routine[r.index];
    rng = r.rng;
  }
  return show({ ...s, rng, slot: s.slot + 1 }, chosen.id);
}

function inspect(s: RunState, dealer: Dealer): RunState {
  const fits = INSPECTIONS.filter((i) => check(i.when, s) && (i.kind !== 'confiscation' || s.medicine));
  const fresh = fits.filter((i) => !s.seen.includes(i.id));
  const pool = fresh.length ? fresh : fits;
  if (!pool.length) throw new Error('no inspection fits');
  const r = dealer(s.rng, pool.length);
  const id = pool[r.index].id;
  return {
    ...s,
    rng: r.rng,
    seen: s.seen.includes(id) ? s.seen : [...s.seen, id],
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
  // Every check can be waited out or asked about. Someone can vouch only when a
  // free contact can confirm what the check is about; nobody vouches away data.
  const out: { action: WaitAction; blocked: Unavailable; contact?: ContactId; vouches?: Topic }[] = [
    { action: 'wait', blocked: null },
    { action: 'ask', blocked: null },
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
  if (how === 'ask') {
    n = apply(n, [{ fact: 'urgency' }]);
    n = say(n, [{ key: `check.${w.check}.hint.${result.result}` }]);
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
  const prefix = s.screen.kind === 'inspection' ? 'insp' : 'enc';
  const topic = topicOf(card);
  // The statements this card checks are settled now, whatever the answer.
  const due = callInsDue(s, opt.approach, topic);
  let n: RunState = { ...s, reaction: null, decisions: s.decisions + 1, calledIn: (s.calledIn ?? []).filter((c) => !due.includes(c)) };
  if (opt.card) n = { ...n, used: [...n.used, opt.card] };
  if (opt.contact) n = { ...n, exposed: [...n.exposed, opt.contact], calledIn: callIn(n, opt.contact) };
  if (opt.approach.kind === 'perk') n = { ...n, perkUsed: true };
  n = apply(n, opt.effects);
  const vars: Record<string, string> = {};
  if (opt.card) vars.card = opt.card;
  if (opt.contact) vars.contact = opt.contact;
  n = say(n, [{ key: `${prefix}.${card.id}.${approachId}.reaction`, vars }]);
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
      if (!a || a.blocked) return s;
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
