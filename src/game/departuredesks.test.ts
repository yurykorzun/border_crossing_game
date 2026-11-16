// Departure desks say only what the file holds (border_crossing_game-dap.46). Found on the
// live site after PR #57: "On your entry form: your hotel booking." with no hotel answer and
// "Give your mother's address" taken with no word about the difference; "Nothing on file
// about this yet." on the employer question after Arrival's contract check noted the
// employer; "Call to passport control" offered at passport control; "Nobody left to name"
// with Ilya never named; a card at "Scrutiny +2" that the ending counted as 1; the
// supervisor's reaction labelled OFFICER; "already confirmed at passport" for a hotel
// booking; and "Old records: Your family address." right after the address was given.
import { describe, expect, it } from 'vitest';
import { setStory, t } from '../i18n';
import { BOT_STYLES, playRun } from './bots';
import { defaultFile, fileOf } from './carry';
import { caughtLine, consequence, fileLine } from './consequence';
import { ENCOUNTER_BY_ID, CHALLENGES } from './content/encounters';
import { CHARACTERS } from './content/world';
import {
  answerKey, chooseAction, currentCard, legalActions, deskOf, documentsOf, factIds, fileStayed, formDiffers, knownLine, newRun, optionFor, options, speakerOf, topicOf,
} from './engine';
import type { Option, RunSetup } from './engine';
import { playStep } from './play';
import { scriptedDealer } from './play';
import type { Action, FactId, RunState } from './types';
import { CHECKPOINTS } from './types';
import { allSetups } from './walk';

const render = (l: { key: string; vars?: Record<string, string> } | undefined) => (l ? t(l.key, l.vars) : '');
const cardOf = (s: RunState) => (s.screen.kind === 'encounter' ? s.screen.id : undefined);

/** The line under an answer, as the player reads it, with the run's clock. */
function partsOf(s: RunState, o: Option) {
  const key = answerKey(s, o.approach.id, 'label').replace(/\.label$/, '');
  return consequence(o, key, CHARACTERS[s.character].protectedContact, deskOf(s), s).parts;
}
const shownScrutiny = (s: RunState, o: Option) => partsOf(s, o).reduce((n, p) => n + (p.kind === 'scrutiny' ? Number(p.vars?.n) : 0), 0);
const costs = (s: RunState, n: RunState) => s.time - n.time + Math.max(0, n.scrutiny - s.scrutiny);

/** What the entry form says on cash (d_declared), and the answer that agrees with it. */
const DECLARED: Record<string, { agrees: string; differs: string }> = { under: { agrees: 'under', differs: 'count' }, counted: { agrees: 'count', differs: 'under' } };

/** How often each check met its case, so a pass is not an empty one. */
const reached: Record<string, number> = {};
const hit = (k: string) => { reached[k] = (reached[k] ?? 0) + 1; };

/** Every answer on screen, documents behind a "Show a document" row opened. */
const answersOn = (s: RunState): Option[] => options(s).flatMap((o) => (o.documents ? documentsOf(s, o) : [o]));

