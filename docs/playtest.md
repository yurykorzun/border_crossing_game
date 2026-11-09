# Playtest script (10 minutes)

A short human playtest for one person who has not played before. It checks what the content lint can't: whether the player sees why things happen, and whether they would play again with a plan. Run it after any change to encounters, prices or the dealer.

## Before you start (1 minute)

- Open the game on a phone-size screen, fresh save, no character picked.
- Tell the player only this: "You need to get home to your father before the last bus. Play one run. I won't help, so think out loud if you like."
- Don't explain the rules, the resources or the bulletin. If they ask, say "Do what you think is right".

## Play one run (about 5 minutes)

Watch and stay quiet. Note down:

- Where they hesitate for more than a few seconds, and on which card.
- Anything they say out loud about why they picked an answer.
- Whether they read the bulletin warning on the packing screen.
- The ending they got.

### The expectation question (3 taps)

On three taps, ask before and after, then go quiet again: the first answer card at passport control, the first card that shows a check (an amber part like "Register check"), and one card at the security interview. These check screen rules 1, 4, 6 and 7 in `docs/design.md`, which no test can.

- Before the tap, while their finger is still over the answer: "What do you expect to happen if you tap this?"
- After the tap, once the screen has settled: "What changed?"

Write down both answers word for word, with the card and the answer they picked.

## Ask 5 questions (about 4 minutes)

Ask them in this order, word for word, and write the answers down as close to their words as you can.

1. What were you trying to do?
2. Which moment felt the most tense, and why?
3. Was there a moment where something bad happened and you didn't know why?
4. What did you think the officials knew about you by the end?
5. What would you try differently next time, and why?

## Answer sheet

| | Answer |
|---|---|
| Player, date, build | |
| Character, packing, bulletin | |
| Ending | |
| Hesitated on | |
| Said out loud | |
| Read the bulletin warning | yes / no |
| Expected / what changed, tap 1 | |
| Expected / what changed, tap 2 | |
| Expected / what changed, tap 3 | |
| 1. Trying to do | |
| 2. Most tense moment | |
| 3. Bad thing with no reason | |
| 4. What officials knew | |
| 5. Differently next time | |

## How to read the answers

- A specific answer means depth. "I'd pack the hotel booking because hosts were being phoned" or "I wouldn't deny my brother, because they found out at customs" shows the player saw cause and effect and has a plan.
- "Pick another button and hope" means causality is unclear. The player could not tie what happened to what they chose, so find the card from question 3 and check its reaction text and the line under each answer.
- Question 3 names the card to fix. If they can't name one, good.
- Question 4 checks the On file cards. If their list is far from what was really on file, the On file panel is not doing its job.
- The expectation question checks the screen, not the player. When "expect" and "what changed" match (for example "It costs an hour and they check the register", then "I lost an hour and the register came back clear"), the card said what it would do and the result said what it did.
- An expectation that misses the guaranteed part (the hour, the card used, the name shared) means the consequence row is not being read, so check its order and that the biggest tradeoff comes first. Missing only the possible part is fine, because that is the uncertainty the game is about.
- A "what changed" answer that names nothing, or the wrong desk, means the result did not say what happened and who learned it. Check that card's reaction and its result row.
- "I don't know" before a tap usually means the screen does more than one job. Find what is competing with the question.
- Hesitation is fine on a hard choice and bad on a confusing one. Compare where they hesitated with what they said about it.
- Read the answers from 3 or more players before changing content, because one player's run can be luck.

Last question, every time: What would you try differently next time, and why?
