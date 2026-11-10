// Each desk spot-checks one claim you made before you leave it (spotCheck() in
// src/game/engine.ts). The dealer picks the claim; the file decides the result.

import { describe, expect, it } from 'vitest';
import { own, t } from '../i18n';
import { CHALLENGE_PAIRS, CONTRADICTIONS, INCONSISTENCIES } from './content/encounters';
import { SPOT_CHECK_HOURS } from './content/world';
import { newRun, spotCheckOf, step } from './engine';
import type { RunSetup } from './engine';
import type { Dealer } from './rng';
import { CHECKPOINTS, FACT_IDS } from './types';
import type { Action, Checkpoint, ClaimId, FactId, FactMap, RunState } from './types';

const CLAIMS: ClaimId[] = ['familyVisit', 'shortTrip', 'hotelStay', 'noOtherFamily', 'neverDonated', 'stayingWithFamily', 'cashUnderLimit'];
const PAIRS = [...INCONSISTENCIES, ...CONTRADICTIONS];

/** Every fact that no challenge pairs against `c`: a file that fits the claim, as full as it can be. */
const fitting = (c: ClaimId): FactId[] => FACT_IDS.filter((f) => !PAIRS.some(([claim, fact]) => claim === c && fact === f));
const at = (desk: Checkpoint, facts: FactId[]): FactMap => Object.fromEntries(facts.map((f) => [f, [desk]]));

const lena: RunSetup = { character: 'lena', loadout: ['deed', 'hotel', 'motherLetter'], bulletin: 'customs', seed: 3 };

/**
 * The last card at `desk` with one answer that costs nothing but a document, so
 * the step after it is the spot-check and anything it spends is the spot-check's.
 */
const LAST_CARD: Record<Checkpoint, { id: string; answer: string }> = {
  passport: { id: 'p_photo', answer: 'evidence' },
  customs: { id: 'c_pen', answer: 'yes' },
  interview: { id: 'i_water', answer: 'drink' },
};

/** Leaving `desk` with `claims` on file there (written down) and `facts` known there. */
function leaving(desk: Checkpoint, claims: ClaimId[], facts: FactId[], extra: Partial<RunState> = {}): RunState {
  const card = LAST_CARD[desk];
  return {
    ...newRun(lena),
    checkpoint: CHECKPOINTS.indexOf(desk), slot: 3, claims, facts: at(desk, facts),
    logged: Object.fromEntries(claims.map((c) => [c, [desk]])),
    screen: { kind: 'encounter', id: card.id }, seen: [card.id], ...extra,
  };
}

/** A dealer that always picks `index`, so the test names the claim checked. */
const picks = (index: number): Dealer => (rng) => ({ index, rng });
const choose = (desk: Checkpoint): Action => ({ type: 'choose', approach: LAST_CARD[desk].answer });

