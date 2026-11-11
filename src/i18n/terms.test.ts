// The term rules from the proofreading pass (docs/research/2026-11-09-proofreading.md),
// locked so new content cannot drift: hours not time, Scrutiny n/3, one spelling per
// name, no em dashes, every sentence starts with a capital, US spelling outside quoted speech.
import { describe, expect, it } from 'vitest';
import { en } from './en';

/** Short words like "mark", "mother" or "and" (or "letter", "your mother's letter"), inserted mid-sentence, so they may start lowercase. */
const isFragment = (key: string) =>
  /^contact\.[^.]+$/.test(key) || /^ev\.[^.]+\.(short|the)$/.test(key) || ['ui.exposed', 'ui.protected', 'ui.used', 'ui.and'].includes(key);

/** The names, from the contacts table (contact.* values) plus the one place name. */
const NAMES: string[] = [
  ...new Set(
    Object.entries(en)
      .filter(([k]) => /^contact\.[^.]+$/.test(k))
      .flatMap(([, v]) => v.match(/\b[A-Z][a-z]+\b/g) ?? []),
  ),
  'Halden',
  'Central',
];
/** Names too short for an edit-distance check ("Tom" is one letter from "to"), so their known misspellings. */
const SHORT_NAME_VARIANTS: Record<string, string[]> = { Tom: ['Thom', 'Tomm', 'Tomas', 'Thomas', 'Tommy'] };

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const TIME_AS_UNIT = [
  /\btimes? (left|remaining)\b/i,
  /\{\w+\} times?\b/i,
  /\b\d+ times? (left|remaining|lost)\b/i,
  /\b(more|extra|less|lose|loses|lost|cost|costs|take|takes|spend|spends|no) time\b/i,
  /\{\w+\} minutes?\b/i,
  /\bminutes? (left|remaining)\b/i,
  // A label like "Time: {n}" or "Minutes: 3", where the word is the counter's unit.
  /\b(time|minutes?)\s*:/i,
];

/**
 * Labels Yury worded himself, whose value is shown in hours next to them: the ending's
 * "Time left at border exit" over "5 hours" (ending review, 2026-11-10). Only these keys.
 */
const TIME_LABELS = ['ui.timeLeftRow'];

/** The value with each {var} filled, so "{contact} has..." is checked as the player reads it. */
function rendered(value: string): string {
  return value
    .replace(/\{contact\}/g, en['contact.mother'])
    .replace(/\{card\}/g, en['ev.hotel.name'])
    .replace(/\{fact\}/g, en['fact.employer'])
    .replace(/\{claim\}/g, en['claim.shortTrip'])
    .replace(/\{name\}/g, en['char.lena.name'])
    .replace(/\{\w+\}/g, '2');
}

