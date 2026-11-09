# Purpose of Visit - how the game works, as a card game

TL;DR: you hold a small hand of document cards and two people you can call on. The border deals you 6 question cards across 3 checkpoints, and up to 3 more while your run stays quiet. Most questions have 2-3 answers, and most answers have a price in time, suspicion, a card from your hand, or a person you expose. Most things cost; preparation and luck sometimes earn a no-cost answer. So the game is about which price you can afford to pay right now.

## The pieces

**Your resources (the "mana")**
- Time: 8 points. Most answers that verify something cost 1-2. You win cleanly only if you finish with 2 or more.
- Scrutiny: a 0-3 track. It only rises for a reason you can see: something on file or a check result that catches a lie, or an honest answer that puts something awkward on file. At 3 you are pulled into a secondary inspection, and it drops back to 1 afterwards.
- Your hand: 3 document cards (Mark packs 4), chosen from 6 before you leave. Each card can be played once.
- Your people: 2 contacts (your mother, plus a cousin or a brother). Naming one solves a problem but exposes them for the rest of the run.
- Each contact can confirm only some topics, and My story lists them: your mother the address, the visit and the prescription; cousin Ilya a place to stay; brother Tom a job offer abroad. A contact answer shows only on a card whose topic they can confirm, and it reads cost first, then gain ("Puts your mother on file · May confirm the address"). Nobody can vouch away data, so identity and history cards have no contact answer. Naming a relative when asked is different: it confirms nothing, so it needs no ability.
- Medicine: your father's medicine. You can give it up to get out of trouble, and it costs you the clean ending.

**Your character (the "class")**
- Each character has one Advantage and one Complication, and three hidden background traits.
- Lena: once per run she can answer a work question without a document. Checks on her employer cost 1 extra time. Her background has a foreign employer, an old donation and an apartment.
- Mark: packs 4 documents instead of 3, and starts at Scrutiny 1. His background has a second passport, a brother across the border and a protest photo.
- Each has one protected person. Exposing them costs you the clean ending.
- Exposing anyone else costs time later: they are called in, so the next card that asks about something they can confirm takes 1 more hour. Every ending lists each person exposed with a severity (minor for a phone call, serious once their home is on file, severe for the protected person), plus the medicine and how much is on file.

**The bulletin (the "modifier")**
- One of 3 is dealt per run: customs is strict, accommodation calls are checked, or old records are being cross-checked.
- It changes the price of some answers and the results of some checks. The same hand plays differently on a different day.

## The decks and the dealer

Each checkpoint (passport, customs, interview) has its own deck. At each one the dealer deals 2 cards:

1. A routine card, which is a question everybody gets. The first checkpoint always opens with "Purpose of your visit?".
2. A related card, which is the highest-priority card whose condition matches what you have done so far. If none match, you get another routine card.
3. Only while the run is quiet: a third card. Quiet means every decision so far was a checkpoint card, with no follow-up, no inspection and no question asked in a waiting room. The third card is the routine question you have not had yet, else the best related card that fits, else nothing. It is existing content, so it adds a decision and very little reading. It exists because a quick, clean run was too short (eval rule 4), while a run full of checks and inspections is long enough already.

Two more rules give the run some relief, so escalation lands harder:

- Pacing: after 2 escalating cards in a row (related, follow-up, inspection), a routine card still left at that desk comes first. Whatever was next still comes after it. `npm run eval` rule 6 checks this on every transcript.
- The breather is a calm card: an inspector lending you a pen at customs, a glass of water or a ringing phone at the interview. It has one answer, it costs nothing, and the tap is not counted as a decision. Calm cards are only dealt as breathers, so the desk always has one when the rule needs it.

This is the storylet rule. Cards wait until they make sense. If you said "tourist" at passport control, customs deals "A tourist carrying a pensioner's prescription?" (priority 3). If you showed your mother's letter, customs deals "We'll call your host" (priority 2). If your phone could hold something (the protest photo, the donation), customs may search it.

