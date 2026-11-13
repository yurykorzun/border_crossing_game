// Every cost shown before you commit, and no hidden last inspection
// (border_crossing_game-dap.13). Each answer button names its guaranteed costs
// (hours, a document spent, a person named, scrutiny) before it is picked, the
// line next to the answers is hours left minus the trip after the border, and
// below Scrutiny 3/3 a supervisor inspects only for the open point she announced
// on the way to the last desk.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AffordLabel, Panel } from './App';
import { BOT_STYLES, playRun, setupFor } from './game/bots';
import { eventKey } from './game/consequence';
import { CORE_CARDS, INSPECTION_BY_ID } from './game/content/encounters';
import { LEVEL_IDS } from './game/content/levels';
import { MAX_SCRUTINY, SCRUTINY_AFTER_INSPECTION } from './game/content/world';
import { chooseAction, deskOf, newRun, options, pointVerified, spareHours, step, travelOf } from './game/engine';
import type { Option, RunSetup } from './game/engine';
import { CHECKPOINTS } from './game/types';
import type { LevelId, RunState } from './game/types';
import { has, t, tn } from './i18n';

const noop = () => {};
const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const text = (markup: string) => decode(markup.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const panel = (s: RunState) => renderToStaticMarkup(createElement(Panel, { s, dispatch: noop, reduceWait: true, explain: [] }));
/** The text of each answer button, in the order options() gives them. */
const buttons = (markup: string) => [...markup.matchAll(/<button class="choice"[^>]*>(.*?)<\/button>/g)].map((m) => text(m[1]));
/** The time budget over the answers (AffordLabel, on the scene right above the question). */
const afford = (s: RunState) => text(renderToStaticMarkup(createElement(AffordLabel, { s })));

const SEEDS = 12;
// Inspections are rarer than answer screens, so their check plays more seeds.
const INSPECT_SEEDS = 120;

/** Every state a bot run passes through, with the action taken from it. */
function walk(style: (typeof BOT_STYLES)[number], i: number, level: LevelId): { s: RunState; n: RunState }[] {
  const setup = setupFor(i, level);
  const run = playRun(style, setup);
  let s = newRun(setup);
  const out: { s: RunState; n: RunState }[] = [];
  for (const a of run.actions) {
    const n = step(s, a);
    out.push({ s, n });
    s = n;
  }
  return out;
}

const sum = (o: Option, k: 'time' | 'scrutiny') => o.effects.reduce((n, e) => n + (k in e ? (e as Record<typeof k, number>)[k] : 0), 0);

describe('every answer shows its guaranteed costs before it is picked', () => {
  it(`over ${SEEDS} seeds per style and level, each button names its hours, document, person and scrutiny`, () => {
    let checked = 0;
    let documents = 0;
    for (const level of LEVEL_IDS)
      for (const style of BOT_STYLES)
        for (let i = 0; i < SEEDS; i++)
          for (const { s } of walk(style, i, level)) {
            if (s.reaction || s.ending || (s.screen.kind !== 'encounter' && s.screen.kind !== 'inspection')) continue;
            const prefix = s.screen.kind === 'inspection' ? 'insp' : 'enc';
            const id = s.screen.id;
            const markup = panel(s);
            const labels = buttons(markup);
            const opts = options(s);
            expect(labels.length).toBe(opts.length);
            opts.forEach((o, k) => {
              if (o.blocked || o.documents) return;
              const line = labels[k];
              const name = `${level} ${style} seed ${i + 1} ${id}.${o.approach.id}: ${line}`;
              const cardKey = `${prefix}.${id}.${o.approach.id}`;
              const hours = -sum(o, 'time');
              const misses = line.includes(t('ui.line.miss'));
              if (hours > 0 && !misses) expect(line, name).toContain(tn('ui.line.event', hours, { event: eventKey(o, cardKey) }));
              const scrutiny = sum(o, 'scrutiny');
              if (scrutiny) expect(line, name).toContain(t('ui.line.scrutiny', { n: scrutiny }));
              // A document is spent even when no time is: "Uses letter".
              if (o.card) {
                documents++;
                expect(line, name).toContain(t('ui.line.uses', { cardShort: o.card }));
              }
              if (o.contact) {
                const key = has(`${cardKey}.contact`) ? `${cardKey}.contact` : `contact.${o.contact}.shares`;
                expect(line, name).toContain(t(key, { contact: o.contact }));
              }
              // A cost line names only what this answer adds: no fact this desk already has.
              for (const e of o.effects)
                if ('fact' in e && s.facts[e.fact]?.includes(deskOf(s))) expect(line, name).not.toContain(t(`fact.${e.fact}.reveal`));
              // "Starts a check" only on an answer that does open one.
              if (line.includes(t('ui.line.check')) && !has(`${cardKey}.check`)) expect(step(s, chooseAction(o)).screen.kind, name).toBe('wait');
              checked++;
            });
          }
    expect(checked).toBeGreaterThan(1000);
    expect(documents).toBeGreaterThan(50);
  });

  it('does not say "Starts a check" or reveal the address again once the address is confirmed', () => {
    // Lena's address was confirmed at passport and is on file at customs.
    const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
    const s: RunState = {
      ...base, checkpoint: 1, slot: 2, screen: { kind: 'encounter', id: 'c_host' }, seen: ['c_host'],
      verified: { accommodation: { desk: 'passport', flags: 0 } }, facts: { familyAddress: ['passport', 'customs'] },
    };
    const markup = panel(s);
    const opts = options(s);
    const k = opts.findIndex((o) => o.approach.id === 'call');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(opts[k].usesVerified).toBe(true);
    const line = buttons(markup)[k];
    expect(line).not.toContain(t('ui.line.check'));
    expect(step(s, chooseAction(opts[k])).screen.kind).not.toBe('wait');
    for (const l of buttons(markup)) expect(l).not.toContain(t('fact.familyAddress.reveal'));
  });
});

describe('the time budget next to the answers', () => {
  it('is hours left minus the trip after the border, on every answer screen', () => {
    let seen = 0;
    for (const level of LEVEL_IDS)
      for (const style of BOT_STYLES)
        for (let i = 0; i < 10; i++)
          for (const { s } of walk(style, i, level)) {
            if (s.reaction || s.ending || (s.screen.kind !== 'encounter' && s.screen.kind !== 'inspection')) continue;
            const n = s.time - travelOf(s);
            expect(spareHours(s)).toBe(n);
            const line = afford(s);
            if (n < 0) expect(line).toBe('');
            else expect(line).toBe(n === 0 ? t('ui.afford.none') : tn('ui.afford', n));
            seen++;
          }
    expect(seen).toBeGreaterThan(100);
  });

  it('reads "You can afford 1 more hour." with one hour to spare', () => {
    const s: RunState = { ...newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 }), screen: { kind: 'encounter', id: 'p_host' }, seen: ['p_host'], slot: 1 };
    const one: RunState = { ...s, time: travelOf(s) + 1 };
    expect(afford(one)).toBe('You can afford 1 more hour.');
  });
});

