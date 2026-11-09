// The rules. Pure: newRun() builds a state, step() takes a state and an action
// and returns the next state. The UI only renders state and sends actions.

import type {
  Action, Approach, BulletinId, CharacterId, CheckCase, Cond, ContactId, Effect, Encounter,
  CheckId, EndingId, EvidenceId, FactId, Inspection, LogEntry, RunState, Screen, ScrutinyReason, Topic, WaitAction,
} from './types';
import { CHECKPOINTS } from './types';
import {
  BEAT_COUNT, CHARACTERS, EVIDENCE, MAX_SCRUTINY, MISSION_MIN_TIME, SCRUTINY_AFTER_INSPECTION, START_TIME,
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
    v: 1,
    seed: setup.seed,
    rng: setup.seed,
    character: ch.id,
    bulletin: setup.bulletin,
    loadout: [...setup.loadout],
    used: [],
    exposed: [],
    time: START_TIME,
    scrutiny: ch.startScrutiny,
    facts: [],
    claims: [],
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

// ── Conditions

export function check(cond: Cond | undefined, s: RunState): boolean {
  if (!cond) return true;
  const ch = CHARACTERS[s.character];
  if (cond.character && cond.character !== s.character) return false;
  if (cond.background && !ch.background.includes(cond.background)) return false;
  if (cond.bulletin && cond.bulletin !== s.bulletin) return false;
  if (cond.facts && !cond.facts.every((f) => s.facts.includes(f))) return false;
  if (cond.noFacts && cond.noFacts.some((f) => s.facts.includes(f))) return false;
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

const topicOf = (card: Encounter | Inspection | null): Topic | undefined =>
  card && 'topic' in card ? card.topic : undefined;

export function cardFor(s: RunState, topic: Topic): EvidenceId | undefined {
  return s.loadout.find((id) => {
    const c = EVIDENCE[id];
    return !s.used.includes(id) && c.topics.includes(topic) && !(c.blockedBy && check(c.blockedBy, s));
  });
}

export function freeContact(s: RunState, wanted: ContactId[] | undefined): ContactId | undefined {
  const ch = CHARACTERS[s.character];
  return (wanted ?? ch.contacts).find((c) => ch.contacts.includes(c) && !s.exposed.includes(c));
}

export type Unavailable = 'noCard' | 'noContact' | null;

export interface Option {
  approach: Approach;
  /** Why it can't be picked right now; null when it can. */
  blocked: Unavailable;
  card?: EvidenceId;
  contact?: ContactId;
  /** Effects as they would apply now (conditions resolved, character weakness added). */
  effects: Effect[];
}

/**
 * The approaches the player sees. Ones that can never apply to this character
 * (a contact they don't have, someone else's perk) are hidden; ones missing a
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
    if (a.kind === 'contact' && !(a.contacts ?? ch.contacts).some((c) => ch.contacts.includes(c))) continue;
    let blocked: Unavailable = null;
    let ev: EvidenceId | undefined;
    let contact: ContactId | undefined;
    if (a.kind === 'perk' && s.perkUsed) continue;
    if (a.kind === 'evidence') {
      ev = cardFor(s, a.topic!);
      if (!ev) blocked = 'noCard';
    }
    if (a.kind === 'contact') {
      contact = freeContact(s, a.contacts);
      if (!contact) blocked = 'noContact';
    }
    out.push({ approach: a, blocked, card: ev, contact, effects: resolvedEffects(s, a, topic, ev) });
  }
  return out;
}

function resolvedEffects(s: RunState, a: Approach, topic: Topic | undefined, ev: EvidenceId | undefined): Effect[] {
  const list: Effect[] = [];
  if (ev) list.push(...EVIDENCE[ev].onUse);
  list.push(...a.effects);
  const weak = topic && CHARACTERS[s.character].weakTopics.includes(topic);
  if (a.kind === 'verify' && weak) list.push({ time: -1 });
  const card = s.screen.kind === 'encounter' ? s.screen.id : undefined;
  return activeEffects(s, list.filter((e) => check(e.when, s)), { card });
}

/** Where a scrutiny effect comes from: the card on screen, or the check being resolved. */
export interface ReasonSource {
  card?: string;
  check?: CheckId;
}

/**
 * Whether a scrutiny reason holds: the fact is on file (`facts`), or the reason
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
 * Drops scrutiny effects whose reason does not hold. Facts recorded earlier in
 * the same list count, so "Yes, I have both" can put the passport on file and
 * then add scrutiny for it.
 */
export function activeEffects(s: RunState, effects: Effect[], from: ReasonSource): Effect[] {
  const facts = [...s.facts];
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

// ── Applying things

function apply(s: RunState, effects: Effect[]): RunState {
  let n = s;
  for (const e of effects) {
    if (!check(e.when, n)) continue;
    if ('time' in e) n = { ...n, time: Math.max(0, n.time + e.time) };
    // Capped at the max, because anything at the max already means an inspection.
    else if ('scrutiny' in e) n = { ...n, scrutiny: Math.min(MAX_SCRUTINY, Math.max(0, n.scrutiny + e.scrutiny)) };
    else if ('fact' in e) n = n.facts.includes(e.fact) ? n : { ...n, facts: [...n.facts, e.fact] };
    else if ('claim' in e) n = n.claims.includes(e.claim) ? n : { ...n, claims: [...n.claims, e.claim] };
    else if ('loseMedicine' in e) n = { ...n, medicine: false };
  }
  return n;
}

function say(s: RunState, lines: LogEntry[]): RunState {
  return { ...s, reaction: [...(s.reaction ?? []), ...lines], log: [...s.log, ...lines] };
}

export function endingFor(s: RunState): EndingId {
  if (s.withdrew) return 'turnedBack';
  if (s.time < MISSION_MIN_TIME) return 'tooLate';
  if (!s.medicine || s.exposed.includes(CHARACTERS[s.character].protectedContact)) return 'homeAtCost';
  return 'homeInTime';
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
  const fits = INSPECTIONS.filter((i) => check(i.when, s) && (i.id !== 's_medicine' || s.medicine));
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

export function waitActions(s: RunState): { action: WaitAction; blocked: Unavailable; contact?: ContactId }[] {
  if (s.screen.kind !== 'wait') return [];
  const done = s.screen.shown >= s.screen.beats.length;
  if (!done) return [];
  // Every check can be waited out or asked about; only an important one lets you name someone.
  const out: { action: WaitAction; blocked: Unavailable; contact?: ContactId }[] = [
    { action: 'wait', blocked: null },
    { action: 'ask', blocked: null },
  ];
  if (!CHECKS[s.screen.check].important) return out;
  const contact = freeContact(s, undefined);
  return [...out, { action: 'assist', blocked: contact ? null : 'noContact', contact }];
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
    const c = freeContact(n, undefined);
    if (!c) return s;
    n = { ...n, exposed: [...n.exposed, c] };
    n = say(n, [{ key: 'wait.assist.reaction', vars: { contact: c } }]);
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
  let n: RunState = { ...s, reaction: null, decisions: s.decisions + 1 };
  if (opt.card) n = { ...n, used: [...n.used, opt.card] };
  if (opt.contact) n = { ...n, exposed: [...n.exposed, opt.contact] };
  if (opt.approach.kind === 'perk') n = { ...n, perkUsed: true };
  n = apply(n, opt.effects);
  const vars: Record<string, string> = {};
  if (opt.card) vars.card = opt.card;
  if (opt.contact) vars.contact = opt.contact;
  n = say(n, [{ key: `${prefix}.${card.id}.${approachId}.reaction`, vars }]);
  // The weakness hour is a real cost, so the reaction says what it is spent on.
  const topic = topicOf(card);
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
  }
}

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
  return options(s).filter((o) => !o.blocked).map((o) => ({ type: 'choose', approach: o.approach.id }));
}
