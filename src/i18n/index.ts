// t(key, vars): looks up the current locale, falls back to English, and throws
// on a key English doesn't have, so a content hole fails loudly in dev and tests.
// A count is a plural key, one entry per CLDR category (`ui.hours#one`, `#few`,
// `#many`, `#other`): t(key, { n }) picks the form with Intl.PluralRules and falls
// back to `#other`, because Russian has three forms where English has two.
// Vars named `contact`, `contactMine`, `card`, `cardShort`, `cardThe`, `cardLabel`, `fact`, `claim`, `said`, `desk`, `deskAt`, `event` hold ids and are translated too.

import { en } from './en';
import { ru } from './ru';

export type Locale = 'en' | 'ru';
const LOCALES: Record<Locale, Record<string, string>> = { en, ru };
let locale: Locale = 'en';

/** Switches the text, and `<html lang>` with it, so screen readers and hyphenation follow. */
export const setLocale = (l: Locale) => {
  locale = l;
  scope = undefined;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
};
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
  /** A checkpoint id inside a sentence: "passport control". */
  deskAt: (id) => `checkpoint.${id}.at`,
  /** The key of what an answer's hours are spent on, by its text: "Lab test". */
  event: (key) => key,
};

/** Whether English has the key, as plain text or as a plural key's `#other` form. */
export function has(key: string): boolean {
  return key in en || `${key}#other` in en;
}

/**
 * A traveler's own wording of a key, when there is one, else the key itself. The
 * traveler goes after the second segment, so `enc.i_family.q` reads `enc.i_family.mark.q`
 * for Mark and `claim.noOtherFamily` reads `claim.noOtherFamily.mark`, because his brother
 * lives across the border and Lena's cousin lives here.
 */
export function own(key: string, traveler: string): string {
  const memo = `${traveler}|${key}`;
  const known = owned.get(memo);
  if (known !== undefined) return known;
  const parts = key.split('.');
  const variant = [...parts.slice(0, 2), traveler, ...parts.slice(2)].join('.');
  const out = variant in en ? variant : key;
  owned.set(memo, out);
  return out;
}
/** own() per traveler and key: the English table never changes, and the walk asks the same keys millions of times. */
const owned = new Map<string, string>();

/** t(key, { ...vars, n }): the plural form of `key` for the count n, with {n} set. */
export function tn(key: string, n: number, vars: Record<string, string | number> = {}): string {
  return t(key, { ...vars, n });
}

/** The CLDR plural category of n in a locale ("one", "few", "many", "other"...), memoized per locale and n. */
const categories = new Map<string, { rules: Intl.PluralRules; byN: Map<number, string> }>();
function category(loc: string, n: number): string {
  let c = categories.get(loc);
  if (!c) categories.set(loc, (c = { rules: new Intl.PluralRules(loc), byN: new Map() }));
  let cat = c.byN.get(n);
  if (cat === undefined) c.byN.set(n, (cat = c.rules.select(n)));
  return cat;
}

/**
 * The form of plural key `key` for n in one locale's table: `<key>#<category>` by
 * that locale's own rules, else `<key>#other`. Each table is read with its own
 * rules, so Russian falling back to English says "21 hours", not "21 hour".
 */
export function pluralText(table: Record<string, string>, loc: string, key: string, n: number): string | undefined {
  return table[`${key}#${category(loc, n)}`] ?? table[`${key}#other`];
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

/**
 * The text of `key` in the current locale and story, or with a count n, the plural
 * form for n when the key has no plain text. Found texts are kept per key and n.
 */
function lookup(key: string, n: number | undefined): Found | undefined {
  if (!scope) {
    const name = `${locale}|${story ?? ''}`;
    scope = found.get(name);
    if (!scope) found.set(name, (scope = new Map()));
  }
  const byKey = scope;
  const id = n === undefined ? key : `${key}\u0000${n}`;
  const hit = byKey.get(id);
  if (hit) return hit;
  const told = story ? `${story}:${key}` : undefined;
  const table = LOCALES[locale];
  let s: string | undefined = (told && (table[told] ?? en[told])) || (table[key] ?? en[key]);
  if (s === undefined) {
    // No count (a line saved before its key became plural) reads the #other form.
    const form = (k: string) =>
      n === undefined ? (table[`${k}#other`] ?? en[`${k}#other`]) : (pluralText(table, locale, k, n) ?? pluralText(en, 'en', k, n));
    s = (told && form(told)) || form(key);
  }
  if (s === undefined) return undefined;
  const f = { text: s, filled: /\{\w+\}/.test(s) };
  byKey.set(id, f);
  return f;
}

/**
 * The text of `key` with its {vars} filled. A numeric `n` picks a plural key's form:
 * `t('ui.hours', { n: 2 })` reads `ui.hours#other`, "2 hours".
 */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const f = lookup(key, typeof vars.n === 'number' ? vars.n : undefined);
  if (f === undefined) throw new Error(`missing text: ${key}`);
  if (!f.filled) return f.text;
  return f.text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) return `{${name}}`;
    const idKey = ID_VARS[name];
    return idKey ? t(idKey(String(v))) : String(v);
  });
}
