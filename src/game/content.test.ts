// Content lint (lintContent() in src/game/lint.ts): the machine-checked half of
// the encounter checklist in docs/design.md. The real decks must pass, and one
// broken fixture per rule proves the lint would catch it.

import { describe, expect, it } from 'vitest';
import { has, t } from '../i18n';
import { CHECKS, ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { lintContent } from './lint';
import type { Content, Text } from './lint';
import type { Encounter } from './types';

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

  it('fails a card where no answer changes anything, unless it is calm', () => {
    const card: Encounter = {
      id: 'x_nothing', checkpoint: 'customs', kind: 'routine',
      approaches: [{ id: 'ok', kind: 'say', effects: [] }],
    };
    expect(withCard(card)).toEqual([expect.stringMatching(/^x_nothing: no answer changes anything/)]);
    expect(withCard({ ...card, calm: true })).toEqual([]);
  });
});
