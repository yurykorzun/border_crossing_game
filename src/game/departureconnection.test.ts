// The Departure missed-connection card says you missed your own shuttle
// (border_crossing_game-dap.57). Seen in a browser run on 65ea8e8: the card read
// "Your shuttle has left." while the header still counted "3 hours until the last shuttle"
// and the first answer offered "Take the later shuttle", so it read as if no shuttle was
// left. Departure fits the 8-minute sweep at 7.99, so the line keeps its word count.
import { afterEach, describe, expect, it } from 'vitest';
import { setStory, t } from '../i18n';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
/** The wording the card had before dap.57, for the word budget. */
const OLD_DEPARTURE = 'Your shuttle has left. "Where did you stay here?"';

afterEach(() => setStory(undefined));

describe('Departure s_connection card against the last-shuttle header', () => {
  it('says the player missed their shuttle while the header counts the last one', () => {
    setStory('departure');
    const header = t('ui.untilLastBus', { hours: '3 hours' });
    const card = t('insp.s_connection.q');
    expect(header).toBe('3 hours until the last shuttle');
    expect(card).toBe('You missed your shuttle. "Where did you stay here?"');
    expect(card).not.toMatch(/shuttle has (left|gone)|no shuttle/i);
    expect(t('insp.s_connection.later.label')).toBe('Take the later shuttle');
  });

  it('adds no words to the Departure line', () => {
    setStory('departure');
    expect(words(t('insp.s_connection.q'))).toBeLessThanOrEqual(words(OLD_DEPARTURE));
  });

  it('leaves Arrival\'s card as it was', () => {
    setStory('arrival');
    expect(t('insp.s_connection.q')).toBe('Your shuttle has left. "Where are you staying?"');
  });
});
