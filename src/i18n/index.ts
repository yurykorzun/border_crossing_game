// t(key, vars): looks up the current locale, falls back to English, and throws
// on a key English doesn't have, so a content hole fails loudly in dev and tests.
// Vars named `contact`, `contactMine`, `card`, `cardShort`, `cardThe`, `fact`, `claim`, `desk` hold ids and are translated too.

import { en } from './en';

export type Locale = 'en';
const LOCALES: Record<Locale, Record<string, string>> = { en };
let locale: Locale = 'en';

export const setLocale = (l: Locale) => { locale = l; };
export const getLocale = () => locale;

const ID_VARS: Record<string, (id: string) => string> = {
  contact: (id) => `contact.${id}`,
  /** "My cousin Ilya", to open a spoken answer: "My cousin Ilya lives here." */
  contactMine: (id) => `contact.${id}.mine`,
  card: (id) => `ev.${id}.name`,
  /** "letter", for the line under an answer: "Uses letter". */
  cardShort: (id) => `ev.${id}.short`,
  /** "your mother's letter", for an answer that hands it over: "Show your mother's letter". */
  cardThe: (id) => `ev.${id}.the`,
  fact: (id) => `fact.${id}`,
  claim: (id) => `claim.${id}`,
  /** A checkpoint id, by its name: "Customs". */
  desk: (id) => `checkpoint.${id}`,
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

export function t(key: string, vars: Record<string, string | number> = {}): string {
  const s = LOCALES[locale][key] ?? en[key];
  if (s === undefined) throw new Error(`missing text: ${key}`);
  return s.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) return `{${name}}`;
    const idKey = ID_VARS[name];
    return idKey ? t(idKey(String(v))) : String(v);
  });
}
