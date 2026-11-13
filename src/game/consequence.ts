// The one line under each answer: what you give up now or put at risk, in plain
// words, with one icon. The full record (claims, facts on file) stays in My story.
// src/ui/parts.tsx renders it and src/game/transcript.ts writes it down, so both
// read the same parts.

import { andList, has, own, t, tn } from '../i18n';
import type { FileQuote, Option } from './engine';
import type { GameEvent } from './play';
import { caught, endingFor, factIds, factTier, fileClaim, fileContact, fileSaid, knows, travelOf } from './engine';
import type { Answered, CarriedFile, ChangeLine, CharacterId, Checkpoint, ClaimId, ContactId, EndingLine, EvidenceId, FactId, LaterBeat, RunState, Severity } from './types';
import { CHECKPOINTS } from './types';
import { CHARACTERS, CONTACTS, EVIDENCE, EVIDENCE_IDS, MAX_SCRUTINY, writesDown } from './content/world';

export type PartKind = 'medicine' | 'miss' | 'travel' | 'contact' | 'vouch' | 'withdraw' | 'scrutiny' | 'check' | 'time' | 'card' | 'fact' | 'claim' | 'perk' | 'free' | 'blocked';
/** amber: attention or escalation. red: a confirmed serious consequence. */
export type Tone = 'plain' | 'amber' | 'red';
export type IconKind = 'document' | 'clock' | 'check' | 'shield' | 'flag';

export interface Part {
  kind: PartKind;
  key: string;
  vars?: Record<string, string | number>;
  /** Plural count: render with tn(key, n). */
  n?: number;
  tone: Tone;
}

export interface Consequence {
  icon: IconKind;
  parts: Part[];
}

export const MAX_PARTS = 3;
export const SEPARATOR = ' · ';

/** Most serious first. Picks the icon and decides what goes when there are more than 3 parts. */
const SEVERITY: PartKind[] = ['medicine', 'miss', 'travel', 'contact', 'vouch', 'withdraw', 'scrutiny', 'check', 'time', 'card', 'fact', 'claim', 'perk', 'free', 'blocked'];
/**
 * The guaranteed costs, never dropped from the line: hours, the bus, the medicine,
 * scrutiny, a person named and a document spent, even when no time is spent (dap.13).
 */
const KEEP: PartKind[] = ['medicine', 'miss', 'travel', 'contact', 'scrutiny', 'time', 'card'];
/**
 * Reading order on the line: the cost most likely to change the decision first (the
 * bus, time, the medicine, scrutiny, a check), then what goes on file and what it may
 * gain: "Full search: 3 hours · Cash total recorded".
 */
const ORDER: PartKind[] = ['miss', 'time', 'travel', 'medicine', 'scrutiny', 'check', 'card', 'contact', 'vouch', 'fact', 'claim', 'withdraw', 'perk', 'free', 'blocked'];

const ICON: Record<PartKind, IconKind> = {
  medicine: 'shield',
  miss: 'clock',
  travel: 'clock',
  contact: 'document',
  vouch: 'check',
  withdraw: 'flag',
  scrutiny: 'shield',
  check: 'shield',
  time: 'clock',
  card: 'document',
  fact: 'document',
  claim: 'check',
  perk: 'check',
  free: 'check',
  blocked: 'document',
};

/**
 * The key of what an answer's hours are spent on, shown in place of a bare "Costs 1 hour":
 * the answer's own `<cardKey>.event` ("Lab test"). An answer whose hours only come from
 * checking someone you called in earlier (callInsDue() in src/game/engine.ts) reads
 * `ui.event.calledIn`. The hours themselves are the engine's, so the text never counts them.
 */
export function eventKey(o: Option, cardKey: string): string {
  const own = `${cardKey}.event`;
  return has(own) && o.approach.effects.some((e) => 'time' in e) ? own : 'ui.event.calledIn';
}

/**
 * The run's clock as consequence() needs it: hours left and the trip they must cover.
 * With the file (`facts`), a fact this desk already has is not named again, because
 * the line names only what this answer adds.
 */
export type Clock = Pick<RunState, 'time' | 'travel'> & Partial<Pick<RunState, 'facts'>>;

/**
 * The parts for one answer. `cardKey` is the answer's key without `.label`
 * (`enc.p_purpose.family`): a `<cardKey>.event` text names what its hours are spent on
 * ("Register check: 1 hour", eventKey()), a `<cardKey>.check` text, when there is one, names
 * the check, and a `<cardKey>.contact` text replaces "Puts {contact} on file".
 * With the run's `clock`, the line says what the answer does to the last bus: a later
 * connection reads as the hours it will then need, and an answer that leaves fewer
 * hours than the trip takes reads "You will miss the last bus" in place of its cost.
 */
