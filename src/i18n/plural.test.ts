// Plurals in t(): a count reads `<key>#<CLDR category>` through Intl.PluralRules
// and falls back to `#other` (docs/design.md, Languages rule 4).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocale, has, pluralText, setLocale, setStory, t, tn } from '.';
import { ru } from './ru';

afterEach(() => {
  setLocale('en');
  setStory(undefined);
  vi.unstubAllGlobals();
});

/** A Russian plural key, the shape ru.ts will hold: 1 час, 3 часа, 5 часов, 1,5 часа. */
const RU = { 'h#one': '{n} час', 'h#few': '{n} часа', 'h#many': '{n} часов', 'h#other': '{n} часа' };

describe('English plurals', () => {
  it('reads 1 hour and 2 hours', () => {
    expect(t('ui.hours', { n: 1 })).toBe('1 hour');
    expect(t('ui.hours', { n: 2 })).toBe('2 hours');
    expect(t('ui.hours', { n: 0 })).toBe('0 hours');
    expect(tn('ui.line.event', 1, { event: 'ui.event.calledIn' })).toMatch(/: 1 hour$/);
  });

  it("uses the level's own wording for each form", () => {
    setStory('departure');
    expect(t('ui.lastBus', { n: 1 })).toBe('Last airport shuttle leaves in 1 hour.');
    expect(t('ui.lastBus', { n: 4 })).toBe('Last airport shuttle leaves in 4 hours.');
  });

  it('falls back to #other when the form is missing', () => {
    // Scrutiny reads the same for any count in English, so it has #other alone.
    expect(t('ui.scrutinyCount', { n: 1, max: 3 })).toBe('Scrutiny 1/3');
    expect(t('ui.scrutinyCount', { n: 2, max: 3 })).toBe('Scrutiny 2/3');
  });

  it('reads #other for a line saved without its count', () => {
    expect(t('ui.line.scrutiny')).toBe('Scrutiny +{n}');
  });

  it('counts a plural key as present', () => {
    expect(has('ui.hours')).toBe(true);
    expect(has('ui.scrutinyCount')).toBe(true);
    expect(has('ui.hours#few')).toBe(false);
  });

  it('still throws on a key English does not have', () => {
    expect(() => t('ui.noSuchCount', { n: 2 })).toThrow('missing text: ui.noSuchCount');
  });
});

describe('Russian plurals', () => {
  it('picks one, few and many for 1, 3 and 5', () => {
    expect(pluralText(RU, 'ru', 'h', 1)).toBe('{n} час');
    expect(pluralText(RU, 'ru', 'h', 3)).toBe('{n} часа');
    expect(pluralText(RU, 'ru', 'h', 5)).toBe('{n} часов');
    expect(pluralText(RU, 'ru', 'h', 21)).toBe('{n} час');
    expect(pluralText(RU, 'ru', 'h', 11)).toBe('{n} часов');
  });

  it('falls back to #other', () => {
    expect(pluralText(RU, 'ru', 'h', 1.5)).toBe('{n} часа');
    expect(pluralText({ 'h#other': '{n} ч.' }, 'ru', 'h', 3)).toBe('{n} ч.');
    expect(pluralText({}, 'ru', 'h', 3)).toBeUndefined();
  });

  it('starts empty, so every key falls back to English by English rules', () => {
    expect(ru).toEqual({});
    setLocale('ru');
    expect(getLocale()).toBe('ru');
    expect(t('ui.hours', { n: 1 })).toBe('1 hour');
    // Russian reads 21 as "one", but the English text it falls back to says hours.
    expect(t('ui.hours', { n: 21 })).toBe('21 hours');
    expect(t('ui.title')).toBe('Purpose of Visit');
  });
});

describe('<html lang>', () => {
  it('follows the locale', () => {
    const html = { lang: 'en' };
    vi.stubGlobal('document', { documentElement: html });
    setLocale('ru');
    expect(html.lang).toBe('ru');
    setLocale('en');
    expect(html.lang).toBe('en');
  });
});
