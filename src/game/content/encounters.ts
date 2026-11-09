// The encounter decks. Each checkpoint deals one routine card, then the
// highest-priority related card that fits (see engine.ts deal()).
// Text lives in src/i18n/en.ts: enc.<id>.q, enc.<id>.<approach>.label/.reaction.
//
// Rule: every encounter has an approach that needs no card and no contact.
// Most answers cost something. A calm card (a quick stamp, a helpful
// inspector) costs nothing, so the escalation around it lands harder.
//
// Facts stay at the desk where they came out (docs/design.md "What each
// official knows"). They travel on only through a channel: the records
// bulletin, or a `send` effect here (a call between desks, a printout after a check).

import type { Check, CheckId, ClaimId, Cond, Effect, Encounter, FactId, Inspection } from '../types';

/**
 * Three tiers for a claim (docs/design.md "Truth, claims, official knowledge").
 * Unchallenged: nothing on file speaks against it, so it stands for free.
 * Inconsistency: a fact on file makes it look odd. Cheap to clarify (i_clarify).
 * Disproof: a fact on file says the opposite. Expensive (i_contradiction).
 */
export const INCONSISTENCIES: readonly [ClaimId, FactId][] = [
  ['tourism', 'familyAddress'],
  ['tourism', 'fatherCondition'],
];
export const DISPROOFS: readonly [ClaimId, FactId][] = [
  ['noOtherFamily', 'brotherAbroad'],
  ['cashUnderLimit', 'cashCount'],
];

/**
 * The cards that challenge a claim, most expensive first. One that applies is
 * always dealt before its checkpoint ends, so a lie disproved by the last
 * answer still has to be answered.
 */
export const CHALLENGES = ['i_contradiction', 'i_clarify'] as const;

