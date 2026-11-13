// Departure (border_crossing_game-rwf.3): Level 2 opens with the traveler's file from
// Arrival (RunState.file). The desks ask about what the file holds, quote it back with
// its date, crossing, desk and question, and the exit desk can hold your passport over
// a claim the last crossing showed false.
import { describe, expect, it } from 'vitest';
import { own, setStory, t } from '../i18n';
import { playRun } from './bots';
import { defaultFile, fileOf, ownFile, recordRun, SAMPLE_FILES } from './carry';
import { fileLine, questionKey, questionVars, recordLines } from './consequence';
import { LEVELS } from './content/levels';
import { chooseAction, currentCard, endingText, legalActions, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import { scriptedDealer } from './play';
import { freshSave } from './save';
import type { BulletinId, CarriedFile, CharacterId, RunState } from './types';

const LOADOUT = { lena: ['deed', 'hotel', 'motherLetter'], mark: ['motherLetter', 'hospitalNote', 'returnTicket', 'deed'] } as const;

const setupOf = (character: CharacterId, file: CarriedFile, seed = 7, bulletin: BulletinId = 'records'): RunSetup =>
  ({ level: 'departure', character, loadout: [...LOADOUT[character]], bulletin, seed, file });

const dealer = scriptedDealer([]);

/** Plays a run: `picks` answers the cards it names, and every other screen takes its first legal action. */
function drive(setup: RunSetup, picks: Record<string, string> = {}): RunState {
  let s = newRun(setup);
  for (let i = 0; i < 200 && !s.ending; i++) {
    const card = s.reaction ? null : currentCard(s);
    const pick = card && picks[card.id];
    const answer = pick && options(s).find((o) => o.approach.id === pick && !o.blocked);
    const next = answer ? chooseAction(answer) : legalActions(s).find((a) => a.type !== 'turnBack') ?? legalActions(s)[0];
    s = step(s, next, dealer);
  }
  return s;
}

/** The cards a run showed, in order. */
const cardsSeen = (s: RunState) => s.seen;

const text = (l: { key: string; vars?: Record<string, string> } | undefined) => (l ? t(l.key, l.vars) : '');

describe('the first card at desk 1 names the claim your file holds', () => {
  it.each([['lena'], ['mark']] as const)('%s, sample file and default file', (who) => {
    setStory('departure');
    try {
      for (const file of [SAMPLE_FILES[who], defaultFile(1, who)]) {
        const s = newRun(setupOf(who, file));
        const first = drive(setupOf(who, file));
        expect(cardsSeen(first)[0]).toBe('d_entry');
        const claim = file.said!.find((c) => c.claim === 'familyVisit' || c.claim === 'shortTrip') ?? file.said![0];
        const line = text(fileLine({ ...s, seen: ['d_entry'], screen: { kind: 'encounter', id: 'd_entry' } }, 'd_entry'));
        // A claim a shown document made is quoted as the document, never as your words (dap.36).
        if (claim.shown) expect(line).toContain(t(`ev.${claim.shown}.the`));
        else expect(line).toContain(`"${t(own(`said.${claim.claim}`, who))}"`);
      }
    } finally {
      setStory(undefined);
    }
  });
});

describe('a file with a named contact makes a desk ask about that contact', () => {
  it('Mark named his brother, so the interview asks about his brother', () => {
    const file = SAMPLE_FILES.mark;
    expect(file.named).toContain('brother');
    const s = drive(setupOf('mark', file));
    expect(s.seen).toContain('d_named');
    const q = t(questionKey(s, 'enc', 'd_named'), questionVars(s, 'd_named'));
    expect(q).toContain('brother');
  });

  it('a file with no contact asks the plain question', () => {
    const s = newRun(setupOf('lena', SAMPLE_FILES.lena));
    expect(questionKey(s, 'enc', 'd_named')).toMatch(/unsaid/);
  });
});

describe('a carried claim keeps its date, crossing, desk and context, and the callback quotes them', () => {
  it('fileOf() keeps each claim with where and when it was said', () => {
    const arrival = playRun('honest', { level: 'arrival', character: 'mark', loadout: [...LOADOUT.mark], bulletin: 'records', seed: 4 }).final;
    const file = fileOf(arrival);
    expect(file.said!.length).toBeGreaterThan(0);
    for (const c of file.said!) {
      expect(c.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.crossing).toBe('arrival');
      expect(['passport', 'customs', 'interview']).toContain(c.desk);
      expect(c.context).toMatch(/^[a-z]_\w+$/);
    }
  });

  it('the callback at desk 1 quotes the crossing, date, desk, question and words', () => {
    const file = SAMPLE_FILES.mark;
    const c = file.said![0];
    const s = { ...newRun(setupOf('mark', file)), seen: ['d_entry'], screen: { kind: 'encounter', id: 'd_entry' } } as RunState;
    const line = text(fileLine(s, 'd_entry'));
    expect(line).toContain(t('level.arrival.title'));
    expect(line).toContain(t('checkpoint.' + c.desk));
    expect(line).toContain(t(`file.context.${c.context}`));
    expect(line).toContain(`"${t(own(`said.${c.claim}`, 'mark'))}"`);
    expect(line).toMatch(/\d{1,2} [A-Z][a-z]+/);
    expect(line).not.toMatch(/[{}—]/);
  });

  it('a longer stay than claimed asks for an explanation, and no answer to it ends the run', () => {
    for (const who of ['lena', 'mark'] as const) {
      for (const pick of ['father', 'stand', 'evidence']) {
        // With no disproved claim, so the hold does not take the desk's related card.
        const s = drive(setupOf(who, { ...SAMPLE_FILES[who], disproved: [] }, 7, 'customs'), { d_stay: pick });
        expect(s.seen).toContain('d_stay');
        const at = s.log.findIndex((l) => l.key.startsWith('enc.d_stay.'));
        expect(at).toBeGreaterThanOrEqual(0);
        // The run went on past the explanation to a later desk.
        expect(s.checkpoint, `${who} ${pick}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the kept customs declaration is the callback at customs', () => {
  it.each(['under', 'counted', 'shown', 'none'] as const)('declared %s', (declared) => {
    const file: CarriedFile = { ...SAMPLE_FILES.mark, declared };
    const s = { ...newRun(setupOf('mark', file)), checkpoint: 1, seen: ['d_declared'], screen: { kind: 'encounter', id: 'd_declared' } } as RunState;
    const line = fileLine(s, 'd_declared');
    expect(line?.key).toBe(`file.declared.${declared}`);
    expect(text(line)).toContain(t('level.arrival.title'));
  });

  it('customs asks about the declaration in a played run', () => {
    expect(drive(setupOf('mark', SAMPLE_FILES.mark), { d_hold: 'review' }).seen).toContain('d_declared');
  });
});

describe('the exit desk can hold your passport over a disproved claim', () => {
  it('Lena\'s file has a disproved claim: leaving without the passport ends the run turned back, free to go for now', () => {
    const s = drive(setupOf('lena', SAMPLE_FILES.lena), { d_hold: 'leave' });
    expect(s.seen).toContain('d_hold');
    expect(s.ending).toBe('turnedBack');
    expect(endingText(s)).toBe('held');
    expect(t('ending.held.title').toLowerCase()).toContain('free to go, for now');
    expect(t('ending.held.body')).toContain('free to go, for now');
  });

  it('a file with no disproved claim never deals the hold, over many seeds', () => {
    for (const who of ['lena', 'mark'] as const) {
      const file: CarriedFile = { ...SAMPLE_FILES[who], disproved: [] };
      for (let seed = 1; seed <= 30; seed++) {
        for (const style of ['honest', 'liar', 'cautious', 'random'] as const) {
          const s = playRun(style, setupOf(who, file, seed)).final;
          expect(s.seen, `${who} ${seed} ${style}`).not.toContain('d_hold');
          expect(endingText(s)).not.toBe('held');
        }
      }
    }
  });
});

describe('Departure opens with the record, and a standalone run leaves the saved file alone', () => {
  it('the record step lines recap the file', () => {
    const lines = recordLines(SAMPLE_FILES.lena).map(text);
    expect(lines[0]).toBe(t('ui.record.title'));
    expect(lines.join(' ')).toContain(t(own('said.shortTrip', 'lena')));
    expect(lines.join(' ')).toMatch(/did not match/);
  });

  it('only the traveler\'s own saved file is offered to continue', () => {
    const lena = fileOf(playRun('honest', { level: 'arrival', character: 'lena', loadout: [...LOADOUT.lena], bulletin: 'records', seed: 2 }).final);
    expect(ownFile(lena, 'lena')).toEqual(lena);
    expect(ownFile(lena, 'mark')).toBeNull();
    expect(ownFile(defaultFile(3, 'lena'), 'lena')).toBeNull();
  });

  it('a standalone run keeps the saved file; a continued run replaces it', () => {
    const arrival = playRun('honest', { level: 'arrival', character: 'mark', loadout: [...LOADOUT.mark], bulletin: 'records', seed: 5 }).final;
    const saved = recordRun(freshSave(), arrival);
    expect(saved.file).toEqual(fileOf(arrival));
    const alone = playRun('cautious', setupOf('mark', defaultFile(9, 'mark'))).final;
    const after = recordRun(saved, alone);
    expect(after.file).toEqual(saved.file);
    expect(after.levelsFinished).toContain('departure');
    const continued = playRun('cautious', setupOf('mark', saved.file!)).final;
    expect(recordRun(saved, continued).file).toEqual(fileOf(continued));
    expect(recordRun(saved, continued).file).not.toEqual(saved.file);
  });
});

describe('Lena\'s file never opens Mark\'s Departure', () => {
  it('newRun refuses another traveler\'s file', () => {
    expect(() => newRun(setupOf('mark', SAMPLE_FILES.lena))).toThrow(/cannot open/);
    expect(() => newRun(setupOf('lena', SAMPLE_FILES.mark))).toThrow(/cannot open/);
    expect(() => newRun({ ...setupOf('mark', SAMPLE_FILES.mark), file: undefined })).toThrow();
  });

  it('the departure level reads a file and Arrival does not', () => {
    expect(LEVELS.departure.readsFile).toBe(true);
    expect(LEVELS.arrival.readsFile).toBeFalsy();
  });
});

describe('the hold at the exit desk quotes the disproved claim with its crossing, date, desk and question', () => {
  it('Lena said it was a short trip at passport control, and the register showed otherwise', () => {
    const file = SAMPLE_FILES.lena;
    const c = file.said!.find((x) => file.disproved!.includes(x.claim))!;
    const s = { ...newRun(setupOf('lena', file)), seen: ['d_hold'], screen: { kind: 'encounter', id: 'd_hold' } } as RunState;
    const line = text(fileLine(s, 'd_hold'));
    expect(line).toContain(t('level.arrival.title'));
    expect(line).toContain(t('checkpoint.' + c.desk));
    expect(line).toContain(t(`file.context.${c.context}`));
    expect(line).toContain(`"${t(own(`said.${c.claim}`, 'lena'))}"`);
    expect(line).toMatch(/\d{1,2} [A-Z][a-z]+/);
    expect(line).not.toMatch(/[{}—]/);
  });
});

describe('a file saved before claims kept their desk and date still carries its claims', () => {
  // A save from Arrival before CarriedFile.said existed has only `claims`.
  const old = (file: CarriedFile): CarriedFile => {
    const { said: _said, ...rest } = file;
    return rest;
  };

  it.each([['lena'], ['mark']] as const)('%s: desk 1 names the claim, the hold names the false one, the recap lists them', (who) => {
    const file = old(SAMPLE_FILES[who]);
    const s = { ...newRun(setupOf(who, file)), seen: ['d_entry'], screen: { kind: 'encounter', id: 'd_entry' } } as RunState;
    const claim = file.claims.find((c) => c === 'familyVisit' || c === 'shortTrip')!;
    expect(questionKey(s, 'enc', 'd_entry')).not.toMatch(/unsaid/);
    const line = text(fileLine(s, 'd_entry'));
    expect(line).toContain(`"${t(own(`said.${claim}`, who))}"`);
    expect(line).toContain(t('level.arrival.title'));
    expect(line).not.toMatch(/[{}—]/);
    for (const c of file.disproved ?? []) expect(text(fileLine(s, 'd_hold'))).toContain(`"${t(own(`said.${c}`, who))}"`);
    const recap = recordLines(file).map(text);
    expect(recap).not.toContain(t('ui.record.none'));
    for (const c of file.claims) expect(recap.some((l) => l.includes(`"${t(own(`said.${c}`, who))}"`))).toBe(true);
    for (const l of recap) expect(l).not.toMatch(/[{}—]/);
  });
});

describe('the desks ask about leaving, from the file (dap.4)', () => {
  it.each([['lena'], ['mark']] as const)('%s: customs opens with what you take out, never the medicine card', (who) => {
    for (const file of [SAMPLE_FILES[who], defaultFile(1, who)]) {
      const s = drive(setupOf(who, file, 7, 'customs'), { d_hold: 'review' });
      const customs = s.seen.filter((id) => id.startsWith('c_') || id === 'd_out' || id === 'd_declared');
      expect(customs[0], who).toBe('d_out');
      expect(s.seen).not.toContain('c_medicine');
    }
    expect(LEVELS.departure.cards).not.toContain('c_medicine');
    expect(LEVELS.departure.core?.customs?.[0]).toBe('d_out');
  });

  it.each([['lena'], ['mark']] as const)('%s: the passport desk asks where you stayed, not who you will stay with', (who) => {
    const s = drive(setupOf(who, SAMPLE_FILES[who]), { d_hold: 'review' });
    expect(s.seen.slice(0, 2)).toEqual(['d_entry', 'd_stayed']);
    expect(s.seen).not.toContain('p_host');
    expect(t(questionKey(s, 'enc', 'd_stayed'))).toMatch(/Where did you stay/);
  });

  it('where you stayed is compared with the entry form: a different place costs the check, the same one does not', () => {
    const withStay = (claim: 'stayingWithFamily' | 'hotelStay'): CarriedFile => ({
      ...SAMPLE_FILES.mark,
      claims: ['familyVisit', claim],
      said: [...SAMPLE_FILES.mark.said!, { claim, date: '2026-03-09', crossing: 'arrival', desk: 'passport', context: 'p_host' }],
    });
    const at = (file: CarriedFile) => ({ ...newRun(setupOf('mark', file)), scrutiny: 0, seen: ['d_entry', 'd_stayed'], screen: { kind: 'encounter', id: 'd_stayed' } } as RunState);
    expect(text(fileLine(at(withStay('hotelStay')), 'd_stayed'))).toContain(`"${t('said.hotelStay')}"`);
    expect(text(fileLine(at(SAMPLE_FILES.mark), 'd_stayed'))).toContain('no place to stay');
    const hoursSpent = (file: CarriedFile, pick: string) => {
      const s = at(file);
      const o = options(s).find((x) => x.approach.id === pick)!;
      const next = step(s, chooseAction(o), dealer);
      expect(next.scrutiny, `${pick} is no mark against you`).toBe(0);
      return s.time - next.time;
    };
    expect(hoursSpent(withStay('hotelStay'), 'mother')).toBe(1);
    expect(hoursSpent(withStay('stayingWithFamily'), 'mother')).toBe(0);
    expect(hoursSpent(withStay('stayingWithFamily'), 'friends')).toBe(1);
    expect(hoursSpent(withStay('hotelStay'), 'friends')).toBe(1);
    expect(hoursSpent(SAMPLE_FILES.mark, 'friends')).toBe(0);
  });

  it('the stay question differs between a file that said five days, a file with no date and standalone', () => {
    const at = (file: CarriedFile) => ({ ...newRun(setupOf('mark', file)), seen: ['d_stay'], screen: { kind: 'encounter', id: 'd_stay' } } as RunState);
    const ticket: CarriedFile = { ...SAMPLE_FILES.mark, spent: ['returnTicket'] };
    const undated: CarriedFile = { ...SAMPLE_FILES.mark, spent: [] };
    const standalone = defaultFile(1, 'mark');
    expect(standalone.seeded).toBe(true);
    const q = (file: CarriedFile) => t(questionKey(at(file), 'enc', 'd_stay'));
    const line = (file: CarriedFile) => text(fileLine(at(file), 'd_stay'));
    expect(q(ticket)).toContain('five days');
    // The five days are the ticket you showed, so the clerk quotes the ticket, not your words (dap.36).
    expect(q(ticket)).toContain('return ticket');
    expect(q(ticket)).not.toMatch(/you said/i);
    expect(q(undated)).not.toContain('five days');
    expect(q(undated)).toContain('no date out');
    expect(q(standalone)).not.toContain('five days');
    expect(new Set([q(ticket), q(undated), q(standalone)]).size).toBe(3);
    // Each says where its date comes from, so the default is explained, not assumed.
    expect(line(ticket)).toContain('return ticket');
    expect(line(undated)).toContain('no date out');
    expect(line(standalone)).toMatch(/standalone/i);
    for (const f of [ticket, undated, standalone]) {
      expect(q(f)).not.toMatch(/[{}—]/);
      expect(line(f)).not.toMatch(/[{}—]/);
    }
    // A standalone file that happened to show the ticket still asks the standalone question.
    expect(q({ ...standalone, spent: ['returnTicket'] })).toBe(q(standalone));
  });
});
