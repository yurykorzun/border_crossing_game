// The file Departure reads quotes only what you said at Arrival (border_crossing_game-dap.36).
// A claim a shown document made is quoted as that document, never as your words, and every
// answer that put a claim on the record shows in "Your file". Found on the live site: the
// file and the Departure clerk said you told the desk "My family needs me here" after you
// had shown your mother's letter, and the file left out "I don't know yet".
import { describe, expect, it } from 'vitest';
import { own, setStory, t } from '../i18n';
import { BOT_STYLES, playRun } from './bots';
import { fileOf } from './carry';
import { caughtLine, fileLine, questionKey, questionVars, recordLines } from './consequence';
import { EVIDENCE } from './content/world';
import { chooseAction, currentCard, legalActions, newRun, optionFor, options, step } from './engine';
import type { RunSetup } from './engine';
import { scriptedDealer } from './play';
import type { Action, CarriedFile, CharacterId, ClaimId, EvidenceId, RunState } from './types';
import { allSetups } from './walk';

const CLAIMS: readonly ClaimId[] = [
  'familyVisit', 'shortTrip', 'hotelStay', 'noOtherFamily', 'neverDonated', 'stayingWithFamily', 'cashUnderLimit',
  'stayDays', 'stayWeeks', 'stayUndecided',
];

/** The claim in this traveler's words, in quotes, as a file line quotes it. */
const quoted = (c: ClaimId, who: CharacterId) => `"${t(own(`said.${c}`, who))}"`;
const render = (lines: ({ key: string; vars?: Record<string, string> } | undefined)[]) =>
  lines.map((l) => (l ? t(l.key, l.vars) : '')).join('\n');

/**
 * What the Arrival record holds, read from the content rather than the engine's own
 * bookkeeping: each claim an answer you picked says (its card), and each claim only a
 * document you showed made (the document).
 */
function arrivalRecord(setup: RunSetup, actions: readonly Action[]) {
  const spoken = new Map<ClaimId, string>();
  const shown = new Map<ClaimId, EvidenceId>();
  let s = newRun(setup);
  for (const a of actions) {
    const sc = s.screen;
    const o = a.type === 'choose' && (sc.kind === 'encounter' || sc.kind === 'inspection') ? optionFor(s, a) : undefined;
    const n = step(s, a);
    if (o && !o.documents && (sc.kind === 'encounter' || sc.kind === 'inspection')) {
      const made = n.claims.filter((c) => !s.claims.includes(c));
      const said = o.approach.effects.flatMap((e) => ('claim' in e ? [e.claim] : []));
      const docSays = o.card ? EVIDENCE[o.card].onUse.flatMap((e) => ('claim' in e ? [e.claim] : [])) : [];
      for (const c of said) if (!spoken.has(c) && n.claims.includes(c)) spoken.set(c, sc.id);
      for (const c of made) if (docSays.includes(c) && !said.includes(c)) shown.set(c, o.card!);
    }
    s = n;
  }
  for (const c of spoken.keys()) shown.delete(c);
  return { spoken, shown, final: s };
}

/** The Departure lines a run shows: each card's question with the line under it. */
function departureLines(setup: RunSetup, style: (typeof BOT_STYLES)[number]): { file: string[]; caught: string[] } {
  const run = playRun(style, setup);
  const file: string[] = [];
  const caught: string[] = [];
  let s = newRun(setup);
  const look = (x: RunState) => {
    if (x.screen.kind !== 'encounter' || x.reaction) return;
    const id = x.screen.id;
    const under = caughtLine(x, id);
    const own = fileLine(x, id);
    const q = t(questionKey(x, 'enc', id), questionVars(x, id));
    file.push(`${q}\n${render([own])}`);
    if (under && JSON.stringify(under) !== JSON.stringify(own)) caught.push(render([under]));
  };
  look(s);
  for (const a of run.actions) {
    s = step(s, a);
    look(s);
  }
  return { file, caught };
}

