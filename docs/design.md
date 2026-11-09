# Purpose of Visit - design (v0.1, 2026-11-07)

TL;DR: A short portrait-mode card game. You live abroad and go home to a fictional country that has become more repressive since you left. You clear three checkpoints while keeping enough time and resources to finish your mission. Dialogue gives the story, visible rules decide the consequences. One run is about 5 minutes (4-8 for a run that goes the whole way, median 5 or more), tap only. English first, other languages later.

The emotional hook: you're going home, but you no longer know whether home is safe for you.

The central decision: "Do I spend my evidence now, lose time, or put someone else at risk?"

This merges five design notes from 2026-11-07: the original pitch (one mission, three checks, visible consequences), storylets (small encounters picked by a director, truth vs claims vs official knowledge), resources (time, evidence, contacts, scrutiny), the waiting room (delays as active uncertainty) and the setting (present day, ordinary life). Where they disagreed, the resource note wins on rules, because it is the most concrete one. The original concern cards became "On file" cards, so the player still sees exactly what officials know.

## Setting

Present day. A fictional country people left but still have family, homes and obligations inside. Everything is familiar: a delayed bus, weak airport Wi-Fi, an unanswered message from a parent, a passport disappearing behind glass.

Your family says ordinary people cross every day. Friends abroad say don't go. Both know people whose stories back them up. You aren't sure how much has changed, or whether something you barely remember doing could matter now.

Politics stay concrete and arrive through people and decisions: an outlet was banned, a crossing closed, a donation became grounds for prosecution. No real country, agency or logo is named. The neighbouring country at war is fictional too, because a real one would pin the game to one real conflict (decision for Yury, easy to change).

Names used so far: the country is never named on screen in v0.1 (officers say "the Republic"), the capital crossing is Halden Central.

## First mission: your father's stroke

Your mother needs help arranging his care. The last bus to the hospital leaves in 8 hours, and the station is 2 hours past the border. You carry his medicine, some cash and your everyday phone.

Requirement: be admitted and reach the last bus with at least 2 hours left. The bus to the hospital leaves in 8 hours, and you need 2 hours to reach the station, so the crossing can spend up to 6.

Endings (crossing result x mission result):

1. Home in time - admitted, 2+ hours left, medicine kept, protected person safe.
2. Home, at a cost - admitted, 2+ hours left, but the medicine is gone or the protected person was exposed.
3. Too late - admitted with under 2 hours left, so you miss the bus.
4. Turned back - you withdrew.

Every ending also lists who was exposed and what is on file about you.

## Run shape

Prepare → passport control → customs → security interview → result. Between checkpoints, 1-2 phone messages (your mother, your employer, a fellow passenger) carry the wider story and hint at what's next.

Each checkpoint deals two encounter cards: one routine, one related to your background or earlier answers. That is 6 decisions, plus follow-ups from checks and 0-2 secondary inspections.

## Resources

| Resource | Start | Shown as |
|---|---|---|
| Time | 8 hours until the last bus | "8 hours remaining" + pips, always visible |
| Evidence | 3 cards picked from 6 | Card row, used cards stay visible but greyed |
| Contacts | 2 named people | Chips, exposed ones are marked |
| Scrutiny | 0 of 3 | Three empty spaces |
| Mission item | Father's medicine | Shown on the mission card |

At 3 scrutiny the crossing pauses for one secondary inspection, then scrutiny drops to 1. Scrutiny is an extra cost, never an instant loss.

## Characters (one strength, one weakness, three background facts)

Background facts come from ordinary life and are the "My story" panel. Encounters key off them.

- Lena, works for a foreign company. Facts: foreign employer, donated to a fundraiser years ago, inherited her grandmother's apartment. Strength: once per run, answer a work or money question without spending evidence. Weakness: questions about her employer cost 1 extra hour. Contacts: mother, cousin Ilya (protected: her mother asked her not to mention him).
- Mark, second citizenship. Facts: second passport, brother lives in a neighbouring country at war, an old protest photo on his phone. Strength: start with 1 extra evidence card. Weakness: start with 1 scrutiny. Contacts: mother, brother Tom (protected).

