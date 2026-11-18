// The setup screens and the Evidence sheet agree with themselves (border_crossing_game-dap.37).
// Found on the live site after PR #52: the level list said "1 / 4", Arrival's traveler
// screen "2 / 4", Departure's "2 / 5", and Before you cross had no count; the Return
// ticket's packing row said "Reveals your departure date" while its Evidence line said
// "nothing goes on file"; and Father's medicine had no line under it in the Evidence sheet.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Picks } from './App';
import { defaultFile } from './game/carry';
import { packDetail } from './game/consequence';
import { LEVELS } from './game/content/levels';
import { EVIDENCE_IDS } from './game/content/world';
import { newRun } from './game/engine';
import type { LevelId } from './game/types';
import { allSetups } from './game/walk';
import { EvidenceContent } from './ui/parts';
import { setStory, t } from './i18n';

const LEVEL_IDS = ['arrival', 'departure'] as const satisfies readonly LevelId[];
const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** One setup screen as a returning player with both levels open sees it, Lena picked. */
function screen(level: LevelId, at: 'level' | 'traveler' | 'record' | 'documents' | 'begin') {
  const file = LEVELS[level].readsFile && at !== 'record' ? defaultFile(1, 'lena') : undefined;
  return renderToStaticMarkup(createElement(Picks, {
    bulletin: 'customs', next: { level, character: 'lena' }, endingsSeen: ['tooLate'], levelsFinished: ['arrival'],
    savedFile: null, seed: 1, onExit: () => {}, onStart: () => {}, opensAt: { at, file },
  }));
}

/** Every "n / total" on a screen. */
const counters = (html: string) => [...plain(html).matchAll(/(\d+) \/ (\d+)/g)].map((m) => ({ n: Number(m[1]), total: Number(m[2]) }));

describe('setup step counters', () => {
  for (const level of LEVEL_IDS) {
    it(`${level}: one counter per screen, the same total, going up by one`, () => {
      const walk = ['traveler', ...(LEVELS[level].readsFile ? ['record' as const] : []), 'documents', 'begin'] as const;
      const seen = walk.map((at) => {
        const html = screen(level, at);
        // The right screen opened, so the count is that screen's.
        expect(html, at).toContain(`${at}-step`);
        const found = counters(html);
        expect(found, `${level} ${at}: ${plain(html).slice(0, 120)}`).toHaveLength(1);
        return found[0];
      });
      expect(seen.map((c) => c.total)).toEqual(walk.map(() => walk.length));
      expect(seen.map((c) => c.n)).toEqual(walk.map((_, i) => i + 1));
    });
  }

  it('the level list shows no count, because its total depends on the level picked there', () => {
    const html = screen('arrival', 'level');
    expect(html).toContain('level-step');
    expect(counters(html)).toEqual([]);
    expect(plain(html)).toContain(t('ui.level'));
  });
});

describe('packing and the Evidence sheet', () => {
  for (const id of EVIDENCE_IDS) {
    it(`${id}: the packing row and the Evidence line agree on what goes on file`, () => {
      const reveals = packDetail(id).length > 1;
      const desc = t(`ev.${id}.desc`);
      expect(/nothing goes on file/i.test(desc), desc).toBe(false);
      expect(/Puts .* on file\./.test(desc), `${desc} (packing ${reveals ? 'reveals' : 'reveals nothing'})`).toBe(reveals);
    });
  }

  for (const level of LEVEL_IDS) {
    for (const medicine of [true, false]) {
      it(`${level}, medicine ${medicine ? 'carried' : 'lost'}: every Evidence item has a description line`, () => {
        setStory(level);
        try {
          const s = { ...newRun(allSetups(level)[0]), loadout: [...EVIDENCE_IDS], medicine };
          const items = renderToStaticMarkup(createElement(EvidenceContent, { s })).split('<li').slice(1);
          expect(items).toHaveLength(EVIDENCE_IDS.length + 1);
          for (const item of items) {
            const p = item.match(/<p>([^<]+)<\/p>/)?.[1] ?? '';
            expect(p.trim().length, plain(`<li${item}`)).toBeGreaterThan(0);
          }
        } finally {
          setStory(undefined);
        }
      });
    }
  }
});
