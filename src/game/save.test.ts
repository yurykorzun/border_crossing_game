// The save: endings seen kept through a save and load (including a save from an older
// build), and New crossing (startOver), which drops the run and keeps everything else.
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { newRun } from './engine';
import { ENDINGS, SAVE_KEY, SAVE_VERSION, freshSave, load, save, startOver } from './save';
import type { SaveData, Store } from './save';
import type { EndingId } from './types';

const ALL_ENDINGS: Record<EndingId, true> = { homeInTime: true, homeAtCost: true, tooLate: true, turnedBack: true };

function memoryStore(): Store & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

describe('endings seen', () => {
  it('knows every ending', () => {
    expect([...ENDINGS].sort()).toEqual(Object.keys(ALL_ENDINGS).sort());
  });

  it('keeps the endings through a save and load', () => {
    const store = memoryStore();
    save(store, { ...freshSave(), endingsSeen: ['tooLate', 'turnedBack'] });
    expect(load(store).endingsSeen).toEqual(['tooLate', 'turnedBack']);
  });

  it('loads a save from an older build with its endings and settings intact', () => {
    const store = memoryStore();
    store.set(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, run: null, endingsSeen: ['homeInTime'], settings: { reduceWait: true } }));
    const data = load(store);
    expect(data.endingsSeen).toEqual(['homeInTime']);
    expect(data.settings.reduceWait).toBe(true);
  });

  it('ignores an ending id the game does not know', () => {
    const store = memoryStore();
    store.set(SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['missedBus', 'tooLate'] }));
    expect(load(store).endingsSeen).toEqual(['tooLate']);
  });

  it('has no "Still to find out" list any more (g0q.2)', () => {
    expect(Object.keys(en).filter((k) => k === 'ui.openQuestions' || k.startsWith('question.'))).toEqual([]);
  });
});

describe('New crossing', () => {
  const saved = (): SaveData => ({
    ...freshSave(),
    run: newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 }),
    endingsSeen: ['tooLate', 'homeAtCost'],
    beatsSeen: ['beat.passport.0'],
    settings: { reduceWait: true, reduceMotion: true, sound: false },
  });

  it('drops the saved run and keeps endings, beats read and settings', () => {
    const before = saved();
    const after = startOver(before);
    expect(after.run).toBeNull();
    expect(after.endingsSeen).toEqual(['tooLate', 'homeAtCost']);
    expect(after.beatsSeen).toEqual(before.beatsSeen);
    expect(after.settings).toEqual(before.settings);
    expect(after.file).toEqual(before.file);
  });

  it('survives a reload: the new save has no run and the same endings', () => {
    const store = memoryStore();
    save(store, saved());
    expect(load(store).run).not.toBeNull();
    save(store, startOver(load(store)));
    const data = load(store);
    expect(data.run).toBeNull();
    expect(data.endingsSeen).toEqual(['tooLate', 'homeAtCost']);
    expect(data.settings).toEqual(saved().settings);
  });
});
