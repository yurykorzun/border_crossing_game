// Characters, evidence and bulletins for the first mission. No prose here:
// names and descriptions are in src/i18n/en.ts under the same ids.

import type {
  OnFileTier, BulletinId, Character, CharacterId, Checkpoint, ClaimId, Contact, ContactId, EvidenceCard, EvidenceId, FactId, Officer, Topic,
} from '../types';

export const START_TIME = 8;
export const MISSION_MIN_TIME = 2;
export const MAX_SCRUTINY = 3;
export const SCRUTINY_AFTER_INSPECTION = 1;
/**
 * With this many hours left or fewer, any delay misses the bus, so an
 * inspection stops offering to wait and asks for one sacrifice instead:
 * belongings, a disclosure or a person (Cond.lastHours).
 */
export const LAST_HOURS = 2;
/**
 * Hours a desk's spot-check takes to square a claim with a fact that makes it
 * look odd, when you have since told them the real reason (spotCheckOf() in
 * src/game/engine.ts): the officer phones the desk that wrote it down. Three
 * keeps the liar bot at or under 80 percent homeInTime in `npm run autoplay`.
 */
export const SPOT_CHECK_HOURS = 3;

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
    onFile: ['secondPassport'],
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
  // With her address on file and something about her flagged at a desk (her address,
  // her account against yours, the relative she named), officers visit her the
  // following morning instead of phoning. The address on file alone sends nobody.
  mother: {
    id: 'mother', abilities: ['accommodation', 'purpose', 'medicine'], home: 'familyAddress',
    flaggedBy: ['familyAddress', 'hostStatement', 'relativeNamed'],
  },
  // He can host.
  cousin: { id: 'cousin', abilities: ['accommodation'] },
  // A job offer abroad. With his record on file and flagged, naming him lists him, not only questions him.
  brother: { id: 'brother', abilities: ['work'], record: 'brotherAbroad' },
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
 * the clerk puts your reason, address and length of stay on the form, the inspector your cash
 * declaration, the security officer your denials and who you stay with. Any
 * other claim is only said aloud, and My story shows the difference.
 */
