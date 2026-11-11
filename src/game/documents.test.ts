// Each document answers named questions (docs/design.md "Evidence cards"). The
// table there is the contract for EVIDENCE. A question two packed documents
// answer offers one "Show a document" answer, which lists both, each with its own cost.

import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/design.md?raw';
import { t, tn } from '../i18n';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE, EVIDENCE_IDS } from './content/world';
import { SEPARATOR, consequence } from './consequence';
import { answerKey, documentsOf, legalActions, newRun, optionFor, options, step } from './engine';
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
  const line = (o: Option) =>
    consequence(o, `enc.p_purpose.${o.approach.id}`, 'brother').parts
      .map((p) => (p.n === undefined ? t(p.key, p.vars) : tn(p.key, p.n, p.vars))).join(SEPARATOR);
  const label = (s: RunState, o: Option) => (o.documents ? t('ui.showDocument') : t(answerKey(s, o.approach.id, 'label'), o.card ? { card: o.card, cardThe: o.card } : {}));
  const open = (s: RunState): RunState => {
    const r = tryStep(s, { type: 'choose', approach: 'evidence' });
    expect(r.ok).toBe(true);
    return r.state;
  };

  it('offers one "Show a document" answer, and the card keeps to 3 answers', () => {
    const s = whyNow();
    const shown = options(s).filter((o) => o.approach.kind === 'evidence');
    expect(shown).toHaveLength(1);
    expect(label(s, shown[0])).toBe('Show a document');
    expect(shown[0].documents).toEqual(['motherLetter', 'hospitalNote']);
    expect(line(shown[0])).toBe('2 documents fit');
    expect(options(s).length).toBeLessThanOrEqual(3);
  });

  it('choosing it lists both documents, each with its own cost line, and spends nothing yet', () => {
    const s = whyNow();
    const list = open(s);
    expect(list.used).toEqual([]);
    expect(list.time).toBe(s.time);
    expect(list.decisions).toBe(s.decisions);
    const shown = options(list);
    expect(shown.map((o) => o.card)).toEqual(['motherLetter', 'hospitalNote']);
    expect(shown.every((o) => !o.blocked && o.approach.kind === 'evidence')).toBe(true);
    const [letter, note] = shown;
    expect(letter.effects).toContainEqual({ fact: 'familyAddress' });
    expect(letter.effects).not.toContainEqual({ fact: 'fatherCondition' });
    expect(note.effects).toContainEqual({ fact: 'fatherCondition' });
    expect(note.effects).not.toContainEqual({ fact: 'familyAddress' });
    expect(line(letter)).toBe('Uses letter · Reveals her address');
    expect(line(note)).toBe("Uses note · Reveals your father's condition");
    expect(documentsOf(s, options(s).find((o) => o.documents)!)).toEqual(shown);
  });

  it('lets the player pick either one from the list, and spends only that one', () => {
    const list = open(whyNow());
    expect(legalActions(list).filter((a) => a.type === 'choose')).toEqual([
      { type: 'choose', approach: 'evidence', card: 'motherLetter' },
      { type: 'choose', approach: 'evidence', card: 'hospitalNote' },
    ]);
    const byNote = tryStep(list, { type: 'choose', approach: 'evidence', card: 'hospitalNote' });
    expect(byNote.ok && byNote.state.used).toEqual(['hospitalNote']);
    expect(byNote.ok && Object.keys(byNote.state.facts)).toContain('fatherCondition');
    expect(byNote.ok && Object.keys(byNote.state.facts)).not.toContain('familyAddress');
    expect(byNote.state.documentList).toBeUndefined();
    const byLetter = tryStep(list, { type: 'choose', approach: 'evidence', card: 'motherLetter' });
    expect(byLetter.ok && byLetter.state.used).toEqual(['motherLetter']);
    expect(byLetter.ok && Object.keys(byLetter.state.facts)).toContain('familyAddress');
  });

  it('goes back from the list to the same answers', () => {
    const s = whyNow();
    const back = step(open(s), { type: 'back' });
    expect(options(back)).toEqual(options(s));
    expect(back.documentList).toBeUndefined();
  });

  it('refuses a document that was not packed, or one named before the list is open', () => {
    const s = whyNow();
    expect(tryStep(open(s), { type: 'choose', approach: 'evidence', card: 'deed' }).ok).toBe(false);
    expect(tryStep(s, { type: 'choose', approach: 'evidence', card: 'hospitalNote' }).ok).toBe(false);
  });

  it('shows a single fitting document straight on the card', () => {
    const s = { ...whyNow(), loadout: ['motherLetter', 'employerLetter'] as EvidenceId[] };
    const shown = options(s).filter((o) => o.approach.kind === 'evidence');
    expect(shown.map((o) => [o.card, o.documents])).toEqual([['motherLetter', undefined]]);
    expect(optionFor(s, { approach: 'evidence' })?.card).toBe('motherLetter');
  });
});

describe('no card shows more than 3 answers', () => {
  // Every document in the bag at once is more than a card can ever be offered.
  it('holds with every document in the bag, on every card', () => {
    for (const character of CHARACTER_IDS) {
      const packed = newRun({ character, loadout: EVIDENCE_IDS.slice(0, CHARACTERS[character].evidenceSlots), bulletin: 'records', seed: 1 });
      const base = { ...packed, loadout: [...EVIDENCE_IDS] };
      for (const card of [...ENCOUNTERS.map((e) => ({ kind: 'encounter' as const, id: e.id })), ...INSPECTIONS.map((i) => ({ kind: 'inspection' as const, id: i.id }))]) {
        const s: RunState = { ...base, reaction: null, screen: card };
        const n = options(s).length;
        if (n > 3) expect.fail(`${character} on ${card.id} sees ${n} answers`);
      }
    }
  });
});
