// Russian. Empty for now: setLocale('ru') switches to it and every key falls back
// to English (src/i18n/index.ts), so the switch works before any text is written.
// Keys copy src/i18n/en.ts. A count needs its three forms (`#one` 1 час, `#few`
// 2 часа, `#many` 5 часов) and `#other` for fractions (1,5 часа).

export const ru: Record<string, string> = {};
