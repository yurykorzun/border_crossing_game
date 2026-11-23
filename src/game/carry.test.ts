// Unlocking and carry-over (border_crossing_game-rwf.2, rwf.12): a level opens once the
// one before it is finished, with any ending, and the file from the last finished crossing is
// saved for a later level, with a seeded default when there is none.
import { describe, expect, it } from 'vitest';
import { setStory, t } from '../i18n';
import { LEVELS, levelOpen, levelRows } from './content/levels';
import { defaultFile, fileFor, fileOf, recordRun } from './carry';
import { playRun, setupFor } from './bots';
import { fileDate, fileLine, recordLines } from './consequence';
import { chooseAction, currentCard, legalActions, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import { scriptedDealer } from './play';
import { SAVE_KEY, SAVE_VERSION, distinctEndings, freshSave, load, save } from './save';
import type { SaveData, Store } from './save';
import type { Level, LevelId, RunState } from './types';
import { allSetups } from './walk';

function memoryStore(): Store {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

// Made-up Levels 2 and 3, until rwf.3 adds a real Departure.
const DEPARTURE = 'departure' as LevelId;
const departure: Level = { ...LEVELS.arrival, id: DEPARTURE, number: 2, title: 'level.arrival.title' };
const third: Level = { ...LEVELS.arrival, id: 'third' as LevelId, number: 3 };
const three = [LEVELS.arrival, departure, third];
const openOf = (finished: readonly LevelId[]) => levelRows(finished, three).map((r) => r.open);

/** The save after playing `level` to its end with this bot style and seed. */
const finish = (d: SaveData, level: LevelId, style: 'cautious' | 'liar', i: number): SaveData =>
  recordRun(d, { ...playRun(style, setupFor(i)).final, level });

describe('a level opens once the one before it is finished (rwf.12)', () => {
  it('keeps Departure locked on a fresh save and opens it after one finished Arrival, with any ending', () => {
    expect(openOf(freshSave().levelsFinished)).toEqual([true, false, false]);
    const endings = new Set<string>();
    for (const style of ['cautious', 'liar'] as const) {
      for (const i of [0, 1, 2, 3]) {
        const d = finish(freshSave(), 'arrival', style, i);
        endings.add(d.endingsSeen[0]);
        expect(d.endingsSeen).toHaveLength(1);
        expect(d.levelsFinished).toEqual(['arrival']);
        expect(openOf(d.levelsFinished), `${style} ${i} ${d.endingsSeen[0]}`).toEqual([true, true, false]);
      }
    }
    // A win and a loss both open it, so no ending is a key.
    expect([...endings].some((e) => e.startsWith('home'))).toBe(true);
    expect([...endings].some((e) => !e.startsWith('home'))).toBe(true);
  });

  it('opens a level after Departure only when Departure is finished, however many endings were seen', () => {
    let d = freshSave();
    for (const [style, i] of [['cautious', 0], ['liar', 1], ['liar', 2], ['cautious', 3]] as const) d = finish(d, 'arrival', style, i);
    expect(d.levelsFinished).toEqual(['arrival']);
    expect(openOf(d.levelsFinished)).toEqual([true, true, false]);
    d = finish(d, DEPARTURE, 'cautious', 0);
    expect(d.levelsFinished).toEqual(['arrival', DEPARTURE]);
    expect(openOf(d.levelsFinished)).toEqual([true, true, true]);
  });

  it('has Arrival open on a fresh save', () => {
    expect(levelOpen(0, freshSave().levelsFinished)).toBe(true);
    expect(levelRows([])[0]).toEqual({ level: LEVELS.arrival, open: true });
  });

  it('says on a locked row which level opens it, in place of its blurb', () => {
    const [arrival, locked, after] = levelRows([], three);
    expect(arrival).toEqual({ level: LEVELS.arrival, open: true });
    expect(locked.open).toBe(false);
    expect(locked.opensAfter).toEqual({ key: 'ui.levelOpensAfter', level: LEVELS.arrival });
    expect(t(locked.opensAfter!.key, { level: t(locked.opensAfter!.level.title) })).toBe('Opens after you finish Arrival');
    expect(after.opensAfter?.level).toBe(departure);
    expect(levelRows(['arrival'], three)[1]).toEqual({ level: departure, open: true });
  });

  it('reads a save written before finished levels existed: any ending means Arrival was finished', () => {
    const store = memoryStore();
    store.set(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, run: null, endingsSeen: ['tooLate'], settings: {} }));
    expect(load(store).levelsFinished).toEqual(['arrival']);
    store.set(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, run: null, endingsSeen: [], settings: {} }));
    expect(load(store).levelsFinished).toEqual([]);
    store.set(SAVE_KEY, JSON.stringify({ ...freshSave(), levelsFinished: ['arrival', 'nope', 3, 'arrival'] }));
    expect(load(store).levelsFinished).toEqual(['arrival']);
  });

  it('keeps counting different endings as a collection', () => {
    expect(distinctEndings(['tooLate', 'tooLate', 'turnedBack'])).toBe(2);
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

const dealer = scriptedDealer([]);

/** Plays a run: `picks` answers the cards it names (a document by its id), every other screen its first legal action. */
function drive(setup: RunSetup, picks: Record<string, string>): RunState {
  let s = newRun(setup);
  for (let i = 0; i < 200 && !s.ending; i++) {
    const card = s.reaction ? null : currentCard(s);
    const pick = card && picks[card.id];
    const answer = pick && options(s).find((o) => !o.blocked && (o.approach.id === pick || o.card === pick));
    const doc = answer && answer.card === pick ? { type: 'choose' as const, approach: answer.approach.id, card: answer.card } : undefined;
    const next = doc ?? (answer ? chooseAction(answer) : legalActions(s).find((a) => a.type !== 'turnBack') ?? legalActions(s)[0]);
    s = step(s, next, dealer);
  }
  return s;
}

// Found on the live site (border_crossing_game-azv.4): the hospital note answered why Lena
// came, then her mother's address answered where she would stay. The address makes the same
// familyVisit claim, and the file used to swap the note for the address, so "Your file" gave
// the address twice and Departure's first card quoted it for why she came.
describe('a claim a document made first keeps the document on the carried file', () => {
  it("the hospital note for why you came, then your mother's address for where you stay", () => {
    const setup: RunSetup = { level: 'arrival', character: 'lena', loadout: ['motherLetter', 'hospitalNote', 'deed'], bulletin: 'records', seed: 3 };
    const s = drive(setup, { p_purpose: 'hospitalNote', p_host: 'mother' });
    expect(s.ending).toBeDefined();
    expect(s.shownOn?.p_purpose).toBe('hospitalNote');
    expect(s.seen).toContain('p_host');
    const file = fileOf(s);
    const said = file.said ?? [];
    const visit = said.find((c) => c.claim === 'familyVisit');
    expect(visit).toMatchObject({ shown: 'hospitalNote', context: 'p_purpose', desk: 'passport' });
    expect(visit?.answer).toBeUndefined();
    expect(said.find((c) => c.claim === 'stayingWithFamily')).toMatchObject({ context: 'p_host', answer: { id: 'mother' } });

    const lines = recordLines(file).map((l) => t(l.key, l.vars));
    expect(lines.filter((l) => l.startsWith(fileDate(visit!.date)) && l.endsWith('you showed the hospital note')), lines.join('\n')).toHaveLength(1);
    expect(new Set(lines).size, lines.join('\n')).toBe(lines.length);
    expect(lines.filter((l) => l.includes("you gave your mother's address"))).toHaveLength(1);

    setStory('departure');
    try {
      const loadout = allSetups('departure').find((x) => x.character === 'lena')!.loadout;
      let d = newRun({ level: 'departure', character: 'lena', loadout, bulletin: 'records', seed: 3, file });
      for (let i = 0; i < 10 && d.screen.kind !== 'encounter'; i++) d = step(d, legalActions(d)[0], dealer);
      // Departure's first card, "Is that still why you came?", quotes the answer to p_purpose.
      expect(d.screen).toMatchObject({ kind: 'encounter', id: 'd_entry' });
      const l = fileLine(d, 'd_entry')!;
      const line = t(l.key, l.vars);
      expect(line).toContain('you showed the hospital note');
      expect(line).not.toContain('address');
    } finally {
      setStory(undefined);
    }
  });
});
