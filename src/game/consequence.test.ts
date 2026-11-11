import { describe, expect, it } from 'vitest';
import { has, t, tn } from '../i18n';
import { ENCOUNTERS, INSPECTIONS } from './content/encounters';
import { BULLETINS, CHARACTERS, CHARACTER_IDS, EVIDENCE, EVIDENCE_IDS, FACT_TIERS } from './content/world';
import { CHANGE_EVENTS, MAX_PARTS, SEPARATOR, changeLines, consequence, consequences, eventKey, keptLines, nextActionKey, packDetail, protectedRow } from './consequence';
import { BOT_STYLES, playRun, setupFor } from './bots';
import { deskOf, newRun, options, travelOf } from './engine';
import { eventsBetween, playStep } from './play';
import type { GameEvent } from './play';
import { en } from '../i18n/en';
import type { Part } from './consequence';
import type { Option } from './engine';
import type { CharacterId, ContactId, Effect, EvidenceId, RunState, Topic } from './types';

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
        const topic = (c as { topic?: Topic }).topic;
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
      if (time) expect(line, name).toContain(tn('ui.line.event', Math.abs(time), { event: eventKey(o, cardKey) }));
      if (scrutiny) expect(line, name).toContain(t('ui.line.scrutiny', { n: scrutiny }));
      // A card can say it in its own words ("His name goes on file"); the part is still there.
      const contactKey = has(`${cardKey}.contact`) ? `${cardKey}.contact` : `contact.${o.contact}.shares`;
      if (o.contact) expect(line, name).toContain(t(contactKey, { contact: o.contact }));
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

  it('leads with the cost: time or the bus before anything that goes on file', () => {
    const costs = ['miss', 'time', 'travel'];
    const onFile = ['card', 'contact', 'vouch', 'fact', 'claim'];
    for (const { name, option: o, cardKey, character } of all) {
      const kinds = consequence(o, cardKey, CHARACTERS[character].protectedContact).parts.map((p) => p.kind);
      const lastCost = Math.max(-1, ...kinds.map((k, i) => (costs.includes(k) ? i : -1)));
      const firstFile = kinds.findIndex((k) => onFile.includes(k));
      if (lastCost >= 0 && firstFile >= 0) expect(lastCost, `${name}: ${kinds.join(', ')}`).toBeLessThan(firstFile);
    }
  });

  it('shows a contact other than the protected one in plain, the same as any other part', () => {
    for (const { name, option: o, cardKey, character } of all) {
      const guarded = CHARACTERS[character].protectedContact;
      for (const p of consequence(o, cardKey, guarded).parts)
        if (p.kind === 'contact') expect(p.tone, name).toBe(o.contact === guarded ? 'red' : 'plain');
    }
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
    expect(t('enc.p_purpose.family.label')).toBe('"My family needs me here."');
    expect(line('family').text).toBe('Register check: 1 hour');
    expect(t('enc.p_purpose.shortTrip.label')).toBe('"No reason, a short trip."');
    expect(line('shortTrip')).toEqual({ icon: 'check', text: 'Recorded as your reason for coming back' });
  });

  it('shows a blocked answer as why it is blocked', () => {
    const a = ENCOUNTERS[0].approaches[0];
    const c = consequence({ approach: a, blocked: 'noCard', effects: [] }, 'enc.x.y', 'cousin');
    expect(c.parts.map(text)).toEqual([t('ui.blocked.noCard')]);
  });
});

