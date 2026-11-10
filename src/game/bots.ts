// Autoplay bots. Each style picks one of legalActions() at every step, so a bot
// can never do what a player could not. Used by `npm run autoplay` (balance and
// story checks without a human) and by the app's ?autoplay=<style> mode.
//
// A bot keeps its own random stream (botRng), separate from the run's, so the
// random style never moves the dealer's picks.

import { DISPROOFS, INCONSISTENCIES } from './content/encounters';
import { CHARACTERS } from './content/world';
import { legalActions, newRun, noCost, options, step, travelOf } from './engine';
import type { Option, RunSetup } from './engine';
import { nextRandom } from './rng';
import type { Action, ClaimId, EndingId, FactId, RunState } from './types';
import { CHECKPOINTS } from './types';
import { allSetups, outcomes } from './walk';

export type BotStyle = 'honest' | 'liar' | 'cautious' | 'random' | 'situational';
export const BOT_STYLES: readonly BotStyle[] = ['honest', 'liar', 'cautious', 'random', 'situational'];

export const isBotStyle = (x: unknown): x is BotStyle => BOT_STYLES.includes(x as BotStyle);

/** Claims that are not true for anyone in this mission. */
const LIES: readonly ClaimId[] = ['tourism', 'hotelStay', 'noOtherFamily', 'neverDonated', 'cashUnderLimit'];
/** Lies that hide the family visit, the liar's whole story. */
const HIDES_FAMILY: readonly ClaimId[] = ['tourism', 'hotelStay', 'noOtherFamily'];
/** Say-approaches that are untrue without adding a claim (deny the photo). */
const LYING_SAYS = new Set(['deny']);

/** Hard cap on steps in one run; a run that hits it is a bug, not a result. */
export const MAX_RUN_STEPS = 200;

interface Traits {
  time: number;
  scrutiny: number;
  lies: number;
  hides: number;
  revealsFamily: boolean;
  losesMedicine: boolean;
  exposesProtected: boolean;
  contact: boolean;
  withdraw: boolean;
}

function traits(s: RunState, o: Option): Traits {
  const t: Traits = {
    time: 0, scrutiny: 0, lies: 0, hides: 0, revealsFamily: false, losesMedicine: false,
    exposesProtected: o.contact === CHARACTERS[s.character].protectedContact,
    contact: !!o.contact, withdraw: o.approach.kind === 'withdraw',
  };
  for (const e of o.effects) {
    if ('time' in e) t.time -= e.time;
    else if ('scrutiny' in e) t.scrutiny += e.scrutiny;
    // An hour more on the trip is an hour less to spare.
    else if ('travel' in e) t.time += e.travel;
    else if ('claim' in e) {
      if (s.claims.includes(e.claim)) continue;
      if (LIES.includes(e.claim)) t.lies++;
      if (HIDES_FAMILY.includes(e.claim)) t.hides++;
      if (e.claim === 'familyVisit') t.revealsFamily = true;
    } else if ('fact' in e) {
      if (e.fact === 'familyAddress' || e.fact === 'fatherCondition') t.revealsFamily = true;
    } else if ('loseMedicine' in e) t.losesMedicine = true;
  }
  // A deny that already added a lie claim (i_family, f_donation) is that one lie, not two.
  if (o.approach.kind === 'say' && LYING_SAYS.has(o.approach.id) && t.lies === 0) t.lies++;
  return t;
}

const KIND_RANK = { evidence: 0, perk: 0, verify: 1, contact: 2, say: 3, withdraw: 9 } as const;

/** Lower is better. Ties go to the option listed first, so every pick is deterministic. */
const SCORE: Record<'honest' | 'liar' | 'cautious', (s: RunState, o: Option) => number> = {
  // Evidence first, then answers that cost time but are true; never a lie if a true answer exists.
  honest: (s, o) => {
    const t = traits(s, o);
    return KIND_RANK[o.approach.kind] + 10 * t.lies + (t.losesMedicine ? 4 : 0) + (t.exposesProtected ? 3 : 0) + 0.1 * t.time;
  },
  // Hides the family behind tourism and the hotel; keeps contacts out of it; else the cheapest answer.
  liar: (s, o) => {
    const t = traits(s, o);
    return -10 * t.hides + (t.revealsFamily ? 6 : 0) + (t.contact ? 3 : 0) + (t.withdraw ? 50 : 0)
      + (t.losesMedicine ? 4 : 0) + t.time + t.scrutiny;
  },
  // The lowest scrutiny, then the least time, then the plainest kind of answer.
  cautious: (s, o) => {
    const t = traits(s, o);
    return 100 * t.scrutiny + (t.withdraw ? 1000 : 0) + (t.losesMedicine ? 5 : 0) + (t.exposesProtected ? 5 : 0)
      + t.time + 0.1 * KIND_RANK[o.approach.kind];
  },
};

