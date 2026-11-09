// Scenario evals. transcriptOf() replays a bot run and writes down every string
// the player would see, screen by screen; the RULES below check that record for
// story bugs. `npm run eval` (tools/eval.ts) runs them over many seeds.
//
// render() mirrors what src/App.tsx and src/ui/parts.tsx put on screen. The panel
// is the story; the top strip, scene label, tool bar and the two bottom sheets
// are `chrome` lines: rules 1 and 5 check them, but they are not counted as words
// read or written to the plain-text transcript, because they repeat on every
// screen. When a screen there changes, change it here too, or the transcript
// stops being what the player reads.

import { t, tn } from '../i18n';
import type { BotRun, BotStyle } from './bots';
import { CHECKS, ENCOUNTER_BY_ID } from './content/encounters';
import { queueBeats } from './content/queues';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, MAX_SCRUTINY, MISSION_MIN_TIME, SCRUTINY_AFTER_INSPECTION, START_TIME, beatDelayMs } from './content/world';
import { SEPARATOR, consequence, packDetail } from './consequence';
import { newRun, options, step, waitActions } from './engine';
import type { Option, RunSetup } from './engine';
import { eventsBetween } from './play';
import type { CharacterId, CheckId, ClaimId, ContactId, EndingId, FactId, RunState } from './types';
import { CHECKPOINTS } from './types';

export interface Line {
  /** Action index the line was on screen for; setup screens and the first queue are step 0. */
  step: number;
  key: string;
  text: string;
  /** Set on the character picker, where both travelers are on screen. */
  who?: CharacterId;
  /** Why t() could not render this line (rule 5). */
  problem?: string;
  /** The button the bot pressed on this screen. */
  picked?: boolean;
  /** Around the panel (top strip, tool bar, sheets): checked, but not read as story. */
  chrome?: boolean;
}

export type Happening =
  | { step: number; type: 'checkStarted'; id: CheckId }
  | { step: number; type: 'checkResolved'; id: CheckId; result: string }
  | { step: number; type: 'cardDealt'; id: string; claims: ClaimId[]; facts: FactId[] };

export interface Transcript {
  style: BotStyle;
  setup: RunSetup;
  lines: Line[];
  happenings: Happening[];
  /** Player choices: the traveler, each packed document, each pick on a card or in the waiting room. */
  decisions: number;
  /** Waiting-room beats at normal speed, in seconds. */
  beatSeconds: number;
  ending: EndingId | null;
}

// ── Rendering

class Page {
  lines: Line[] = [];
  step: number;
  constructor(step: number) {
    this.step = step;
  }
  add(key: string, vars: Record<string, string | number> = {}, extra: Partial<Line> = {}): void {
    this.lines.push({ step: this.step, ...render(() => t(key, vars), key), ...extra });
  }
  plural(key: string, n: number, extra: Partial<Line> = {}): void {
    this.lines.push({ step: this.step, ...render(() => tn(key, n), key), ...extra });
  }
}

const CHROME = { chrome: true } as const;

