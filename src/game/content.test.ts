// Content lint (lintContent() in src/game/lint.ts): the machine-checked half of
// the encounter checklist in docs/design.md. The real decks must pass, and one
// broken fixture per rule proves the lint would catch it.

import { describe, expect, it } from 'vitest';
import { has, t } from '../i18n';
import { CHECKS, ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { lintContent } from './lint';
import type { Content, Text } from './lint';
import type { Approach, Encounter } from './types';

const vars = { contact: 'mother', contactMine: 'mother', cardThe: 'motherLetter' };
const text: Text = (key) => (has(key) ? t(key, vars) : undefined);
const real: Content = { encounters: ENCOUNTERS, inspections: INSPECTIONS, checks: CHECKS };

/** The real content plus one extra card, with its reaction lines. */
const withCard = (card: Encounter, lines: Record<string, string> = {}) =>
  lintContent({ ...real, encounters: [...ENCOUNTERS, card] }, (key) => lines[key] ?? text(key));

describe('content lint', () => {
  it('passes every real card', () => {
    expect(lintContent(real, text)).toEqual([]);
  });

  it('a well-formed fixture passes, so the failures below are about the one thing each breaks', () => {
    const ok: Encounter = {
      id: 'x_ok', checkpoint: 'customs', kind: 'related', when: { facts: ['employer'] },
      approaches: [
        { id: 'explain', kind: 'say', effects: [{ scrutiny: 1, reason: 'employer' }] },
        { id: 'wait', kind: 'verify', effects: [{ time: -1 }] },
      ],
    };
    expect(withCard(ok, { 'enc.x_ok.wait.reaction': 'Checking your employer takes an hour.' })).toEqual([]);
  });

  it('fails a related card with no reason to appear', () => {
    const card: Encounter = {
      id: 'x_why', checkpoint: 'customs', kind: 'related',
      approaches: [{ id: 'yes', kind: 'say', effects: [{ claim: 'tourism' }] }],
    };
    expect(withCard(card)).toEqual([expect.stringMatching(/^x_why: no reason to appear/)]);
  });

  it('fails a follow-up that no check result queues', () => {
    const card: Encounter = {
      id: 'x_orphan', checkpoint: 'followup', kind: 'followup',
      approaches: [{ id: 'yes', kind: 'say', effects: [{ claim: 'tourism' }] }],
    };
    expect(withCard(card)).toEqual([expect.stringMatching(/^x_orphan: no reason to appear/)]);
  });

  it('fails two answers with the same effects', () => {
    const card: Encounter = {
      id: 'x_twins', checkpoint: 'customs', kind: 'routine',
      approaches: [
        { id: 'a', kind: 'say', effects: [{ claim: 'tourism' }] },
        { id: 'b', kind: 'say', effects: [{ claim: 'tourism' }] },
      ],
    };
    expect(withCard(card)).toEqual(['x_twins: answers a and b do the same thing']);
  });

  // Every pair of sibling answers the rule must judge, including the ones earlier
  // reviews named: twins whatever kind or key order, apart when they spend or do
  // something different.
  const pairs: [string, Approach, Approach, boolean][] = [
    ['same say', { id: 'a', kind: 'say', effects: [{ claim: 'tourism' }] }, { id: 'b', kind: 'say', effects: [{ claim: 'tourism' }] }, true],
    ['say and verify, same effects', { id: 'a', kind: 'say', effects: [{ claim: 'tourism' }] }, { id: 'b', kind: 'verify', effects: [{ claim: 'tourism' }] }, true],
    ['keys in another order', { id: 'a', kind: 'say', effects: [{ scrutiny: 1, reason: 'employer' }] }, { id: 'b', kind: 'say', effects: [{ reason: 'employer', scrutiny: 1 }] }, true],
    ['only `requires` differs', { id: 'a', kind: 'say', effects: [{ claim: 'tourism' }] }, { id: 'b', kind: 'say', requires: { facts: ['employer'] }, effects: [{ claim: 'tourism' }] }, true],
    ['different effects', { id: 'a', kind: 'say', effects: [{ claim: 'tourism' }] }, { id: 'b', kind: 'say', effects: [{ claim: 'hotelStay' }] }, false],
    ['one opens a check', { id: 'a', kind: 'verify', effects: [{ time: -1 }] }, { id: 'b', kind: 'verify', effects: [{ time: -1 }], check: 'recordsCheck' }, false],
    ['evidence spends a document', { id: 'a', kind: 'say', effects: [] }, { id: 'b', kind: 'evidence', topic: 'identity', effects: [] }, false],
    ['a contact exposes someone', { id: 'a', kind: 'say', effects: [{ time: -1 }] }, { id: 'b', kind: 'contact', contacts: ['mother'], effects: [{ time: -1 }] }, false],
    ['withdraw ends the run', { id: 'a', kind: 'say', effects: [] }, { id: 'b', kind: 'withdraw', effects: [] }, false],
  ];
  it.each(pairs)('sibling answers, %s: twins = %s', (_, a, b, twins) => {
    const card: Encounter = { id: 'x_pair', checkpoint: 'customs', kind: 'routine', when: { facts: ['employer'] }, approaches: [a, b] };
    const lines = { 'enc.x_pair.a.reaction': 'Checking your employer takes an hour.', 'enc.x_pair.b.reaction': 'Checking your employer takes an hour.' };
    const twin = 'x_pair: answers a and b do the same thing';
    if (twins) expect(withCard(card, lines)).toContain(twin);
    else expect(withCard(card, lines)).not.toContain(twin);
  });

  it('fails scrutiny for a fact the card never puts on file', () => {
    const card: Encounter = {
      id: 'x_scrutiny', checkpoint: 'customs', kind: 'routine',
      approaches: [
        { id: 'a', kind: 'say', effects: [{ scrutiny: 1, reason: 'employer' }] },
        { id: 'b', kind: 'say', effects: [{ claim: 'tourism' }] },
      ],
    };
    expect(withCard(card)).toEqual([expect.stringMatching(/^x_scrutiny\.a: scrutiny for employer/)]);
  });

  it('fails scrutiny for a check that does not deal the card', () => {
    const card: Encounter = {
      id: 'x_check', checkpoint: 'customs', kind: 'routine',
      approaches: [
        { id: 'a', kind: 'say', effects: [{ scrutiny: 1, reason: 'phoneSearch' }] },
        { id: 'b', kind: 'say', effects: [{ claim: 'tourism' }] },
      ],
    };
    expect(withCard(card)).toEqual([expect.stringMatching(/^x_check\.a: scrutiny for phoneSearch/)]);
  });

  it('fails a time cost the reaction does not explain', () => {
    const card: Encounter = {
      id: 'x_time', checkpoint: 'customs', kind: 'routine',
      approaches: [
        { id: 'wait', kind: 'verify', effects: [{ time: -2 }] },
        { id: 'no', kind: 'say', effects: [{ claim: 'tourism' }] },
      ],
    };
    expect(withCard(card, { 'enc.x_time.wait.reaction': 'Hours later, he waves you on.' }))
      .toEqual([expect.stringMatching(/^x_time\.wait: costs time but enc\.x_time\.wait\.reaction does not say "two hours"/)]);
    expect(withCard(card)).toEqual([expect.stringMatching(/^x_time\.wait: costs time but .* has no reaction text/)]);
  });

  it('fails a check result that costs time its outcome line does not explain', () => {
    const records = CHECKS.recordsCheck;
    const slow = { ...records, cases: records.cases.map((c) => (c.result === 'clear' ? { ...c, effects: [{ time: -1 }] } : c)) };
    const content: Content = { ...real, checks: { ...CHECKS, recordsCheck: slow } };
    expect(lintContent(content, text))
      .toEqual([expect.stringMatching(/^check recordsCheck\.clear: costs time but check\.recordsCheck\.clear does not say "an hour"/)]);
    const explained: Text = (key) => (key === 'check.recordsCheck.clear' ? 'The records scan of your passport takes an hour.' : text(key));
    expect(lintContent(content, explained)).toEqual([]);
  });

  it('fails a card where no answer changes anything, unless it is calm', () => {
    const card: Encounter = {
      id: 'x_nothing', checkpoint: 'customs', kind: 'routine',
      approaches: [{ id: 'ok', kind: 'say', effects: [] }],
    };
    expect(withCard(card)).toEqual([expect.stringMatching(/^x_nothing: no answer changes anything/)]);
    // Effects that move nothing are no change either.
    for (const e of [{ time: 0 }, { scrutiny: 0, reason: 'employer' as const }, { travel: 0 }])
      expect(withCard({ ...card, when: { facts: ['employer'] }, approaches: [{ id: 'ok', kind: 'say', effects: [e] }] }))
        .toEqual([expect.stringMatching(/^x_nothing: no answer changes anything/)]);
    expect(withCard({ ...card, calm: true })).toEqual([]);
    // Calm with two answers that both do nothing is a dead choice, not a pause.
    const two: Encounter = { ...card, calm: true, approaches: [...card.approaches, { id: 'no', kind: 'say', effects: [] }] };
    expect(withCard(two)).toContainEqual(expect.stringMatching(/^x_nothing: no answer changes anything/));
  });
});
