// Level 3 The funeral: an old friend's sister has told the border how long you
// stay. Her word is testimony, not proof: a stay you claim that disagrees with it
// is a discrepancy the clerk asks you to explain (p_statement). Explaining settles
// it for an hour; standing by the answer is caught, with both lines quoted
// (caughtLine() in src/game/consequence.ts).

import { describe, expect, it } from 'vitest';
import { setStory, t } from '../i18n';
import { heeds, playRun, ruleShares, setupFor } from './bots';
import { caughtLine } from './consequence';
import { CHALLENGE_PAIRS, DISPROOFS, STATEMENTS } from './content/encounters';
import { queueBeats } from './content/queues';
import { LEVELS } from './content/levels';
import { caught, legalActions, newRun, step } from './engine';
import type { RunSetup } from './engine';
import type { Dealer } from './rng';
import type { Action, ClaimId, RunState } from './types';
import { CHECKPOINTS } from './types';

const funeral = LEVELS.funeral;
// No document on how long you stay, so the clerk takes your word for it.
const lena: RunSetup = { level: 'funeral', character: 'lena', loadout: ['motherLetter', 'hospitalNote', 'deed'], bulletin: 'customs', seed: 1 };
const first: Dealer = (rng) => ({ index: 0, rng });

/**
 * Plays the funeral with `statement` on file, saying `stay` on p_days, giving
 * `answer` on p_statement and otherwise the first open answer. Returns every state.
 */
function play(statement: (typeof STATEMENTS)[number], stay: ClaimId, answer: 'explain' | 'stand' = 'explain'): RunState[] {
  let s = newRun({ ...lena, statement: statement.fact });
  const states = [s];
  for (let i = 0; i < 200 && !s.ending; i++) {
    const legal = legalActions(s);
    const id = s.screen.kind === 'encounter' && !s.reaction ? s.screen.id : '';
    const want = id === 'p_days' ? (stay === 'stayDays' ? 'days' : 'weeks') : id === 'p_statement' ? answer : undefined;
    const a: Action = legal.find((x) => x.type === 'choose' && x.approach === want) ?? legal[0];
    s = step(s, a, first);
    states.push(s);
  }
  return states;
}

const onCard = (states: RunState[], id: string) => states.filter((s) => s.screen.kind === 'encounter' && s.screen.id === id && !s.reaction);
/** The state right after answering card `id`, its reaction showing over whatever comes next. */
const after = (states: RunState[], id: string) => states[states.indexOf(onCard(states, id)[0]) + 1];

