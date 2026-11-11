# Purpose of Visit - design (v0.1, 2026-11-07)

TL;DR: A short portrait-mode card game. You live abroad and go home to a fictional country that has become more repressive since you left. You clear three checkpoints while keeping enough time and resources to finish your mission. Dialogue gives the story, visible rules decide the consequences. One run is about 5 minutes (4-8 for a run that goes the whole way), tap only. English first, other languages later.

The emotional hook: you're going home, but you no longer know whether home is safe for you.

The central decision: "Do I spend my evidence now, lose time, or put someone else at risk?"

This merges five design notes from 2026-11-07: the original pitch (one mission, three checks, visible consequences), storylets (small encounters picked by a director, truth vs claims vs official knowledge), resources (time, evidence, contacts, scrutiny), the waiting room (delays as active uncertainty) and the setting (present day, ordinary life). Where they disagreed, the resource note wins on rules, because it is the most concrete one. The original concern cards became "On file" cards, so the player still sees exactly what officials know.

## Setting

Present day. A fictional country people left but still have family, homes and obligations inside. Everything is familiar: a delayed bus, weak airport Wi-Fi, an unanswered message from a parent, a passport disappearing behind glass.

Your family says ordinary people cross every day. Friends abroad say don't go. Both know people whose stories back them up. You aren't sure how much has changed, or whether something you barely remember doing could matter now.

Politics stay concrete and arrive through people and decisions: an outlet was banned, a crossing closed, a donation became grounds for prosecution. No real country, agency or logo is named. The neighbouring country at war is fictional too, because a real one would pin the game to one real conflict (decision for Yury, easy to change).

Names used so far: the country is never named on screen in v0.1 (officers say "the Republic"), the capital crossing is Halden Central.

Lena and Mark are citizens coming home after years abroad (Lena six, Mark four), not visitors. Nobody asks them for a visa or treats them as tourists. The officers ask about the absence and the ties abroad instead: "You haven't been back for six years. Why now?", a residence permit abroad, which passport they left on, a demonstration abroad. The state already holds part of their life (a registered address, an apartment in the land register, the record of each crossing), so some of what comes up is found, not told (see On file tiers under "Truth, claims, official knowledge").

### Two pressures

The Republic draws on two different present-day pressures. They stay distinct: each card, fact and line belongs to one of them, and no game text names a real country, a real person or a recognisable trip-plus-charge combination. Only the mechanisms are kept.

1. The lists (the pressure on what you did before). Past support and protest become records long after the fact: a small donation to a fund that is now on an extremist list, an old photo from a demonstration, a phone that can be copied at the border. Family inside becomes leverage ("who else lives there"), and returning emigrants are questioned about what they did while away. In the game: `donation`, `protestPhoto`, `c_phone`, `f_donation`, `f_photo`, the bank notice, the protected cousin and the mother's call.
2. The war (the pressure on where your loyalty lies). The Republic is at war with a neighbouring country. A second citizenship, a relative on the other side and money or work from abroad read as questions of loyalty, and the exit record shows which passport you left on. In the game: `secondPassport`, `brotherAtWar`, `foreignEmployer`, `p_secondPassport`, `i_brother`, `i_employer` and the protected brother.

