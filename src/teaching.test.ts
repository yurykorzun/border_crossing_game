// Arrival teaches both sides on one run (border_crossing_game-dap.18): preparation helps
// and information has consequences. One fixed run, Lena on a customs day with the hospital
// note, her return ticket and her employer letter, shows the five steps in order:
// 1. at passport the hospital note answers why she came (and the prescription with it),
// 2. her file shows the note spent and her father's condition on file, passed to customs,
// 3. customs takes the prescription as checked, and the lab hours are saved,
// 4. the employer letter she shows for her cash puts her employer on file, and customs
//    follows up with a phone search because of it,
// 5. the ending names both: the hours saved and the follow-up.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Ending } from './App';
import { EvidenceContent, StoryRecords } from './ui/parts';
import { chains, changeText, questionKey } from './game/consequence';
import { ENCOUNTER_BY_ID } from './game/content/encounters';
import { answerKey, currentCard, deskOf, legalActions, newRun } from './game/engine';
import type { RunSetup } from './game/engine';
import { playStep } from './game/play';
import type { RunState } from './game/types';
import { t, tn } from './i18n';

const lena: RunSetup = { level: 'arrival', character: 'lena', loadout: ['hospitalNote', 'returnTicket', 'employerLetter'], bulletin: 'customs', seed: 7 };
/** Her answer on each card; any other card takes the first answer that is not turning back. */
const PICKS: Record<string, string> = {
  p_purpose: 'evidence', p_host: 'mother', p_stay: 'evidence', c_medicine: 'declare', c_cash: 'evidence', c_phone: 'unlock', i_family: 'why', i_employer: 'perk',
};

const plain = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const hoursOf = (o: { effects: { time?: number }[] } | undefined) =>
  (o?.effects ?? []).reduce((h, e) => h + ('time' in e && e.time! < 0 ? -e.time! : 0), 0);

/** Each state the run passes through, with the card it answered there, played the way the game moves a run. */
function play(): { states: RunState[]; cards: (string | undefined)[] } {
  let s = newRun(lena);
  const states = [s];
  const cards: (string | undefined)[] = [undefined];
  for (let i = 0; i < 200 && !s.ending; i++) {
    const card = s.reaction ? undefined : currentCard(s)?.id;
    const acts = legalActions(s);
    const pick = card && PICKS[card];
    const a = (pick && acts.find((x) => x.type === 'choose' && x.approach === pick)) || acts.find((x) => x.type !== 'turnBack') || acts[0];
    s = playStep(s, a);
    states.push(s);
    cards.push(card);
  }
  return { states, cards };
}

