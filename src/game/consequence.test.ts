import { describe, expect, it } from 'vitest';
import { t, tn } from '../i18n';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { CHARACTERS, CHARACTER_IDS, EVIDENCE, EVIDENCE_IDS } from './content/world';
import { MAX_PARTS, SEPARATOR, consequence } from './consequence';
import type { Part } from './consequence';
import type { Option } from './engine';
import type { CharacterId, ContactId, Effect, EvidenceId } from './types';

const text = (p: Part) => (p.n === undefined ? t(p.key, p.vars) : tn(p.key, p.n, p.vars));

interface Case {
  name: string;
  option: Option;
  cardKey: string;
  character: CharacterId;
}

/**
 * Every option of every encounter and inspection, for each traveler, each card that
 * could back it and each contact that could be named. Conditional effects are all
 * kept, so a line is checked at its most crowded.
 */
function cases(): Case[] {
  const out: Case[] = [];
  const cards = [...ENCOUNTERS.map((c) => ({ prefix: 'enc', c })), ...INSPECTIONS.map((c) => ({ prefix: 'insp', c }))];
  for (const { prefix, c } of cards)
    for (const a of c.approaches)
      for (const character of CHARACTER_IDS) {
        const ch = CHARACTERS[character];
        const topic = 'topic' in c ? c.topic : undefined;
        const weak = !!topic && ch.weakTopics.includes(topic) && a.kind === 'verify';
        const evs: (EvidenceId | undefined)[] = a.kind === 'evidence' ? EVIDENCE_IDS.filter((e) => EVIDENCE[e].topics.includes(a.topic!)) : [undefined];
        const contacts: (ContactId | undefined)[] = a.kind === 'contact' ? (a.contacts ?? ch.contacts).filter((x) => ch.contacts.includes(x)) : [undefined];
        for (const card of evs)
          for (const contact of contacts) {
            const effects: Effect[] = [...(card ? EVIDENCE[card].onUse : []), ...a.effects, ...(weak ? [{ time: -1 }] : [])];
            out.push({
              name: `${character} ${prefix}.${c.id}.${a.id}${card ? ` ${card}` : ''}${contact ? ` ${contact}` : ''}`,
              option: { approach: a, blocked: null, card, contact, effects },
              cardKey: `${prefix}.${c.id}.${a.id}`,
              character,
            });
          }
      }
  return out;
}

describe('consequence line', () => {
  const all = cases();

  it('covers every option of every encounter and inspection', () => {
    const covered = new Set(all.map((c) => c.cardKey));
    for (const e of ENCOUNTERS) for (const a of e.approaches) expect(covered.has(`enc.${e.id}.${a.id}`), `enc.${e.id}.${a.id}`).toBe(true);
    for (const i of INSPECTIONS) for (const a of i.approaches) expect(covered.has(`insp.${i.id}.${a.id}`), `insp.${i.id}.${a.id}`).toBe(true);
  });

  it('has at most 3 parts and names every time, scrutiny, exposure and medicine effect', () => {
    for (const { name, option: o, cardKey, character } of all) {
      const { parts } = consequence(o, cardKey, CHARACTERS[character].protectedContact);
      const line = parts.map(text).join(SEPARATOR);
      expect(parts.length, name).toBeGreaterThan(0);
      expect(parts.length, `${name}: ${line}`).toBeLessThanOrEqual(MAX_PARTS);
      const time = o.effects.reduce((n, e) => n + ('time' in e ? e.time : 0), 0);
      const scrutiny = o.effects.reduce((n, e) => n + ('scrutiny' in e ? e.scrutiny : 0), 0);
      if (time) expect(line, name).toContain(tn('ui.line.time', Math.abs(time)));
      if (scrutiny) expect(line, name).toContain(t('ui.line.scrutiny', { n: scrutiny }));
      if (o.contact) expect(line, name).toContain(t('ui.line.contact', { contact: o.contact }));
      if (o.effects.some((e) => 'loseMedicine' in e)) expect(line, name).toContain(t('ui.line.medicine'));
      for (const p of parts) expect(text(p), `${name}: ${p.key}`).not.toMatch(/\{\w+\}/);
    }
  });

  it('uses red only when the protected contact is exposed or the medicine is lost', () => {
    let reds = 0;
    for (const { name, option: o, cardKey, character } of all) {
      const guarded = CHARACTERS[character].protectedContact;
      const { parts } = consequence(o, cardKey, guarded);
      const serious = o.contact === guarded || o.effects.some((e) => 'loseMedicine' in e);
      for (const p of parts) {
        if (p.tone !== 'red') continue;
        reds++;
        expect(serious, `${name}: red ${p.key}`).toBe(true);
        expect(['contact', 'medicine'], name).toContain(p.kind);
      }
    }
    expect(reds, 'some line is red').toBeGreaterThan(0);
  });

  it('marks scrutiny and a check in amber', () => {
    for (const { option: o, cardKey, character } of all)
      for (const p of consequence(o, cardKey, CHARACTERS[character].protectedContact).parts)
        if (p.kind === 'scrutiny' || p.kind === 'check') expect(p.tone).toBe('amber');
  });

  it('writes the passport answers from the mockup', () => {
    const line = (approach: string, card?: EvidenceId) => {
      const a = ENCOUNTERS.find((e) => e.id === 'p_purpose')!.approaches.find((x) => x.id === approach)!;
      const effects = [...(card ? EVIDENCE[card].onUse : []), ...a.effects];
      const c = consequence({ approach: a, blocked: null, card, effects }, `enc.p_purpose.${approach}`, 'cousin');
      return { icon: c.icon, text: c.parts.map(text).join(SEPARATOR) };
    };
    expect(t('enc.p_purpose.evidence.label', { cardThe: 'motherLetter' })).toBe("Show your mother's letter");
    expect(line('evidence', 'motherLetter').text).toBe('Uses letter · Reveals her address');
    expect(t('enc.p_purpose.family.label')).toBe('"I\'m visiting family."');
    expect(line('family').text).toBe('Register check · Costs 1 hour');
    expect(t('enc.p_purpose.tourism.label')).toBe('"I\'m here as a tourist."');
    expect(line('tourism')).toEqual({ icon: 'check', text: 'Recorded as your reason for visiting' });
  });

  it('shows a blocked answer as why it is blocked', () => {
    const a = ENCOUNTERS[0].approaches[0];
    const c = consequence({ approach: a, blocked: 'noCard', effects: [] }, 'enc.x.y', 'cousin');
    expect(c.parts.map(text)).toEqual([t('ui.blocked.noCard')]);
  });
});
