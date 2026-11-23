// The ending's follow-up line names the claim the follow-up card was about
// (border_crossing_game-azv.12). A challenge card is dealt for one pair (caught()), and
// the line names that claim, not the first earlier claim the card's condition could
// match. A claim a document made is the document, never words the player did not say.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ending } from '../App';
import { t } from '../i18n';
import { chains } from './consequence';
import { caught, currentCard, legalActions, newRun } from './engine';
import type { RunSetup } from './engine';
import { playStep } from './play';
import type { RunState } from './types';

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** Plays `setup` to its end with `picks` on their cards, the first answer that is not turning back elsewhere, noting the pair each challenge card was dealt for. */
function play(setup: RunSetup, picks: Record<string, string>): { end: RunState; dealt: Record<string, ReturnType<typeof caught>> } {
  let s = newRun(setup);
  const dealt: Record<string, ReturnType<typeof caught>> = {};
  for (let i = 0; i < 200 && !s.ending; i++) {
    const card = s.reaction ? undefined : currentCard(s)?.id;
    if (card && s.screen.kind === 'encounter' && !(card in dealt)) dealt[card] = caught(s, card);
    const acts = legalActions(s);
    const pick = card && picks[card];
    s = playStep(s, (pick && acts.find((x) => x.type === 'choose' && x.approach === pick)) || acts.find((x) => x.type !== 'turnBack') || acts[0]);
  }
  return { end: s, dealt };
}

const followUp = (s: RunState) => {
  const line = chains(s).find((c) => c.kind === 'followUp');
  if (!line) throw new Error('no follow-up line');
  return t(line.key, line.vars);
};
const ending = (s: RunState) => plain(renderToStaticMarkup(createElement(Ending, { s, onChoose: () => {}, onRetry: () => {}, onNext: () => {} })));

describe('the ending names the claim the follow-up card was about (azv.12)', () => {
  it('a liar run credits "Your file says otherwise" to the relatives claim it was dealt for, not the cash', () => {
    // Lena lies at every chance: a short trip, undecided where she stays, cash under the limit, no other relatives.
    const liar = { p_purpose: 'shortTrip', p_host: 'undecided', c_cash: 'under', i_family: 'deny' };
    const { end, dealt } = play({ level: 'arrival', character: 'lena', loadout: ['motherLetter', 'returnTicket', 'employerLetter'], bulletin: 'records', seed: 9 }, liar);
    expect(end.ending).toBeDefined();
    // The challenge was dealt for her denial, with the relative on file; she also said the cash was under the limit.
    expect(dealt.i_contradiction).toMatchObject({ claim: 'noOtherFamily', fact: 'relativeContact' });
    expect(end.claims).toContain('cashUnderLimit');
    expect(end.answers?.find((a) => a.card === 'i_contradiction')?.about).toEqual({ claim: 'noOtherFamily', fact: 'relativeContact' });

    const line = followUp(end);
    expect(line).toBe('"I have no other relatives here", said at the security interview, brought a follow-up there: "Your file says otherwise."');
    expect(ending(end)).toContain(line);
    expect(ending(end)).not.toContain("under the limit\", said at customs, brought a follow-up");
  });

  it('a claim the mother\'s letter made names the letter, not "My family needs me here"', () => {
    const { end } = play({ level: 'arrival', character: 'lena', loadout: ['motherLetter', 'hospitalNote', 'returnTicket'], bulletin: 'customs', seed: 0 }, { p_purpose: 'evidence' });
    const shown = end.answers?.[0];
    expect(shown).toMatchObject({ card: 'p_purpose', vars: { card: 'motherLetter' }, claimed: ['familyVisit'] });
    const line = followUp(end);
    expect(line).toBe('Mother\'s letter, shown at passport control, brought a follow-up there: "How long are you staying?"');
    expect(ending(end)).not.toContain(t('said.familyVisit'));
  });

  it('the same claim said aloud is quoted in her words', () => {
    const { end } = play({ level: 'arrival', character: 'lena', loadout: ['motherLetter', 'hospitalNote', 'returnTicket'], bulletin: 'customs', seed: 0 }, { p_purpose: 'family' });
    expect(followUp(end)).toBe('"My family needs me here", said at passport control, brought a follow-up there: "How long are you staying?"');
  });
});