describe('the last bus, on the answer line', () => {
  // A real inspection state, so the options carry the engine's own effects.
  const at = (id: string, time: number, travel?: number): RunState => ({
    ...newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 }),
    screen: { kind: 'inspection', id },
    time,
    ...(travel === undefined ? {} : { travel }),
  });
  const line = (s: RunState, approach: string) => {
    const o = options(s).find((x) => x.approach.id === approach)!;
    return consequence(o, `insp.${s.screen.kind === 'inspection' ? s.screen.id : ''}.${approach}`, 'cousin', deskOf(s), s).parts;
  };

  it('says the bus is missed when the cost leaves fewer hours than the trip', () => {
    const s = at('s_bag', 3);
    expect(travelOf(s)).toBe(2);
    const parts = line(s, 'wait');
    expect(parts.map(text)).toContain('Misses the last bus');
    expect(parts.find((p) => p.kind === 'miss')?.tone).toBe('red');
    expect(parts.some((p) => p.kind === 'time')).toBe(false);
  });

  it('says how many hours a later connection will need', () => {
    const parts = line(at('s_connection', 6), 'later');
    expect(parts.map(text)).toContain('Bus needs 3 hours left');
    expect(line(at('s_connection', 6, 4), 'later').map(text)).toContain('Bus needs 5 hours left');
    expect(parts.some((p) => p.kind === 'miss')).toBe(false);
  });

  it('a later connection with too few hours left misses the bus', () => {
    expect(line(at('s_connection', 3, 3), 'later').map(text)).toEqual(expect.arrayContaining(['Misses the last bus']));
  });

  it('a run already short of the trip still says a costly answer misses the bus, and a free one does not', () => {
    // Above LAST_HOURS, so the inspection still offers to wait, but short of a 4-hour trip.
    const s = at('s_bag', 3, 4);
    expect(travelOf(s)).toBe(4);
    expect(line(s, 'wait').map(text)).toContain('Misses the last bus');
    expect(line(s, 'wait').some((p) => p.kind === 'time')).toBe(false);
    // An answer with no time or travel cost changes nothing about the bus, so it says nothing about it.
    expect(line(at('s_medicine', 1), 'surrender').some((p) => p.kind === 'miss')).toBe(false);
  });

  it('the bag search answers lead with the cost, then what goes on file', () => {
    const s = at('s_bag', 8);
    expect(line(s, 'wait').map(text).join(SEPARATOR)).toBe('Full search: 3 hours · Cash total recorded');
    // The mother says what calling her shares, and why her word helps end the search.
    expect(line(s, 'contact').map(text).join(SEPARATOR)).toBe('Phone call: 1 hour · Shares her number · May verify the prescription, ending the search');
    expect(line(s, 'contact').find((p) => p.kind === 'contact')?.tone).toBe('plain');
  });

  it('the mother on the host question says what she shares and what she may verify', () => {
    const s: RunState = { ...at('s_bag', 8), screen: { kind: 'encounter', id: 'c_host' }, checkpoint: 1, slot: 1 };
    const o = options(s).find((x) => x.approach.id === 'mother')!;
    expect(o.contact).toBe('mother');
    expect(consequence(o, 'enc.c_host.mother', 'cousin', deskOf(s), s).parts.map(text).join(SEPARATOR)).toBe('Shares her number · May verify your address');
  });

  it('an answer that keeps the bus possible shows neither line', () => {
    const parts = line(at('s_bag', 8), 'wait');
    expect(parts.map(text)).toContain('Full search: 3 hours');
    expect(parts.some((p) => p.kind === 'miss' || p.key === 'ui.line.need')).toBe(false);
    expect(line(at('s_medicine', 3), 'withdraw').some((p) => p.kind === 'miss')).toBe(false);
  });
});

describe('packing rows', () => {
  const rows = (id: EvidenceId) => packDetail(id).map((line) => line.map((k) => t(k)).join(SEPARATOR));

  it('lists every topic a document answers, then what it reveals', () => {
    expect(rows('hospitalNote')).toEqual(['Medicine · Why you came back', "Reveals your father's condition"]);
    expect(rows('motherLetter')).toEqual(['Why you came back · Accommodation', 'Reveals her address']);
    expect(rows('hotel')).toEqual(['Accommodation · Length of stay']);
    for (const id of EVIDENCE_IDS) expect(packDetail(id)[0], id).toHaveLength(EVIDENCE[id].topics.length);
  });
});

describe('the packing cue, one per bulletin', () => {
  it('is one sentence about officers, and no row tag is left', () => {
    expect(t('bulletin.accommodation.cue')).toBe("Officers are calling hosts to check where you'll stay.");
    for (const b of BULLETINS) {
      const cue = t(`bulletin.${b}.cue`);
      expect(cue, b).toMatch(/^Officers /);
      expect(cue.match(/[.!?]/g), b).toHaveLength(1);
      expect(cue, b).toMatch(/[.!?]$/);
    }
    expect(has('ui.relevantToday')).toBe(false);
  });
});

describe('the protected contact on the ending card', () => {
  it('names the same result as its consequence heading', () => {
    const rows: Record<string, string> = {};
    for (const id of CHARACTER_IDS) {
      const c = CHARACTERS[id].protectedContact;
      const s: RunState = { ...newRun(setupFor(0)), character: id, exposed: [c], screen: { kind: 'ending' }, ending: 'homeAtCost' };
      const line = consequences(s).find((l) => l.kind === 'contact' && l.vars?.contact === c)!;
      const row = protectedRow(s);
      expect(row.key, id).toBe(`${line.key}.row`);
      expect(row.tone, id).toBe('red');
      // Every word of the row is in the heading: "Added to watch list" / "Tom is added to a border watch list".
      const sentence = t(`${line.key}.title`, line.vars).toLowerCase();
      for (const word of t(row.key).toLowerCase().split(/\s+/)) expect(sentence, `${id}: ${t(row.key)}`).toContain(word);
      rows[c] = t(row.key);
      // Not named: the row says so, and the ending has no consequence for them.
      const clean = { ...s, exposed: [] };
      expect(protectedRow(clean)).toEqual({ key: 'ui.notNamed', tone: 'plain' });
    }
    expect(rows).toEqual({ cousin: 'Called in', brother: 'Contacted for questioning' });
  });

  it('says what you kept under the title: the medicine, the protected contact, or the passport', () => {
    const kept = (extra: Partial<RunState>) => keptLines({ ...newRun(setupFor(0)), character: 'lena', ...extra }).map((k) => t(k.key, k.vars)).join(' ');
    expect(kept({})).toBe("Your father's medicine is still in the cool bag. You keep your cousin Ilya out of the file.");
    expect(kept({ medicine: false })).toBe('You keep your cousin Ilya out of the file.');
    expect(kept({ exposed: ['mother', 'cousin'] })).toBe("Your father's medicine is still in the cool bag.");
    expect(kept({ medicine: false, exposed: ['cousin'] })).toBe('You still have your passport.');
    expect(keptLines({ ...newRun(setupFor(0)), character: 'mark' }).map((k) => t(k.key, k.vars))[1]).toBe('You keep your brother Tom out of the file.');
  });

  it('the turned-back epilogue reads as a withdrawal, not a refusal stamp', () => {
    expect(t('ending.turnedBack.body')).not.toMatch(/stamp/i);
  });
});

