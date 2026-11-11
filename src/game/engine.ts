// The rules. Pure: newRun() builds a state, step() takes a state and an action
// and returns the next state. The UI only renders state and sends actions.

import type {
  Action, Approach, BulletinId, CarriedClaim, CarriedFile, CharacterId, CheckCase, Checkpoint, ClaimId, Cond, ContactId, Effect, Encounter,
  CheckId, EndingId, EvidenceId, FactId, FactMap, Inspection, LevelId, LogEntry, OnFileTier, QueueMood, ReactionKind, RunState, Screen, ScrutinyReason, Topic, WaitAction,
} from './types';
import { CHECKPOINTS, FACT_IDS } from './types';
import {
  BEAT_COUNT, CHARACTERS, EVIDENCE, FACT_TIERS, HARMLESS_FACTS, LAST_HOURS, MAX_SCRUTINY, OFFICERS, SCRUTINY_AFTER_INSPECTION, SPOT_CHECK_HOURS, BULLETIN_TOPICS, canConfirm, coversWarning, writesDown,
} from './content/world';
import { CHALLENGES, CHALLENGE_PAIRS, CHECKS, CLARIFIED_BY, CORE_CARDS, ENCOUNTERS, ENCOUNTER_BY_ID, INSPECTIONS, INSPECTION_BY_ID, catchKind } from './content/encounters';
import { DEFAULT_LEVEL, dealsCard, levelOf } from './content/levels';
import { has, own } from '../i18n';
import { nextRandom, randomDealer } from './rng';
import type { Dealer } from './rng';

export interface RunSetup {
  /** The level to play (LEVELS in src/game/content/levels.ts). Unset: Arrival. A destination (70r.1) sits beside it. */
  level?: LevelId;
  character: CharacterId;
  loadout: EvidenceId[];
  bulletin: BulletinId;
  seed: number;
  /**
   * The file from the crossing before, in a level that reads one (Level.readsFile):
   * the player's own, or a seeded default (defaultFile() in src/game/carry.ts) for a
   * standalone run. It must be this traveler's.
   */
  file?: CarriedFile;
}

/** A claim a later desk quotes: with its date, desk and card, or only the crossing in a file saved before `said` existed. */
export type FileQuote = CarriedClaim | Pick<CarriedClaim, 'claim' | 'crossing'>;

/**
 * The claims a carried file quotes: its `said` list, or, in a file saved before that
 * list existed, each of its `claims` with only the crossing it came from.
 */
export const fileSaid = (file: CarriedFile | undefined): FileQuote[] =>
  !file ? [] : file.said ?? file.claims.map((claim) => ({ claim, crossing: file.level }));

/** The claim a carried file is quoted on: why you came if it says, else the first thing it has you saying. */
export function fileClaim(file: CarriedFile | undefined): FileQuote | undefined {
  const said = fileSaid(file);
  return said.find((c) => c.claim === 'familyVisit' || c.claim === 'shortTrip') ?? said[0];
}

/** The contact a carried file names that a desk asks about: a relative before your mother. */
export const fileContact = (file: CarriedFile | undefined): ContactId | undefined =>
  file?.named.find((c) => c !== 'mother') ?? file?.named[0];

