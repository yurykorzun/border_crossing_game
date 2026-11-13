// First-run explanations and the stakes lines (border_crossing_game-dap.9): time,
// scrutiny and a caught claim are each explained once, at the moment each first
// matters, and never on a later run; the line on why Ilya stays out of the file
// shows before any card can name him; the missed bus says what it costs.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ending } from '../App';
import { t } from '../i18n';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { caughtLine } from './consequence';
import { messagesSoFar } from './content/queues';
import { newRun, options, waitActions } from './engine';
import type { RunSetup } from './engine';
import { EXPLANATIONS, explanationsDue, explanationsOn, markShown } from './explain';
import type { Explanation } from './explain';
import { recordRun } from './carry';
import { playStep } from './play';
import { SAVE_KEY, freshSave, load, save, startOver } from './save';
import type { Store } from './save';
import { transcriptOf } from './transcript';
import type { RunState } from './types';

/** A long Mark run that loses hours, gains scrutiny and meets a challenge card (the sweep's longest). */
const MARK: RunSetup = { level: 'arrival', character: 'mark', loadout: ['hotel', 'employerLetter', 'hospitalNote', 'deed'], bulletin: 'records', seed: 128 };
/** The same packing on another day, a later run that reaches all three triggers too. */
const LATER: RunSetup = { ...MARK, seed: 139 };

/** Every screen of a bot run, in order, as the player sees them. */
function screens(setup: RunSetup, style: (typeof BOT_STYLES)[number] = 'random'): RunState[] {
  const run = playRun(style, setup);
  let s = newRun(setup);
  const out = [s];
  for (const a of run.actions) {
    s = playStep(s, a);
    out.push(s);
  }
  return out;
}

/** Plays the screens the way src/App.tsx Run does: shows what is due and marks it shown as it shows. */
function play(all: RunState[], shown: string[]): { at: Record<string, number[]>; shown: string[] } {
  const at: Record<string, number[]> = {};
  all.forEach((s, i) => {
    const due = explanationsDue(s, shown);
    for (const e of due) (at[e] ??= []).push(i);
    shown = markShown(shown, due);
  });
  return { at, shown };
}

describe('first-run explanations', () => {
  const all = screens(MARK);
  const first: Record<Explanation, number> = {
    time: all.findIndex((s) => !!s.reaction && (s.changes ?? []).some((c) => c.key === 'change.time')),
    scrutiny: all.findIndex((s) => !!s.reaction && (s.changes ?? []).some((c) => c.key === 'change.scrutiny')),
    caught: all.findIndex((s) => !s.reaction && s.screen.kind === 'encounter' && !!caughtLine(s, s.screen.id)?.key.startsWith('caught.line.')),
  };

  it('the test run reaches all three triggers, more than once for time and scrutiny', () => {
    for (const e of EXPLANATIONS) expect(first[e], e).toBeGreaterThan(-1);
    for (const e of EXPLANATIONS) expect(screens(LATER).some((s) => explanationsOn(s).includes(e)), `later ${e}`).toBe(true);
    expect(all.filter((s) => explanationsOn(s).includes('time')).length).toBeGreaterThan(1);
    expect(all.filter((s) => explanationsOn(s).includes('scrutiny')).length).toBeGreaterThan(1);
  });

  it('on a first run each shows once, on the screen where it first matters', () => {
    const { at } = play(all, []);
    for (const e of EXPLANATIONS) expect(at[e], e).toEqual([first[e]]);
  });

  it('on a second run, from the same save, none shows', () => {
    const { shown } = play(all, []);
    expect([...shown].sort()).toEqual([...EXPLANATIONS].sort());
    const again = play(screens(LATER), shown);
    expect(again.at).toEqual({});
    expect(play(all, shown).at).toEqual({});
  });

  it('the transcript reads each one once, right under what triggered it', () => {
    const tr = transcriptOf(playRun('random', MARK), MARK);
    for (const e of EXPLANATIONS) {
      const lines = tr.lines.filter((l) => l.key === `explain.${e}`);
      expect(lines, e).toHaveLength(1);
      expect(lines[0].chrome, e).toBeUndefined();
      expect(lines[0].text).toBe(t(`explain.${e}`));
      const i = tr.lines.indexOf(lines[0]);
      const before = tr.lines[i - 1].key;
      if (e === 'caught') expect(before).toMatch(/^caught\.line\./);
      else expect(before.split(' · ')[0] === `change.${e}` || tr.lines.slice(i - 8, i).some((l) => l.key.startsWith(`change.${e}`))).toBe(true);
    }
  });

  it('each line is short, says how the rule works and tells no one what to feel', () => {
    for (const e of EXPLANATIONS) {
      const text = t(`explain.${e}`);
      expect(text.split(/\s+/).length, e).toBeLessThanOrEqual(12);
      expect(text).not.toMatch(/—|\b(feel|scared|afraid|worried|nervous|relieved)\b/i);
    }
    expect(t('explain.scrutiny')).toMatch(/3\/3/);
  });
});

