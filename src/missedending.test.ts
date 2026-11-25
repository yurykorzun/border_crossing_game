// A missed-time ending still shows what is flagged on file (border_crossing_game-azv.19).
// A playtest on ff102e8 missed the flight at Scrutiny 3/3 with two lies caught, and the
// missed-flight ending showed nothing of them, so the lies read as free. Yury decided
// 2026-11-23: the missed flight stays the headline, and the aftermath still shows the
// names given and the lies caught.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { Ending } from './App';
import { laterBeat } from './game/consequence';
import { newRun, travelOf } from './game/engine';
import { SAMPLE_FILES } from './game/carry';
import { setStory } from './i18n';
import { en } from './i18n/en';
import type { RunState } from './game/types';

afterEach(() => setStory(undefined));

const at = (html: string, text: string) => {
  const i = html.indexOf(text);
  if (i < 0) throw new Error(`not on the ending: ${text}`);
  return i;
};

/** Lena's crossing ended with `time` hours left: the cash declaration caught at customs, her mother named. */
function ended(level: 'arrival' | 'departure', time: (trip: number) => number, patch: Partial<RunState> = {}): RunState {
  setStory(level);
  const run = newRun({ level, character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7, ...(level === 'departure' ? { file: SAMPLE_FILES.lena } : {}) });
  return {
    ...run, checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending: 'tooLate', time: time(travelOf(run)), scrutiny: 3,
    exposed: ['mother'], claims: ['cashUnderLimit'], logged: { cashUnderLimit: ['customs'] }, saidAt: { cashUnderLimit: 'customs' },
    facts: { ...run.facts, cashCount: ['customs'] }, disproved: ['cashUnderLimit'], ...patch,
  };
}

const markup = (s: RunState) => renderToStaticMarkup(createElement(Ending, { s, onChoose: () => {}, onRetry: () => {}, onNext: () => {} }));

describe('a missed-time ending with lies caught and a name given', () => {
  it('missing the flight keeps its headline, then shows the name and the caught lie in the aftermath', () => {
    const s = ended('departure', (trip) => trip - 1);
    const html = markup(s);
    expect(laterBeat(s)).toEqual({ id: 'statement', vars: { desk: 'customs', said: 'cashUnderLimit' } });
    const order = [
      at(html, '<h1>'),
      at(html, en['exposure.mother.call.title']),
      at(html, '<p class="beat-line">Days later: Customs calls you back about your statement.</p>'),
      at(html, 'class="run-summary"'),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // One short line after missed time: no heading and no reason line (the 8 minute ceiling).
    expect(html).not.toContain('beat-when');
    expect(html).not.toContain('Because Customs wrote down');
    expect(html).toContain('Missed.');
  });

  it('missing the bus with no hours left shows the caught lie too', () => {
    const html = markup(ended('arrival', () => 0, { exposed: [] }));
    expect(html).toContain(`<h1>${en['ending.missedBus.title']}</h1>`);
    expect(html).toContain('Days later: Customs calls you back about your statement.');
  });

  it('an ending in time keeps the full beat: its time, the line and the reason', () => {
    const html = markup(ended('arrival', () => 6, { ending: 'homeInTime', exposed: [] }));
    expect(html).toContain(`<h2 class="mono beat-when">${en['later.statement.when']}</h2><p class="beat-line">A letter asks you to come and explain your statement at Customs.`);
    expect(html).toContain('Because Customs wrote down');
    expect(html).not.toContain('Days later:');
  });

  it('turning back still has no aftermath beat', () => {
    expect(laterBeat(ended('arrival', () => 6, { ending: 'turnedBack', withdrew: true }))).toBeUndefined();
  });
});