describe('spot-checks', () => {
  // The criterion: a claim that matches every fact on file never fires, at any desk.
  it.each(CHECKPOINTS.flatMap((d) => CLAIMS.map((c) => [d, c] as const)))(
    'at %s, "%s" with every fitting fact on file passes cleanly and costs nothing',
    (desk, c) => {
      const s = leaving(desk, [c], fitting(c));
      expect(spotCheckOf(s, c)).toEqual({ result: 'clear' });
      const n = step(s, choose(desk), picks(0));
      expect(n.spotChecked).toContain(desk);
      expect(n.time).toBe(s.time);
      expect(n.scrutiny).toBe(s.scrutiny);
      expect(n.pending).toEqual([]);
      expect(n.screen.kind === 'encounter' && n.screen.id in CHALLENGE_PAIRS).toBe(false);
      expect(n.reaction).toContainEqual({ key: 'spot.clear', vars: { claim: c, hours: String(SPOT_CHECK_HOURS) } });
    },
  );

  it('checks each desk once, with the claim the dealer picks', () => {
    const s = leaving('customs', ['familyVisit', 'shortTrip'], ['familyAddress']);
    // The first claim fits; the second, a tourist with the family address on file, does not.
    expect(step(s, choose('customs'), picks(0)).time).toBe(s.time);
    expect(step(s, choose('customs'), picks(1)).time).toBe(s.time - SPOT_CHECK_HOURS);
    const caught = step({ ...s, claims: ['shortTrip'] }, choose('customs'), picks(0));
    expect(caught.screen).toEqual({ kind: 'encounter', id: 'i_clarify' });
    expect(caught.spotChecked).toEqual(['customs']);
    // Answering the challenge moves on: the desk does not check again.
    const after = step(step(caught, { type: 'ack' }), { type: 'choose', approach: 'accept' }, picks(0));
    expect(after.screen).toEqual({ kind: 'between', next: 2 });
    expect(after.reaction?.some((l) => l.key.startsWith('spot.'))).toBe(false);
  });

  it('a flaw deals the challenge card here, a disproof before an inconsistency', () => {
    // A hotel stay: odd next to the family address, disproved by your mother's account.
    const s = leaving('customs', ['hotelStay'], ['familyAddress', 'hostStatement']);
    expect(spotCheckOf(s, 'hotelStay')).toEqual({ result: 'flaw', card: 'i_contradiction' });
    const n = step(s, choose('customs'), picks(0));
    expect(n.screen).toEqual({ kind: 'encounter', id: 'i_contradiction' });
    expect(n.time).toBe(s.time);
    expect(n.reaction).toContainEqual({ key: 'spot.flaw', vars: { claim: 'hotelStay', hours: String(SPOT_CHECK_HOURS) } });
  });

  it('an inconsistency you have since explained clears after the check, which takes its hours', () => {
    const s = leaving('customs', ['shortTrip', 'familyVisit'], ['familyAddress']);
    expect(spotCheckOf(s, 'shortTrip')).toEqual({ result: 'explained' });
    const n = step(s, choose('customs'), picks(0));
    expect(n.time).toBe(s.time - SPOT_CHECK_HOURS);
    expect(n.screen).toEqual({ kind: 'between', next: 2 });
  });

  it('a flaw whose challenge was already answered costs nothing more', () => {
    const s = leaving('interview', ['shortTrip'], ['noBooking'], { seen: ['i_water', 'i_clarify'] });
    expect(spotCheckOf(s, 'shortTrip')).toEqual({ result: 'answered' });
    const n = step(s, choose('interview'), picks(0));
    expect(n.time).toBe(s.time);
    expect(n.ending).toBe('homeInTime');
  });

  it('reads only what this desk knows: a fact at another desk is not a flaw', () => {
    const s = leaving('customs', ['shortTrip'], []);
    expect(spotCheckOf({ ...s, facts: { familyAddress: ['passport'] } }, 'shortTrip')).toEqual({ result: 'clear' });
  });

  it('a run with no claims yet is not checked and draws nothing', () => {
    let drew = 0;
    const counting: Dealer = (rng) => { drew++; return { index: 0, rng }; };
    const n = step(leaving('passport', [], []), choose('passport'), counting);
    expect(drew).toBe(0);
    expect(n.spotChecked).toEqual(['passport']);
  });

  it('checks only claims on file: one said aloud to an officer who does not write it down is never picked', () => {
    // Both claims would be a flaw here; only the hotel stay was written down.
    const s = leaving('customs', ['shortTrip', 'hotelStay'], ['familyAddress', 'hostStatement'], { logged: { hotelStay: ['passport'] } });
    const checked = step(s, choose('customs'), picks(0));
    expect(checked.reaction).toContainEqual({ key: 'spot.flaw', vars: { claim: 'hotelStay', hours: String(SPOT_CHECK_HOURS) } });
    // Nothing written down: no claim to check, and the dealer is not asked.
    let drew = 0;
    const counting: Dealer = (rng) => { drew++; return { index: 0, rng }; };
    const n = step({ ...s, logged: {} }, choose('customs'), counting);
    expect(drew).toBe(0);
    expect(n.reaction?.some((l) => l.key.startsWith('spot.'))).toBe(false);
  });

  it('stops after a secondary inspection, which has read the whole file', () => {
    const n = step(leaving('customs', ['shortTrip'], ['familyAddress'], { inspections: 1 }), choose('customs'), picks(0));
    expect(n.screen).toEqual({ kind: 'between', next: 2 });
    expect(n.reaction?.some((l) => l.key.startsWith('spot.'))).toBe(false);
  });

  // 2op.4: a spot-check that fires quotes your words, the desk and the fact, in 30 words or fewer.
  it.each(INCONSISTENCIES.flatMap(([c, f]) => CHECKPOINTS.map((said) => [c, f, said] as const)))(
    'an explained "%s" against %s (said at %s) quotes your words, the desk and the fact',
    (c, f, said) => {
      const s = leaving('interview', [c, 'familyVisit'], [f], { saidAt: { [c]: said } });
      const n = step(s, choose('interview'), picks(0));
      const line = n.reaction?.find((l) => l.key === 'spot.explained');
      expect(line).toBeDefined();
      const text = t(line!.key, line!.vars);
      for (const who of ['lena', 'mark']) expect(own(`said.${c}`, who)).toBe(`said.${c}`);
      expect(text).toContain(`"${t(`said.${c}`)}"`);
      expect(text).toContain(`(${t(`checkpoint.${said}`)})`);
      expect(text).toContain(t(`fact.${f}`));
      expect(text).toContain(`${SPOT_CHECK_HOURS} hours`);
      expect(text).not.toMatch(/[{}—]/);
      expect(text.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(30);
    },
  );

  // 2op.9: the line names the claim in the traveler's own words, so Mark's denial
  // reads claim.noOtherFamily.mark ("No family across the border"), not Lena's.
  it.each((['lena', 'mark'] as const).flatMap((who) => CLAIMS.map((c) => [who, c] as const)))(
    'for %s, a spot-check of "%s" shows that traveler\'s own claim wording',
    (who, c) => {
      const s = { ...leaving('customs', [c], fitting(c)), character: who };
      const line = step(s, choose('customs'), picks(0)).reaction?.find((l) => l.key === 'spot.clear');
      expect(line).toBeDefined();
      const text = t(line!.key, line!.vars);
      expect(text).toContain(`"${t(own(`claim.${c}`, who))}"`);
    },
  );

  it('Mark hears his own denial, not Lena\'s', () => {
    const s = { ...leaving('customs', ['noOtherFamily'], fitting('noOtherFamily')), character: 'mark' as const };
    const line = step(s, choose('customs'), picks(0)).reaction?.find((l) => l.key.startsWith('spot.'));
    expect(line?.vars?.claim).toBe('noOtherFamily.mark');
    const text = t(line!.key, line!.vars);
    expect(text).toContain(`"${t('claim.noOtherFamily.mark')}"`);
    expect(text).not.toContain(t('claim.noOtherFamily'));
  });

  it('every result has text, with no dash', () => {
    for (const r of ['clear', 'flaw', 'answered', 'explained']) {
      const line = t(`spot.${r}`, { claim: 'shortTrip', said: 'shortTrip', desk: 'passport', fact: 'familyAddress', hours: '2' });
      expect(line).not.toMatch(/[{}—]/);
    }
  });
});