Lena carries mostly the first (the donation, her cousin) plus a foreign employer from the second. Mark carries mostly the second (two passports, his brother across the border) plus one photo from the first. The officers follow the same split: customs and the phone search look for the lists, the security interview asks about the war and ties abroad. When new content arrives, name which pressure it belongs to, and keep a mechanism from one out of the other (a donation is never a loyalty question about the war, a brother across the border is never on a fund's list).

## First mission: your father's stroke

Your mother needs help arranging his care. The last bus to the hospital leaves in 8 hours, and the station is 2 hours past the border. You carry his medicine, some cash and your everyday phone.

Requirement: be admitted and reach the last bus with at least 2 hours left. The bus to the hospital leaves in 8 hours, and you need 2 hours to reach the station, so the crossing can spend up to 6.

Endings (crossing result x mission result):

1. Home in time - admitted, 2+ hours left, medicine kept, protected person safe.
2. Home, at a cost - admitted, 2+ hours left, but the medicine is gone or the protected person was exposed.
3. Too late - admitted with under 2 hours left, so you miss the bus.
4. Turned back - you withdrew.

Turning back is offered at one set early point: the passport queue, after the clerk's "Next." and before the desk has asked or decided anything ("Leave the queue and go back", `canTurnBack()` in `src/game/engine.ts`). No desk card after it offers a way out. A later inspection offers "Ask to return" only where the situation allows it: the confiscation (they hold the medicine, so you can ask to leave with it) and the supervisor's check (she has not decided yet). The bag search runs to the end, and once the shuttle has gone there is no way back to ask for. `npm run autoplay` prints how often turnedBack is reached, and where.

Every ending also lists, scored by severity, the medicine, each person exposed and how badly, and how much is on file about you (consequences() in src/game/consequence.ts).

## Run shape

Prepare → passport control → customs → security interview → result. Between checkpoints, 1-2 phone messages (your mother, your employer, a fellow passenger) carry the wider story and hint at what's next.

Each checkpoint deals two encounter cards: one routine, one related to your background or earlier answers. Before you leave, the desk spot-checks one claim you made (see Claims and On file). Follow-ups from checks, a challenge card when a spot-check finds a flaw, and 0-2 secondary inspections come on top. A run is about 7-11 decisions: packing, then usually 6-10 at the desks (`npm run autoplay` prints the mean per style).

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

Both are citizens returning after years abroad (see Setting).

- Lena, works for a foreign company. Facts: foreign employer, donated to a fundraiser years ago, inherited her grandmother's apartment. Strength: once per run, answer a work question without spending evidence (only the interview asks one she can answer this way; the passport clerk wants paper). Weakness: questions about her employer cost 1 extra hour. Contacts: mother, cousin Ilya (protected: her mother asked her not to mention him).
- Mark, second citizenship. Facts: second passport, brother lives in a neighbouring country at war, an old protest photo on his phone. Strength: start with 1 extra evidence card. Weakness: start with 1 scrutiny. Contacts: mother, brother Tom (protected).

### What the people around you want

Each person wants something ordinary, and that is what pulls on you, not a score. Nobody's harm is counted.

- Your mother wants your father cared for and the family together. She volunteers what she thinks proves you innocent (on the host call she names the rest of the family unasked), and what she says is her account: testimony you can explain, never a disproof (`TESTIMONY` in `src/game/content/encounters.ts`).
- Ilya wants to help without getting involved. He plays a problem down so you don't worry.
- Your employer wants a return date. Work writes before you pack ("Do you know when you'll be back? The client meeting is Monday."), which pulls against the passport clerk's stay question.
- The officer wants a complete file before the shift ends. Sometimes that means a small kindness, like showing the woman ahead which copy is missing.

Your mother, Ilya and Tom each say one ordinary thing in the passport queue before any card can offer to name them (`PERSONAL_LINES` in `src/game/content/queues.ts`). The packing screen shows one message, from work. Between desks your mother's message follows what happened at the desk just left (`queueMood()` in `src/game/engine.ts`): after a call she says the officer asked about your relative, after a delay of 2 hours or more she asks if you are through, else she writes something ordinary about the hospital or food. Queues offer no choice, because nothing in them changes what comes next. A beat read on an earlier run can be skipped with one tap.

## Evidence cards (pick 3)

| Card | Useful against | Puts on file |
|---|---|---|
| Hotel booking | Accommodation, length of stay | You claim a hotel stay, can't back a family stay |
| Letter from mother | Purpose, accommodation | The family address |
| Employer letter | Work, money | Your employer |
| Hospital note | Medicine, purpose | Your father's condition |
| Return ticket | Length of stay (not cash: a ticket says when you leave, not what you carry) | A fixed departure date |
| Apartment deed | Identity (its registered address, not the photo), accommodation | Your property inside |

Each card but the return ticket covers two topics, so a "wrong" pick is rarely useless. The ticket answers one question, how long you stay (the passport clerk's `p_stay`), and answers it outright. History questions have no card on purpose: your past can only be answered with honesty, time or another person. Before picking, a daily bulletin warns about today's risk. The warning points at a topic and never names a card, so packing is a guess you can make well:

| Bulletin | Warning | Topic it points at | What it changes |
|---|---|---|---|
| Customs | "Medicines require supporting paperwork today." followed in the same bar by "Cash is checked at customs today." (`bulletin.customs.also`) | Medicine | Declaring the medicine costs 2 hours, and the lab has questions unless your father's condition is on file. "It's under the limit" gets counted anyway, and the total goes with your file |
| Accommodation | "Hosts are being phoned today." | Accommodation | Customs asks where you will stay, even with no address on file, and nobody answers the host call. "I haven't decided yet" puts no booking on file and costs +1 scrutiny, and denying other relatives meets your mother's account on the phone, which conflicts with yours (testimony, not a disproof) |
| Records | "IDs are checked against old records." | Identity | A scan or a passport check costs 2 hours and finds your past; facts reach every later desk at once. Denying other relatives is disproved because the old family register lists them |

So the day decides which answer is safe: the same denial or evasion is free on one day and caught on another, and a memorised script cannot tell the days apart.

Under the bulletin, one plain cue says what officers are doing today in the words of that topic ("Officers are calling hosts to check where you'll stay.", `bulletin.<id>.cue`). It replaced a Relevant today tag on each row, so the rows stay clean and the player matches the cue to the topics line.

`npm run walk` checks the warning means something: for every bulletin, packings with a document on the warned topic get home in time more often (with random answers and deals) than packings without one.

## Encounters

Every encounter shows up to three approaches with requirement and cost visible before you tap:

- Present evidence: needs a matching card, uses it up, may add an On file fact.
- Allow verification: always available, costs time, may open the waiting room.
- Name a contact: needs an unexposed contact, exposes that person.
- Sometimes a deflection or a lie: free now, may cost later (+1 scrutiny, a claim that can be contradicted).

Rules:

1. Every encounter has an option that needs no card and no contact.
2. Randomness picks the problem, the chosen solution has a predictable result.
3. Officials only challenge a claim they could plausibly catch: a clarify or contradiction encounter needs both your claim and an On file fact that speaks against it.
4. Earlier disclosures change later encounters through the director, not through hand-written branches.
5. Most things cost; preparation and luck sometimes earn a no-cost answer. A no-cost answer spends no time, scrutiny or contact and puts no new fact on file, though it may use a document card (`noCost()` in `src/game/engine.ts`). Preparation: a document that settles the question keeps a harmless fact off file (the deed for identity or where you stay, the return ticket for length of stay; `settles` and `HARMLESS_FACTS` in `src/game/content/world.ts`). The ticket used to settle the cash question (dhv.3); the realism review of 2026-11-10 (4qd.1) moved it to length of stay, because a flight out says nothing about the cash you carry, which the employer letter (income) or a declaration answers. Luck: a calm routine card (a helpful inspector, a glass of water) with one free answer. The honest bot averages at least 1 per run (`npm run autoplay`).

### Encounter checklist

Every new encounter must answer these six questions before it goes in (from the second design review, 2026-11-08):

1. Why does it appear now?
2. Why might someone choose each option?
3. What can the player anticipate?
4. How could officials know this?
5. What changes afterward?
6. Why is it interesting on replay?

The structural parts are machine-checked by the content lint (`lintContent()` in `src/game/lint.ts`, run by `src/game/content.test.ts`):

- Why now: every related or follow-up card has a `when` or a check result that queues it.
- Why each option: no two answers on a card do the same thing (same effects, same check and same spend). Say and verify spend nothing of their own, so a say and a verify with the same effects count as twins.
- How officials know: every scrutiny effect has a reason the card can point at (a fact it files or a condition puts on file, or the check that dealt it), and every time cost has a reaction (or, for a check result, an outcome line) that says what the hours are spent on and leaves the count to the "N hours lost" line. The answer line names the same event before you pick ("Lab test: 2 hours", `<card>.<answer>.event`).
- What changes: every card has an answer that changes something (a resource, a fact, a claim or an option). A calm card with exactly one answer is the one exception, because its job is the pause (the free answer from rule 5).

The rest (anticipation, replay) needs a person: use the playtest script in `docs/playtest.md`.

### Card checklist

Every card, new or changed, must also answer these seven questions (from the review of 2026-11-10, 4qd.3):

1. Why is this question asked now?
2. How did the officer learn it?
3. What does each answer claim?
4. Does the evidence disprove the claim or only raise a question?
5. Could the player anticipate the type of consequence?
6. Does the reaction describe the chosen action?
7. Does the callback preserve the original context?

The rule behind questions 2 and 4: a check can establish facts, but does not prove the officer's interpretation. Confirming that Lena works for a foreign company puts her employer on file; it does not establish political involvement. So the engine keeps three things apart: what exists (the character's background), what the check found (a fact on file) and what the officer infers (a suspicion line, `Officer.readings` in `src/game/content/world.ts`). The card shows "Confirmed: Your employer" under the reaction and "The officer questions your employer's connection." as a reaction line of its own, and no fact on file ever records the reading.

Naming a contact causes harm only with a stated reason the player can see ("Ilya was already questioned about the fundraiser"). Each contact line in the ending carries one (`EndingLine.reason`, `consequences()` in `src/game/consequence.ts`), and his contact card says it before you name him. Recording an address never sends anyone by itself: officers visit your mother only when the run flagged something about her at a desk (her address, her account against yours, or the relative she named; `Contact.flaggedBy`), and the reason names it and the desk ("Customs flagged her address, and it is on the report."). Without that, she gets a phone call. The visit happens the following morning, so it agrees with every epilogue, where she is at the hospital that night.

## Answers no style picks

`npm run walk` lists every answer the walk offers that no bot style with a purpose (honest, liar, cautious, situational) picks over every setup and seeds 1-10 (`neverPicked()` in `src/game/walk.ts`). The random style is left out, because over enough runs it picks everything once. An answer on that list never changes how the bots play, so it is cut, reworked, or named here with why it stays (`src/game/walk.test.ts` fails on one that is not).

Cut on 2026-11-10: `c_medicine.leave` (nobody is short of time at the first customs card, and the confiscation inspection still asks for the medicine), `i_employer.evidence` (Lena's plain answer settles it for free, and Mark's only work paper is the letter that put his employer on file). Reworked: Lena's plain answer left the passport card (`p_employer`), so the clerk wants the letter or the register and `p_employer.evidence` and `.check` now get picked.

Kept, because a person picks them even though the bots don't:

- `p_photo.questions` - another photo ID, the safe slow answer on a records day for someone with something in the records. Making it as fast as the scan there let the memorised script win 89.5% (rule 10 caps it at 80%), so it stays an hour slower.
- `c_phone.refuse`, `c_phone.unlock`, `f_photo.law` - the phone search is a customs follow-up only while something on your file is flagged (its open issue, 4qd.5), and over seeds 1-10 no bot with a purpose reached customs with a flag and the phone card left to deal, so none was searched and none got the photo follow-up after it. Refusing keeps the phone's contents (a relative, the donation, the brother) off file for 1 scrutiny; unlocking costs the hour.
- `c_pen.yes`, `i_phone.wait` - calm breathers with one free answer. They are dealt only after two escalating cards in a row at a desk, and with the two core cards first and at most one follow-up a desk, the bots' paths almost never line that up (the interview's glass of water covers the ones that do). They stay so the pacing rule always has a breather.
- `p_host.undecidedOnFile` - not deciding where to stay with your mother's address already on file costs 1 scrutiny, and every bot that showed the letter holds a cheaper answer. It stays as the evasion a nervous person gives.
- `s_medicine.withdraw`, `s_supervisor.withdraw` - turning back at an inspection. With each desk's core cards fixed, the bots reach the inspections with hours left, so they wait or answer instead. It stays as the exit a person takes when the price is the medicine or their mother.
- `i_family.name`, `f_host.cousin`, `i_employer.brother` - the truthful answer that puts the protected person on file to save an hour. That is the central decision ("put someone else at risk"), and the bots never trade a person for time.
- `f_lab.surrender` - the way out of a 2-hour lab wait when the hours are gone. The medicine for time, the same trade the confiscation inspection asks for.
- `f_host.evidence`, `f_lab.evidence` - a paper saved at the first card (the call, the declaration) can still settle the follow-up. Every bot spends its paper at the first card, so it never gets here holding one.
- `f_donation.explain`, `f_photo.honest`, `i_brother.honest` - the truth for 1 scrutiny instead of 2-3 hours. The honest bot prefers the slower check and the cautious one avoids scrutiny, and the liar and situational bots rarely get these cards, because they don't unlock the phone or scan on a records day.
- `f_donation.deny`, `f_photo.deny` - the lie with the evidence on the desk, which costs more than the truth. It stays because it's what a frightened person says, and paying for it teaches that lying against the file doesn't work.
- `s_supervisor.accept` - keeps your mother out of it, at the price of your father's condition on file. The bots spend the paper or call her, because she isn't the protected person.

