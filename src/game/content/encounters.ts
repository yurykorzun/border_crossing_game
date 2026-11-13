// The encounter decks. Each checkpoint deals its two core cards in a fixed
// order (CORE_CARDS), then at most one follow-up: the highest-priority related
// card whose open issue is on the file (see engine.ts deal()).
// Text lives in src/i18n/en.ts: enc.<id>.q, enc.<id>.<approach>.label/.reaction.
//
// Rule: every encounter has an approach that needs no card and no contact.
// Most answers cost something. A calm card (a helpful inspector, a glass of
// water) costs nothing, so the escalation around it lands harder. Only the
// pacing rule deals one (breather() in engine.ts). Passport control never
// needs a breather, so it has none (the walk checks every card is dealt).
//
// Facts stay at the desk where they came out (docs/design.md "What each
// official knows"). They travel on only through a channel: the records
// bulletin, or a `send` effect here (a call between desks, a printout after a check).

import type { Check, CheckId, ClaimId, Cond, Effect, Encounter, FactId, Inspection, ReactionKind } from '../types';

/**
 * Three tiers for a claim (docs/design.md "Truth, claims, official knowledge").
 * Unchallenged: nothing on file speaks against it, so it stands for free.
 * Inconsistency: a fact on file makes it look odd. Cheap to clarify (i_clarify).
 * Contradiction: a fact on file says the opposite. Expensive (i_contradiction).
 * A contradiction is a disproof when a record or a document says it, and
 * conflicting testimony when a person does (TESTIMONY, catchKind()).
 */
export const INCONSISTENCIES: readonly [ClaimId, FactId][] = [
  // "No reason, a short trip" answers "Why now?" with no reason, so a
  // fact on file that gives one (the family here, your father's condition) looks odd.
  ['shortTrip', 'familyAddress'],
  ['shortTrip', 'fatherCondition'],
  // A short trip home with nowhere booked (p_host).
  ['shortTrip', 'noBooking'],
  // A hotel booking, and the family address on file.
  ['hotelStay', 'familyAddress'],
];
/**
 * Contact statements (The funeral): what someone told the border before you
 * came, on file at every desk from the start (Level.statements). A claim that
 * agrees with it stands. One it `disproves` is a contradiction like any other,
 * caught by i_contradiction or a spot-check. It is testimony, not proof
 * (TESTIMONY), so it can be explained.
 */
export const STATEMENTS: readonly { fact: FactId; agrees: ClaimId; disproves: ClaimId }[] = [
  { fact: 'sisterSaysDays', agrees: 'stayDays', disproves: 'stayWeeks' },
  { fact: 'sisterSaysWeeks', agrees: 'stayWeeks', disproves: 'stayDays' },
];
/** A claim against a statement on file, as a contradiction pair. */
const STATEMENT_PAIRS: readonly [ClaimId, FactId][] = STATEMENTS.map((x) => [x.disproves, x.fact]);
/** What the clarify answer says. Once you have said it, a spot-check finds an inconsistency explained (spotCheckOf()). */
export const CLARIFIED_BY: ClaimId = 'familyVisit';
/** In this order, which also picks the one an apology is charged for (firstCaught). */
export const CONTRADICTIONS: readonly [ClaimId, FactId][] = [
  // Mark's "No family across the border": only his brother abroad on file says otherwise.
  // A relative in the contacts or the register says nothing about the border.
  ['noFamilyAbroad', 'brotherAbroad'],
  ['cashUnderLimit', 'cashCount'],
  // The host call: your mother says you stay with her.
  ['hotelStay', 'hostStatement'],
  // The phone search: a bank notice for the donation.
  ['neverDonated', 'bankNotice'],
  // A relative synced on the phone, or listed in the old family register.
  ['noOtherFamily', 'relativeContact'],
  // Your mother names another relative, on the host call or when customs phones her.
  ['noOtherFamily', 'relativeNamed'],
  // The funeral: a stay that disagrees with what your friend's sister told the border (STATEMENTS).
  ...STATEMENT_PAIRS,
];

/**
 * Facts that are someone's account, not a record: what your mother told an
 * officer on the phone. A claim they speak against is conflicting testimony,
 * which you can explain, never a proven lie.
 */
export const TESTIMONY: readonly FactId[] = ['hostStatement', 'relativeNamed', ...STATEMENTS.map((x) => x.fact)];

/**
 * The cards that ask about travel history: which passport you left on and when.
 * Mark's second passport costs something only on these (char.mark.complication):
 * on the exit record from the start (Character.onFile), it adds verification
 * where a desk reads that record, and nowhere else, so it is not a cost on every crossing.
 */
export const TRAVEL_HISTORY_CARDS: readonly string[] = ['p_secondPassport'];

/**
 * The cards that challenge a claim, most expensive first. One that applies is
 * always dealt before its checkpoint ends, so a lie disproved by the last
 * answer still has to be answered.
 */
/** Naming Tom puts his record on file, at every desk that offers him (i_family, d_named). */
const NAMED_TOM: Effect = { fact: 'brotherAbroad', when: { background: 'brotherAtWar' } };

/** What "any other relatives?" asks about: a relative on file, by any route (Encounter.asks). */
const RELATIVE_FACTS: FactId[] = ['brotherAbroad', 'relativeContact', 'relativeNamed'];

export const CHALLENGES = ['i_contradiction', 'i_clarify'] as const;

/** The claim and fact pairs each challenge card puts to you. */
export const CHALLENGE_PAIRS: Record<(typeof CHALLENGES)[number], readonly [ClaimId, FactId][]> = {
  i_contradiction: CONTRADICTIONS,
  i_clarify: INCONSISTENCIES,
};