const anyPair =(pairs: readonly [ClaimId, FactId][]): Cond => ({ any: pairs.map(([c, f]) => ({ claims: [c], facts: [f] })) });

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
      { id: 'tourism', kind: 'say', effects: [{ claim: 'tourism' }] },
    ],
  },
  {
    id: 'p_photo', checkpoint: 'passport', kind: 'routine', topic: 'identity',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'identity', effects: [] },
      { id: 'scan', kind: 'verify', effects: [{ time: -1 }], check: 'recordsCheck' },
    ],
  },
  {
    // Calm: a quick stamp. Nothing is asked, so there is one answer and it costs nothing.
    id: 'p_stamp', checkpoint: 'passport', kind: 'routine', calm: true,
    approaches: [{ id: 'thanks', kind: 'say', effects: [] }],
  },
  {
    id: 'p_secondPassport', checkpoint: 'passport', kind: 'related', priority: 1, topic: 'identity',
    when: { background: 'secondPassport' },
    approaches: [
      // Honest, and the second passport goes on file: that entry is the reason for the scrutiny.
      { id: 'both', kind: 'say', effects: [{ fact: 'secondPassport' }, { scrutiny: 1, reason: 'secondPassport' }] },
      { id: 'evidence', kind: 'evidence', topic: 'identity', effects: [] },
      { id: 'handOver', kind: 'verify', effects: [{ time: -1 }], check: 'recordsCheck' },
    ],
  },
  {
    id: 'p_employer', checkpoint: 'passport', kind: 'related', priority: 1, topic: 'work',
    // A tourist paid by a foreign company: the clerk wants to know who pays.
    when: { background: 'foreignEmployer', claims: ['tourism'] },
    approaches: [
      { id: 'perk', kind: 'perk', effects: [] },
      { id: 'evidence', kind: 'evidence', topic: 'work', effects: [] },
      { id: 'check', kind: 'verify', effects: [{ time: -1 }] },
    ],
  },

  // ── Customs: possessions and documents (the inspector looks at objects)
  {
    id: 'c_medicine', checkpoint: 'customs', kind: 'routine', topic: 'medicine',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'medicine', effects: [] },
      { id: 'declare', kind: 'verify', effects: [{ time: -1 }, { time: -1, when: { bulletin: 'customs' } }], check: 'medicineLab' },
      { id: 'leave', kind: 'say', effects: [{ loseMedicine: true }] },
    ],
  },
  {
    id: 'c_cash', checkpoint: 'customs', kind: 'routine', topic: 'money',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'money', effects: [] },
      // The count puts the real total on file. Saying it is under the limit is
      // free until someone counts it (the bag search), then it is a disproof.
      { id: 'count', kind: 'verify', effects: [{ time: -1 }, { fact: 'cashCount' }] },
      { id: 'under', kind: 'say', effects: [{ claim: 'cashUnderLimit' }] },
    ],
  },
  {
    // Calm: a helpful inspector. One answer, and it costs nothing.
    id: 'c_pen', checkpoint: 'customs', kind: 'routine', calm: true,
    approaches: [{ id: 'yes', kind: 'say', effects: [] }],
  },
  {
    // The bag shows it: a tourist carrying a pensioner's prescription.
    id: 'c_tourist', checkpoint: 'customs', kind: 'related', priority: 3, topic: 'purpose',
    when: { claims: ['tourism'] },
    approaches: [
      // Changing the purpose means re-entering it, which takes an hour. Nothing on file disproves anything yet.
      { id: 'admit', kind: 'say', effects: [{ claim: 'familyVisit' }, { time: -1 }] },
      { id: 'evidence', kind: 'evidence', topic: 'purpose', effects: [] },
      { id: 'mother', kind: 'contact', contacts: ['mother'], effects: [{ claim: 'familyVisit' }] },
    ],
  },
  {
    id: 'c_host', checkpoint: 'customs', kind: 'related', priority: 2, topic: 'accommodation',
    when: { facts: ['familyAddress'] },
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
        ],
      },
      { id: 'refuse', kind: 'say', effects: [{ fact: 'phoneRefused' }, { scrutiny: 1, reason: 'phoneRefused' }, { time: -1 }] },
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
      { id: 'undecided', kind: 'say', requires: { noFacts: ['familyAddress'] }, effects: [] },
      { id: 'undecidedOnFile', kind: 'say', requires: { facts: ['familyAddress'] }, effects: [{ scrutiny: 1, reason: 'familyAddress' }] },
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
      { id: 'deny', kind: 'say', effects: [{ claim: 'noOtherFamily' }] },
      { id: 'why', kind: 'verify', effects: [{ time: -1 }] },
    ],
  },
  {
    // Inconsistency: something on file makes a claim look odd. Cheap to clear up.
    id: 'i_clarify', checkpoint: 'interview', kind: 'related', priority: 3, topic: 'purpose',
    when: anyPair(INCONSISTENCIES),
    approaches: [
      { id: 'clarify', kind: 'say', effects: [{ claim: 'familyVisit' }] },
      { id: 'evidence', kind: 'evidence', topic: 'purpose', effects: [] },
      {
        id: 'accept', kind: 'say',
        effects: [
          { scrutiny: 1, reason: 'familyAddress', when: { facts: ['familyAddress'] } },
          { scrutiny: 1, reason: 'fatherCondition', when: { facts: ['fatherCondition'], noFacts: ['familyAddress'] } },
        ],
      },
    ],
  },
  {
    // Disproof: something on file says the opposite of a claim. Expensive.
    id: 'i_contradiction', checkpoint: 'interview', kind: 'related', priority: 4, topic: 'history',
    when: anyPair(DISPROOFS),
    approaches: [
      {
        id: 'apologise', kind: 'say',
        effects: [
          { scrutiny: 2, reason: 'brotherAbroad', when: { claims: ['noOtherFamily'], facts: ['brotherAbroad'] } },
          {
            scrutiny: 2, reason: 'cashCount',
            when: { claims: ['cashUnderLimit'], facts: ['cashCount'], any: [{ noClaims: ['noOtherFamily'] }, { noFacts: ['brotherAbroad'] }] },
          },
        ],
      },
      { id: 'review', kind: 'verify', effects: [{ time: -3 }] },
    ],
  },
  {
    id: 'i_employer', checkpoint: 'interview', kind: 'related', priority: 2, topic: 'work',
    when: { any: [{ facts: ['employer'] }, { background: 'foreignEmployer' }] },
    approaches: [
      { id: 'perk', kind: 'perk', effects: [] },
      { id: 'evidence', kind: 'evidence', topic: 'work', effects: [] },
      { id: 'contract', kind: 'verify', effects: [{ time: -2 }] },
      { id: 'brother', kind: 'contact', contacts: ['brother'], effects: [] },
    ],
  },
  {
    id: 'i_brother', checkpoint: 'interview', kind: 'related', priority: 2, topic: 'history',
    when: { facts: ['brotherAbroad'] },
    approaches: [
      { id: 'honest', kind: 'say', effects: [{ fact: 'brotherAbroad' }, { scrutiny: 1, reason: 'brotherAbroad' }] },
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
      { id: 'explain', kind: 'say', effects: [{ fact: 'donationRecord' }, { scrutiny: 1, reason: 'donationRecord' }] },
      // The record is on the desk, so denying it is a disproof.
      { id: 'deny', kind: 'say', effects: [{ claim: 'neverDonated' }, { scrutiny: 2, reason: 'donationRecord' }] },
      { id: 'lawyer', kind: 'verify', effects: [{ time: -3 }] },
    ],
  },
  {
    id: 'f_photo', checkpoint: 'followup', kind: 'followup', topic: 'history',
    approaches: [
      // The photo came from the phone search, which is the only thing that deals this card.
      { id: 'honest', kind: 'say', effects: [{ scrutiny: 1, reason: 'phoneSearch' }] },
      { id: 'deny', kind: 'say', effects: [{ scrutiny: 2, reason: 'phoneSearch' }] },
      { id: 'law', kind: 'verify', effects: [{ time: -2 }] },
    ],
  },
];