export function consequence(o: Option, cardKey: string, protectedContact: ContactId, desk?: Checkpoint, clock?: Clock): Consequence {
  const a = o.approach;
  if (o.blocked) return { icon: 'document', parts: [{ kind: 'blocked', key: `ui.blocked.${o.blocked}`, tone: 'plain' }] };
  // "Show a document" costs nothing yet: each document in its list has its own line.
  if (o.documents) return { icon: 'document', parts: [{ kind: 'card', key: 'ui.line.documents', n: o.documents.length, tone: 'plain' }] };

  const all: Part[] = [];
  if (o.card) all.push({ kind: 'card', key: 'ui.line.uses', vars: { cardShort: o.card }, tone: 'plain' });
  // What naming them shares ("Shares her number"), or a `<cardKey>.contact` text in the
  // answer's words ("His name goes on file"). Red for the protected contact, plain for
  // anyone else, so no answer outweighs the others.
  const contactKey = `${cardKey}.contact`;
  if (o.contact)
    all.push({ kind: 'contact', key: has(contactKey) ? contactKey : `contact.${o.contact}.shares`, vars: { contact: o.contact }, tone: o.contact === protectedContact ? 'red' : 'plain' });
  // After the guaranteed cost, the possible gain, from the contact's abilities ("May verify
  // your address"), or a `<cardKey>.vouch` text that says why it helps on this card.
  const vouchKey = `${cardKey}.vouch`;
  if (o.contact && o.vouches) all.push({ kind: 'vouch', key: has(vouchKey) ? vouchKey : `contact.${o.contact}.can.${o.vouches}`, tone: 'plain' });
  // Time and scrutiny are summed, so a weakness reads "Company lookup: 2 hours", not two parts.
  let time = 0;
  let scrutiny = 0;
  let travel = 0;
  const claims: ClaimId[] = [];
  for (const e of o.effects) {
    if ('time' in e) time += e.time;
    else if ('scrutiny' in e) scrutiny += e.scrutiny;
    else if ('travel' in e) travel += Math.max(0, e.travel);
    else if ('loseMedicine' in e) all.push({ kind: 'medicine', key: 'ui.line.medicine', tone: 'red' });
    else if ('fact' in e) {
      // A fact this desk already has adds nothing, so "Reveals her address" goes once it is on file here.
      if (!(desk && clock?.facts?.[e.fact]?.includes(desk))) all.push({ kind: 'fact', key: `fact.${e.fact}.reveal`, tone: 'plain' });
    }
    else if ('claim' in e) claims.push(e.claim);
  }
  const checkKey = `${cardKey}.check`;
  // An answer that uses a point verified earlier opens no check (usesVerified()), so it does not say it starts one.
  if (!o.usesVerified && (a.check || has(checkKey))) all.push({ kind: 'check', key: has(checkKey) ? checkKey : 'ui.line.check', tone: 'amber' });
  // Against the last bus, the way the engine applies it (apply() and doomed() in
  // src/game/engine.ts): time floors at 0 and the trip only grows. Only an answer that
  // costs time or adds travel says it misses the bus, so on a run already short of the
  // trip a free answer still reads as free.
  const need = clock ? travelOf(clock) + travel : 0;
  const misses = !!clock && a.kind !== 'withdraw' && (time < 0 || travel > 0) && Math.max(0, clock.time + time) < need;
  if (misses) all.push({ kind: 'miss', key: 'ui.line.miss', tone: 'red' });
  else {
    if (time) all.push({ kind: 'time', key: 'ui.line.event', n: Math.abs(time), vars: { event: eventKey(o, cardKey) }, tone: 'plain' });
    // A later connection: the trip to the bus grows, so the run needs more hours left.
    if (travel) all.push(clock
      ? { kind: 'travel', key: 'ui.line.need', n: need, tone: 'amber' }
      : { kind: 'travel', key: 'ui.line.travel', n: travel, tone: 'amber' });
  }
  if (scrutiny) all.push({ kind: 'scrutiny', key: 'ui.line.scrutiny', vars: { n: scrutiny }, tone: 'amber' });
  if (a.kind === 'withdraw') all.push({ kind: 'withdraw', key: 'ui.line.withdraw', tone: 'plain' });
  // A claim only shows when nothing else does: "Recorded as your reason for visiting",
  // or, where this officer does not write it down (writesDown), that it is only said.
  if (!all.length && claims.length)
    all.push({ kind: 'claim', key: !desk || writesDown(desk, claims[0]) ? `claim.${claims[0]}.recorded` : 'claim.said', tone: 'plain' });
  if (a.kind === 'perk') all.push({ kind: 'perk', key: 'ui.line.perk', tone: 'plain' });
  if (!all.length) all.push({ kind: 'free', key: 'ui.line.free', tone: 'plain' });

  const rank = (p: Part) => (KEEP.includes(p.kind) ? -1 : 0) * 100 + SEVERITY.indexOf(p.kind);
  // Every guaranteed cost stays, and the rest fill the line up to MAX_PARTS.
  const sorted = [...all].sort((x, y) => rank(x) - rank(y));
  const guaranteed = sorted.filter((p) => KEEP.includes(p.kind));
  const kept = [...guaranteed, ...sorted.filter((p) => !KEEP.includes(p.kind)).slice(0, Math.max(0, MAX_PARTS - guaranteed.length))];
  const icon = ICON[[...kept].sort((x, y) => SEVERITY.indexOf(x.kind) - SEVERITY.indexOf(y.kind))[0].kind];
  return { icon, parts: kept.sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind)) };
}

