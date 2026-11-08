# Purpose of Visit - the plan

Updated 2026-11-08 (after the engine walk). Live state is in bd (`bd ready`, `bd show <id>`). This file is the readable order, so if the two disagree, bd wins.

TL;DR: first make the game testable and measurable, then make the opening read as a journey, then make the rules believable, then tune balance, then real art. Every bead is proven by a command: `./scripts/verify` runs lint, tests, build and (from bead 1) a phone-size browser run.

## Where it stands

- Playable at https://yurykorzun.github.io/border_crossing_game/ (redeploys on every push to `worktree-prototype`).
- One mission, 2 characters, 6 documents, 3 checkpoints, 4 endings. Rules: `docs/how-the-game-works.md`.
- Feedback behind this plan: `docs/research/2026-11-08-design-reviews.md`.
- Engine is testable without React (done, `fsx.4`, c6799ca): `step()` is pure and seeded, `tryStep()` returns events or a structured rejection, `replay()` rebuilds a run from setup + moves + dealer picks, `CONTENT_VERSION` flags old replays. `npm run walk` plays every setup x every choice x every card the dealer could deal: 105 setups, 2.55M states, 0 rule breaks, about 15 s.

## How the engine is verified

| Level | Where |
|---|---|
| Rule tests (a spent document is exhausted and records its facts) | `src/game/engine.test.ts` |
| Boundary tests (scrutiny 2 to 3 starts exactly one inspection, overflow is capped) | `src/game/engine.test.ts` |
| Scenario tests (tourism claim + family address deals the contradiction) | `src/game/engine.test.ts` |
| Property tests on every reachable state and move (bounds, nothing spent comes back, no double taps, the end is final, follow-ups resolved, endings match the state) | `checkState` / `checkMove` in `src/game/walk.ts` |
| Branch exploration (no dead ends, no loops, every card and answer reachable) | `src/game/walk.test.ts` |
| Content validation (every text key exists) | `src/i18n/keys.test.ts` plus reaction lines in the walk |
| Replay and save tests | `src/game/engine.test.ts` |
| Strategy simulations | `67a.2` bots |
| Feel: tense, understandable, convincing | people, `docs/playtest.md` in `fsx.8` |

A failure in the walk carries its repro (content version, setup, seed, moves, dealer picks), and `npm run walk` saves the first one to `walk-failure.json`.

Walk findings (2026-11-08): scrutiny could reach 4/3 (fixed, capped). Perfect play reaches homeInTime in all 105 setups even with the worst deal, so packing never decides the outcome for an informed player. That goes to `plj`.

## Order

Two epics run interleaved, because the rules work needs the eval tool from the opening epic.

**Phase 1 - test and measure** (epic 67a)
1. `67a.1` Phone-size browser test for one full run (adds Playwright)
2. `67a.2` Autoplay bots: honest, liar, cautious, random, situational, plus the balance tables
3. `67a.3` Scenario evals: story rules over autoplay transcripts

**Phase 2 - the opening reads as a journey** (epic 67a)

