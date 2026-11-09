# Proofreading pass over src/i18n/en.ts

2026-11-09, bead border_crossing_game-67a.9. One read of every English string after the copy changes in 67a.6 and 67a.8.

TL;DR: 18 keys changed by the proofreading, plus 11 keys of new run-length content from 67a.12, listed separately below. Most are person fixes (the player is always "you"), one rendered a sentence starting lowercase, and the two 3/3 lines now say "Scrutiny 3/3". The rules are locked in `src/i18n/terms.test.ts`.

## Changed keys

| Key | Old | New | Why |
|---|---|---|---|
| `ui.scrutinyHelp.max` | At {max}/{max} the next officer sends you to secondary inspection. After it, scrutiny drops back to {after}. | At Scrutiny {max}/{max}, the next officer sends you to secondary inspection. After that, scrutiny drops back to {after}. | Scrutiny n/3 term; "After it" reads oddly |
| `ui.explainScrutiny` | Officers grow suspicious. At {max}/{max} you are taken aside. | Officers grow suspicious. At Scrutiny {max}/{max} you go to secondary inspection. | Scrutiny n/3 term; same name for the room as the help sheet, and "taken aside" is an idiom |
| `ui.missionRule` | Reach the last bus with at least {n} hours left. | Get through with at least {n} hours left to reach the bus. | From the PR 2 review: the 2 hours are the trip to the station, not spare time at the bus |
| `bg.foreignEmployer` | Works for a foreign company. It explains your income... | You work for a foreign company. It explains your income... | Mixed person in one line |
| `bg.donation` | Donated to a fundraiser years ago. ... The fund has since been listed differently. | You donated to a fundraiser years ago. ... The fund is now on a government list. | Person; "listed differently" is vague for a non-native reader |
| `bg.apartment` | Inherited your grandmother's apartment. ... | You inherited your grandmother's apartment. ... | Person |
| `bg.secondPassport` | Second citizenship. Another home, but limited protection inside the country you were born in. | You have a second citizenship. Another home, but little protection in the country where you were born. | Person; simpler ending |
| `ev.hotel.desc` | ... Cannot back a family stay. | ... Does not prove a family stay. | "back" as a verb is hard for a non-native reader |
| `ev.returnTicket.desc` | ... Fixes your departure date. | ... Puts your departure date on file. | Same pattern as the other documents, and "fixes" can read as "repairs" |
| `msg.1.0` | Hope your dad's OK. Any chance you make Monday's call? | Hope your dad's OK. Any chance you can make Monday's call? | Missing "can" |
| `enc.c_host.mother.label` | Give {contact}'s mobile | Give {contact}'s number | Same word as the two other "Give ...'s number" labels |
| `check.medicineLab.title` | The medicine has gone for checking. | The medicine has gone for testing. | Same word as the customs bulletin and secondary inspection |
| `check.medicineLab.lab` | A note comes back with the bag, and it is not a stamp. | The bag comes back with a note instead of a stamp. | Easier to parse |
| `wait.ask.detail` | Learn what is holding it. Puts your urgency on file | Learn what is holding it up. Puts your urgency on file | "holding it" is missing "up" |
| `wait.assist.reaction` | You give them the number of {contact}. | You give them {contact}'s number. | Same shape as the labels |
| `ending.homeAtCost.body` | You make it in time. Not everything you carried made it with you. | You make it in time. Not everything you carried comes with you. | Present tense |
| `ending.line.medicineLost` | The medicine stayed at the border. | The medicine stays at the border. | Present tense |
| `ending.line.exposed` | {contact} has been told to come in for a conversation. | The officers call {contact} in for a conversation. | Rendered as "your mother has been told...", a sentence starting lowercase |

## Changed for run length (67a.12), not proofreading

These shipped in the same PR, because 67a.12 made runs longer to reach the 5-8 minute target. They were proofread against the same rules, but the change is new content, not a wording fix.

| Key | Change |
|---|---|
| `msg.1.3` | Was "The inspector taps the steel table. "Bags here."", now a new line about the honey jar. The old line moved to `msg.1.5` |
| `msg.1.4` | New: the man behind you says to answer only what they ask |
| `msg.1.5` | New key, holds the old `msg.1.3` line |
| `msg.2.2` | Was "A door opens at the end of the corridor. "This way, please."", now the bench and the man waiting since morning. The old line moved to `msg.2.5` |
| `msg.2.3` | New: "They ask the same thing three different ways" |
| `msg.2.4` | New: a phone rings down the corridor |
| `msg.2.5` | New key, holds the old `msg.2.2` line |
| `ending.homeInTime.body` | Two sentences added after "Your father squeezes your hand." |
| `ending.homeAtCost.body` | Three sentences added after the tense fix above |
| `ending.tooLate.body` | Three sentences added after "Your mother is asleep in the corridor." |
| `ending.turnedBack.body` | Two sentences added after "You let it ring." |

e2e/setup.spec.ts asserts `ui.explainScrutiny` and `ui.missionRule` word for word, so it changed with them.

## Rules now in terms.test.ts

- No "time" as a unit ("time left", "{n} time", "costs time", and the same for minutes). The unit is hours.
- No "Noticed" or "Watchful". Any n/3 count reads "Scrutiny n/3".
- Names are spelled as in the contacts table (Ilya, Tom) plus Halden Central. Long names fail on a one-letter difference, Tom on a list of known variants, and "Halden" always comes with "Central".
- No em dash and no "--".
- No sentence starts lowercase, checked after filling {contact} with "your mother". Only the contact names and the three tags (exposed, protect, used) may start lowercase, because they are inserted mid-sentence.

## Left as is

- Spelling mixes US and UK ("traveler" next to "grey", "apologise", "towards"). Not a name or a term, so not changed here. Worth picking one before translation.
- The `ui.protected` tag reads "protect" next to "exposed". It works as an instruction, so I kept it.
- "five minutes fast" in `beat.interview.4` is about the clock, not the hours budget, so the test allows it.
