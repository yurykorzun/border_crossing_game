// The encounter decks. Each checkpoint deals one routine card, then the
// highest-priority related card that fits (see engine.ts deal()).
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
  // A short trip home with nowhere booked (i_stay).
  ['shortTrip', 'noBooking'],
  // A hotel booking, and the family address on file.
  ['hotelStay', 'familyAddress'],
];
/** What the clarify answer says. Once you have said it, a spot-check finds an inconsistency explained (spotCheckOf()). */
export const CLARIFIED_BY: ClaimId = 'familyVisit';
/** In this order, which also picks the one an apology is charged for (firstCaught). */
export const CONTRADICTIONS: readonly [ClaimId, FactId][] = [
  ['noOtherFamily', 'brotherAbroad'],
  ['cashUnderLimit', 'cashCount'],
  // The host call: your mother says you stay with her.
  ['hotelStay', 'hostStatement'],
  // The phone search: a bank notice for the donation.
  ['neverDonated', 'bankNotice'],
  // A relative synced on the phone, or listed in the old family register.
  ['noOtherFamily', 'relativeContact'],
  // Your mother names another relative, on the host call or when customs phones her.
  ['noOtherFamily', 'relativeNamed'],
];

/**
 * Facts that are someone's account, not a record: what your mother told an
 * officer on the phone. A claim they speak against is conflicting testimony,
 * which you can explain, never a proven lie.
 */
export const TESTIMONY: readonly FactId[] = ['hostStatement', 'relativeNamed'];

/**
 * The cards that challenge a claim, most expensive first. One that applies is
 * always dealt before its checkpoint ends, so a lie disproved by the last
 * answer still has to be answered.
 */
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

