// Characters, evidence and bulletins for the first mission. No prose here:
// names and descriptions are in src/i18n/en.ts under the same ids.

import type {
  BulletinId, Character, CharacterId, Checkpoint, ClaimId, Contact, ContactId, EvidenceCard, EvidenceId, FactId, Officer, Topic,
} from '../types';

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

/** Facts that are a political risk: a second citizenship, a brother across the border, an old donation. */
export const POLITICAL_FACTS: readonly FactId[] = ['secondPassport', 'brotherAbroad', 'donationRecord'];

/**
 * One officer per desk, each with one priority, stated when you reach the desk
 * (officer.<desk>.priority). The clerk's and the inspector's priorities are
 * already in their cards: checking paperwork costs time, and goods are fine
 * once declared. The security officer reacts to politics: an answer that brings
 * a political fact out at the interview costs 1 scrutiny, with that fact as the
 * reason, where the same answer at the passport desk costs nothing extra.
 *
 * Each officer writes down the claims their priority covers, and only those:
 * the clerk puts your reason and address on the form, the inspector your cash
 * declaration, the security officer your denials and who you stay with. Any
 * other claim is only said aloud, and My story shows the difference.
 */
export const OFFICERS: Record<Checkpoint, Officer> = {
  passport: {
    desk: 'passport', priority: 'paperwork', reactions: [],
    writesDown: ['familyVisit', 'tourism', 'hotelStay', 'stayingWithFamily'],
  },
  customs: { desk: 'customs', priority: 'goods', reactions: [], writesDown: ['cashUnderLimit'] },
  interview: {
    desk: 'interview', priority: 'politics', reactions: [{ reveals: [...POLITICAL_FACTS], scrutiny: 1 }],
    writesDown: ['noOtherFamily', 'neverDonated', 'stayingWithFamily'],
  },
};

/** Whether the officer at `desk` writes `claim` down when you make it there. */
export const writesDown = (desk: Checkpoint, claim: ClaimId): boolean => OFFICERS[desk].writesDown.includes(claim);

export const canConfirm = (c: ContactId, topic: Topic | undefined): boolean => !!topic && CONTACTS[c].abilities.includes(topic);

/**
 * Facts nothing on the crossing reacts to: no card, check or officer asks about
 * them. Only these may stay off file when a document settles a question (settles).
 */
export const HARMLESS_FACTS: readonly FactId[] = ['departureDate', 'property'];

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
    // Asked about cash, a paid flight out is the whole answer.
    settles: ['money'],
  },
  deed: {
    id: 'deed',
    topics: ['identity', 'accommodation'],
    onUse: [{ fact: 'property' }],
    // Asked who you are, the registered owner's name is the whole answer.
    settles: ['identity'],
  },
};

export const EVIDENCE_IDS = Object.keys(EVIDENCE) as EvidenceId[];
export const BULLETINS: BulletinId[] = ['customs', 'accommodation', 'records'];
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/** Ordinary procedural beats per checkpoint, keyed beat.<checkpoint>.<n> in i18n. */
export const BEAT_COUNT = 6;

/** How long a waiting-room beat stays before the next one: 2-5 s, or 0.6 s with shorter waits. */
export const beatDelayMs = (beat: number, reduceWait = false) => (reduceWait ? 600 : 2000 + ((beat * 613) % 3000));
