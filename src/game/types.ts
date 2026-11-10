// Game data types. Logic and ids only: every player-facing string lives in
// src/i18n, keyed by these ids (see docs/design.md "Languages").

export type Checkpoint = 'passport' | 'customs' | 'interview';
export const CHECKPOINTS: readonly Checkpoint[] = ['passport', 'customs', 'interview'];

export type CharacterId = 'lena' | 'mark';
export type BackgroundId = 'foreignEmployer' | 'donation' | 'apartment' | 'secondPassport' | 'brotherAtWar' | 'protestPhoto';
export type EvidenceId = 'hotel' | 'motherLetter' | 'employerLetter' | 'hospitalNote' | 'returnTicket' | 'deed';
export type Topic = 'purpose' | 'accommodation' | 'stay' | 'work' | 'money' | 'medicine' | 'identity' | 'history';
export type ContactId = 'mother' | 'cousin' | 'brother';
export type BulletinId = 'customs' | 'accommodation' | 'records';

/** What officials know. Shown to the player as On file cards. */
export type FactId =
  | 'familyAddress'
  | 'employer'
  | 'fatherCondition'
  | 'departureDate'
  | 'property'
  | 'urgency'
  | 'phoneSearched'
  | 'donationRecord'
  | 'brotherAbroad'
  | 'secondPassport'
  | 'phoneRefused'
  | 'cashCount'
  | 'noBooking'
  | 'hostStatement'
  | 'bankNotice'
  | 'relativeContact';

export const FACT_IDS: readonly FactId[] = [
  'familyAddress', 'employer', 'fatherCondition', 'departureDate', 'property', 'urgency', 'phoneSearched',
  'donationRecord', 'brotherAbroad', 'secondPassport', 'phoneRefused', 'cashCount',
  'noBooking', 'hostStatement', 'bankNotice', 'relativeContact',
];

/** What the player has said. Can be contradicted by facts. */
export type ClaimId = 'familyVisit' | 'tourism' | 'hotelStay' | 'noOtherFamily' | 'neverDonated' | 'stayingWithFamily' | 'cashUnderLimit';

/** All fields must hold. Mirrors the Cond pattern in alexis_adventure_game/src/core/dialogue.ts. */
export interface Cond {
  character?: CharacterId;
  background?: BackgroundId;
  bulletin?: BulletinId;
  /** Known at the current desk (not anywhere on the crossing). */
  facts?: FactId[];
  noFacts?: FactId[];
  claims?: ClaimId[];
  noClaims?: ClaimId[];
  /** At least one of these contacts is still unexposed. */
  contactFree?: ContactId[];
  /** true: LAST_HOURS hours left or fewer (src/game/content/world.ts). false: more than that. */
  lastHours?: boolean;
  /** A held, unused card covers this topic. */
  holds?: Topic;
  /** Any of these conditions holds. */
  any?: Cond[];
  /** This condition does not hold. */
  not?: Cond;
}

/**
 * Why scrutiny goes up, so the player can see it: a fact on file, or the check
 * whose result dealt this card. A scrutiny effect only applies while its reason
 * holds (scrutinyApplies() in src/game/engine.ts), so nothing adds scrutiny
 * because the engine knows your background.
 */
export type ScrutinyReason = FactId | CheckId;

/**
 * How a fact reaches another desk (docs/design.md "What each official knows").
 * call: one desk phones the next. printout: a check's report goes with your
 * file to the next desk. The shared records system is not an effect: with the
 * records bulletin every fact reaches the later desks at once.
 */
export type Channel = 'call' | 'printout';

export type Effect =
  | { time: number; when?: Cond }
  | { scrutiny: number; reason: ScrutinyReason; when?: Cond }
  | { fact: FactId; when?: Cond }
  | { claim: ClaimId; when?: Cond }
  | { loseMedicine: true; when?: Cond }
  /** Adds hours to the trip from the border to the bus (a missed connection): the run needs that many more left. */
  | { travel: number; when?: Cond }
  /** Sends these facts (all this desk knows when unset) that this desk knows on to the next desk. */
  | { send: Channel; facts?: FactId[]; when?: Cond };

export type ApproachKind = 'evidence' | 'verify' | 'contact' | 'say' | 'perk' | 'withdraw';