describe('below Scrutiny 3/3 an inspection only follows an announced, still open point', () => {
  it(`over ${INSPECT_SEEDS} seeds per style and level, every inspection below the max was announced before the last desk`, () => {
    let below = 0;
    let announced = 0;
    for (const level of LEVEL_IDS)
      for (const style of BOT_STYLES)
        for (let i = 0; i < INSPECT_SEEDS; i++) {
          let saidAt: number | undefined;
          for (const { s, n } of walk(style, i, level)) {
            // The announcement shows on screen as the last desk's queue is set, before its first card.
            if (saidAt === undefined && (n.reaction ?? []).some((r) => r.key.startsWith('supervisor.announce.'))) {
              saidAt = s.checkpoint;
              announced++;
              expect(n.screen.kind).toBe('between');
              expect(n.checkpoint).toBe(CHECKPOINTS.length - 1);
              expect(n.reaction).toContainEqual({ key: `supervisor.announce.${n.supervisor}` });
            }
            const started = n.screen.kind === 'inspection' && n.inspections > s.inspections;
            if (!started || s.scrutiny >= MAX_SCRUTINY || n.scrutiny >= MAX_SCRUTINY) continue;
            below++;
            const issue = INSPECTION_BY_ID.get((n.screen as { id: string }).id)!.issue;
            const name = `${level} ${style} seed ${i + 1}`;
            expect(saidAt, name).toBeDefined();
            expect(saidAt!, name).toBeLessThan(CHECKPOINTS.length - 1);
            expect(n.supervisor, name).toBe(issue);
            // The answer just given is on file when she decides, so the state after it is what she reads.
            expect(pointVerified(n, issue), name).toBe(false);
            expect(n.scrutiny, name).toBeGreaterThan(0);
          }
        }
    expect(below).toBeGreaterThan(20);
    expect(announced).toBeGreaterThan(below);
  });

  const lena: RunSetup = { character: 'lena', loadout: ['deed', 'hotel', 'motherLetter'], bulletin: 'customs', seed: 3 };
  /** The last answer of the interview: both core cards seen and the follow-up slot spent. */
  const last = (extra: Partial<RunState>) =>
    step({
      ...newRun(lena), checkpoint: 2, slot: 4, seen: ['p_host', ...CORE_CARDS.interview], decisions: 6, spotChecked: ['passport', 'customs', 'interview'],
      screen: { kind: 'encounter', id: 'i_family' }, ...extra,
    }, { type: 'choose', approach: 'why' }, (rng) => ({ index: 0, rng }));

  it('inspects for the announced point while it is open, and afterwards scrutiny is 1', () => {
    const n = last({ scrutiny: 1, supervisor: 'medicine' });
    expect(n.screen.kind).toBe('inspection');
    expect(INSPECTION_BY_ID.get((n.screen as { id: string }).id)!.issue).toBe('medicine');
    const answer = options({ ...n, reaction: null }).find((o) => !o.blocked && o.approach.kind !== 'withdraw')!;
    const after = step({ ...n, reaction: null }, chooseAction(answer));
    expect(after.scrutiny).toBe(SCRUTINY_AFTER_INSPECTION);
  });

  it('lets you through when the announced point was settled, when nothing was announced, or at Scrutiny 0', () => {
    expect(last({ scrutiny: 2, supervisor: 'medicine', verified: { medicine: { desk: 'interview', flags: 0 } } }).ending).toBe('homeInTime');
    expect(last({ scrutiny: 2 }).ending).toBe('homeInTime');
    expect(last({ scrutiny: 0, supervisor: 'medicine' }).ending).toBe('homeInTime');
  });

  it('keeps a settled point settled until a new flag reopens it', () => {
    const settled = { medicine: { desk: 'interview' as const, flags: 0 } };
    expect(last({ scrutiny: 2, supervisor: 'medicine', verified: settled }).ending).toBe('homeInTime');
    expect(last({ scrutiny: 2, supervisor: 'medicine', verified: settled, flagged: ['phoneRefused'] }).screen.kind).toBe('inspection');
  });

  it('says on the last-desk cards once the announced point is settled', () => {
    const s: RunState = { ...newRun(lena), checkpoint: 2, slot: 1, screen: { kind: 'encounter', id: CORE_CARDS.interview[0] }, seen: [CORE_CARDS.interview[0]], supervisor: 'medicine', scrutiny: 1 };
    expect(text(panel(s))).not.toContain(t('supervisor.settled.medicine'));
    expect(text(panel({ ...s, verified: { medicine: { desk: 'interview', flags: 0 } } }))).toContain(t('supervisor.settled.medicine'));
  });
});
