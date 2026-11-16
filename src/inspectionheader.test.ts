// The inspection header says why the supervisor came, and goes once she is done
// (border_crossing_game-dap.48). An inspection comes at Scrutiny 3/3 or, since dap.13,
// for the point she announced before the last desk at any scrutiny above 0, so the
// scene's chip names which. The reaction to an inspection answer comes after choose()
// has dropped scrutiny to SCRUTINY_AFTER_INSPECTION, so the strip no longer says
// Secondary inspection over Scrutiny 1/3.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BOT_STYLES, playRun, setupFor } from './game/bots';
import { MAX_SCRUTINY, SCRUTINY_AFTER_INSPECTION } from './game/content/world';
import { inspectionIssue, inspectionReason, newRun, step } from './game/engine';
import type { RunState } from './game/types';
import { en } from './i18n/en';
import { TopStrip, officerLabel } from './ui/parts';

const noop = () => {};
const decode = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
/** The strip's "1 / 3 · <name>" line, as text. */
function progress(s: RunState): string {
  const m = /<p class="progress-label">(.*?)<\/p>/.exec(renderToStaticMarkup(createElement(TopStrip, { s, onScrutiny: noop })));
  return m ? decode(m[1].replace(/<[^>]*>/g, '')) : '';
}

const SECONDARY = 'Secondary inspection';
const SEEDS = 60;

/**
 * Every inspection card the bots reach, every reaction to an inspection answer,
 * and every reaction that shows while the inspection is already dealt (the
 * desk's answer to the card before it).
 */
function inspectionStates(): { cards: RunState[]; answered: RunState[]; leadIns: RunState[] } {
  const cards: RunState[] = [];
  const answered: RunState[] = [];
  const leadIns: RunState[] = [];
  for (const style of BOT_STYLES)
    for (let i = 0; i < SEEDS; i++)
      for (const mode of ['arrival', 'departure'] as const) {
        const setup = setupFor(i, mode);
        let s = newRun(setup);
        for (const a of playRun(style, setup).actions) {
          const card = s.screen.kind === 'inspection' && !s.reaction;
          if (card) cards.push(s);
          s = step(s, a);
          if (!s.reaction) continue;
          if (card) answered.push(s);
          else if (s.screen.kind === 'inspection') leadIns.push(s);
        }
      }
  return { cards, answered, leadIns };
}

describe('the secondary inspection header (dap.48)', () => {
  const lena = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });

  it('names Scrutiny 3/3 as the reason when scrutiny dealt it', () => {
    // A routine answer that takes scrutiny to the max deals an inspection at the same desk.
    const s: RunState = { ...lena, checkpoint: 1, slot: 1, scrutiny: MAX_SCRUTINY, screen: { kind: 'inspection', id: 's_connection', reason: 'scrutiny' } };
    expect(inspectionReason(s)).toBe('scrutiny');
    expect(officerLabel(s)).toBe(`Supervisor · Scrutiny ${MAX_SCRUTINY}/${MAX_SCRUTINY}`);
    expect(progress(s)).toBe(`2 / 3 · Customs · ${SECONDARY}`);
  });

  it('names the announced point as the reason when she came for it below Scrutiny 3/3', () => {
    const s: RunState = { ...lena, checkpoint: 2, slot: 4, scrutiny: 1, supervisor: 'purpose', screen: { kind: 'inspection', id: 's_supervisor', reason: 'announced' } };
    expect(inspectionIssue(s)).toBe('purpose');
    expect(officerLabel(s)).toBe(`Supervisor · Announced: ${en['topic.purpose.helps']}`);
    expect(progress(s)).toBe(`3 / 3 · Security interview · ${SECONDARY}`);
  });

  it('reads a save from before the reason was stored by the file', () => {
    const announced: RunState = { ...lena, checkpoint: 2, slot: 4, scrutiny: 1, supervisor: 'purpose', screen: { kind: 'inspection', id: 's_supervisor' } };
    expect(inspectionReason(announced)).toBe('announced');
    expect(inspectionReason({ ...announced, scrutiny: MAX_SCRUTINY })).toBe('scrutiny');
    expect(inspectionReason({ ...announced, supervisor: undefined })).toBe('scrutiny');
  });

  const { cards, answered, leadIns } = inspectionStates();

  it(`over ${SEEDS} seeds per style and mode, every inspection card names a reason that holds on the file`, () => {
    const reasons = new Set<string>();
    for (const s of cards) {
      const reason = inspectionReason(s);
      expect(reason).toBeDefined();
      reasons.add(reason!);
      expect(progress(s)).toContain(SECONDARY);
      if (reason === 'scrutiny') {
        expect(s.scrutiny).toBeGreaterThanOrEqual(MAX_SCRUTINY);
        expect(officerLabel(s)).toBe(`Supervisor · Scrutiny ${MAX_SCRUTINY}/${MAX_SCRUTINY}`);
      } else {
        expect(s.supervisor).toBe(inspectionIssue(s));
        expect(officerLabel(s)).toBe(`Supervisor · Announced: ${en[`topic.${inspectionIssue(s)!}.helps` as keyof typeof en]}`);
      }
    }
    // Both ways in happen in play, so both labels are tested on real states.
    expect([...reasons].sort()).toEqual(['announced', 'scrutiny']);
  });

  it('the reaction after an inspection answer no longer reads as an inspection at Scrutiny 1/3', () => {
    expect(answered.length).toBeGreaterThan(0);
    for (const s of answered) {
      expect(s.scrutiny).toBe(SCRUTINY_AFTER_INSPECTION);
      expect(inspectionReason(s)).toBeUndefined();
      expect(progress(s)).not.toContain(SECONDARY);
      expect(officerLabel(s)).not.toMatch(/^Supervisor/);
    }
  });

  it('the desk reaction that leads into an inspection is the desk\'s, at any scrutiny (the announced one comes below 3/3)', () => {
    const below = leadIns.filter((s) => s.scrutiny < MAX_SCRUTINY);
    // Both shapes happen in play: scrutiny reaching 3/3, and the announced point below it.
    expect(below.length).toBeGreaterThan(0);
    expect(leadIns.length).toBeGreaterThan(below.length);
    for (const s of leadIns) {
      expect(inspectionReason(s)).toBeUndefined();
      expect(progress(s)).not.toContain(SECONDARY);
      expect(officerLabel(s)).not.toMatch(/^Supervisor/);
      // Acknowledging it brings up the card, which names the reason.
      const card = step(s, { type: 'ack' });
      expect(inspectionReason(card)).toBe(s.scrutiny < MAX_SCRUTINY ? 'announced' : 'scrutiny');
      expect(progress(card)).toContain(SECONDARY);
    }
  });
});
