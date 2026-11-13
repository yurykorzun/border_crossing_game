// Lena and Mark built around different decisions (border_crossing_game-dap.10).
// The traveler screen shows each traveler's five details: why now, what they can
// do, what officials may look at, whom they protect and what they want. Lena
// settles one work question herself and her old donation is on her card before
// any desk can raise it. Mark packs a fourth document, keeps Scrutiny 1 at the
// start, and his second passport costs something only on a card about travel
// history. Every contact speaks in a message before a card offers them.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BeginStep, TRAVELER_DETAILS, TravelerStep } from './App';
import { BOT_STYLES, playRun } from './game/bots';
import { CHECKS, ENCOUNTERS, ENCOUNTER_BY_ID, INSPECTIONS, TRAVEL_HISTORY_CARDS } from './game/content/encounters';
import { messagesSoFar, personalLine } from './game/content/queues';
import { CHARACTERS, CHARACTER_IDS, FIRST_RUN } from './game/content/world';
import { legalActions, newRun, options, step, waitActions } from './game/engine';
import type { RunSetup } from './game/engine';
import { playStep } from './game/play';
import { transcriptOf } from './game/transcript';
import { allSetups } from './game/walk';
import { setStory, t } from './i18n';
import type { Action, CharacterId, LevelId, RunState } from './game/types';
import { CHECKPOINTS } from './game/types';

const LEVELS: readonly LevelId[] = ['arrival', 'departure'];
const lena: RunSetup = { character: 'lena', loadout: ['hospitalNote', 'returnTicket', 'deed'], bulletin: 'customs', seed: 3 };
const mark: RunSetup = { character: 'mark', loadout: ['hospitalNote', 'returnTicket', 'deed', 'hotel'], bulletin: 'customs', seed: 3 };

/** The run at card `id`, its desk's first slot, nothing on screen before it. */
const at = (s: RunState, id: string): RunState => {
  const card = ENCOUNTER_BY_ID.get(id)!;
  return { ...s, reaction: null, checkpoint: CHECKPOINTS.indexOf(card.checkpoint as never), slot: 1, screen: { kind: 'encounter', id }, seen: [...s.seen, id] };
};

const travelerScreen = (initial: CharacterId) =>
  renderToStaticMarkup(createElement(TravelerStep, { initial, count: '1 of 3', onBack: () => {}, onContinue: () => {} }));
/** The text a screen shows, entities decoded, so a line compares with t(). */
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('the traveler screen shows five details for each traveler', () => {
  for (const level of LEVELS)
    it(`${level}: why now, capability, what officials may look at, whom they protect, what they want`, () => {
      setStory(level);
      try {
        for (const id of CHARACTER_IDS) {
          const html = travelerScreen(id);
          expect(html).toContain(`data-traveler-details="${id}"`);
          expect(TRAVELER_DETAILS.map(([label]) => label)).toEqual(['why', 'can', 'asked', 'protects', 'wants']);
          for (const [label, key] of TRAVELER_DETAILS) {
            const line = t(`char.${id}.${key}`);
            expect(line.length, `${id} ${key}`).toBeGreaterThan(10);
            expect(line).not.toMatch(/—/);
            expect(text(html), `${level} ${id} ${label}`).toContain(`${t(`ui.traveler.${label}`)} ${line}`);
          }
          // The person to protect is the traveler's own protected contact, by name.
          expect(t(`char.${id}.protects`)).toContain(t(`contact.${CHARACTERS[id].protectedContact}`).replace(/^your /, ''));
        }
      } finally {
        setStory(undefined);
      }
    });

  it('why now fits the level: coming home to help, then leaving with Dad in care', () => {
    setStory('departure');
    try {
      for (const id of CHARACTER_IDS) expect(t(`char.${id}.why`)).toMatch(/in care/);
    } finally {
      setStory(undefined);
    }
    for (const id of CHARACTER_IDS) expect(t(`char.${id}.why`)).not.toMatch(/in care/);
  });
});

describe("Lena's strength: she settles one work question herself", () => {
  it('her plain answer settles the work card for free, once a run, and Mark has no such answer', () => {
    const s = at(newRun(lena), 'i_employer');
    expect(options(s).some((o) => o.approach.id === 'perk')).toBe(true);
    const n = step(s, { type: 'choose', approach: 'perk' });
    expect(n.perkUsed).toBe(true);
    expect(n.time).toBe(s.time);
    expect(n.scrutiny).toBe(s.scrutiny);
    // The card is answered: the screen moved on to its reaction.
    expect(n.reaction).not.toBeNull();
    // Used once, it is gone for the rest of the run.
    expect(options(at({ ...n, reaction: null }, 'i_employer')).some((o) => o.approach.id === 'perk')).toBe(false);
    expect(options(at(newRun(mark), 'i_employer')).some((o) => o.approach.id === 'perk')).toBe(false);
    expect(CHARACTERS.lena.perkTopics).toEqual(['work']);
  });
});