/**
 * The lines under a document on the packing screen, as keys joined by SEPARATOR:
 * every topic it answers ("Medicine · Visit purpose"), then, when it puts facts on
 * file, a second line "Reveals <x>" for each. Two lines, so a document that answers
 * two topics still fits each on one line at 390px. The keys, so DocumentsStep in
 * src/App.tsx and setupLines() in src/game/transcript.ts show the same words.
 */
export function packDetail(id: EvidenceId): string[][] {
  const facts = EVIDENCE[id].onUse.flatMap((e) => ('fact' in e ? [e.fact] : []));
  const topics = EVIDENCE[id].topics.map((topic) => `topic.${topic}.helps`);
  return facts.length ? [topics, facts.map((f) => `fact.${f}.reveal`)] : [topics];
}

/**
 * The begin screen's "Mother's letter, hospital note, apartment deed": the packed
 * documents' short labels in packing order, one list, so later items start lower
 * case (every label is a common noun). BeginStep in src/App.tsx and setupLines()
 * in src/game/transcript.ts both use it.
 */
export function packedList(loadout: readonly EvidenceId[]): string {
  return EVIDENCE_IDS.filter((id) => loadout.includes(id))
    .map((id, i) => {
      const label = t(`ev.${id}.label`);
      return i ? label.charAt(0).toLowerCase() + label.slice(1) : label;
    })
    .join(', ');
}

/** Event types that always get a line under the reaction. A test checks each has its key in en.ts. */
export const CHANGE_EVENTS = ['documentUsed', 'contactExposed', 'claimChallenged', 'factRecorded', 'factSent', 'timeSpent', 'scrutinyChanged', 'medicineLost', 'travelChanged', 'pointSettled'] as const;

/**
 * What a step changed, one plain line each, built from its events: "Address verified.",
 * "Customs has your mother's number.", "1 hour lost.", "Scrutiny 2/3.", then what it
 * resolves for later ("The prescription is settled...", marked `resolves`). Reaction in
 * src/App.tsx shows them under the officer's line (what happened), and screenLines() in
 * src/game/transcript.ts writes them down.
 */
export function changeLines(events: GameEvent[], protectedContact: ContactId): ChangeLine[] {
  const out: ChangeLine[] = [];
  // A point a contact confirmed and that is now settled says so once, on its resolves line.
  const settled = new Set(events.flatMap((e) => (e.type === 'pointSettled' ? [e.topic] : [])));
  // A contact's result says only what happened: "Address verified." when the vouch
  // settled the question, then what went on file and where.
  for (const e of events)
    if (e.type === 'contactExposed') {
      if (e.vouch?.passed && !settled.has(e.vouch.topic)) out.push({ key: `change.verified.${e.vouch.topic}`, tone: 'plain' });
      out.push({ key: `change.contact.${e.shares}`, vars: { contact: e.id, desk: e.desk }, tone: e.id === protectedContact ? 'red' : 'amber' });
    }
  // A challenge says which of three it is: a question raised, two accounts that
  // differ, or a claim a record shows false (catchKind() in src/game/content/encounters.ts).
  for (const e of events)
    if (e.type === 'claimChallenged') out.push({ key: `change.claim.${e.kind}`, vars: { claim: e.said }, tone: e.kind === 'disproof' ? 'red' : 'amber' });
  // Each fact names how it sits on file: found in the old records, confirmed on this
  // crossing, or flagged (factTier() in src/game/engine.ts).
  // A fact passed to the next desk in the same step says so on the same line
  // ("On record, passed to Customs: ..."), so the fact is named once.
  const passed = new Map<FactId, Checkpoint>();
  for (const e of events) if (e.type === 'factSent' && e.via === 'desk' && !passed.has(e.id)) passed.set(e.id, e.desks[0]);
  // Facts that sit on file the same way share one line: "Noted: Your phone was searched. Your brother abroad."
  const named = new Set<FactId>();
  for (const e of events)
    if (e.type === 'factRecorded') {
      const desk = named.has(e.id) ? undefined : passed.get(e.id);
      named.add(e.id);
      const last = out[out.length - 1];
      if (!desk && last?.key === `change.onFile.${e.tier}`) out[out.length - 1] = { ...last, also: [...(last.also ?? []), { key: 'change.alsoFact', vars: { fact: e.id } }] };
      else out.push(desk
        ? { key: `change.onFile.${e.tier}.sent`, vars: { fact: e.id, desk }, tone: 'plain' }
        : { key: `change.onFile.${e.tier}`, vars: { fact: e.id }, tone: 'plain' });
    }
  // A fact the lines above already name is not named again on its way on: the next
  // desk's card shows it on its known-facts line (knownLine()).
  for (const e of events)
    if (e.type === 'factSent' && !named.has(e.id))
      out.push(e.via === 'records'
        ? { key: 'change.records', vars: { fact: e.id }, tone: 'plain' }
        : { key: 'change.sent', vars: { fact: e.id, desk: e.desks[0] }, tone: 'plain' });
  for (const e of events) if (e.type === 'timeSpent') out.push({ key: 'change.time', n: e.hours, tone: 'plain' });
  for (const e of events)
    if (e.type === 'scrutinyChanged') out.push({ key: 'change.scrutiny', vars: { n: e.to, max: MAX_SCRUTINY }, tone: e.to > e.from ? 'amber' : 'plain' });
  if (events.some((e) => e.type === 'medicineLost')) out.push({ key: 'change.medicine', tone: 'red' });
  for (const e of events) if (e.type === 'travelChanged') out.push({ key: 'change.travel', n: e.hours, tone: 'amber' });
  // Last, what the answer resolves: each question now settled for the officers ahead
  // ("Prescription settled."). Reaction shows these under the changes, apart from them.
  // A document shown is spent, and its card greys out. When nothing else changed, that is
  // the changed line ("Used: Return ticket."). Next to other changes, the first point it
  // settles names it ("Hospital note used, prescription settled."), folded in, not a line
  // of its own, so a long run stays inside the 8-minute ceiling (tools/sweep.ts).
  let doc = events.find((e) => e.type === 'documentUsed')?.id;
  if (doc && !out.length) {
    out.push({ key: 'change.document', vars: { cardLabel: doc }, tone: 'plain' });
    doc = undefined;
  }
  const also: NonNullable<ChangeLine['also']> = [];
  const resolves: ChangeLine[] = [];
  for (const e of events) {
    if (e.type !== 'pointSettled') continue;
    const line = doc ? { key: `resolve.used.${e.topic}`, vars: { cardLabel: doc } } : { key: `resolve.${e.topic}` };
    doc = undefined;
    // A point settled again, after a new flag reopened it, goes on the end of a line
    // already showing, unless a contact's vouch settled it: that swaps the vouch's
    // "Address verified." for this line (settled, above).
    const vouched = events.some((v) => v.type === 'contactExposed' && v.vouch?.passed && v.vouch.topic === e.topic);
    if (e.again && !vouched && out.length) also.push(line);
    else resolves.push({ ...line, tone: 'plain', resolves: true });
  }
  // A document that settled nothing new says "Used: Hotel booking." on the end of the last line.
  if (doc) also.push({ key: 'change.document', vars: { cardLabel: doc } });
  if (also.length) {
    const last = out[out.length - 1];
    out[out.length - 1] = { ...last, also: [...(last.also ?? []), ...also] };
  }
  return [...out, ...resolves];
}

