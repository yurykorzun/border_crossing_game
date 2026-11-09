// The encounter decks. Each checkpoint deals one routine card, then the
// highest-priority related card that fits (see engine.ts deal()).
// Text lives in src/i18n/en.ts: enc.<id>.q, enc.<id>.<approach>.label/.reaction.
//
// Rule: every encounter has an approach that needs no card and no contact.

import type { Check, CheckId, Encounter, Inspection } from '../types';

export const ENCOUNTERS: Encounter[] = [
  // ── Passport control: identity and purpose (the clerk wants complete paperwork)
  {
    id: 'p_purpose', checkpoint: 'passport', kind: 'routine', opening: true, topic: 'purpose',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'purpose', effects: [] },
      { id: 'family', kind: 'verify', effects: [{ claim: 'familyVisit' }, { time: -1 }] },
      { id: 'tourism', kind: 'say', effects: [{ claim: 'tourism' }] },
    ],
  },
  {
    id: 'p_photo', checkpoint: 'passport', kind: 'routine', topic: 'identity',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'identity', effects: [] },
      { id: 'scan', kind: 'verify', effects: [{ time: -1 }], check: 'recordsCheck' },
      { id: 'mother', kind: 'contact', contacts: ['mother'], effects: [] },
    ],
  },
  {
    id: 'p_secondPassport', checkpoint: 'passport', kind: 'related', priority: 1, topic: 'identity',
    when: { background: 'secondPassport' },
    approaches: [
      { id: 'both', kind: 'say', effects: [{ scrutiny: 1 }] },
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
      { id: 'count', kind: 'verify', effects: [{ time: -1 }] },
      { id: 'under', kind: 'say', effects: [{ scrutiny: 1 }] },
    ],
  },
  {
    // The bag shows it: a tourist carrying a pensioner's prescription.
    id: 'c_tourist', checkpoint: 'customs', kind: 'related', priority: 3, topic: 'purpose',
    when: { claims: ['tourism'] },
    approaches: [
      { id: 'admit', kind: 'say', effects: [{ claim: 'familyVisit' }, { scrutiny: 1 }] },
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
      { id: 'refuse', kind: 'say', effects: [{ scrutiny: 1 }, { time: -1 }] },
    ],
  },

  // ── Security interview: history and relationships (the officer asks about people)
  {
    id: 'i_stay', checkpoint: 'interview', kind: 'routine', topic: 'accommodation',
    approaches: [
      { id: 'evidence', kind: 'evidence', topic: 'accommodation', effects: [] },
      { id: 'mother', kind: 'contact', contacts: ['mother'], effects: [{ claim: 'familyVisit' }, { fact: 'familyAddress' }] },
      { id: 'undecided', kind: 'say', effects: [{ scrutiny: 1 }] },
    ],
  },
  {
    id: 'i_family', checkpoint: 'interview', kind: 'routine', topic: 'history',
    approaches: [
      // Each answer says what it is: name the relative, deny them, or ask why.
      // Only the denial records noOtherFamily, because leaving someone out is not a lie.
      {
        id: 'name', kind: 'contact', contacts: ['cousin', 'brother'],
        effects: [{ claim: 'familyVisit' }, { fact: 'brotherAbroad', when: { background: 'brotherAtWar' } }],
      },
      { id: 'deny', kind: 'say', effects: [{ claim: 'noOtherFamily' }] },
      { id: 'why', kind: 'verify', effects: [{ time: -1 }] },
    ],
  },
  {
    // Only when officials could know: a claim contradicted by something on file.
    id: 'i_contradiction', checkpoint: 'interview', kind: 'related', priority: 3, topic: 'history',
    when: {
      any: [
        { claims: ['noOtherFamily'], facts: ['brotherAbroad'] },
        { claims: ['tourism'], facts: ['familyAddress'] },
        { claims: ['tourism'], facts: ['fatherCondition'] },
      ],
    },
    approaches: [
      { id: 'apologise', kind: 'say', effects: [{ scrutiny: 2 }] },
      { id: 'review', kind: 'verify', effects: [{ time: -3 }] },
      { id: 'mother', kind: 'contact', contacts: ['mother'], effects: [{ time: -1 }] },
    ],
  },
  {
    id: 'i_employer', checkpoint: 'interview', kind: 'related', priority: 2, topic: 'work',
    when: { any: [{ facts: ['employer'] }, { background: 'foreignEmployer' }] },
    approaches: [
      { id: 'perk', kind: 'perk', effects: [] },
      { id: 'evidence', kind: 'evidence', topic: 'work', effects: [] },
      { id: 'contract', kind: 'verify', effects: [{ time: -2 }] },
    ],
  },
  {
    id: 'i_brother', checkpoint: 'interview', kind: 'related', priority: 2, topic: 'history',
    when: { any: [{ facts: ['brotherAbroad'] }, { background: 'brotherAtWar' }] },
    approaches: [
      { id: 'honest', kind: 'say', effects: [{ fact: 'brotherAbroad' }, { scrutiny: 1 }] },
      { id: 'number', kind: 'contact', contacts: ['brother'], effects: [] },
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
      { id: 'explain', kind: 'say', effects: [{ scrutiny: 1 }, { fact: 'donationRecord' }] },
      { id: 'deny', kind: 'say', effects: [{ claim: 'neverDonated' }, { scrutiny: 2 }] },
      { id: 'lawyer', kind: 'verify', effects: [{ time: -3 }] },
    ],
  },
  {
    id: 'f_photo', checkpoint: 'followup', kind: 'followup', topic: 'history',
    approaches: [
      { id: 'honest', kind: 'say', effects: [{ scrutiny: 1 }] },
      { id: 'deny', kind: 'say', effects: [{ scrutiny: 2 }] },
      { id: 'law', kind: 'verify', effects: [{ time: -2 }] },
    ],
  },
];

