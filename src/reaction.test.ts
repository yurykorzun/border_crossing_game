// After each answer the screen says what happened, what changed and what it resolves
// (design rule 3, border_crossing_game-dap.6), in plain words: the engine's words for a
// challenge ("disproof", "suspicion", "testimony") stay off the main screen, and the
// on-file tier labels stay on the records screen.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Reaction } from './App';
import { BOT_STYLES, playRun, setupFor } from './game/bots';
import { changeText } from './game/consequence';
import { newRun } from './game/engine';
import { playStep } from './game/play';
import type { RunState, Topic } from './game/types';
import { en } from './i18n/en';
import { StoryRecords } from './ui/parts';

const noop = () => {};
const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const text = (markup: string) => decode(markup.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const reaction = (s: RunState) => renderToStaticMarkup(createElement(Reaction, { s, dispatch: noop }));

/** The text of the block marked data-line="<name>", or '' when the screen has none. */
function block(markup: string, name: 'happened' | 'changed' | 'resolves'): string {
  const m = new RegExp(`<(div|ul)[^>]*data-line="${name}"[^>]*>(.*?)</\\1>`).exec(markup);
  return m ? text(m[2]) : '';
}

const ENGINE_WORDS = /disproof|suspicion|testimony/i;
const TIER_LABELS = ['ui.tier.recorded', 'ui.tier.confirmed', 'ui.tier.flagged'].map((k) => en[k as keyof typeof en]);

describe('the reaction after a verified answer', () => {
  // Lena shows the return ticket for "How long are you staying?": it answers the question outright.
  const lena = newRun({ character: 'lena', loadout: ['returnTicket', 'employerLetter', 'deed'], bulletin: 'records', seed: 7 });
  const asked: RunState = { ...lena, screen: { kind: 'encounter', id: 'p_stay' }, seen: ['p_stay'], slot: 2 };
  const after = playStep(asked, { type: 'choose', approach: 'evidence' });
  const markup = reaction(after);

  it('shows what happened, what changed and what it resolves, in that order', () => {
    const happened = block(markup, 'happened');
    const changed = block(markup, 'changed');
    const resolves = block(markup, 'resolves');
    expect(happened).not.toBe('');
    // A no-cost answer still changes one thing: the document is spent.
    expect(changed).toBe('Used: Return ticket.');
    expect(resolves).toBe(en['resolve.stay']);
    expect(markup.indexOf('data-line="happened"')).toBeLessThan(markup.indexOf('data-line="changed"'));
    expect(markup.indexOf('data-line="changed"')).toBeLessThan(markup.indexOf('data-line="resolves"'));
  });

  it('names the spent document next to another change (border_crossing_game-dap.28)', () => {
    // The mother's letter at p_purpose puts the family address on file and is spent.
    const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
    const s = playStep({ ...base, screen: { kind: 'encounter', id: 'p_purpose' }, slot: 3, seen: ['p_host', 'p_purpose'] }, { type: 'choose', approach: 'evidence' });
    const m = reaction(s);
    expect(block(m, 'changed')).toContain(en['fact.familyAddress']);
    expect(block(m, 'resolves')).toContain("Mother's letter used");
  });

  it('keeps the engine words and the tier labels off it', () => {
    expect(text(markup)).not.toMatch(ENGINE_WORDS);
    for (const label of TIER_LABELS) expect(text(markup)).not.toContain(label);
  });
});

describe('every reaction the bots reach', () => {
  // Each style over 40 setups of both travelers: every reaction screen it sees, with its changes.
  const screens: RunState[] = [];
  for (const style of BOT_STYLES)
    for (let i = 0; i < 120; i += 3) {
      const setup = setupFor(i);
      let s = newRun(setup);
      for (const action of playRun(style, setup).actions) {
        s = playStep(s, action);
        if (s.reaction) screens.push(s);
      }
    }

  it('reaches challenges, on-file facts and settled questions', () => {
    const keys = new Set(screens.flatMap((s) => (s.changes ?? []).map((c) => c.key.split('.').slice(0, 2).join('.'))));
    for (const k of ['change.claim', 'change.onFile', 'resolve.']) expect([...keys].some((x) => x.startsWith(k)), k).toBe(true);
  });

  it('never says disproof, suspicion or testimony, and never shows a tier label', () => {
    const bad = screens.map((s) => text(reaction(s))).filter((x) => ENGINE_WORDS.test(x) || TIER_LABELS.some((l) => x.includes(l)));
    expect(bad).toEqual([]);
  });

  it('shows the resolves block only for a question it settled', () => {
    for (const s of screens) {
      const settled = (s.changes ?? []).filter((c) => c.resolves).map(changeText);
      expect(block(reaction(s), 'resolves')).toBe(settled.join(' '));
    }
  });
});

describe('a point reopened by a new flag and settled again (border_crossing_game-dap.28)', () => {
  // Every bot step that settles a point a new flag had reopened, with its reaction.
  const again: { s: RunState; topic: string }[] = [];
  for (const style of BOT_STYLES)
    for (let i = 0; i < 120; i++) {
      const setup = setupFor(i);
      let s = newRun(setup);
      for (const action of playRun(style, setup).actions) {
        const n = playStep(s, action);
        for (const [topic, v] of Object.entries(n.verified ?? {}))
          if (n.reaction && s.verified?.[topic as Topic] && v.flags === (n.flagged ?? []).length && s.verified[topic as Topic]!.flags !== (s.flagged ?? []).length)
            again.push({ s: n, topic });
        s = n;
      }
    }

  it('says it is settled, in a line that shows anyway', () => {
    expect(again.length).toBeGreaterThan(0);
    for (const { s, topic } of again) {
      const lines = s.changes ?? [];
      const keys = lines.flatMap((c) => [c.key, ...(c.also ?? []).map((a) => a.key)]);
      expect(keys.some((k) => k === `resolve.${topic}` || k === `resolve.used.${topic}`), `${topic}: ${keys.join(', ')}`).toBe(true);
      expect(text(reaction(s))).toContain(changeText(lines.find((c) => [c.key, ...(c.also ?? []).map((a) => a.key)].some((k) => k.endsWith(`.${topic}`) && k.startsWith('resolve.')))!));
    }
  });
});

describe('the records screen', () => {
  it('still names how each fact sits on file', () => {
    // A records day: the mother's letter at passport puts the family address on file, found in the old records.
    const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
    const s = playStep({ ...base, screen: { kind: 'encounter', id: 'p_purpose' }, slot: 3, seen: ['p_host', 'p_purpose'] }, { type: 'choose', approach: 'evidence' });
    const records = text(renderToStaticMarkup(createElement(StoryRecords, { s })));
    expect(records).toContain(en['ui.tier.recorded']);
    expect(text(reaction(s))).not.toContain(en['ui.tier.recorded']);
  });
});

describe('the records screen over the bot runs', () => {
  it('shows all three tier labels: in the old records, confirmed on this crossing, flagged', () => {
    const seen = new Set<string>();
    for (const style of BOT_STYLES)
      for (let i = 0; i < 120; i += 3) {
        const setup = setupFor(i);
        let s = newRun(setup);
        for (const action of playRun(style, setup).actions) s = playStep(s, action);
        const records = text(renderToStaticMarkup(createElement(StoryRecords, { s })));
        for (const l of TIER_LABELS) if (records.includes(l)) seen.add(l);
      }
    expect([...seen].sort()).toEqual([...TIER_LABELS].sort());
  });
});