export function newRun(setup: RunSetup): RunState {
  const ch = CHARACTERS[setup.character];
  if (setup.loadout.length !== ch.evidenceSlots) throw new Error(`${ch.id} takes ${ch.evidenceSlots} evidence cards`);
  const level = levelOf(setup);
  if (level.readsFile && !setup.file) throw new Error(`${level.id} opens with a file from your last crossing`);
  // One traveler's file never opens another's crossing.
  if (setup.file && setup.file.character !== ch.id) throw new Error(`${setup.file.character}'s file cannot open ${ch.id}'s crossing`);
  const onFile = (ch.onFile ?? []).reduce<FactMap>((m, f) => teach(m, f, desksLearning(setup.bulletin, 'passport')), {});
  return {
    ...(level.readsFile && setup.file ? { file: setup.file } : {}),
    v: 2,
    level: setup.level ?? DEFAULT_LEVEL,
    seed: setup.seed,
    rng: setup.seed,
    character: ch.id,
    bulletin: setup.bulletin,
    loadout: [...setup.loadout],
    used: [],
    exposed: [],
    calledIn: [],
    time: level.startTime,
    travel: level.minTripTime,
    scrutiny: ch.startScrutiny,
    // Old records the passport desk has at once (Character.onFile).
    // Leaving, every desk has your entry record from the crossing in.
    facts: level.readsFile ? { ...onFile, entryRecord: [...CHECKPOINTS] } : onFile,
    claims: [],
    logged: {},
    saidAt: {},
    saidOn: {},
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

/**
 * The setup a run was started from: its level, traveler, packing, bulletin and seed.
 * "Play again with the same setup" starts newRun() from it, so the deal comes out the
 * same and only the player's answers differ.
 */
export const setupOf = (s: RunState): RunSetup => ({
  level: s.level ?? DEFAULT_LEVEL,
  character: s.character,
  loadout: [...s.loadout],
  bulletin: s.bulletin,
  seed: s.seed,
  ...(s.file ? { file: s.file } : {}),
});

// ── What each official knows

/** The desk the run is at: where a fact that comes out now is known. */
export const deskOf = (s: RunState): Checkpoint => CHECKPOINTS[Math.min(s.checkpoint, CHECKPOINTS.length - 1)];

/** Every fact that came out anywhere, in the order it came out. */
export const factIds = (s: RunState): FactId[] => Object.keys(s.facts) as FactId[];

/** Whether the official at `desk` (the current one by default) knows `f`. */
export const knows = (s: RunState, f: FactId, desk: Checkpoint = deskOf(s)): boolean => !!s.facts[f]?.includes(desk);

/**
 * How `f` sits on file: flagged once it was the reason scrutiny rose, else its
 * tier in FACT_TIERS (recorded before you arrived, or confirmed on this crossing).
 */
export const factTier = (s: Pick<RunState, 'flagged'>, f: FactId): OnFileTier =>
  s.flagged?.includes(f) ? 'flagged' : FACT_TIERS[f];

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
  const card = s.screen.kind === 'encounter' || s.screen.kind === 'inspection' ? s.screen.id : undefined;
  const n = s.claims.includes(c) ? s : {
    ...s, claims: [...s.claims, c], saidAt: { ...s.saidAt, [c]: desk }, ...(card ? { saidOn: { ...s.saidOn, [c]: card } } : {}),
  };
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
  if (cond.used && !cond.used.every((c) => s.used.includes(c))) return false;
  if (cond.flagged !== undefined && knownAt(s).some((f) => factTier(s, f) === 'flagged') !== cond.flagged) return false;
  if (cond.any && !cond.any.some((c) => check(c, s))) return false;
  if (cond.not && check(cond.not, s)) return false;
  if (cond.fileSaid) {
    const c = fileClaim(s.file);
    if (!c || !cond.fileSaid.includes(c.claim)) return false;
  }
  if (cond.fileNamed !== undefined && (fileContact(s.file) !== undefined) !== cond.fileNamed) return false;
  if (cond.fileDisproved !== undefined && !!s.file?.disproved?.length !== cond.fileDisproved) return false;
  if (cond.fileDeclared && !(s.file?.declared && cond.fileDeclared.includes(s.file.declared))) return false;
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

/** Every packed, unspent document that answers `topic`, in packing order. */
export function cardsFor(s: RunState, topic: Topic): EvidenceId[] {
  return s.loadout.filter((id) => {
    const c = EVIDENCE[id];
    return !s.used.includes(id) && c.topics.includes(topic) && !(c.blockedBy && check(c.blockedBy, s));
  });
}

/** The first of cardsFor(). */
export const cardFor = (s: RunState, topic: Topic): EvidenceId | undefined => cardsFor(s, topic)[0];

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
  /**
   * A "Show a document" row: the packed documents that answer, in packing order.
   * Choosing it opens their list (documentsOf()) and spends nothing yet.
   */
  documents?: EvidenceId[];
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
  const all = choices(s);
  // The list behind "Show a document": only the packed documents that answer, each with its own cost.
  if (s.documentList) return all.filter((o) => o.approach.id === s.documentList && o.card);
  const out: Option[] = [];
  for (const o of all) {
    const docs = o.card && o.approach.kind === 'evidence' ? all.filter((x) => x.approach.id === o.approach.id).map((x) => x.card!) : [];
    if (docs.length < 2) out.push(o);
    // Two or more packed documents answer: one "Show a document" row opens them (documentsOf()).
    else if (docs[0] === o.card) out.push({ approach: o.approach, blocked: null, documents: docs, effects: [] });
  }
  return out;
}

/** The answers behind a "Show a document" row, one per packed document, or [] for any other answer. */
export const documentsOf = (s: RunState, o: Option): Option[] =>
  o.documents ? options({ ...s, documentList: o.approach.id }) : [];

/**
 * Every answer the card has, with one per packed document that fits, before
 * options() puts two or more documents behind one "Show a document" row.
 */
export function choices(s: RunState): Option[] {
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
    if (a.kind === 'perk' && s.perkUsed) continue;
    // Every packed document that answers the question is its own answer, with its own cost.
    const cards: (EvidenceId | undefined)[] = a.kind === 'evidence' ? cardsFor(s, a.topic!) : [undefined];
    if (!cards.length) cards.push(undefined);
    for (const ev of cards) {
      let blocked: Unavailable = null;
      let contact: ContactId | undefined;
      if (a.kind === 'evidence' && !ev) blocked = 'noCard';
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
  }
  return out;
}

/**
 * The option a choose action picks. Naming a document picks that document's
 * answer (step() takes it straight from the card; legalActions() offers it only
 * from the open list). Without a document it is the answer on screen, so a
 * scripted pick of 'evidence' shows the one packed document, or opens the list
 * when two or more fit. With the list open, an answer that names no document
 * picks nothing, so a double tap on "Show a document" never spends one.
 */
export function optionFor(s: RunState, action: { approach: string; card?: EvidenceId }): Option | undefined {
  if (action.card) return choices(s).find((o) => o.approach.id === action.approach && o.card === action.card);
  return s.documentList ? undefined : options(s).find((o) => o.approach.id === action.approach);
}

/** The choose action for `o`, naming its document when it shows one. */
export const chooseAction = (o: Option): Action =>
  o.card && o.approach.kind === 'evidence' ? { type: 'choose', approach: o.approach.id, card: o.card } : { type: 'choose', approach: o.approach.id };

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
  list.push(...answerEffects(s, a, topic));
  const weak = topic && CHARACTERS[s.character].weakTopics.includes(topic);
  if (a.kind === 'verify' && weak && !usesVerified(s, a, topic)) list.push({ time: -1 });
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

/**
 * The facts in `effects` this officer reads something into (Officer.readings) that
 * come out here for the first time. Each goes on file as a fact; the reading is
 * a separate suspicion line, because confirming a fact never proves what the
 * officer infers from it. Only on a desk's own cards, like officerFlags().
 */
export function officerReadings(s: RunState, effects: Effect[]): FactId[] {
  if (s.screen.kind !== 'encounter') return [];
  const readings = OFFICERS[deskOf(s)].readings;
  return [...new Set(effects.flatMap((e) => ('fact' in e && readings.includes(e.fact) && !knows(s, e.fact) ? [e.fact] : [])))];
}

/**
 * Which of three the challenge card on screen is, and the claim it catches
 * (catchKind()). Undefined on any other card.
 */
export function challengeOf(s: RunState): { claim: ClaimId; fact: FactId; kind: ReactionKind } | undefined {
  if (s.screen.kind !== 'encounter') return undefined;
  const id = s.screen.id as (typeof CHALLENGES)[number];
  if (!CHALLENGES.includes(id)) return undefined;
  const c = caught(s, id);
  return c && { claim: c.claim, fact: c.fact, kind: catchKind(id, c.fact) };
}

/**
 * Which of three the reaction to this answer is, and on a disproof the claim it
 * catches and the record that does. A challenge card says it for every answer
 * (challengeOf()); anywhere else an answer that adds scrutiny says it itself
 * (Approach.reacts). Undefined for an answer nobody holds against you.
 */
export function reactionOf(s: RunState, opt: Option): { kind: ReactionKind; claim?: ClaimId; fact?: FactId } | undefined {
  const c = challengeOf(s);
  if (c) return c;
  const kind = opt.approach.reacts;
  const held = opt.effects.find((e): e is Extract<Effect, { scrutiny: number }> => 'scrutiny' in e && e.scrutiny > 0);
  if (!kind || !held) return undefined;
  if (kind !== 'disproof') return { kind };
  const said = opt.effects.find((e): e is Extract<Effect, { claim: ClaimId }> => 'claim' in e);
  const fact = (FACT_IDS as readonly string[]).includes(held.reason) ? (held.reason as FactId) : undefined;
  return { kind, ...(said ? { claim: said.claim } : {}), ...(fact ? { fact } : {}) };
}

/** The scrutiny the officer here adds for a flagged fact, with the fact as the reason. */
const officerScrutiny = (s: RunState) => (f: FactId): Effect => {
  const r = OFFICERS[deskOf(s)].reactions.find((x) => x.reveals.includes(f) && check(x.when, s));
  return { scrutiny: r?.scrutiny ?? 0, reason: f };
};

/** One part of the known-facts line: a text key and its vars. */
export interface KnownPart {
  key: string;
  vars?: Record<string, string>;
}

/**
 * What the officer at this desk already knows, as one line on every desk card,
 * built from the file: the newest fact this desk knows, named by how it sits on
 * file (factTier()), and the newest claim any desk wrote down. With neither,
 * the line says the file is empty so far. On an inspection the line names the
 * open issue it is about instead (Inspection.issue): the supervisor has read
 * the whole file, and this is the point on it still open.
 */
export function knownLine(s: RunState): KnownPart[] {
  if (s.screen.kind === 'inspection') {
    const issue = inspectionIssue(s);
    return issue ? [{ key: `insp.issue.${issue}` }] : [];
  }
  if (s.screen.kind !== 'encounter') return [];
  // A fact on file outranks a claim, because its tier is what the officer acts on.
  const fact = knownAt(s).at(-1);
  if (fact) return [{ key: `known.fact.${factTier(s, fact)}`, vars: { fact } }];
  const written = s.claims.filter((c) => loggedAt(s, c).length).at(-1);
  // The claim in this traveler's own wording, as the spot-check names it.
  if (written) return [{ key: 'known.claim', vars: { claim: own(`claim.${written}`, s.character).slice('claim.'.length) } }];
  return [{ key: 'known.none' }];
}

/** The open issue the inspection on screen is about (Inspection.issue), or undefined off one. */
export function inspectionIssue(s: RunState): Topic | undefined {
  return s.screen.kind === 'inspection' ? INSPECTION_BY_ID.get(s.screen.id)?.issue : undefined;
}

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
  // A point already verified has nothing left to check, so it takes no hour.
  if (a.kind === 'withdraw' || s.screen.kind === 'inspection' || (topic && pointVerified(s, topic))) return [];
  return (s.calledIn ?? []).filter((c) => canConfirm(c, topic));
}

