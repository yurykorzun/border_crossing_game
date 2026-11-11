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

/** Where each text first appears in the markup, so the test can check reading order. */
const at = (html: string, text: string) => {
  const i = html.indexOf(text);
  if (i < 0) throw new Error(`not on the ending: ${text}`);
  return i;
};

describe('the ending in order (rwf.10, ending review 2026-11-10)', () => {
  // Home in time with a consequence (the border called her mother) and a later beat (a claim disproved).
  const withBoth: Partial<RunState> = {
    time: 5, exposed: ['mother'], claims: ['cashUnderLimit'], logged: { cashUnderLimit: ['customs'] },
    facts: { cashCount: ['customs'] }, disproved: ['cashUnderLimit'],
  };

  it('reads title, arrival scene, the later consequence under "The following morning", the run summary, then the buttons', () => {
    const html = markup('homeInTime', withBoth);
    const order = [
      at(html, '<h1>Home in time</h1>'),
      at(html, 'class="arrival"'),
      at(html, 'data-scene="ward"'),
      at(html, en['ending.homeInTime.body']),
      at(html, `>${en['ending.later.heading']}<`),
      at(html, en['exposure.mother.call.title']),
      at(html, 'class="beat-line"'),
      at(html, 'class="run-summary"'),
      at(html, `>${en['ui.playAgain']}<`),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(at(html, `>${en['ui.seeOnFile']}<`)).toBeGreaterThan(at(html, 'class="run-summary"'));
    expect(en['ending.later.heading']).toBe('The following morning');
  });

  it('keeps the crossing result and shows the later beat as its own line after it', () => {
    const html = markup('homeInTime', withBoth);
    expect(html).toContain('<h1>Home in time</h1>');
    expect(html).toContain('<strong class="beat-when">Three days later:</strong> A letter asks you to come to an office and explain your statement at Customs.');
    expect(html).toContain('Because Customs wrote down');
    expect(at(html, 'class="beat-line"')).toBeGreaterThan(at(html, '<h1>'));
    // A clean run has neither the heading nor a beat.
    const clean = markup('homeInTime', { time: 5 });
    expect(clean).not.toContain('class="later"');
    expect(clean).not.toContain(en['ending.later.heading']);
  });

  it('opens without repeating the medicine or the protected contact, which the summary shows', () => {
    for (const [ending, patch] of ENDED) {
      const html = markup(ending, patch);
      expect(html, ending).not.toContain('class="kept"');
      // The text read from the title to what happened after, or the summary (tags and the
      // picture's label left out). What happened to the medicine comes after, under its heading.
      const end = html.includes('class="later"') ? at(html, 'class="later"') : at(html, 'class="run-summary"');
      const opening = html.slice(at(html, '<h1>'), end).replace(/<[^>]*>/g, ' ');
      expect(opening, ending).not.toMatch(/medicine|cool bag|cousin|Ilya/i);
      // The summary does show both.
      const summary = html.slice(at(html, 'class="run-summary"'));
      expect(summary, ending).toContain('Medicine');
      expect(summary, ending).toContain('Your cousin Ilya');
    }
  });

  it('labels the time row "Time left at border exit", in hours', () => {
    expect(markup('homeInTime', { time: 5 })).toContain('<dt>Time left at border exit</dt><dd class="plain">5 hours</dd>');
    expect(markup('tooLate', { time: 1 })).toContain('<dt>Time left at border exit</dt><dd class="plain">1 hour</dd>');
  });

  it('has the short arrival paragraph and shows the ward, not the medicine close-up, when you get home', () => {
    expect(en['ending.homeInTime.body']).toBe('Your father squeezes your hand. Your mother laughs and cries at once. Tonight you sleep on two chairs beside his bed, your passport still in your coat.');
    for (const ending of ['homeInTime', 'homeAtCost'] as const) {
      const html = markup(ending, { time: 5 });
      expect(html, ending).toContain('data-scene="ward"');
      expect(html, ending).not.toContain('data-scene="bus"');
    }
  });
});

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