Some answers also queue a follow-up card that is dealt next. For example, a phone search that finds the protest photo queues "Were you at this rally?".

## What a card looks like

Every question card offers 2-3 answers, and they are always built from the same 5 kinds:

| Kind | What you pay | Example |
|---|---|---|
| Show a document | A card from your hand, and its facts go on file. A document that settles the question keeps a harmless fact off file, so it costs only the card | Show the employer letter, so "your employer" is now on file. Show the deed for your photo, and nothing goes on file |
| Let them check | Time (1-3), sometimes a waiting-room check | "Let them count it" -1 time |
| Say something | Free now, but it adds a claim, or +1 scrutiny when something on file is the reason | "Say you're a tourist" adds a claim |
| Name someone | Exposes a contact | "Ask your mother to vouch" |
| Advantage | Your once-per-run ability | Lena explains her job plainly |

A no-cost answer spends no time, no scrutiny and no contact, and puts no new fact on file (it may still use a document card). Preparation earns one (the deed for your photo, the return ticket for your cash), and so does luck (a calm card, a lie nobody catches yet). `npm run autoplay` prints how many each bot style gets per run.

The rule that keeps it fair: every card has at least one answer that needs no document and no person, so you are never stuck. Missing options still show as greyed out ("Show a document - none packed"), so you can see what your packing cost you.

## Claims and facts (the memory)

- Claims are what you said: visiting family, tourism, a hotel stay, no other family.
- An answer records only what its words say. Asked about relatives, you name your contact, say "I have no other relatives here." or ask why. Only the denial records "No other relatives", because leaving someone out is not a lie.
- Facts are what the state now knows (shown as "On file"): the family address, your employer, your phone was searched, your brother abroad.
- Each desk knows only what came out there, and My story tags each fact with the desks that know it. A fact travels on only through a channel: the shared records (with the records bulletin it reaches every later desk at once), a call from one desk to the next, or a printout handed over after a check. So the address you showed at passport control is not known at the interview unless something carried it there.
- A lie has three tiers. Unchallenged: nothing on file speaks against it, so it is free and you saved what the truth would have cost. Inconsistency: a fact makes it look odd (say "tourist", then your family address goes on file), and the interview deals a cheap clarify card: clarify for free, show a document, or take +1 scrutiny. Disproof: a fact says the opposite (deny other relatives while your brother abroad is on file, or say your cash is under the limit and then the bag search counts it), and the interview deals an expensive card: 3 hours or +2 scrutiny. Nobody can vouch it away.
- Every scrutiny gain names its reason (a fact on file or a check result), and the reaction says it. A lie never adds scrutiny until something catches it.
- Each officer has one priority, stated in one line above the first question at their desk (`OFFICERS` in `src/game/content/world.ts`). The passport clerk wants accurate paperwork and the customs inspector wants goods declared, and their cards already price that in. The security officer cares about politics: an answer that brings a political fact out at the interview for the first time (the second passport, the brother across the border, the old donation) costs +1 scrutiny with that fact as the reason, where the same answer at the passport desk costs nothing extra. Officer mood is not shown yet, because no mechanic sits behind it.
- Only claims that truly exclude each other block a document. Saying you stay with your mother blocks the hotel booking; visiting family does not.

## Waiting rooms (checks)

Some answers start a check, like a records scan, a call to your host, a lab test of the medicine or a phone search. The result is fixed the moment the check starts, from your background, the bulletin and the facts on file. The waiting room then plays 2-3 short beats, and the player cannot change the result, only how they meet it.

Every check names itself ("Medicine check"), says what is happening, and shows "Verification in progress" with three dots. Once the beats are done you choose:
- Wait for the result: free.
- Ask for an update: you learn what is happening, and "you're in a hurry" goes on file.
- Ask a contact to vouch, only when a free contact can confirm what the check is about. Today that is the host call, which your mother or Ilya can settle. It clears the check and exposes them, but anything the check found stays on file. The phone search and the records check have no vouching, because nobody can vouch away data.