/** Every term-rule problem in one string. Empty means clean. */
function termProblems(key: string, value: string): string[] {
  const out: string[] = [];
  for (const re of TIME_AS_UNIT) if (!TIME_LABELS.includes(key) && re.test(value)) out.push(`time used as a unit (${re})`);

  for (const w of ['Noticed', 'Watchful']) if (new RegExp(`\\b${w}\\b`, 'i').test(value)) out.push(`old scrutiny word "${w}"`);
  for (const m of value.matchAll(/(\{\w+\}|\d+)\/(\{max\}|3)(?!\d)/g))
    if (!value.slice(0, m.index).endsWith('Scrutiny ')) out.push(`"${m[0]}" without "Scrutiny " before it`);

  for (const word of value.match(/[A-Za-z]+/g) ?? []) {
    for (const name of NAMES) {
      const w = word.toLowerCase();
      const n = name.toLowerCase();
      if (w === n) continue;
      if (n.length >= 4 && distance(w, n) === 1) out.push(`"${word}" looks like a misspelling of ${name}`);
      if ((SHORT_NAME_VARIANTS[name] ?? []).some((v) => v.toLowerCase() === w)) out.push(`"${word}" is not how ${name} is spelled`);
    }
  }
  if (/halden(?!\s+central)/i.test(value)) out.push('"Halden" without "Central"');

  if (value.includes('—')) out.push('em dash');
  if (value.includes('--')) out.push('"--"');

  // US English in UI and narration. Quoted speech is a character's own voice, so it is left out.
  const narration = value.replace(/["“][^"”]*["”]/g, '');
  if (/\bgrey\b/i.test(narration)) out.push('"grey" in narration (US English: gray)');
  if (/\bin hospital\b/i.test(narration)) out.push('"in hospital" in narration (US English: in the hospital)');

  const text = rendered(value);
  if (!isFragment(key) && /^["“]?[a-z]/.test(text)) out.push(`starts lowercase: "${text.slice(0, 20)}"`);
  const mid = text.match(/[.!?]["”]?\s+["“]?[a-z]\w*/);
  if (mid) out.push(`sentence starts lowercase: "${mid[0]}"`);
  return out;
}

describe('English terms', () => {
  it('names come from the contacts table', () => {
    expect(NAMES).toEqual(expect.arrayContaining(['Ilya', 'Tom', 'Halden', 'Central']));
  });

  it('every string follows the term rules', () => {
    const bad = Object.entries(en)
      .map(([k, v]) => [k, termProblems(k, v)] as const)
      .filter(([, p]) => p.length);
    expect(bad).toEqual([]);
  });

  // The checker itself, so a rule that silently stops matching shows up here.
  it.each([
    ['time used as a unit', 'ui.x', '{n} time remaining'],
    ['time used as a unit', 'ui.x', 'Every check costs time.'],
    ['time used as a unit', 'ui.x', 'Time left: 3'],
    ['time used as a unit', 'ui.x', 'Time: {n}'],
    ['time used as a unit', 'ui.x', 'Minutes: 3'],
    ['old scrutiny word', 'ui.x', 'Noticed'],
    ['old scrutiny word', 'ui.x', 'The officers are watchful.'],
    ['Scrutiny', 'ui.x', 'At 3/3 you are taken aside.'],
    ['misspelling of Ilya', 'ui.x', 'Your cousin Ilia calls.'],
    ['not how Tom', 'ui.x', 'Your brother Thomas calls.'],
    ['misspelling of Halden', 'ui.x', 'Welcome to Holden Central.'],
    ['"Halden" without', 'ui.x', 'Welcome to Halden.'],
    ['em dash', 'ui.x', 'Wait — then go.'],
    ['"--"', 'ui.x', 'Wait -- then go.'],
    ['"grey" in narration', 'ui.x', 'He copies your phone in a grey box.'],
    ['"in hospital" in narration', 'ui.x', 'Your father is in hospital.'],
    ['starts lowercase', 'ui.x', 'wait here.'],
    ['starts lowercase', 'ui.x', '{contact} is called in.'],
    ['sentence starts lowercase', 'ui.x', 'Wait. then go.'],
  ])('flags %s in %j', (problem, key, value) => {
    expect(termProblems(key, value).join('; ')).toContain(problem);
  });

  // Withdrawing is not a refusal: the passport comes back and nothing is stamped,
  // so the reaction must not mention a stamp (the ending is "You turned back").
  it('keeps stamps out of every withdraw reaction', () => {
    const withdraw = Object.entries(en).filter(([k]) => /^insp\.[^.]+\.withdraw\.reaction$/.test(k) || k === 'turnBack.reaction');
    expect(withdraw.map(([k]) => k).sort()).toEqual(
      ['insp.s_medicine.withdraw.reaction', 'insp.s_supervisor.withdraw.reaction', 'turnBack.reaction'],
    );
    expect(withdraw.filter(([, v]) => /stamp/i.test(v))).toEqual([]);
  });

  it('passes the clean forms', () => {
    for (const v of ['{n} hours remaining', 'Scrutiny 1/3.', 'Your cousin Ilya calls.', 'HALDEN CENTRAL', 'Home in time', 'Six times this year.'])
      expect(termProblems('ui.x', v)).toEqual([]);
    expect(termProblems('contact.mother', 'your mother')).toEqual([]);
    // A character may keep their own voice inside quoted speech.
    expect(termProblems('ui.x', '"He is in hospital, in a grey room," she says.')).toEqual([]);
  });
});