## Screen rules

From Yury's design guidelines (2026-11-09). Every screen tells the player where they are, what they can do and what each choice could cost. The uncertainty comes from the people and the situation, not from a screen that hides its rules. Every new screen, and every change to an old one, must pass all eight:

1. One job per screen. A screen asks one thing: pick a traveler, pack, answer this officer, wait for this check, read how it ended. Anything else is one tap away.
2. Recurring controls stay in place. On every run screen the header (mission, hours left, scrutiny, `N / 3 · checkpoint`) sits at the top and the tray (My story, Evidence, Settings) at the bottom, so the player never hunts for them.
3. Each answer is an action row, then a consequence row, and the consequence row puts the biggest tradeoff first ("Uses letter · Reveals her address").
4. Guaranteed effects are told apart from possible results. The answer card shows what will happen for sure (hours, a card used, a name shared) and names what might happen as a check ("Register check"). After the tap, the screen reports what happened and which desk learned it.
5. Answers get equal weight: same size, same type weight, no default answer. Amber is for forward navigation or a warning, and always comes with a label or an icon, because color alone is lost on some players. Red is only for a confirmed escalation or harm (a protected contact exposed, the medicine lost).
6. Detail sits one tap away in My story, with the current decision first. The card carries what this choice needs, and the full record opens from the tray.
7. Art shows what changed, type stays crisp. The scene changes to show what a tap did (your document slides under the glass), and text stays real text, never drawn into the art, scaled or blurred.
8. Design for the crowded screen: the longest question, three answers that wrap, translations about 30 percent longer, and 200 percent text. With big text the screen scrolls, and it never shrinks or clips text.