/** A change line as it reads: its own text, then anything folded onto its end (ChangeLine.also). */
export function changeText(c: ChangeLine): string {
  const text = c.n === undefined ? t(c.key, c.vars) : tn(c.key, c.n, c.vars);
  return [text, ...(c.also ?? []).map((a) => t(a.key, a.vars))].join(' ');
}

/**
 * The button under a reaction: Continue within a checkpoint, then the walk to the
 * next one, or the ending. The key, so Reaction and the transcript say the same.
 */
export function nextActionKey(s: RunState): string {
  if (s.ending) return 'ui.proceed.ending';
  if (s.screen.kind === 'between') return `ui.proceed.${CHECKPOINTS[s.screen.next]}`;
  return 'ui.continue';
}

/**
 * What the run cost, for any ending, worst first: each person exposed and how badly,
 * and the medicine left behind. Each is reported on its own, so "Too late" still says
 * you exposed your mother. Severity comes from the state and only orders the list (no
 * tag on screen, because research warns against scoring family harm): the protected
 * contact and the medicine are severe (the contact also rules out homeInTime), anyone
 * else is serious once their home is on file and something about them is flagged at a desk
 * (Contact.flaggedBy, named with the desk in the reason), and minor otherwise. Ties keep the person
 * first. What is on file is not here, because the records sheet lists it. Each line has
 * a short heading at `<key>.title`, and each contact line a stated reason at `reason`
 * (`<key>.reason`): harm to a person never comes without one the player can read. Ending in src/App.tsx lists them and endingLines()
 * in src/game/transcript.ts writes them down.
 */