/** What src/App.tsx Run shows around the panel: TopStrip, scene label, tool bar, both sheets. */
function chromeLines(s: RunState, p: Page): void {
  const level = Math.min(s.scrutiny, MAX_SCRUTINY);
  p.add('ui.yourCrossing', {}, CHROME);
  p.add('ui.goal', {}, CHROME);
  p.plural('ui.hours', s.time, CHROME);
  p.add('ui.hoursLeft', { hours: tn('ui.hours', s.time) }, CHROME);
  p.add('ui.scrutinyCount', { n: level, max: MAX_SCRUTINY }, CHROME);
  const now = Math.min(s.checkpoint, CHECKPOINTS.length - 1);
  // progressName() in src/ui/parts.tsx: the queue is not named after its checkpoint.
  const name = s.screen.kind === 'between' && !s.reaction ? t('ui.inQueue') : t(`checkpoint.${CHECKPOINTS[now]}`);
  const count = t('ui.progressCount', { n: now + 1, total: CHECKPOINTS.length });
  p.add('ui.progressCount', { n: now + 1, total: CHECKPOINTS.length }, CHROME);
  p.add('ui.progress', { count, name }, CHROME);
  if (s.screen.kind === 'wait') p.add('ui.waiting', {}, CHROME);
  else if (s.screen.kind !== 'between')
    p.add(`officer.${s.screen.kind === 'inspection' ? 'inspection' : CHECKPOINTS[Math.min(s.checkpoint, 2)]}`, {}, CHROME);
  p.add('ui.myStory', {}, CHROME);
  p.add('ui.evidence', {}, CHROME);
  p.add('ui.settings', {}, CHROME);
  p.add('ui.close', {}, CHROME);
  // SettingsContent
  for (const k of ['ui.reduceWait', 'ui.sound', 'ui.reduceMotion']) p.add(k, {}, CHROME);
  // ScrutinyContent
  p.add('ui.scrutiny', {}, CHROME);
  p.add('ui.scrutinyHelp.what', {}, CHROME);
  p.add('ui.scrutinyHelp.rise', {}, CHROME);
  p.add('ui.scrutinyHelp.max', { max: MAX_SCRUTINY, after: SCRUTINY_AFTER_INSPECTION }, CHROME);
  // StoryContent
  const ch = CHARACTERS[s.character];
  p.add('ui.portraitOf', { name: t(`char.${ch.id}.name`) }, CHROME);
  p.add(`char.${ch.id}.name`, {}, CHROME);
  p.add(`char.${ch.id}.blurb`, {}, CHROME);
  p.add('ui.background', {}, CHROME);
  for (const b of ch.background) p.add(`bg.${b}`, {}, CHROME);
  p.add('ui.contacts', {}, CHROME);
  for (const c of ch.contacts) {
    p.add(`contact.${c}`, {}, CHROME);
    if (c === ch.protectedContact) p.add('ui.protected', {}, CHROME);
    if (s.exposed.includes(c)) p.add('ui.exposed', {}, CHROME);
    p.add(`contact.${c}.note`, {}, CHROME);
  }
  p.add('ui.claims', {}, CHROME);
  for (const c of s.claims) p.add(`claim.${c}`, {}, CHROME);
  if (!s.claims.length) p.add('ui.nothingYet', {}, CHROME);
  p.add('ui.onFile', {}, CHROME);
  for (const f of s.facts) p.add(`fact.${f}`, {}, CHROME);
  if (!s.facts.length) p.add('ui.nothingYet', {}, CHROME);
  // EvidenceContent
  for (const id of s.loadout) {
    p.add(`ev.${id}.name`, {}, CHROME);
    if (s.used.includes(id)) p.add('ui.used', {}, CHROME);
    p.add(`ev.${id}.desc`, {}, CHROME);
  }
  p.add(s.medicine ? 'ui.medicine' : 'ui.medicineLost', {}, CHROME);
}

function render(fn: () => string, key: string): { key: string; text: string; problem?: string } {
  try {
    const text = fn();
    const hole = text.match(/\{\w+\}/);
    return hole ? { key, text, problem: `unfilled ${hole[0]}` } : { key, text };
  } catch (e) {
    return { key, text: `[${key}]`, problem: (e as Error).message };
  }
}