4. `67a.4` Time becomes hours until the last bus
5. `67a.5` Run screen, built from the most crowded state first (long question, chips, three answers with two-line costs, tray), checked at 390x844 with larger text. Question, Reaction and Continue are separate phases. Setup screens wait for it.
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
15. ~~`fsx.4` Walk every dealer pick and report the best ending per setup~~ done
16. `fsx.5` Inspections change the problem, and doomed runs end quickly
17. `fsx.6` Relief and pacing: no-cost answers and quiet cards
18. `fsx.7` Bulletin warnings that make packing strategic
19. `fsx.8` Encounter checklist, content lint and playtest script
20. `fsx.9` What each official knows (absorbs l9v, logged claims)
21. `fsx.10` Officers with one stated priority each (visible mood deferred, because it implies a mechanic that doesn't exist)

**Phase 3a - destinations** (epic 70r, after fsx.7; destinations note 2026-11-08)

Veyra is the home country, and its three regions are where you can be going: Capital District, Northern Industrial Region (the restricted town Orvek) and Southern Border Province. Each has travel time and two standing rules, shown on a briefing before packing next to today's bulletin.

- `70r.1` Destinations as data: travel time, two standing rules, fairness invariants (every destination can reach homeAtCost, none is solved by one card)
- `70r.2` Regional rules change what existing documents do
- `70r.3` Destination choice and a briefing before packing (after `67a.8`, which leaves room for it)
- `70r.4` Per-destination walk report proving the briefing changes the best packing

**Phase 3b - content to about 30 connected encounters** (epic bzo, after fsx.1, fsx.9 and 70r.4; content note 2026-11-08)

Today: 18 encounters and 4 inspections. Replay should come from cards reacting to documents, history and earlier statements, not from more storylines.

22. `bzo.1` Dealer composition: 2 routine, 2 background, 2 consequence questions per run; queued follow-ups first; causal relevance outranks novelty
23. `bzo.2` Passport encounters, outlines first (prerequisite, 2-3 approaches, distinct costs, delayed consequence, how officials know)
24. `bzo.3` Customs encounters, outlines first
25. `bzo.4` Interview encounters and inspections, outlines first; deck reaches 30
26. `bzo.5` Variety check: five consecutive runs per character differ in at least 3 of 6 decisions (the first content milestone)

Each batch is written as setup → discovery → resolution groups, and the walk plus bots gate every card before it lands.

**Phase 4 - balance**

27. `plj` Tune balance for situational play. Target: the situational bot beats honest, liar and cautious; every setup can reach at least homeAtCost; no answer wins over 60% of the time where alternatives exist; and some setups guarantee only homeAtCost under the worst deal (today all 105 guarantee homeInTime), so packing matters.

Every new rule in phase 3 adds its invariant to `checkState`/`checkMove` before the content that uses it, so the walk proves it on every state.

**World and language** (world epic 0ts, autopilot off; language epic cmb; notes 2026-11-08)

The world bible comes before the Russian text, so Russian is written once with final names.

- `0ts.1` World bible in docs/world.md and the country names in the game (after `67a.9`). Western Union (where you live), an Eastern transit republic and Veyra are built; the other regions are background. Each country is described by its domestic system, its relationship with the others, the current event and your status there.
- `cmb.1` Plural forms in t() before any Russian text
- `cmb.2` Complete Russian text with a locked glossary (after `0ts.1`)
- `cmb.3` Language picker on the title screen, saved choice, long-text layout check at 390x844
- `cmb.4` Russian proofread by another model family, plus a review sheet for Yury
- `0ts.2` Legal status per country drives what a document means (after `70r.2`)
- `0ts.3` Current events and the transit leg, for example flights suspended so you travel through the transit republic (after `bzo.5`, decisions stay at most 14)
- `0ts.4` Reverse campaign design: leaving Veyra for the Union (design doc only)

**Phase 5 - later**

- `grd` Real art. Waits on a style decision (see below).
- `7kw` Recurring passengers and officers across runs
- `cb9` Hint at endings not found yet
- `eam` Pseudo-locale test for layout, before the first translation
- `26j` Installable PWA (independent, can go any time)

## UI rules (UI review, 2026-11-08)

- One timeline: "The bus leaves in 8 hours. You need 2 hours to reach the station." Success needs at least 2 hours left.
- No page scroll at 390x844 by default. With larger text or translations the content panel scrolls. Never shrink text or clip answers.
- Engine phases are gameplay only. Setup subpages, settings and evidence sheets are presentation state in React.
- At most 3 answers per card. Several fitting documents open from one "Show evidence" answer (`kuk`).
- A check's finding is stored apart from its resolution. A contact can explain a finding, not erase it (`fsx.2`).
- Style: cream dialogue and document surfaces, IBM Plex, dark green frame. Answers have equal weight; only actions like "Begin the crossing" get a strong button.
- Endings say only what the engine checks: "Home in time" becomes "Admitted, time to spare" or gets an epilogue, and missing the bus differs from arriving too late (`fsx.3`).

## How it runs

67a, fsx, 70r, bzo and cmb are autopilot on, groups of 3: `/harness-auto` builds, reviews and opens a PR per group of up to 3 beads, and never merges. The world epic 0ts is autopilot off, because its beads hold design calls Yury should see one at a time. `.agent/plan` points at 67a, so run `/harness-auto` for 67a, then point it at fsx (`echo border_crossing_game-fsx > .agent/plan`), then 70r, bzo and cmb. A bead stays open until its PR is merged and `pr-sync` closes it, so the next bead that depends on it waits for the merge. Every bead branches from and opens its PR against `worktree-prototype` (set as `VERIFY_BASE` in the local `.envrc.local`), because `main` only holds the first scaffold. Merging a PR redeploys Pages.

## Decisions for Yury

1. Art style, before `grd`: pixel art (PixelLab, needs its API token) or painted illustration (OpenAI or FLUX, needs that key; the mockup points this way). Decide after seeing the SVG pass on the phone. The UI style itself is decided (see UI rules).
2. Mark's brother is in a fictional country at war, not Ukraine as in the original note. `0ts.1` proposes where it sits in the fictional world; change it if you want the real one.
3. bd sync: create the `yurykorzun/beads` repo, then run `bd-attach migrate --db border_crossing_game`.
4. `67a.3` (scenario evals) is parked on branch `feat/border_crossing_game-67a.3`, no PR. Its reviewer flagged the "runs too short" known failure three rounds running, and it can't be fixed in code because runs really are 3-5.5 minutes (that's `67a.12`). Either amend 67a.3's description to allow a `tooShort` known failure pointing at 67a.12 and re-run `agent-review border_crossing_game-67a.3 --round 3`, or ship it with `agent-finish --ship-unresolved`. 35 beads wait on it, including all of fsx.

## Not in this plan

- A second mission. One mission keeps balance manageable. More encounters come only in phase 3b, after the rules.
- Languages beyond English and Russian.
- Building the other three world regions, beyond background in docs/world.md.
- Merging `worktree-prototype` into `main`. That is Yury's call.
