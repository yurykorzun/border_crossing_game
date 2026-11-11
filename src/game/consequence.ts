// The one line under each answer: what you give up now or put at risk, in plain
// words, with one icon. The full record (claims, facts on file) stays in My story.
// src/ui/parts.tsx renders it and src/game/transcript.ts writes it down, so both
// read the same parts.

import { has, own, t } from '../i18n';
import type { Option } from './engine';
import type { GameEvent } from './play';
import { caught, factIds, factTier, fileClaim, fileContact, knows, travelOf } from './engine';
import type { CarriedClaim, CarriedFile, ChangeLine, Checkpoint, ClaimId, ContactId, EndingLine, EvidenceId, FactId, LaterBeat, RunState, Severity } from './types';
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
/** Never dropped from the line. */
const KEEP: PartKind[] = ['medicine', 'miss', 'travel', 'contact', 'scrutiny', 'time'];
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

/** The run's clock as consequence() needs it: hours left and the trip they must cover. */
export type Clock = Pick<RunState, 'time' | 'travel'>;

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
export const CHANGE_EVENTS = ['contactExposed', 'claimChallenged', 'factRecorded', 'factSent', 'timeSpent', 'scrutinyChanged', 'medicineLost', 'travelChanged'] as const;

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
  // A challenge says which of three it is: a question raised, two accounts that
  // differ, or a claim a record shows false (catchKind() in src/game/content/encounters.ts).
  for (const e of events)
    if (e.type === 'claimChallenged') out.push({ key: `change.claim.${e.kind}`, vars: { claim: e.said }, tone: e.kind === 'disproof' ? 'red' : 'amber' });
  // Each fact names how it sits on file: found in the old records, confirmed on this
  // crossing, or flagged (factTier() in src/game/engine.ts).
  for (const e of events) if (e.type === 'factRecorded') out.push({ key: `change.onFile.${e.tier}`, vars: { fact: e.id }, tone: 'plain' });
  // A fact the line above already names is not named again on its way into the
  // shared records: the next desk's card shows it on its known-facts line (knownLine()).
  const named = new Set(events.flatMap((e) => (e.type === 'factRecorded' ? [e.id] : [])));
  for (const e of events)
    if (e.type === 'factSent' && !(e.via === 'records' && named.has(e.id)))
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
 * list"). One source, so the row and the line cannot disagree.
 */
export function protectedRow(s: RunState): { key: string; tone: 'plain' | 'red' } {
  const c = CHARACTERS[s.character].protectedContact;
  const line = consequences(s).find((l) => l.kind === 'contact' && l.vars?.contact === c);
  return line ? { key: `${line.key}.row`, tone: 'red' } : { key: 'ui.notNamed', tone: 'plain' };
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
  const said = own(`said.${c.claim}`, s.character).slice('said.'.length);
  return { key: `caught.line.${factTier(s, c.fact)}`, vars: { said, desk: c.desk, fact: c.fact } };
}

/** A date on a carried file, as the line reads it: "9 March". */
export const fileDate = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** The vars a file line quotes a claim with: the crossing, the date, the desk, the question it answered and your words. */
function quoteVars(s: RunState, c: CarriedClaim): Record<string, string> {
  const context = has(`file.context.${c.context}`) ? `file.context.${c.context}` : 'file.context';
  return {
    crossing: t(`level.${c.crossing}.title`),
    date: fileDate(c.date),
    desk: c.desk,
    context: t(context),
    said: own(`said.${c.claim}`, s.character).slice('said.'.length),
  };
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
  if (card === 'd_entry') return first && { key: 'file.said', vars: quoteVars(s, first) };
  if (card === 'd_hold') {
    const c = (file.said ?? []).find((x) => file.disproved?.includes(x.claim));
    return c && { key: 'file.disproved', vars: quoteVars(s, c) };
  }
  if (card === 'd_declared') return { key: `file.declared.${file.declared ?? 'none'}`, vars: { crossing: t(`level.${file.level}.title`) } };
  return undefined;
}

/**
 * The recap a level that reads a file opens with (RecordStep in src/App.tsx): each
 * claim with its date, desk and your words, who you named, which claim a record did
 * not match.
 */
export function recordLines(file: CarriedFile): { key: string; vars?: Record<string, string> }[] {
  const said = (c: ClaimId) => own(`said.${c}`, file.character).slice('said.'.length);
  const lines: { key: string; vars?: Record<string, string> }[] = [{ key: 'ui.record.title' }];
  const claims = file.said ?? [];
  for (const c of claims) lines.push({ key: 'ui.record.said', vars: { date: fileDate(c.date), desk: c.desk, said: said(c.claim) } });
  if (!claims.length) lines.push({ key: 'ui.record.none' });
  for (const c of file.named) lines.push({ key: 'ui.record.named', vars: { contact: c } });
  for (const c of file.disproved ?? []) lines.push({ key: 'ui.record.disproved', vars: { said: said(c) } });
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
    : `${prefix}.${id}`;
  return own(`${base}.q`, s.character);
}
