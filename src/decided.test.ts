// The ending names the choices that decided it (border_crossing_game-dap.7): two or
// three answers from the run's own record, each with its desk and its cost, then one
// line each for arrival, the medicine and contacts, read from the run's end state.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ending } from './App';
import { BOT_STYLES, playRun, setupFor } from './game/bots';
import type { BotRun } from './game/bots';
import { MAX_DECISIVE, MIN_DECISIVE, axisLines, decisive } from './game/consequence';
import { endingText, travelOf } from './game/engine';
import { t, tn } from './i18n';
import { CHECKPOINTS } from './game/types';

/** The first bot run, over styles and seeds, whose ending reads `text`. */
function seededRun(text: string): BotRun {
  for (let i = 0; i < 300; i++)
    for (const style of BOT_STYLES) {
      const run = playRun(style, setupFor(i));
      if (endingText(run.final) === text) return run;
    }
  throw new Error(`no seeded run ends ${text}`);
}

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const costText = (c: { key: string; vars?: Record<string, string | number>; n?: number }) => (c.n === undefined ? t(c.key, c.vars) : tn(c.key, c.n, c.vars));

describe('the ending names the choices that decided it', () => {
  for (const text of ['homeInTime', 'homeAtCost', 'missedBus', 'tooLate']) {
    it(`${text}: 2-3 answers really picked, each with its desk and cost, and the three axis lines`, () => {
      const run = seededRun(text);
      const s = run.final;
      const decided = decisive(s);
      expect(decided.length).toBeGreaterThanOrEqual(MIN_DECISIVE);
      expect(decided.length).toBeLessThanOrEqual(MAX_DECISIVE);

      // Every listed answer was picked in this run, on its card, at its desk.
      const answers = s.answers ?? [];
      for (const d of decided) {
        const a = answers.find((x) => x.key === d.key && x.desk === d.desk);
        expect(a, d.key).toBeDefined();
        expect(run.choices).toContainEqual({ card: a!.card, pick: a!.pick });
        expect(CHECKPOINTS).toContain(d.desk);
        expect(d.costs.length).toBeGreaterThan(0);
      }

      const html = renderToStaticMarkup(createElement(Ending, { s, onRestart: () => {}, onSame: () => {} }));
      const shown = plain(html);
      expect(shown).toContain(t('ending.decided.heading'));
      expect(html.split('class="decisive-answer"').length - 1).toBe(decided.length);
      for (const d of decided) {
        expect(shown).toContain(t('ending.decided.at', { desk: d.desk }));
        expect(shown).toContain(t(d.key, d.vars));
        for (const c of d.costs) expect(shown).toContain(costText(c));
      }

      // One line each for arrival, the medicine and contacts, matching the end state.
      const lines = axisLines(s);
      expect(lines.map((l) => l.axis)).toEqual(['arrival', 'medicine', 'contacts']);
      expect(lines[0].key).toBe(s.time >= travelOf(s) ? 'ending.axis.arrival.onTime' : 'ending.axis.arrival.late');
      expect(lines[0].key).toBe(text === 'homeInTime' || text === 'homeAtCost' ? 'ending.axis.arrival.onTime' : 'ending.axis.arrival.late');
      expect(lines[1].key).toBe(s.medicine ? 'ending.axis.medicine.kept' : 'ending.axis.medicine.lost');
      const contacts = t(lines[2].key, lines[2].vars);
      if (s.exposed.length) for (const c of s.exposed) expect(contacts).toContain(t(`contact.${c}`));
      else expect(lines[2].key).toBe('ending.axis.contacts.none');
      expect(html.split('class="axis ').length - 1).toBe(3);
      for (const l of lines) expect(shown).toContain(`${t(`ending.axis.${l.axis}`)}: ${t(l.key, l.vars)}`);
    });
  }

  it('picks the answers that moved the run most, and lists them in the order they were given', () => {
    // A run where the medicine was taken lists that answer, whatever else happened.
    const lost = seededRun('homeAtCost');
    const withMedicine = [lost, ...BOT_STYLES.flatMap((style) => Array.from({ length: 60 }, (_, i) => playRun(style, setupFor(i))))]
      .filter((r) => (r.final.answers ?? []).some((a) => a.medicine));
    expect(withMedicine.length).toBeGreaterThan(0);
    for (const r of withMedicine) {
      const decided = decisive(r.final);
      expect(decided.some((d) => d.costs.some((c) => c.key === 'ending.cost.medicine')), r.style).toBe(true);
      const order = decided.map((d) => (r.final.answers ?? []).findIndex((a) => a.key === d.key && a.desk === d.desk));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });
});
