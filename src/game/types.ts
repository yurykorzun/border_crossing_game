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
  | 'relativeContact'
  /** Your mother named another relative on the phone: her account, not a record (TESTIMONY). */
  | 'relativeNamed';

export const FACT_IDS: readonly FactId[] = [
  'familyAddress', 'employer', 'fatherCondition', 'departureDate', 'property', 'urgency', 'phoneSearched',
  'donationRecord', 'brotherAbroad', 'secondPassport', 'phoneRefused', 'cashCount',
  'noBooking', 'hostStatement', 'bankNotice', 'relativeContact', 'relativeNamed',
];

/**
 * Which of three an officer's reaction against you is (docs/design.md "Truth,
 * claims, official knowledge"). suspicion: a question raised, the officer's
 * reading of what is on file. testimony: someone said otherwise, which you can
 * explain. disproof: a document or record shows a claim false. A check can
 * establish facts, but it never proves the officer's interpretation, so a
 * reading is always a suspicion and never a fact.
 */
export type ReactionKind = 'suspicion' | 'testimony' | 'disproof';

/** What the player has said. Can be contradicted by facts. */
export type ClaimId = 'familyVisit' | 'shortTrip' | 'hotelStay' | 'noOtherFamily' | 'neverDonated' | 'stayingWithFamily' | 'cashUnderLimit';

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
  /** Every one of these cards has been shown on this crossing. */
  used?: EvidenceId[];
  /** true: a fact this desk knows is flagged (factTier() in src/game/engine.ts). */
  flagged?: boolean;
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
 * How a fact sits on file, which the card names (docs/design.md "Truth, claims,
 * official knowledge"). recorded: the state had it before you arrived (your
 * registered address, your previous crossings) and a desk found it. confirmed:
 * it came out on this crossing. flagged: it is marked for attention, because it
 * is on a list or because it was the reason scrutiny rose.
 */
export type OnFileTier = 'recorded' | 'confirmed' | 'flagged';

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
  /**
   * On a desk's card whose point was verified earlier (RunState.verified), these
   * effects replace `effects` and no check opens: the officer uses what is on
   * file instead of asking again. The answer reads `<key>.verified.label`/`.reaction`.
   */
  ifVerified?: Effect[];
  /**
   * A record check that confirms the card's point at the desk (the employer register):
   * like a document shown, it verifies the point for the later desks (RunState.verified).
   * At an inspection it verifies the open issue the inspection is about (the lab
   * handing the medicine back).
   */
  confirms?: boolean;
  /**
   * An answer the officer holds against you (it adds scrutiny) outside a challenge card:
   * which of three the reaction is. A disproof records the answer's claim as disproved
   * (reactionOf() in src/game/engine.ts). Challenge cards say it for every answer (catchKind()).
   */
  reacts?: ReactionKind;
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
  /**
   * related and follow-up cards: the open issue on the file that this card is
   * about, a fact this desk knows or a claim you made. It is dealt only while
   * the issue holds, and a queued follow-up whose issue has closed is dropped
   * (advance() in src/game/engine.ts). The content test checks every one has one.
   */
  issue?: Cond;
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
  /**
   * A check in stages: after the beats an observation hints at the direction
   * (check.<id>.observe.<result>), then you answer narrowly (wait), ask what it
   * concerns, or explain first, which applies these effects and answers the
   * follow-up before it is asked. Nothing found is taken off the file.
   */
  explain?: Effect[];
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
  /**
   * The open issue on the file this inspection is about: a point no desk has
   * verified (pointVerified() in src/game/engine.ts). It is dealt only while that
   * point is open, and the screen names it (knownLine()). An answer that shows a
   * paper, has a contact confirm it or runs a check that confirms it
   * (Approach.confirms) settles the point; any other answer
   * changes it instead (a fact goes on file, the medicine is held, the trip is longer).
   */
  issue: Topic;
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
  /**
   * Old records the passport desk has before you say a word (FACT_TIERS
   * 'recorded'): Mark's exit record shows he left on his second passport.
   */
  onFile?: FactId[];
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
  /**
   * Facts this officer reads something into when they come out here: the fact goes
   * on file, and the reading is a separate suspicion line (`reading.<fact>.<desk>`),
   * never a fact. Lena's employer is confirmed; political involvement is not.
   */
  readings: FactId[];
}

