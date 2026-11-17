import { describe, expect, it } from 'vitest';
import { playRun } from './bots';
import { consequence } from './consequence';
import { CHARACTERS } from './content/world';
import { answerKey, deskOf, newRun, optionFor } from './engine';
import { playStep } from './play';
import { allSetups } from './walk';

// border_crossing_game-dap.54: an apology that takes scrutiny to 3/3 with no
// inspection left to deal is reset on the same step (insp.none), and the ending
// used to count the net change, 0, after the line had shown +2.
describe('An answer records the scrutiny its line showed', () => {
  it('even when the supervisor finds nothing to ask and scrutiny drops on the same step', () => {
    const base = allSetups('arrival').find((x) => x.character === 'lena' && x.bulletin === 'records' && x.loadout.join('+') === 'motherLetter+employerLetter+hospitalNote');
    expect(base).toBeDefined();
    const setup = { ...base!, seed: 5 };
    let s = newRun(setup);
    let checked = false;
    for (const a of playRun('random', setup).actions) {
      const o = a.type === 'choose' && s.screen.kind === 'encounter' ? optionFor(s, a) : undefined;
      const n = playStep(s, a);
      if (o && s.screen.kind === 'encounter' && s.screen.id === 'i_contradiction' && o.approach.id === 'apologise') {
        const key = answerKey(s, 'apologise', 'label').replace(/\.label$/, '');
        const shown = consequence(o, key, CHARACTERS[s.character].protectedContact, deskOf(s), s).parts
          .reduce((x, p) => x + (p.kind === 'scrutiny' ? Number(p.vars?.n) : 0), 0);
        expect(shown).toBe(2);
        // The reset path this test is for: the supervisor had nothing to ask.
        expect(n.reaction?.map((r) => r.key)).toContain('insp.none');
        expect(n.answers?.at(-1)?.scrutiny).toBe(shown);
        checked = true;
      }
      s = n;
    }
    expect(checked).toBe(true);
  });
});