function setupLines(setup: RunSetup, p: Page): void {
  p.add('ui.stamp');
  p.add('ui.title');
  p.add('ui.tagline');
  p.add('ui.start');
  // Setup 1: Choose your traveler
  p.add('ui.premise');
  p.add('ui.pickCharacter');
  for (const id of CHARACTER_IDS) {
    p.add('ui.portraitOf', { name: t(`char.${id}.name`) }, { who: id });
    p.add(`char.${id}.name`, {}, { who: id });
    p.add(`char.${id}.role`, {}, { who: id });
    for (const b of CHARACTERS[id].background) p.add(`bg.${b}.short`, {}, { who: id });
    p.add('ui.advantage');
    p.add(`char.${id}.advantage`, {}, { who: id });
    p.add('ui.complication');
    p.add(`char.${id}.complication`, {}, { who: id });
  }
  // Before a pick the screen shows the hint, after it the chosen history.
  p.add('ui.historyHint');
  p.add('ui.continue');
  const name = t(`char.${setup.character}.name`);
  p.add('ui.historyOf', { name });
  for (const b of CHARACTERS[setup.character].background) p.add(`bg.${b}`, {}, { who: setup.character });
  p.add('ui.continueAs', { name });
  // Setup 2: Pack your documents (DocumentsStep)
  const slots = CHARACTERS[setup.character].evidenceSlots;
  p.add('ui.back');
  const count = t('ui.progressCount', { n: 2, total: 3 });
  p.add('ui.preparation');
  p.add('ui.progress', { count, name: t('ui.preparation') });
  p.add('ui.prepareDocuments');
  p.add('ui.picked', { picked: slots, count: slots });
  p.add('ui.bulletin');
  p.add(`bulletin.${setup.bulletin}`);
  for (const id of EVIDENCE_IDS) {
    p.add(`ev.${id}.label`);
    const parts = packDetail(id).map((k) => render(() => t(k), k));
    const problem = parts.find((x) => x.problem)?.problem;
    p.lines.push({
      step: p.step,
      key: parts.map((x) => x.key).join(SEPARATOR),
      text: parts.map((x) => x.text).join(SEPARATOR),
      ...(problem ? { problem } : {}),
    });
  }
  p.add('ui.moreBelow');
  p.add('ui.continue');
  // Setup 3: Begin the crossing
  p.add('ui.beginCrossing');
  p.add('ui.mission');
  p.add('mission.title');
  p.add('mission.body', { hours: START_TIME, travel: MISSION_MIN_TIME });
  p.add('ui.missionRule', { n: MISSION_MIN_TIME });
  p.add('ui.yourDocuments');
  for (const id of setup.loadout) p.add(`ev.${id}.name`);
}

/** ConsequenceLine in src/ui/parts.tsx: one line per answer, its parts joined by " · ". */
function consequenceLine(o: Option, cardKey: string, s: RunState, p: Page): void {
  const parts = consequence(o, cardKey, CHARACTERS[s.character].protectedContact).parts.map((x) =>
    render(() => (x.n === undefined ? t(x.key, x.vars) : tn(x.key, x.n, x.vars)), x.key),
  );
  const problem = parts.find((x) => x.problem)?.problem;
  p.lines.push({
    step: p.step,
    key: parts.map((x) => x.key).join(SEPARATOR),
    text: parts.map((x) => x.text).join(SEPARATOR),
    ...(problem ? { problem } : {}),
  });
}

/** What the panel shows for this state. */
function screenLines(s: RunState, p: Page): void {
  if (s.ending && !s.reaction) return endingLines(s, p);
  chromeLines(s, p);
  if (s.reaction) {
    for (const r of s.reaction) p.add(r.key, r.vars);
    return p.add('ui.continue');
  }
  const sc = s.screen;
  if (sc.kind === 'between') {
    // Queue in src/App.tsx: every beat, tap by tap, then the walk up to the officer.
    const beats = queueBeats(sc.next, s.character);
    p.add('ui.inQueue');
    for (const b of beats) {
      if (b.from) p.add(`msg.from.${b.from}`);
      p.add(b.key);
    }
    if (beats.length > 1) p.add('ui.continue');
    return p.add(`queue.${sc.next}.go`);
  }
  if (sc.kind === 'wait') {
    const cp = CHECKPOINTS[Math.min(s.checkpoint, 2)];
    p.add(`check.${sc.check}.title`);
    for (const b of sc.beats.slice(0, sc.shown)) p.add(`beat.${cp}.${b}`);
    if (sc.shown < sc.beats.length) return p.add('ui.tapToSkip');
    for (const w of waitActions(s)) {
      if (!CHECKS[sc.check].important) { p.add('ui.continue'); continue; }
      if (w.blocked) { p.add('ui.nameSomeone'); p.add(`ui.blocked.${w.blocked}`); continue; }
      p.add(`wait.${w.action}.label`, w.contact ? { contact: w.contact } : {});
      p.add(`wait.${w.action}.detail`);
    }
    return;
  }
  if (sc.kind === 'encounter' || sc.kind === 'inspection') {
    const prefix = sc.kind === 'inspection' ? 'insp' : 'enc';
    p.add(`${prefix}.${sc.id}.q`);
    for (const o of options(s)) {
      if (o.blocked === 'noCard') p.add('ui.showDocument');
      else if (o.blocked === 'noContact') p.add('ui.nameSomeone');
      else {
        const vars: Record<string, string> = {};
        if (o.card) vars.card = vars.cardThe = o.card;
        if (o.contact) vars.contact = o.contact;
        p.add(`${prefix}.${sc.id}.${o.approach.id}.label`, vars);
      }
      consequenceLine(o, `${prefix}.${sc.id}.${o.approach.id}`, s, p);
    }
  }
}