## Evidence cards (pick 3)

| Card | Useful against | Puts on file |
|---|---|---|
| Hotel booking | Accommodation, length of stay | You claim a hotel stay, can't back a family stay |
| Letter from mother | Purpose, accommodation | The family address |
| Employer letter | Work, money | Your employer |
| Hospital note | Medicine, purpose | Your father's condition |
| Return ticket | Length of stay, money | A fixed departure date |
| Apartment deed | Identity, accommodation | Your property inside |

Each card covers two topics, so a "wrong" pick is never useless. History questions have no card on purpose: your past can only be answered with honesty, time or another person. Before picking, a daily bulletin hints at today's risk.

## Encounters

Every encounter shows up to three approaches with requirement and cost visible before you tap:

- Present evidence: needs a matching card, uses it up, may add an On file fact.
- Allow verification: always available, costs time, may open the waiting room.
- Name a contact: needs an unexposed contact, exposes that person.
- Sometimes a deflection or a lie: free now, may cost later (+1 scrutiny, a claim that can be contradicted).

Rules:

1. Every encounter has an option that needs no card and no contact.
2. Randomness picks the problem, the chosen solution has a predictable result.
3. Officials only challenge a contradiction they could plausibly discover: a contradiction encounter needs both your claim and an On file fact that conflicts with it.
4. Earlier disclosures change later encounters through the director, not through hand-written branches.

## Truth, claims, official knowledge

- Truth: fixed by your character ("My story" panel).
- Claims: what you said ("Visiting as a tourist").
- On file: what officials know ("Family address on file").

The engine keeps these separate. Content can only key off claims and On file facts (and the character's background for which deck cards exist), never off truth officials couldn't know.

## Director

For each checkpoint: draw one routine card from that checkpoint's deck (seeded random, unseen first), then pick the highest-priority eligible related card. If nothing fits, deal another routine card. The seed is saved, so a run replays the same way and the branch checker can walk it.

## Waiting room

Two kinds of time: mission time (hours until the last bus) and screen time (a few seconds of beats). A two-hour check costs 2 hours but plays in 15-30 seconds.

1. You pick an approach that triggers a check (for example "Wait for the call").
2. The engine fixes the result now, from facts already established. Waiting only reveals it, it never re-rolls.
3. Two or three beats play, mostly ordinary procedure ("A stamp sounds from another booth"). Observations, never certainty ("The officer makes a phone call", not "The officer suspects you").
4. On important checks you get one waiting-room action: wait quietly (free), ask for an update (learn what's holding it, puts your urgency on file), request assistance (spend a contact to clear it).
5. The check resolves: clear, or a follow-up card with its own approaches.

Beats last 2-5 seconds, tap advances, and a reduced-wait setting skips them. Costs and choices stay the same in every mode.

## Languages

English first, built for translation from day one:

1. All player-facing text lives in `src/i18n/<locale>.ts`, keyed by content id (`enc.<id>.q`, `enc.<id>.<approach>.label`). Game logic files hold no prose.
2. A test fails when English is missing a key the content uses, so holes fail loudly (Alexis pattern).
3. Other locales may be partial and fall back to English, and a script reports their coverage.
4. Numbers and plurals go through `Intl.PluralRules`, no string concatenation of sentences.
5. Layout leaves room for ~30% longer text (German, Russian), and buttons wrap instead of truncating.
6. Not yet: RTL, locale-specific art.

## Later stories on the same crossing

Someone returning for a funeral, a parent collecting a child, an emigrant renewing documents. Each has different resources and something different to lose. A familiar officer or passenger can reappear across runs. Build these only after the first mission is fun.

## Prototype scope

1 mission, 2 characters, 6 evidence cards, 12 encounters (4 per checkpoint), a few follow-ups, 4 secondary inspections. Placeholder rectangles only. Play the same setup repeatedly before expanding. If one loadout or response keeps winning, change its cost or coverage.

## Content pipeline (later)

World bible → allowed mechanics → encounter outlines → batches of five as typed data → branch checker + playtest. Runtime text is scripted, never generated live.