describe('the stakes come before the strategy', () => {
  it("your mother's message says why Ilya stays out of the file, and it shows before any card or check can name him", () => {
    const why = 'msg.0.1.lena';
    expect(t(why)).toMatch(/Ilya/);
    expect(t(why)).toMatch(/fundraiser/);
    let offers = 0;
    for (const style of BOT_STYLES)
      for (let i = 0; i < 40; i++) {
        const setup = setupFor(i);
        if (setup.character !== 'lena') continue;
        for (const s of screens(setup, style)) {
          const offered = [...options(s).map((o) => o.contact), ...waitActions(s).map((w) => w.contact)];
          if (!offered.includes('cousin')) continue;
          offers++;
          expect(messagesSoFar(s).map((b) => b.key), `${style} ${i}`).toContain(why);
        }
      }
    expect(offers).toBeGreaterThan(0);
  });

  it('the missed-bus ending says what is lost, under its title', () => {
    const lost = t('ending.missedBus.lost');
    expect(lost).toMatch(/tomorrow/);
    expect(lost).toMatch(/mother/);
    const run: RunState = {
      ...newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 }),
      checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending: 'tooLate', time: 0,
    };
    const html = renderToStaticMarkup(createElement(Ending, { s: run, onChoose: () => {}, onRetry: () => {}, onNext: () => {} }));
    const title = html.indexOf(`<h1>${t('ending.missedBus.title')}</h1>`);
    const line = html.indexOf(`<p class="lost">${lost.replace(/'/g, '&#x27;')}</p>`);
    expect(title).toBeGreaterThan(-1);
    expect(line).toBeGreaterThan(title);
    // Too late with hours left is not the missed bus, so it has no such line.
    const late = renderToStaticMarkup(createElement(Ending, { s: { ...run, time: 1 }, onChoose: () => {}, onRetry: () => {}, onNext: () => {} }));
    expect(late).not.toContain('class="lost"');
  });
});

describe('the save keeps what was shown (dap.40)', () => {
  /** localStorage as a Map, so save() and load() run as they do in the browser. */
  const memory = (): Store => {
    const m = new Map<string, string>();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
  };

  /**
   * Plays the screens the way src/App.tsx Game does, through the save: each screen is
   * recorded (recordRun()), what it shows is marked shown as it shows (useExplanations()),
   * and the save is written and read back after every screen, as a reload would.
   */
  function playSaved(store: Store, all: RunState[]): Record<string, number[]> {
    const at: Record<string, number[]> = {};
    all.forEach((s, i) => {
      let d = recordRun(load(store), s);
      const due = explanationsDue(s, d.explained);
      for (const e of due) (at[e] ??= []).push(i);
      d = { ...d, explained: markShown(d.explained, due) };
      save(store, d);
      // A reload on this very screen: the run comes back, and nothing shows again.
      const back = load(store);
      expect(back.run, `screen ${i}`).toEqual(s);
      expect(explanationsDue(back.run!, back.explained), `reload on screen ${i}`).toEqual([]);
    });
    return at;
  }

  it('time, scrutiny and a caught claim each show once on the first run and are in the save from that screen on', () => {
    const store = memory();
    const at = playSaved(store, screens(MARK));
    for (const e of EXPLANATIONS) expect(at[e], e).toHaveLength(1);
    expect([...load(store).explained].sort()).toEqual([...EXPLANATIONS].sort());
  });

  it('Retry, New crossing and a later run on the same save show none of them', () => {
    const store = memory();
    playSaved(store, screens(MARK));
    // Retry and New crossing drop the run and keep the rest (startOver()).
    save(store, startOver(load(store)));
    expect(load(store).explained).toHaveLength(EXPLANATIONS.length);
    expect(playSaved(store, screens(MARK))).toEqual({});
    save(store, startOver(load(store)));
    expect(playSaved(store, screens(LATER))).toEqual({});
  });

  it('a save from before the list existed loads as none shown, and a written list loads back', () => {
    const store = memory();
    const { explained, ...old } = freshSave();
    expect(explained).toEqual([]);
    store.set(SAVE_KEY, JSON.stringify(old));
    expect(load(store).explained).toEqual([]);
    save(store, { ...load(store), explained: ['time'] });
    expect(load(store).explained).toEqual(['time']);
  });
});