/**
 * Which of three a challenge is (docs/design.md "Truth, claims, official
 * knowledge"). suspicion: an inconsistency, a question raised. testimony:
 * someone said otherwise, which you can explain. disproof: a document or
 * record shows the claim false. Only a disproof records the claim as disproved
 * (RunState.disproved).
 */
export function catchKind(card: (typeof CHALLENGES)[number], fact: FactId): ReactionKind {
  if (card === 'i_clarify') return 'suspicion';
  return TESTIMONY.includes(fact) ? 'testimony' : 'disproof';
}

const anyPair =(pairs: readonly [ClaimId, FactId][]): Cond => ({ any: pairs.map(([c, f]) => ({ claims: [c], facts: [f] })) });

/** Holds when no pair has both its claim made and its fact known at this desk. */
function noneOf(pairs: readonly [ClaimId, FactId][]): Cond {
  if (!pairs.length) return {};
  const [[c, f], ...rest] = pairs;
  const tail = noneOf(rest);
  return { any: [{ noClaims: [c], ...tail }, { noFacts: [f], ...tail }] };
}

/** `scrutiny` for the first pair that holds, with its fact as the reason, so one answer is charged once. */
const firstCaught = (pairs: readonly [ClaimId, FactId][], scrutiny: number): Effect[] =>
  pairs.map(([c, f], i) => ({ scrutiny, reason: f, when: { claims: [c], facts: [f], ...noneOf(pairs.slice(0, i)) } }));

/**
 * What saying sorry costs on i_contradiction: 2 scrutiny for the first pair caught.
 * Against a contact statement (The funeral) the officer rings her back to compare
 * the two accounts instead, which costs 1 scrutiny and 2 hours.
 */
const apologyFor = (pairs: readonly [ClaimId, FactId][]): Effect[] =>
  firstCaught(pairs, 2).flatMap((e) => ('reason' in e && STATEMENTS.some((x) => x.fact === e.reason) ? [{ ...e, scrutiny: STATEMENT_SCRUTINY }, { time: -STATEMENT_CALL, when: e.when }] : [e]));
const STATEMENT_SCRUTINY = 1;
/** Hours the officer spends ringing back the contact who gave a statement. */
const STATEMENT_CALL = 2;

/**
 * Each desk's own job, as two questions asked on every run in this order.
 * Passport: why you came and where you will stay. Customs: what you carry.
 * The interview: who you know and where you have been. Anything else a desk
 * asks is a follow-up on an open issue (Encounter.issue) or a breather.
 */
export const CORE_CARDS: Record<'passport' | 'customs' | 'interview', readonly [string, string]> = {
  // A level can ask its own (Level.core): Departure opens each desk from your file.
  passport: ['p_purpose', 'p_host'],
  customs: ['c_medicine', 'c_cash'],
  interview: ['i_family', 'i_employer'],
};

