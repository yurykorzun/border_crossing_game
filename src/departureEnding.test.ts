// The Departure ending speaks about leaving and this run (dap.32): its summary reads the
// flight, not arrival or the medicine, and the contact lines read every name on file,
// the Arrival record included. Separately, no Arrival ending body contradicts its
// Medicine line ("Not everything you carried comes with you" with the medicine kept).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { Ending } from './App';
import { playRun, BOT_STYLES } from './game/bots';
import { SAMPLE_FILES } from './game/carry';
import { axisLines, endingBody, protectedRow } from './game/consequence';
import { endingText, newRun } from './game/engine';
import type { RunSetup } from './game/engine';
import { setStory, t } from './i18n';
import { en } from './i18n/en';
import type { EndingId, RunState } from './game/types';

afterEach(() => setStory(undefined));

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const render = (s: RunState) => renderToStaticMarkup(createElement(Ending, { s, onChoose: () => {}, onRetry: () => {}, onNext: () => {} }));

// Mark's sample file names his brother, the contact he was asked to protect, at Arrival.
const markDeparture: RunSetup = { level: 'departure', character: 'mark', loadout: ['motherLetter', 'hospitalNote', 'returnTicket', 'deed'], bulletin: 'records', seed: 7, file: SAMPLE_FILES.mark };
const lenaDeparture: RunSetup = { level: 'departure', character: 'lena', loadout: ['deed', 'hotel', 'motherLetter'], bulletin: 'records', seed: 7, file: SAMPLE_FILES.lena };

const ended = (setup: RunSetup, ending: EndingId, patch: Partial<RunState> = {}): RunState =>
  ({ ...newRun(setup), checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending, ...patch });

/** What a Departure ending must not say: Arrival's axis, the medicine axis or the medicine row. */
function expectDepartureSummary(html: string) {
  expect(html).not.toContain('axis-arrival');
  expect(html).not.toContain('axis-medicine');
  expect(html).not.toContain(`<strong>${en['ending.axis.arrival']}:</strong>`);
  expect(html).not.toContain(`<strong>${en['ending.axis.medicine']}:</strong>`);
  expect(html).not.toContain(`<dt>${en['ui.medicineRow']}</dt>`);
  expect(html).toContain('axis-flight');
  expect(html).toContain(`<strong>${en['ending.axis.flight']}:</strong>`);
}

describe('the Departure ending (dap.32)', () => {
  const endings: [EndingId, Partial<RunState>][] = [
    ['homeInTime', { time: 5 }],
    ['homeAtCost', { time: 4, exposed: ['brother'] }],
    ['tooLate', { time: 1 }],
    ['turnedBack', { time: 6, withdrew: true }],
  ];
  for (const [ending, patch] of endings) {
    it(`${ending}: the summary reads the flight, not arrival or the medicine`, () => {
      setStory('departure');
      const s = ended(markDeparture, ending, patch);
      const html = render(s);
      expectDepartureSummary(html);
      const leg = axisLines(s)[0];
      expect(leg.axis).toBe('flight');
      expect(plain(html)).toContain(`${t('ending.axis.flight')}: ${t(leg.key, leg.vars)}`);
      expect(axisLines(s).map((l) => l.axis)).toEqual(['flight', 'contacts']);
    });
  }

  it('Made the flight: the contacts line and the protected row read the name the Arrival file holds', () => {
    setStory('departure');
    // Named at Arrival, not again on the way out: the desk read "Your file names your brother".
    const s = ended(markDeparture, 'homeInTime', { time: 5, exposed: [] });
    const shown = plain(render(s));
    expect(shown).toContain(`${t('ending.axis.contacts')}: ${t('ending.axis.contacts.named', { names: t('contact.brother') })}`);
    expect(shown).not.toContain(t('ending.axis.contacts.none'));
    expect(protectedRow(s)).toEqual({ key: 'ui.namedOnFile', tone: 'plain', vars: { crossing: 'Arrival' } });
    expect(shown).toContain('On file since Arrival');
    expect(shown).not.toContain(t('ui.notNamed'));
  });

  it('names from the file and from this run are listed once each, file first', () => {
    setStory('departure');
    const s = ended(markDeparture, 'homeAtCost', { time: 4, exposed: ['mother', 'brother'] });
    const contacts = axisLines(s).find((l) => l.axis === 'contacts')!;
    expect(t(contacts.key, contacts.vars)).toBe(t('ending.axis.contacts.named', { names: `${t('contact.brother')} and ${t('contact.mother')}` }));
  });

  it('a file with nobody on it and nobody named reads no one on file', () => {
    setStory('departure');
    const s = ended(lenaDeparture, 'homeInTime', { time: 5, exposed: [] });
    expect(plain(render(s))).toContain(`${t('ending.axis.contacts')}: ${t('ending.axis.contacts.none')}`);
  });

  it('another relative a desk noted from the family register is on file (dap.39)', () => {
    setStory('departure');
    const base = newRun(lenaDeparture);
    const s = ended(lenaDeparture, 'homeInTime', { time: 5, exposed: [], facts: { ...base.facts, relativeContact: ['interview'] } });
    const shown = plain(render(s));
    expect(shown).toContain(`${t('ending.axis.contacts')}: On file: another relative.`);
    expect(shown).not.toContain(t('ending.axis.contacts.none'));
  });

  it('played Departure runs, every bot style: the flight summary, and the body matches the medicine', () => {
    let seen = 0;
    for (const setup of [markDeparture, lenaDeparture])
      for (const style of BOT_STYLES)
        for (const seed of [1, 2, 3]) {
          const s = playRun(style, { ...setup, seed }).final;
          if (!s.ending) continue;
          setStory('departure');
          const html = render(s);
          expectDepartureSummary(html);
          for (const c of new Set([...(s.file?.named ?? []), ...s.exposed])) expect(plain(html)).toContain(t(`contact.${c}`));
          if (s.medicine) expect(plain(html)).not.toContain('Not everything you carried');
          seen++;
        }
    expect(seen).toBeGreaterThan(10);
  });
});

describe('no ending body contradicts its Medicine line (dap.32)', () => {
  for (const story of [undefined, 'departure', 'funeral'] as const)
    for (const medicine of [true, false]) {
      it(`${story ?? 'arrival'}, home at a cost with the medicine ${medicine ? 'kept' : 'lost'}`, () => {
        setStory(story);
        const s: RunState = { ...ended(markDeparture, 'homeAtCost', { time: 4, medicine, exposed: medicine ? ['brother'] : [] }), level: story ?? 'arrival' };
        const body = t(endingBody(s, endingText(s)));
        if (medicine) expect(body).not.toMatch(/not everything you carried/i);
        else expect(body).toMatch(/not everything you carried/i);
      });
    }

  it('Arrival "Home at a cost" with the medicine kept: the body and the Medicine line agree', () => {
    const s = ended(
      { character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 },
      'homeAtCost', { time: 4, medicine: true, exposed: ['cousin'] },
    );
    const shown = plain(render(s));
    expect(shown).toContain(`${t('ending.axis.medicine')}: ${t('ending.axis.medicine.kept')}`);
    expect(shown).toContain(en['ending.homeAtCost.kept.body']);
    expect(shown).not.toContain('Not everything you carried');
  });
});
