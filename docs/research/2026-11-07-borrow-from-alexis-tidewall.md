# What to borrow from alexis_adventure_game and tidewall (2026-11-07)

TL;DR: Neither uses React (Alexis is Phaser 3.90, Tidewall is three.js + DOM, both landscape), so their UI code doesn't carry over. Their habits do: pure logic modules with a thin view, a condition checker, versioned saves, branch/scenario counts pinned in tests, and the phone checklist.

## Borrow directly

1. Condition checker - `alexis_adventure_game/src/core/dialogue.ts` (`Cond`, `check()`): all fields must hold, pure function. Our `requires`/`when` follow the same shape.
2. Versioned save behind a `Store` interface, corrupt save falls back to fresh - `alexis_adventure_game/src/core/save.ts`, `tidewall/src/levels/progress.ts`. Storage wrapped in try/catch, tests pass a Map.
3. iOS audio unlock on every tap + lifecycle pause as pure functions - `tidewall/src/ui/sound.ts`, `tidewall/src/ui/lifecycle.ts`. Web Audio oscillators, no sound files.
4. Phone checklist - `tidewall/docs/PHONE_PLAN.md`: `dvh` not `vh` (Safari toolbar hides buttons), `touch-action` on UI bands, 44px+ targets, iOS ignores `user-scalable=no`, run WebKit in Playwright, ship as a PWA for near-full-screen on iPhone.
5. Reading time - `alexis_adventure_game/docs/research/reading-time.md`: max 7 words a line, shown for `1 + words/2` seconds. Fits our one-line reactions.

## Adapt

- Alexis `tests/bot/storyRun.ts` and tidewall `npm run scenarios` → our exhaustive branch walk. Pin ending and path counts in a test, so content changes move them on purpose.
- Alexis string table that throws on a missing key, plus a test that every encounter is reachable.
- `tidewall/DESIGN.md` token doc (colour table, type scale, "state is always also written in words"), adjusted for portrait.
- `alexis_adventure_game/tools/pwa.ts` for installability, `?autoplay=1` and a `window.game` debug API for Playwright.
- Tidewall CLAUDE.md rules: logic in testable modules, view stays thin, screenshot at phone size after visual changes, reports say what was checked, publishing needs Yury's say-so.

## Avoid

- Phaser, three.js, code-drawn pixel art: overkill for HTML/CSS cards.
- Landscape-only layout: tidewall's HUD overflowed an 844x390 phone by 28px after one extra button. Budget screen space early.
- Generated art straight into the game. Lock palette and reference design first, gate output with a looked-at preview sheet. See `alexis_adventure_game/docs/research/asset-pipeline.md` for generator ranking and clean-up chain.
- PixelLab key in alexis leaked (`docs/ASSETS.md`), rotate before reuse.
- Per-encounter rule exceptions: a tidewall rule switched off for one level read as an unwinnable level. Fix the content, not the rule.