export const ENCOUNTERS: Encounter[] = [
  // ── Passport control: identity and purpose (the clerk wants complete paperwork)
  {
    id: 'p_purpose', checkpoint: 'passport', kind: 'routine', opening: true, topic: 'purpose',
    approaches: [
      {
        id: 'evidence', kind: 'evidence', topic: 'purpose',
        // Today's bulletin tells the clerk to phone customs with the address on
        // accommodation checks. A medical note always goes on to customs with the
        // prescription details (EvidenceCard.forwards), so customs uses them.
        effects: [
          { send: 'call', facts: ['familyAddress'], when: { bulletin: 'accommodation' } },
          { send: 'call', facts: ['fatherCondition'] },
        ],
      },
      { id: 'family', kind: 'verify', effects: [{ claim: 'familyVisit' }, { time: -1 }] },
      { id: 'shortTrip', kind: 'say', effects: [{ claim: 'shortTrip' }] },
    ],
  },
  {
    // Where you will stay: the clerk puts it on the entry form with your reason.
    id: 'p_host', checkpoint: 'passport', kind: 'routine', topic: 'accommodation',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'accommodation', effects: [] },
      // Staying with her is what rules the hotel out, not visiting family.
      { id: 'mother', kind: 'contact', contacts: ['mother'], effects: [{ claim: 'familyVisit' }, { claim: 'stayingWithFamily' }, { fact: 'familyAddress' }] },
      // An evasion is free unless something on file makes it odd: her address is right there.
      // A short trip with no decided place to stay has no booking to show.
      // On a day hosts are phoned, having no host to name is itself flagged.
      {
        id: 'undecided', kind: 'say', reacts: 'suspicion', requires: { noFacts: ['familyAddress'] },
        effects: [
          { fact: 'noBooking', when: { claims: ['shortTrip'] } },
          { fact: 'noBooking', when: { bulletin: 'accommodation' } },
          { scrutiny: 1, reason: 'noBooking', when: { bulletin: 'accommodation' } },
        ],
      },
      {
        id: 'undecidedOnFile', kind: 'say', reacts: 'suspicion', requires: { facts: ['familyAddress'] },
        effects: [{ scrutiny: 1, reason: 'familyAddress' }, { fact: 'noBooking', when: { claims: ['shortTrip'] } }],
      },
    ],
  },
  {
    // A deed proves who owns a flat, not whose face is in the photo. What it gives
    // is a registered address: the clerk looks it up and finds your old ID photo
    // on the entry. Or a face scan, or another photo ID. Asked on a records day,
    // once an address is on file: the clerk looks it up in the register.
    id: 'p_photo', checkpoint: 'passport', kind: 'related', priority: 2, topic: 'identity',
    when: { bulletin: 'records' },
    // The address on file is not matched to your face yet. A property deed shown
    // already did that, as the registered owner.
    issue: { facts: ['familyAddress'], not: { used: ['deed'] } },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'identity', effects: [] },
      { id: 'scan', kind: 'verify', effects: [{ time: -1 }, { time: -1, when: { bulletin: 'records' } }], check: 'recordsCheck' },
      // Another photo ID, confirmed with the office that issued it: an hour longer
      // than the scan, but no records check, so nothing new can come up.
      { id: 'questions', kind: 'verify', effects: [{ time: -2 }, { time: -1, when: { bulletin: 'records' } }] },
    ],
  },
  {
    // The clerk checks every date: how long you stay. A return ticket settles it.
    id: 'p_stay', checkpoint: 'passport', kind: 'related', priority: 1, topic: 'stay',
    // A reason for the trip is on the form with no date out. A return ticket or
    // the hotel booking closes it: both have a date out on them, so a booking
    // shown for where you stay has already answered how long.
    issue: {
      any: [{ claims: ['familyVisit'] }, { claims: ['shortTrip'] }, { claims: ['stayingWithFamily'] }, { claims: ['hotelStay'] }],
      not: { any: [{ used: ['returnTicket'] }, { used: ['hotel'] }] },
    },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'stay', effects: [] },
      // The honest answer gives the reason, and your father's condition goes on file. She
      // phones the hospital to confirm it, unless his condition is already on her file.
      {
        id: 'father', kind: 'verify',
        effects: [{ claim: 'familyVisit' }, { fact: 'fatherCondition' }, { time: -2, when: { noFacts: ['fatherCondition'] } }],
      },
      // No date to give: she enters an open stay and checks your residence registration.
      // The answer is yours, so the file you carry out quotes it (CarriedFile.said).
      { id: 'unsure', kind: 'verify', effects: [{ claim: 'stayUndecided' }, { time: -1 }] },
    ],
  },
  {
    // At the photo's priority and listed after it: on a records day the clerk first matches
    // your face to an address on file (p_photo), which a deed answers, then asks about the passports.
    id: 'p_secondPassport', checkpoint: 'passport', kind: 'related', priority: 2, topic: 'identity',
    // Only on a records day, when the clerk reads the old exit records closely.
    // Dealt every day, it made Mark's longest runs go over 8 minutes (rwf.15).
    when: { background: 'secondPassport', bulletin: 'records' },
    // The exit record shows which passport he left on (Character.onFile).
    issue: { facts: ['secondPassport'] },
    // No document answers it: a deed shows who owns a flat, not how many passports you hold.
    approaches: [
      // Honest, and the second passport goes on file: that entry is the reason for the scrutiny.
      { id: 'both', kind: 'say', reacts: 'suspicion', effects: [{ fact: 'secondPassport' }, { scrutiny: 1, reason: 'secondPassport' }] },
      // With who you are already confirmed at this desk (the deed shown for where you stay), she
      // only notes the second passport: no records scan, so nothing new comes up.
      { id: 'handOver', kind: 'verify', effects: [{ time: -1 }, { time: -1, when: { bulletin: 'records' } }], check: 'recordsCheck', ifVerified: [{ time: -1 }] },
    ],
  },
  {
    // The funeral's stay question, the clerk's follow-up there in the place of
    // p_stay and p_employer (Level.cards). Only a records-day photo (p_photo, listed
    // first at the same priority) or a second passport comes before it. Your friend's
    // sister has already told the border how long you stay (STATEMENTS), and the
    // known-facts line says so. Neither answer costs anything here: the price is the
    // contradiction, if your answer disagrees with hers.
    id: 'p_days', checkpoint: 'passport', kind: 'related', priority: 2, topic: 'stay',
    // Open while her statement is on file, which is the whole of The funeral.
    issue: { any: [{ facts: ['sisterSaysDays'] }, { facts: ['sisterSaysWeeks'] }] },
    approaches: [
      { id: 'days', kind: 'say', effects: [{ claim: 'stayDays' }] },
      { id: 'weeks', kind: 'say', effects: [{ claim: 'stayWeeks' }] },
    ],
  },
  {
    id: 'p_employer', checkpoint: 'passport', kind: 'related', priority: 2, topic: 'work',
    // A short trip home on a foreign salary: the clerk wants to know who pays.
    // No perk here: the clerk wants paper or the register, not an explanation,
    // so Lena's plain answer is kept for the interview (i_employer).
    when: { background: 'foreignEmployer', claims: ['shortTrip'] },
    issue: { claims: ['shortTrip'] },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'work', effects: [] },
      // The register confirms who pays you. That is a fact; what the clerk reads into a
      // foreign salary stays her suspicion (Officer.readings), never a fact on file.
      // What the register confirmed stays verified, so the interview reads that entry.
      { id: 'check', kind: 'verify', effects: [{ time: -1 }, { fact: 'employer' }], confirms: true },
    ],
  },

  // ── Customs: possessions and documents (the inspector looks at objects)
  {
    id: 'c_medicine', checkpoint: 'customs', kind: 'routine', topic: 'medicine',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'medicine', effects: [] },
      // With the prescription verified earlier, he uses the details on file: no lab, no wait.
      { id: 'declare', kind: 'verify', effects: [{ time: -1 }, { time: -1, when: { bulletin: 'customs' } }], check: 'medicineLab', ifVerified: [] },
    ],
  },
  {
    // How much you carry and where it is from. The count shows how much, the employer
    // letter where it is from (a salary). The amount is over the limit, and the customs
    // queue says so first (msg.1.cash).
    id: 'c_cash', checkpoint: 'customs', kind: 'routine', topic: 'money',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'money', effects: [] },
      // The count puts the real total on file. Saying it is under the limit is
      // free until someone counts it (the bag search), then it is a disproof.
      // On a customs day the cash is counted anyway, and the total goes with your file.
      { id: 'count', kind: 'verify', effects: [{ time: -1 }, { fact: 'cashCount' }] },
      {
        id: 'under', kind: 'say',
        effects: [
          { claim: 'cashUnderLimit' },
          { fact: 'cashCount', when: { bulletin: 'customs' } },
          { send: 'printout', facts: ['cashCount'], when: { bulletin: 'customs' } },
        ],
      },
    ],
  },
  {
    // Calm: a helpful inspector. One answer, and it costs nothing.
    id: 'c_pen', checkpoint: 'customs', kind: 'routine', calm: true,
    approaches: [{ id: 'yes', kind: 'say', effects: [] }],
  },
  {
    // The bag shows it: a short trip home, with a pensioner's prescription.
    id: 'c_shortTrip', checkpoint: 'customs', kind: 'related', priority: 3, topic: 'purpose',
    when: { claims: ['shortTrip'] },
    issue: { claims: ['shortTrip'] },
    approaches: [
      // Changing the purpose means re-entering it, which takes an hour, and the new form has her address.
      // Every answer here puts the family on file at customs, so a spot-check of "short trip" finds it.
      { id: 'admit', kind: 'say', effects: [{ claim: 'familyVisit' }, { fact: 'familyAddress' }, { time: -1 }] },
      { id: 'evidence', kind: 'evidence', topic: 'purpose', effects: [] },
      // She confirms the visit and names the rest of the family, which goes with your file.
      {
        id: 'mother', kind: 'contact', contacts: ['mother'],
        effects: [{ claim: 'familyVisit' }, { fact: 'familyAddress' }, { fact: 'relativeNamed' }, { send: 'printout', facts: ['familyAddress', 'relativeNamed'] }],
      },
    ],
  },
  {
    id: 'c_host', checkpoint: 'customs', kind: 'related', priority: 2, topic: 'accommodation',
    // An address on file, or a day when every host is phoned.
    when: { any: [{ facts: ['familyAddress'] }, { bulletin: 'accommodation' }] },
    // Where you stay is on the file: her address, or what you told the clerk.
    issue: { any: [{ facts: ['familyAddress'] }, { claims: ['stayingWithFamily'] }, { claims: ['hotelStay'] }] },
    approaches: [
      // With the address verified earlier, he reads it off the file: no call, no wait.
      { id: 'call', kind: 'verify', effects: [{ time: -1 }], check: 'hostCall', ifVerified: [] },
      { id: 'evidence', kind: 'evidence', topic: 'accommodation', effects: [] },
      { id: 'mother', kind: 'contact', contacts: ['mother'], effects: [] },
    ],
  },
  {
    id: 'c_phone', checkpoint: 'customs', kind: 'related', priority: 1, topic: 'history',
    when: { any: [{ background: 'protestPhoto' }, { background: 'donation' }] },
    // Something on your file is flagged, or a salary from abroad is on file here,
    // so the inspector wants the phone to see where the money goes.
    issue: { any: [{ flagged: true }, { facts: ['employer'] }] },
    approaches: [
      {
        id: 'unlock', kind: 'verify', check: 'phoneSearch',
        effects: [
          { time: -1 },
          { fact: 'phoneSearched' },
          { fact: 'brotherAbroad', when: { background: 'brotherAtWar' } },
          { fact: 'donationRecord', when: { background: 'donation' } },
          // The bank's notice for the donation, and a relative synced in the contacts.
          { fact: 'bankNotice', when: { background: 'donation' } },
          { fact: 'relativeContact' },
        ],
      },
      { id: 'refuse', kind: 'say', reacts: 'suspicion', effects: [{ fact: 'phoneRefused' }, { scrutiny: 1, reason: 'phoneRefused' }, { time: -1 }] },
    ],
  },

  // ── Security interview: history and relationships (the officer asks about people)
  {
    id: 'i_family', checkpoint: 'interview', kind: 'routine', topic: 'history',
    asks: RELATIVE_FACTS,
    approaches: [
      // Each answer says what it is: name the relative, deny them, or ask why.
      // Only the denial records noOtherFamily, because leaving someone out is not a lie.
      {
        id: 'name', kind: 'contact', contacts: ['cousin', 'brother'], namesOnly: true,
        // Mark's answer says Tom lives across the border, not why he came back: no familyVisit.
        effects: [{ claim: 'familyVisit', when: { not: { character: 'mark' } } }, NAMED_TOM],
      },
      // The day decides whether a denial holds: the old register lists relatives on a
      // records day, which disproves it, and your mother is phoned on a hosts day, whose
      // account only conflicts with yours (TESTIMONY).
      {
        id: 'deny', kind: 'say',
        effects: [
          // Lena denies relatives here, Mark family across the border (claim.noFamilyAbroad).
          { claim: 'noOtherFamily', when: { not: { character: 'mark' } } },
          { claim: 'noFamilyAbroad', when: { character: 'mark' } },
          // The register lists Lena's cousin here, and Mark's brother gone across the border.
          { fact: 'relativeContact', when: { bulletin: 'records', not: { character: 'mark' } } },
          { fact: 'brotherAbroad', when: { bulletin: 'records', character: 'mark' } },
          { fact: 'relativeNamed', when: { bulletin: 'accommodation' } },
        ],
      },
      { id: 'why', kind: 'verify', effects: [{ time: -1 }] },
    ],
  },
  {
    // Calm: the officer gives you a minute. One answer, and it costs nothing.
    id: 'i_water', checkpoint: 'interview', kind: 'routine', calm: true,
    approaches: [{ id: 'drink', kind: 'say', effects: [] }],
  },
  {
    // Calm: the officer's phone interrupts. After an inspection it comes before the water (restCard()).
    id: 'i_phone', checkpoint: 'interview', kind: 'routine', calm: true,
    approaches: [{ id: 'wait', kind: 'say', effects: [] }],
  },
  {
    // Inconsistency: something on file makes a claim look odd. Cheaper than a
    // disproof, never free: the new story is checked (time), a document settles
    // it, or it stays unexplained (scrutiny).
    id: 'i_clarify', checkpoint: 'interview', kind: 'related', priority: 3, topic: 'purpose',
    when: anyPair(INCONSISTENCIES),
    issue: anyPair(INCONSISTENCIES),
    approaches: [
      { id: 'clarify', kind: 'say', effects: [{ claim: CLARIFIED_BY }, { time: -1 }] },
      { id: 'evidence', kind: 'evidence', topic: 'purpose', effects: [] },
      { id: 'accept', kind: 'say', effects: firstCaught(INCONSISTENCIES, 1) },
    ],
  },
  {
    // Disproof: something on file says the opposite of a claim. Expensive.
    id: 'i_contradiction', checkpoint: 'interview', kind: 'related', priority: 4, topic: 'history',
    when: anyPair(CONTRADICTIONS),
    issue: anyPair(CONTRADICTIONS),
    approaches: [
      { id: 'apologise', kind: 'say', effects: apologyFor(CONTRADICTIONS) },
      { id: 'review', kind: 'verify', effects: [{ time: -3 }] },
    ],
  },
  {
    // Where you have been: the years abroad, and who pays you there. A core card,
    // so both travelers are asked. Lena's plain answer settles it for free; the
    // employer letter answers it too, and puts the employer on file.
    id: 'i_employer', checkpoint: 'interview', kind: 'routine', topic: 'work',
    // It asks about an employer registered abroad, so only a traveler with one is asked (Mark is not).
    // Nobody with an employer abroad has Tom, so the card no longer offers him.
    when: { background: 'foreignEmployer' },
    asks: ['employer'],
    approaches: [
      { id: 'perk', kind: 'perk', effects: [] },
      { id: 'evidence', kind: 'evidence', topic: 'work', effects: [] },
      // The contract confirms the employer, and only that (Officer.readings).
      // With who pays you verified earlier, the officer reads that entry instead.
      { id: 'contract', kind: 'verify', effects: [{ time: -1 }, { fact: 'employer' }], ifVerified: [] },
    ],
  },
  {
    id: 'i_brother', checkpoint: 'interview', kind: 'related', priority: 2, topic: 'history',
    when: { facts: ['brotherAbroad'] },
    issue: { facts: ['brotherAbroad'] },
    asks: ['brotherAbroad'],
    approaches: [
      { id: 'honest', kind: 'say', reacts: 'suspicion', effects: [{ fact: 'brotherAbroad' }, { scrutiny: 1, reason: 'brotherAbroad' }] },
      { id: 'calls', kind: 'verify', effects: [{ time: -2 }, { fact: 'brotherAbroad' }] },
    ],
  },

  // ── Follow-ups: dealt only by a check result
  {
    id: 'f_host', checkpoint: 'followup', kind: 'followup', topic: 'accommodation',
    // Nobody has confirmed where you stay yet.
    issue: { noFacts: ['hostStatement'] },
    approaches: [
      // "The phone rings and rings. Then she picks up."
      { id: 'again', kind: 'verify', phonesMother: true, effects: [{ time: -1 }] },
      { id: 'evidence', kind: 'evidence', topic: 'accommodation', effects: [] },
      { id: 'cousin', kind: 'contact', contacts: ['cousin'], effects: [] },
    ],
  },
  {
    id: 'f_lab', checkpoint: 'followup', kind: 'followup', topic: 'medicine',
    // The prescription has not been verified: nothing on file says who it is for.
    issue: { noFacts: ['fatherCondition'] },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'medicine', effects: [] },
      { id: 'wait', kind: 'verify', effects: [{ time: -2 }] },
      { id: 'surrender', kind: 'say', effects: [{ loseMedicine: true }] },
    ],
  },
  {
    id: 'f_donation', checkpoint: 'followup', kind: 'followup', topic: 'history',
    issue: { facts: ['donationRecord'] },
    approaches: [
      { id: 'explain', kind: 'say', reacts: 'suspicion', effects: [{ fact: 'donationRecord' }, { scrutiny: 1, reason: 'donationRecord' }] },
      // The record is on the desk, so denying it is a disproof.
      { id: 'deny', kind: 'say', reacts: 'disproof', effects: [{ claim: 'neverDonated' }, { scrutiny: 2, reason: 'donationRecord' }] },
      { id: 'lawyer', kind: 'verify', effects: [{ time: -3 }] },
    ],
  },
  {
    id: 'f_photo', checkpoint: 'followup', kind: 'followup', topic: 'history',
    issue: { facts: ['phoneSearched'] },
    approaches: [
      // The photo came from the phone search, which is the only thing that deals this card.
      // A face in a photo raises the question but is not a record, so even a denial is a suspicion.
      { id: 'honest', kind: 'say', reacts: 'suspicion', effects: [{ scrutiny: 1, reason: 'phoneSearch' }] },
      { id: 'deny', kind: 'say', reacts: 'suspicion', effects: [{ scrutiny: 2, reason: 'phoneSearch' }] },
      { id: 'law', kind: 'verify', effects: [{ time: -2 }] },
    ],
  },

  // ── Departure (rwf.3): the desks open with your file from the crossing before
  // (RunState.file). Each card asks one of Arrival's core questions again, with what
  // you said then quoted above it (fileLine() in src/game/consequence.ts). Saying
  // something else now is held against you with the entry record as the reason, an
  // interpretation of the record, never proof.
  {
    // Why you came: the first card at the first desk names the claim your file holds.
    id: 'd_entry', checkpoint: 'passport', kind: 'routine', opening: true, topic: 'purpose',
    approaches: [
      {
        id: 'evidence', kind: 'evidence', topic: 'purpose',
        effects: [
          { send: 'call', facts: ['familyAddress'], when: { bulletin: 'accommodation' } },
          { send: 'call', facts: ['fatherCondition'] },
        ],
      },
      // The register check is only needed when the file does not already say it.
      {
        id: 'family', kind: 'verify', reacts: 'suspicion',
        effects: [
          { claim: 'familyVisit' },
          { time: -1, when: { not: { fileSaid: ['familyVisit'] } } },
          { scrutiny: 1, reason: 'entryRecord', when: { facts: ['entryRecord'], fileSaid: ['shortTrip'] } },
        ],
      },
      {
        id: 'shortTrip', kind: 'say', reacts: 'suspicion',
        effects: [{ claim: 'shortTrip' }, { scrutiny: 1, reason: 'entryRecord', when: { facts: ['entryRecord'], fileSaid: ['familyVisit'] } }],
      },
    ],
  },
  {
    // Where you stayed, against where your entry form said you would. Departure's
    // second card at the passport desk, in the place of "Who will you stay with?"
    // (p_host), which only makes sense on the way in. The file line quotes the
    // entry form's answer (fileLine()). A place that differs from it is no proof of
    // anything, so the clerk checks it against the entry record: an hour, not a mark.
    id: 'd_stayed', checkpoint: 'passport', kind: 'routine', topic: 'accommodation',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'accommodation', effects: [] },
      // The truth names her: her address goes on file. It differs from a hotel on the entry form.
      {
        id: 'mother', kind: 'contact', contacts: ['mother'],
        effects: [{ claim: 'stayingWithFamily' }, { fact: 'familyAddress' }, { time: -1, when: { fileClaims: ['hotelStay'] } }],
      },
      // Keeping her address out of it. Free when the entry form names no place, else
      // the place it names differs from "with friends".
      { id: 'friends', kind: 'say', effects: [{ time: -1, when: { fileClaims: ['stayingWithFamily', 'hotelStay'] } }] },
    ],
  },
  {
    // The return date against the file (questionKey()): five days on a return ticket,
    // three nights on a hotel booking, no date at all, or the stand-in form of a
    // standalone run. You leave after twelve days. A longer stay is asked about,
    // never proof of a lie: no answer here ends the run.
    id: 'd_stay', checkpoint: 'passport', kind: 'related', priority: 1, topic: 'stay',
    issue: { any: [{ claims: ['familyVisit'] }, { claims: ['shortTrip'] }, { claims: ['stayingWithFamily'] }, { claims: ['hotelStay'] }] },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'stay', effects: [] },
      // Explaining the changed plans says more about your family: his condition goes on file.
      {
        id: 'father', kind: 'verify',
        effects: [{ claim: 'familyVisit' }, { fact: 'fatherCondition' }, { time: -1, when: { noFacts: ['fatherCondition'] } }],
      },
      // Letting the difference stand is no proof of anything, so she checks it herself: the longer wait.
      { id: 'stand', kind: 'verify', effects: [{ time: -2 }] },
    ],
  },
  {
    // A claim your last crossing showed false is on the entry record, so the exit desk
    // can hold your passport for a review. Never dealt from a file with no disproved claim.
    id: 'd_hold', checkpoint: 'passport', kind: 'related', priority: 5, topic: 'history',
    when: { facts: ['entryRecord'], fileDisproved: true },
    issue: { fileDisproved: true },
    approaches: [
      { id: 'review', kind: 'verify', effects: [{ time: -3 }] },
      { id: 'sign', kind: 'say', reacts: 'suspicion', effects: [{ scrutiny: 1, reason: 'entryRecord' }, { time: -1 }] },
      // Leaving without it ends the crossing: turned back, free to go for now (endingText()).
      { id: 'leave', kind: 'withdraw', effects: [] },
    ],
  },
  {
    // What you take out: Departure's customs opener, in the place of the medicine
    // card (c_medicine), which asks what you bring in. You take his empty medicine
    // box, so a pharmacy abroad can match it. A medical note answers it (and
    // verifies the point, as c_medicine did). Opening the bag settles it in an hour.
    // Saying what is in it is free, except on a day medicines need paperwork, when
    // he goes through the bag anyway and it takes longer.
    id: 'd_out', checkpoint: 'customs', kind: 'routine', topic: 'medicine', noCallIns: true,
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'medicine', effects: [] },
      { id: 'open', kind: 'verify', effects: [{ time: -1 }] },
      { id: 'say', kind: 'say', effects: [{ time: -2, when: { bulletin: 'customs' } }] },
    ],
  },
  {
    // Cash going out: the officer has what customs kept of your declaration on the way in.
    // Asked the amount, as on the way in (c_cash): a salary line is not a total, so no document answers it.
    id: 'd_declared', checkpoint: 'customs', kind: 'routine', topic: 'money',
    approaches: [
      // With "under the limit" on the entry record, the count is compared with it: 14,000
      // against a word, read as a question about the entry record, never proof of a lie.
      {
        id: 'count', kind: 'verify', reacts: 'suspicion',
        effects: [{ time: -1 }, { fact: 'cashCount' }, { scrutiny: 1, reason: 'entryRecord', when: { facts: ['entryRecord'], fileDeclared: ['under'] } }],
      },
      {
        id: 'under', kind: 'say',
        effects: [
          { claim: 'cashUnderLimit' },
          { fact: 'cashCount', when: { bulletin: 'customs' } },
          { send: 'printout', facts: ['cashCount'], when: { bulletin: 'customs' } },
          // The total counted on the way in is on the record, and "under the limit" is not a total,
          // so she counts it again: the wait, not a mark against you.
          { time: -1, when: { fileDeclared: ['counted'] } },
        ],
      },
    ],
  },
  {
    // Who you know: with a contact named on your file, the officer asks about them first.
    id: 'd_named', checkpoint: 'interview', kind: 'routine', topic: 'history',
    asks: RELATIVE_FACTS,
    approaches: [
      {
        id: 'name', kind: 'contact', contacts: ['cousin', 'brother'], namesOnly: true,
        // Mark's answer says Tom lives across the border, not why he came back: no familyVisit.
        effects: [{ claim: 'familyVisit', when: { not: { character: 'mark' } } }, NAMED_TOM],
      },
      {
        id: 'deny', kind: 'say',
        effects: [
          // Lena denies relatives here, Mark family across the border (claim.noFamilyAbroad).
          { claim: 'noOtherFamily', when: { not: { character: 'mark' } } },
          { claim: 'noFamilyAbroad', when: { character: 'mark' } },
          // The register lists Lena's cousin here, and Mark's brother gone across the border.
          { fact: 'relativeContact', when: { bulletin: 'records', not: { character: 'mark' } } },
          { fact: 'brotherAbroad', when: { bulletin: 'records', character: 'mark' } },
          { fact: 'relativeNamed', when: { bulletin: 'accommodation' } },
        ],
      },
      { id: 'why', kind: 'verify', effects: [{ time: -1 }] },
    ],
  },
];

