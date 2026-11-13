// A clarify or contradiction card quotes what you said, the desk where you said
// it and the fact that catches it (caughtLine() in src/game/consequence.ts).

import { describe, expect, it } from 'vitest';
import { own, t } from '../i18n';
import { playRun, setupFor } from './bots';
import { caughtLine } from './consequence';
import { CHALLENGE_PAIRS, ENCOUNTERS, INCONSISTENCIES } from './content/encounters';
import { EVIDENCE } from './content/world';
import { answerKey, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import { transcriptOf } from './transcript';
import { CHECKPOINTS } from './types';
import type { CharacterId, Checkpoint, ClaimId, FactId, RunState } from './types';

const lena: RunSetup = { character: 'lena', loadout: ['deed', 'hotel', 'motherLetter'], bulletin: 'customs', seed: 3 };
const CARDS = Object.keys(CHALLENGE_PAIRS) as (keyof typeof CHALLENGE_PAIRS)[];
const TRAVELERS: CharacterId[] = ['lena', 'mark'];
const MAX_WORDS = 30;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** At the interview with `card` showing, `claim` said at `desk` and `fact` on file here. */
function facing(card: string, claim: ClaimId, fact: FactId, desk: Checkpoint, character: CharacterId): RunState {
  return {
    ...newRun(lena),
    character,
    checkpoint: 2, slot: 2, claims: [claim], saidAt: { [claim]: desk }, facts: { [fact]: ['interview'] },
    seen: [card], screen: { kind: 'encounter', id: card },
  };
}

/** An answer label as the player said it, without its quotes and closing full stop. */
const unquoted = (label: string) => label.replace(/^"|"$/g, '').replace(/\.$/, '');

describe('a caught claim quotes your own words next to the fact', () => {
  const cases = CARDS.flatMap((card) => CHALLENGE_PAIRS[card].flatMap(([claim, fact]) =>
    TRAVELERS.flatMap((who) => CHECKPOINTS.map((desk) => [card, claim, fact, who, desk] as const))));

  it.each(cases)('%s for "%s" against %s (%s, said at %s)', (card, claim, fact, who, desk) => {
    const s = facing(card, claim, fact, desk, who);
    const line = caughtLine(s, card);
    expect(line).toBeDefined();
    const text = t(line!.key, line!.vars);
    // The earlier answer in quotes, in this traveler's own wording.
    expect(text).toContain(`"${t(own(`said.${claim}`, who))}"`);
    expect(text).toContain(t(`checkpoint.${desk}`));
    expect(text).toContain(t(`fact.${fact}`));
    expect(text).not.toMatch(/[{}—]/);
    // The whole card above the answers, question and line, in 30 words or fewer.
    const question = t(own(`enc.${card}.q`, who));
    expect(words(`${question} ${text}`)).toBeLessThanOrEqual(MAX_WORDS);
  });

  it('Mark denies family across the border, Lena relatives here', () => {
    const mark = caughtLine(facing('i_contradiction', 'noFamilyAbroad', 'brotherAbroad', 'interview', 'mark'), 'i_contradiction')!;
    const lena = caughtLine(facing('i_contradiction', 'noOtherFamily', 'relativeContact', 'interview', 'lena'), 'i_contradiction')!;
    expect(t(mark.key, mark.vars)).toContain('"No family across the border"');
    expect(t(lena.key, lena.vars)).toContain('"I have no other relatives here"');
  });

  it('the quoted words are the answer that made the claim', () => {
    for (const e of ENCOUNTERS)
      for (const a of e.approaches)
        for (const eff of a.effects) {
          if (!('claim' in eff)) continue;
          const claim = eff.claim;
          if (!CARDS.some((c) => CHALLENGE_PAIRS[c].some(([x]) => x === claim))) continue;
          // A claim one traveler makes (Mark's noFamilyAbroad, Lena's noOtherFamily) is checked for that traveler only.
          const makes = (who: string) => eff.when?.character === undefined ? eff.when?.not?.character !== who : eff.when.character === who;
          for (const who of TRAVELERS.filter(makes)) {
            const label = own(`enc.${e.id}.${a.id}.label`, who);
            expect(t(own(`said.${claim}`, who)), `${e.id}.${a.id} for ${who}`).toBe(unquoted(t(label)));
          }
        }
    // A hotel stay is claimed by showing the booking, so its words say that.
    expect(EVIDENCE.hotel.onUse).toContainEqual(expect.objectContaining({ claim: 'hotelStay' }));
    expect(t('said.hotelStay')).toMatch(/hotel booking/);
  });

  it('names the desk where you said it, not the one catching it', () => {
    // A tourist at passport control, with no booking to show at the interview.
    let s: RunState = { ...newRun(lena), screen: { kind: 'encounter', id: 'p_purpose' }, seen: ['p_purpose'], slot: 1 };
    s = step(s, { type: 'choose', approach: 'shortTrip' });
    expect(s.saidAt).toEqual({ shortTrip: 'passport' });
    const later: RunState = { ...s, reaction: null, checkpoint: 2, facts: { noBooking: ['interview'] }, screen: { kind: 'encounter', id: 'i_clarify' } };
    const line = caughtLine(later, 'i_clarify')!;
    expect(t(line.key, line.vars)).toBe('You said: "No reason, a short trip" (Passport control). Confirmed: No booking to show.');
    // An old save without saidAt names the desk that wrote it down, else this one.
    expect(caughtLine({ ...later, saidAt: undefined, logged: {} }, 'i_clarify')!.vars.desk).toBe('interview');
    expect(caughtLine({ ...later, saidAt: undefined, logged: { shortTrip: ['customs'] } }, 'i_clarify')!.vars.desk).toBe('customs');
  });

  it('only a challenge card has the line', () => {
    const s = facing('i_family', 'shortTrip', 'noBooking', 'passport', 'lena');
    expect(caughtLine(s, 'i_family')).toBeUndefined();
    expect(caughtLine(s, 'i_contradiction')).toBeUndefined();
  });

  it('every challenge card the bots meet shows the line right under its question', () => {
    let met = 0;
    for (const style of ['liar', 'random'] as const)
      for (let i = 0; i < 120; i++) {
        const setup = setupFor(i);
        const tr = transcriptOf(playRun(style, setup), setup);
        tr.lines.forEach((l, at) => {
          if (!CARDS.some((c) => l.key === `enc.${c}.q` || l.key.startsWith(`enc.${c}.`) && l.key.endsWith('.q'))) return;
          met++;
          const next = tr.lines[at + 1];
          expect(next?.key, `${style} seed ${setup.seed} step ${l.step}`).toMatch(/^caught\.line\.(recorded|confirmed|flagged)$/);
          expect(next?.problem).toBeUndefined();
        });
      }
    expect(met).toBeGreaterThan(0);
  });
});

describe('the clarify answers fit the pair that dealt the card', () => {
  // What each pair is about: the claim the accept answer stands by, and the fact
  // its reaction names. A shortTrip answer to a hotel booking names the wrong claim.
  const FIT: Record<string, { claim: RegExp; fact: RegExp }> = {
    'shortTrip.familyAddress': { claim: /short trip/, fact: /family's address/ },
    'shortTrip.fatherCondition': { claim: /short trip/, fact: /father's condition/ },
    'shortTrip.noBooking': { claim: /short trip/, fact: /no booking/ },
    'hotelStay.familyAddress': { claim: /hotel/, fact: /family's address/ },
  };
  const CLAIM_WORDS = /short trip|hotel/;
  const FACT_WORDS = /family's address|father's condition|no booking/;
  const pairs = INCONSISTENCIES.flatMap(([claim, fact]) => TRAVELERS.map((who) => [claim, fact, who] as const));

  it('has a wording for every pair', () => {
    expect(Object.keys(FIT).sort()).toEqual(INCONSISTENCIES.map(([c, f]) => `${c}.${f}`).sort());
  });

  it.each(pairs)('i_clarify for "%s" against %s (%s)', (claim, fact, who) => {
    const s = facing('i_clarify', claim, fact, 'passport', who);
    const fit = FIT[`${claim}.${fact}`];
    const opts = options(s).filter((o) => !o.blocked);
    expect(opts.map((o) => o.approach.id)).toEqual(['clarify', 'evidence', 'accept']);
    for (const o of opts) {
      const vars: Record<string, string> = {};
      if (o.card) vars.card = vars.cardThe = o.card;
      const label = t(answerKey(s, o.approach.id, 'label'), vars);
      // The reaction as the engine says it after the answer.
      const said = step(s, { type: 'choose', approach: o.approach.id }).reaction![0];
      expect(said.key).toBe(answerKey(s, o.approach.id, 'reaction'));
      const reaction = t(said.key, said.vars);
      for (const text of [label, reaction]) expect(text).not.toMatch(/[{}—]/);
      if (o.approach.id === 'accept') {
        // Standing by what you said: the label repeats the claim, the officer names the fact.
        expect(label).toMatch(fit.claim);
        expect(label.replace(fit.claim, '')).not.toMatch(CLAIM_WORDS);
        expect(reaction).toMatch(fit.fact);
        expect(reaction.replace(fit.fact, '')).not.toMatch(FACT_WORDS);
      } else {
        // A new story or a document: neither names a claim or a fact, so each fits every pair.
        expect(label).not.toMatch(CLAIM_WORDS);
        expect(reaction).not.toMatch(CLAIM_WORDS);
        expect(reaction).not.toMatch(FACT_WORDS);
      }
      expect(words(`${label} ${reaction}`)).toBeLessThanOrEqual(MAX_WORDS);
    }
  });
});