describe('The funeral', () => {
  it('is a level with its own goal, an opening line, the stay question and one rule about statements', () => {
    expect(t(funeral.title)).toBe('The funeral');
    expect(funeral.opening && t(funeral.opening)).toBeTruthy();
    expect(funeral.asks).toEqual(['p_days']);
    expect(funeral.statements).toEqual(STATEMENTS.map((x) => x.fact));
    expect(funeral.rules.map((r) => r.id)).toEqual(['statements']);
    for (const id of ['p_days', 'p_statement']) {
      expect(LEVELS.arrival.cards).not.toContain(id);
      expect(funeral.cards).toContain(id);
    }
  });

  it('is an old friend\'s funeral, and no text says your father died', () => {
    setStory('funeral');
    try {
      const shown = [funeral.goalTitle, funeral.goalBody, 'ui.goal', 'ui.premise', 'ending.homeInTime.body', 'ending.tooLate.body']
        .map((k) => t(k, { hours: 8, travel: 2 })).join(' ');
      expect(shown).toMatch(/friend/);
      expect(shown).not.toMatch(/father (has )?died|death of your father|your father's funeral/i);
    } finally {
      setStory(undefined);
    }
    // Arrival keeps its own wording.
    expect(t('ui.goal')).toBe('Reach the hospital');
  });

  it('starts with one statement on file at every desk, and her message in the first queue says it', () => {
    for (const x of STATEMENTS) {
      const s = newRun({ ...lena, statement: x.fact });
      expect(s.facts[x.fact]).toEqual([...CHECKPOINTS]);
      expect(STATEMENTS.filter((y) => s.facts[y.fact])).toEqual([x]);
      const beats = queueBeats(0, s).map((b) => b.key);
      expect(beats).toContain(`msg.0.0.${x.fact}`);
      expect(beats).not.toContain('msg.0.0');
    }
    // Arrival has none, and keeps your mother's message.
    const arrival = newRun({ ...lena, level: 'arrival' });
    expect(STATEMENTS.filter((x) => arrival.facts[x.fact])).toEqual([]);
    expect(queueBeats(0, arrival).map((b) => b.key)).toContain('msg.0.0');
  });

  it('asks how long you stay right after the opening card', () => {
    const states = play(STATEMENTS[0], 'stayDays');
    const dealt = states.flatMap((s, i) => (s.screen.kind === 'encounter' && states[i - 1]?.screen !== s.screen ? [s.screen.id] : []));
    expect(dealt.slice(0, 2)).toEqual(['p_purpose', 'p_days']);
  });

  it('a seed picks either statement', () => {
    const drawn = new Set(Array.from({ length: 12 }, (_, i) => STATEMENTS.find((x) => newRun(setupFor(i, 'funeral')).facts[x.fact])!.fact));
    expect([...drawn].sort()).toEqual(STATEMENTS.map((x) => x.fact).sort());
    // The app passes no statement: the seed picks it.
    const bySeed = new Set([1, 2, 3, 4, 5, 6].map((seed) => STATEMENTS.find((x) => newRun({ ...lena, seed }).facts[x.fact])!.fact));
    expect(bySeed.size).toBe(2);
  });

  it('is testimony, not proof: no disproof names a statement', () => {
    for (const x of STATEMENTS) expect(DISPROOFS.some(([, f]) => f === x.fact)).toBe(false);
  });

  describe.each(STATEMENTS.map((x) => [x.fact, x] as const))('with %s on file', (_, x) => {
    it('puts a disagreeing claim to you as a discrepancy, quoting both lines', () => {
      const states = play(x, x.disproves);
      const at = onCard(states, 'p_statement');
      expect(at).toHaveLength(1);
      expect(CHALLENGE_PAIRS.p_statement).toContainEqual([x.disproves, x.fact]);
      const line = caughtLine(at[0], 'p_statement')!;
      const text = t(line.key, line.vars);
      expect(text).toContain(`"${t(`said.${x.disproves}`)}"`);
      expect(text).toContain(t(`fact.${x.fact}`));
      expect(text).toContain(t('checkpoint.passport'));
      // Who said it, and when.
      expect(t(`fact.${x.fact}`)).toMatch(/sister.*this morning/);
    });

    it('settles it for an hour when you explain', () => {
      const states = play(x, x.disproves, 'explain');
      const before = onCard(states, 'p_statement')[0];
      const done = after(states, 'p_statement');
      expect(done.time).toBe(before.time - 1);
      expect(done.scrutiny).toBe(before.scrutiny);
      // Nothing catches it later.
      expect(states.some((s) => s.screen.kind === 'encounter' && caught(s, s.screen.id)?.fact === x.fact && s.screen.id !== 'p_statement')).toBe(false);
    });

    it('catches you when you stand by it', () => {
      const states = play(x, x.disproves, 'stand');
      const before = onCard(states, 'p_statement')[0];
      const done = after(states, 'p_statement');
      expect(done.scrutiny).toBeGreaterThan(before.scrutiny);
      expect(done.time).toBe(before.time);
    });

    it('asks nothing about an agreeing claim', () => {
      const states = play(x, x.agrees);
      expect(states.some((s) => s.claims.includes(x.agrees))).toBe(true);
      expect(onCard(states, 'p_statement')).toEqual([]);
      expect(states.every((s) => s.screen.kind !== 'encounter' || caught(s, s.screen.id)?.claim !== x.agrees)).toBe(true);
    });

    it('counts the agreeing answer as heeding the rule, and the other as not', () => {
      const s = onCard(play(x, x.agrees), 'p_days')[0];
      const rule = funeral.rules[0];
      const pick = (claim: ClaimId): Action => ({ type: 'choose', approach: claim === 'stayDays' ? 'days' : 'weeks' });
      expect(heeds(rule, s, pick(x.agrees))).toBe(true);
      expect(heeds(rule, s, pick(x.disproves))).toBe(false);
    });
  });

  it('a bot that ignores the statements gets home in time less often, in every style', () => {
    // Every setup with the seeds npm run walk plays (WALK_SEEDS).
    for (const x of ruleShares(funeral, funeral.rules[0]))
      expect(x.ignoring, `${x.style}: heeding ${x.heeding}, ignoring ${x.ignoring}`).toBeLessThan(x.heeding);
    // 210 setups x 10 seeds x 4 styles x 2 bots: a few seconds alone, more next to the walk.
  }, 60_000);

  it('every style heeds the statement on its own', () => {
    for (const style of ['honest', 'liar', 'cautious', 'situational'] as const)
      for (let i = 0; i < 20; i++) {
        const run = playRun(style, setupFor(i, 'funeral'));
        const statement = STATEMENTS.find((x) => run.final.facts[x.fact])!;
        expect(run.final.claims, `${style} seed ${i + 1}`).not.toContain(statement.disproves);
      }
  });
});
