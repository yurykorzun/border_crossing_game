// The Departure missed-connection card says you missed your own shuttle
// (border_crossing_game-dap.57). Seen in a browser run on 65ea8e8: the card read
// "Your shuttle has left." while the header still counted "3 hours until the last shuttle"
// and the first answer offered "Take the later shuttle", so it read as if no shuttle was
// left. Departure fits the 8-minute sweep at 7.99, so the line keeps its word count.
//
// It says so only when the hours left are below the trip to the airport (azv.5): a
// playtest on ff102e8 got "You missed your shuttle." with 5 hours left and the airport
// 2 hours away.
import { afterEach, describe, expect, it } from 'vitest';
import { setStory, t } from '../i18n';
import { setupFor } from './bots';
import { questionKey } from './consequence';
import { newRun, travelOf } from './engine';
import type { RunState } from './types';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** The wording the card had before dap.57, for the word budget. */
const OLD_DEPARTURE = 'Your shuttle has left. "Where did you stay here?"';
const MISSED = 'You missed your shuttle. "Where did you stay here?"';
const ASKED = '"Where did you stay here?"';

/** The s_connection card in a run of `level` with `time` hours left. */
function card(level: 'arrival' | 'departure', time: (trip: number) => number): string {
  setStory(level);
  const run = newRun(setupFor(0, level));
  const s: RunState = { ...run, time: time(travelOf(run)), screen: { kind: 'inspection', id: 's_connection' } };
  return t(questionKey(s, 'insp', 's_connection'));
}

afterEach(() => setStory(undefined));

describe('Departure s_connection card against the last-shuttle header', () => {
  it('says the player missed their shuttle when the hours left are below the trip to the airport', () => {
    expect(card('departure', (trip) => trip - 1)).toBe(MISSED);
    setStory('departure');
    expect(t('ui.untilLastBus', { hours: '3 hours' })).toBe('3 hours until the last shuttle');
    expect(t('insp.s_connection.later.label')).toBe('Take the later shuttle');
  });

  it('asks without the missed shuttle while the hours left still cover the trip', () => {
    // The playtest: 5 hours left, the airport 2 hours away.
    expect(card('departure', (trip) => trip + 3)).toBe(ASKED);
    expect(card('departure', (trip) => trip)).toBe(ASKED);
  });

  it('never says the shuttle has left or gone', () => {
    for (const text of [MISSED, ASKED]) expect(text).not.toMatch(/shuttle has (left|gone)|no shuttle/i);
  });

  it('adds no words to the Departure line', () => {
    expect(words(card('departure', (trip) => trip - 1))).toBeLessThanOrEqual(words(OLD_DEPARTURE));
    expect(words(card('departure', (trip) => trip + 3))).toBeLessThanOrEqual(words(OLD_DEPARTURE));
  });

  it('leaves Arrival\'s card as it was, whatever the time', () => {
    for (const time of [(trip: number) => trip - 1, (trip: number) => trip + 3])
      expect(card('arrival', time)).toBe('Your shuttle has left. "Where are you staying?"');
  });
});