What checks them so far:

- Rule 2: `e2e/layout.spec.ts` checks the header and the tray on the run screen.
- Rule 3 and the equal weight in rule 5: `e2e/layout.spec.ts` checks every card has an action row then one consequence row, in one type weight on every card.
- The red half of rule 5: `src/game/consequence.test.ts`.
- Rule 8: `e2e/crowded.spec.ts` opens the longest question in `src/i18n/en.ts` with three answers at 390x844, then again at 200 percent text, and checks every answer can be reached and seen whole, no text is cut off, and at 200 percent the answers wrap and the screen scrolls. The card is picked from the strings, so a longer question added later becomes the one under test.
- Rules 1, 4, 6 and 7 need a person: the expectation question in `docs/playtest.md` checks them.

## Truth, claims, official knowledge

- Truth: fixed by your character ("My story" panel).
- Claims: what you said ("No reason, a short trip").
- On file: what officials know ("Your registered family address"), which desk knows it, and how it sits on file.

On file tiers (`FACT_TIERS` in `src/game/content/world.ts`, `factTier()` in `src/game/engine.ts`). Every fact is one of three kinds, and the card names which: My story tags each fact, the line under a reaction says it ("Found in the old records: Your registered family address."), and the line under a challenge card's question says it ("In the old records: ..." / "Confirmed on file: ..." / "Flagged on file: ...").

