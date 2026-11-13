// Documents answer the questions their description says they answer (dap.34), and
// the exit desk compares a cash count with "under the limit" on the entry record.

import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { SAMPLE_FILES } from './carry';
import { LEVEL_IDS, dealsCard } from './content/levels';
import { EVIDENCE, EVIDENCE_IDS } from './content/world';
import { answerKey, choices, currentCard, legalActions, newRun, optionFor, options, topicOf } from './engine';
import type { RunSetup } from './engine';
import { tryStep } from './play';
import type { CarriedFile, EvidenceId, LevelId, RunState, Topic } from './types';
import { allSetups } from './walk';

/** How each question reads in a document's description (ev.<id>.desc). */
const PHRASE: Record<Topic, string> = {
  accommodation: 'accommodation', stay: 'length of stay', purpose: 'purpose', work: 'work',
  money: 'cash', medicine: 'medicine', identity: 'identity', history: 'history',
};

/** The questions document `id`'s description names after "Answers". */
const named = (id: EvidenceId): Topic[] => {
  const answers = t(`ev.${id}.desc`).match(/Answers ([^.]*)\./)?.[1] ?? '';
  return (Object.keys(PHRASE) as Topic[]).filter((topic) => answers.includes(PHRASE[topic]));
};

/**
 * Every state at a card a seeded random player reaches in `level`, with the setups'
 * packings: each card on a topic, and the packed, unspent documents it offers.
 */
function reached(level: LevelId, seeds = 4): RunState[] {
  const out: RunState[] = [];
  for (const setup of allSetups(level)) for (let seed = 0; seed < seeds; seed++) {
    let s = newRun({ ...setup, seed });
    let r = seed * 7919 + 1;
    for (let k = 0; k < 200 && !s.ending; k++) {
      if (!s.reaction && !s.documentList && topicOf(currentCard(s))) out.push(s);
      const acts = legalActions(s).filter((a) => a.type !== 'turnBack');
      r = (r * 1103515245 + 12345) & 0x7fffffff;
      s = tryStep(s, acts[r % acts.length]).state;
    }
  }
  return out;
}

const RUNS = new Map(LEVEL_IDS.map((level) => [level, reached(level)]));
it('plays every level to its cards', () => {
  for (const level of LEVEL_IDS) expect(RUNS.get(level)!.length, level).toBeGreaterThan(1000);
});

describe('every document answers the questions its description names', () => {
  it('names in its description exactly the questions it answers', () => {
    for (const id of EVIDENCE_IDS) expect(named(id).sort(), id).toEqual([...EVIDENCE[id].topics].sort());
  });

  it('is accepted by at least one card on each of them, in a level where it can be packed', () => {
    const missing: string[] = [];
    for (const id of EVIDENCE_IDS) for (const topic of named(id)) {
      const accepted = LEVEL_IDS.some((level) => RUNS.get(level)!.some((s) =>
        s.loadout.includes(id) && topicOf(currentCard(s)) === topic && dealsCard(s, currentCard(s)!.id) && choices(s).some((o) => o.card === id)));
      if (!accepted) missing.push(`${id}.${topic}`);
    }
    expect(missing).toEqual([]);
  });

  it('is offered at every card on a question it names while packed and unspent, unless its block names that question', () => {
    const refused = new Set<string>();
    for (const [level, states] of RUNS) for (const s of states) {
      const card = currentCard(s)!;
      const topic = topicOf(card)!;
      if (!card.approaches.some((a) => a.kind === 'evidence' && a.topic === topic && legalOrShown(s, a.id))) continue;
      for (const id of s.loadout) {
        const ev = EVIDENCE[id];
        if (s.used.includes(id) || !named(id).includes(topic)) continue;
        if (ev.blockedOn?.includes(topic)) continue;
        if (!choices(s).some((o) => o.card === id)) refused.add(`${level} ${card.id} ${id}`);
      }
    }
    expect([...refused]).toEqual([]);
  });
});

/** The card offers its evidence answer row (a document, a list of them, or "No matching document"). */
const legalOrShown = (s: RunState, approach: string) => options(s).some((o) => o.approach.id === approach);