/** The problems on a screen with nothing chosen yet. */
function screenProblems(s: RunState, old: readonly FactId[], where: string): string[] {
  // With the document list open only its documents show; the card's answers are checked with it closed.
  if (s.reaction || s.ending || s.documentList || (s.screen.kind !== 'encounter' && s.screen.kind !== 'inspection')) return [];
  const bad: string[] = [];
  const id = cardOf(s);
  const desk = deskOf(s);
  // An entry-form fact has an answer that matches it, and saying another is caught.
  const form = id ? fileLine(s, id) : undefined;
  if (id && form && /^(On your entry form|Kept from)/.test(render(form))) {
    hit('form');
    const open = answersOn(s).filter((o) => !o.blocked);
    if (id === 'd_stayed') {
      const stayed = fileStayed(s.file);
      if (!open.some((o) => !formDiffers(s, o.approach, o.card))) bad.push(`${where} ${id}: no answer matches "${render(form)}"`);
      if (stayed === 'hotel' && !open.some((o) => o.approach.stayed === 'hotel' || o.card === 'hotel')) bad.push(`${where} ${id}: "${render(form)}" and no hotel answer`);
      for (const o of open.filter((x) => formDiffers(s, x.approach, x.card))) {
        hit('form differs');
        const n = playStep(s, chooseAction(o), scriptedDealer([]));
        const said = (n.reaction ?? []).map((l) => l.key);
        if (!costs(s, n) || !said.includes(`form.differs.${stayed}`)) bad.push(`${where} ${id}: ${o.approach.id}${o.card ? ` ${o.card}` : ''} against "${render(form)}" not caught (${said.join(', ')})`);
      }
    } else if (id === 'd_declared' && s.file?.declared && DECLARED[s.file.declared]) {
      const d = DECLARED[s.file.declared];
      if (!open.some((o) => o.approach.id === d.agrees)) bad.push(`${where} ${id}: no answer matches "${render(form)}"`);
      const o = open.find((x) => x.approach.id === d.differs);
      if (o) {
        hit('declared differs');
        const n = playStep(s, chooseAction(o), scriptedDealer([]));
        const said = (n.reaction ?? []).map((l) => l.key);
        if (!costs(s, n) || !said.some((k) => k.includes(`.file.${s.file!.declared}.`))) bad.push(`${where} ${id}: ${o.approach.id} against "${render(form)}" not caught (${said.join(', ')})`);
      }
    } else if (!open.length) bad.push(`${where} ${id}: no answer at all under "${render(form)}"`);
  }
  // "Nothing on file" only where the record you carry does not hold what the card asks.
  const [known] = knownLine(s);
  if (id && known?.key === 'known.asked.none') {
    const card = ENCOUNTER_BY_ID.get(id);
    const asks = (CHALLENGES as readonly string[]).includes(id) ? [] : card?.asks ?? [];
    const held = asks.filter((f) => s.file?.facts?.includes(f));
    if (held.length) bad.push(`${where} ${id}: "Nothing on file" with ${held.join('/')} on the file from your last crossing`);
  }
  if (known?.key === 'known.file') hit('known file');
  // "Old records" only for a fact on file before the run began.
  for (const line of [known, id ? caughtLine(s, id) : undefined])
    if (line && /^(known\.fact|caught\.line)\.recorded/.test(line.key)) {
      hit('old records');
      const f = line.vars!.fact as FactId;
      if (!old.includes(f)) bad.push(`${where} ${id}: "${render(line)}" though ${f} came out on this crossing`);
    }
  for (const o of options(s)) {
    for (const p of partsOf(s, o)) {
      // No call to the desk you are at.
      if (p.key === 'ui.line.event') {
        const ev = t(String(p.vars!.event));
        const called = /^Call to (.+)$/.exec(ev)?.[1].toLowerCase();
        if (called) hit('call');
        if (called && (called === t(`checkpoint.${desk}`).toLowerCase() || called === t(`checkpoint.${desk}.at`).toLowerCase()))
          bad.push(`${where} ${id ?? s.screen.kind}: "${ev}" offered at ${desk}`);
      }
      // "Nobody left to name" only when every contact is named.
      if (p.key === 'ui.blocked.noContact' && !CHARACTERS[s.character].contacts.every((c) => s.exposed.includes(c)))
        bad.push(`${where} ${id}: "Nobody left to name" with ${CHARACTERS[s.character].contacts.filter((c) => !s.exposed.includes(c)).join('/')} never named`);
      if (p.key === 'ui.blocked.noOther') hit('no other');
    }
  }
  return bad;
}

