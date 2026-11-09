// Characters, evidence and bulletins for the first mission. No prose here:
// names and descriptions are in src/i18n/en.ts under the same ids.

import type { BulletinId, Character, CharacterId, Contact, ContactId, EvidenceCard, EvidenceId, Topic } from '../types';

export const START_TIME = 8;
export const MISSION_MIN_TIME = 2;
export const MAX_SCRUTINY = 3;
export const SCRUTINY_AFTER_INSPECTION = 1;

export const CHARACTERS: Record<CharacterId, Character> = {
  lena: {
    id: 'lena',
    background: ['foreignEmployer', 'donation', 'apartment'],
    contacts: ['mother', 'cousin'],
    protectedContact: 'cousin',
    evidenceSlots: 3,
    startScrutiny: 0,
    perkTopics: ['work'],
    weakTopics: ['work'],
  },
  mark: {
    id: 'mark',
    background: ['secondPassport', 'brotherAtWar', 'protestPhoto'],
    contacts: ['mother', 'brother'],
    protectedContact: 'brother',
    evidenceSlots: 4,
    startScrutiny: 1,
    perkTopics: [],
    weakTopics: [],
  },
};

/**
 * What each person can confirm. Nobody can vouch away data (a phone search, a
 * records scan), so no contact covers history or identity. My story lists them
 * from contact.<id>.can, and an answer's line from contact.<id>.can.<topic>.
 */
export const CONTACTS: Record<ContactId, Contact> = {
  // The address, the visit and the prescription.
  // With her address on file, officers visit her instead of phoning.
  mother: { id: 'mother', abilities: ['accommodation', 'purpose', 'medicine'], home: 'familyAddress' },
  // He can host.
  cousin: { id: 'cousin', abilities: ['accommodation'] },
  // A job offer abroad.
  brother: { id: 'brother', abilities: ['work'] },
};

export const canConfirm = (c: ContactId, topic: Topic | undefined): boolean => !!topic && CONTACTS[c].abilities.includes(topic);

export const EVIDENCE: Record<EvidenceId, EvidenceCard> = {
  hotel: {
    id: 'hotel',
    topics: ['accommodation', 'stay'],
    onUse: [{ claim: 'hotelStay' }],
    // Only staying with family rules out a hotel; visiting family does not.
    blockedBy: { claims: ['stayingWithFamily'] },
  },
  motherLetter: {
    id: 'motherLetter',
    topics: ['purpose', 'accommodation'],
    onUse: [{ fact: 'familyAddress' }, { claim: 'familyVisit' }],
  },
  employerLetter: {
    id: 'employerLetter',
    topics: ['work', 'money'],
    onUse: [{ fact: 'employer' }],
  },
  hospitalNote: {
    id: 'hospitalNote',
    topics: ['medicine', 'purpose'],
    onUse: [{ fact: 'fatherCondition' }, { claim: 'familyVisit' }],
  },
  returnTicket: {
    id: 'returnTicket',
    topics: ['stay', 'money'],
    onUse: [{ fact: 'departureDate' }],
  },
  deed: {
    id: 'deed',
    topics: ['identity', 'accommodation'],
    onUse: [{ fact: 'property' }],
  },
};

export const EVIDENCE_IDS = Object.keys(EVIDENCE) as EvidenceId[];
export const BULLETINS: BulletinId[] = ['customs', 'accommodation', 'records'];
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** Ordinary procedural beats per checkpoint, keyed beat.<checkpoint>.<n> in i18n. */
export const BEAT_COUNT = 6;

/** How long a waiting-room beat stays before the next one: 2-5 s, or 0.6 s with shorter waits. */
export const beatDelayMs = (beat: number, reduceWait = false) => (reduceWait ? 600 : 2000 + ((beat * 613) % 3000));