After every answer the officer's reaction shows with one line per change ("Your mother's address is now on file.", "1 hour lost.", "Scrutiny 2/3."). The button says what comes next: Continue within a checkpoint, then "Proceed to customs", "Proceed to the interview" or "See how it ends".

## Endings (the scoring)

Checked in this order:
1. Turned back: you withdrew during an inspection.
2. Too late: you finished with fewer hours left than the trip to the bus takes (2, or more after a missed connection).
3. Home at a cost: you lost the medicine or exposed your protected person.
4. Home in time: none of the above.

So there are two levels of winning. Getting through at all is the first level, and getting through without paying with people or the medicine is the second.

## How balance works

**Design rules every card follows**
- Each answer costs something different, so no answer is the best one on every card. Documents are limited (3-4 for 6-9 questions), time is limited (8, and you need 2 left), and suspicion has a hard ceiling (3).
- Honesty costs time now, and lying costs suspicion or a contradiction later. That trade is the core tension.
- An inspection changes the problem instead of only costing hours, and it resets scrutiny to 1, so one inspection hurts and does not end the run. The bag search costs 3 hours (and counts your cash) or a person. Confiscation holds the medicine: wait 3 hours to get it back, or leave without it. A missed connection makes the trip to the bus an hour longer, so you need an hour more left, unless someone drives out for you (a person on file). Extra verification checks why you travel: spend the document that backs it, or your father's condition goes on file.
- Once you have fewer hours left than the trip takes, the bus is out of reach: the card says "You will not make the bus now." and offers to finish the crossing quickly (Too late), so a doomed run does not need more clicking. The walk checks that no deal from such a state still reaches the bus.
- The Advantage and the Complication touch the same topic. Lena is good at work questions and slow when her work is checked.

**The branch walk (the proof)**
A script (`npm run walk`) plays every possible choice and every card the dealer could deal, from every possible state: both characters, every packing, all 3 bulletins. It does not sample, it plays them all. The last run (2026-11-09) visited 8,845,731 states across 105 setups in about 57 s and checked, at every state and move:
- No dead ends and no loops: every run ends.
- Time stays 0-8 and scrutiny 0-3; a spent document, an exposed contact or the used Advantage never comes back.
- A double tap or a second resolution of the same check is refused; nothing is accepted after the ending.
- The ending matches the final state, and no follow-up is left queued.
- Scrutiny never rises without a reason that holds, the clarify and contradiction cards are only dealt when their claim and fact pair is on file, and the hotel is never shown after "Staying with family".
- Every reaction line has English text.
- All 4 endings can be reached, every card is dealt and every answer offered somewhere.
- The longest run is 14 decisions (the limit is 14). In the eval the shortest full run is 4.8 minutes and the median 5.7 (eval rule 4 asks for 4-8 and a median of 5 or more).

Any broken rule comes with a replay (setup, moves, dealer picks), so it can be reproduced in a test.

Ending shares across all branches (share of branches, not of players): home in time 19.6%, at a cost 33.7%, too late 26.4%, turned back 20.2%.

**What is not balanced yet**
The walk also works out the best ending a player can force in each setup whatever the dealer deals. Today it is "home in time" in all 105 setups, so for an informed player no packing is ever a real loss, and lying is too cheap (a tourism lie still got home with 6 of 8 hours left in playtesting). The target is situational play: the best answer depends on the moment, no single style wins, and some packings can only guarantee "home, at a cost". Autoplay bots (67a.2) measure styles, and plj tunes the prices.

## Where it lives in code

- Cards and rules are data: `src/game/content/encounters.ts` (decks, checks, inspections) and `src/game/content/world.ts` (characters, documents, constants).
- The dealer and the rules engine: `src/game/engine.ts`, a pure function `step(state, action)` with a seeded random generator, so any run can be replayed exactly.
- All text: `src/i18n/en.ts`, so cards can be translated without touching the rules.
