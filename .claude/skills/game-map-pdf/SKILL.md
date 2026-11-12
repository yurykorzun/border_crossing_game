---
name: game-map-pdf
description: Rebuild the Purpose of Visit game map PDF (every screen, card, answer, cost and line of text, plus the planned levels from bd) for review. Use when asked for "the game map", "the map PDF", "an updated PDF for review", "regenerate the map", or after a change to cards, levels or text that someone will review from the PDF.
---

# Game map PDF

The map is built from the game's own content (`src/game/content/*.ts`, `src/i18n/en.ts`) and the deferred children of the levels plan in bd, so it cannot drift from what the game deals.

## Build it

```bash
npm run map                      # ~/Desktop/Purpose of Visit game map <today>.pdf
npm run map -- path/to/out.pdf   # somewhere else
```

It exits 1 when a line of `en.ts` is left out of the map or a condition prints longer than 300 characters. Either one means the generator (`tools/map.ts`) needs a fix for new content, not that the content is wrong. A new text prefix usually belongs in one of the key lists in sections 6 and 7. A new nested condition shape usually needs folding in `cond()` or `effs()`.

Build from the branch whose content should be reviewed. The cover names the branch and commit, so a reviewer can tell which build they are reading.

## Check it before saying done

1. Run `./scripts/verify` when `tools/map.ts` or any content changed, because the map build does not run the project gate and a PDF from a broken branch is not worth reviewing.
2. Read the first 4 pages and two card pages with the Read tool (`pages: "1-4"`), and look for raw nested conditions, text under the wrong card, and headings left alone at the bottom of a page.
3. Report what Yury would otherwise ask: the path, the page count, when it was built, and the branch and commit. Say what changed since the last map when you know.

## Sections

1. The flow of one crossing, screen by screen
2. The levels: mission, desk openers, rules, every card each level deals, and each level's own wording
3. Every desk card with its question, answers, reactions and costs, plus the level badges
4. The waiting-room checks
5. The inspections
6. Travelers, documents and the glossary of ids
7. Queues, messages and endings
8. All remaining screen text
9. The planned levels from bd