export interface Approach {
  id: string;
  kind: ApproachKind;
  /** evidence: any held, unused card covering this topic. */
  topic?: Topic;
  /**
   * contact: the first unexposed one from this list who can confirm the card's
   * topic (CONTACTS in src/game/content/world.ts) is named.
   */
  contacts?: ContactId[];
  /** contact: the answer only names them (the relatives question), so they confirm nothing and need no ability. */
  namesOnly?: true;
  requires?: Cond;
  effects: Effect[];
  /** Opens the waiting room for this check after the effects apply. */
  check?: CheckId;
}

export interface Encounter {
  id: string;
  checkpoint: Checkpoint | 'followup';
  kind: 'routine' | 'related' | 'followup';
  /** Always dealt first at its checkpoint (the title question opens passport control). */
  opening?: boolean;
  /** Drives the character's perk and weakness. */
  topic?: Topic;
  /**
   * routine cards only: a kind or uneventful moment (a helpful inspector, a
   * glass of water). One answer that costs nothing, so it is not counted as a
   * decision. Only the dealer's breather deals one (breather() in src/game/engine.ts).
   */
  calm?: true;
  /** related cards: higher wins. Consequences of answers beat background. */
  priority?: number;
  when?: Cond;
  approaches: Approach[];
}

export type CheckId = 'hostCall' | 'medicineLab' | 'phoneSearch' | 'recordsCheck';

export interface CheckCase {
  when?: Cond;
  /** Undefined means the check clears. */
  followUp?: string;
  /** Key suffix for the outcome line: check.<id>.<result>. */
  result: string;
  effects?: Effect[];
}

export interface Check {
  id: CheckId;
  /**
   * What a contact could confirm to settle this check. A free contact who can
   * confirm it may vouch for you in the waiting room. None means nobody can
   * vouch away what it finds (a phone search, a records scan).
   */
  topic?: Topic;
  /** First matching case wins; the last case should have no `when`. */
  cases: CheckCase[];
  /** How many ordinary beats to show from the checkpoint's pool. */
  beats: number;
}

/**
 * What a secondary inspection does to the problem. search: the bag is searched
 * and the cash counted. The other three change something besides time, so a
 * setback is a new decision, not only lost hours: confiscation holds the
 * medicine (wait to get it back, or leave without it), connection moves the
 * bus out of reach (a longer trip, or a contact drives you), verification
 * checks one claim (spend the document that backs it, or a fact goes on file).
 */
export type InspectionKind = 'search' | 'confiscation' | 'connection' | 'verification';

export interface Inspection {
  id: string;
  kind: InspectionKind;
  /** What a contact could confirm here. Without one, nobody can be named. */
  topic?: Topic;
  when?: Cond;
  approaches: Approach[];
}

export interface Character {
  id: CharacterId;
  background: BackgroundId[];
  contacts: ContactId[];
  protectedContact: ContactId;
  evidenceSlots: number;
  startScrutiny: number;
  /** Topics the once-per-run perk can answer for free. */
  perkTopics: Topic[];
  /** Topics that cost 1 extra time when verified. */
  weakTopics: Topic[];
}

/**
 * What an officer cares about. passport: complete, accurate paperwork. customs:
 * goods declared by the rules. interview: political risk (history, contacts, the phone).
 */
export type OfficerPriority = 'paperwork' | 'goods' | 'politics';

/**
 * How an officer reacts to an answer at their desk: each listed fact the answer
 * puts on file here for the first time adds `scrutiny`, with that fact as the
 * reason, unless the answer already adds scrutiny for it. Only while `when` holds.
 */
export interface OfficerReaction {
  reveals: FactId[];
  scrutiny: number;
  when?: Cond;
}

/** The official at a desk. Their priority is stated on screen (officer.<desk>.priority). */
export interface Officer {
  desk: Checkpoint;
  priority: OfficerPriority;
  /** The answers this officer reacts to. Empty: their priority is already in what their cards cost. */
  reactions: OfficerReaction[];
  /** The claims this officer writes down when you make them here. Any other claim is only said aloud. */
  writesDown: ClaimId[];
}

/** A person the traveler can name, and what they can confirm. */
export interface Contact {
  id: ContactId;
  /** Topics they can confirm. A contact answer shows only on a card or check with one of these. */
  abilities: Topic[];
  /** The fact that puts their home on file. With it on file, a call-in becomes a visit (a worse exposure). */
  home?: FactId;
}

/** How badly something on the ending's list hurts: 1 minor, 2 serious, 3 severe. It orders the list, and no tag shows it. */
export type Severity = 1 | 2 | 3;

