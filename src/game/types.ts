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
  | 'cashCount';

export const FACT_IDS: readonly FactId[] = [
  'familyAddress', 'employer', 'fatherCondition', 'departureDate', 'property', 'urgency', 'phoneSearched',
  'donationRecord', 'brotherAbroad', 'secondPassport', 'phoneRefused', 'cashCount',
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
  /** Any of these conditions holds. */
  any?: Cond[];
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

export interface Inspection {
  id: string;
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

/** A person the traveler can name, and what they can confirm. */
export interface Contact {
  id: ContactId;
  /** Topics they can confirm. A contact answer shows only on a card or check with one of these. */
  abilities: Topic[];
}

export interface EvidenceCard {
  id: EvidenceId;
  topics: Topic[];
  onUse: Effect[];
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
  time: number;
  scrutiny: number;
  facts: FactMap;
  claims: ClaimId[];
  medicine: boolean;
  perkUsed: boolean;
  withdrew: boolean;
  checkpoint: number;
  slot: number;
  seen: string[];
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
  | { type: 'ack' };