/** What the phone search found, printed for the next desk. */
const PHONE_REPORT: Effect = { send: 'printout', facts: ['phoneSearched', 'brotherAbroad', 'donationRecord', 'bankNotice', 'relativeContact'] };

/** Results are fixed when the check starts; the waiting room only reveals them. */
export const CHECKS: Record<CheckId, Check> = {
  // Your host can be vouched for: whoever can confirm the address.
  hostCall: {
    id: 'hostCall', topic: 'accommodation', beats: 1,
    cases: [
      // The call note goes with your file to the interview, address and all.
      { when: { bulletin: 'accommodation' }, followUp: 'f_host', result: 'noAnswer', effects: [{ send: 'printout', facts: ['familyAddress'] }] },
      // When she answers, her account goes with it: you stay with her, and who else is family here.
      {
        result: 'clear',
        effects: [
          { fact: 'hostStatement' },
          { fact: 'relativeNamed' },
          { send: 'printout', facts: ['familyAddress', 'hostStatement', 'relativeNamed'] },
        ],
      },
    ],
  },
  medicineLab: {
    id: 'medicineLab', beats: 1,
    cases: [
      { when: { bulletin: 'customs', noFacts: ['fatherCondition'] }, followUp: 'f_lab', result: 'lab' },
      { result: 'clear' },
    ],
  },
  // Data: nobody can vouch away what is on the phone or in the records.
  // The search report prints and goes with you to the interview.
  // In stages (Check.explain): the phone goes behind the partition, an observation
  // points somewhere, then you answer. Background and bulletin fix the result: on a
  // records day the fund is listed, so the officer asks about that payment; on a
  // customs day a salary from abroad is read as a transfer, which takes an hour to explain.
  phoneSearch: {
    id: 'phoneSearch', beats: 1,
    explain: [{ fact: 'donationRecord', when: { background: 'donation' } }, { scrutiny: 1, reason: 'phoneSearch' }],
    cases: [
      { when: { background: 'protestPhoto' }, followUp: 'f_photo', result: 'photo', effects: [PHONE_REPORT] },
      { when: { background: 'donation', bulletin: 'records' }, followUp: 'f_donation', result: 'donation', effects: [PHONE_REPORT] },
      { when: { background: 'foreignEmployer', bulletin: 'customs' }, result: 'misread', effects: [PHONE_REPORT, { time: -1 }] },
      { result: 'clear', effects: [PHONE_REPORT] },
    ],
  },
  recordsCheck: {
    id: 'recordsCheck', beats: 1,
    cases: [
      { when: { bulletin: 'records', background: 'donation' }, followUp: 'f_donation', result: 'flagged', effects: [{ fact: 'donationRecord' }] },
      { when: { bulletin: 'records', background: 'brotherAtWar' }, result: 'noted', effects: [{ fact: 'brotherAbroad' }] },
      { result: 'clear' },
    ],
  },
};

