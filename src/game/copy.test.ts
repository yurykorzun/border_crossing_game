// The realism review of Arrival's text (border_crossing_game-4qd.1): each line
// it found untrue or unclear is replaced, the buttons say what they do, and a
// time cost names what the hours are spent on.

import { describe, expect, it } from 'vitest';
import enSource from '../i18n/en.ts?raw';
import { has, t, tn } from '../i18n';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { CHARACTERS, EVIDENCE } from './content/world';
import { consequence, consequences, eventKey } from './consequence';
import { deskOf, factIds, newRun, noCost, options, step } from './engine';
import type { RunSetup } from './engine';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { hoursOf } from './lint';
import type { Approach, RunState } from './types';

const at = (s: RunState, id: string, extra: Partial<RunState> = {}): RunState => ({
  ...s, reaction: null, screen: { kind: 'encounter', id }, seen: [...s.seen, id], ...extra,
});

/** Every answer on every card, with the key its text lives under. */
const answers: { key: string; a: Approach }[] = [
  ...ENCOUNTERS.flatMap((e) => e.approaches.map((a) => ({ key: `enc.${e.id}.${a.id}`, a }))),
  ...INSPECTIONS.flatMap((i) => i.approaches.map((a) => ({ key: `insp.${i.id}.${a.id}`, a }))),
];

describe('the return ticket answers length of stay, not cash', () => {
  const lena: RunSetup = { character: 'lena', loadout: ['returnTicket', 'employerLetter', 'deed'], bulletin: 'records', seed: 7 };

  it('settles the stay question and no longer settles or answers cash', () => {
    expect(EVIDENCE.returnTicket.settles).toEqual(['stay']);
    expect(EVIDENCE.returnTicket.topics).not.toContain('money');
    expect(ENCOUNTERS.find((e) => e.id === 'p_stay')!.topic).toBe('stay');
  });

  it('shown for how long you stay, it costs nothing and the departure date stays off file', () => {
    const s = at(newRun(lena), 'p_stay', { slot: 2 });
    const o = options(s).find((x) => x.approach.id === 'evidence')!;
    expect(o.card).toBe('returnTicket');
    expect(noCost(s, o)).toBe(true);
    const next = step(s, { type: 'choose', approach: 'evidence' });
    expect(next.used).toEqual(['returnTicket']);
    expect(factIds(next)).not.toContain('departureDate');
  });

  it('asked about cash, the employer letter answers instead, and puts the employer on file', () => {
    const s = at(newRun(lena), 'c_cash', { checkpoint: 1, slot: 2 });
    const o = options(s).find((x) => x.approach.id === 'evidence')!;
    expect(o.card).toBe('employerLetter');
    expect(noCost(s, o)).toBe(false);
    expect(t('enc.c_cash.q')).toMatch(/cash/);
  });
});

describe('the realism review lines in src/i18n/en.ts', () => {
  const replacements = [
    'Medicines require supporting paperwork today.',
    'The organisation is now on the list. Write down why you sent the money.',
    'You sign the receipt. They keep the medicine.',
    'who else lives there',
    'Tom is contacted for questioning',
    'Your employer is registered abroad. What exactly do you do for them?',
    'You said you never donated. This payment carries your name.',
    'Your brother lives across the border. When did you last speak?',
    'The officer does not answer. He calls a supervisor.',
    // The quiet observation lines stay.
    'Someone else gets their passport back.',
    'Your passport goes into a different tray.',
    'Your phone buzzes in the tray. You cannot reach it.',
  ];
  const replaced = [
    'Medicine and cash are checked today.',
    'Officers are testing medicine',
    'purpose is not your concern',
    'You sign a form you cannot read.',
    'She gives her address and names the rest of the family.',
    'Your company has an office in a hostile state. Do you report to it?',
    'A printout of the payment appears with your card number on it.',
    'The officer lets you sit until you answer.',
    'How are you paying for this trip?',
    'It matches what is on your file. She lets you through.',
    'Answers length of stay and money',
  ];

  it('has each replacement line and none of the lines it replaced', () => {
    expect(replacements.filter((line) => !enSource.includes(line))).toEqual([]);
    expect(replaced.filter((line) => enSource.includes(line))).toEqual([]);
  });

  it('gives cash its own warning on a customs day, apart from the medicine one', () => {
    expect(t('bulletin.customs')).not.toMatch(/cash/i);
    expect(t('bulletin.customs.also')).toMatch(/cash/i);
  });

  it("states the reason for Tom's consequence: a flagged record on file, or questioning", () => {
    const mark = newRun({ character: 'mark', loadout: ['motherLetter', 'hotel', 'deed', 'hospitalNote'], bulletin: 'customs', seed: 3 });
    const line = (s: RunState) => consequences(s).find((l) => l.vars?.contact === 'brother')!;
    const questioned = line({ ...mark, exposed: ['brother'] });
    expect(questioned.key).toBe('exposure.brother.protected');
    expect(t(`${questioned.key}.title`)).toBe('Tom is contacted for questioning');
    // On file but never flagged (a phone search found him): questioned, not listed.
    expect(line({ ...mark, exposed: ['brother'], facts: { brotherAbroad: ['customs'] } }).key).toBe('exposure.brother.protected');
    const listed = line({ ...mark, exposed: ['brother'], facts: { brotherAbroad: ['interview'] }, flagged: ['brotherAbroad'] });
    expect(listed.key).toBe('exposure.brother.protected.record');
    expect(t(listed.key)).toMatch(/flagged record/);
  });
});