describe('the hotel booking and "How long are you staying?"', () => {
  const lena: RunSetup = { level: 'arrival', character: 'lena', loadout: ['hotel', 'employerLetter', 'hospitalNote'], bulletin: 'customs', seed: 7 };
  /** Plays Arrival with `picks` for the cards it names, else the first legal action, until `stop` is on screen or the run ends. */
  const play = (picks: Record<string, string>, stop?: string): RunState => {
    let s = newRun(lena);
    for (let i = 0; i < 200 && !s.ending; i++) {
      const card = s.reaction ? null : currentCard(s);
      if (stop && card?.id === stop) return s;
      const pick = card && picks[card.id];
      const next = !pick ? undefined : legalActions(s).find((a) => a.type === 'choose' && a.approach === pick);
      s = tryStep(s, next ?? legalActions(s).find((a) => a.type !== 'turnBack') ?? legalActions(s)[0]).state;
    }
    return s;
  };

  it('with your mother named as where you stay, the clerk takes the booking for its dates, and no hotel stay goes on file', () => {
    const s = play({ p_purpose: 'family', p_host: 'mother' }, 'p_stay');
    expect(currentCard(s)?.id).toBe('p_stay');
    expect(s.claims).toContain('stayingWithFamily');
    const o = optionFor(s, { approach: 'evidence' });
    expect(o?.card).toBe('hotel');
    const r = tryStep(s, { type: 'choose', approach: 'evidence' });
    expect(r.ok && r.state.used).toContain('hotel');
    expect(r.ok && r.state.claims).not.toContain('hotelStay');
  });

  it('shown for where you stay, the booking has answered how long, so the clerk does not ask', () => {
    const s = play({ p_purpose: 'family', p_host: 'evidence' });
    expect(s.used).toContain('hotel');
    expect(s.seen).toContain('p_host');
    expect(s.seen).not.toContain('p_stay');
  });

  it('is still blocked as where you stay once you have said you stay with family', () => {
    const s = { ...newRun(lena), claims: ['familyVisit' as const, 'stayingWithFamily' as const] };
    expect(choices({ ...s, reaction: null, screen: { kind: 'encounter', id: 'p_host' } }).some((o) => o.card === 'hotel')).toBe(false);
  });
});

describe('a Departure cash count against "under the limit" on file', () => {
  const at = (file: CarriedFile): RunState => ({
    ...newRun({ level: 'departure', character: 'lena', loadout: ['hotel', 'motherLetter', 'deed'], bulletin: 'records', seed: 7, file }),
    checkpoint: 1, reaction: null, seen: ['d_out', 'd_declared'], screen: { kind: 'encounter', id: 'd_declared' },
  });

  it('is compared at that desk: the entry record is the reason for the scrutiny, and the reaction says what it is held against', () => {
    const s = at(SAMPLE_FILES.lena);
    expect(s.file?.declared).toBe('under');
    const count = optionFor(s, { approach: 'count' })!;
    expect(count.effects).toContainEqual({ fact: 'cashCount' });
    expect(count.effects).toContainEqual(expect.objectContaining({ scrutiny: 1, reason: 'entryRecord' }));
    const r = tryStep(s, { type: 'choose', approach: 'count' });
    expect(r.ok).toBe(true);
    expect(r.state.scrutiny).toBe(s.scrutiny + 1);
    expect(t(answerKey(s, 'count', 'reaction'))).toContain('"under the limit"');
    expect(t(answerKey(s, 'count', 'reaction'))).toContain('14,000');
  });

  it('is not held against a file that counted the cash, or showed a paper for it', () => {
    for (const declared of ['counted', 'shown', 'none'] as const) {
      const s = at({ ...SAMPLE_FILES.lena, claims: ['shortTrip'], declared });
      const count = optionFor(s, { approach: 'count' })!;
      expect(count.effects.some((e) => 'scrutiny' in e), declared).toBe(false);
      expect(answerKey(s, 'count', 'reaction')).toBe('enc.d_declared.count.reaction');
    }
  });
});
