// Open questions (openQuestions): one per ending not seen, crossed off as endings are seen,
// and kept through a save and load, including a save written before the questions existed.
import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { ENDINGS, SAVE_KEY, SAVE_VERSION, freshSave, load, openQuestions, save } from './save';
import type { Store } from './save';
import type { EndingId } from './types';

const ALL_ENDINGS: Record<EndingId, true> = { homeInTime: true, homeAtCost: true, tooLate: true, turnedBack: true };

function memoryStore(): Store & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
}

describe('open questions', () => {
  it('lists one question per ending on a fresh save', () => {
    expect([...ENDINGS].sort()).toEqual(Object.keys(ALL_ENDINGS).sort());
    const open = openQuestions(freshSave());
    expect(open).toHaveLength(4);
    expect(open).toEqual(ENDINGS.map((e) => `question.${e}`));
  });

  it('crosses off the question for an ending once it is seen', () => {
    for (const e of ENDINGS) {
      const open = openQuestions({ ...freshSave(), endingsSeen: [e] });
      expect(open).toHaveLength(3);
      expect(open).not.toContain(`question.${e}`);
    }
    expect(openQuestions({ ...freshSave(), endingsSeen: [...ENDINGS] })).toEqual([]);
  });

  it('keeps the list through a save and load', () => {
    const store = memoryStore();
    save(store, { ...freshSave(), endingsSeen: ['tooLate', 'turnedBack'] });
    expect(openQuestions(load(store))).toEqual(['question.homeInTime', 'question.homeAtCost']);
  });

  it('loads a save written before the questions with its endings intact', () => {
    const store = memoryStore();
    store.set(SAVE_KEY, JSON.stringify({ v: SAVE_VERSION, run: null, endingsSeen: ['homeInTime'], settings: { reduceWait: true } }));
    const data = load(store);
    expect(data.endingsSeen).toEqual(['homeInTime']);
    expect(data.settings.reduceWait).toBe(true);
    expect(openQuestions(data)).toHaveLength(3);
  });

  it('ignores an ending id the game does not know', () => {
    const store = memoryStore();
    store.set(SAVE_KEY, JSON.stringify({ ...freshSave(), endingsSeen: ['missedBus', 'tooLate'] }));
    expect(load(store).endingsSeen).toEqual(['tooLate']);
  });

  it('has English text for every question, asked as a question', () => {
    for (const q of openQuestions(freshSave())) {
      expect(en[q], q).toBeTruthy();
      expect(en[q].trim().endsWith('?'), q).toBe(true);
    }
    expect(en['ui.openQuestions']).toBeTruthy();
  });
});
