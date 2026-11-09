// The one line under each answer: what you give up now or put at risk, in plain
// words, with one icon. The full record (claims, facts on file) stays in My story.
// src/ui/parts.tsx renders it and src/game/transcript.ts writes it down, so both
// read the same parts.

import { has } from '../i18n';
import type { Option } from './engine';
import type { GameEvent } from './play';
import { factIds, travelOf } from './engine';
import type { BulletinId, ChangeLine, Checkpoint, ClaimId, ContactId, EndingLine, EvidenceId, RunState } from './types';
import { CHECKPOINTS } from './types';
import { BULLETIN_TOPICS, CHARACTERS, CONTACTS, EVIDENCE, MAX_SCRUTINY, writesDown } from './content/world';

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
/** Never dropped from the line. */
const KEEP: PartKind[] = ['medicine', 'miss', 'travel', 'contact', 'scrutiny', 'time'];
/**
 * Reading order on the line: the cost most likely to change the decision first (the
 * bus, time, the medicine, scrutiny, a check), then what goes on file and what it may
 * gain: "Costs 3 hours · Cash total recorded".
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

/** The run's clock as consequence() needs it: hours left and the trip they must cover. */
export type Clock = Pick<RunState, 'time' | 'travel'>;

/**
 * The parts for one answer. `cardKey` is the answer's key without `.label`
 * (`enc.p_purpose.family`): a `<cardKey>.check` text, when there is one, names the
 * check ("Register check"), and a `<cardKey>.contact` text replaces "Puts {contact} on file".
 * With the run's `clock`, the line says what the answer does to the last bus: a later
 * connection reads as the hours it will then need, and an answer that leaves fewer
 * hours than the trip takes reads "You will miss the last bus" in place of its cost.
 */
