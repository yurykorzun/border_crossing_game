// Autoplay bots. Each style picks one of legalActions() at every step, so a bot
// can never do what a player could not. Used by `npm run autoplay` (balance and
// story checks without a human) and by the app's ?autoplay=<style> mode.
//
// A bot keeps its own random stream (botRng), separate from the run's, so the
// random style never moves the dealer's picks.

import { CHARACTERS } from './content/world';
import { legalActions, newRun, options, step } from './engine';
import type { Option, RunSetup } from './engine';
import { nextRandom } from './rng';
import type { Action, ClaimId, EndingId, RunState } from './types';
import { allSetups, outcomes } from './walk';

export type BotStyle = 'honest' | 'liar' | 'cautious' | 'random' | 'situational';
export const BOT_STYLES: readonly BotStyle[] = ['honest', 'liar', 'cautious', 'random', 'situational'];

export const isBotStyle = (x: unknown): x is BotStyle => BOT_STYLES.includes(x as BotStyle);

/** Claims that are not true for anyone in this mission. */
const LIES: readonly ClaimId[] = ['tourism', 'hotelStay', 'noOtherFamily', 'neverDonated'];
/** Lies that hide the family visit, the liar's whole story. */
const HIDES_FAMILY: readonly ClaimId[] = ['tourism', 'hotelStay', 'noOtherFamily'];
/** Say-approaches that are untrue without adding a claim (deny the photo, under-declare cash). */
const LYING_SAYS = new Set(['deny', 'under']);

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
    else if ('claim' in e) {
      if (s.claims.includes(e.claim)) continue;
      if (LIES.includes(e.claim)) t.lies++;
      if (HIDES_FAMILY.includes(e.claim)) t.hides++;
      if (e.claim === 'familyVisit') t.revealsFamily = true;
    } else if ('fact' in e) {
      if (e.fact === 'familyAddress' || e.fact === 'fatherCondition') t.revealsFamily = true;
    } else if ('loseMedicine' in e) t.losesMedicine = true;
  }
  if (o.approach.kind === 'say' && LYING_SAYS.has(o.approach.id)) t.lies++;
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
  let v = 10 * s.time - 6 * s.scrutiny;
  if (!s.medicine) v -= 45;
  if (s.exposed.includes(ch.protectedContact)) v -= 45;
  v += 3 * (ch.contacts.length - s.exposed.length) + 2 * (s.loadout.length - s.used.length);
  const familyOnFile = s.facts.includes('familyAddress') || s.facts.includes('fatherCondition');
  if (s.claims.includes('tourism') && familyOnFile) v -= 20;
  if (s.claims.includes('noOtherFamily') && s.facts.includes('brotherAbroad')) v -= 20;
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
  style: BotStyle;
  final: RunState;
  actions: Action[];
  /** Card or inspection id and the approach or wait action picked there, in order. */
  choices: { card: string; pick: string }[];
}

export function playRun(style: BotStyle, setup: RunSetup): BotRun {
  let s = newRun(setup);
  let botRng = botSeed(setup.seed);
  const actions: Action[] = [];
  const choices: BotRun['choices'] = [];
  while (!s.ending) {
    if (actions.length >= MAX_RUN_STEPS) throw new Error(`${style} run did not end in ${MAX_RUN_STEPS} steps`);
    const pick = botAction(style, s, botRng);
    if (!pick) break;
    const sc = s.screen;
    if (pick.action.type === 'choose' && (sc.kind === 'encounter' || sc.kind === 'inspection'))
      choices.push({ card: sc.id, pick: pick.action.approach });
    if (pick.action.type === 'waitAction' && sc.kind === 'wait') choices.push({ card: sc.check, pick: pick.action.action });
    s = step(s, pick.action);
    botRng = pick.botRng;
    actions.push(pick.action);
  }
  return { style, final: s, actions, choices };
}