describe('Departure quotes only what you said at Arrival', () => {
  it('over every Arrival setup and seeds 1-10, into Departure', () => {
    const arrival = allSetups('arrival');
    const departure = allSetups('departure');
    let shownSeen = 0;
    let undecidedSeen = 0;
    let checked = 0;
    for (let seed = 1; seed <= 10; seed++) {
      arrival.forEach((base, i) => {
        const setup = { ...base, seed };
        const style = BOT_STYLES[(i + seed) % BOT_STYLES.length];
        const run = playRun(style, setup);
        if (!run.final.ending) return;
        const { spoken, shown } = arrivalRecord(setup, run.actions);
        const file = fileOf(run.final);
        const who = file.character;
        const where = `${who} ${setup.loadout.join('+')} ${setup.bulletin} seed ${seed} ${style}`;
        // The file's claims, against what the record holds.
        for (const c of file.said ?? []) {
          if (spoken.has(c.claim)) {
            expect(c.shown, `${where}: ${c.claim} was said`).toBeUndefined();
            expect(c.context, `${where}: ${c.claim} said on`).toBe(spoken.get(c.claim));
          } else {
            expect(shown.get(c.claim), `${where}: ${c.claim} is on file with no answer that made it`).toBeDefined();
            expect(c.shown, `${where}: ${c.claim} came from a document`).toBe(shown.get(c.claim));
          }
        }
        for (const c of [...spoken.keys(), ...shown.keys()]) expect(file.claims, `${where}: ${c} left off the file`).toContain(c);
        if (shown.size) shownSeen++;
        if (spoken.has('stayUndecided')) undecidedSeen++;

        // "Your file": your words for what you said, the document for what you showed.
        const record = render(recordLines(file));
        for (const c of CLAIMS) {
          if (spoken.has(c)) expect(record, `${where}: Your file`).toContain(quoted(c, who));
          else expect(record, `${where}: Your file quotes ${c}, never said`).not.toContain(quoted(c, who));
        }
        for (const [, doc] of shown) expect(record, `${where}: Your file`).toContain(t(`ev.${doc}.the`));

        // The Departure questions and the file lines under them.
        const out = departure.filter((d) => d.character === who);
        const next: RunSetup = { ...out[(i + seed) % out.length], seed, file: file as CarriedFile };
        setStory('departure');
        try {
          const lines = departureLines(next, style);
          for (const line of lines.file)
            for (const c of CLAIMS) if (!spoken.has(c)) expect(line, `${where}: Departure quotes ${c}, never said`).not.toContain(quoted(c, who));
          checked += lines.file.length;
        } finally {
          setStory(undefined);
        }
      });
    }
    // The sweep has to reach both cases it is about, or it proves nothing.
    expect(shownSeen).toBeGreaterThan(0);
    expect(undecidedSeen).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(0);
  }, 120_000);
});

const dealer = scriptedDealer([]);

/** Plays a run: `picks` answers the cards it names (a document by its id), every other screen its first legal action. */
function drive(setup: RunSetup, picks: Record<string, string>): RunState {
  let s = newRun(setup);
  for (let i = 0; i < 200 && !s.ending; i++) {
    const card = s.reaction ? null : currentCard(s);
    const pick = card && picks[card.id];
    const answer = pick && options(s).find((o) => !o.blocked && (o.approach.id === pick || o.card === pick));
    const doc = answer && answer.card === pick ? { type: 'choose' as const, approach: answer.approach.id, card: answer.card } : undefined;
    const next = doc ?? (answer ? chooseAction(answer) : legalActions(s).find((a) => a.type !== 'turnBack') ?? legalActions(s)[0]);
    s = step(s, next, dealer);
  }
  return s;
}

describe("the mother's letter at Passport, then \"I don't know yet\"", () => {
  it('Your file and the first Departure question quote the letter and the answer, not words never said', () => {
    const setup: RunSetup = { level: 'arrival', character: 'lena', loadout: ['deed', 'employerLetter', 'motherLetter'], bulletin: 'records', seed: 3 };
    const s = drive(setup, { p_purpose: 'motherLetter', p_stay: 'unsure', i_family: 'deny' });
    expect(s.seen).toContain('p_stay');
    const file = fileOf(s);
    const record = render(recordLines(file));
    expect(record).toContain("you showed your mother's letter");
    expect(record).toContain(`"I don't know yet"`);
    expect(record).not.toContain('My family needs me here');
    setStory('departure');
    try {
      let d = newRun({ level: 'departure', character: 'lena', loadout: allSetups('departure').find((x) => x.character === 'lena')!.loadout, bulletin: 'records', seed: 3, file });
      for (let i = 0; i < 10 && d.screen.kind !== 'encounter'; i++) d = step(d, legalActions(d)[0], dealer);
      expect(d.screen).toMatchObject({ kind: 'encounter', id: 'd_entry' });
      const line = render([fileLine(d, 'd_entry')]);
      expect(line).toContain("you showed your mother's letter");
      expect(line).not.toContain('My family needs me here');
    } finally {
      setStory(undefined);
    }
  });
});