export const ENCOUNTERS: Encounter[] = [
  // ── Passport control: identity and purpose (the clerk wants complete paperwork)
  {
    id: 'p_purpose', checkpoint: 'passport', kind: 'routine', opening: true, topic: 'purpose',
    approaches: [
      {
        id: 'evidence', kind: 'evidence', topic: 'purpose',
        // Today's bulletin tells the clerk which desk to phone: addresses go to
        // customs on accommodation checks, medical notes on medicine checks.
        effects: [
          { send: 'call', facts: ['familyAddress'], when: { bulletin: 'accommodation' } },
          { send: 'call', facts: ['fatherCondition'], when: { bulletin: 'customs' } },
        ],
      },
      { id: 'family', kind: 'verify', effects: [{ claim: 'familyVisit' }, { time: -1 }] },
      { id: 'shortTrip', kind: 'say', effects: [{ claim: 'shortTrip' }] },
    ],
  },
  {
    // A deed proves who owns a flat, not whose face is in the photo. What it gives
    // is a registered address: the clerk looks it up and finds your old ID photo
    // on the entry. Or a face scan, or another photo ID.
    id: 'p_photo', checkpoint: 'passport', kind: 'routine', topic: 'identity',
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
    id: 'p_stay', checkpoint: 'passport', kind: 'routine', topic: 'stay',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'stay', effects: [] },
      // The honest answer gives the reason, and your father's condition goes on file. She
      // phones the hospital to confirm it, unless his condition is already on her file.
      {
        id: 'father', kind: 'verify',
        effects: [{ claim: 'familyVisit' }, { fact: 'fatherCondition' }, { time: -2, when: { noFacts: ['fatherCondition'] } }],
      },
      // No date to give: she enters an open stay and checks your residence registration.
      { id: 'unsure', kind: 'verify', effects: [{ time: -1 }] },
    ],
  },
  {
    id: 'p_secondPassport', checkpoint: 'passport', kind: 'related', priority: 1, topic: 'identity',
    when: { background: 'secondPassport' },
    approaches: [
      // Honest, and the second passport goes on file: that entry is the reason for the scrutiny.
      { id: 'both', kind: 'say', reacts: 'suspicion', effects: [{ fact: 'secondPassport' }, { scrutiny: 1, reason: 'secondPassport' }] },
      { id: 'evidence', kind: 'evidence', topic: 'identity', effects: [] },
      { id: 'handOver', kind: 'verify', effects: [{ time: -1 }, { time: -1, when: { bulletin: 'records' } }], check: 'recordsCheck' },
    ],
  },
  {
    id: 'p_employer', checkpoint: 'passport', kind: 'related', priority: 1, topic: 'work',
    // A short trip home on a foreign salary: the clerk wants to know who pays.
    // No perk here: the clerk wants paper or the register, not an explanation,
    // so Lena's plain answer is kept for the interview (i_employer).
    when: { background: 'foreignEmployer', claims: ['shortTrip'] },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'work', effects: [] },
      // The register confirms who pays you. That is a fact; what the clerk reads into a
      // foreign salary stays her suspicion (Officer.readings), never a fact on file.
      { id: 'check', kind: 'verify', effects: [{ time: -1 }, { fact: 'employer' }] },
    ],
  },

  // ── Customs: possessions and documents (the inspector looks at objects)
  {
    id: 'c_medicine', checkpoint: 'customs', kind: 'routine', topic: 'medicine',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'medicine', effects: [] },
      { id: 'declare', kind: 'verify', effects: [{ time: -1 }, { time: -1, when: { bulletin: 'customs' } }], check: 'medicineLab' },
    ],
  },
  {
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
    approaches: [
      { id: 'call', kind: 'verify', effects: [{ time: -1 }], check: 'hostCall' },
      { id: 'evidence', kind: 'evidence', topic: 'accommodation', effects: [] },
      { id: 'mother', kind: 'contact', contacts: ['mother'], effects: [] },
    ],
  },
  {
    id: 'c_phone', checkpoint: 'customs', kind: 'related', priority: 1, topic: 'history',
    when: { any: [{ background: 'protestPhoto' }, { background: 'donation' }] },
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
    id: 'i_stay', checkpoint: 'interview', kind: 'routine', topic: 'accommodation',
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
    id: 'i_family', checkpoint: 'interview', kind: 'routine', topic: 'history',
    approaches: [
      // Each answer says what it is: name the relative, deny them, or ask why.
      // Only the denial records noOtherFamily, because leaving someone out is not a lie.
      {
        id: 'name', kind: 'contact', contacts: ['cousin', 'brother'], namesOnly: true,
        effects: [{ claim: 'familyVisit' }, { fact: 'brotherAbroad', when: { background: 'brotherAtWar' } }],
      },
      // The day decides whether a denial holds: the old register lists relatives on a
      // records day, which disproves it, and your mother is phoned on a hosts day, whose
      // account only conflicts with yours (TESTIMONY).
      {
        id: 'deny', kind: 'say',
        effects: [
          { claim: 'noOtherFamily' },
          { fact: 'relativeContact', when: { bulletin: 'records' } },
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
    approaches: [
      { id: 'apologise', kind: 'say', effects: firstCaught(CONTRADICTIONS, 2) },
      { id: 'review', kind: 'verify', effects: [{ time: -3 }] },
    ],
  },
  {
    id: 'i_employer', checkpoint: 'interview', kind: 'related', priority: 2, topic: 'work',
    when: { any: [{ facts: ['employer'] }, { background: 'foreignEmployer' }] },
    // No paper answer: Mark's only work paper is the letter that put his employer
    // on file, and Lena's plain answer settles this for free.
    approaches: [
      { id: 'perk', kind: 'perk', effects: [] },
      // The contract confirms the employer, and only that (Officer.readings).
      { id: 'contract', kind: 'verify', effects: [{ time: -2 }, { fact: 'employer' }] },
      { id: 'brother', kind: 'contact', contacts: ['brother'], effects: [] },
    ],
  },
  {
    id: 'i_brother', checkpoint: 'interview', kind: 'related', priority: 2, topic: 'history',
    when: { facts: ['brotherAbroad'] },
    approaches: [
      { id: 'honest', kind: 'say', reacts: 'suspicion', effects: [{ fact: 'brotherAbroad' }, { scrutiny: 1, reason: 'brotherAbroad' }] },
      { id: 'calls', kind: 'verify', effects: [{ time: -2 }, { fact: 'brotherAbroad' }] },
    ],
  },

  // ── Follow-ups: dealt only by a check result
  {
    id: 'f_host', checkpoint: 'followup', kind: 'followup', topic: 'accommodation',
    approaches: [
      { id: 'again', kind: 'verify', effects: [{ time: -1 }] },
      { id: 'evidence', kind: 'evidence', topic: 'accommodation', effects: [] },
      { id: 'cousin', kind: 'contact', contacts: ['cousin'], effects: [] },
    ],
  },
  {
    id: 'f_lab', checkpoint: 'followup', kind: 'followup', topic: 'medicine',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'medicine', effects: [] },
      { id: 'wait', kind: 'verify', effects: [{ time: -2 }] },
      { id: 'surrender', kind: 'say', effects: [{ loseMedicine: true }] },
    ],
  },
  {
    id: 'f_donation', checkpoint: 'followup', kind: 'followup', topic: 'history',
    approaches: [
      { id: 'explain', kind: 'say', reacts: 'suspicion', effects: [{ fact: 'donationRecord' }, { scrutiny: 1, reason: 'donationRecord' }] },
      // The record is on the desk, so denying it is a disproof.
      { id: 'deny', kind: 'say', reacts: 'disproof', effects: [{ claim: 'neverDonated' }, { scrutiny: 2, reason: 'donationRecord' }] },
      { id: 'lawyer', kind: 'verify', effects: [{ time: -3 }] },
    ],
  },
  {
    id: 'f_photo', checkpoint: 'followup', kind: 'followup', topic: 'history',
    approaches: [
      // The photo came from the phone search, which is the only thing that deals this card.
      // A face in a photo raises the question but is not a record, so even a denial is a suspicion.
      { id: 'honest', kind: 'say', reacts: 'suspicion', effects: [{ scrutiny: 1, reason: 'phoneSearch' }] },
      { id: 'deny', kind: 'say', reacts: 'suspicion', effects: [{ scrutiny: 2, reason: 'phoneSearch' }] },
      { id: 'law', kind: 'verify', effects: [{ time: -2 }] },
    ],
  },
];

