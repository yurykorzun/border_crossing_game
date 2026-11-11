// Scenario evals. transcriptOf() replays a bot run and writes down every string
// the player would see, screen by screen; the RULES below check that record for
// story bugs. `npm run eval` (tools/eval.ts) runs them over many seeds.
//
// render() mirrors what src/App.tsx and src/ui/parts.tsx put on screen. The panel
// is the story; the top strip, scene label, tool bar and the two bottom sheets
// are `chrome` lines: rules 1 and 5 check them, but they are not counted as words
// read or written to the plain-text transcript, because they repeat on every
// screen. The level list's rows for levels a run did not pick are `once` lines:
// read once per session, so they are checked and kept in the transcript but
// counted in onceWords(), not in the run's play time. When a screen there
// changes, change it here too, or the transcript stops being what the player reads.

import { andList, has, own, t, tn } from '../i18n';
import type { BotRun } from './bots';
import { CHECKS, CONTRADICTIONS, ENCOUNTER_BY_ID, INCONSISTENCIES, INSPECTION_BY_ID } from './content/encounters';
import { PREPARATION_MESSAGE, messagesSoFar, queueBeats } from './content/queues';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE_IDS, MAX_SCRUTINY, SCRUTINY_AFTER_INSPECTION, beatDelayMs } from './content/world';
import { LEVELS, LEVEL_IDS, levelOf } from './content/levels';
import { SEPARATOR, caughtLine, consequence, consequences, keptLines, nextActionKey, packDetail, packedList, protectedRow, questionKey } from './consequence';
import { answerKey, canFinish, canTurnBack, deskIntro, deskOf, endingText, factIds, factTier, isCalm, knownAt, knownLine, loggedAt, newRun, optionFor, options, observation, routinesLeft, shownCheckpoint, travelOf, waitActions, waitKey } from './engine';
import type { Option, RunSetup } from './engine';
import { eventsBetween, playStep } from './play';
import type { CharacterId, CheckId, ClaimId, ContactId, EndingId, FactId, Level, LevelId, RunState } from './types';
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
  /**
   * Read once per session, not once per run: the level list's rows for the
   * levels this run did not pick. The list stays the same between runs, so a
   * player reads a row when it first appears and skims it after. Checked like
   * any line and kept in the plain-text transcript, but counted in onceWords(),
   * not in the run's play time (rule 4), so each new level does not lengthen every run.
   */
  once?: boolean;
}

export type Happening =
  | { step: number; type: 'checkStarted'; id: CheckId }
  | { step: number; type: 'checkResolved'; id: CheckId; result: string }
  /** An encounter card or an inspection. routinesLeft: the routine cards the desk could still have asked. */
  | { step: number; type: 'cardDealt'; id: string; claims: ClaimId[]; facts: FactId[]; routinesLeft: string[] };

