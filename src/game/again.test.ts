// Play again with the same setup (setupOf) and Start over in the settings sheet (startOver).
import { describe, expect, it } from 'vitest';
import { newRun, setupOf } from './engine';
import { playRun, setupFor } from './bots';
import { freshSave, load, save, startOver } from './save';
import type { Store } from './save';
import { recordRun } from './carry';
import { BULLETINS } from './content/world';

function memoryStore(): Store {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

describe('play again with the same setup', () => {
  it('starts a run with the same traveler, packing, bulletin and seed', () => {
    for (let i = 0; i < 12; i++) {
      const setup = { ...setupFor(i), bulletin: BULLETINS[i % BULLETINS.length] };
      const ended = playRun('honest', setup).final;
      expect(ended.ending).toBeTruthy();
      const again = newRun(setupOf(ended));
      expect(again.character).toBe(setup.character);
      expect(again.loadout).toEqual(setup.loadout);
      expect(again.bulletin).toBe(setup.bulletin);
      expect(again.seed).toBe(setup.seed);
      expect(again.level).toBe(ended.level);
      // A fresh run: the same start as the first one, nothing carried over from how it went.
      expect(again).toEqual(newRun(setup));
      expect(again.ending).toBeNull();
      expect(again.used).toEqual([]);
    }
  });

  it('gives the same deal, so the same answers play out the same', () => {
    const setup = setupFor(3);
    const first = playRun('cautious', setup);
    const again = playRun('cautious', setupOf(first.final));
    expect(again.actions).toEqual(first.actions);
    expect(again.final.ending).toBe(first.final.ending);
  });
});

describe('start over in the settings sheet', () => {
  it('clears the current run and keeps endingsSeen and settings in the save', () => {
    const store = memoryStore();
    const ended = playRun('honest', setupFor(0)).final;
    const settings = { reduceWait: true, reduceMotion: true, sound: false };
    const before = { ...recordRun({ ...freshSave(), settings, beatsSeen: ['queue.0.a'] }, ended), run: newRun(setupFor(1)) };
    save(store, before);
    expect(load(store).run).not.toBeNull();

    save(store, startOver(load(store)));
    const after = load(store);
    expect(after.run).toBeNull();
    expect(after.endingsSeen).toEqual([ended.ending]);
    expect(after.settings).toEqual(settings);
    expect(after.beatsSeen).toEqual(['queue.0.a']);
    expect(after.file).toEqual(before.file);
  });
});