describe("Mark: an extra document, Scrutiny 1, and a second passport that matters only on travel history", () => {
  it('packs 4 documents where Lena packs 3', () => {
    expect(CHARACTERS.mark.evidenceSlots).toBe(4);
    expect(CHARACTERS.lena.evidenceSlots).toBe(3);
    expect(() => newRun({ ...mark, loadout: ['hospitalNote', 'returnTicket', 'deed'] })).toThrow();
    expect(newRun(mark).loadout).toHaveLength(4);
  });

  it('keeps Scrutiny 1 at the start, and his card says so', () => {
    expect(CHARACTERS.mark.startScrutiny).toBe(1);
    expect(newRun(mark).scrutiny).toBe(1);
    expect(t('char.mark.card')).toMatch(/Scrutiny 1\/3/);
  });

  it('only a card about travel history asks about the second passport', () => {
    expect(TRAVEL_HISTORY_CARDS.length).toBeGreaterThan(0);
    for (const id of TRAVEL_HISTORY_CARDS) expect(t(`enc.${id}.q`)).toMatch(/left on/);
    const mentions = [...ENCOUNTERS, ...INSPECTIONS].filter((c) => JSON.stringify(c).includes('secondPassport')).map((c) => c.id);
    expect(mentions.sort()).toEqual([...TRAVEL_HISTORY_CARDS].sort());
    expect(Object.values(CHECKS).filter((c) => JSON.stringify(c).includes('secondPassport'))).toEqual([]);
    expect(t('char.mark.complication')).toMatch(/travel history/);
  });

  for (const level of LEVELS)
    it(`${level}: in every bot run, the second passport becomes a reason only on a travel history card, and only on a records day`, () => {
      let runs = 0;
      for (const setup of allSetups(level).filter((x) => x.character === 'mark'))
        for (const style of BOT_STYLES) {
          const run = playRun(style, setup);
          let s = newRun(setup);
          for (const a of run.actions as Action[]) {
            const card = s.screen.kind === 'encounter' && !s.reaction ? s.screen.id : undefined;
            const n = playStep(s, a);
            const gained = (n.flagged ?? []).filter((f) => f === 'secondPassport').length > (s.flagged ?? []).filter((f) => f === 'secondPassport').length;
            if (gained) expect(TRAVEL_HISTORY_CARDS, `${level} ${style} ${setup.loadout} ${setup.bulletin}`).toContain(card);
            s = n;
          }
          if (setup.bulletin !== 'records') expect(s.seen.filter((id) => TRAVEL_HISTORY_CARDS.includes(id))).toEqual([]);
          runs++;
        }
      expect(runs).toBeGreaterThan(0);
    });
});

describe("Lena's complication is the donation, shown before any desk", () => {
  it('her complication line names the donation, and so does her card', () => {
    expect(t('char.lena.complication')).toMatch(/donation/);
    expect(t('char.lena.card')).toMatch(/donation/);
    expect(text(travelerScreen('mark'))).toContain(t('char.lena.card'));
  });

  it('the first run skips the traveler screen, so Before you cross shows it under her name', () => {
    expect(FIRST_RUN.character).toBe('lena');
    const html = renderToStaticMarkup(createElement(BeginStep, { level: 'arrival', picked: [...FIRST_RUN.loadout], traveler: 'lena', onBegin: () => {} }));
    expect(text(html)).toContain(t('char.lena.complication'));
  });

  for (const level of LEVELS)
    it(`${level}: in every Lena transcript, the donation is read on a setup screen before any desk line mentions it`, () => {
      let desks = 0;
      for (const setup of allSetups(level).filter((x) => x.character === 'lena').slice(0, 20))
        for (const style of BOT_STYLES) {
          const tr = transcriptOf(playRun(style, setup), setup);
          const read = tr.lines.filter((l) => !l.chrome && !l.once);
          const first = read.findIndex((l) => /donat/i.test(l.text));
          expect(first).toBeGreaterThanOrEqual(0);
          expect(read[first].key).toMatch(/^char\.lena\./);
          const desk = read.findIndex((l) => /^(enc|insp|check)\./.test(l.key) && /donat|fundraiser|fund\b/i.test(l.text));
          if (desk >= 0) {
            desks++;
            expect(first).toBeLessThan(desk);
          }
        }
      expect(desks).toBeGreaterThan(0);
    });
});

describe('every contact speaks before any card offers them', () => {
  for (const level of LEVELS)
    it(`${level}: both travelers, every setup and bot style`, () => {
      const offered: Record<CharacterId, Set<string>> = { lena: new Set(), mark: new Set() };
      for (const setup of allSetups(level))
        for (const style of BOT_STYLES) {
          const run = playRun(style, setup);
          let s = newRun(setup);
          const check = () => {
            const names = [...options(s).map((o) => o.contact), ...waitActions(s).map((w) => w.contact)].filter((c) => c !== undefined);
            if (!names.length) return;
            const heard = messagesSoFar(s).map((b) => b.key);
            for (const c of names) {
              offered[s.character].add(c);
              expect(heard, `${level} ${style} ${setup.character} ${setup.loadout} ${c}`).toContain(personalLine(s.character, c, level));
            }
          };
          for (const a of run.actions as Action[]) {
            check();
            s = playStep(s, a);
          }
          check();
          expect(legalActions(s)).toBeDefined();
        }
      // Both travelers' contacts really were offered somewhere.
      for (const id of CHARACTER_IDS) expect(offered[id].size, `${level} ${id}`).toBeGreaterThan(0);
    });
});