export interface Transcript {
  style: BotRun['style'];
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
const ONCE = { once: true } as const;

/** What src/App.tsx Run shows around the panel: TopStrip, scene label, tool bar, both sheets. */
function chromeLines(s: RunState, p: Page): void {
  const level = Math.min(s.scrutiny, MAX_SCRUTINY);
  p.add('ui.yourCrossing', {}, CHROME);
  p.add('ui.goal', {}, CHROME);
  p.plural('ui.hours', s.time, CHROME);
  p.add('ui.untilLastBus', { hours: tn('ui.hours', s.time) }, CHROME);
  p.plural('ui.hours', travelOf(s), CHROME);
  p.add('ui.travelReserve', { hours: tn('ui.hours', travelOf(s)) }, CHROME);
  p.add('ui.scrutinyCount', { n: level, max: MAX_SCRUTINY }, CHROME);
  const now = shownCheckpoint(s);
  // progressName() in src/ui/parts.tsx: the queue is not named after its checkpoint.
  const cpName = t(`checkpoint.${CHECKPOINTS[now]}`);
  let name = s.screen.kind === 'between' && !s.reaction ? t('ui.inQueue') : cpName;
  if (s.screen.kind === 'inspection') {
    p.add('ui.inInspection', { name: cpName }, CHROME);
    name = t('ui.inInspection', { name: cpName });
  }
  const count = t('ui.progressCount', { n: now + 1, total: CHECKPOINTS.length });
  p.add('ui.progressCount', { n: now + 1, total: CHECKPOINTS.length }, CHROME);
  p.add('ui.progress', { count, name }, CHROME);
  // The counter scene's name for screen readers (CheckpointScene): on every run screen but the queue.
  if (!(s.screen.kind === 'between' && !s.reaction)) {
    p.add(`scene.${CHECKPOINTS[now]}`, {}, CHROME);
  }
  // The officer's label stays up with the last reaction, before the queue.
  if (!(s.screen.kind === 'between' && !s.reaction))
    p.add(`officer.${s.screen.kind === 'inspection' ? 'inspection' : CHECKPOINTS[now]}`, {}, CHROME);
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
  storyLines(s, p);
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

function setupLines(setup: RunSetup, p: Page, levels: readonly Level[]): void {
  // The title (Title in src/App.tsx): the name, the border post, the premise, Begin and Settings.
  p.add('ui.stamp');
  p.add('ui.title');
  p.add('scene.traveler', {}, CHROME);
  p.add('ui.tagline');
  p.add('ui.start');
  p.add('ui.settings', {}, CHROME);
  // Setup 1: LevelStep, the level list, only when more than one level is open
  // (showsLevelList()); the levels passed here are the open ones. One tap on a level,
  // so it is not counted as a decision. The heading and the picked level's row count in
  // this run. The other rows count once per session (Line.once), so the run does not get
  // longer as levels are added.
  const list = levels.length > 1;
  const total = list ? 4 : 3;
  const at = (n: number) => t('ui.progressCount', { n: list ? n : n - 1, total });
  if (list) {
    p.add('ui.title');
    p.add('ui.level');
    p.add('ui.progress', { count: at(1), name: t('ui.level') });
    p.add('ui.pickLevel');
    const picked = levelOf(setup).id;
    for (const l of levels) {
      const extra = l.id === picked ? {} : ONCE;
      p.add('ui.levelNumber', { n: l.number }, extra);
      p.add(l.title, {}, extra);
      p.add(l.blurb, {}, extra);
    }
  }
  // Setup 2: TravelerStep. Title, Back (to the list, or to the title), stage label, the premise as the heading, two cards.
  p.add('ui.title');
  p.add('scene.traveler', {}, CHROME);
  p.add('ui.back');
  p.add('ui.traveler');
  p.add('ui.progress', { count: at(2), name: t('ui.traveler') });
  p.add('ui.premise');
  // The radio group's accessible name: read out, never shown.
  p.add('ui.pickCharacter', {}, CHROME);
  for (const id of CHARACTER_IDS) {
    p.add('ui.portraitOf', { name: t(`char.${id}.name`) }, { who: id });
    p.add(`char.${id}.name`, {}, { who: id });
    p.add(`char.${id}.role`, {}, { who: id });
    p.add(`char.${id}.card`, {}, { who: id });
  }
  p.add('ui.continue');
  // After a pick: the history link, and the history behind it. It stays closed
  // unless opened, so its words are not counted as read (chrome, like the sheets).
  const name = t(`char.${setup.character}.name`);
  p.add('ui.readHistory', { name });
  for (const b of CHARACTERS[setup.character].background) p.add(`bg.${b}`, {}, { who: setup.character, ...CHROME });
  p.add('ui.continueAs', { name });
  // Setup 3: Pack your documents (DocumentsStep)
  const slots = CHARACTERS[setup.character].evidenceSlots;
  p.add('ui.back');
  p.add('scene.preparation', {}, CHROME);
  const count = at(3);
  p.add('ui.preparation');
  p.add('ui.progress', { count, name: t('ui.preparation') });
  p.add('ui.prepareDocuments');
  // The one message on the packing screen, before you choose (PREPARATION_MESSAGE).
  p.add(`msg.from.${PREPARATION_MESSAGE.from}`);
  p.add(PREPARATION_MESSAGE.key);
  p.add('ui.picked', { picked: slots, count: slots });
  p.add('ui.bulletin');
  p.add(`bulletin.${setup.bulletin}`);
  // A day with a second warning shows it on its own line (the packing screen in src/App.tsx).
  if (has(`bulletin.${setup.bulletin}.also`)) p.add(`bulletin.${setup.bulletin}.also`);
  // The one cue above the list: what officers are doing today. It is read, so it counts.
  p.add(`bulletin.${setup.bulletin}.cue`);
  for (const id of EVIDENCE_IDS) {
    p.add(`ev.${id}.label`);
    for (const line of packDetail(id)) {
      const parts = line.map((k) => render(() => t(k), k));
      const problem = parts.find((x) => x.problem)?.problem;
      p.lines.push({
        step: p.step,
        key: parts.map((x) => x.key).join(SEPARATOR),
        text: parts.map((x) => x.text).join(SEPARATOR),
        ...(problem ? { problem } : {}),
      });
    }
  }
  p.add('ui.moreBelow');
  p.add('ui.continue');
  // Setup 4: Before you cross (BeginStep), the level's goal with its hours, the traveler and the packed list.
  const level = levelOf(setup);
  p.add('ui.beforeYouCross');
  p.add(level.goalTitle);
  p.add(level.goalBody);
  p.add(`ui.lastBus.${level.startTime === 1 ? 'one' : 'other'}`, { n: level.startTime });
  p.add(`ui.allowTravel.${level.minTripTime === 1 ? 'one' : 'other'}`, { n: level.minTripTime });
  p.add(`char.${setup.character}.name`);
  p.add(`char.${setup.character}.role`);
  p.add('ui.packedList', { list: packedList(setup.loadout) });
  p.add('ui.beginCrossing');
  p.add('ui.back');
  p.add('ui.changeDocuments');
}

/** StoryContent in src/ui/parts.tsx: My story, from the tool bar or the ending. */
function storyLines(s: RunState, p: Page): void {
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
    p.add(`contact.${c}.can`, {}, CHROME);
  }
  // Messages: every phone message of the queues reached so far (in a queue, the UI shows only those already up).
  p.add('ui.messages', {}, CHROME);
  const messages = messagesSoFar(s);
  for (const b of messages) {
    if (b.from) p.add(`msg.from.${b.from}`, {}, CHROME);
    p.add(b.key, {}, CHROME);
  }
  if (!messages.length) p.add('ui.nothingYet', {}, CHROME);
  p.add('ui.claims', {}, CHROME);
  const desks = (ds: readonly string[]) => andList(ds.map((d) => t(`checkpoint.${d}`)));
  for (const c of s.claims) {
    p.add(own(`claim.${c}`, s.character), {}, CHROME);
    const at = loggedAt(s, c);
    if (!at.length) p.add('ui.saidAloud', {}, CHROME);
    else p.add('ui.recordedAt', { desks: desks(at) }, CHROME);
  }
  if (!s.claims.length) p.add('ui.nothingYet', {}, CHROME);
  p.add('ui.onFile', {}, CHROME);
  for (const f of factIds(s)) {
    p.add(`fact.${f}`, {}, CHROME);
    p.add(`ui.tier.${factTier(s, f)}`, {}, CHROME);
    const at = s.facts[f] ?? [];
    p.add(`ui.haveOnFile.${at.length === 1 ? 'one' : 'other'}`, { desks: desks(at), n: at.length }, CHROME);
  }
  if (!factIds(s).length) p.add('ui.nothingYet', {}, CHROME);
  // EvidenceContent
  for (const id of s.loadout) {
    p.add(`ev.${id}.name`, {}, CHROME);
    if (s.used.includes(id)) p.add('ui.used', {}, CHROME);
    p.add(`ev.${id}.desc`, {}, CHROME);
  }
  p.add(s.medicine ? 'ui.medicine' : 'ui.medicineLost', {}, CHROME);
}

/** ConsequenceLine in src/ui/parts.tsx: one line per answer, its parts joined by " · ". */
function consequenceLine(o: Option, cardKey: string, s: RunState, p: Page): void {
  const parts = consequence(o, cardKey, CHARACTERS[s.character].protectedContact, deskOf(s), s).parts.map((x) =>
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
    // Reaction in src/App.tsx: the officer's line, one line per change, the next-action button.
    for (const r of s.reaction) p.add(r.key, r.vars);
    for (const c of s.changes ?? []) {
      if (c.n === undefined) p.add(c.key, c.vars);
      else p.lines.push({ step: p.step, ...render(() => tn(c.key, c.n!, c.vars), c.key) });
    }
    return p.add(nextActionKey(s));
  }
  const sc = s.screen;
  if (sc.kind === 'between') {
    // Queue in src/App.tsx: every beat, tap by tap, then the walk up to the officer.
    const beats = queueBeats(sc.next, s);
    for (const b of beats) {
      if (b.from) p.add(`msg.from.${b.from}`);
      p.add(b.key);
    }
    if (beats.length > 1) p.add('ui.continue');
    p.add(`queue.${sc.next}.go`);
    // The passport queue is the one early point to turn back (canTurnBack()).
    if (canTurnBack(s)) p.add(`queue.${sc.next}.turnBack`);
    return;
  }
  if (sc.kind === 'wait') {
    // Waiting in src/App.tsx: what they are doing, then the latest beat.
    const cp = CHECKPOINTS[Math.min(s.checkpoint, 2)];
    p.add(`check.${sc.check}.title`);
    const seen = observation(s);
    if (seen) p.add(seen);
    else if (sc.shown > 0) p.add(`beat.${cp}.${sc.beats[sc.shown - 1]}`);
    if (sc.shown < sc.beats.length) return p.add('ui.tapToSkip');
    for (const w of waitActions(s)) {
      if (w.action === 'wait') { p.add(waitKey(sc.check, 'wait', 'label')); continue; }
      if (w.blocked) { p.add('ui.nameSomeone'); p.add(`ui.blocked.${w.blocked}`); continue; }
      p.add(waitKey(sc.check, w.action, 'label'), w.contact ? { contact: w.contact } : {});
      p.add(w.contact ? `contact.${w.contact}.shares` : waitKey(sc.check, w.action, 'detail'));
      if (w.contact && w.vouches) p.add(`contact.${w.contact}.can.${w.vouches}`);
    }
    return;
  }
  if (sc.kind === 'encounter' || sc.kind === 'inspection') {
    const prefix = sc.kind === 'inspection' ? 'insp' : 'enc';
    // Panel in src/App.tsx: the officer's priority line above the first question at a desk.
    const desk = deskIntro(s);
    const finishing = canFinish(s);
    // The list behind "Show a document" keeps only the question over the documents.
    const list = !!s.documentList;
    // Once the bus is out of reach, the line saying so sits above the priority line.
    if (finishing && !list) p.add('ui.doomed');
    if (desk && !list) p.add(`officer.${desk}.priority`);
    // What this officer already knows, on every desk card (knownLine()).
    if (!list) for (const k of knownLine(s)) p.add(k.key, k.vars ?? {});
    p.add(questionKey(s, prefix, sc.id));
    // A challenge card: your own words, the desk and the fact that catches them.
    const caught = sc.kind === 'encounter' ? caughtLine(s, sc.id) : undefined;
    if (caught) p.add(caught.key, caught.vars);
    for (const o of options(s)) {
      if (o.blocked === 'noCard' || o.documents) p.add('ui.showDocument');
      else if (o.blocked === 'noContact') p.add('ui.nameSomeone');
      else {
        const vars: Record<string, string> = {};
        if (o.card) vars.card = vars.cardThe = o.card;
        if (o.contact) vars.contact = vars.contactMine = o.contact;
        p.add(answerKey(s, o.approach.id, 'label'), vars);
      }
      consequenceLine(o, `${prefix}.${sc.id}.${o.approach.id}`, s, p);
    }
    if (list) p.add('ui.backToAnswers');
    if (finishing) p.add('ui.finishQuickly');
  }
}

/**
 * Ending in src/App.tsx: the title, what you kept and the worst consequence are the story;
 * the other consequences, the epilogue and the sheet behind "See what's on file" are chrome.
 */
function endingLines(s: RunState, p: Page): void {
  const ending = s.ending!;
  const text = endingText(s);
  const ch = CHARACTERS[s.character];
  p.add('ui.title', {}, CHROME);
  const scene = ending === 'turnedBack' ? 'scene.turnedBack'
    : text === 'missedBus' ? (s.medicine ? 'scene.emptyStop' : 'scene.emptyStopEmpty')
    : s.medicine ? 'scene.bus' : 'scene.busEmpty';
  p.add(scene, {}, CHROME);
  p.add(ending === 'turnedBack' ? 'ui.crossingRefused' : 'ui.crossingComplete');
  p.add(`ending.${text}.title`);
  // keptLines(): what you kept, under the title.
  for (const k of keptLines(s)) p.add(k.key, k.vars);
  // consequences(), worst first: the worst is read, as a heading and a line; the rest,
  // like the epilogue, are counted as chrome, as the card's longer text always was.
  consequences(s).forEach((l, i) => {
    p.add(`${l.key}.title`, l.vars, i === 0 ? {} : CHROME);
    if (l.reason) p.add(l.reason, l.vars, i === 0 ? {} : CHROME);
    p.add(l.key, l.vars, i === 0 ? {} : CHROME);
  });
  p.add(`ending.${text}.body`, {}, CHROME);
  // The run summary, resultRows(): hours left, the medicine, the protected contact.
  p.add('ui.runSummary', {}, CHROME);
  p.add('ui.hoursLeftRow');
  p.add('ui.medicineRow');
  p.add(s.medicine ? 'ui.kept' : 'ui.lost');
  p.add(`contact.${ch.protectedContact}`);
  p.add(protectedRow(s).key);
  // The one replay prompt under the summary.
  p.add('ui.replayPrompt');
  p.add('ui.seeOnFile');
  p.add('ui.playAgain');
  // The Border records sheet behind "See what's on file".
  p.add('ui.myStory', {}, CHROME);
  p.add('ui.close', {}, CHROME);
  storyLines(s, p);
}

/**
 * Replays a bot run from its setup and records every screen. `levels` is the
 * level list on the first setup screen: every level (LEVEL_IDS) unless a test passes its own.
 */
export function transcriptOf(run: BotRun, setup: RunSetup, levels: readonly Level[] = LEVEL_IDS.map((id) => LEVELS[id])): Transcript {
  let s = newRun(setup);
  const first = new Page(0);
  setupLines(setup, first, levels);
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
        ? (optionFor(s, action)?.documents ? 'ui.showDocument' : answerKey(s, action.approach, 'label'))
        : action.type === 'waitAction' && sc.kind === 'wait' ? waitKey(sc.check, action.action, 'label')
        : action.type === 'finish' ? 'ui.finishQuickly'
        : action.type === 'turnBack' && sc.kind === 'between' ? `queue.${sc.next}.turnBack`
        : sc.kind === 'between' && !s.reaction ? `queue.${sc.next}.go`
        : s.reaction ? nextActionKey(s) : 'ui.continue';
    // Two documents can answer with the same label key, so a document pick matches its own text.
    const card = action.type === 'choose' ? action.card : undefined;
    const pickedText = card && render(() => t(pickedKey, { card, cardThe: card }), pickedKey).text;
    const picked = page.lines.find((l) => l.key === pickedKey && (!pickedText || l.text === pickedText))
      ?? page.lines.find((l) => l.key === 'ui.continue');
    if (picked && action.type !== 'beat') picked.picked = true;
    lines.push(...page.lines);
    // A calm card's one answer is a tap, not a decision (isCalm() in src/game/engine.ts).
    if (action.type === 'choose' && !(sc.kind === 'encounter' && isCalm(sc.id))) decisions++;
    // Every check offers at least waiting or asking, so each pick there is a decision.
    if (action.type === 'waitAction') decisions++;
    // Turning back in the passport queue is a choice too (canTurnBack() in src/game/engine.ts).
    if (action.type === 'turnBack') decisions++;
    if (action.type === 'beat' && s.screen.kind === 'wait') beatMs += beatDelayMs(s.screen.beats[s.screen.shown] ?? 0);
    const n = playStep(s, action);
    for (const e of eventsBetween(s, n, action)) {
      if (e.type === 'checkStarted') happenings.push({ step: i, type: 'checkStarted', id: e.id });
      if (e.type === 'checkResolved') happenings.push({ step: i, type: 'checkResolved', id: e.id, result: e.result });
      if (e.type === 'cardDealt' || e.type === 'inspectionStarted')
        // What the official dealing the card knows, not every fact on the crossing.
        happenings.push({
          step: i + 1, type: 'cardDealt', id: e.id, claims: [...n.claims], facts: knownAt(n), routinesLeft: routinesLeft(n).map((x) => x.id),
        });
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
/**
 * Rule 4. Every full run is floor-max minutes. A run you withdraw from
 * (turnedBack) only has the ceiling. target is what the median full run is
 * reported against, not checked: the balance review (2op.6) dropped that floor.
 */
export const PLAY_MINUTES = { floor: 4, target: 5, max: 8 } as const;

const wordCount = (l: Line) => l.text.split(/\s+/).filter(Boolean).length;

/** Words read in this run: not chrome, and not the lines read once per session. */
export const words = (tr: Transcript) =>
  tr.lines.reduce((n, l) => (l.chrome || l.once ? n : n + wordCount(l)), 0);

/** Words read once per session (Line.once): the level list's other rows. */
export const onceWords = (tr: Transcript) =>
  tr.lines.reduce((n, l) => (l.once && !l.chrome ? n + wordCount(l) : n), 0);

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

/**
 * Claim and fact pairs that officials could catch, per card: the clarify card
 * needs an inconsistency, the contradiction card a disproof.
 */
export const CATCHES: Record<string, readonly [ClaimId, FactId][]> = {
  i_clarify: INCONSISTENCIES,
  i_contradiction: CONTRADICTIONS,
};

export interface Failure {
  rule: number;
  style: BotRun['style'];
  seed: number;
  step: number;
  character: CharacterId;
  /** The i18n key or card id the failure is about. */
  key: string;
  detail: string;
  /** Rule 4 only: the run's estimate in minutes. */
  minutes?: number;
}

/** A check over all transcripts together. `ok: false` fails the command like a fresh failure. */
export interface Summary { rule: number; ok: boolean; text: string }

export type Rule = {
  id: number;
  name: string;
  check: (tr: Transcript) => Omit<Failure, 'rule' | 'style' | 'seed' | 'character'>[];
  /** Optional check over the whole eval, after every run is checked. */
  summary?: (trs: Transcript[]) => Omit<Summary, 'rule'> | undefined;
};

export type PlayTimeRange = { floor: number; target: number; max: number };

/** Median estimate of the full runs (not turnedBack), or undefined when there are none. */
export function medianFullMinutes(trs: Transcript[]): { runs: number; median: number | undefined } {
  const ms = trs.filter((tr) => tr.ending !== 'turnedBack').map(playMinutes).sort((a, b) => a - b);
  if (!ms.length) return { runs: 0, median: undefined };
  const mid = ms.length >> 1;
  return { runs: ms.length, median: ms.length % 2 ? ms[mid] : (ms[mid - 1] + ms[mid]) / 2 };
}

/**
 * Rule 4 for a range. The floor is for a run that goes the whole way. A run you
 * withdraw from (turnedBack) only has the ceiling, because you chose to stop early
 * and the game should not make you read more for it. The summary only reports
 * the median full run next to the target; it never fails the eval.
 */
export function playTimeRule(range: PlayTimeRange): Rule {
  return {
    id: 4,
    name: `estimated play time is ${range.floor}-${range.max} minutes (a run you withdraw from can be shorter)`,
    check: (tr) => {
      const m = playMinutes(tr);
      if (m <= range.max && (m >= range.floor || tr.ending === 'turnedBack')) return [];
      const last = tr.lines.length ? tr.lines[tr.lines.length - 1].step : 0;
      return [{
        step: last, key: m < range.floor ? 'tooShort' : 'tooLong', minutes: m,
        detail: `${m.toFixed(1)} min (${words(tr)} words, ${tr.beatSeconds.toFixed(0)} s of beats, ${tr.decisions} decisions)`,
      }];
    },
    summary: (trs) => {
      const { runs, median } = medianFullMinutes(trs);
      if (median === undefined) return undefined;
      // The longest full run, so the room left under the ceiling shows (pfi.11).
      const longest = Math.max(...trs.filter((tr) => tr.ending !== 'turnedBack').map(playMinutes));
      // The level list's other rows, counted once per session rather than in each run (Line.once).
      const once = Math.max(...trs.map(onceWords));
      return {
        ok: true,
        text: `median full run ${median.toFixed(1)} min (aim ${range.target}, not checked), longest ${longest.toFixed(2)} of ${range.max} (${runs} runs)`
          + (once ? `, plus ${once} words of the level list read once per session` : ''),
      };
    },
  };
}

/** Rule 6: the dealer's pacing rule (breather() in src/game/engine.ts). */
export const MAX_ESCALATIONS = 2;

/**
 * Rules 7-9, the balance targets from the review (docs/research/2026-11-09-balance-and-levels.md).
 * Honesty is not punished, lying does not always win, and an inspection is a
 * real risk without being every run. Shares are percent of runs. They are only
 * checked with at least minRuns runs per style, because a handful of seeds
 * cannot say anything about a share; with fewer the summary says so.
 */
export const BALANCE = { honestHomeMin: 50, liarHomeMax: 80, memorisedHomeMax: 80, inspected: { min: 25, max: 33 }, minRuns: 100 } as const;

/**
 * Rule 10: one fixed answer per card, learned from a first pass of every style
 * (firstPassScript() in src/game/bots.ts), gets home in time in at most
 * BALANCE.memorisedHomeMax percent of runs, so the game is not solved by heart.
 * The script plays outside the per-style transcripts, so tools/eval.ts counts
 * its wins and this only judges the share. 60 percent is the next step, after a playtest.
 */
export const MEMORISED_RULE = { id: 10, name: `the memorised script gets home in time in at most ${BALANCE.memorisedHomeMax}% of runs` } as const;

export function memorisedSummary(won: number, runs: number): Summary {
  const pct = runs ? (won * 100) / runs : 0;
  const text = `memorised homeInTime ${pct.toFixed(1)}% of ${runs} runs`;
  if (runs < BALANCE.minRuns) return { rule: MEMORISED_RULE.id, ok: true, text: `${text} (not checked: ${runs} runs, needs ${BALANCE.minRuns})` };
  return { rule: MEMORISED_RULE.id, ok: pct <= BALANCE.memorisedHomeMax, text };
}

/** True when the run dealt at least one secondary inspection. */
export const inspected = (tr: Transcript) => tr.happenings.some((h) => h.type === 'cardDealt' && INSPECTION_BY_ID.has(h.id));

/** The fewest runs any style in `trs` played. */
function fewestPerStyle(trs: Transcript[]): number {
  const n = new Map<string, number>();
  for (const tr of trs) n.set(tr.style, (n.get(tr.style) ?? 0) + 1);
  return Math.min(...n.values());
}

/**
 * A whole-eval rule over a share of runs: `pick` is the runs it counts, `hit`
 * the runs that score, and `within` says whether the share in percent passes.
 */
function shareRule(id: number, name: string, label: string, pick: (tr: Transcript) => boolean, hit: (tr: Transcript) => boolean,
  within: (pct: number) => boolean): Rule {
  return {
    id,
    name,
    check: () => [],
    summary: (trs) => {
      const runs = trs.filter(pick);
      if (!runs.length) return undefined;
      const pct = (runs.filter(hit).length * 100) / runs.length;
      const text = `${label} ${pct.toFixed(1)}% of ${runs.length} runs`;
      const fewest = fewestPerStyle(runs);
      if (fewest < BALANCE.minRuns) return { ok: true, text: `${text} (not checked: ${fewest} runs per style, needs ${BALANCE.minRuns})` };
      return { ok: within(pct), text };
    },
  };
}

const home = (tr: Transcript) => tr.ending === 'homeInTime';

export const BALANCE_RULES: Rule[] = [
  shareRule(7, `honest play gets home in time in at least ${BALANCE.honestHomeMin}% of runs`, 'honest homeInTime',
    (tr) => tr.style === 'honest', home, (p) => p >= BALANCE.honestHomeMin),
  shareRule(8, `the liar bot gets home in time in at most ${BALANCE.liarHomeMax}% of runs`, 'liar homeInTime',
    (tr) => tr.style === 'liar', home, (p) => p <= BALANCE.liarHomeMax),
  shareRule(9, `an inspection happens in ${BALANCE.inspected.min}-${BALANCE.inspected.max}% of runs across all styles`, 'runs with an inspection',
    () => true, inspected, (p) => p >= BALANCE.inspected.min && p <= BALANCE.inspected.max),
];

/** One run's packing, style and whether it got home in time, for rule 11. */
export interface PackingResult { style: string; packing: string; home: boolean }

/** A packing as rule 11 names it: the traveler and the documents carried. */
export const packingOf = (setup: RunSetup) => `${setup.character}:${setup.loadout.join('+')}`;

export const PACKING_RULE = { id: 11, name: 'the most successful bot style differs between packings, and every packing gets home in time at least once' } as const;

/**
 * Rule 11: different packings need different strategies. Per packing, the best
 * styles are the ones with the highest homeInTime share (ties keep all of
 * them). It passes when two packings have no best style in common and every
 * packing got home in time in some run. Checked with at least BALANCE.minRuns
 * runs per style, like rules 7-9.
 */
export function packingSummary(results: readonly PackingResult[]): Summary {
  const by = new Map<string, Map<string, { won: number; played: number }>>();
  const perStyle = new Map<string, number>();
  for (const r of results) {
    perStyle.set(r.style, (perStyle.get(r.style) ?? 0) + 1);
    const styles = by.get(r.packing) ?? new Map<string, { won: number; played: number }>();
    const t = styles.get(r.style) ?? { won: 0, played: 0 };
    styles.set(r.style, { won: t.won + (r.home ? 1 : 0), played: t.played + 1 });
    by.set(r.packing, styles);
  }
  const bests: Set<string>[] = [];
  const lost: string[] = [];
  const tally = new Map<string, number>();
  for (const [packing, styles] of by) {
    const rate = (t: { won: number; played: number }) => t.won / t.played;
    const top = Math.max(...[...styles.values()].map(rate));
    if (top === 0) lost.push(packing);
    const best = new Set([...styles].filter(([, t]) => rate(t) === top).map(([s]) => s));
    for (const s of best) tally.set(s, (tally.get(s) ?? 0) + 1);
    bests.push(best);
  }
  const differs = bests.some((a, i) => bests.slice(i + 1).some((b) => ![...a].some((s) => b.has(s))));
  const counts = [...tally].sort(([sa, a], [sb, b]) => b - a || sa.localeCompare(sb)).map(([s, n]) => `${s} ${n}`).join(', ');
  const text = `best style ${differs ? 'differs' : 'never differs'} across ${by.size} packings (best in: ${counts || 'none'}; ties count for each)`
    + (lost.length ? `, never home in time: ${lost.join(', ')}` : ', every packing home in time at least once');
  const fewest = perStyle.size ? Math.min(...perStyle.values()) : 0;
  if (fewest < BALANCE.minRuns) return { rule: PACKING_RULE.id, ok: true, text: `${text} (not checked: ${fewest} runs per style, needs ${BALANCE.minRuns})` };
  return { rule: PACKING_RULE.id, ok: differs && !lost.length, text };
}

/** One pick on a card, the hours left when it was made, and whether its run got home in time, for rule 12. */
export interface TimedPick { card: string; pick: string; hours: number; home: boolean }

/** Rule 12 only compares picks made at least this often on that side of the card's split. */
export const MIN_TIMED_PICKS = 20;

export const HOURS_RULE = { id: 12, name: 'for at least one card, the answer that gets home in time most often differs between many and few hours left' } as const;

/**
 * Rule 12: the best choice changes with time. Per card, the picks are split at
 * the median hours left: many is above it, few is at it or below. On each side
 * the best answer is the one with the highest homeInTime share among answers
 * picked at least MIN_TIMED_PICKS times (a tie on top gives no best). A card
 * counts when both sides have a best and they differ. `runsPerStyle` gates it
 * like rules 7-10.
 */
export function hoursSummary(picks: readonly TimedPick[], runsPerStyle: number): Summary {
  const by = new Map<string, TimedPick[]>();
  for (const p of picks) by.set(p.card, [...(by.get(p.card) ?? []), p]);
  const bestOf = (side: TimedPick[]): string | undefined => {
    const t = new Map<string, { won: number; played: number }>();
    for (const p of side) {
      const x = t.get(p.pick) ?? { won: 0, played: 0 };
      t.set(p.pick, { won: x.won + (p.home ? 1 : 0), played: x.played + 1 });
    }
    const ranked = [...t].filter(([, x]) => x.played >= MIN_TIMED_PICKS).map(([pick, x]) => ({ pick, rate: x.won / x.played }))
      .sort((a, b) => b.rate - a.rate);
    if (!ranked.length || (ranked.length > 1 && ranked[0].rate === ranked[1].rate)) return undefined;
    return ranked[0].pick;
  };
  const turns: string[] = [];
  for (const [card, list] of [...by].sort(([a], [b]) => a.localeCompare(b))) {
    const hours = list.map((p) => p.hours).sort((a, b) => a - b);
    const median = hours[(hours.length - 1) >> 1];
    const many = bestOf(list.filter((p) => p.hours > median));
    const few = bestOf(list.filter((p) => p.hours <= median));
    if (many && few && many !== few) turns.push(`${card}: ${many} with more than ${median} h, ${few} with ${median} h or less`);
  }
  const text = `best answer changes with hours left on ${turns.length} of ${by.size} cards`
    + (turns.length ? ` (${turns.slice(0, 3).join('; ')}${turns.length > 3 ? '; ...' : ''})` : '');
  if (runsPerStyle < BALANCE.minRuns) return { rule: HOURS_RULE.id, ok: true, text: `${text} (not checked: ${runsPerStyle} runs per style, needs ${BALANCE.minRuns})` };
  return { rule: HOURS_RULE.id, ok: turns.length > 0, text };
}

/** An inspection, or an encounter card that is not routine. */
const escalating = (id: string) => INSPECTION_BY_ID.has(id) || ENCOUNTER_BY_ID.get(id)?.kind !== 'routine';

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
    name: 'a clarify or contradiction card needs both the claim and the fact that catches it',
    check: (tr) => {
      const out: ReturnType<Rule['check']> = [];
      for (const h of tr.happenings) {
        const pairs = h.type === 'cardDealt' ? CATCHES[h.id] : undefined;
        if (h.type !== 'cardDealt' || !pairs) continue;
        if (pairs.some(([c, f]) => h.claims.includes(c) && h.facts.includes(f))) continue;
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
  {
    id: 6,
    name: `no more than ${MAX_ESCALATIONS} escalating cards (related, follow-up, inspection) in a row while a routine card was left`,
    check: (tr) => {
      const out: ReturnType<Rule['check']> = [];
      let row = 0;
      for (const h of tr.happenings) {
        if (h.type !== 'cardDealt') continue;
        if (!escalating(h.id)) { row = 0; continue; }
        row++;
        if (row > MAX_ESCALATIONS && h.routinesLeft.length)
          out.push({ step: h.step, key: h.id, detail: `escalating card ${row} in a row with ${h.routinesLeft.join(', ')} still to ask` });
      }
      return out;
    },
  },
  ...BALANCE_RULES,
];

/** A failure already filed elsewhere. It still counts, but does not fail the command. */
export interface KnownFailure {
  rule: number;
  key: string;
  character?: CharacterId;
  /** Rule 4 only: covers runs estimated at this many minutes or more, so a run that gets shorter still fails. */
  atLeastMinutes?: number;
  /** The level it fails in. Unset: Arrival (tools/eval.ts). */
  level?: LevelId;
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
  /** Whole-eval checks. One that is not ok fails the command. Rule 4's median full run is only reported. */
  summaries: Summary[];
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
  const summaries: Summary[] = [];
  for (const r of rules) {
    const sum = r.summary?.(transcripts);
    if (sum) summaries.push({ rule: r.id, ...sum });
  }
  return {
    runs: transcripts.length,
    byRule,
    fresh,
    known: known.map((entry, i) => ({ entry, count: counts[i] })),
    summaries,
    exitCode: fresh.length || stale || summaries.some((x) => !x.ok) ? 1 : 0,
  };
}

export const formatSummary = (x: Summary) => `rule ${x.rule}: ${x.text}`;

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