/** One line of the ending's list, worst first (consequences() in src/game/consequence.ts). Its heading is `<key>.title`. */
export interface EndingLine {
  kind: 'medicine' | 'contact';
  key: string;
  vars?: Record<string, string | number>;
  severity: Severity;
}

export interface EvidenceCard {
  id: EvidenceId;
  topics: Topic[];
  onUse: Effect[];
  /**
   * The questions this document answers outright. Shown for one of these, the
   * officer reads it and hands it back, so its facts stay off file. Only for
   * harmless facts (HARMLESS_FACTS in src/game/content/world.ts).
   */
  settles?: Topic[];
  /** The card can't back an answer while this holds. */
  blockedBy?: Cond;
}

export type WaitAction = 'wait' | 'ask' | 'assist';

export type Screen =
  | { kind: 'encounter'; id: string }
  | { kind: 'inspection'; id: string }
  | { kind: 'wait'; check: CheckId; beats: number[]; shown: number; resolved: CheckCase; asked: boolean }
  | { kind: 'between'; next: number }
  | { kind: 'ending' };

export type EndingId = 'homeInTime' | 'homeAtCost' | 'tooLate' | 'turnedBack';

export interface LogEntry {
  /** i18n key of the line shown after a choice. */
  key: string;
  vars?: Record<string, string>;
}

/** One "what changed" line under the officer's reaction (changeLines() in src/game/consequence.ts). */
export interface ChangeLine {
  key: string;
  vars?: Record<string, string | number>;
  /** Plural count: render with tn(key, n). */
  n?: number;
  /** amber: attention or escalation. red: a confirmed serious consequence. */
  tone: 'plain' | 'amber' | 'red';
}

/**
 * What each official knows: every fact that came out, and the desks that know
 * it, in CHECKPOINTS order. A fact is known where it came out and travels on
 * only through a channel (Channel, or the records bulletin).
 */
export type FactMap = Partial<Record<FactId, Checkpoint[]>>;

export interface RunState {
  v: 2;
  seed: number;
  rng: number;
  character: CharacterId;
  bulletin: BulletinId;
  loadout: EvidenceId[];
  used: EvidenceId[];
  exposed: ContactId[];
  /**
   * Contacts called in whose statement is still to be checked: the next card that
   * asks about something they can confirm costs 1 hour for each. Never the protected
   * contact, whose cost is the ending. Unset in saves from before it existed.
   */
  calledIn?: ContactId[];
  time: number;
  /**
   * Hours the trip from the border to the bus takes: MISSION_MIN_TIME, or more
   * after a missed connection. The run needs at least this many left (travelOf()
   * in src/game/engine.ts). Unset in saves from before it existed.
   */
  travel?: number;
  scrutiny: number;
  facts: FactMap;
  claims: ClaimId[];
  /**
   * The desks that wrote each claim down (Officer.writesDown), in CHECKPOINTS order.
   * A claim in `claims` with no desk here was only said aloud. Unset in saves from before it existed.
   */
  logged?: Partial<Record<ClaimId, Checkpoint[]>>;
  medicine: boolean;
  perkUsed: boolean;
  withdrew: boolean;
  checkpoint: number;
  slot: number;
  seen: string[];
  /**
   * Escalating cards (related, follow-up, inspection) dealt in a row since the
   * last routine card. At 2, the dealer deals a routine card first if one is left
   * (breather() in src/game/engine.ts). Unset in saves from before it existed.
   */
  streak?: number;
  /**
   * The desks that have spot-checked one of your claims (spotCheck() in
   * src/game/engine.ts), once each before you leave. Unset in saves from before it existed.
   */
  spotChecked?: Checkpoint[];
  /** Follow-ups waiting to be dealt before the next slot. */
  pending: string[];
  screen: Screen;
  /** Reaction to the last choice, shown above the next screen until acknowledged. */
  reaction: LogEntry[] | null;
  /** What the last action changed, shown under the reaction. Set by playStep() in src/game/play.ts. */
  changes?: ChangeLine[] | null;
  log: LogEntry[];
  decisions: number;
  inspections: number;
  ending: EndingId | null;
}

export type Action =
  | { type: 'choose'; approach: string }
  | { type: 'beat' }
  | { type: 'waitAction'; action: WaitAction }
  | { type: 'ack' }
  /** Only once the bus is out of reach (doomed()): the rest of the crossing plays out, Too late. */
  | { type: 'finish' };