/** Results are fixed when the check starts; the waiting room only reveals them. */
export const CHECKS: Record<CheckId, Check> = {
  hostCall: {
    id: 'hostCall', important: true, beats: 3,
    cases: [
      { when: { bulletin: 'accommodation' }, followUp: 'f_host', result: 'noAnswer' },
      { result: 'clear' },
    ],
  },
  medicineLab: {
    id: 'medicineLab', important: false, beats: 2,
    cases: [
      { when: { bulletin: 'customs', noFacts: ['fatherCondition'] }, followUp: 'f_lab', result: 'lab' },
      { result: 'clear' },
    ],
  },
  phoneSearch: {
    id: 'phoneSearch', important: true, beats: 3,
    cases: [
      { when: { background: 'protestPhoto' }, followUp: 'f_photo', result: 'photo' },
      { when: { background: 'donation' }, followUp: 'f_donation', result: 'donation' },
      { result: 'clear' },
    ],
  },
  recordsCheck: {
    id: 'recordsCheck', important: false, beats: 2,
    cases: [
      { when: { bulletin: 'records', background: 'donation' }, followUp: 'f_donation', result: 'flagged' },
      { when: { bulletin: 'records', background: 'brotherAtWar' }, result: 'noted', effects: [{ fact: 'brotherAbroad' }] },
      { result: 'clear' },
    ],
  },
};

/** Drawn when scrutiny reaches 3. Every one has a time option and a way out. */
export const INSPECTIONS: Inspection[] = [
  {
    id: 's_bag',
    approaches: [
      { id: 'wait', kind: 'verify', effects: [{ time: -3 }] },
      { id: 'contact', kind: 'contact', contacts: ['mother', 'cousin', 'brother'], effects: [{ time: -1 }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    id: 's_medicine', when: undefined,
    approaches: [
      { id: 'surrender', kind: 'say', effects: [{ loseMedicine: true }] },
      { id: 'wait', kind: 'verify', effects: [{ time: -3 }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    id: 's_biometric',
    approaches: [
      { id: 'wait', kind: 'verify', effects: [{ time: -2 }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
  {
    id: 's_supervisor',
    approaches: [
      { id: 'wait', kind: 'verify', effects: [{ time: -3 }] },
      { id: 'mother', kind: 'contact', contacts: ['mother'], effects: [{ time: -1 }] },
      { id: 'withdraw', kind: 'withdraw', effects: [] },
    ],
  },
];

export const ENCOUNTER_BY_ID = new Map(ENCOUNTERS.map((e) => [e.id, e]));
export const INSPECTION_BY_ID = new Map(INSPECTIONS.map((i) => [i.id, i]));