export function consequences(s: RunState): EndingLine[] {
  const out: EndingLine[] = [];
  const facts = factIds(s);
  const protectedContact = CHARACTERS[s.character].protectedContact;
  for (const c of s.exposed) {
    const home = CONTACTS[c].home;
    // The protected contact's line states its reason: their record on file and flagged
    // (factTier()), or none. On file but never flagged, they are only questioned.
    const record = CONTACTS[c].record;
    const listed = !!record && facts.includes(record) && factTier(s, record) === 'flagged';
    // Every line states why naming them does this harm, at `<key>.reason`.
    const line = (key: string, severity: Severity): EndingLine => ({ kind: 'contact', key, vars: { contact: c }, severity, reason: `${key}.reason` });
    // A visit needs a reason the run established: their home on file is not enough,
    // something about them must be flagged at a desk, and the reason names which and where.
    const flag = (CONTACTS[c].flaggedBy ?? []).find((f) => facts.includes(f) && factTier(s, f) === 'flagged');
    if (c === protectedContact) out.push(line(`exposure.${c}.protected${listed ? '.record' : ''}`, 3));
    else if (home && facts.includes(home) && flag) {
      const desk = s.flaggedAt?.[flag];
      out.push({ ...line(`exposure.${c}.home`, 2), reason: `exposure.${c}.home.reason.${flag}${desk ? '' : '.anywhere'}`, vars: { contact: c, ...(desk ? { desk } : {}) } });
    }
    else out.push(line(`exposure.${c}.call`, 1));
  }
  if (!s.medicine) out.push({ kind: 'medicine', key: 'ending.line.medicineLost', severity: 3 });
  // Array.prototype.sort is stable, so equal severities keep the order above.
  return out.sort((a, b) => b.severity - a.severity);
}

/** One cost under a decisive answer on the ending: "2 hours lost", "Named your mother". */
export interface DecisiveCost {
  key: string;
  vars?: Record<string, string | number>;
  /** Plural count: render with tn(key, n). */
  n?: number;
  tone: Tone;
}

/** An answer the ending names as deciding the run: where it was given, what it said and what it cost. */
export interface DecisiveAnswer {
  desk: Checkpoint;
  key: string;
  vars?: Record<string, string>;
  costs: DecisiveCost[];
}

export const MIN_DECISIVE = 2;
export const MAX_DECISIVE = 3;

/**
 * How much an answer moved the run, for picking the ones that decided it: the
 * medicine first, then the protected contact named, a statement a record showed
 * false, anyone else named, then hours (and a missed connection) and scrutiny.
 * A document spent or a question settled counts a little, so a clean run still
 * names the papers that carried it.
 */
function weight(a: Answered, protectedContact: ContactId): number {
  return (a.medicine ? 100 : 0)
    + a.named.reduce((w, c) => w + (c === protectedContact ? 80 : 30), 0)
    + a.caught.length * 60
    + (a.hours + a.travel) * 10
    + a.scrutiny * 5
    + (a.used.length + a.settled.length) * 2;
}

/** The costs of one answer in plain words, worst first, or "Cost nothing". */
function costsOf(s: RunState, a: Answered, protectedContact: ContactId): DecisiveCost[] {
  const out: DecisiveCost[] = [];
  if (a.medicine) out.push({ key: 'ending.cost.medicine', tone: 'red' });
  for (const c of a.caught) out.push({ key: 'ending.cost.caught', vars: { said: own(`said.${c}`, s.character).slice('said.'.length) }, tone: 'red' });
  for (const c of a.named) out.push({ key: 'ending.cost.named', vars: { contact: c }, tone: c === protectedContact ? 'red' : 'amber' });
  if (a.hours) out.push({ key: 'ending.cost.hours', n: a.hours, tone: 'plain' });
  if (a.travel) out.push({ key: 'ending.cost.travel', n: a.travel, tone: 'amber' });
  if (a.scrutiny) out.push({ key: 'ending.cost.scrutiny', vars: { n: a.scrutiny }, tone: 'amber' });
  for (const id of a.used) out.push({ key: 'ending.cost.used', vars: { cardLabel: id }, tone: 'plain' });
  return out.length ? out : [{ key: 'ending.cost.none', tone: 'plain' }];
}

/**
 * The two or three answers that decided the run, from its own record
 * (RunState.answers, written by answered() in src/game/play.ts), in the order they
 * were given: the ones that moved it most (weight()), and when fewer than two moved
 * anything, the first answers given to make up two. Each names its desk, the answer
 * as its button read and what it cost. Empty for a run with no answers (turned back in
 * the first queue). Ending in src/App.tsx lists them and endingLines() in
 * src/game/transcript.ts writes them down.
 */
export function decisive(s: RunState): DecisiveAnswer[] {
  const protectedContact = CHARACTERS[s.character].protectedContact;
  return picked(s).map(({ a }) => ({ desk: a.desk, key: a.key, ...(a.vars ? { vars: a.vars } : {}), costs: costsOf(s, a, protectedContact) }));
}

/** The answers decisive() lists, with their place in RunState.answers, in the order they were given. */
function picked(s: RunState): { a: Answered; i: number }[] {
  const protectedContact = CHARACTERS[s.character].protectedContact;
  const all = (s.answers ?? []).map((a, i) => ({ a, i, w: weight(a, protectedContact) }));
  const moved = all.filter((x) => x.w > 0).sort((x, y) => y.w - x.w || x.i - y.i).slice(0, MAX_DECISIVE);
  const filler = all.filter((x) => x.w === 0).slice(0, Math.max(0, MIN_DECISIVE - moved.length));
  return [...moved, ...filler].sort((x, y) => x.i - y.i);
}

