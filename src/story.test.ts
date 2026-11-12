// Departure is its own story (border_crossing_game-dap.3): you leave for a flight, so
// none of its setup text or endings borrow Arrival's hospital, its ARRIVALS stamp or
// its "Home in time". Each screen is rendered under setStory(), the way the app shows it,
// and the same screens under Arrival keep Arrival's text.
import { createElement } from 'react';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { BeginStep, DocumentsStep, Ending, Title, TravelerStep } from './App';
import { SAMPLE_FILES } from './game/carry';
import { newRun } from './game/engine';
import { freshSave } from './game/save';
import type { EndingId, LevelId, RunState } from './game/types';
import { setStory } from './i18n';
import { en } from './i18n/en';

const noop = () => {};
const BORROWED = ['hospital', 'Home in time', 'ARRIVALS'];
const html = <P extends object>(c: ComponentType<P>, props: P) => renderToStaticMarkup(createElement(c, props));
const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

/** The text of one element of a screen's markup, its tags dropped. */
function part(markup: string, re: RegExp): string {
  const m = re.exec(markup);
  if (!m) throw new Error(`not on the screen: ${re}`);
  return decode(m[1].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** The setup text, in the order a run shows it: the title stamp, the premise, the packing message, the mission. */
function setupText(level: LevelId) {
  setStory(level);
  return {
    stamp: part(html(Title, { saved: true, onStart: noop, onResume: noop, settings: freshSave().settings, onSettings: noop }), /<p class="mono stamp-line">(.*?)<\/p>/),
    premise: part(html(TravelerStep, { initial: 'lena', count: '1 / 3', onBack: noop, onContinue: noop }), /<h2 class="premise">(.*?)<\/h2>/),
    packing: part(html(DocumentsStep, { count: '2 / 3', character: 'lena', bulletin: 'records', picked: [], setPicked: noop, onBack: noop, onContinue: noop }), /<p class="msg prep-message"[^>]*>(.*?)<\/p>/),
    mission: part(html(BeginStep, { level, picked: ['deed'], traveler: 'lena', onBack: noop, onChangeDocuments: noop, onBegin: noop }), /<section class="paper mission">(.*?)<\/section>/),
  };
}

/** Every end screen a level can show: the four endings, the missed bus, and held at the exit desk. */
const ENDINGS: [string, EndingId, Partial<RunState>][] = [
  ['homeInTime', 'homeInTime', { time: 5 }],
  ['homeAtCost', 'homeAtCost', { time: 4, medicine: false }],
  ['tooLate', 'tooLate', { time: 1 }],
  ['missedBus', 'tooLate', { time: 0 }],
  ['turnedBack', 'turnedBack', { time: 6 }],
  ['held', 'turnedBack', { time: 6, log: [{ key: 'enc.d_hold.leave.reaction' }] }],
];

/** An ending card's title and the alt text of its scene. */
function endingScreen(level: LevelId, ending: EndingId, patch: Partial<RunState>) {
  setStory(level);
  const file = level === 'departure' ? SAMPLE_FILES.lena : undefined;
  const run: RunState = {
    ...newRun({ level, character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7, file }),
    checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending, ...patch,
  };
  const markup = html(Ending, { s: run, onRestart: noop, onSame: noop });
  return { title: part(markup, /<h1>(.*?)<\/h1>/), alt: part(markup, /<div class="ending-scene"><svg[^>]*aria-label="([^"]*)"/) };
}

afterEach(() => setStory(undefined));

describe('Departure has its own setup text', () => {
  const d = setupText('departure');

  it.each(Object.entries(d))('%s borrows nothing from Arrival', (_, text) => {
    expect(text).not.toBe('');
    for (const word of BORROWED) expect(text.toLowerCase()).not.toContain(word.toLowerCase());
  });

  it('shows its own stamp, premise, packing message and mission', () => {
    expect(d.stamp).toBe(en['departure:ui.stamp']);
    expect(d.premise).toBe(en['departure:ui.premise']);
    expect(d.packing).toContain(en['departure:msg.prep']);
    expect(d.mission).toContain(en['departure:mission.title']);
    expect(d.mission).toContain(en['departure:mission.body']);
  });

  it('says once that you cross by land to a flight in the next country', () => {
    expect(d.premise).toMatch(/flight/);
    expect(d.premise).toMatch(/next country/);
    expect(d.premise).toMatch(/by land/);
  });
});

describe('Departure has its own endings', () => {
  it.each(ENDINGS)('%s: title and scene alt text borrow nothing from Arrival', (name, ending, patch) => {
    const { title, alt } = endingScreen('departure', ending, patch);
    expect(title, name).not.toBe('');
    expect(alt, name).not.toBe('');
    for (const word of BORROWED) {
      expect(title.toLowerCase(), `${name} title`).not.toContain(word.toLowerCase());
      expect(alt.toLowerCase(), `${name} alt`).not.toContain(word.toLowerCase());
    }
  });

  it('names the flight, and shows the plane when you make it', () => {
    expect(endingScreen('departure', 'homeInTime', { time: 5 })).toEqual({ title: en['departure:ending.homeInTime.title'], alt: en['scene.plane'] });
    expect(endingScreen('departure', 'homeAtCost', { time: 4, medicine: false })).toEqual({ title: en['departure:ending.homeAtCost.title'], alt: en['scene.plane'] });
    expect(endingScreen('departure', 'tooLate', { time: 1 })).toEqual({ title: en['departure:ending.tooLate.title'], alt: en['departure:scene.bus'] });
  });
});

describe('Arrival keeps its text', () => {
  it('setup: the ARRIVALS stamp, the hospital premise, the packing message, the mission', () => {
    const a = setupText('arrival');
    expect(a.stamp).toBe('HALDEN CENTRAL · ARRIVALS');
    expect(a.premise).toBe("You're going home. Your father is in the hospital.");
    expect(a.packing).toContain("Hope your dad's OK. Will you be back for Monday's client meeting?");
    expect(a.mission).toContain(en['mission.title']);
    expect(a.mission).toContain(en['mission.body']);
  });

  it('endings: Home in time in the ward, and the hospital through the bus window', () => {
    expect(endingScreen('arrival', 'homeInTime', { time: 5 })).toEqual({ title: 'Home in time', alt: en['scene.ward'] });
    expect(endingScreen('arrival', 'homeAtCost', { time: 4, medicine: false })).toEqual({ title: 'Home at a cost', alt: en['scene.ward'] });
    expect(endingScreen('arrival', 'tooLate', { time: 1 })).toEqual({ title: 'Too late', alt: en['scene.bus'] });
    expect(en['scene.bus']).toContain('hospital');
    expect(endingScreen('arrival', 'tooLate', { time: 0 }).title).toBe('Missed the bus');
    expect(endingScreen('arrival', 'turnedBack', { time: 6 }).title).toBe('You turned back');
  });
});
