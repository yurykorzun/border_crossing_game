// The consequence after home (border_crossing_game-rwf.10): a beat days after a crossing
// that got you home, decided by the run's record. It never changes the ending, it can
// follow a run whose answers were all true, and it is saved in the carried file.
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { en } from '../i18n/en';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { fileOf, recordRun } from './carry';
import { laterBeat } from './consequence';
import { endingFor, newRun } from './engine';
import { SAVE_KEY, freshSave, load, save } from './save';
import type { Store } from './save';
import type { RunState } from './types';
import { LATER_IDS } from './types';

function memoryStore(): Store {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

const lena = (): RunState => newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
/** Home in time with the cash declaration written down at customs and the count on file showing it false. */
const caughtAtCustoms = (): RunState => ({
  ...lena(), time: 5, checkpoint: 3, screen: { kind: 'ending' }, reaction: null, ending: 'homeInTime',
  claims: ['cashUnderLimit'], logged: { cashUnderLimit: ['customs'] }, saidAt: { cashUnderLimit: 'customs' },
  facts: { cashCount: ['customs'] }, disproved: ['cashUnderLimit'],
});

const runs = BOT_STYLES.flatMap((style) => Array.from({ length: 200 }, (_, i) => playRun(style, setupFor(i))));
const gotHome = (s: RunState) => s.ending === 'homeInTime' || s.ending === 'homeAtCost';

describe('a beat days after you get home', () => {
  it('keeps the crossing ending: a Home in time run stays Home in time, and the beat is its own line', () => {
    const s = caughtAtCustoms();
    const beat = laterBeat(s);
    expect(beat).toEqual({ id: 'statement', vars: { desk: 'customs', said: 'cashUnderLimit' } });
    expect(endingFor(s)).toBe('homeInTime');
    expect(fileOf(s).ending).toBe('homeInTime');
    // Read as "Three days later: ...", with the choice that caused it on the next line.
    expect(`${t(`later.${beat!.id}.when`)}: ${t(`later.${beat!.id}`, beat!.vars)}`)
      .toBe('Three days later: A letter asks you to come to an office and explain your statement at Customs.');
    expect(t(`later.${beat!.id}.reason`, beat!.vars)).toBe('Because Customs wrote down "My savings. It\'s under the limit", and a record on file says otherwise.');
    // Played runs too: every Home in time run with a beat keeps its ending in the file.
    const won = runs.map((r) => r.final).filter((f) => f.ending === 'homeInTime' && laterBeat(f));
    expect(won.length).toBeGreaterThan(0);
    for (const f of won) expect([endingFor(f), fileOf(f).ending]).toEqual(['homeInTime', 'homeInTime']);
  });

  it('can follow a run whose answers were all truthful', () => {
    const truthful = runs.filter((r) => r.style === 'honest' && r.lies === 0 && laterBeat(r.final));
    expect(truthful.length).toBeGreaterThan(0);
    const ids = new Set(truthful.map((r) => laterBeat(r.final)!.id));
    expect([...ids]).toContain('registration');
    // Nothing those runs said was disproved, so the beat comes from what was on file.
    for (const r of truthful) expect(r.final.disproved ?? []).toEqual([]);
  });

  it('only follows a run that got home, and every beat names its time, what happens and the choice behind it', () => {
    for (const r of runs) {
      const beat = laterBeat(r.final);
      if (!gotHome(r.final)) expect(beat).toBeUndefined();
      if (!beat) continue;
      for (const key of [`later.${beat.id}.when`, `later.${beat.id}`, `later.${beat.id}.reason`]) {
        const text = t(key, beat.vars);
        expect(text, key).not.toMatch(/\{\w+\}/);
        expect(text, key).not.toContain('—');
      }
      expect(t(`later.${beat.id}.reason`, beat.vars)).toMatch(/^Because /);
    }
    // Each beat fires somewhere in 1000 runs.
    const fired = new Set(runs.flatMap((r) => (laterBeat(r.final) ? [laterBeat(r.final)!.id] : [])));
    expect([...fired].sort()).toEqual([...LATER_IDS].sort());
    for (const id of LATER_IDS) expect(en[`later.${id}.when`], id).toMatch(/later$/);
  });

  it('does not send an officer to the address where officers already go', () => {
    const s: RunState = {
      ...lena(), time: 5, ending: 'homeAtCost', exposed: ['mother'], logged: { stayingWithFamily: ['passport'] }, claims: ['stayingWithFamily'],
      facts: { familyAddress: ['passport', 'interview'] }, flagged: ['familyAddress'], flaggedAt: { familyAddress: 'interview' },
    };
    expect(laterBeat(s)).toBeUndefined();
    expect(laterBeat({ ...s, exposed: [], flagged: [], flaggedAt: {} })).toEqual({ id: 'registration', vars: { desk: 'passport' } });
  });
});

describe('the beat in the carried file', () => {
  it('saves the beat with the file, through a save and load, so the next crossing opens with it', () => {
    const store = memoryStore();
    const s = caughtAtCustoms();
    save(store, recordRun(freshSave(), s));
    const file = load(store).file!;
    expect(file.later).toEqual(laterBeat(s));
    expect(file.ending).toBe('homeInTime');
    // Played runs: the file holds the beat exactly when the run has one.
    for (const r of runs.slice(0, 200)) expect(fileOf(r.final).later).toEqual(laterBeat(r.final));
  });

  it('drops a broken beat and keeps the rest of the file', () => {
    const store = memoryStore();
    const file = fileOf(caughtAtCustoms());
    store.set(SAVE_KEY, JSON.stringify({ ...freshSave(), file: { ...file, later: { id: 'arrest', vars: {} } } }));
    const loaded = load(store).file!;
    expect(loaded.later).toBeUndefined();
    expect(loaded.claims).toEqual(file.claims);
  });
});
