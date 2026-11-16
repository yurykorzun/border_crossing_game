// On the way out, the purpose point is why you stayed this long, not why you came back
// (border_crossing_game-dap.51). Found while doing dap.26: the inspection's issue line,
// the supervisor's announced point, the header naming it and the line under a purpose
// claim all still read "why you came back" or "reason for coming back" in Departure,
// because they had no departure: wording. Every desk, supervisor and inspection screen
// is rendered under setStory(), the way the app shows it, for Departure played on its
// own (the sample and default files) and carried on from an Arrival run.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Panel } from './App';
import { BOT_STYLES, playRun } from './game/bots';
import { fileOf } from './game/carry';
import { newRun, step } from './game/engine';
import type { RunSetup } from './game/engine';
import type { CarriedFile, LevelId, RunState } from './game/types';
import { allSetups } from './game/walk';
import { setStory, t } from './i18n';
import { officerLabel, TopStrip } from './ui/parts';

const noop = () => {};
const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const text = (markup: string) => decode(markup.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const CAME_BACK = /\b(came|coming) back\b/i;

/** What a desk, supervisor or inspection screen shows: the strip, the officer's label and the panel. */
function screenText(s: RunState): string {
  if (s.ending || s.screen.kind === 'between') return '';
  return [
    text(renderToStaticMarkup(createElement(TopStrip, { s, onScrutiny: noop }))),
    officerLabel(s),
    text(renderToStaticMarkup(createElement(Panel, { s, dispatch: noop, reduceWait: true, explain: [] }))),
  ].join(' | ');
}

/** Plays `setup` with `style` under its own story and returns every screen line matching CAME_BACK, plus how many screens it read. */
function sweep(style: (typeof BOT_STYLES)[number], setup: RunSetup, label: string): { hits: string[]; screens: number; purpose: number } {
  const hits: string[] = [];
  let screens = 0;
  let purpose = 0;
  setStory(setup.level);
  try {
    let s = newRun(setup);
    const look = (x: RunState) => {
      const line = screenText(x);
      if (!line) return;
      screens++;
      // The purpose point on screen, in either story's wording, so a pass is not an empty one.
      if ((x.reaction ?? []).some((r) => r.key === 'supervisor.announce.purpose') || x.supervisor === 'purpose' || line.includes(t('topic.purpose.helps'))) purpose++;
      if (CAME_BACK.test(line)) hits.push(`${label} ${x.screen.kind}${'id' in x.screen ? ` ${x.screen.id}` : ''}: ${line.match(/[^|.]*\b(came|coming) back\b[^|.]*/i)?.[0]}`);
    };
    look(s);
    for (const a of playRun(style, setup).actions) {
      s = step(s, a);
      look(s);
    }
  } finally {
    setStory(undefined);
  }
  return { hits, screens, purpose };
}

/** The file an Arrival run by `style` carries into Departure, when it got through. */
function carried(style: (typeof BOT_STYLES)[number], setup: RunSetup): CarriedFile | undefined {
  let s = newRun(setup);
  for (const a of playRun(style, setup).actions) s = step(s, a);
  return s.ending && s.ending !== 'turnedBack' ? (fileOf(s) as CarriedFile) : undefined;
}

describe('Departure never says why you came back (dap.51)', () => {
  const arrival = allSetups('arrival');
  const departure = allSetups('departure');
  const at = (list: RunSetup[], i: number) => list[i % list.length];

  /** Seeds 1-10 by every bot style, for one level: each seed runs a spread of the level's setups. */
  function sweepLevel(level: LevelId, mode: 'standalone' | 'carried') {
    const hits: string[] = [];
    let screens = 0;
    let purpose = 0;
    let runs = 0;
    for (let seed = 1; seed <= 10; seed++)
      BOT_STYLES.forEach((style, k) => {
        for (let j = 0; j < 12; j++) {
          const pick = seed * 37 + k * 11 + j * 53;
          let setup: RunSetup = { ...at(level === 'arrival' ? arrival : departure, pick), seed };
          if (mode === 'carried') {
            const file = carried(style, { ...at(arrival, pick), seed });
            if (!file) continue;
            const out = departure.filter((d) => d.character === file.character);
            setup = { ...at(out, pick), seed, file };
          }
          const r = sweep(style, setup, `${mode} ${style} seed ${seed} ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin}`);
          hits.push(...r.hits);
          screens += r.screens;
          purpose += r.purpose;
          runs++;
        }
      });
    return { hits, screens, purpose, runs };
  }

  it('standalone, seeds 1-10 and every bot style: no desk, supervisor or inspection screen says came back', () => {
    const r = sweepLevel('departure', 'standalone');
    expect(r.hits.slice(0, 10)).toEqual([]);
    expect(r.runs).toBeGreaterThan(500);
    expect(r.purpose).toBeGreaterThan(0);
  }, 300_000);

  it('carried on from Arrival, seeds 1-10 and every bot style: no desk, supervisor or inspection screen says came back', () => {
    const r = sweepLevel('departure', 'carried');
    expect(r.hits.slice(0, 10)).toEqual([]);
    expect(r.runs).toBeGreaterThan(300);
    expect(r.purpose).toBeGreaterThan(0);
  }, 300_000);

  it('Arrival keeps its wording: the same screens still say why you came back', () => {
    const r = sweepLevel('arrival', 'standalone');
    expect(r.hits.length).toBeGreaterThan(0);
  }, 300_000);

  it('each purpose line has its own Departure wording, and Arrival keeps the old one', () => {
    const keys = [
      'insp.issue.purpose', 'insp.issue.purpose.verified', 'insp.issue.purpose.reopened',
      'supervisor.announce.purpose', 'supervisor.settled.purpose', 'topic.purpose.helps',
      'claim.familyVisit.recorded', 'claim.shortTrip.recorded',
    ];
    const arrivalText = keys.map((k) => t(k));
    setStory('departure');
    try {
      keys.forEach((k, i) => {
        const out = t(k);
        expect(out, k).not.toBe(arrivalText[i]);
        expect(out, k).not.toMatch(CAME_BACK);
        expect(out, k).not.toMatch(/\breturn\b/i);
      });
    } finally {
      setStory(undefined);
    }
    expect(arrivalText.filter((x) => CAME_BACK.test(x)).length).toBeGreaterThanOrEqual(6);
  });
});