/** A person the traveler can name, and what they can confirm. */
export interface Contact {
  id: ContactId;
  /** Topics they can confirm. A contact answer shows only on a card or check with one of these. */
  abilities: Topic[];
  /**
   * The fact that puts their home on file. On file alone it sends nobody: a call-in
   * becomes a visit (a worse exposure) only once one of `flaggedBy` is flagged too.
   */
  home?: FactId;
  /**
   * Facts about them that, flagged at a desk, give officers a reason to visit their
   * home (`exposure.<id>.home.reason.<fact>` names which, and where).
   */
  flaggedBy?: FactId[];
  /**
   * The record that makes naming them worse: on file and flagged (factTier()), the ending
   * reads `exposure.<id>.protected.record` (listed), else `exposure.<id>.protected`.
   */
  record?: FactId;
}

/** How badly something on the ending's list hurts: 1 minor, 2 serious, 3 severe. It orders the list, and no tag shows it. */
export type Severity = 1 | 2 | 3;

/** One line of the ending's list, worst first (consequences() in src/game/consequence.ts). Its heading is `<key>.title`. */
export interface EndingLine {
  kind: 'medicine' | 'contact';
  key: string;
  vars?: Record<string, string | number>;
  severity: Severity;
  /**
   * A contact line's stated reason: why naming them does this harm ("Ilya was
   * already questioned about the fundraiser"). Every contact line has one.
   */
  reason?: string;
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
  /**
   * Points this document verifies wherever it is shown, besides the question it
   * answers: the hospital note at passport verifies the prescription too, and the
   * clerk forwards its details, so customs uses them instead of asking again.
   */
  forwards?: Topic[];
}

/** A level: one crossing, with its own clock, goal and cards (LEVELS in src/game/content/levels.ts). */
export type LevelId = 'arrival';

/**
 * The one new rule a level adds (docs/research/2026-11-09-balance-and-levels.md,
 * "Levels"). `heeds` lists the picks a player who follows the rule makes, as
 * `card.approach` (or `check.waitAction` in the waiting room). A bot that
 * ignores the rule never makes them while another pick is open, so the walk
 * can show that ignoring it gets home in time less often (ruleShares() in
 * src/game/walk.ts).
 */
export interface LevelRule {
  id: string;
  heeds: readonly string[];
}

export interface Level {
  id: LevelId;
  /** Shown as "Level <number>" on the level list. */
  number: number;
  /** i18n key of the level's name on the level list. */
  title: string;
  /** i18n key of the one line under the name on the level list. */
  blurb: string;
  /** i18n keys of the goal on the begin screen: its heading and its body ({hours}, {travel}). */
  goalTitle: string;
  goalBody: string;
  /** Hours until the last bus when the run starts. */
  startTime: number;
  /** Hours the trip from the border takes: the run needs at least this many left. */
  minTripTime: number;
  /** Encounter and inspection ids this level can deal. Follow-ups and challenges come from what was dealt. */
  cards: readonly string[];
  /** The rules this level adds. Level 1 adds none. */
  rules: readonly LevelRule[];
  /**
   * How many different endings the player must have seen before the level opens
   * (levelOpen() in src/game/content/levels.ts). Seeing them opens it, not winning. 0: open from the start.
   */
  opensAt: number;
}

/**
 * The file from your last finished crossing, which a later level can read
 * (src/game/carry.ts). It is what the officials have on you next time: what you
 * claimed, who you named, which documents you still hold and which you spent.
 */
