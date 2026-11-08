# Purpose of Visit - the plan

Updated 2026-11-08. Live state is in bd (`bd ready`, `bd show <id>`). This file is the readable order, so if the two disagree, bd wins.

TL;DR: first make the game testable and measurable, then make the opening read as a journey, then make the rules believable, then tune balance, then real art. Every bead is proven by a command: `./scripts/verify` runs lint, tests, build and (from bead 1) a phone-size browser run.

## Where it stands

- Playable at https://yurykorzun.github.io/border_crossing_game/ (redeploys on every push to `worktree-prototype`).
- One mission, 2 characters, 6 documents, 3 checkpoints, 4 endings. Rules: `docs/how-the-game-works.md`.
- Feedback behind this plan: `docs/research/2026-11-08-design-reviews.md`.

## Order

Two epics run interleaved, because the rules work needs the eval tool from the opening epic.

**Phase 1 - test and measure** (epic 67a)
1. `67a.1` Phone-size browser test for one full run (adds Playwright)
2. `67a.2` Autoplay bots: honest, liar, cautious, random, situational, plus the balance tables
3. `67a.3` Scenario evals: story rules over autoplay transcripts

**Phase 2 - the opening reads as a journey** (epic 67a)

4. `67a.4` Time becomes hours until the last bus
5. `67a.5` Run screen: scene, dialogue and action fit together without scrolling
6. `67a.6` The queue as a tap-by-tap scene ending in Approach the booth (fixes Mark's mother naming Ilya)
7. `67a.7` Setup 1: Choose your traveler, with visible history
8. `67a.8` Setup 2 and 3: Prepare your documents, Begin the crossing
9. `67a.9` Proofread every English string and lock the terms
10. `67a.10` SVG portraits and a static queue scene

**Phase 3 - believable rules** (epic fsx, starts once 67a.3 is done)

11. `fsx.1` Claims as vulnerabilities: unchallenged, inconsistency, disproof; every penalty explained
12. `fsx.2` Contacts have specific abilities by topic
13. `kuk` Let the player pick which card to show
14. `fsx.3` Every exposure has a specific consequence, listed under any ending
15. `fsx.4` Walk every dealer pick and report the best ending per setup
16. `fsx.5` Inspections change the problem, and doomed runs end quickly
17. `fsx.6` Relief and pacing: no-cost answers and quiet cards
18. `fsx.7` Bulletin warnings that make packing strategic
19. `fsx.8` Encounter checklist, content lint and playtest script
20. `fsx.9` What each official knows (absorbs l9v, logged claims)
21. `fsx.10` Officers with one priority each and a visible mood

**Phase 4 - balance**

22. `plj` Tune balance for situational play. Target: the situational bot beats honest, liar and cautious; every setup can reach at least homeAtCost; no answer wins over 60% of the time where alternatives exist.

**Phase 5 - later**

- `grd` Real art. Waits on a style decision (see below).
- `7kw` Recurring passengers and officers across runs
- `cb9` Hint at endings not found yet
- `eam` Pseudo-locale test for layout, before the first translation
- `26j` Installable PWA (independent, can go any time)

## How it runs

Both epics are autopilot on, groups of 3: `/harness-auto` builds, reviews and opens a PR per group of up to 3 beads, and never merges. `.agent/plan` points at 67a, so run `/harness-auto` for 67a, then point it at fsx (`echo border_crossing_game-fsx > .agent/plan`) and run it again.

## Decisions for Yury

1. Art style, before `grd`: pixel art (PixelLab, needs its API token) or flat illustration (OpenAI or FLUX, needs that key). Decide after seeing the SVG pass on the phone.
2. Mark's brother is in a fictional country at war, not Ukraine as in the original note. Change it if you want the real one.
3. bd sync: create the `yurykorzun/beads` repo, then run `bd-attach migrate --db border_crossing_game`.

## Not in this plan

- A second mission or more encounters. The reviews say to fix the rules before adding content.
- Translations. English only, all text already in `src/i18n/en.ts`.
- Merging `worktree-prototype` into `main`. That is Yury's call.