/**
 * Whether `topic` was verified at a desk and still stands. A point stays
 * resolved until a new reason appears: any fact flagged since it was verified
 * (a reason scrutiny rose) gives the next officer something to point at, so
 * they check it again.
 */
export function pointVerified(s: Pick<RunState, 'verified' | 'flagged'>, topic: Topic): boolean {
  const v = s.verified?.[topic];
  return !!v && v.flags === (s.flagged ?? []).length;
}

/**
 * The points an answer resolves: the card's question when a document answers it
 * or a contact confirms it, and the points the document forwards (EvidenceCard.forwards).
 */
export function pointsResolved(card: EvidenceId | undefined, vouches: Topic | undefined, topic: Topic | undefined): Topic[] {
  const out = new Set<Topic>();
  if (card) {
    if (topic) out.add(topic);
    for (const t of EVIDENCE[card].forwards ?? []) out.add(t);
  }
  if (vouches) out.add(vouches);
  return [...out];
}

/**
 * Whether answer `a` uses a point verified earlier (Approach.ifVerified): on a
 * desk's own card about that point, it takes its verified effects and opens no
 * check. An inspection is the supervisor's, so it never does.
 */
export const usesVerified = (s: RunState, a: Approach, topic: Topic | undefined): boolean =>
  !!a.ifVerified && s.screen.kind === 'encounter' && !!topic && pointVerified(s, topic);