const ENDING_VALUE: Record<EndingId, number> = { homeInTime: 200, homeAtCost: 120, tooLate: 20, turnedBack: 0 };

/**
 * How good a state looks to the situational bot, read only from what the
 * player can see (never the waiting room's hidden result).
 */
export function stateValue(s: RunState): number {
  if (s.ending) return ENDING_VALUE[s.ending] + s.time;
  const ch = CHARACTERS[s.character];
  let v = 10 * (s.time - travelOf(s)) - 6 * s.scrutiny;
  if (!s.medicine) v -= 45;
  if (s.exposed.includes(ch.protectedContact)) v -= 45;
  v += 3 * (ch.contacts.length - s.exposed.length) + 2 * (s.loadout.length - s.used.length);
  // A fact counts while a desk still ahead (or this one) knows it: only they can catch a claim with it.
  const ahead = (f: FactId) => (s.facts[f] ?? []).some((d) => CHECKPOINTS.indexOf(d) >= s.checkpoint);
  const familyOnFile = ahead('familyAddress') || ahead('fatherCondition');
  if (s.claims.includes('tourism') && familyOnFile) v -= 20;
  if (s.claims.includes('noOtherFamily') && ahead('brotherAbroad')) v -= 20;
  if (s.claims.includes('cashUnderLimit') && ahead('cashCount')) v -= 20;
  if (s.screen.kind === 'encounter' && s.screen.id.startsWith('f_')) v -= 8;
  return v;
}

/** Mean value over every card the dealer could deal next, so it does not peek at the seed. */
function lookahead(s: RunState, a: Action): number {
  const all = outcomes(s, a).filter((o) => !o.rejected);
  if (!all.length) return -Infinity;
  return all.reduce((sum, o) => sum + stateValue(o.state), 0) / all.length;
}

export interface BotPick {
  action: Action;
  botRng: number;
}

/** The bot's next action, or null when the run is over. */
export function botAction(style: BotStyle, s: RunState, botRng: number): BotPick | null {
  const legal = legalActions(s);
  if (!legal.length) return null;
  // Told the bus is out of reach, every style finishes the crossing quickly, as a player would.
  const finish = legal.find((a) => a.type === 'finish');
  if (finish) return { action: finish, botRng };
  if (legal.length === 1) return { action: legal[0], botRng };
  if (style === 'random') {
    const r = nextRandom(botRng);
    return { action: legal[Math.floor(r.value * legal.length)], botRng: r.rng };
  }
  if (style === 'situational') return { action: best(legal, (a) => -lookahead(s, a)), botRng };
  if (legal[0].type === 'waitAction') return { action: waitPick(style, legal), botRng };
  const opts = options(s).filter((o) => !o.blocked);
  const scored = best(opts, (o) => SCORE[style](s, o));
  return { action: { type: 'choose', approach: scored.approach.id }, botRng };
}

/** In the waiting room the honest and cautious bots wait it out; the liar asks around. */
function waitPick(style: 'honest' | 'liar' | 'cautious', legal: Action[]): Action {
  const want = style === 'liar' ? 'ask' : 'wait';
  return legal.find((a) => a.type === 'waitAction' && a.action === want) ?? legal[0];
}

function best<T>(list: T[], cost: (x: T) => number): T {
  let pick = list[0];
  let low = cost(pick);
  for (const x of list.slice(1)) {
    const c = cost(x);
    if (c < low) { low = c; pick = x; }
  }
  return pick;
}

/** The setup for run number `i`: cycles every character x packing x bulletin, seed i + 1. */
const SETUPS = allSetups();
export function setupFor(i: number): RunSetup {
  return { ...SETUPS[((i % SETUPS.length) + SETUPS.length) % SETUPS.length], seed: i + 1 };
}

/** The bot's own random stream starts from the run seed, scrambled so it is not the dealer's. */
export const botSeed = (seed: number) => (seed ^ 0x5bd1e995) | 0;

export interface BotRun {
  /** A style, or 'memorised' for a run played from a Script (playScript()). */
  style: BotStyle | 'memorised';
  final: RunState;
  actions: Action[];
  /** Card or inspection id and the approach or wait action picked there, in order. */
  choices: { card: string; pick: string }[];
  /** Answers picked that cost nothing (noCost() in src/game/engine.ts). */
  noCost: number;
  /** Lies told: a new untrue claim, or an untrue answer such as denying the photo (traits() above). */
  lies: number;
  /** Lie claims that a challenge card put to the player (caughtLies()). */
  caught: number;
}

const CHALLENGE_PAIRS: Record<string, readonly (readonly [ClaimId, FactId])[]> = { i_clarify: INCONSISTENCIES, i_contradiction: DISPROOFS };

