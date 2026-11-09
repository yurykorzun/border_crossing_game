// The top strip's "1 / 3 · Passport control" against the scene behind it.
// The last reaction at a checkpoint shows with the next queue already set, so
// both have to stay on the checkpoint just finished until it is acknowledged.
import { describe, expect, it } from 'vitest';
import { playRun, setupFor } from './bots';
import { newRun, shownCheckpoint } from './engine';
import type { RunSetup } from './engine';
import { transcriptOf } from './transcript';
import type { RunState } from './types';
import { CHECKPOINTS } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'hotel', 'employerLetter'], bulletin: 'records', seed: 7 };
const said = [{ key: 'reaction.test' }] as unknown as RunState['reaction'];

describe('shownCheckpoint', () => {
  const s = newRun(lena);

  it('keeps the finished checkpoint while its last reaction shows', () => {
    expect(shownCheckpoint({ ...s, checkpoint: 1, screen: { kind: 'between', next: 1 }, reaction: said })).toBe(0);
    expect(shownCheckpoint({ ...s, checkpoint: 2, screen: { kind: 'between', next: 2 }, reaction: said })).toBe(1);
  });

  it('moves on once the reaction is acknowledged', () => {
    expect(shownCheckpoint({ ...s, checkpoint: 1, screen: { kind: 'between', next: 1 }, reaction: null })).toBe(1);
    expect(shownCheckpoint(s)).toBe(0);
  });

  it('is the current checkpoint at a card, capped at the last', () => {
    expect(shownCheckpoint({ ...s, checkpoint: 2, screen: { kind: 'encounter', id: 'x' } })).toBe(2);
    expect(shownCheckpoint({ ...s, checkpoint: 3, reaction: said, screen: { kind: 'encounter', id: 'x' } })).toBe(2);
  });
});

describe('top strip in the transcript', () => {
  it('counts the checkpoint the scene shows on every screen, the last reaction included', () => {
    // setupFor() cycles Lena's setups first, then Mark's; 60 is Mark's first.
    for (const [i, style] of [[4, 'honest'], [4, 'liar'], [60, 'honest']] as const) {
      const setup = setupFor(i);
      const run = playRun(style, setup);
      const tr = transcriptOf(run, setup);
      let checked = 0;
      let lastReactions = 0;
      for (const st of new Set(tr.lines.map((l) => l.step))) {
        const chrome = tr.lines.filter((l) => l.step === st && l.chrome);
        const at = CHECKPOINTS.findIndex((c) => chrome.some((l) => l.key === `scene.${c}`));
        const progress = chrome.find((l) => l.key === 'ui.progress');
        if (at < 0 || !progress) continue;
        expect(progress.text, `${style} ${i} step ${st}`).toContain(`${at + 1} / ${CHECKPOINTS.length}`);
        // The officer's label stays up with the scene.
        expect(chrome.some((l) => l.key.startsWith('officer.') || l.key === 'ui.waiting'), `${style} ${i} step ${st}`).toBe(true);
        checked++;
        if (tr.lines.some((l) => l.step === st && /^ui\.proceed\.(customs|interview)$/.test(l.key))) lastReactions++;
      }
      expect(checked).toBeGreaterThan(0);
      expect(lastReactions, `${style} ${i}`).toBeGreaterThan(0);
    }
  });
});
