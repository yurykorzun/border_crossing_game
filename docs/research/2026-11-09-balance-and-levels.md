# Balance, storytelling and levels review

Date: 2026-11-09. Build reviewed: feat/border_crossing_game-pfi.4 (one commit ahead of worktree-prototype at cd96c4b).

Sources: a game review and research pass run in another Claude session (bot analysis, code trace, two phone-size playthroughs, desk research), three pasted design reviews from Yury, and an `npm run autoplay` run in this session. The research session's full source list was not carried over, and several of its quotes came through a summariser or are search snippets only. Two text extracts it used were left in /tmp (schengen_hb.txt, hmip_sthf.txt) and are not kept here.

## TL;DR

- The game looks and reads well, but it is solved. One memorised answer per card wins "Home in time" in 98% of 1,050 runs, with 4.65 hours to spare.
- Fix the solved core first, then cut what doesn't earn its place, then add carry-over between runs. Only then build levels. New content on top of today's rules would be solved the same way.
- Keep 7-11 decisions per run. Make them connect: the interview should reflect the crossing the player actually had.

## What was measured

- Lies almost never get caught. The strongest bot tells 2.7 lies per run and is challenged in 0.8% of runs. Showing a hotel booking at customs and then giving the mother's address at the interview goes unnoticed.
- Scrutiny is never a risk. Every scrutiny gain is an answer the player picks, so careful players stay at 0. Inspections happen in 0-7% of runs for every style except random play.
- Two of the four endings need bad play on purpose. "Turned back" needs a withdrawal, and the honest, lying and cautious bots never reach "Home at a cost".
- Runs repeat quickly. A careful player sees about 80% of the same cards between runs and gives the same answer on about 75% of them. Lena has 9 distinct card sets across 360 runs.
- 13% of decisions have only one open answer (mostly the photo card), and half of all decisions offer a no-cost answer.
- `npm run autoplay` on this build (200 runs per style): homeInTime is 90.5% for the liar bot, 63.0% for honest and 71.5% for cautious. Naming one contact raises homeInTime from 63.1% to 79.2%, so contacts are cheap.

## Where the choice collapses

| Card | Answer that always wins | Why |
|---|---|---|
| Cash | "It's under the limit" | Only a bag search disproves it, and that needs an inspection |
| Other relatives (Lena) | Deny | Nothing in the game can put Ilya on file, so the mother's plea is never tested |
| Who will you stay with | "Haven't decided" | No cost unless her address is already on file |
| Tourist vs family details | Clarify | No cost; picked 97% of the time |
| Old photo | Face scan | The only answer unless you packed the deed |
| Secondary inspection (supervisor) | Let her phone the hospital | No cost at the last desk |

Checked in code this session: the hotel booking is only blocked by the stayingWithFamily claim, not by the familyAddress fact; i_clarify "clarify" has no cost; nothing disproves Lena's denial on i_family.

## Recommended order

