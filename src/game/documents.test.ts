// Each document answers named questions (docs/design.md "Evidence cards"). The
// table there is the contract for EVIDENCE, and a question two packed documents
// answer offers both, each with its own cost.

import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/design.md?raw';
import { t, tn } from '../i18n';
import { EVIDENCE, EVIDENCE_IDS } from './content/world';
import { SEPARATOR, consequence } from './consequence';
import { legalActions, newRun, optionFor, options } from './engine';
import type { Option, RunSetup } from './engine';
import { tryStep } from './play';
import type { EvidenceCard, EvidenceId, RunState, Topic } from './types';

/**
 * The questions each document's row in the "Evidence cards" table lists: the
 * backticked topics in its second column, keyed by the backticked id in the first.
 */
function documentTable(doc: string): Map<string, Topic[]> {
  const at = doc.indexOf('\n## Evidence cards');
  const end = doc.indexOf('\n## ', at + 1);
  const rows = new Map<string, Topic[]>();
  for (const line of doc.slice(at, end < 0 ? undefined : end).split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const id = cells[1]?.match(/`(\w+)`/)?.[1];
    if (!line.startsWith('|') || !id) continue;
    rows.set(id, [...(cells[2] ?? '').matchAll(/`(\w+)`/g)].map((m) => m[1] as Topic));
  }
  return rows;
}

/** What a document answers or settles that its row does not list, as `id.topic`. */
function unlisted(table: Map<string, Topic[]>, evidence: Record<string, EvidenceCard>): string[] {
  return Object.values(evidence).flatMap((card) => {
    const listed = table.get(card.id) ?? [];
    return [...new Set([...card.topics, ...(card.settles ?? [])])].filter((q) => !listed.includes(q)).map((q) => `${card.id}.${q}`);
  });
}

describe('the document-to-question table in docs/design.md', () => {
  const table = documentTable(designDoc);

  it('has a row for every document', () => {
    expect([...table.keys()].sort()).toEqual([...EVIDENCE_IDS].sort());
  });

  it('lists every question each document answers or settles', () => {
    expect(unlisted(table, EVIDENCE)).toEqual([]);
  });

  it('lists nothing a document does not answer', () => {
    for (const [id, listed] of table) expect(listed.sort()).toEqual([...EVIDENCE[id as EvidenceId].topics].sort());
  });

  it('fails when a document settles a question it does not list', () => {
    const settlesMore = { ...EVIDENCE, returnTicket: { ...EVIDENCE.returnTicket, settles: ['stay', 'money'] as Topic[] } };
    expect(unlisted(table, settlesMore)).toEqual(['returnTicket.money']);
    const answersMore = { ...EVIDENCE, hotel: { ...EVIDENCE.hotel, topics: [...EVIDENCE.hotel.topics, 'purpose'] as Topic[] } };
    expect(unlisted(table, answersMore)).toEqual(['hotel.purpose']);
  });
});

describe('a question two packed documents answer', () => {
  const lena: RunSetup = { character: 'lena', loadout: ['motherLetter', 'hospitalNote', 'employerLetter'], bulletin: 'records', seed: 7 };
  // "Why now?" is the first card at passport (p_purpose), and both documents answer why you came.
  const whyNow = (): RunState => {
    let s = newRun(lena);
    while (s.screen.kind !== 'encounter') s = tryStep(s, legalActions(s)[0]).state;
    expect(s.screen).toEqual({ kind: 'encounter', id: 'p_purpose' });
    return s;
  };
  const line = (s: RunState, o: Option) =>
    consequence(o, `enc.p_purpose.${o.approach.id}`, 'brother').parts
      .map((p) => (p.n === undefined ? t(p.key, p.vars) : tn(p.key, p.n, p.vars))).join(SEPARATOR);

  it('offers both, each with its own cost line', () => {
    const s = whyNow();
    const shown = options(s).filter((o) => o.approach.kind === 'evidence');
    expect(shown.map((o) => o.card)).toEqual(['motherLetter', 'hospitalNote']);
    expect(shown.every((o) => !o.blocked)).toBe(true);
    const [letter, note] = shown;
    expect(letter.effects).toContainEqual({ fact: 'familyAddress' });
    expect(letter.effects).not.toContainEqual({ fact: 'fatherCondition' });
    expect(note.effects).toContainEqual({ fact: 'fatherCondition' });
    expect(note.effects).not.toContainEqual({ fact: 'familyAddress' });
    expect(line(s, letter)).toBe('Uses letter · Reveals her address');
    expect(line(s, note)).toBe("Uses note · Reveals your father's condition");
  });

  it('lets the player pick either one, and spends only that one', () => {
    const s = whyNow();
    const choices = legalActions(s).filter((a) => a.type === 'choose' && a.approach === 'evidence');
    expect(choices).toEqual([
      { type: 'choose', approach: 'evidence', card: 'motherLetter' },
      { type: 'choose', approach: 'evidence', card: 'hospitalNote' },
    ]);
    const byNote = tryStep(s, { type: 'choose', approach: 'evidence', card: 'hospitalNote' });
    expect(byNote.ok && byNote.state.used).toEqual(['hospitalNote']);
    expect(byNote.ok && Object.keys(byNote.state.facts)).toContain('fatherCondition');
    expect(byNote.ok && Object.keys(byNote.state.facts)).not.toContain('familyAddress');
    const byLetter = tryStep(s, { type: 'choose', approach: 'evidence', card: 'motherLetter' });
    expect(byLetter.ok && byLetter.state.used).toEqual(['motherLetter']);
    expect(byLetter.ok && Object.keys(byLetter.state.facts)).toContain('familyAddress');
  });

  it('refuses a document that was not packed, and picks the first one when none is named', () => {
    const s = whyNow();
    expect(tryStep(s, { type: 'choose', approach: 'evidence', card: 'deed' }).ok).toBe(false);
    expect(optionFor(s, { approach: 'evidence' })?.card).toBe('motherLetter');
  });
});