/**
 * Lie claims the challenge card on screen puts to the player: i_clarify for a
 * claim a fact makes look odd, i_contradiction for one a fact disproves. Read
 * while the card is up, so a lie told after it was answered is not counted as
 * caught. Denying the photo adds no claim, so no card can catch it.
 */
export function caughtLies(s: RunState): ClaimId[] {
  const pairs = s.screen.kind === 'encounter' ? CHALLENGE_PAIRS[s.screen.id] : undefined;
  if (!pairs) return [];
  const onFile = (f: FactId) => (s.facts[f] ?? []).length > 0;
  return pairs.filter(([c, f]) => s.claims.includes(c) && onFile(f)).map(([c]) => c);
}

type Picker = (s: RunState, botRng: number) => BotPick | null;

function playWith(style: BotRun['style'], setup: RunSetup, pickFor: Picker): BotRun {
  let s = newRun(setup);
  let botRng = botSeed(setup.seed);
  const actions: Action[] = [];
  const choices: BotRun['choices'] = [];
  let free = 0;
  let lies = 0;
  const caught = new Set<ClaimId>();
  while (!s.ending) {
    for (const c of caughtLies(s)) caught.add(c);
    if (actions.length >= MAX_RUN_STEPS) throw new Error(`${style} run did not end in ${MAX_RUN_STEPS} steps`);
    const pick = pickFor(s, botRng);
    if (!pick) break;
    const sc = s.screen;
    if (pick.action.type === 'choose' && (sc.kind === 'encounter' || sc.kind === 'inspection')) {
      const id = pick.action.approach;
      choices.push({ card: sc.id, pick: id });
      const o = options(s).find((x) => x.approach.id === id);
      if (o && noCost(s, o)) free++;
      if (o) lies += traits(s, o).lies;
    }
    if (pick.action.type === 'waitAction' && sc.kind === 'wait') choices.push({ card: sc.check, pick: pick.action.action });
    s = step(s, pick.action);
    botRng = pick.botRng;
    actions.push(pick.action);
  }
  return { style, final: s, actions, choices, noCost: free, lies, caught: caught.size };
}

export function playRun(style: BotStyle, setup: RunSetup): BotRun {
  return playWith(style, setup, (s, botRng) => botAction(style, s, botRng));
}

// ── The memorised script: a harsher probe than the styles above.
// It reads no state. Per card id it always gives the one answer that won most
// often in a first pass, the way a player who learned the game by heart would.

/** Card or waiting-room check id to the answer given there. */
export type Script = ReadonlyMap<string, string>;

/**
 * For each card, the pick with the best homeInTime rate across `runs`. The rate
 * is smoothed ((won + 1) / (played + 2)) so a pick seen once does not beat one
 * seen a hundred times; ties go to the pick played more, then by name.
 */
export function buildScript(runs: readonly BotRun[]): Script {
  const tally = new Map<string, Map<string, { won: number; played: number }>>();
  for (const r of runs) {
    const win = r.final.ending === 'homeInTime' ? 1 : 0;
    for (const c of r.choices) {
      const card = tally.get(c.card) ?? new Map<string, { won: number; played: number }>();
      const t = card.get(c.pick) ?? { won: 0, played: 0 };
      card.set(c.pick, { won: t.won + win, played: t.played + 1 });
      tally.set(c.card, card);
    }
  }
  const rate = (t: { won: number; played: number }) => (t.won + 1) / (t.played + 2);
  const script = new Map<string, string>();
  for (const [card, picks] of tally) {
    const ranked = [...picks].sort(([pa, a], [pb, b]) => rate(b) - rate(a) || b.played - a.played || pa.localeCompare(pb));
    script.set(card, ranked[0][0]);
  }
  return script;
}

/** The first pass: every style over setups seed..seed + runs - 1, the ones autoplay plays. */
export function firstPassScript(runs: number, seed = 0): Script {
  const pass: BotRun[] = [];
  for (const style of BOT_STYLES) for (let i = 0; i < runs; i++) pass.push(playRun(style, setupFor(seed + i)));
  return buildScript(pass);
}

/** The memorised answer for this card when it is open, else the first open one. Never reads anything but the card id. */
export function scriptAction(script: Script, s: RunState): Action | null {
  const legal = legalActions(s);
  if (!legal.length) return null;
  const finish = legal.find((a) => a.type === 'finish');
  if (finish) return finish;
  const sc = s.screen;
  const card = sc.kind === 'encounter' || sc.kind === 'inspection' ? sc.id : sc.kind === 'wait' ? sc.check : undefined;
  const want = card === undefined ? undefined : script.get(card);
  return legal.find((a) => (a.type === 'choose' && a.approach === want) || (a.type === 'waitAction' && a.action === want))
    ?? legal[0];
}

export function playScript(script: Script, setup: RunSetup): BotRun {
  return playWith('memorised', setup, (s, botRng) => {
    const action = scriptAction(script, s);
    return action && { action, botRng };
  });
}
