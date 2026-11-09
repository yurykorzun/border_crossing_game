import { describe, expect, it } from 'vitest';
import {
  BOT_STYLES, botAction, botSeed, buildScript, caughtLies, firstPassScript, playRun, playScript, setupFor,
} from './bots';
import type { BotRun } from './bots';
import { legalActions, newRun } from './engine';
import { tryStep } from './play';
import { allSetups } from './walk';

const SETUP_COUNT = allSetups().length;

describe('autoplay bots', () => {
  for (const style of BOT_STYLES) {
    it(`${style}: only legal actions, and every run ends within 40 steps`, () => {
      // Two passes over every character x packing x bulletin, with different seeds.
      for (let i = 0; i < SETUP_COUNT * 2; i++) {
        const setup = setupFor(i);
        let s = newRun(setup);
        let botRng = botSeed(setup.seed);
        let steps = 0;
        for (;;) {
          const pick = botAction(style, s, botRng);
          if (!pick) break;
          // tryStep refuses anything legalActions() does not list.
          const r = tryStep(s, pick.action);
          expect(r.ok, `${style} run ${i} step ${steps}: ${JSON.stringify(pick.action)}`).toBe(true);
          s = r.state;
          botRng = pick.botRng;
          steps++;
          expect(steps, `${style} run ${i} still going`).toBeLessThanOrEqual(40);
        }
        expect(s.ending, `${style} run ${i} stopped without an ending`).not.toBeNull();
      }
    });
  }

  it('plays the same run twice from the same setup', () => {
    for (const style of BOT_STYLES) {
      const a = playRun(style, setupFor(7));
      const b = playRun(style, setupFor(7));
      expect(b.actions).toEqual(a.actions);
      expect(b.final).toEqual(a.final);
    }
  });

  it('the honest bot gets at least 1 no-cost answer per run on average', () => {
    // Preparation and luck: a document that settles the question, a calm card, the perk, an evasion nothing on file contradicts.
    let free = 0;
    for (let i = 0; i < SETUP_COUNT; i++) free += playRun('honest', setupFor(i)).noCost;
    expect(free / SETUP_COUNT).toBeGreaterThanOrEqual(1);
  });

  it('the memorised script keeps the pick that wins most often, smoothed against one lucky run', () => {
    const run = (card: string, pick: string, ending: 'homeInTime' | 'tooLate') =>
      ({ choices: [{ card, pick }], final: { ending } }) as unknown as BotRun;
    const script = buildScript([
      run('c', 'once', 'homeInTime'),
      ...Array.from({ length: 10 }, () => run('c', 'often', 'homeInTime')),
      run('c', 'often', 'tooLate'),
      run('d', 'b', 'tooLate'), run('d', 'a', 'tooLate'),
    ]);
    expect(script.get('c')).toBe('often');
    // A tie on rate and count goes by name.
    expect(script.get('d')).toBe('a');
  });

  it('the memorised script gives one answer per card in every run, legal and repeatable', () => {
    const script = firstPassScript(SETUP_COUNT);
    for (let i = 0; i < SETUP_COUNT; i++) {
      const r = playScript(script, setupFor(i));
      expect(r.style).toBe('memorised');
      expect(r.final.ending, `run ${i}`).not.toBeNull();
      expect(playScript(script, setupFor(i)).actions).toEqual(r.actions);
      // Replay: every step is legal, and whenever the scripted answer is open it is the one given.
      let s = newRun(setupFor(i));
      for (const a of r.actions) {
        const sc = s.screen;
        const card = sc.kind === 'encounter' || sc.kind === 'inspection' ? sc.id : sc.kind === 'wait' ? sc.check : '';
        const want = script.get(card);
        const open = legalActions(s).some((l) =>
          (l.type === 'choose' && l.approach === want) || (l.type === 'waitAction' && l.action === want));
        if (open && !s.reaction && !legalActions(s).some((l) => l.type === 'finish'))
          expect(a.type === 'choose' ? a.approach : a.type === 'waitAction' ? a.action : '', `run ${i} ${card}`).toBe(want);
        const t = tryStep(s, a);
        expect(t.ok, `run ${i}: ${JSON.stringify(a)}`).toBe(true);
        s = t.state;
      }
    }
  });

  it('counts the liar lies and catches only claims a dealt challenge card covers', () => {
    const liar = playRun('liar', setupFor(0));
    expect(liar.lies).toBeGreaterThan(0);
    expect(liar.caught).toBe(caughtLies(liar.final));
    expect(liar.caught).toBeLessThanOrEqual(liar.lies);
    for (let i = 0; i < SETUP_COUNT; i++) expect(playRun('honest', setupFor(i)).lies).toBe(0);
  });

  it('the liar hides the family visit and the honest bot never claims tourism', () => {
    const liar = playRun('liar', setupFor(0));
    expect(liar.choices[0]).toEqual({ card: 'p_purpose', pick: 'tourism' });
    for (let i = 0; i < SETUP_COUNT; i++) expect(playRun('honest', setupFor(i)).final.claims).not.toContain('tourism');
  });
});