/** The problems a move made: who the reaction is from, and what it says was confirmed where. */
function moveProblems(s: RunState, n: RunState, a: Action, where: string): string[] {
  if (!n.reaction || a.type !== 'choose' || (s.screen.kind !== 'encounter' && s.screen.kind !== 'inspection')) return [];
  const bad: string[] = [];
  // The supervisor's answer is hers, the desk's is the officer's.
  const by = s.screen.kind === 'inspection' ? 'inspection' : deskOf(s);
  if (s.screen.kind === 'inspection') hit('inspection reaction');
  if (speakerOf(n) !== by) bad.push(`${where}: a reaction to ${s.screen.id} labelled ${t(`officer.${speakerOf(n)}`)}, said by ${t(`officer.${by}`)}`);
  const topic = topicOf(currentCard(s));
  for (const l of n.reaction) {
    const text = t(l.key, l.vars);
    const at = /already (?:confirmed|checked) at (.+?) and/.exec(text)?.[1];
    if (!at) continue;
    hit('already confirmed');
    const v = topic && s.verified?.[topic];
    if (!v || at !== t(`checkpoint.${v.desk}.at`)) bad.push(`${where}: "${text}" but ${topic} was verified at ${v?.desk ?? 'no desk'}`);
    if (v && /the address/.test(text) && v.by === 'hotel') bad.push(`${where}: "${text}" but the hotel booking settled it`);
  }
  return bad;
}

/** Plays `actions` from `setup`, checking every screen and move. Returns the end state and the problems. */
function sweep(setup: RunSetup, actions: Action[], where: string): { s: RunState; bad: string[] } {
  let s = newRun(setup);
  const old = factIds(s);
  const bad = screenProblems(s, old, where);
  // The scrutiny each answer's line showed, by its place in RunState.answers.
  const shown: number[] = [];
  for (const a of actions) {
    const o = a.type === 'choose' && (s.screen.kind === 'encounter' || s.screen.kind === 'inspection') ? optionFor(s, a) : undefined;
    const count = (s.answers ?? []).length;
    const n = playStep(s, a);
    if (o && !o.documents && (n.answers ?? []).length > count) shown[count] = shownScrutiny(s, o);
    bad.push(...moveProblems(s, n, a, where));
    s = n;
    bad.push(...screenProblems(s, old, where));
  }
  // The ending's "Scrutiny up by n" for each answer is what its line showed.
  (s.answers ?? []).forEach((x, i) => {
    if (shown[i] === undefined) return;
    if (x.scrutiny) hit('scrutiny');
    if (x.scrutiny !== shown[i]) bad.push(`${where}: ${x.card} ${x.pick} showed Scrutiny +${shown[i]}, the ending says up by ${x.scrutiny}`);
  });
  return { s, bad };
}

describe('Departure desks say only what the file holds', () => {
  it('over Arrival then Departure, and standalone Departure, for seeds 1-10 and every bot style', () => {
    const bad: string[] = [];
    let runs = 0;
    for (let seed = 1; seed <= 10; seed++)
      BOT_STYLES.forEach((style, k) => {
        allSetups('arrival').forEach((base, i) => {
          const setup = { ...base, seed };
          const where = `${style} seed ${seed} ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin}`;
          const arrival = sweep(setup, playRun(style, setup).actions, `${where} arrival`);
          bad.push(...arrival.bad);
          runs++;
          if (!arrival.s.ending) return;
          const file = fileOf(arrival.s);
          const out = allSetups('departure').filter((d) => d.character === file.character);
          const next: RunSetup = { ...out[(seed + i + k) % out.length], seed, file };
          setStory('departure');
          try {
            bad.push(...sweep(next, playRun(style, next).actions, `${where} then departure ${next.loadout.join('+')}`).bad);
          } finally {
            setStory(undefined);
          }
          runs++;
        });
        setStory('departure');
        try {
          for (const base of allSetups('departure')) {
            const setup: RunSetup = { ...base, seed, file: defaultFile(seed, base.character) };
            bad.push(...sweep(setup, playRun(style, setup).actions, `${style} seed ${seed} standalone ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin}`).bad);
            runs++;
          }
        } finally {
          setStory(undefined);
        }
      });
    expect(bad.slice(0, 10)).toEqual([]);
    expect(runs).toBeGreaterThan(3000);
    for (const k of ['form', 'form differs', 'declared differs', 'known file', 'old records', 'call', 'no other', 'inspection reaction', 'already confirmed', 'scrutiny'])
      expect(reached[k] ?? 0, k).toBeGreaterThan(0);
  }, 600_000);
});

