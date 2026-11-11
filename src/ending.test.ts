// The ending card (Ending in src/App.tsx), rendered to markup: one replay prompt about a
// choice, and no "Still to find out" list of the endings left to see (g0q.2).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ending } from './App';
import { newRun } from './game/engine';
import { en } from './i18n/en';
import type { EndingId, RunState } from './game/types';

const ENDED: [EndingId, Partial<RunState>][] = [
  ['homeInTime', { time: 5 }],
  ['homeAtCost', { time: 4, medicine: false }],
  ['tooLate', { time: 0 }],
  ['turnedBack', { time: 6 }],
];

const markup = (ending: EndingId, patch: Partial<RunState>) => {
  const run: RunState = {
    ...newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 }),
    checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending, ...patch,
  };
  return renderToStaticMarkup(createElement(Ending, { s: run, onRestart: () => {}, onSame: () => {} }));
};

const count = (html: string, text: string) => html.split(text).length - 1;

describe('the ending screen', () => {
  it('shows one replay prompt on every ending, and no list of endings still to find', () => {
    expect(en['ui.replayPrompt']).toBe('What would change if you packed different documents?');
    for (const [ending, patch] of ENDED) {
      const html = markup(ending, patch);
      expect(count(html, 'class="replay-prompt"'), ending).toBe(1);
      expect(count(html, en['ui.replayPrompt']), ending).toBe(1);
      expect(html, ending).not.toContain('open-questions');
      expect(html, ending).not.toContain('Still to find out');
    }
  });
});
