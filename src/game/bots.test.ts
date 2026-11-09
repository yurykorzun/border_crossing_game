import { describe, expect, it } from 'vitest';
import { BOT_STYLES, botAction, botSeed, playRun, setupFor } from './bots';
import { newRun } from './engine';
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
    // Preparation and luck: a document that settles the question, a calm card, the perk.
    let free = 0;
    for (let i = 0; i < SETUP_COUNT; i++) free += playRun('honest', setupFor(i)).noCost;
    expect(free / SETUP_COUNT).toBeGreaterThanOrEqual(1);
  });

  it('the liar hides the family visit and the honest bot never claims tourism', () => {
    const liar = playRun('liar', setupFor(0));
    expect(liar.choices[0]).toEqual({ card: 'p_purpose', pick: 'tourism' });
    for (let i = 0; i < SETUP_COUNT; i++) expect(playRun('honest', setupFor(i)).final.claims).not.toContain('tourism');
  });
});
