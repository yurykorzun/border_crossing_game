// Departure quotes only what you chose to say (border_crossing_game-dap.42). Found on the live
// site after dap.36: at Arrival Lena answered the stay question "Until my father is out of
// hospital", the reaction said Checks out: "Back for family", and Departure's "Your file" and
// first question then quoted "My family needs me here", a line she never said. Same pass: a
// Departure inspection said "Not verified yet: why you came back" after that point was checked,
// and "Do you have any other relatives here?" sat under "Confirmed: Your cash, counted."
import { describe, expect, it } from 'vitest';
import { setStory, t } from '../i18n';
import { BOT_STYLES, playRun } from './bots';
import { fileOf } from './carry';
import { caughtLine, fileLine, recordLines } from './consequence';
import { CHALLENGES, ENCOUNTER_BY_ID } from './content/encounters';
import { FIRST_RUN } from './content/world';
import {
  answerKey, caught, chooseAction, currentCard, inspectionIssue, knownLine, legalActions, newRun, optionFor, options, pointVerified, step,
} from './engine';
import type { RunSetup } from './engine';
import { scriptedDealer } from './play';
import type { Dealer } from './rng';
import type { Action, CarriedFile, FactId, RunState } from './types';
import { allSetups } from './walk';

/** What a quote holds once its quotes and closing stop are off: "Until my father is out of hospital". */
const bare = (text: string) => text.replace(/^"|"$/g, '').replace(/[.?!]$/, '');
/** Every quoted span in a line. */
const quotes = (line: string) => [...line.matchAll(/"([^"]+)"/g)].map((m) => bare(m[1]));
const render = (l: { key: string; vars?: Record<string, string> } | undefined) => (l ? t(l.key, l.vars) : '');

/** The answer `a` as it read on screen, when it is one. */
function labelOf(s: RunState, a: Action): string | undefined {
  if (a.type !== 'choose' || (s.screen.kind !== 'encounter' && s.screen.kind !== 'inspection')) return undefined;
  const o = optionFor(s, a);
  if (!o || o.documents || o.blocked) return undefined;
  const vars: Record<string, string> = {};
  if (o.card) vars.card = vars.cardThe = o.card;
  if (o.contact) vars.contact = vars.contactMine = o.contact;
  return bare(t(answerKey(s, o.approach.id, 'label'), vars));
}

/** The facts the interview card on screen asks about: its own list, or the fact a challenge caught. */
function asked(s: RunState): FactId[] | undefined {
  if (s.screen.kind !== 'encounter') return undefined;
  const id = s.screen.id;
  if ((CHALLENGES as readonly string[]).includes(id)) {
    const c = caught(s, id);
    return c && [c.fact];
  }
  return ENCOUNTER_BY_ID.get(id)?.asks;
}

/** How often the sweep reached each case it is about, so a pass is not an empty one. */
const reached = { verifiedIssue: 0, askedFact: 0 };

/** The problems on one screen: an issue line naming a checked point, an interview line about something else. */
function screenProblems(s: RunState, where: string): string[] {
  const bad: string[] = [];
  const [part] = knownLine(s);
  if (s.screen.kind === 'inspection') {
    const issue = inspectionIssue(s);
    // Checked at some desk, whether or not a later flag opened it again.
    const checked = !!issue && (!!s.verified?.[issue] || pointVerified(s, issue));
    if (checked) reached.verifiedIssue++;
    if (issue && part?.key === `insp.issue.${issue}` && checked) bad.push(`${where}: "${render(part)}" with ${issue} verified`);
  }
  const asks = asked(s);
  const card = s.screen.kind === 'encounter' ? ENCOUNTER_BY_ID.get(s.screen.id) : undefined;
  if (card?.checkpoint === 'interview' && asks && part?.key.startsWith('known.fact.')) reached.askedFact++;
  if (card?.checkpoint === 'interview' && asks && part?.key.startsWith('known.fact.') && !asks.includes(part.vars!.fact as FactId))
    bad.push(`${where}: ${card.id} asks about ${asks.join('/')} under "${render(part)}"`);
  return bad;
}

/**
 * Plays Arrival then Departure and returns what Departure quoted that was not an answer
 * chosen in the run, plus the screen problems on the way. `arrival` drives the first crossing.
 */
function sweep(pick: number, setup: RunSetup, arrival: Action[], departure: (d: RunSetup) => Action[], label: string, deal?: Dealer): { bad: string[]; quoted: number } {
  const bad: string[] = [];
  const chosen = new Set<string>();
  let s = newRun(setup);
  for (const a of arrival) {
    bad.push(...screenProblems(s, `${label} arrival`));
    const l = labelOf(s, a);
    if (l) chosen.add(l);
    s = step(s, a, deal);
  }
  if (!s.ending) return { bad, quoted: 0 };
  const file = fileOf(s);
  let quoted = 0;
  const check = (where: string, line: string) => {
    for (const q of quotes(line)) {
      quoted++;
      if (!chosen.has(q)) bad.push(`${label} ${where}: "${q}" was never chosen (chose: ${[...chosen].join(' | ')})`);
    }
  };
  for (const l of recordLines(file)) check('Your file', render(l));
  const out = allSetups('departure').filter((d) => d.character === file.character);
  const next: RunSetup = { ...out[(setup.seed + pick) % out.length], seed: setup.seed, file: file as CarriedFile };
  setStory('departure');
  try {
    let d = newRun(next);
    const look = (x: RunState) => {
      bad.push(...screenProblems(x, `${label} departure`));
      if (x.screen.kind !== 'encounter' || x.reaction) return;
      check(`${x.screen.id} file line`, render(fileLine(x, x.screen.id)));
      check(`${x.screen.id} caught line`, render(caughtLine(x, x.screen.id)));
    };
    look(d);
    for (const a of departure(next)) {
      const l = labelOf(d, a);
      const before = d.log.length;
      d = step(d, a, deal);
      if (l) chosen.add(l);
      for (const e of d.log.slice(before)) if (e.key.startsWith('spot.')) check(`reaction ${e.key}`, t(e.key, e.vars));
      look(d);
    }
  } finally {
    setStory(undefined);
  }
  return { bad, quoted };
}