describe('the cases found on the live site', () => {
  const dealer = scriptedDealer([]);
  /** Plays to card `stop`, answering cards in `picks` by approach (or [approach, document]), else the first legal answer. */
  function playTo(setup: RunSetup, picks: Record<string, string | [string, string]>, stop: string): RunState {
    let s = newRun(setup);
    for (let i = 0; i < 200 && !s.ending; i++) {
      const card = s.reaction ? null : currentCard(s);
      if (card?.id === stop) return s;
      if (s.ending && stop === 'end') return s;
      const pick = card && picks[card.id];
      const [approach, doc] = Array.isArray(pick) ? pick : [pick, undefined];
      const o = approach && answersOn(s).find((x) => !x.blocked && x.approach.id === approach && (!doc || x.card === doc));
      s = playStep(s, o ? chooseAction(o) : legalActions(s).find((a) => a.type !== 'turnBack' && !(a.type === 'choose' && optionFor(s, a)?.documents)) ?? legalActions(s)[0], dealer);
    }
    if (s.ending && stop === 'end') return s;
    throw new Error(`never reached ${stop}`);
  }

  it('the hotel on the entry form: a hotel answer, and her address is checked against it', () => {
    const arrival = playTo({ level: 'arrival', character: 'lena', loadout: ['hotel', 'employerLetter', 'returnTicket'], bulletin: 'customs', seed: 1 }, { p_host: ['evidence', 'hotel'] }, 'end');
    const file = fileOf(arrival);
    expect(fileStayed(file)).toBe('hotel');
    setStory('departure');
    try {
      const s = playTo({ level: 'departure', character: 'lena', loadout: ['motherLetter', 'employerLetter', 'deed'], bulletin: 'customs', seed: 1, file }, {}, 'd_stayed');
      expect(render(fileLine(s, 'd_stayed'))).toBe('On your entry form: your hotel booking.');
      const hotel = options(s).find((o) => o.approach.id === 'hotel')!;
      expect(t(answerKey(s, 'hotel', 'label'))).toBe('"At the hotel on my entry form."');
      expect(shownScrutiny(s, hotel) + (s.time - playStep(s, chooseAction(hotel), dealer).time)).toBe(0);
      const mother = options(s).find((o) => o.approach.id === 'mother')!;
      const n = playStep(s, chooseAction(mother), dealer);
      expect(s.time - n.time).toBe(1);
      expect(n.reaction!.map((l) => t(l.key, l.vars))).toContain('Your entry form says a hotel, so she checks the difference against your entry record.');
    } finally {
      setStory(undefined);
    }
  });

  it("Arrival's employer on file is read at Departure's employer question", () => {
    const file = { ...defaultFile(1, 'lena'), facts: ['employer' as FactId] };
    setStory('departure');
    try {
      const s = playTo({ level: 'departure', character: 'lena', loadout: ['motherLetter', 'hotel', 'deed'], bulletin: 'customs', seed: 1, file }, {}, 'i_employer');
      expect(render(knownLine(s)[0])).toBe('From your last crossing: Your employer.');
    } finally {
      setStory(undefined);
    }
  });

  it('every desk has a name to use inside a sentence', () => {
    expect(CHECKPOINTS.map((d) => t(`checkpoint.${d}.at`))).toEqual(['passport control', 'customs', 'the security interview']);
  });
});