/** What the phone search found, printed for the next desk. */
const PHONE_REPORT: Effect = { send: 'printout', facts: ['phoneSearched', 'brotherAbroad', 'donationRecord', 'bankNotice', 'relativeContact'] };

/** Results are fixed when the check starts; the waiting room only reveals them. */
export const CHECKS: Record<CheckId, Check> = {
  // Your host can be vouched for: whoever can confirm the address.
  hostCall: {
    id: 'hostCall', topic: 'accommodation', beats: 3,
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
    id: 'medicineLab', beats: 2,
    cases: [
      { when: { bulletin: 'customs', noFacts: ['fatherCondition'] }, followUp: 'f_lab', result: 'lab' },
      { result: 'clear' },
    ],
  },
  // Data: nobody can vouch away what is on the phone or in the records.
  // The search report prints and goes with you to the interview.
  phoneSearch: {
    id: 'phoneSearch', beats: 3,
    cases: [
      { when: { background: 'protestPhoto' }, followUp: 'f_photo', result: 'photo', effects: [PHONE_REPORT] },
      { when: { background: 'donation' }, followUp: 'f_donation', result: 'donation', effects: [PHONE_REPORT] },
      { result: 'clear', effects: [PHONE_REPORT] },
    ],
  },
  recordsCheck: {
    id: 'recordsCheck', beats: 2,
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
 * second answer there (noFreeExits() in src/game/walk.ts).
 */
export const INSPECTIONS: Inspection[] = [
  {
    // The prescription is in the bag, and your mother can confirm it. With her
    // out of reach, you lay it all out yourself instead.
    id: 's_bag', kind: 'search', topic: 'medicine',
    when: { any: [{ contactFree: ['mother'] }, { noFacts: ['cashCount'] }, { noFacts: ['fatherCondition'] }] },
    approaches: [
      // A full search counts the cash, so the total goes on file.
      // The search report, cash total included, goes with you to the next desk.
      {
        id: 'wait', kind: 'verify', requires: { lastHours: false },
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
    // Confiscation: the medicine is held. Get it back now, or leave without it.
    // Only dealt while you still carry it (inspect() in src/game/engine.ts).
    id: 's_medicine', kind: 'confiscation',
    approaches: [
      { id: 'surrender', kind: 'say', effects: [{ loseMedicine: true }] },
      { id: 'wait', kind: 'verify', requires: { lastHours: false }, effects: [{ time: -3 }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    // Missed connection: the shuttle to the station has gone. The next one makes
    // the trip an hour longer, so the run needs an hour more left. Or another
    // way out: a paper with where you stay books the border transfer, and they
    // keep it; else someone drives out for you, which puts them on file; else
    // the transfer takes you and they write down where it drops you. Driving is
    // not confirming anything, so anyone close enough will do (namesOnly).
    id: 's_connection', kind: 'connection',
    when: { any: [{ holds: 'accommodation' }, { contactFree: ['mother', 'cousin'] }, { noFacts: ['familyAddress'] }] },
    approaches: [
      { id: 'later', kind: 'say', requires: { lastHours: false }, effects: [{ travel: 1 }] },
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
  {
    // Extra verification: the supervisor checks why you travel. Spend the document
    // that backs it (or, without one, have your mother confirm it), or let her
    // phone the hospital: the call takes time and your father's condition goes on
    // file. Only dealt while that call would tell this desk something new, and
    // while there is a paper or your mother for the second answer.
    id: 's_supervisor', kind: 'verification', topic: 'purpose',
    when: { noFacts: ['fatherCondition'], any: [{ holds: 'purpose' }, { contactFree: ['mother'] }] },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'purpose', requires: { holds: 'purpose' }, effects: [] },
      { id: 'contact', kind: 'contact', contacts: ['mother'], requires: { not: { holds: 'purpose' }, contactFree: ['mother'] }, effects: [{ time: -1, when: { lastHours: false } }] },
      { id: 'accept', kind: 'say', effects: [{ fact: 'fatherCondition' }, { time: -1, when: { lastHours: false } }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
];

export const ENCOUNTER_BY_ID = new Map(ENCOUNTERS.map((e) => [e.id, e]));
export const INSPECTION_BY_ID = new Map(INSPECTIONS.map((i) => [i.id, i]));