function endingLines(s: RunState, p: Page): void {
  const ending = s.ending!;
  p.add('ui.timeLeft', { n: s.time });
  p.add(`ending.${ending}.title`);
  p.add(`ending.${ending}.body`);
  if (!s.medicine) p.add('ending.line.medicineLost');
  for (const c of s.exposed) {
    p.add('ending.line.exposed', { contact: c });
    if (c === CHARACTERS[s.character].protectedContact) p.add('ending.line.protectedExposed', { contact: c });
  }
  if (s.facts.length) {
    p.add('ui.onFileNow');
    for (const f of s.facts) p.add(`fact.${f}`);
  }
  // The count includes this ending; a first run shows 1.
  p.add('ui.endingsSeen', { n: 1 }, CHROME);
  p.add('ui.newRun');
}

/** Replays a bot run from its setup and records every screen. */
export function transcriptOf(run: BotRun, setup: RunSetup): Transcript {
  let s = newRun(setup);
  const first = new Page(0);
  setupLines(setup, first);
  const lines: Line[] = [...first.lines];
  const happenings: Happening[] = [];
  let decisions = 1 + setup.loadout.length;
  let beatMs = 0;
  run.actions.forEach((action, i) => {
    const page = new Page(i);
    screenLines(s, page);
    const sc = s.screen;
    const pickedKey =
      action.type === 'choose' && (sc.kind === 'encounter' || sc.kind === 'inspection')
        ? `${sc.kind === 'inspection' ? 'insp' : 'enc'}.${sc.id}.${action.approach}.label`
        : action.type === 'waitAction' ? `wait.${action.action}.label`
        : sc.kind === 'between' && !s.reaction ? `queue.${sc.next}.go` : 'ui.continue';
    const picked = page.lines.find((l) => l.key === pickedKey) ?? page.lines.find((l) => l.key === 'ui.continue');
    if (picked && action.type !== 'beat') picked.picked = true;
    lines.push(...page.lines);
    if (action.type === 'choose') decisions++;
    if (action.type === 'waitAction' && s.screen.kind === 'wait' && CHECKS[s.screen.check].important) decisions++;
    if (action.type === 'beat' && s.screen.kind === 'wait') beatMs += beatDelayMs(s.screen.beats[s.screen.shown] ?? 0);
    const n = step(s, action);
    for (const e of eventsBetween(s, n, action)) {
      if (e.type === 'checkStarted') happenings.push({ step: i, type: 'checkStarted', id: e.id });
      if (e.type === 'checkResolved') happenings.push({ step: i, type: 'checkResolved', id: e.id, result: e.result });
      if (e.type === 'cardDealt')
        happenings.push({ step: i + 1, type: 'cardDealt', id: e.id, claims: [...n.claims], facts: [...n.facts] });
    }
    s = n;
  });
  const last = new Page(run.actions.length);
  screenLines(s, last);
  lines.push(...last.lines);
  // The run can end on an officer's last line; the player taps Continue, then reads the ending.
  if (s.ending && s.reaction) {
    const after = new Page(run.actions.length + 1);
    endingLines(s, after);
    lines.push(...after.lines);
  }
  return { style: run.style, setup, lines, happenings, decisions, beatSeconds: beatMs / 1000, ending: s.ending };
}

// ── Rules

export const WORDS_PER_MINUTE = 200;
export const SECONDS_PER_DECISION = 3;
export const PLAY_MINUTES = { min: 5, max: 8 } as const;