export function consequence(o: Option, cardKey: string, protectedContact: ContactId, desk?: Checkpoint, clock?: Clock): Consequence {
  const a = o.approach;
  if (o.blocked) return { icon: 'document', parts: [{ kind: 'blocked', key: `ui.blocked.${o.blocked}`, tone: 'plain' }] };

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
  // Time and scrutiny are summed, so a weakness reads "Costs 2 hours", not two parts.
  let time = 0;
  let scrutiny = 0;
  let travel = 0;
  const claims: ClaimId[] = [];
  for (const e of o.effects) {
    if ('time' in e) time += e.time;
    else if ('scrutiny' in e) scrutiny += e.scrutiny;
    else if ('travel' in e) travel += Math.max(0, e.travel);
    else if ('loseMedicine' in e) all.push({ kind: 'medicine', key: 'ui.line.medicine', tone: 'red' });
    else if ('fact' in e) all.push({ kind: 'fact', key: `fact.${e.fact}.reveal`, tone: 'plain' });
    else if ('claim' in e) claims.push(e.claim);
  }
  const checkKey = `${cardKey}.check`;
  if (a.check || has(checkKey)) all.push({ kind: 'check', key: has(checkKey) ? checkKey : 'ui.line.check', tone: 'amber' });
  // Against the last bus, the way the engine applies it (apply() and doomed() in
  // src/game/engine.ts): time floors at 0 and the trip only grows. Only an answer that
  // costs time or adds travel says it misses the bus, so on a run already short of the
  // trip a free answer still reads as free.
  const need = clock ? travelOf(clock) + travel : 0;
  const misses = !!clock && a.kind !== 'withdraw' && (time < 0 || travel > 0) && Math.max(0, clock.time + time) < need;
  if (misses) all.push({ kind: 'miss', key: 'ui.line.miss', tone: 'red' });
  else {
    if (time) all.push({ kind: 'time', key: 'ui.line.time', n: Math.abs(time), tone: 'plain' });
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
  const kept = [...all].sort((x, y) => rank(x) - rank(y)).slice(0, MAX_PARTS);
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

/** Event types that always get a line under the reaction. A test checks each has its key in en.ts. */
export const CHANGE_EVENTS = ['contactExposed', 'factRecorded', 'factSent', 'timeSpent', 'scrutinyChanged', 'medicineLost', 'travelChanged'] as const;

/**
 * What a step changed, one plain line each, built from its events: "Address verified.",
 * "On file at Customs: your mother's number.", "1 hour lost.", "Scrutiny 2/3.". Reaction in src/App.tsx
 * shows them under the officer's line and screenLines() in src/game/transcript.ts
 * writes them down.
 */
export function changeLines(events: GameEvent[], protectedContact: ContactId): ChangeLine[] {
  const out: ChangeLine[] = [];
  // A contact's result says only what happened: "Address verified." when the vouch
  // settled the question, then what went on file and where.
  for (const e of events)
    if (e.type === 'contactExposed') {
      if (e.vouch?.passed) out.push({ key: `change.verified.${e.vouch.topic}`, tone: 'plain' });
      out.push({ key: `change.contact.${e.shares}`, vars: { contact: e.id, desk: e.desk }, tone: e.id === protectedContact ? 'red' : 'amber' });
    }
  for (const e of events) if (e.type === 'factRecorded') out.push({ key: `change.fact.${e.id}`, tone: 'plain' });
  for (const e of events)
    if (e.type === 'factSent')
      out.push(e.via === 'records'
        ? { key: 'change.records', vars: { fact: e.id }, tone: 'plain' }
        : { key: 'change.sent', vars: { fact: e.id, desk: e.desks[0] }, tone: 'plain' });
  for (const e of events) if (e.type === 'timeSpent') out.push({ key: 'change.time', n: e.hours, tone: 'plain' });
  for (const e of events)
    if (e.type === 'scrutinyChanged') out.push({ key: 'change.scrutiny', vars: { n: e.to, max: MAX_SCRUTINY }, tone: e.to > e.from ? 'amber' : 'plain' });
  if (events.some((e) => e.type === 'medicineLost')) out.push({ key: 'change.medicine', tone: 'red' });
  for (const e of events) if (e.type === 'travelChanged') out.push({ key: 'change.travel', n: e.hours, tone: 'amber' });
  return out;
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

/** From this many facts on file, the record itself counts as serious. */
export const SERIOUS_FACTS = 4;

/**
 * What the run cost, scored, for any ending: the medicine left behind, each person
 * exposed and how badly, and how much is on file. Each is reported on its own, so
 * "Too late" still says you exposed your mother. Severity comes from the state:
 * the protected contact is severe (it also rules out homeInTime), anyone else is
 * serious once their home is on file and minor otherwise. Ending in src/App.tsx
 * lists them and endingLines() in src/game/transcript.ts writes them down.
 */
export function consequences(s: RunState): EndingLine[] {
  const out: EndingLine[] = [];
  if (!s.medicine) out.push({ kind: 'medicine', key: 'ending.line.medicineLost', severity: 3 });
  const facts = factIds(s);
  const protectedContact = CHARACTERS[s.character].protectedContact;
  for (const c of s.exposed) {
    const home = CONTACTS[c].home;
    if (c === protectedContact) out.push({ kind: 'contact', key: `exposure.${c}.protected`, vars: { contact: c }, severity: 3 });
    else if (home && facts.includes(home)) out.push({ kind: 'contact', key: `exposure.${c}.home`, vars: { contact: c }, severity: 2 });
    else out.push({ kind: 'contact', key: `exposure.${c}.call`, vars: { contact: c }, severity: 1 });
  }
  if (facts.length) out.push({ kind: 'facts', key: 'ending.line.facts', n: facts.length, severity: facts.length >= SERIOUS_FACTS ? 2 : 1 });
  return out;
}

/**
 * The protected contact's row on the ending card: "Not named", or the exact result of
 * naming them, read from the What it cost line consequences() scores for them
 * (exposure.brother.protected gives exposure.brother.protected.row, "Added to watch
 * list"). One source, so the row and the line cannot disagree.
 */
export function protectedRow(s: RunState): { key: string; tone: 'plain' | 'red' } {
  const c = CHARACTERS[s.character].protectedContact;
  const line = consequences(s).find((l) => l.kind === 'contact' && l.vars?.contact === c);
  return line ? { key: `${line.key}.row`, tone: 'red' } : { key: 'ui.notNamed', tone: 'plain' };
}

/**
 * Whether a document on the packing screen answers the topic today's bulletin points at
 * (BULLETIN_TOPICS): the hospital note under "Medicines are lab-tested today". A quiet
 * tag, not a promise. DocumentsStep in src/App.tsx and setupLines() in
 * src/game/transcript.ts both ask here.
 */
export const relevantToday = (id: EvidenceId, bulletin: BulletinId): boolean => EVIDENCE[id].topics.includes(BULLETIN_TOPICS[bulletin]);

/** Severe is red (a confirmed serious consequence), serious amber, minor plain (docs/plan.md "UI rules"). */
export const severityTone = (l: EndingLine): ChangeLine['tone'] => (l.severity === 3 ? 'red' : l.severity === 2 ? 'amber' : 'plain');