1. Recorded: the state had it before you arrived, because you are a citizen. The registered family address, the apartment in the land register, and the exit record that shows which passport you left on. A desk that brings one up found it ("He finds your registered address and asks whether your mother still lives there.").
2. Confirmed: it came out on this crossing, from a document, an answer, a call or a search (your employer, your father's condition, the cash count).
3. Flagged: marked for attention. A donation to a listed fund and a refused search are flagged as soon as they are on file, and any fact becomes flagged once it is the reason scrutiny rises (`RunState.flagged`), so "Yes, I have both" turns the recorded second passport into a flagged one.

The tier is a label: it changes what the card says, never what a card costs or which card is dealt.

The engine keeps these separate. Content can only key off claims and On file facts (and the character's background for which deck cards exist), never off truth officials couldn't know.

A claim is in one of three tiers:

1. Unchallenged: nothing on file speaks against it. The claim stands and you saved the time, card or contact a true answer would have cost. "It's under the limit" is free while nobody has counted the cash.
2. Inconsistency: a fact makes the claim look odd, but does not disprove it (gave no particular reason, just a short trip, and your family's address or your father's condition is on file). The cheap clarify card (`i_clarify`): clarify with a new claim for 1 hour (the new story is checked), show a document, or accept +1 scrutiny.
3. Contradiction: a fact says the opposite (said no other relatives, and your brother abroad or another relative is on file; said under the limit, and the cash count is on file). The expensive card (`i_contradiction`): 3 hours for a formal review or +2 scrutiny. No contact can vouch it away.

Every reaction against you says which of three it is (`ReactionKind` in `src/game/types.ts`, `reactionOf()` in `src/game/engine.ts`). On the two challenge cards `catchKind()` in `src/game/content/encounters.ts` decides it, and any other answer that adds scrutiny names its own (`Approach.reacts`). A caught claim is named on the line under the reaction:

- Suspicion: a question raised. An inconsistency, a fact the officer flags for their priority, or what the officer reads into a confirmed fact.
- Conflicting testimony: someone said otherwise, which you can explain. Your mother's account on the phone (`TESTIMONY`: she says you stay with her, or she names another relative) only conflicts with yours. It is never a proven lie, and the review answer reads "Explain the difference".
- Disproof: a document or record shows the claim false (the old family register, the cash count, a bank notice, a contact synced on the phone, the donation record on the desk when you deny it). A face in a photo from your phone only raises the question, so denying it is a suspicion.

Only a disproof records the claim as disproved (`RunState.disproved`).

Both cards quote the claim back under the question: `You said: "..." (desk). On file: fact.` (caughtLine() in `src/game/consequence.ts`).

Spot-checks (`spotCheck()` in `src/game/engine.ts`): before you leave each desk, the officer checks one claim you made against what that desk knows. The dealer picks which, among the claims written down at some desk. The check decides (`spotCheckOf()`):
- clear: nothing this desk knows speaks against it, so it passes at no cost.
- flaw: a disproof (checked first) or an inconsistency, so its challenge card is dealt at this desk, queued like a follow-up so the pacing rule still holds.
- answered: that challenge card was already put to you, so it passes.
- explained: an inconsistency you have since explained with the clarify answer's claim, so checking it takes 3 hours (`SPOT_CHECK_HOURS`).

Randomness picks the claim; the answer keeps the price it shows. After a secondary inspection the desks stop spot-checking. A challenge that applies at the interview is still always dealt there. Before admission a supervisor reads the file once: on a run with no inspection yet that can still make the bus, scrutiny above 0 sends you to a secondary inspection, and a paper on the bulletin's warned topic settles her on two draws of 3.

No free exits: every challenge and inspection answer costs something, and the walk checks it (`noFreeExits()` in `src/game/walk.ts`). An inspection shows two answers that cost different things, plus "Ask to return" where its situation allows it.

The pairs live in `INCONSISTENCIES` and `DISPROOFS` in `src/game/content/encounters.ts`, and eval rule 3 and the walk both check a card is only dealt when its pair holds.

Rules that keep it fair:
- A document is blocked only by a claim that truly excludes it. The hotel booking is blocked by "Staying with family" (giving your mother's address as where you stay), not by "Visiting family", because you can visit family and sleep in a hotel.
- Every scrutiny effect names its reason: a fact on file or a check whose result dealt the card. It only applies while that reason holds, so a lie adds scrutiny only once a fact or a check result catches it. An honest answer that adds scrutiny puts its reason on file first ("Yes, I have both" files the second passport). The walk checks every move: scrutiny never rises without a reason that holds.
- Detection needs a fact on file, a check result or a document shown, never your background alone. The reaction text says what caused each time loss and scrutiny gain ("He writes 'refused search' on your file and makes you wait for a supervisor."), and the engine adds the hours.

### What each official knows

Each desk knows only its own facts (`RunState.facts` maps each fact to the desks that know it). A fact is known at the desk where it came out. It travels on only through a named channel:

1. The shared records system: with the records bulletin, a fact reaches every later desk at once.
2. A phone call between desks: a `{ send: 'call' }` effect passes facts this desk knows to the next desk. Today the passport clerk phones customs about your mother's address on the accommodation bulletin, and passes on your father's condition whenever a medical note answers why you came.
3. A printout handed over after a check: `{ send: 'printout' }` on a check result or inspection. The address check note, the phone search report and the bag search report go on to the next desk.

A call or printout reaches only the next desk, so a fact from passport control needs two hops to reach the interview without the records bulletin. Every condition on facts (cards, effects, scrutiny reasons, the clarify and contradiction cards) reads what the current desk knows, never the whole crossing. My story's On file column tags each fact with the desks that know it, and the reaction says when a fact is sent on ("Sent on to Customs: Family address."). The walk checks every move: a desk learns a fact only where it came out or through one of these channels.

Claims stay one shared list for now.

Verified once, asked once. A point resolved at one desk stays resolved (`RunState.verified`, `pointVerified()` in `src/game/engine.ts`): a document that answered it, or a contact who confirmed it. A document can verify more than the question it answered (`EvidenceCard.forwards`): the hospital note shown for why you came verifies the prescription too. A contact called in earlier adds no hour on a later card about a verified point. On a desk's own card about a verified point, an answer with `ifVerified` uses what is on file instead: declaring the medicine at customs costs nothing and opens no lab check, and the interview reads the employer the clerk confirmed instead of checking the contract. The answer keeps its place and reads `<key>.verified.label`. The host card at customs keeps its call, because a free answer there made the accommodation warning not worth heeding (the walk's warning check). The point stays resolved until a new reason appears: any fact flagged since it was verified opens it again. An inspection is the supervisor's, so what it settles stays there and verifies nothing for the desks.

## Director

For each checkpoint: deal its two core cards in a fixed order (`CORE_CARDS`), then at most one follow-up, the highest-priority related card that fits and whose open issue is still on the file (`Encounter.issue`, `relatedCard()` in `src/game/engine.ts`). A run deals at most 2 related cards (`MAX_FOLLOW_UPS`); the follow-up a check's result queues can be a third, unless the run was already inspected, so a run has 0-3. The clarify and contradiction cards are not follow-ups and are not counted, because a claim caught against the file is always put to you (see Claims and On file). After two checks in a run, a follow-up that would start a third is not dealt. Both limits are there because a longer run passes the 8-minute ceiling (eval rule 4). The seed is saved, so a run replays the same way and the branch checker can walk it.

Pacing: no more than 2 escalating cards (related, follow-up, inspection) in a row while a routine card is still left at the desk. After 2, the dealer deals that routine card first, a calm one if there is one, and whatever was next comes after it (`breather()` in `src/game/engine.ts`, eval rule 6, and the walk checks every path). Calm cards are kept for this: customs has one and the interview two, because that is the most breathers any path needs, and a calm tap is not a decision, so the walk's 14-decision budget holds.

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

Each story is a level: a record in `src/game/content/levels.ts` with its name and goal text keys, its start time, its minimum trip time, the cards it can deal and the one rule it adds. Level 1 Arrival is the first mission above, with no new rule. A run's setup names its level beside the traveler, packing and bulletin. Once an ending is seen, the level list comes before the traveler screen; a first run plays Arrival with no list. `npm run walk`, `npm run autoplay` and `npx tsx tools/eval.ts` run every level (or one, with `--level`), so each is checked by the same rules. `npm run walk -- --ignore <rule>` plays bots that never make the picks a level rule's heeders make, and a rule earns its place when ignoring it gets home in time less often.

## Prototype scope

1 mission, 2 characters, 6 evidence cards, 12 encounters (4 per checkpoint), a few follow-ups, 4 secondary inspections. Placeholder rectangles only. Play the same setup repeatedly before expanding. If one loadout or response keeps winning, change its cost or coverage.

## Content pipeline (later)

World bible → allowed mechanics → encounter outlines → batches of five as typed data → branch checker + playtest. Runtime text is scripted, never generated live.