describe('one Arrival run teaches that preparation helps and information has consequences', () => {
  const { states, cards } = play();
  const end = states[states.length - 1];
  /** The step at which `card` was answered, and the states either side of it. */
  const answer = (card: string) => {
    const i = cards.indexOf(card);
    if (i < 0) throw new Error(`${card} was never answered`);
    return { i, before: states[i - 1], after: states[i] };
  };

  it('finds all five steps in order', () => {
    // 1. A document resolves a question: the hospital note at passport settles why she came, and the prescription with it.
    const shown = answer('p_purpose');
    expect(deskOf(shown.before)).toBe('passport');
    expect(shown.after.answers?.at(-1)).toMatchObject({ desk: 'passport', used: ['hospitalNote'], settled: expect.arrayContaining(['purpose', 'medicine']) });
    const lines = (shown.after.changes ?? []).map(changeText).join(' ');
    expect(lines).toContain(t('resolve.used.purpose', { cardLabel: 'hospitalNote' }));
    expect(lines).toContain(t('resolve.medicine'));

    // 2. The file shows the copy spent and the fact recorded, passed on to customs.
    const file = shown.after;
    const documents = plain(renderToStaticMarkup(createElement(EvidenceContent, { s: file })));
    expect(documents).toContain(`${t('ev.hospitalNote.name')} ${t('ui.used')}`);
    expect(file.facts.fatherCondition).toEqual(['passport', 'customs']);
    const records = plain(renderToStaticMarkup(createElement(StoryRecords, { s: file })));
    expect(records).toContain(t('fact.fatherCondition'));
    expect(records).toContain(tn('ui.haveOnFile', 2, { desks: `${t('checkpoint.passport')} ${t('ui.and')} ${t('checkpoint.customs')}` }));

    // 3. A later desk accepts that verification and she saves time: customs reads the
    // prescription off her file, where the plain declaration costs 2 hours on a customs day.
    const customs = answer('c_medicine');
    expect(deskOf(customs.before)).toBe('customs');
    expect(answerKey(customs.before, 'declare', 'label')).toBe('enc.c_medicine.declare.verified.label');
    expect(customs.after.time).toBe(customs.before.time);
    expect(customs.after.screen.kind).not.toBe('wait');
    const plainDeclare = ENCOUNTER_BY_ID.get('c_medicine')!.approaches.find((a) => a.id === 'declare')!;
    expect(hoursOf({ effects: plainDeclare.effects.filter((e) => !e.when || e.when.bulletin === 'customs') })).toBe(2);
    expect(customs.after.answers?.at(-1)?.saved).toEqual({ hours: 2, from: 'passport', by: 'hospitalNote' });

    // 4. Another disclosure triggers a specific follow-up: the employer letter shown for her
    // cash puts her employer on file, and customs then asks to search her phone because of it.
    const cash = answer('c_cash');
    expect(cash.after.answers?.at(-1)).toMatchObject({ desk: 'customs', used: ['employerLetter'], recorded: expect.arrayContaining(['employer']) });
    const phone = answer('c_phone');
    expect(phone.i).toBeGreaterThan(cash.i);
    expect(deskOf(phone.before)).toBe('customs');
    expect(cash.before.facts.employer).toBeUndefined();
    expect(JSON.stringify(ENCOUNTER_BY_ID.get('c_phone')!.issue)).toContain('employer');
    const followUp = phone.after.answers?.at(-1);
    expect(followUp).toMatchObject({ card: 'c_phone', desk: 'customs' });
    expect(followUp!.hours).toBeGreaterThan(0);
    // With the cash counted instead, nothing on file sends customs to her phone.
    const count = legalActions(cash.before).find((x) => x.type === 'choose' && x.approach === 'count')!;
    let counted = playStep(cash.before, count);
    while (counted.reaction && !counted.ending) counted = playStep(counted, legalActions(counted)[0]);
    expect(counted.facts.employer).toBeUndefined();
    expect(currentCard(counted)?.id).not.toBe('c_phone');

    // 5. The ending names both chains: the hours saved at customs and the phone search the letter brought.
    expect(end.ending).toBeDefined();
    const linked = chains(end);
    expect(linked.map((c) => c.kind)).toEqual(['saved', 'followUp']);
    const saved = tn('ending.chain.saved', 2, { cardLabel: 'hospitalNote', deskAt: 'passport', desk: 'customs' });
    const question = t(questionKey(end, 'enc', 'c_phone'));
    const follow = t('ending.chain.followUp.fact.here', { fact: 'employer', deskAt: 'customs', question });
    const ending = plain(renderToStaticMarkup(createElement(Ending, { s: end, onChoose: () => {}, onRetry: () => {}, onNext: () => {} })));
    expect(ending).toContain(saved);
    expect(ending).toContain(follow);
    expect(ending).toContain(tn('ending.cost.hours', followUp!.hours));
    expect(saved).toBe('Hospital note from passport control counted at Customs: 2 hours saved.');
    expect(follow).toBe('Your employer, put on file at customs, brought a follow-up there: "Unlock your phone, please."');

    // In order: the note shown, the file, customs taking it, the letter and its follow-up, the ending.
    expect(shown.i).toBeLessThan(customs.i);
    expect(customs.i).toBeLessThan(cash.i);
    expect(phone.i).toBeLessThan(states.length - 1);
  });

  it('a run without the hospital note has no hours saved to name, and the lab costs its hours', () => {
    let s = newRun({ ...lena, loadout: ['motherLetter', 'returnTicket', 'employerLetter'] });
    for (let i = 0; i < 200 && !s.ending; i++) {
      const card = s.reaction ? undefined : currentCard(s)?.id;
      const acts = legalActions(s);
      const pick = card && PICKS[card];
      s = playStep(s, (pick && acts.find((x) => x.type === 'choose' && x.approach === pick)) || acts.find((x) => x.type !== 'turnBack') || acts[0]);
    }
    expect(chains(s).some((c) => c.kind === 'saved')).toBe(false);
    expect(s.answers?.find((a) => a.card === 'c_medicine')?.hours).toBeGreaterThanOrEqual(2);
  });
});