export const OFFICERS: Record<Checkpoint, Officer> = {
  // The clerk and the security officer read a foreign salary as a question about
  // loyalty. The employer is a fact once confirmed; that reading stays a suspicion.
  passport: {
    desk: 'passport', priority: 'paperwork', reactions: [],
    writesDown: ['familyVisit', 'shortTrip', 'hotelStay', 'stayingWithFamily', 'stayDays', 'stayWeeks'],
    readings: ['employer'],
  },
  customs: { desk: 'customs', priority: 'goods', reactions: [], writesDown: ['cashUnderLimit'], readings: [] },
  interview: {
    desk: 'interview', priority: 'politics', reactions: [{ reveals: [...POLITICAL_FACTS], scrutiny: 1 }],
    writesDown: ['noOtherFamily', 'noFamilyAbroad', 'neverDonated', 'stayingWithFamily'],
    readings: ['employer'],
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

/**
 * How each fact sits on file before anything flags it (factTier() in
 * src/game/engine.ts). Lena and Mark are citizens, so the state already has some
 * of their life: the registered family address, the apartment in the land
 * register, and the exit record that shows which passport they left on. A desk
 * that finds one of these found it in the old records. A donation to a listed
 * fund and a refused search are flagged the moment they are on file. Everything
 * else came out on this crossing. Any fact becomes flagged once it is the
 * reason scrutiny rises.
 */
export const FACT_TIERS: Record<FactId, OnFileTier> = {
  familyAddress: 'recorded',
  property: 'recorded',
  secondPassport: 'recorded',
  employer: 'confirmed',
  fatherCondition: 'confirmed',
  departureDate: 'confirmed',
  urgency: 'confirmed',
  phoneSearched: 'confirmed',
  brotherAbroad: 'confirmed',
  cashCount: 'confirmed',
  noBooking: 'confirmed',
  hostStatement: 'confirmed',
  bankNotice: 'confirmed',
  relativeContact: 'confirmed',
  relativeNamed: 'confirmed',
  entryRecord: 'recorded',
  sisterSaysDays: 'confirmed',
  sisterSaysWeeks: 'confirmed',
  donationRecord: 'flagged',
  phoneRefused: 'flagged',
};

export const EVIDENCE: Record<EvidenceId, EvidenceCard> = {
  hotel: {
    id: 'hotel',
    topics: ['accommodation', 'stay'],
    // With family as where you stay, the booking only gives its dates: no hotel stay on file.
    onUse: [{ claim: 'hotelStay', when: { noClaims: ['stayingWithFamily'] } }],
    // Only staying with family rules out a hotel; visiting family does not. It rules
    // out the hotel as where you stay, not the three nights as how long (p_stay).
    blockedBy: { claims: ['stayingWithFamily'] },
    blockedOn: ['accommodation'],
  },
  motherLetter: {
    id: 'motherLetter',
    topics: ['purpose', 'accommodation'],
    onUse: [{ fact: 'familyAddress' }, { claim: 'familyVisit' }],
  },
  employerLetter: {
    id: 'employerLetter',
    // Where your cash is from (c_cash), never how much you take out (d_declared has no document answer).
    topics: ['work', 'money'],
    onUse: [{ fact: 'employer' }],
  },
  hospitalNote: {
    id: 'hospitalNote',
    topics: ['medicine', 'purpose'],
    onUse: [{ fact: 'fatherCondition' }, { claim: 'familyVisit' }],
    // Shown for why you came, it verifies the prescription too: customs uses its details.
    forwards: ['medicine'],
  },
  returnTicket: {
    id: 'returnTicket',
    // A flight out answers how long you stay. It says nothing about the cash you
    // carry: the employer letter (income) or a declaration answers that.
    topics: ['stay'],
    onUse: [{ fact: 'departureDate' }],
    // Asked how long you are staying, the date on the ticket is the whole answer.
    settles: ['stay'],
  },
  deed: {
    id: 'deed',
    topics: ['identity', 'accommodation'],
    onUse: [{ fact: 'property' }],
    // Asked who you are or where you will stay, the registered owner's name and house are the whole answer.
    settles: ['identity', 'accommodation'],
    // Shown for where you stay, it confirms who you are too: the registered owner's name and ID number.
    forwards: ['identity'],
  },
};

export const EVIDENCE_IDS = Object.keys(EVIDENCE) as EvidenceId[];
export const BULLETINS: BulletinId[] = ['customs', 'accommodation', 'records'];

/**
 * The topic each bulletin's warning (bulletin.<id> in i18n) points at, without
 * naming a document. A packing covers it with any document on that topic, and
 * the walk checks those packings get home in time more often than the same
 * character's packings that ignore it (warningShares).
 */
export const BULLETIN_TOPICS: Record<BulletinId, Topic> = {
  // The medicine lab: a medical note saves the wait.
  customs: 'medicine',
  // Every host is phoned at customs (c_host): a paper that says where you stay answers it.
  accommodation: 'accommodation',
  // The records scan takes longer: a paper that proves who you are skips it.
  records: 'identity',
};

/** Whether a packing has a document on the topic the bulletin warns about. */
export const coversWarning = (loadout: readonly EvidenceId[], bulletin: BulletinId): boolean =>
  loadout.some((id) => EVIDENCE[id].topics.includes(BULLETIN_TOPICS[bulletin]));
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

/**
 * The first run, while no ending is seen yet: Start goes straight to the begin
 * screen as Lena with this packing, so the player crosses once before choosing
 * anything (Setup in src/App.tsx). It covers every bulletin's warning
 * (coversWarning), so the random bulletin never leaves a first run unwarned.
 * Bots in npm run walk and npm run autoplay still pick their own setups.
 */
export const FIRST_RUN: { character: CharacterId; loadout: readonly EvidenceId[] } = {
  character: 'lena',
  loadout: ['motherLetter', 'hospitalNote', 'deed'],
};

/** Ordinary procedural beats per checkpoint, keyed beat.<checkpoint>.<n> in i18n. */
export const BEAT_COUNT = 6;

/** How long a waiting-room beat stays before the next one: 2-5 s, or 0.6 s with shorter waits. */
export const beatDelayMs = (beat: number, reduceWait = false) => (reduceWait ? 600 : 2000 + ((beat * 613) % 3000));