/** The answer's own effects, or its verified ones when it uses a verified point. */
const answerEffects = (s: RunState, a: Approach, topic: Topic | undefined): Effect[] =>
  usesVerified(s, a, topic) ? a.ifVerified! : a.effects;

/** Marks `points` verified at this desk, as of the facts flagged now. */
function verifyPoints(s: RunState, points: Topic[]): RunState {
  if (!points.length) return s;
  const verified = { ...s.verified };
  for (const t of points) verified[t] = { desk: deskOf(s), flags: (s.flagged ?? []).length };
  return { ...s, verified };
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

/** What explaining first applies in a check in stages (Check.explain), conditions and reasons resolved. */
export function explainEffects(s: RunState, checkId: CheckId): Effect[] {
  return activeEffects(s, (CHECKS[checkId].explain ?? []).filter((e) => check(e.when, s)), { check: checkId });
}

/** The facts a check result puts on file. A contact can explain them, never erase them. */
export function checkFindings(s: RunState, checkId: CheckId, result: CheckCase): Effect[] {
  return checkEffects(s, checkId, result).filter((e) => 'fact' in e);
}

// ── Applying things

/**
 * Applies effects whose `when` was already resolved against the state before the
 * action (resolvedEffects, checkEffects, explainEffects). It does not check `when`
 * again, because an earlier effect in the list could change the answer, and the
 * preview the player saw must be what happens.
 */
function apply(s: RunState, effects: Effect[]): RunState {
  let n = s;
  for (const e of effects) {
    if ('time' in e) n = { ...n, time: Math.max(0, n.time + e.time) };
    // Capped at the max, because anything at the max already means an inspection.
    else if ('scrutiny' in e) {
      // A fact that is the reason scrutiny rises reads as flagged from now on (factTier()).
      const reason = e.reason in FACT_TIERS ? (e.reason as FactId) : undefined;
      const flag = e.scrutiny > 0 && reason && !(n.flagged ?? []).includes(reason);
      n = {
        ...n, scrutiny: Math.min(MAX_SCRUTINY, Math.max(0, n.scrutiny + e.scrutiny)),
        ...(flag ? { flagged: [...(n.flagged ?? []), reason], flaggedAt: { ...n.flaggedAt, [reason]: deskOf(n) } } : {}),
      };
    }
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
export const travelOf = (s: Pick<RunState, 'travel' | 'level'>): number => s.travel ?? levelOf(s).minTripTime;

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
  // Leaving the exit desk without your passport (d_hold): free to go, for now.
  if (ending === 'turnedBack' && s.log.some((l) => /^enc\.d_hold\.(\w+\.)?leave\./.test(l.key))) return 'held';
  return ending === 'tooLate' && s.time === 0 ? 'missedBus' : ending;
}

function finish(s: RunState): RunState {
  return { ...s, screen: { kind: 'ending' }, ending: endingFor(s) };
}

// ── The director

function eligible(s: RunState, e: Encounter): boolean {
  return !s.seen.includes(e.id) && dealsCard(s, e.id) && check(e.when, s) && check(e.issue, s);
}

/** Whether the open issue a follow-up or related card is about is still on the file (Encounter.issue). */
export const issueOpen = (s: RunState, id: string): boolean => check(ENCOUNTER_BY_ID.get(id)?.issue, s);

/** This desk's two core cards in this level: its own (Level.core), else CORE_CARDS. */
export const coreCards = (s: RunState): readonly string[] => {
  const desk = deskOf(s) as keyof typeof CORE_CARDS;
  return levelOf(s).core?.[desk] ?? CORE_CARDS[desk];
};

/** The next of this desk's two core cards still to be asked, in coreCards() order. */
export function coreLeft(s: RunState): Encounter | undefined {
  const id = coreCards(s).find((c) => !s.seen.includes(c) && dealsCard(s, c));
  return id ? ENCOUNTER_BY_ID.get(id) : undefined;
}

/**
 * The slot a desk's follow-up is dealt in: after both core cards. A desk asks at
 * most one, so a run has 0-3 of them.
 */
export const FOLLOW_UP_SLOT = 2;

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

/**
 * Follow-ups a run deals at most (related and follow-up cards; the challenges come
 * on top). A check's own follow-up (its result queued it) may be one more, so a
 * run has 0-3 and what a check found is always asked about.
 */
export const MAX_FOLLOW_UPS = 2;

/** How many follow-ups this run has dealt so far. */
export function followUpsDealt(s: RunState): number {
  const challenges: readonly string[] = CHALLENGES;
  return s.seen.filter((id) => { const k = ENCOUNTER_BY_ID.get(id)?.kind; return (k === 'related' || k === 'followup') && !challenges.includes(id); }).length;
}

/** Checks a run can have run and still be dealt a follow-up that starts one. */
export const MAX_CHECKS_BEFORE_FOLLOW_UP = 2;

const followUpRoom = (s: RunState, checkFound = false): boolean => followUpsDealt(s) < MAX_FOLLOW_UPS + (checkFound && !s.inspections ? 1 : 0);

/** A queued card that a check's result asked for, not a challenge a spot-check put. */
const fromCheck = (id: string): boolean => !(CHALLENGES as readonly string[]).includes(id);

/** The best related card left at this desk whose open issue is on the file: the desk's follow-up. */
function relatedCard(s: RunState): Encounter | undefined {
  if (!followUpRoom(s)) return undefined;
  // After two checks (wait screens) a follow-up that could start a third is not
  // dealt, because three waits in one run push it past the play-time ceiling.
  const checked = (s.checkedAt ?? []).length >= MAX_CHECKS_BEFORE_FOLLOW_UP;
  const cp = CHECKPOINTS[s.checkpoint];
  const related = ENCOUNTERS.filter((e) => e.checkpoint === cp && e.kind === 'related' && eligible(s, e)
    && !(checked && e.approaches.some((a) => a.check)));
  return related.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
}

/** Whether advance() would deal an escalating card next: an inspection, a follow-up, a challenge or a related card. */
function escalatesNext(s: RunState): boolean {
  if (s.scrutiny >= MAX_SCRUTINY || s.pending.some((id) => !s.seen.includes(id) && followUpRoom(s, fromCheck(id)))) return true;
  if (coreLeft(s)) return false;
  if (s.slot <= FOLLOW_UP_SLOT && relatedCard(s)) return true;
  return !!pendingChallenge(s);
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
 * The card a breather deals: a calm one if any is left at this desk, else a
 * routine card left that is not a core card, else the next core card, so the
 * core cards keep their order. After an inspection the calm cards come in
 * reverse order, so the interruption differs between runs (the officer's
 * phone, not the water).
 */
function restCard(s: RunState): Encounter | undefined {
  const left = routinesLeft(s);
  const calm = left.filter((e) => e.calm);
  const core = coreCards(s);
  return (s.inspections ? calm[calm.length - 1] : calm[0]) ?? left.find((e) => !core.includes(e.id)) ?? coreLeft(s);
}

/** Hours a desk takes, at least, for the queue after it to read as a delay (QueueMood). */
export const DELAY_HOURS = 2;

/**
 * How the desk just finished went, for your mother's next message: an officer
 * phoned her (you named her to vouch for you, or the host call reached her; a
 * lift you arranged with her is not a call), it took
 * DELAY_HOURS or more, or neither. Only the message changes: nothing here
 * costs time or adds a choice.
 */
export function queueMood(s: RunState): QueueMood {
  const start = s.deskStart;
  if (!start) return 'smooth';
  const answered = s.log.slice(start.log).some((l) => l.key === 'check.hostCall.clear');
  if (start.phoned || answered) return 'call';
  return start.time - s.time >= DELAY_HOURS ? 'delay' : 'smooth';
}

/** Marks that an officer phoned your mother at this desk (queueMood). */
const phoned = (s: RunState): RunState => (s.deskStart ? { ...s, deskStart: { ...s.deskStart, phoned: true } } : s);

/** Deal the next card: a pending follow-up, an inspection, the next slot, or the end. */
function advance(s: RunState, dealer: Dealer): RunState {
  if (s.withdrew) return finish(s);
  const rest = breather(s);
  if (rest) return show(s, rest.id);
  if (s.scrutiny >= MAX_SCRUTINY) return inspect(s, dealer);
  while (s.pending.length) {
    const [id, ...rest] = s.pending;
    s = { ...s, pending: rest };
    // A follow-up whose issue has closed since it was queued is dropped.
    if (!s.seen.includes(id) && issueOpen(s, id) && followUpRoom(s, fromCheck(id))) return show(s, id);
  }
  if (!coreLeft(s) && (s.slot > FOLLOW_UP_SLOT || !relatedCard(s))) {
    if (!(s.spotChecked ?? []).includes(deskOf(s))) return advance(spotCheck(s, dealer), dealer);
    const challenge = pendingChallenge(s);
    if (challenge) return show(s, challenge);
    const next = s.checkpoint + 1;
    if (next >= CHECKPOINTS.length) return admission(s, dealer);
    return { ...s, checkpoint: next, slot: 0, screen: { kind: 'between', next }, after: { ...s.after, [next]: queueMood(s) } };
  }
  return deal(s);
}

/**
 * Before admission a supervisor reads the file once, on a run with no
 * inspection yet that can still make the bus (a doomed run is waved through,
 * because one more card changes nothing). She sends you to secondary
 * inspection whenever scrutiny is above 0, the scrutiny a character starts
 * with included: Mark's second passport is on file before he says a word,
 * and only while an issue on the file is still open (inspectionsFitting()).
 * A paper on the topic the bulletin warned about, shown on the way, settles
 * her once the point it covers was verified there too: since every packed
 * document is offered (4qd.8), a paper shown for its other question (the deed
 * for where you stay, on a records day) no longer settles her. Nothing here is drawn: the same file always gets the same decision,
 * and inspect() picks the inspection the same way.
 *
 * This is what puts an inspection in a quarter to a third of runs (`npm run
 * autoplay`). Once spot-checks caught lies at the desks, counting only the
 * scrutiny gained on the way left the share under a quarter, so the start
 * value counts too (2op.9). Until 4qd.11 a warned-about paper settled her two
 * times in three, by a draw. Now the file decides: the paper always settles
 * her, and an inspection needs an open issue, so a run whose papers verified
 * its points is not inspected. The pacing rule still holds: after 2
 * escalating cards a routine card left comes first, and the supervisor reads
 * the file again after it.
 */
function admission(s: RunState, dealer: Dealer): RunState {
  if (s.inspections || s.scrutiny <= 0 || doomed(s) || !inspectionsFitting(s).length) return finish(s);
  const rest = (s.streak ?? 0) >= 2 ? restCard(s) : undefined;
  if (rest) return show(s, rest.id);
  if (coversWarning(s.used, s.bulletin) && s.verified?.[BULLETIN_TOPICS[s.bulletin]]) return finish(s);
  return inspect(s, dealer);
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
 * "It's just a short trip" is the wrong answer to a hotel booking. Else the
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
  // An answer that uses a point verified earlier says so (Approach.ifVerified).
  const a = currentCard(s)?.approaches.find((x) => x.id === approach);
  const verified = `${prefix}.${id}.${approach}.verified.${part}`;
  if (a && usesVerified(s, a, topicOf(currentCard(s))) && has(verified)) return verified;
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

/**
 * Deal this desk's next card: its core cards in order, then the follow-up on
 * an open issue (relatedCard()), if there is one. Nothing here is random, so
 * every run asks each desk's core questions in the same order.
 */
function deal(s: RunState): RunState {
  const core = coreLeft(s);
  if (core) return show({ ...s, slot: s.slot + 1 }, core.id);
  const follow = relatedCard(s);
  if (!follow) throw new Error(`no card left for ${deskOf(s)} slot ${s.slot}`);
  return show({ ...s, slot: FOLLOW_UP_SLOT + 1 }, follow.id);
}

/**
 * The inspections that can be dealt now: the open issue each is about is still
 * open (no desk verified that point), their condition holds, and a confiscation
 * needs the medicine.
 */
const inspectionsFitting = (s: RunState): Inspection[] =>
  INSPECTIONS.filter((i) => !pointVerified(s, i.issue) && dealsCard(s, i.id) && check(i.when, s) && (i.kind !== 'confiscation' || s.medicine));

/**
 * Deal an inspection, decided by the file alone: one not asked yet before one
 * asked again, then the one on the point the bulletin warned about, then the
 * first in INSPECTIONS order. Nothing here is random, so the same file always
 * gets the same inspection.
 */
function inspect(s: RunState, dealer: Dealer): RunState {
  const fits = inspectionsFitting(s);
  const fresh = fits.filter((i) => !s.seen.includes(i.id));
  const pool = fresh.length ? fresh : fits;
  // Nothing left to ask for: no open issue an inspection could take up. The
  // supervisor reads the file and sends you back, and scrutiny drops as after an inspection.
  if (!pool.length) return advance(say({ ...s, scrutiny: SCRUTINY_AFTER_INSPECTION }, [{ key: 'insp.none' }]), dealer);
  const warned = BULLETIN_TOPICS[s.bulletin];
  const id = (pool.find((i) => i.issue === warned) ?? pool[0]).id;
  return {
    ...s,
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
  return {
    ...s, rng, checkedAt: [...(s.checkedAt ?? []), deskOf(s)],
    screen: { kind: 'wait', check: checkId, beats, shown: 0, resolved, asked: false },
  };
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
    ...(CHECKS[s.screen.check].explain ? [{ action: 'explain' as const, blocked: null }] : []),
    ...(s.screen.asked ? [] : [{ action: 'ask' as const, blocked: null }]),
  ];
  const contact = assistContact(s);
  // vouches: the check's topic, so the option can say what the contact may confirm.
  const vouches = CHECKS[s.screen.check].topic;
  return contact && vouches ? [...out, { action: 'assist', blocked: null, contact, vouches }] : out;
}

/** The text key of a waiting-room answer: a check in stages words its own (Check.explain). */
export const waitKey = (check: CheckId, action: WaitAction, part: 'label' | 'detail' | 'reaction'): string =>
  CHECKS[check].explain ? `check.${check}.${action}.${part}` : `wait.${action}.${part}`;

/** What you notice once the beats are done in a check in stages, before its result. */
export function observation(s: RunState): string | undefined {
  if (s.screen.kind !== 'wait' || !CHECKS[s.screen.check].explain || s.screen.shown < s.screen.beats.length) return undefined;
  return `check.${s.screen.check}.observe.${s.screen.resolved.result}`;
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
    if (c === 'mother') n = phoned(n);
    n = say(n, [{ key: 'wait.assist.reaction', vars: { contact: c } }]);
    // The finding stays on file; the contact only settles what it means, so
    // the check clears with no follow-up and no scrutiny from it.
    n = apply(n, checkFindings(n, w.check, result));
    // What the contact confirmed stays verified for the desks after this one.
    const vouched = CHECKS[w.check].topic;
    if (vouched) n = verifyPoints(n, [vouched]);
    result = { result: 'clear' };
  }
  // Explaining first: you say it before he asks, so the follow-up is already answered.
  if (how === 'explain' && CHECKS[w.check].explain) {
    n = say(apply(n, explainEffects(n, w.check)), [{ key: waitKey(w.check, how, 'reaction') }]);
    result = { ...result, followUp: undefined };
  }
  n = apply(n, checkEffects(n, w.check, result));
  const line = `check.${w.check}.${result.result}`;
  n = say(n, [{ key: how === 'explain' && has(`${line}.explained`) ? `${line}.explained` : line }]);
  if (result.followUp && !n.seen.includes(result.followUp)) n = { ...n, pending: [result.followUp, ...n.pending] };
  return advance({ ...n, decisions: n.decisions + (how === 'wait' ? 0 : 1) }, dealer);
}

// ── Choosing

function choose(s: RunState, approachId: string, dealer: Dealer, cardId?: EvidenceId): RunState {
  const card = currentCard(s);
  const opt = optionFor(s, { approach: approachId, card: cardId });
  if (!card || !opt || opt.blocked) return s;
  // "Show a document" only opens the list: nothing is said, spent or decided yet.
  if (opt.documents) return { ...s, documentList: opt.approach.id };
  const topic = topicOf(card);
  // The statements this card checks are settled now, whatever the answer.
  const due = callInsDue(s, opt.approach, topic);
  const reacted = reactionOf(s, opt);
  const readings = officerReadings(s, opt.effects);
  const decided = s.screen.kind === 'encounter' && isCalm(s.screen.id) ? 0 : 1;
  let n: RunState = { ...s, documentList: undefined, reaction: null, decisions: s.decisions + decided, calledIn: (s.calledIn ?? []).filter((c) => !due.includes(c)) };
  if (opt.card) n = { ...n, used: [...n.used, opt.card] };
  if (opt.contact) n = { ...n, exposed: [...n.exposed, opt.contact], calledIn: callIn(n, opt.contact) };
  // Named to vouch for you, your mother gets the officer's call; named only for a lift, she doesn't.
  if (opt.contact === 'mother' && !opt.approach.namesOnly) n = phoned(n);
  if (opt.approach.kind === 'perk') n = { ...n, perkUsed: true };
  n = apply(n, opt.effects);
  // A document shown or a contact who confirmed the point at a desk settles it for the later
  // desks. At an inspection the point settled is the open issue it is about (Inspection.issue),
  // and a check there that confirms it (the lab handing the medicine back) settles it too.
  // On the day the bulletin orders that point checked (every host phoned), a name given at a
  // desk is not yet a confirmation: the check is what confirms it, so it settles nothing here.
  const vouched = opt.contact && opt.vouches !== BULLETIN_TOPICS[s.bulletin] ? opt.vouches : undefined;
  if (s.screen.kind === 'encounter') {
    const points = pointsResolved(opt.card, vouched, topic);
    // A record check that confirmed the point (Approach.confirms) settles it like a document.
    if (opt.approach.confirms && topic && !points.includes(topic)) points.push(topic);
    n = verifyPoints(n, points);
  } else if (opt.card || vouched || opt.approach.confirms) {
    const issue = inspectionIssue(s);
    if (issue) n = verifyPoints(n, [issue]);
  }
  const vars: Record<string, string> = {};
  if (opt.card) vars.card = opt.card;
  if (opt.contact) vars.contact = opt.contact;
  // A reaction against you says which of three it is, and only a disproof records the claim as disproved.
  n = say(n, [{ key: answerKey(s, approachId, 'reaction'), vars, ...(reacted ? { kind: reacted.kind } : {}) }]);
  if (reacted?.kind === 'disproof' && reacted.claim && !(n.disproved ?? []).includes(reacted.claim))
    n = { ...n, disproved: [...(n.disproved ?? []), reacted.claim] };
  // The officer's priority is the reason for the scrutiny, so the reaction says it.
  for (const f of opt.flagged ?? []) n = say(n, [{ key: `officer.${deskOf(s)}.flags`, vars: { fact: f }, kind: 'suspicion' }]);
  // What the officer reads into a confirmed fact is their suspicion, a line of its own.
  for (const f of readings) n = say(n, [{ key: `reading.${f}.${deskOf(s)}`, kind: 'suspicion' }]);
  // The call-in hour is a real cost too, so the reaction names whose statement it checks.
  for (const c of due) n = say(n, [{ key: 'calledIn.reaction', vars: { contact: c } }]);
  // The weakness hour is a real cost, so the reaction says what it is spent on.
  if (opt.approach.kind === 'verify' && topic && CHARACTERS[s.character].weakTopics.includes(topic) && !usesVerified(s, opt.approach, topic)) {
    n = say(n, [{ key: `weak.${topic}.reaction` }]);
  }
  if (opt.approach.kind === 'withdraw') return finish({ ...n, withdrew: true });
  if (s.screen.kind === 'inspection') n = { ...n, scrutiny: SCRUTINY_AFTER_INSPECTION };
  if (opt.approach.check && !usesVerified(s, opt.approach, topic)) return startWait(n, opt.approach.check);
  return advance(n, dealer);
}

/**
 * The only way a run moves. `dealer` picks routine cards and inspections; the
 * game uses the seeded one, tests pass a scripted one to try every pick.
 */
export function step(s: RunState, action: Action, dealer: Dealer = randomDealer): RunState {
  switch (action.type) {
    case 'choose':
      return choose(s, action.approach, dealer, action.card);
    case 'back':
      // Back from the document list to the card's answers.
      return s.documentList ? { ...s, documentList: undefined } : s;
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
      if (s.screen.kind === 'between') return deal({ ...s, deskStart: { time: s.time, log: s.log.length } });
      return s;
    case 'turnBack':
      if (!canTurnBack(s)) return s;
      // You step out of the passport queue before any desk has asked you anything.
      return say(finish({ ...s, withdrew: true, decisions: s.decisions + 1 }), [{ key: 'turnBack.reaction' }]);
    case 'finish':
      if (!canFinish(s)) return s;
      // Nothing more is asked or spent: the remaining desks wave you through, too late for the bus.
      return say(finish({ ...s, documentList: undefined, reaction: null, pending: [] }), [{ key: 'finish.reaction' }]);
  }
}

/**
 * The one early point where you can still turn back: the queue before the
 * passport desk, before that desk has asked or decided anything. After it, no
 * desk card offers a way out, and an inspection offers "Ask to return" only
 * where its situation allows (the withdraw answers in INSPECTIONS).
 */
export const TURN_BACK_QUEUE = 0;

/** Whether turning back is open now: in the passport queue, with nothing else to read first. */
export const canTurnBack = (s: RunState): boolean =>
  !s.ending && !s.reaction && s.screen.kind === 'between' && s.screen.next === TURN_BACK_QUEUE;

/** The finish-quickly option shows on a card once the bus is out of reach. */
export const canFinish = (s: RunState): boolean =>
  doomed(s) && !s.reaction && (s.screen.kind === 'encounter' || s.screen.kind === 'inspection');

/** Everything the player can do right now, for tests and the autoplay bot. */
export function legalActions(s: RunState): Action[] {
  if (s.ending) return [];
  if (s.reaction) return [{ type: 'ack' }];
  const sc: Screen = s.screen;
  if (sc.kind === 'between') return canTurnBack(s) ? [{ type: 'ack' }, { type: 'turnBack' }] : [{ type: 'ack' }];
  if (sc.kind === 'wait') {
    if (sc.shown < sc.beats.length) return [{ type: 'beat' }];
    return waitActions(s).filter((w) => !w.blocked).map((w) => ({ type: 'waitAction', action: w.action }));
  }
  const answers: Action[] = options(s).filter((o) => !o.blocked).map(chooseAction);
  return canFinish(s) ? [...answers, { type: 'finish' }] : answers;
}