/**
 * The hours the answers decisive() leaves out cost, together (dap.39). With more than
 * three answers that cost time, the list alone added up to fewer hours than the run
 * spent (2 + 1 + 1 listed, the supervisor's hour left out). The ending shows them as one
 * line under the list (`ending.decided.rest`), so the hours listed and the hours left at
 * the exit add up to the hours the level starts with. 0 when every hour is listed.
 */
export function unlistedHours(s: RunState): number {
  const listed = new Set(picked(s).map((x) => x.i));
  return (s.answers ?? []).reduce((h, a, i) => h + (listed.has(i) ? 0 : a.hours), 0);
}

export type Axis = 'arrival' | 'flight' | 'medicine' | 'contacts';
export const AXES: readonly Axis[] = ['arrival', 'flight', 'medicine', 'contacts'];

/**
 * Everyone on file at the end of the run: the names your carried file brought in
 * (CarriedFile.named, what a Departure desk reads back as "Your file names...") and
 * the ones you gave on this crossing, file first, each once.
 */
export const onFile = (s: RunState): ContactId[] => [...new Set([...(s.file?.named ?? []), ...s.exposed])];

/**
 * The ending read on its axes, one line each (Branching Rules, 2026-11-11). Arrival:
 * arrival (on time or late, the hours left against the trip), the medicine (kept or
 * lost) and contacts. Departure (dap.32): the flight in the place of arrival and no
 * medicine line, since you only carry his empty box out (a box taken at customs has
 * its own consequence line). Contacts reads onFile(), so a name from the Arrival file
 * counts, and another relative a desk put on file this run (relativeContact or relativeNamed). The label is at `ending.axis.<axis>`. Ending in src/App.tsx shows them under
 * the decisive answers.
 */
export function axisLines(s: RunState): { axis: Axis; key: string; vars?: Record<string, string> }[] {
  const ending = s.ending ?? endingFor(s);
  const hours = { left: tn('ui.hours', s.time), trip: tn('ui.hours', travelOf(s)) };
  const leg: Axis = s.level === 'departure' ? 'flight' : 'arrival';
  const when = ending === 'turnedBack' ? 'none' : s.time >= travelOf(s) ? 'onTime' : 'late';
  // Another relative a desk put on file (the family register, or your mother naming one) is on file too (dap.39).
  const facts = factIds(s);
  const relative = facts.includes('relativeContact') || facts.includes('relativeNamed');
  const names = [...onFile(s).map((c) => t(`contact.${c}`)), ...(relative ? [t('ending.axis.contacts.relative')] : [])];
  return [
    { axis: leg, key: `ending.axis.${leg}.${when}`, ...(ending === 'turnedBack' ? {} : { vars: hours }) },
    ...(leg === 'flight' ? [] : [{ axis: 'medicine' as const, key: s.medicine ? 'ending.axis.medicine.kept' : 'ending.axis.medicine.lost' }]),
    names.length
      ? { axis: 'contacts', key: 'ending.axis.contacts.named', vars: { names: andList(names) } }
      : { axis: 'contacts', key: 'ending.axis.contacts.none' },
  ];
}

/**
 * The ending's body text: `ending.<endingText>.body`, except Home at a cost with the
 * medicine kept, where the cost was a name and not something you carried (dap.32), so
 * it reads `ending.homeAtCost.kept.body`.
 */
export function endingBody(s: RunState, text: string): string {
  return text === 'homeAtCost' && s.medicine ? 'ending.homeAtCost.kept.body' : `ending.${text}.body`;
}

/**
 * What comes back days after a crossing that got you home (rwf.10), or nothing. It
 * never changes the ending: Home in time stays Home in time, and the beat is its own
 * line after it. The run's record decides it, first match wins, worst first:
 * - statement: a claim a desk wrote down that a record then disproved (RunState.disproved).
 * - relative: another relative flagged at a desk (relativeNamed or relativeContact).
 * - donation: the old donation on file, by the record or the bank notice. A truthful answer can put it there.
 * - registration: you said at a desk that you stay with family and the family address is on
 *   file. All truthful. Not when officers already go to your mother's address (consequences()).
 * Each beat names the desk and the choice in its reason (`later.<id>.reason`).
 */
export function laterBeat(s: RunState): LaterBeat | undefined {
  if (s.ending !== 'homeInTime' && s.ending !== 'homeAtCost') return undefined;
  const facts = factIds(s);
  const first = (f: FactId) => s.flaggedAt?.[f] ?? s.facts[f]?.[0];
  const statement = (s.disproved ?? []).find((c) => s.logged?.[c]?.length);
  if (statement)
    return { id: 'statement', vars: { desk: s.logged![statement]![0], said: own(`said.${statement}`, s.character).slice('said.'.length) } };
  const relative = (['relativeNamed', 'relativeContact'] as const).find((f) => facts.includes(f) && factTier(s, f) === 'flagged');
  if (relative && first(relative)) return { id: 'relative', vars: { desk: first(relative)! } };
  const donation = (['donationRecord', 'bankNotice'] as const).find((f) => facts.includes(f));
  if (donation && first(donation)) return { id: 'donation', vars: { desk: first(donation)! } };
  const stay = s.logged?.stayingWithFamily?.[0];
  const visited = consequences(s).some((l) => l.key === 'exposure.mother.home');
  if (stay && facts.includes('familyAddress') && !visited) return { id: 'registration', vars: { desk: stay } };
  return undefined;
}

