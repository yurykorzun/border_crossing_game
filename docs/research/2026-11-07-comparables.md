# Comparable games and design lessons (2026-11-07)

TL;DR: Nobody has shipped this exact setup (a traveller being interviewed at a checkpoint). The closest games are Papers, Please (same desk, other side), Reigns (short card runs) and the refugee-journey games. Hidden or unreadable state is the most common complaint across all of them, so visible concern cards are the right call. Hand-rolled typed TS content is fine for this size.

## Comparables

| Game | What applies | Pitfall to avoid |
|---|---|---|
| Papers, Please (2013) | One small rule change per check, pressure lands on family. Fictional state keeps it "vague and non-judgemental" ([Game Developer](https://www.gamedeveloper.com/design/designing-the-bleak-genius-of-i-papers-please-i-)) | Paperwork called tedious ([Wikipedia](https://en.wikipedia.org/wiki/Papers,_Please)) |
| Reigns (2016) | Weighted card bag: cards that don't fit the state are removed, an active event pushes filler out until it resolves ([Game Developer](https://gamedeveloper.com/design/game-design-deep-dive-creating-an-adaptive-narrative-in-i-reigns-i-)) | Binary choices called shallow and repetitive ([Gaming Trend](https://gamingtrend.com/reviews/well-never-be-royals-reigns-review/)) |
| Fallen London | Storylets unlocked by game state ([Failbetter](https://www.failbettergames.com/news/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing)) | - |
| 80 Days (2014) | Travel clock plus short choices, branches reconnect and remember ([Game Developer](https://www.gamedeveloper.com/design/open-sourcing-80-days-narrative-scripting-language-ink)) | Scale (500k words) doesn't apply |
| Not Tonight (2018) | ID checks from the bouncer side | Unreadable fake-ID cues felt unfair ([Wccftech](https://wccftech.com/review/not-tonight-review-bouncer-in-brexit-britain/)) |
| Beholder (2016) | Totalitarian state, run-to-run variation | Repetitive, low replay value ([God is a Geek](https://www.godisageek.com/reviews/beholder-review)) |
| Orwell (2016) | Surveillance through a fake UI | Forced busywork steps, hard-to-follow information logic ([Stevivor](https://stevivor.com/reviews/review-progress-orwell/)) |
| Headliner: NoviNews (2018) | Choices hit co-workers and family, ~90 min, replayed for outcomes | "A bit too heavy handed" ([NWR](https://www.nintendoworldreport.com/review/51599)) |
| Bury Me, My Love (2017) | Refugee journey via texts, written in ink | Restarting from zero to see other endings is tedious, limited agency ([148Apps](https://www.148apps.com/reviews/bury-me-my-love-review)) |
| Liyla and the Shadows of War (2016) | Ends on a forced helpless choice, on purpose ([Wikipedia](https://en.wikipedia.org/wiki/Liyla_and_the_Shadows_of_War)) | Brevity criticised |
| Borders (2017 jam) | Traveller side, a skeleton marks where each player died ([Lamar](https://lamar.edu/news-and-events/news/2017/03/art-student-gonzalo-alvarez-enters-national-conversation-with-borders.html)) | Too short |
| The Waiting Game (ProPublica, 2018) | Only "keep going" / "give up", to show how wearing asylum is ([ProPublica](https://projects.propublica.org/asylum)) | - |

## Lessons for this game

1. Keep state readable. Concern cards say why you're under suspicion. Time is a number. Exposure shows as one line of text after each check, so it doesn't feel invisible.
2. Cap concerns at 2, because a third one turns them back into a meter.
3. Every option costs something (time or exposure), so no button is obviously right.
4. Short runs and fast restart. Skip the intro on replay, show which of the 4 endings you got and a one-line recap per check, so runs are easy to compare.
5. Officials can only challenge a contradiction they could plausibly discover. Otherwise it feels like an omniscient opponent.
6. Respect the subject: fictional state, no win fanfare on detention, the recovery scene is about the system and not about the player failing, questions read as procedure and not as a puzzle.

## Format

ink/inkjs is MIT, typed and used by 80 Days and Bury Me ([inkjs](https://github.com/y-lohse/inkjs)). Not needed yet, because our state (concerns, claims, official knowledge, time) is game logic, not prose flow, and TS unions let the compiler catch a bad id. Revisit if the text grows a lot or a writer outside the code joins.

Not verified: Borders run length, the original Polygon interview on Bury Me's tone.
