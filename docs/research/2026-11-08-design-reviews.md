# Design reviews, 2026-11-08

Four notes Yury pasted on 2026-11-08 (from an outside reviewer who had not read the code), summarised here so the beads that cite them can be checked against the source. Each point was checked against the code before filing. "Code today" says what was true on 2026-11-08 at commit de61776.

## 1. Rules review

Core rule: a false claim creates a vulnerability, and discovering evidence activates it. Three outcomes: unchallenged (you saved resources), inconsistency (clarify, spend evidence or accept scrutiny), disproof (an expensive follow-up). Officials need a reason to react.

| Point | Code today | Bead |
|---|---|---|
| "Tune until lying loses" makes honesty the memorised answer | plj said exactly that | plj retargeted to situational play |
| Contacts clear any important check | True: assist clears any important check, even the phone search | fsx.2 |
| Hidden character traits | Partly: traits show in My story, not at character pick | 67a.7 |
| Family visit blocks the hotel | True (hotel.blockedBy familyVisit) | fsx.1 |
| Family address "contradicts" tourism | True, priced like a real disproof | fsx.1 |
| Exposing an unprotected contact has no penalty | True, only an ending line | fsx.3 |
| "Too late" hides other costs | Already handled: the ending lists medicine and exposures under any headline | fsx.3 makes it a scored list |
| Walker coverage | True: dealer picks come from 4 fixed seeds | fsx.4 |
| Extra find: "Say it is under the limit" adds +1 scrutiny before any count | True | fsx.1 |

Autoplay should measure: best ending per setup, success by character x packing x bulletin, choice frequency in winning runs, effect of spending each contact, inspection frequency and recovery (67a.2, fsx.4).

## 2. Twelve principles

1. Readable decisions: intention, guaranteed cost and known risk before choosing (fsx.2).
2. The best answer depends on circumstances (plj target, situational bot in 67a.2).
3. Preparation needs enough information: bulletins warn broadly (fsx.7).
4. Keep truth, statements and official knowledge apart; no lie detection from the engine's knowledge (fsx.1, fsx.9).
5. Every penalty is explained in the text (fsx.1).
6. Allow relief: "nothing is free" is too absolute (fsx.6).
7. Setbacks change the problem; no long doomed stretches (fsx.5).
8. Human costs are specific and proportionate (fsx.3).
9. Tension through contrast: routine and kindness between escalations (fsx.6).
10. Familiar encounters play differently in a new context, and familiar beats advance quickly (67a.6).
11. Reward learning principles, not memorising a trap sentence (fsx.1, fsx.8).
12. Bots find problems, people judge the experience (67a.2, docs/playtest.md in fsx.8).

Encounter checklist (fsx.8): why does it appear now, why might someone choose each option, what can the player anticipate, how could officials know this, what changes afterwards, why is it interesting on replay. Best playtest question: "What would you try differently next time, and why?"

## 3. Worked run (Lena)

One question offers branches, the next question reads the state, branches reconnect at the next checkpoint with their consequences kept, and the ending reads the final state. This matches the engine. The real cards differ in a few details:
- Lena's purpose answers are: show a document covering purpose (mother's letter or hospital note), "Family. Let them check the register" (-1 time), or tourism.
- The tourist follow-up at customs is c_tourist ("A tourist with a pensioner's prescription"), whose answers are admit, a document or the mother. Surrendering the medicine belongs to the routine c_medicine card and the s_medicine inspection.

## 4. Reference games

| Game | Borrow | Bead |
|---|---|---|
| Reigns | One encounter on screen, short wording, immediate feedback, quick runs; keep a third option when a document or ability makes a real alternative | 67a.5, 67a.6 |
| Overboard! (inkle) | Separate what happened, what you claimed, what each official knows; facts pass between desks only through a channel | fsx.9 |
| Papers, Please | The conflict lives inside the task; exposure hits a recognisable person ("your mother has been summoned") | fsx.3 |
| Road 96 | Recurring officers and passengers who remember earlier runs | later, bead filed outside the epics |
| Interrogation: You Will Be Deceived | Officers with distinct priorities and readable reactions, no hidden correct sentence | fsx.10 |

Sources the reviewer cited: failbettergames.com (choice and consequence, narrative pacing), inkle's "Changeable minds" on Medium, inklestudios.com/overboard, papersplea.se, the PlayStation Blog piece on Road 96, interrogation-game.com, and the GDC Vault talk by Mega Crit on balance. Not opened by me.