/**
 * The protected contact's row on the ending card: "Not named", or the exact result of
 * naming them, read from the consequence consequences() lists for them
 * (exposure.brother.protected gives exposure.brother.protected.row, "Added to watch
 * list"). One source, so the row and the line cannot disagree. Named only on the
 * carried file (a Departure desk read it back), the row says which crossing put them
 * there (dap.32).
 */
export function protectedRow(s: RunState): { key: string; tone: 'plain' | 'red'; vars?: Record<string, string> } {
  const c = CHARACTERS[s.character].protectedContact;
  const line = consequences(s).find((l) => l.kind === 'contact' && l.vars?.contact === c);
  if (line) return { key: `${line.key}.row`, tone: 'red' };
  if (s.file?.named.includes(c)) return { key: 'ui.namedOnFile', tone: 'plain', vars: { crossing: t(`level.${s.file.level}.title`) } };
  return { key: 'ui.notNamed', tone: 'plain' };
}

/**
 * The line a challenge card shows under its question (caught() in
 * src/game/engine.ts): your own words in quotes, the desk where you said them,
 * and the fact on file that catches them. The words are the traveler's own
 * wording of `said.<claim>` (Mark's denial is about the border, Lena's about
 * relatives here). Undefined on any other card.
 */
export function caughtLine(s: RunState, card: string): { key: string; vars: Record<string, string> } | undefined {
  const c = caught(s, card);
  if (!c) return fileLine(s, card);
  const key = `caught.line.${factTier(s, c.fact)}`;
  // A claim only a document made (the hotel booking for where you stay) is the document, not your words.
  const doc = s.shownBy?.[c.claim];
  if (doc) return { key: `${key}.shown`, vars: { cardThe: doc, desk: c.desk, fact: c.fact } };
  const said = own(`said.${c.claim}`, s.character).slice('said.'.length);
  return { key, vars: { said, desk: c.desk, fact: c.fact } };
}