1. Make lies catchable.
   - Each desk spot-checks one recorded claim, picked by the dealer. Randomness picks the problem; the answer keeps a known price.
   - Add claim-versus-fact pairs from real procedure. The engine knows four; the research found about twenty. The ones that fit existing cards: a tourist with no booking to show; a hotel booked for fewer nights than the stated stay; a host whose account differs from yours; a bank notification on the phone that contradicts "I never donated"; a contact auto-synced on the phone after "I don't know anyone here"; Ilya surfacing for Lena through the phone search or the host call.
   - A flaw opens a check and the check decides (the EU border handbook's own rule).
   - When a lie is caught, quote the player's own words next to the fact. Today the card says only "What you told us is disproved by your file".
   - Remove the no-cost exits: "clarify" and the supervisor's phone call.
   - Withdraw can become a real dilemma: you leave with no ban, but you sign their version of events.
   - Targets: the memorised script under 60%, honest play at 50% or more, and an inspection in a quarter to a third of runs.
2. Cut what doesn't earn its place.
   - Drop the five-minute floor and the extra question on quiet runs.
   - "Ask for an update" shows its hint and the result together, so it is worse than waiting. Make the hint arrive before the contact decision, or remove it. (Not yet checked in code.)
   - The photo card usually has one open answer.
   - Keep five currencies, but show two meters (time, scrutiny), one hand (documents and people) and one file.
3. A fixed first run (the pasted summary was cut off here).
4. Replayability.
   - Replace "Endings seen 1 of 4" with a list of open questions at the start of each run ("Why can't you mention Ilya?").
   - The file persists between crossings, and the last run visibly changes the next.
   - Exclude recently seen cards across runs, and make queue text react to what you just did.
5. Levels: one new rule each, same three desks, unlocked by endings seen, not by winning.

| Level | New rule | Carries in |
|---|---|---|
| 1. Arrival (today's mission) | none | nothing |
| 2. Departure | Officers open with your file | lies, named contacts |
| 3. The funeral | Named contacts have statements that can contradict you | the file |
| 4. Renewal | A document expiry clock replaces the bus | documents kept or lost |
| 5. Collecting a child | A second person is questioned too | the file |
| 6. Three regions | One standing rule per region | the whole file |
| Daily crossing | Shared seed, three bulletins | optional |

   Each level needs roughly 4-6 new cards plus variants (the researcher's estimate, not sourced).
6. Sound, last. Play the stamp on touch-down as the one loud sound. iPhone web has no vibration. Keep all sound generated in code, so the silent switch mutes it.

## Storytelling

- Keep the writing style: short, observational, never tells the player what to feel.
- The catch is the weakest moment, because it names neither the lie nor the fact.
- Queue text is the same every run (about 15 taps).
- "2 things are on file" means nothing yet, because nothing uses the file again.
- Drop the Minor / Serious / Severe tags on consequences, because two research strands warn against scoring family harm (agreed, in pfi.13).
- Keep text within Failbetter's limits: 30 words per situation, 20 per choice.
- Strong one-line beats from real accounts: "A surname is called. Fifteen people stand." and "Nobody says you can go. You have to ask."
- Ask playtesters whether visible prices turn the moral choices into arithmetic. Designers disagree on this.

## Already handled

- Mark's relatives question already reads "Any family across the border?" (PR #21).
- Separate results on the ending (bus, medicine, people) are pfi.13.
- At Scrutiny 3/3 on the last desk, the engine already deals the inspection before admission. Only the help text ("the next officer") is unclear.

## How solid this is

- Measured: the 98% script, lie-catch rates, card repetition, the autoplay table and the code checks.
- Well sourced: a fixed first run, the questions list, carry-over between runs, one rule per level, quoting the lie back.
- Opinion or thin evidence: the currency count, the level list, the sound plan beyond the platform facts.
- Not checked: a real phone, human playtesters, the deployed site.

## Levels (added 2026-11-10)

- About 17 level ideas carry a new rule. The game can sustain 8-12, so plan 6-8 first.
- Ranked shortlist: arrival, departure, the funeral, overland bus, carrying for someone else, collecting a child, returning resident, transit limbo, renewal, two passports. Held back: shuttle trader (it went into the daily crossing as memory across days), carnet, airline desk, third-party permit, exit ban.
- Regions and a daily crossing add levels without a new rule to learn. Sixteen reskin ideas feed them.
- Each new rule means re-balancing every earlier level.
- The test: cut any level the player can win while ignoring its new rule. Every rwf level's walk check shows a bot that ignores the rule reaching homeInTime less often.
- Comparable games: a new situation per level keeps 60-75% of players to the end, against 30% for Not Tonight. A list of open questions drove replay in Overboard better than achievements did.
- Filed as epic rwf. Returning resident and transit limbo are noted on the reverse-campaign beads (0ts.4, 0ts.3) instead.
