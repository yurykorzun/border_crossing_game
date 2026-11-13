// t(key, vars): looks up the current locale, falls back to English, and throws
// on a key English doesn't have, so a content hole fails loudly in dev and tests.
// Vars named `contact`, `contactMine`, `card`, `cardShort`, `cardThe`, `cardLabel`, `fact`, `claim`, `said`, `desk`, `event` hold ids and are translated too.

import { en } from './en';

export type Locale = 'en';
const LOCALES: Record<Locale, Record<string, string>> = { en };
let locale: Locale = 'en';

export const setLocale = (l: Locale) => { locale = l; scope = undefined; };
export const getLocale = () => locale;

/**
 * The level being played, whose own wording t() prefers: `departure:ui.goal` over
 * `ui.goal` in Departure, because there you are leaving for your flight, not
 * heading to the hospital. Set where a run is shown (src/App.tsx, transcriptOf());
 * unset shows Arrival's.
 */
let story: string | undefined;
export const setStory = (level: string | undefined) => { story = level; scope = undefined; };
export const getStory = () => story;

const ID_VARS: Record<string, (id: string) => string> = {
  contact: (id) => `contact.${id}`,
  /** "My cousin Ilya", to open a spoken answer: "My cousin Ilya lives here." */
  contactMine: (id) => `contact.${id}.mine`,
  card: (id) => `ev.${id}.name`,
  /** "letter", for the line under an answer: "Uses letter". */
  cardShort: (id) => `ev.${id}.short`,
  /** "your mother's letter", for an answer that hands it over: "Show your mother's letter". */
  cardThe: (id) => `ev.${id}.the`,
  /** "Mother's letter", the short name on the document card: "Used: Mother's letter." */
  cardLabel: (id) => `ev.${id}.label`,
  fact: (id) => `fact.${id}`,
  claim: (id) => `claim.${id}`,
  /** A claim in your own words, "No reason, a short trip". The id may carry a traveler: `noOtherFamily.mark`. */
  said: (id) => `said.${id}`,
  /** A checkpoint id, by its name: "Customs". */
  desk: (id) => `checkpoint.${id}`,
  /** The key of what an answer's hours are spent on, by its text: "Lab test". */
  event: (key) => key,
};

export function has(key: string): boolean {
  return key in en;
}

/**
 * A traveler's own wording of a key, when there is one, else the key itself. The
 * traveler goes after the second segment, so `enc.i_family.q` reads `enc.i_family.mark.q`
 * for Mark and `claim.noOtherFamily` reads `claim.noOtherFamily.mark`, because his brother
 * lives across the border and Lena's cousin lives here.
 */
export function own(key: string, traveler: string): string {
  const parts = key.split('.');
  const variant = [...parts.slice(0, 2), traveler, ...parts.slice(2)].join('.');
  return variant in en ? variant : key;
}

/** Plural-aware t(): picks `<key>.one` for 1 or -1 and `<key>.other` otherwise, with {n} set. */
export function tn(key: string, n: number, vars: Record<string, string | number> = {}): string {
  return t(`${key}.${Math.abs(n) === 1 ? 'one' : 'other'}`, { ...vars, n });
}

/** "A", "A and B", "A, B and C". */
export function andList(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${t('ui.and')} ${items[items.length - 1]}`;
}

/**
 * The text a key resolves to, per locale and story, because the bots' sweep calls
 * t() millions of times and two lookups per call were most of its time. `filled`
 * says whether the text has a {var} to fill, so plain text skips the regex.
 * The tables are constants, so a found text never goes stale.
 */
type Found = { text: string; filled: boolean };
const found = new Map<string, Map<string, Found>>();
/** found's table for the current locale and story, dropped by setLocale() and setStory(). */
let scope: Map<string, Found> | undefined;

function lookup(key: string): Found | undefined {
  if (!scope) {
    const name = `${locale}|${story ?? ''}`;
    scope = found.get(name);
    if (!scope) found.set(name, (scope = new Map()));
  }
  const byKey = scope;
  const hit = byKey.get(key);
  if (hit) return hit;
  const told = story ? `${story}:${key}` : undefined;
  const s = (told && (LOCALES[locale][told] ?? en[told])) || (LOCALES[locale][key] ?? en[key]);
  if (s === undefined) return undefined;
  const f = { text: s, filled: /\{\w+\}/.test(s) };
  byKey.set(key, f);
  return f;
}

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const f = lookup(key);
  if (f === undefined) throw new Error(`missing text: ${key}`);
  if (!f.filled) return f.text;
  return f.text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) return `{${name}}`;
    const idKey = ID_VARS[name];
    return idKey ? t(idKey(String(v))) : String(v);
  });
}