/** A date on a carried file, as the line reads it: "9 March". */
export const fileDate = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * How a file line gives a claim: in the words of the answer that made it (CarriedClaim.answer,
 * its quotes and closing stop taken off), or, for an answer that was an act and not words
 * (giving your mother's address), what you did (`did.<card>.<answer>`). A file saved before
 * it kept the answer falls back to the claim's stock wording (`said.<claim>`).
 */
export function saidPart(c: FileQuote, character: CharacterId): { words: string } | { did: string } {
  const a = 'answer' in c ? c.answer : undefined;
  if (a && has(a.key)) {
    const text = t(a.key, a.vars ?? {});
    const spoken = /^"(.*?)[.?!]?"$/s.exec(text);
    if (spoken) return { words: spoken[1] };
    const did = `did.${'context' in c ? c.context : ''}.${a.id}`;
    if (has(did)) return { did: t(did, a.vars ?? {}) };
  }
  return { words: t(own(`said.${c.claim}`, character)) };
}

/** The claim's words alone, for a line that has no room for an act: a record that did not match. */
const wordsOf = (c: FileQuote, character: CharacterId): string => {
  const part = saidPart(c, character);
  return 'words' in part ? part.words : t(own(`said.${c.claim}`, character));
};

/**
 * A file line quoting a claim: `key` with the crossing, the date, the desk, the question
 * it answered and your words, `key`.did with what you did, or `key`.undated with the
 * crossing and your words when the file was saved before it kept the rest (fileSaid() in
 * src/game/engine.ts).
 */
function quoteLine(s: RunState, key: string, c: FileQuote): { key: string; vars: Record<string, string> } {
  const crossing = t(`level.${c.crossing}.title`);
  if (!('date' in c)) return { key: `${key}.undated`, vars: { crossing, words: wordsOf(c, s.character) } };
  const context = has(`file.context.${c.context}`) ? `file.context.${c.context}` : 'file.context';
  const dated = { crossing, date: fileDate(c.date), desk: c.desk, context: t(context) };
  // A claim a document made is quoted as the document you showed, never as words you said.
  if (c.shown) return { key: `${key}.shown`, vars: { ...dated, cardThe: c.shown } };
  const part = key === 'file.disproved' ? { words: wordsOf(c, s.character) } : saidPart(c, s.character);
  return 'did' in part ? { key: `${key}.did`, vars: { ...dated, did: part.did } } : { key, vars: { ...dated, words: part.words } };
}

/**
 * The line a Departure card shows under its question: what your carried file
 * (RunState.file) says about the point it asks, so a claim made on the way in comes
 * back with its date, crossing, desk and the question it answered. Undefined on
 * any other card, or when the file has nothing on that point.
 */
export function fileLine(s: RunState, card: string): { key: string; vars: Record<string, string> } | undefined {
  const file = s.file;
  if (!file) return undefined;
  const first = fileClaim(file);
  if (card === 'd_entry') return first && quoteLine(s, 'file.said', first);
  if (card === 'd_hold') {
    const c = fileSaid(file).find((x) => file.disproved?.includes(x.claim));
    return c && quoteLine(s, 'file.disproved', c);
  }
  const crossing = { crossing: t(`level.${file.level}.title`) };
  if (card === 'd_stayed') {
    const c = fileSaid(file).find((x) => x.claim === 'stayingWithFamily' || x.claim === 'hotelStay');
    if (c) return quoteLine(s, 'file.stayed', c);
    // A document shown for where you would stay (the deed, your mother's letter) makes no
    // stay claim, but it is the entry form's answer all the same (CarriedFile.shownOn, dap.39).
    const doc = file.shownOn?.p_host;
    return doc ? { key: 'file.stayed.shown', vars: { cardThe: doc } } : { key: 'file.stayed.none', vars: crossing };
  }
  if (card === 'd_stay') return { key: `file.stay.${fileStay(file)}`, vars: crossing };
  if (card === 'd_declared') return { key: `file.declared.${file.declared ?? 'none'}`, vars: crossing };
  return undefined;
}

/**
 * The date out the exit desk reads on your entry form (d_stay): the return ticket's
 * five days or the hotel's three nights when the file kept that document as shown,
 * none when it showed neither, and in a standalone run (a seeded default file) a
 * stated stand-in, a short visit, so the question never quotes a crossing nobody played.
 */
export function fileStay(file: CarriedFile): 'ticket' | 'hotel' | 'undated' | 'standalone' {
  if (file.seeded) return 'standalone';
  if (file.spent.includes('returnTicket')) return 'ticket';
  if (file.spent.includes('hotel')) return 'hotel';
  return 'undated';
}

/**
 * The recap a level that reads a file opens with (RecordStep in src/App.tsx): each
 * claim with its date, desk and your words, or the document you showed when a
 * document made it (CarriedClaim.shown), who you named, which claim a record did
 * not match.
 */
export function recordLines(file: CarriedFile): { key: string; vars?: Record<string, string> }[] {
  const lines: { key: string; vars?: Record<string, string> }[] = [{ key: 'ui.record.title' }];
  const claims = fileSaid(file);
  const quoteOf = (c: ClaimId): FileQuote => claims.find((x) => x.claim === c) ?? { claim: c, crossing: file.level };
  const shownDoc = (c: ClaimId) => claims.flatMap((x) => (x.claim === c && 'shown' in x && x.shown ? [x.shown] : []))[0];
  for (const c of claims) {
    if (!('date' in c)) lines.push({ key: 'ui.record.said.undated', vars: { words: wordsOf(c, file.character) } });
    else if (c.shown) lines.push({ key: 'ui.record.shown', vars: { date: fileDate(c.date), desk: c.desk, cardThe: c.shown } });
    else {
      const part = saidPart(c, file.character);
      const dated = { date: fileDate(c.date), desk: c.desk };
      lines.push('did' in part ? { key: 'ui.record.did', vars: { ...dated, did: part.did } } : { key: 'ui.record.said', vars: { ...dated, words: part.words } });
    }
  }
  if (!claims.length) lines.push({ key: 'ui.record.none' });
  for (const c of file.named) lines.push({ key: 'ui.record.named', vars: { contact: c } });
  for (const c of file.disproved ?? []) {
    const doc = shownDoc(c);
    lines.push(doc ? { key: 'ui.record.disproved.shown', vars: { cardThe: doc } } : { key: 'ui.record.disproved', vars: { words: wordsOf(quoteOf(c), file.character) } });
  }
  return lines;
}

/** The vars a question takes: on d_named, the contact your file names (fileContact()). */
export function questionVars(s: RunState, id: string): Record<string, string> {
  const c = id === 'd_named' ? fileContact(s.file) : undefined;
  return c ? { contact: c } : {};
}

/**
 * The key of the officer's question on card `id`, in the traveler's own words (own()).
 * The host card is also dealt on an accommodation day with no address on file at the
 * desk, and then it cannot say the officer found one: it reads `enc.c_host.phoned.q`.
 */
export function questionKey(s: RunState, prefix: 'enc' | 'insp', id: string): string {
  const base = prefix === 'enc' && id === 'c_host' && !knows(s, 'familyAddress') ? 'enc.c_host.phoned'
    // With nothing on file for the point, the Departure card asks it plainly.
    : prefix === 'enc' && ((id === 'd_entry' && !fileClaim(s.file)) || (id === 'd_named' && !fileContact(s.file))) ? `enc.${id}.unsaid`
    // The stay question names the date out the file holds (fileStay()); the ticket's five days is the plain one.
    : prefix === 'enc' && id === 'd_stay' && s.file && fileStay(s.file) !== 'ticket' ? `enc.d_stay.${fileStay(s.file)}`
    : `${prefix}.${id}`;
  return own(`${base}.q`, s.character);
}
