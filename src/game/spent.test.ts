// A document shown for one question leaves the other question it names with a row
// that says why, never "No matching document" while the player knows it is packed
// (dap.41). Arrival: the mother's letter shown for why you came reads "Already shown"
// at "Who will you stay with?". Departure: the hotel booking never answers the exit
// desk's stay question, because its three nights are what the question asks past.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { SAMPLE_FILES } from './carry';
import { consequence } from './consequence';
import { answerKey, choices, currentCard, legalActions, newRun, options } from './engine';
import type { Option, RunSetup } from './engine';
import { tryStep } from './play';
import type { CarriedFile, EvidenceId, RunState } from './types';

/** The text under an answer row, as consequence() renders it. */
const line = (o: Option) => consequence(o, 'enc.x.evidence', 'mother').parts.map((p) => t(p.key, p.vars as Record<string, string>)).join(' ');
/** The card's evidence row, as the player sees it. */
const evidenceRow = (s: RunState) => options(s).find((o) => o.approach.id === 'evidence')!;

/** Plays from `setup` with `picks` per card (an approach, or [approach, document]), else the first legal action, until `stop` is on screen. */
function playTo(setup: RunSetup, picks: Record<string, string | [string, EvidenceId]>, stop: string): RunState {
  let s = newRun(setup);
  for (let i = 0; i < 200 && !s.ending; i++) {
    const card = s.reaction ? null : currentCard(s);
    if (card?.id === stop) return s;
    const pick = card && picks[card.id];
    const [approach, doc] = Array.isArray(pick) ? pick : [pick, undefined];
    // Two documents that fit sit behind one "Show a document" row: open it, then pick the one named.
    const named = doc && legalActions(s).find((a) => a.type === 'choose' && a.approach === approach && a.card === doc);
    const next = !approach ? undefined : named || legalActions(s).find((a) => a.type === 'choose' && a.approach === approach);
    s = tryStep(s, next ?? legalActions(s).find((a) => a.type !== 'turnBack') ?? legalActions(s)[0]).state;
  }
  throw new Error(`never reached ${stop}`);
}

describe('Arrival: the mother\'s letter shown for "Why now?"', () => {
  const lena: RunSetup = { level: 'arrival', character: 'lena', loadout: ['motherLetter', 'employerLetter', 'returnTicket'], bulletin: 'customs', seed: 7 };
  const atHost = () => playTo(lena, { p_purpose: ['evidence', 'motherLetter'] }, 'p_host');

  it('leaves "Who will you stay with?" saying the letter was already shown, not "No matching document"', () => {
    const s = atHost();
    expect(s.used).toContain('motherLetter');
    const row = evidenceRow(s);
    expect(row.blocked).toBe('shown');
    expect(row.blockedDoc).toBe('motherLetter');
    expect(line(row)).toBe(`Already shown: ${t('ev.motherLetter.short')}`);
    expect(line(row)).not.toContain(t('ui.blocked.noCard'));
  });

  it('still asks the question, with the letter not offered a second time', () => {
    const s = atHost();
    expect(currentCard(s)?.id).toBe('p_host');
    expect(choices(s).some((o) => o.card === 'motherLetter')).toBe(false);
  });

  it('reads "No matching document" when nothing packed names the question', () => {
    const s = playTo({ ...lena, loadout: ['hospitalNote', 'employerLetter', 'returnTicket'] }, {}, 'p_host');
    const row = evidenceRow(s);
    expect(row.blocked).toBe('noCard');
    expect(row.blockedDoc).toBeUndefined();
    expect(line(row)).toBe(t('ui.blocked.noCard'));
  });
});

describe('Departure: the hotel booking and "It has been twelve days. Why?"', () => {
  const hotelFile: CarriedFile = { ...SAMPLE_FILES.mark, claims: ['familyVisit', 'hotelStay'], spent: ['hotel'] };
  const setup = (loadout: EvidenceId[]): RunSetup => ({ level: 'departure', character: 'mark', loadout, bulletin: 'customs', seed: 7, file: hotelFile });
  const atStay = (loadout: EvidenceId[]): RunState => ({ ...newRun(setup(loadout)), reaction: null, seen: ['d_entry', 'd_stayed', 'd_stay'], screen: { kind: 'encounter', id: 'd_stay' } });

  it('shown at "Where did you stay?", the booking leaves d_stay saying it does not answer, not "No matching document"', () => {
    const s = playTo(setup(['hotel', 'employerLetter', 'hospitalNote', 'deed']), { d_stayed: ['evidence', 'hotel'] }, 'd_stay');
    expect(s.used).toContain('hotel');
    const row = evidenceRow(s);
    expect(row.blocked).toBe('notFor');
    expect(row.blockedDoc).toBe('hotel');
    expect(line(row)).toBe('Not answered by your hotel booking');
    expect(line(row)).not.toContain(t('ui.blocked.noCard'));
  });

  it('is never offered at d_stay, so no answer reads "She reads the new date" over a three-night booking', () => {
    const s = atStay(['hotel', 'employerLetter', 'hospitalNote', 'deed']);
    expect(s.used).not.toContain('hotel');
    expect(choices(s).some((o) => o.card === 'hotel')).toBe(false);
    expect(evidenceRow(s).blocked).toBe('notFor');
  });

  it('still takes the return ticket, the document with a new date', () => {
    const s = atStay(['hotel', 'returnTicket', 'hospitalNote', 'deed']);
    const row = evidenceRow(s);
    expect(row.blocked).toBeNull();
    expect(row.card).toBe('returnTicket');
    expect(t(answerKey(s, 'evidence', 'reaction'))).toContain('new date');
  });

  it('still answers "Where did you stay?" with the booking', () => {
    const s: RunState = { ...newRun(setup(['hotel', 'employerLetter', 'hospitalNote', 'deed'])), reaction: null, seen: ['d_entry', 'd_stayed'], screen: { kind: 'encounter', id: 'd_stayed' } };
    expect(choices(s).some((o) => o.card === 'hotel' && !o.blocked)).toBe(true);
  });
});