export const words = (tr: Transcript) =>
  tr.lines.reduce((n, l) => (l.chrome ? n : n + l.text.split(/\s+/).filter(Boolean).length), 0);

/** Words shown / 200 wpm + waiting-room beats at normal speed + 3 s per decision. */
export function playMinutes(tr: Transcript): number {
  return words(tr) / WORDS_PER_MINUTE + (tr.beatSeconds + SECONDS_PER_DECISION * tr.decisions) / 60;
}

/** How each contact is named in text. A line naming one the traveler doesn't have is a story bug. */
export const CONTACT_WORDS: Record<ContactId, RegExp> = {
  mother: /\bmother\b/i,
  cousin: /\b(cousin|Ilya)\b/i,
  brother: /\b(brother|Tom)\b/i,
};

/** Claim and fact pairs that officials could catch. The contradiction card needs one of them. */
export const CONTRADICTIONS: readonly [ClaimId, FactId][] = [
  ['noOtherFamily', 'brotherAbroad'],
  ['tourism', 'familyAddress'],
  ['tourism', 'fatherCondition'],
];

export interface Failure {
  rule: number;
  style: BotStyle;
  seed: number;
  step: number;
  character: CharacterId;
  /** The i18n key or card id the failure is about. */
  key: string;
  detail: string;
  /** Rule 4 only: the run's estimate in minutes. */
  minutes?: number;
}

export type Rule = { id: number; name: string; check: (tr: Transcript) => Omit<Failure, 'rule' | 'style' | 'seed' | 'character'>[] };

/**
 * Rule 4 for a target range. The floor is for a run that goes the whole way. A run
 * you withdraw from (turnedBack) only has the ceiling, because you chose to stop early
 * and the game should not make you read more for it.
 */
export function playTimeRule(range: { min: number; max: number }): Rule {
  return {
    id: 4,
    name: `estimated play time is ${range.min}-${range.max} minutes (a run you withdraw from can be shorter)`,
    check: (tr) => {
      const m = playMinutes(tr);
      if (m <= range.max && (m >= range.min || tr.ending === 'turnedBack')) return [];
      const last = tr.lines.length ? tr.lines[tr.lines.length - 1].step : 0;
      return [{
        step: last, key: m < range.min ? 'tooShort' : 'tooLong', minutes: m,
        detail: `${m.toFixed(1)} min (${words(tr)} words, ${tr.beatSeconds.toFixed(0)} s of beats, ${tr.decisions} decisions)`,
      }];
    },
  };
}

export const RULES: Rule[] = [
  {
    id: 1,
    name: "a character's text names only their own contacts",
    check: (tr) => {
      const own = CHARACTERS[tr.setup.character].contacts;
      const out: ReturnType<Rule['check']> = [];
      for (const l of tr.lines) {
        if (l.who && l.who !== tr.setup.character) continue;
        for (const [c, re] of Object.entries(CONTACT_WORDS) as [ContactId, RegExp][])
          if (!own.includes(c) && re.test(l.text)) out.push({ step: l.step, key: l.key, detail: `names ${c}: "${l.text}"` });
      }
      return out;
    },
  },
  {
    id: 2,
    name: 'a follow-up is dealt only after the approach that queued it',
    check: (tr) => {
      const out: ReturnType<Rule['check']> = [];
      const started = new Set<CheckId>();
      const queued: string[] = [];
      for (const h of tr.happenings) {
        if (h.type === 'checkStarted') started.add(h.id);
        if (h.type === 'checkResolved' && started.has(h.id)) {
          started.delete(h.id);
          const c = CHECKS[h.id].cases.find((k) => k.result === h.result);
          if (c?.followUp) queued.push(c.followUp);
        }
        if (h.type === 'cardDealt' && ENCOUNTER_BY_ID.get(h.id)?.kind === 'followup') {
          const at = queued.indexOf(h.id);
          if (at < 0) out.push({ step: h.step, key: h.id, detail: `follow-up ${h.id} dealt with no check result that queues it` });
          else queued.splice(at, 1);
        }
      }
      return out;
    },
  },
  {
    id: 3,
    name: 'a contradiction card needs both the claim and the conflicting fact',
    check: (tr) => {
      const out: ReturnType<Rule['check']> = [];
      for (const h of tr.happenings) {
        if (h.type !== 'cardDealt' || h.id !== 'i_contradiction') continue;
        if (CONTRADICTIONS.some(([c, f]) => h.claims.includes(c) && h.facts.includes(f))) continue;
        out.push({ step: h.step, key: h.id, detail: `dealt with claims [${h.claims.join(', ')}] and facts [${h.facts.join(', ')}]` });
      }
      return out;
    },
  },
  playTimeRule(PLAY_MINUTES),
  {
    id: 5,
    name: 'every string resolves through t() with no missing key or unfilled {var}',
    check: (tr) => tr.lines.filter((l) => l.problem).map((l) => ({ step: l.step, key: l.key, detail: l.problem! })),
  },
];