/**
 * Drawn when scrutiny reaches 3. Each one asks you to pay with something:
 * time, belongings (the medicine or a document), a disclosure, or a person.
 * Every one shows two answers that cost different things, and never more than
 * three answers on screen. The third, "Ask to return", is there only where the
 * situation allows it: the medicine is held, so leaving with it is a real
 * request, or the supervisor has not decided yet. A bag search runs to the end,
 * and once the shuttle has gone there is no way back to ask for. Turning back
 * before any desk decides is the passport queue's (canTurnBack() in
 * src/game/engine.ts). Where a card has more
 * than two ways to pay, the conditions pick which two you see. Apart from the
 * bag search, each changes the problem instead of only costing hours
 * (InspectionKind, checked in checkState). With LAST_HOURS left or fewer any
 * wait misses the bus, so the waits are not offered and the card asks for one
 * sacrifice instead. A card is only dealt when its `when` holds, which keeps a
 * second answer there (noFreeExits() in src/game/walk.ts), and while the open
 * issue it is about (Inspection.issue) is still open.
 *
 * The order is the supervisor's (inspect() in src/game/engine.ts): the issue
 * the bulletin warned about first, then why you came back, the medicine, and
 * the missed shuttle last. Nothing is drawn, so the same file always gets the
 * same inspection.
 */
