// The daily crossing (border_crossing_game-rwf.7): the date picks the level, the
// traveler and the three bulletins, and with carry-over on the officers remember
// what you claimed in your last daily crossing (the shuttle trader).
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { addDays, dailyEvalSetup, dailyRunSetup, dailySeed, dailySetup, dateKey, dealSeed, remembered } from './daily';
import { bulletinOf, deskOf, legalActions, loggedAt, newRun } from './engine';
import { botAction, botSeed } from './bots';
import { recordRun } from './carry';
import { playStep } from './play';
import { freshSave, load, save } from './save';
import type { Store } from './save';
import { BULLETINS, CHARACTER_IDS } from './content/world';
import { LEVEL_IDS } from './content/levels';
import type { Action, CharacterId, EvidenceId, RunState } from './types';
import { CHECKPOINTS } from './types';

const DAYS = Array.from({ length: 30 }, (_, i) => addDays('2026-11-01', i));
const shared = (date: string) => {
  const d = dailySetup(date);
  return { level: d.level, character: d.character, bulletins: d.bulletins };
};

describe('one shared setup per date', () => {
  it('gives the same level, traveler and three bulletins every time for the same date', () => {
    for (const date of DAYS) {
      const a = dailySetup(date);
      expect(dailySetup(date), date).toEqual(a);
      expect(LEVEL_IDS).toContain(a.level);
      expect(CHARACTER_IDS).toContain(a.character);
      expect(a.bulletins, date).toHaveLength(3);
      for (const b of a.bulletins) expect(BULLETINS).toContain(b);
      // The packing is the player's; the shared setup does not depend on it.
      expect(dailyRunSetup(a, ['hotel', 'motherLetter', 'deed']).bulletins).toEqual(a.bulletins);
    }
  });

  it('gives a different setup on a different date in most cases', () => {
    const differs = DAYS.slice(1).filter((date, i) => JSON.stringify(shared(date)) !== JSON.stringify(shared(DAYS[i])));
    // 2 travelers x 27 bulletin rows: two days match about 1 time in 54.
    expect(differs.length).toBeGreaterThanOrEqual(26);
    expect(new Set(DAYS.map((d) => JSON.stringify(shared(d)))).size).toBeGreaterThanOrEqual(20);
    // Both travelers and every bulletin turn up over a month.
    expect(new Set(DAYS.map((d) => dailySetup(d).character)).size).toBe(2);
    expect(new Set(DAYS.flatMap((d) => dailySetup(d).bulletins)).size).toBe(3);
    expect(new Set(DAYS.map(dailySeed)).size).toBe(30);
  });

  it('deals the same cards for the same date and packing, in any packing order', () => {
    expect(dealSeed('2026-11-10', ['deed', 'hotel', 'motherLetter'])).toBe(dealSeed('2026-11-10', ['motherLetter', 'deed', 'hotel']));
    expect(dealSeed('2026-11-10', ['deed', 'hotel', 'motherLetter'])).not.toBe(dealSeed('2026-11-11', ['deed', 'hotel', 'motherLetter']));
    expect(dealSeed('2026-11-10', ['deed', 'hotel', 'motherLetter'])).not.toBe(dealSeed('2026-11-10', ['deed', 'hotel', 'returnTicket']));
  });

  it('takes the date from outside, as the local calendar day', () => {
    expect(dateKey(new Date(2026, 10, 10, 23, 59))).toBe('2026-11-10');
    expect(dateKey(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(() => dailySetup('10/11/2026')).toThrow(/YYYY-MM-DD/);
  });

  it('puts each desk under its own bulletin in the run', () => {
    const day = { ...dailySetup('2026-11-10'), bulletins: ['records', 'customs', 'accommodation'] as const };
    const s = newRun(dailyRunSetup({ ...day, bulletins: [...day.bulletins] }, packingFor(day.character)));
    expect(s.daily).toBe('2026-11-10');
    expect(CHECKPOINTS.map((desk) => bulletinOf(s, desk))).toEqual(['records', 'customs', 'accommodation']);
    expect(bulletinOf({ ...s, checkpoint: 1 })).toBe('customs');
    // A level run has one bulletin at every desk, as before.
    const level = newRun({ character: 'lena', loadout: ['hotel', 'motherLetter', 'deed'], bulletin: 'records', seed: 1 });
    expect(CHECKPOINTS.map((desk) => bulletinOf(level, desk))).toEqual(['records', 'records', 'records']);
    expect(level.bulletins).toBeUndefined();
    expect(level.daily).toBeUndefined();
  });

  it('lists a bulletin per desk on the packing screen', () => {
    expect(t('ui.dailyBulletin', { desk: 'passport', text: t('bulletin.records') })).toBe('Passport control: IDs are checked against old records.');
  });

  it('plays every eval setup over 30 dates with the date\'s traveler and bulletins', () => {
    for (let i = 0; i < 90; i++) {
      const s = dailyEvalSetup(i, '2026-11-01');
      const day = dailySetup(DAYS[i % 30]);
      expect(s.daily).toBe(day.date);
      expect([s.character, s.bulletins]).toEqual([day.character, day.bulletins]);
    }
  });
});

/** The first packing a traveler can take. */
function packingFor(c: CharacterId): EvidenceId[] {
  return c === 'lena' ? ['hotel', 'motherLetter', 'deed'] : ['hotel', 'motherLetter', 'employerLetter', 'deed'];
}

/** Steps `s` with `pick` where it returns an action, else the first legal one, until `until` holds or the run ends. */
function playUntil(s: RunState, until: (s: RunState) => boolean, pick: (s: RunState) => Action | undefined = () => undefined): RunState {
  for (let i = 0; i < 400 && !s.ending && !until(s); i++) s = playStep(s, pick(s) ?? legalActions(s)[0]);
  return s;
}

const onCard = (id: string) => (s: RunState) => !s.reaction && s.screen.kind === 'encounter' && s.screen.id === id;

/** A daily crossing as Lena: the first two dates from `from` she crosses on. */
function lenaDays(from: string): [string, string] {
  const out: string[] = [];
  for (let i = 0; out.length < 2; i++) if (dailySetup(addDays(from, i)).character === 'lena') out.push(addDays(from, i));
  return [out[0], out[1]];
}

describe('carry-over between daily crossings: the shuttle trader', () => {
  const store = (): Store => {
    const map = new Map<string, string>();
    return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
  };
  const [first, next] = lenaDays('2026-11-01');

  /** Day one as Lena: she tells passport control she is a tourist, then the cautious bot plays it out. */
  function dayOne(): RunState {
    let s = newRun(dailyRunSetup(dailySetup(first), packingFor('lena')));
    s = playUntil(s, onCard('p_purpose'));
    s = playStep(s, { type: 'choose', approach: 'tourism' });
    let botRng = botSeed(s.seed);
    for (let i = 0; i < 400 && !s.ending; i++) {
      const p = botAction('cautious', s, botRng);
      if (!p) break;
      s = playStep(s, p.action);
      botRng = p.botRng;
    }
    expect(s.ending).not.toBeNull();
    return s;
  }

  it('is off by default, so the next daily crossing starts with a clean file', () => {
    expect(freshSave().settings.dailyMemory).toBe(false);
    expect(load(store()).settings.dailyMemory).toBe(false);
    const d = recordRun(freshSave(), dayOne());
    const s = newRun(dailyRunSetup(dailySetup(next), packingFor('lena'), d.settings.dailyMemory ? d.dailyFile : null));
    expect(s.claims).toEqual([]);
  });

  it('remembers an answer from the last daily crossing in the next one, and the clerk acts on it', () => {
    const last = dayOne();
    expect(last.claims).toContain('tourism');
    const st = store();
    save(st, recordRun(freshSave(), last));
    const saved = load(st);
    expect(saved.dailyFile?.daily).toBe(first);
    expect(saved.dailyFile?.claims).toContain('tourism');

    const day = dailySetup(next);
    const remembering = newRun(dailyRunSetup(day, packingFor('lena'), saved.dailyFile));
    const fresh = newRun(dailyRunSetup(day, packingFor('lena')));
    // Passport control has yesterday's "tourist" written down before she says a word.
    expect(remembering.claims).toContain('tourism');
    expect(loggedAt(remembering, 'tourism')).toContain('passport');
    expect(fresh.claims).toEqual([]);

    // Today she tells the truth: she is visiting family. The clerk still remembers
    // the tourist with a foreign employer and asks who pays her (p_employer).
    const truthful = (s: RunState) => playStep(playUntil(s, onCard('p_purpose')), { type: 'choose', approach: 'family' });
    const nextCard = (s: RunState) => {
      const n = playUntil(truthful(s), (x) => !x.reaction && x.screen.kind !== 'between' && deskOf(x) === 'passport');
      return n.screen.kind === 'encounter' ? n.screen.id : n.screen.kind;
    };
    expect(nextCard(remembering)).toBe('p_employer');
    expect(nextCard(fresh)).not.toBe('p_employer');
  });

  it('remembers nothing from a crossing as the other traveler, or from a level run', () => {
    const file = recordRun(freshSave(), dayOne()).dailyFile!;
    expect(remembered({ character: 'mark' }, file)).toEqual([]);
    expect(remembered({ character: 'lena' }, { ...file, daily: undefined })).toEqual([]);
    expect(remembered({ character: 'lena' }, null)).toEqual([]);
    // A level run replaces the last file but not the last daily one.
    const level = recordRun(recordRun(freshSave(), dayOne()), { ...dayOne(), daily: undefined });
    expect(level.file?.daily).toBeUndefined();
    expect(level.dailyFile?.daily).toBe(first);
  });
});