/** A failure already filed elsewhere. It still counts, but does not fail the command. */
export interface KnownFailure {
  rule: number;
  key: string;
  character?: CharacterId;
  /** Rule 4 only: covers runs estimated at this many minutes or more, so a run that gets shorter still fails. */
  atLeastMinutes?: number;
  /** The bead that fixes it and removes this entry. */
  bead: string;
}

export const KNOWN_FAILURES: KnownFailure[] = [];

const matches = (k: KnownFailure, f: Failure) =>
  k.rule === f.rule && k.key === f.key && (!k.character || k.character === f.character) &&
  (k.atLeastMinutes === undefined || (f.minutes !== undefined && f.minutes >= k.atLeastMinutes));

export interface EvalResult {
  runs: number;
  /** Failures per rule id, known ones included. */
  byRule: Map<number, Failure[]>;
  /** Failures no known entry covers. Any of these fails the command. */
  fresh: Failure[];
  /** Known entries with how many failures each covered. One that covered none is stale and fails too. */
  known: { entry: KnownFailure; count: number }[];
  exitCode: 0 | 1;
}

export function evaluate(transcripts: Transcript[], known: KnownFailure[] = KNOWN_FAILURES, rules: Rule[] = RULES): EvalResult {
  const byRule = new Map<number, Failure[]>(rules.map((r) => [r.id, []]));
  const fresh: Failure[] = [];
  const counts = known.map(() => 0);
  for (const tr of transcripts)
    for (const r of rules)
      for (const x of r.check(tr)) {
        const f: Failure = { ...x, rule: r.id, style: tr.style, seed: tr.setup.seed, character: tr.setup.character };
        byRule.get(r.id)!.push(f);
        const k = known.findIndex((e) => matches(e, f));
        if (k < 0) fresh.push(f);
        else counts[k]++;
      }
  const stale = counts.some((n) => n === 0);
  return {
    runs: transcripts.length,
    byRule,
    fresh,
    known: known.map((entry, i) => ({ entry, count: counts[i] })),
    exitCode: fresh.length || stale ? 1 : 0,
  };
}

export const formatFailure = (f: Failure) =>
  `rule ${f.rule}: ${f.style} seed ${f.seed} step ${f.step} (${f.character}, ${f.key}): ${f.detail}`;

// ── Plain-text transcript for reading

export function transcriptText(tr: Transcript): string {
  const { setup } = tr;
  const head = [
    `${tr.style} · seed ${setup.seed} · ${setup.character} · ${setup.bulletin} bulletin · packed ${setup.loadout.join(', ')}`,
    `ending: ${tr.ending ?? 'none'} · estimated ${playMinutes(tr).toFixed(1)} min (${words(tr)} words, ${tr.beatSeconds.toFixed(0)} s of beats, ${tr.decisions} decisions)`,
    '',
  ];
  const body: string[] = [];
  let at = -1;
  for (const l of tr.lines) {
    if (l.chrome) continue;
    if (l.step !== at) { body.push('', `── step ${l.step}`); at = l.step; }
    body.push(`${l.picked ? '> ' : '  '}${l.text}`);
  }
  return [...head, ...body.slice(1), ''].join('\n');
}