export const INSPECTIONS: Inspection[] = [
  {
    // Extra verification: the supervisor checks why you travel. Spend the document
    // that backs it (or, without one, have your mother confirm it), or let her
    // phone the hospital: the call takes time and your father's condition goes on
    // file. Only dealt while that call would tell this desk something new, and
    // while there is a paper or your mother for the second answer.
    id: 's_supervisor', kind: 'verification', issue: 'purpose', topic: 'purpose',
    when: { noFacts: ['fatherCondition'], any: [{ holds: 'purpose' }, { contactFree: ['mother'] }] },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'purpose', requires: { holds: 'purpose' }, effects: [] },
      { id: 'contact', kind: 'contact', contacts: ['mother'], requires: { not: { holds: 'purpose' }, contactFree: ['mother'] }, effects: [{ time: -1, when: { lastHours: false } }] },
      { id: 'accept', kind: 'say', effects: [{ fact: 'fatherCondition' }, { time: -1, when: { lastHours: false } }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    // Confiscation: the medicine is held. Get it back now, or leave without it.
    // Only dealt while you still carry it (inspect() in src/game/engine.ts), and
    // only on the day the bulletin sends medicines to the lab: any other day the
    // open prescription gets the bag search instead.
    id: 's_medicine', kind: 'confiscation', issue: 'medicine', when: { bulletin: 'customs' },
    approaches: [
      { id: 'surrender', kind: 'say', effects: [{ loseMedicine: true }] },
      // The lab looks at it and hands it back, so the prescription is verified (Approach.confirms).
      { id: 'wait', kind: 'verify', requires: { lastHours: false }, effects: [{ time: -3 }], confirms: true },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    // The prescription is in the bag, and your mother can confirm it. With her
    // out of reach, you lay it all out yourself instead.
    id: 's_bag', kind: 'search', issue: 'medicine', topic: 'medicine',
    when: { any: [{ contactFree: ['mother'] }, { noFacts: ['cashCount'] }, { noFacts: ['fatherCondition'] }] },
    approaches: [
      // A full search counts the cash, so the total goes on file.
      // The search report, cash total included, goes with you to the next desk.
      // They find the prescription with the medicine, so it is verified (Approach.confirms).
      {
        id: 'wait', kind: 'verify', requires: { lastHours: false }, confirms: true,
        effects: [{ time: -3 }, { fact: 'cashCount' }, { send: 'printout', facts: ['cashCount'] }],
      },
      { id: 'contact', kind: 'contact', contacts: ['mother'], requires: { contactFree: ['mother'] }, effects: [{ time: -1, when: { lastHours: false } }] },
      // The cash total and who the prescription is for go on file, and the search stops.
      {
        id: 'declare', kind: 'say',
        requires: { not: { contactFree: ['mother'] }, any: [{ noFacts: ['cashCount'] }, { noFacts: ['fatherCondition'] }] },
        effects: [{ fact: 'cashCount' }, { fact: 'fatherCondition' }, { send: 'printout', facts: ['cashCount', 'fatherCondition'] }],
      },
    ],
  },
  {
    // Missed connection: the shuttle to the station has gone. The next one makes
    // the trip an hour longer, so the run needs an hour more left. Or another
    // way out: a paper with where you stay books the border transfer, and they
    // keep it; else someone drives out for you, which puts them on file; else
    // the transfer takes you and they write down where it drops you. Driving is
    // not confirming anything, so anyone close enough will do (namesOnly).
    id: 's_connection', kind: 'connection', issue: 'accommodation',
    when: { any: [{ holds: 'accommodation' }, { contactFree: ['mother', 'cousin'] }, { noFacts: ['familyAddress'] }] },
    approaches: [
      // The supervisor rings ahead to say you will be late, which confirms where you stay (Approach.confirms).
      { id: 'later', kind: 'say', requires: { lastHours: false }, effects: [{ travel: 1 }], confirms: true },
      { id: 'evidence', kind: 'evidence', topic: 'accommodation', requires: { holds: 'accommodation' }, effects: [] },
      {
        id: 'drive', kind: 'contact', contacts: ['mother', 'cousin'], namesOnly: true,
        requires: { not: { holds: 'accommodation' }, contactFree: ['mother', 'cousin'] }, effects: [],
      },
      {
        id: 'transfer', kind: 'say',
        requires: { not: { any: [{ holds: 'accommodation' }, { contactFree: ['mother', 'cousin'] }] }, noFacts: ['familyAddress'] },
        effects: [{ fact: 'familyAddress' }],
      },
    ],
  },
];

export const ENCOUNTER_BY_ID = new Map(ENCOUNTERS.map((e) => [e.id, e]));
export const INSPECTION_BY_ID = new Map(INSPECTIONS.map((i) => [i.id, i]));
