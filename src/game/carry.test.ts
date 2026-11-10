// Unlocking and carry-over (border_crossing_game-rwf.2): a level opens on how many
// different endings were seen, and the file from the last finished crossing is
// saved for a later level, with a seeded default when there is none.
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { tn } from '../i18n';
import { LEVELS, levelOpen, levelRows } from './content/levels';
import { defaultFile, fileFor, fileOf, recordRun } from './carry';
import { playRun, setupFor } from './bots';
import { SAVE_KEY, SAVE_VERSION, distinctEndings, freshSave, load, save } from './save';
import type { Store } from './save';
import type { Level } from './types';

function memoryStore(): Store {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

// A made-up second level that opens after two different endings, until rwf.3 adds a real one.
const later: Level = { ...LEVELS.arrival, number: 2, opensAt: 2 };

describe('unlocking a level by endings seen', () => {
  it('keeps a level locked below its endings count and opens it at that count', () => {
    expect(levelOpen(later, [])).toBe(false);
    expect(levelOpen(later, ['tooLate'])).toBe(false);
    expect(levelOpen(later, ['tooLate', 'turnedBack'])).toBe(true);
    expect(levelOpen(later, ['tooLate', 'turnedBack', 'homeInTime'])).toBe(true);
  });

  it('counts different endings, not runs or wins', () => {
    expect(distinctEndings(['tooLate', 'tooLate'])).toBe(1);
    expect(levelOpen(later, ['tooLate', 'tooLate'])).toBe(false);
    // Two losses open it as well as a win and a loss.
    expect(levelOpen(later, ['turnedBack', 'tooLate'])).toBe(true);
  });

  it('has Arrival open on a fresh save', () => {
    expect(LEVELS.arrival.opensAt).toBe(0);
    expect(levelOpen(LEVELS.arrival, freshSave().endingsSeen)).toBe(true);
  });

  it('lists a locked level with what opens it in place of its blurb', () => {
    const [arrival, locked] = levelRows(['tooLate'], [LEVELS.arrival, later]);
    expect(arrival).toEqual({ level: LEVELS.arrival, open: true });
    expect(locked.open).toBe(false);
    expect(locked.opensAt).toEqual({ key: 'ui.levelOpensAt', n: 2 });
    expect(tn(locked.opensAt!.key, locked.opensAt!.n)).toBe('Opens after 2 different endings');
    expect(en['ui.levelOpensAt.one']).toBe('Opens after {n} ending');
    const [open] = levelRows(['tooLate', 'homeAtCost'], [later]);
    expect(open).toEqual({ level: later, open: true });
  });

  it('reads the endings count from a save written before unlocking existed', () => {
    const store = memoryStore();
    store.set(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, run: null, endingsSeen: ['homeInTime', 'tooLate'], settings: {} }));
    const data = load(store);
    expect(data.endingsSeen).toEqual(['homeInTime', 'tooLate']);
    expect(data.file).toBeNull();
    expect(levelOpen(later, data.endingsSeen)).toBe(true);
  });
});

describe('the file carried between crossings', () => {
  // A liar names nobody but says plenty; an honest run names people and shows papers.
  const runs = (['liar', 'honest', 'cautious'] as const).flatMap((style) => [0, 1, 2, 3].map((i) => playRun(style, setupFor(i)).final));

  it('saves a finished run\'s claims, named contacts and documents, through a save and load', () => {
    const store = memoryStore();
    for (const run of runs) {
      expect(run.ending).not.toBeNull();
      const data = recordRun(freshSave(), run);
      save(store, data);
      const file = load(store).file!;
      expect(file.ending).toBe(run.ending);
      expect(file.character).toBe(run.character);
      expect(file.level).toBe('arrival');
      expect(file.claims).toEqual(run.claims);
      expect(file.named).toEqual(run.exposed);
      expect([...file.kept, ...file.spent].sort()).toEqual([...run.loadout].sort());
      expect(file.spent).toEqual(run.loadout.filter((e) => run.used.includes(e)));
      expect(file.medicine).toBe(run.medicine);
      expect(file.seeded).toBeUndefined();
      expect(load(store).endingsSeen).toEqual([run.ending]);
    }
    // The runs above really carry something in each part of the file.
    const files = runs.map(fileOf);
    expect(files.some((f) => f.claims.length > 0)).toBe(true);
    expect(files.some((f) => f.named.length > 0)).toBe(true);
    expect(files.some((f) => f.spent.length > 0)).toBe(true);
    expect(files.some((f) => f.kept.length > 0)).toBe(true);
  });

  it('keeps the last finished crossing\'s file, and a run under way changes nothing', () => {
    const [first, second] = [runs[0], runs[5]];
    const after = recordRun(recordRun(freshSave(), first), second);
    expect(after.file).toEqual(fileOf(second));
    const started = playRun('honest', setupFor(9)).final;
    const underway = { ...started, ending: null };
    const mid = recordRun(after, underway);
    expect(mid.file).toEqual(after.file);
    expect(mid.endingsSeen).toEqual(after.endingsSeen);
    expect(mid.run).toBe(underway);
  });

  it('gives a level with no saved file the default built from its seed', () => {
    const d = fileFor(freshSave().file, 7);
    expect(d).toEqual(defaultFile(7));
    expect(d.seeded).toBe(true);
    expect(d.level).toBe('arrival');
    expect([...d.kept, ...d.spent]).toHaveLength(setupFor(7).loadout.length);
    // The same seed, the same file; other seeds give other files.
    expect(new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(defaultFile(seed)))).size).toBeGreaterThan(1);
    // A saved file wins over the default.
    const saved = fileOf(runs[1]);
    expect(fileFor(saved, 7)).toBe(saved);
  });

  it('drops a broken saved file and keeps the rest of the save', () => {
    const store = memoryStore();
    store.set(SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['tooLate'], file: { claims: 'nope' } }));
    const data = load(store);
    expect(data.file).toBeNull();
    expect(data.endingsSeen).toEqual(['tooLate']);
  });
});