describe('every button says what its answer does', () => {
  /** A refusal: you decline to answer or to be searched, or you walk away. */
  const refuses = (a: Approach) => a.kind === 'withdraw' || a.effects.some((e) => 'fact' in e && e.fact === 'phoneRefused');

  it('maps each label to its kind of answer, so an "Ask" label never refuses', () => {
    const wrong: string[] = [];
    for (const { key, a } of answers) {
      const label = t(`${key}.label`, { cardThe: 'deed', contact: 'mother', contactMine: 'cousin' });
      const raw = t(`${key}.label`);
      const asks = /^Ask\b/.test(label) || /\?"?$/.test(label);
      if (asks && (refuses(a) || (a.kind !== 'verify' && a.kind !== 'contact'))) wrong.push(`${key}: "${label}" asks, but is a ${a.kind}${refuses(a) ? ' refusal' : ''}`);
      if (asks && /until you answer/i.test(t(`${key}.reaction`, { contact: 'mother' }))) wrong.push(`${key}: "${label}" asks, but the reaction treats it as not answering`);
      if (a.kind === 'evidence' && !raw.includes('{cardThe}')) wrong.push(`${key}: shows a document, but "${raw}" does not name it`);
      if (a.kind === 'contact' && !/\{contact(Mine)?\}/.test(raw)) wrong.push(`${key}: names someone, but "${raw}" does not say who`);
      if (a.kind === 'withdraw' && !/^Withdraw\b/.test(label)) wrong.push(`${key}: ends the crossing, but "${label}" does not say so`);
      if (a.kind !== 'withdraw' && /^Withdraw\b/.test(label)) wrong.push(`${key}: "${label}" says withdraw, but is a ${a.kind}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('a time cost names what the hours are spent on', () => {
  // The hours each answer cost before its event was named, so naming it moved no balance.
  const HOURS_BEFORE: Record<string, { always: number; most: number }> = {
    'enc.p_purpose.family': { always: 1, most: 1 },
    'enc.p_photo.scan': { always: 1, most: 2 },
    'enc.p_photo.questions': { always: 2, most: 3 },
    'enc.p_secondPassport.handOver': { always: 1, most: 2 },
    'enc.p_employer.check': { always: 1, most: 1 },
    'enc.c_medicine.declare': { always: 1, most: 2 },
    'enc.c_cash.count': { always: 1, most: 1 },
    'enc.c_shortTrip.admit': { always: 1, most: 1 },
    'enc.c_host.call': { always: 1, most: 1 },
    'enc.c_phone.unlock': { always: 1, most: 1 },
    'enc.c_phone.refuse': { always: 1, most: 1 },
    'enc.i_family.why': { always: 1, most: 1 },
    'enc.i_clarify.clarify': { always: 1, most: 1 },
    'enc.i_contradiction.review': { always: 3, most: 3 },
    'enc.i_employer.contract': { always: 2, most: 2 },
    'enc.i_brother.calls': { always: 2, most: 2 },
    'enc.f_host.again': { always: 1, most: 1 },
    'enc.f_lab.wait': { always: 2, most: 2 },
    'enc.f_donation.lawyer': { always: 3, most: 3 },
    'enc.f_photo.law': { always: 2, most: 2 },
    'insp.s_bag.wait': { always: 3, most: 3 },
    'insp.s_bag.contact': { always: 0, most: 1 },
    'insp.s_medicine.wait': { always: 3, most: 3 },
    'insp.s_supervisor.contact': { always: 0, most: 1 },
    'insp.s_supervisor.accept': { always: 0, most: 1 },
    // New with the stay question (p_stay), so it has no earlier price.
    'enc.p_stay.unsure': { always: 1, most: 1 },
    'enc.p_stay.father': { always: 0, most: 2 },
  };

  it('every answer that costs time has a non-empty event text, at the same hours as before', () => {
    const timed = answers.filter(({ a }) => hoursOf(a.effects).most > 0);
    // + 0 turns the -0 of an answer with only conditional hours into 0.
    const hours = (a: Approach) => ({ always: hoursOf(a.effects).always + 0, most: hoursOf(a.effects).most + 0 });
    expect(Object.fromEntries(timed.map(({ key, a }) => [key, hours(a)]))).toEqual(HOURS_BEFORE);
    for (const { key } of timed) {
      expect(has(`${key}.event`), key).toBe(true);
      expect(t(`${key}.event`).trim(), key).not.toBe('');
      expect(t(`${key}.event`), key).not.toMatch(/\b(hours?|minutes?)\b|\{\w+\}/i);
    }
  });

  it('every option that costs time in a played run shows its event on the answer line', () => {
    const seen = new Set<string>();
    for (const style of BOT_STYLES) {
      for (let i = 0; i < 40; i++) {
        const setup = setupFor(i);
        const run = playRun(style, setup);
        let s = newRun(setup);
        for (const action of run.actions) {
          const card = s.screen.kind === 'encounter' ? `enc.${s.screen.id}` : s.screen.kind === 'inspection' ? `insp.${s.screen.id}` : undefined;
          if (card && !s.reaction) {
            for (const o of options(s)) {
              const hours = -o.effects.reduce((n, e) => n + ('time' in e ? e.time : 0), 0);
              if (hours <= 0 || o.blocked) continue;
              const cardKey = `${card}.${o.approach.id}`;
              const part = consequence(o, cardKey, CHARACTERS[s.character].protectedContact, deskOf(s)).parts.find((p) => p.kind === 'time');
              expect(part, cardKey).toBeDefined();
              expect(part!.vars?.event, cardKey).toBe(eventKey(o, cardKey));
              const text = tn(part!.key, part!.n!, part!.vars);
              expect(text, cardKey).toMatch(/^\S.*: \d+ hours?$/);
              expect(text.startsWith(':'), cardKey).toBe(false);
              seen.add(cardKey);
            }
          }
          s = step(s, action);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(10);
  });

});