/** What the phone search found, printed for the next desk. */
const PHONE_REPORT: Effect = { send: 'printout', facts: ['phoneSearched', 'brotherAbroad', 'donationRecord'] };

/** Results are fixed when the check starts; the waiting room only reveals them. */
export const CHECKS: Record<CheckId, Check> = {
  // Your host can be vouched for: whoever can confirm the address.
  hostCall: {
    id: 'hostCall', topic: 'accommodation', beats: 3,
    cases: [
      // The call note goes with your file to the interview, address and all.
      { when: { bulletin: 'accommodation' }, followUp: 'f_host', result: 'noAnswer', effects: [{ send: 'printout', facts: ['familyAddress'] }] },
      { result: 'clear', effects: [{ send: 'printout', facts: ['familyAddress'] }] },
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
 * Drawn when scrutiny reaches 3. Every one has an answer that needs no card and
 * no contact, and a way out. Apart from the bag search, each changes the
 * problem instead of only costing hours (InspectionKind, checked in checkState).
 */
export const INSPECTIONS: Inspection[] = [
  {
    // The prescription is in the bag, and your mother can confirm it.
    id: 's_bag', kind: 'search', topic: 'medicine',
    approaches: [
      // A full search counts the cash, so the total goes on file.
      // The search report, cash total included, goes with you to the next desk.
      { id: 'wait', kind: 'verify', effects: [{ time: -3 }, { fact: 'cashCount' }, { send: 'printout', facts: ['cashCount'] }] },
      { id: 'contact', kind: 'contact', contacts: ['mother'], effects: [{ time: -1 }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    // Confiscation: the medicine is held. Get it back now, or leave without it.
    // Only dealt while you still carry it (inspect() in src/game/engine.ts).
    id: 's_medicine', kind: 'confiscation',
    approaches: [
      { id: 'surrender', kind: 'say', effects: [{ loseMedicine: true }] },
      { id: 'wait', kind: 'verify', effects: [{ time: -3 }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    // Missed connection: the shuttle to the station has gone. The next one makes
    // the trip an hour longer, so the run needs an hour more left; or someone
    // drives out for you, which puts them on file. Driving is not confirming
    // anything, so anyone close enough will do (namesOnly).
    id: 's_connection', kind: 'connection',
    approaches: [
      { id: 'later', kind: 'say', effects: [{ travel: 1 }] },
      { id: 'drive', kind: 'contact', contacts: ['mother', 'cousin'], namesOnly: true, effects: [] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    // Extra verification: the supervisor checks why you travel. Spend the document
    // that backs it, or let her phone the hospital and your father's condition goes
    // on file. Only dealt while that call would tell this desk something new.
    id: 's_supervisor', kind: 'verification', topic: 'purpose',
    when: { noFacts: ['fatherCondition'] },
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'purpose', effects: [] },
      { id: 'accept', kind: 'say', effects: [{ fact: 'fatherCondition' }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
];

export const ENCOUNTER_BY_ID = new Map(ENCOUNTERS.map((e) => [e.id, e]));
export const INSPECTION_BY_ID = new Map(INSPECTIONS.map((i) => [i.id, i]));