describe('what changed, under the reaction', () => {
  // Every event a run can produce, from bot runs of every style.
  function seenEvents(): GameEvent[] {
    const out: GameEvent[] = [];
    for (const style of BOT_STYLES)
      for (let i = 0; i < 60; i++) {
        const setup = setupFor(i);
        let s = newRun(setup);
        for (const action of playRun(style, setup).actions) {
          const n = playStep(s, action);
          out.push(...eventsBetween(s, n, action));
          s = n;
        }
      }
    return out;
  }

  it('every fact, time and scrutiny event has a change line key in en.ts', () => {
    const events = seenEvents().filter((e) => (CHANGE_EVENTS as readonly string[]).includes(e.type));
    for (const type of ['factRecorded', 'timeSpent', 'scrutinyChanged']) expect(events.some((e) => e.type === type), type).toBe(true);
    const missing = changeLines(events, 'cousin').flatMap((c) =>
      c.n === undefined ? (c.key in en ? [] : [c.key]) : [`${c.key}.one`, `${c.key}.other`].filter((k) => !(k in en)),
    );
    expect([...new Set(missing)]).toEqual([]);
    // And every fact in the game, not only the ones the bots happened to reveal: each has a tier, and each tier a line.
    const facts = Object.keys(en).filter((k) => /^fact\.[^.]+$/.test(k)).map((k) => k.slice('fact.'.length));
    expect(facts.filter((f) => !(f in FACT_TIERS))).toEqual([]);
    for (const tier of ['recorded', 'confirmed', 'flagged']) expect(`change.onFile.${tier}` in en, tier).toBe(true);
  });

  it('reads as plain sentences: an address found in the records, an hour lost, scrutiny up', () => {
    const lines = changeLines(
      [{ type: 'factRecorded', id: 'familyAddress', tier: 'recorded' }, { type: 'timeSpent', hours: 1 }, { type: 'scrutinyChanged', from: 1, to: 2 }],
      'cousin',
    );
    expect(lines.map((c) => (c.n === undefined ? t(c.key, c.vars) : tn(c.key, c.n, c.vars)))).toEqual([
      'Found in the old records: Your registered family address.',
      '1 hour lost.',
      'Scrutiny 2/3.',
    ]);
    expect(lines.map((c) => c.tone)).toEqual(['plain', 'plain', 'amber']);
  });

  it('marks the protected contact and the medicine red, and a scrutiny drop plain', () => {
    const lines = changeLines(
      [{ type: 'contactExposed', id: 'cousin', desk: 'interview', shares: 'name' }, { type: 'medicineLost' }, { type: 'scrutinyChanged', from: 3, to: 1 }],
      'cousin',
    );
    expect(lines.map((c) => [c.key, c.tone])).toEqual([['change.contact.name', 'red'], ['change.scrutiny', 'plain'], ['change.medicine', 'red']]);
  });

  it('playStep keeps the lines only while the reaction shows', () => {
    const base = newRun({ character: 'lena', loadout: ['motherLetter', 'hotel', 'returnTicket'], bulletin: 'records', seed: 7 });
    // Both passport core cards seen and the follow-up slot spent, so the next button leaves the desk.
    const s = { ...base, screen: { kind: 'encounter', id: 'p_purpose' } as const, slot: 3, seen: ['p_host', 'p_purpose'] };
    const after = playStep(s, { type: 'choose', approach: 'evidence' });
    expect(after.reaction).not.toBeNull();
    expect(after.changes).toContainEqual({ key: 'change.onFile.recorded', vars: { fact: 'familyAddress' }, tone: 'plain' });
    expect(nextActionKey(after)).toBe('ui.proceed.customs');
    expect(playStep(after, { type: 'ack' }).changes).toBeNull();
  });
});