describe('Departure quotes only answers you chose', () => {
  it('over Arrival then Departure for seeds 1-10 and every bot style', () => {
    const setups = allSetups('arrival');
    const bad: string[] = [];
    let quoted = 0;
    let runs = 0;
    for (let seed = 1; seed <= 10; seed++)
      BOT_STYLES.forEach((style, k) => {
        setups.forEach((base, i) => {
          const setup = { ...base, seed };
          const where = `${style} seed ${seed} ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin}`;
          const r = sweep(i + k, setup, playRun(style, setup).actions, (d) => playRun(style, d).actions, where);
          bad.push(...r.bad);
          quoted += r.quoted;
          runs++;
        });
      });
    expect(bad.slice(0, 10)).toEqual([]);
    expect(runs).toBeGreaterThan(1000);
    expect(quoted).toBeGreaterThan(0);
    expect(reached.verifiedIssue).toBeGreaterThan(0);
    expect(reached.askedFact).toBeGreaterThan(0);
  }, 300_000);
});

const dealer = scriptedDealer([]);

/** The actions of a run where `picks` answers the cards it names (a document by its id), every other screen its first legal action. */
function drive(setup: RunSetup, picks: Record<string, string>): Action[] {
  const actions: Action[] = [];
  let s = newRun(setup);
  for (let i = 0; i < 200 && !s.ending; i++) {
    const card = s.reaction ? null : currentCard(s);
    const pick = card && picks[card.id];
    const answer = pick && options(s).find((o) => !o.blocked && (o.approach.id === pick || o.card === pick));
    const doc = answer && answer.card === pick ? { type: 'choose' as const, approach: answer.approach.id, card: answer.card } : undefined;
    const next = doc ?? (answer ? chooseAction(answer) : legalActions(s).find((a) => a.type !== 'turnBack') ?? legalActions(s)[0]);
    actions.push(next);
    s = step(s, next, dealer);
  }
  return actions;
}

describe('"Until my father is out of hospital" at Arrival', () => {
  const setup: RunSetup = { level: 'arrival', character: 'lena', loadout: [...FIRST_RUN.loadout], bulletin: 'records', seed: 3 };
  const actions = drive(setup, { p_purpose: 'motherLetter', p_stay: 'father' });
  let s = newRun(setup);
  for (const a of actions) s = step(s, a, dealer);

  it('is what Your file and the first Departure question quote', () => {
    expect(s.seen).toContain('p_stay');
    const file = fileOf(s);
    const record = recordLines(file).map(render).join('\n');
    expect(record).toContain('"Until my father is out of hospital"');
    expect(record).not.toContain('My family needs me here');
    setStory('departure');
    try {
      const loadout = allSetups('departure').find((x) => x.character === 'lena')!.loadout;
      let d = newRun({ level: 'departure', character: 'lena', loadout, bulletin: 'records', seed: 3, file });
      for (let i = 0; i < 10 && d.screen.kind !== 'encounter'; i++) d = step(d, legalActions(d)[0], dealer);
      expect(d.screen).toMatchObject({ kind: 'encounter', id: 'd_entry' });
      const line = render(fileLine(d, 'd_entry'));
      expect(line).toContain('Asked how long you would stay: "Until my father is out of hospital"');
      expect(line).not.toContain('My family needs me here');
    } finally {
      setStory(undefined);
    }
  });

  it('never puts the claim label in quotes as a reaction', () => {
    const spot = s.log.filter((e) => e.key.startsWith('spot.')).map((e) => t(e.key, e.vars));
    for (const line of spot) expect(line).not.toContain('"Back for family"');
  });

  it('passes the sweep: every Departure quote is an answer chosen', () => {
    const r = sweep(0, setup, actions, (d) => drive(d, {}), 'first run, father', dealer);
    expect(r.bad).toEqual([]);
    expect(r.quoted).toBeGreaterThan(0);
  });
});

describe('an act is never quoted as words', () => {
  it("giving your mother's address for where you stay says you gave it", () => {
    const setup: RunSetup = { level: 'arrival', character: 'lena', loadout: ['deed', 'employerLetter', 'returnTicket'], bulletin: 'customs', seed: 2 };
    let s = newRun(setup);
    for (const a of drive(setup, { p_purpose: 'shortTrip', p_host: 'mother' })) s = step(s, a, dealer);
    const file = fileOf(s);
    const record = recordLines(file).map(render).join('\n');
    expect(record).toContain("you gave your mother's address");
    expect(record).not.toContain('I am staying with my mother');
    expect(record).not.toContain('My family needs me here');
  });
});

describe('interview cards that ask about relatives name a relative on file, or nothing', () => {
  it('every interview card that asks about facts lists them, and calm ones ask nothing', () => {
    for (const [id, card] of ENCOUNTER_BY_ID) {
      if (card.checkpoint !== 'interview' || card.calm || (CHALLENGES as readonly string[]).includes(id)) continue;
      expect(card.asks?.length, id).toBeGreaterThan(0);
    }
  });
});