export interface CarriedFile {
  /** The crossing it came from. */
  level: LevelId;
  character: CharacterId;
  ending: EndingId;
  claims: ClaimId[];
  /** Contacts you named to an official. */
  named: ContactId[];
  /** Documents you packed and did not show. */
  kept: EvidenceId[];
  /** Documents you showed at a desk, so they are on file and used up. */
  spent: EvidenceId[];
  /** Whether the medicine came through. */
  medicine: boolean;
  /** Set when no crossing was saved and the file was built from a seed (defaultFile()). */
  seeded?: true;
}

export type WaitAction = 'wait' | 'ask' | 'assist' | 'explain';

export type Screen =
  | { kind: 'encounter'; id: string }
  | { kind: 'inspection'; id: string }
  | { kind: 'wait'; check: CheckId; beats: number[]; shown: number; resolved: CheckCase; asked: boolean }
  | { kind: 'between'; next: number }
  | { kind: 'ending' };

export type EndingId = 'homeInTime' | 'homeAtCost' | 'tooLate' | 'turnedBack';

/**
 * How a desk went, which picks your mother's next message (src/game/content/queues.ts).
 * call: an officer phoned her there. delay: the desk took 2 hours or more. smooth: neither.
 */
export type QueueMood = 'call' | 'delay' | 'smooth';

export interface LogEntry {
  /** i18n key of the line shown after a choice. */
  key: string;
  vars?: Record<string, string>;
  /** Set on a reaction against you: a challenge answered, a fact the officer flags or reads something into. */
  kind?: ReactionKind;
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

/** Where a point was verified, and how many facts were flagged at that moment (RunState.verified). */
export interface VerifiedPoint {
  desk: Checkpoint;
  flags: number;
}

export interface RunState {
  v: 2;
  /** The level being played (LEVELS in src/game/content/levels.ts). Unset in saves from before it existed: Arrival. */
  level?: LevelId;
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
   * Hours the trip from the border to the bus takes: the level's minTripTime, or more
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
  /**
   * The desk where each claim was first said, written down or not, so a card that
   * catches it can name where you said it (caughtLine() in src/game/engine.ts).
   * Unset in saves from before it existed.
   */
  saidAt?: Partial<Record<ClaimId, Checkpoint>>;
  /**
   * Facts that were the reason scrutiny rose, so they read as flagged on file
   * (factTier() in src/game/engine.ts). Unset in saves from before it existed.
   */
  flagged?: FactId[];
  /** The desk where each flagged fact was flagged, so the ending can name it. Unset in saves from before it existed. */
  flaggedAt?: Partial<Record<FactId, Checkpoint>>;
  /**
   * Claims a document or record has shown false (catchKind() 'disproof'), recorded
   * when the contradiction card is answered. Conflicting testimony and suspicion
   * never land here. Unset in saves from before it existed.
   */
  disproved?: ClaimId[];
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
  /** The desk of each check run so far (a wait screen), in order (relatedCard() in src/game/engine.ts). */
  checkedAt?: Checkpoint[];
  /**
   * Points resolved at a desk: a document answered them, or a contact confirmed
   * them. Each keeps the desk and how many facts were flagged then, because a
   * point stays resolved only until a new reason appears (pointVerified() in
   * src/game/engine.ts). Unset in saves from before it existed.
   */
  verified?: Partial<Record<Topic, VerifiedPoint>>;
  /**
   * Where the current desk started: the hours left and how long the log was, and
   * whether an officer has phoned your mother there, so the queue after it can follow what happened
   * there (queueMood() in src/game/engine.ts). Unset before the first desk and in
   * saves from before it existed.
   */
  deskStart?: { time: number; log: number; phoned?: boolean };
  /** How each desk went, by the index of the queue after it (QueueMood). Unset in saves from before it existed. */
  after?: Partial<Record<number, QueueMood>>;
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
  /** Only in the passport queue (canTurnBack()): you leave before the first desk, Turned back. */
  | { type: 'turnBack' }
  /** Only once the bus is out of reach (doomed()): the rest of the crossing plays out, Too late. */
  | { type: 'finish' };
