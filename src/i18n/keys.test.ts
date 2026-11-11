import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ENCOUNTERS, INSPECTIONS, CHECKS } from '../game/content/encounters';
import { BEAT_COUNT, BULLETINS, CHARACTERS, CONTACTS, EVIDENCE, EVIDENCE_IDS, OFFICERS } from '../game/content/world';
import { QUEUES } from '../game/content/queues';
import { CHECKPOINTS } from '../game/types';
import { openQuestions, freshSave } from '../game/save';

/** Every key the content can ask for. */
function contentKeys(): string[] {
  const keys: string[] = [];
  for (const e of ENCOUNTERS) {
    keys.push(`enc.${e.id}.q`);
    for (const a of e.approaches) keys.push(`enc.${e.id}.${a.id}.label`, `enc.${e.id}.${a.id}.reaction`);
  }
  for (const i of INSPECTIONS) {
    keys.push(`insp.${i.id}.q`);
    for (const a of i.approaches) keys.push(`insp.${i.id}.${a.id}.label`, `insp.${i.id}.${a.id}.reaction`);
  }
  for (const c of Object.values(CHECKS)) {
    keys.push(`check.${c.id}.title`);
    for (const k of c.cases) keys.push(`check.${c.id}.${k.result}`, `check.${c.id}.hint.${k.result}`);
    keys.push(`check.${c.id}.clear`);
    // A check in stages: an observation per result, and its own words for each answer.
    if (c.explain) {
      for (const k of c.cases) keys.push(`check.${c.id}.observe.${k.result}`);
      keys.push(`check.${c.id}.wait.label`, `check.${c.id}.ask.label`, `check.${c.id}.ask.detail`);
      keys.push(`check.${c.id}.explain.label`, `check.${c.id}.explain.detail`, `check.${c.id}.explain.reaction`);
    }
  }
  for (const ch of Object.values(CHARACTERS)) {
    keys.push(`char.${ch.id}.name`, `char.${ch.id}.blurb`, `char.${ch.id}.role`, `char.${ch.id}.advantage`, `char.${ch.id}.complication`);
    for (const b of ch.background) keys.push(`bg.${b}`, `bg.${b}.short`);
    for (const c of ch.contacts) keys.push(`contact.${c}`, `contact.${c}.note`);
  }
  for (const c of Object.values(CONTACTS)) {
    keys.push(`contact.${c.id}.can`);
    for (const topic of c.abilities) keys.push(`contact.${c.id}.can.${topic}`);
  }
  for (const id of EVIDENCE_IDS) keys.push(`ev.${id}.name`, `ev.${id}.desc`, `ev.${id}.label`);
  for (const id of EVIDENCE_IDS) for (const topic of EVIDENCE[id].topics) keys.push(`topic.${topic}.helps`);
  for (const b of BULLETINS) keys.push(`bulletin.${b}`, `bulletin.${b}.cue`);
  for (const cp of CHECKPOINTS) {
    keys.push(`checkpoint.${cp}`, `officer.${cp}`, `officer.${cp}.priority`);
    if (OFFICERS[cp].reactions.length) keys.push(`officer.${cp}.flags`);
    for (let n = 0; n < BEAT_COUNT; n++) keys.push(`beat.${cp}.${n}`);
  }
  QUEUES.forEach((beats, n) => {
    keys.push(`queue.${n}.go`);
    for (const b of beats) keys.push(b.key, ...(b.from ? [`msg.from.${b.from}`] : []));
  });
  // One open question per ending, on the title and the ending card.
  keys.push('ui.openQuestions', ...openQuestions(freshSave()));
  return keys;
}

describe('English text', () => {
  it('has every key the content uses', () => {
    expect(contentKeys().filter((k) => !(k in en))).toEqual([]);
  });

  // The queue screen always has a phone panel under the scene, so every queue opens on the phone.
  it('has one queue per checkpoint, each opening on the phone', () => {
    expect(QUEUES).toHaveLength(CHECKPOINTS.length);
    for (const beats of QUEUES) expect(beats[0].kind).toBe('phone');
  });

  it('keeps button labels short', () => {
    const long = Object.entries(en).filter(([k, v]) => k.endsWith('.label') && v.split(/\s+/).length > 12);
    expect(long).toEqual([]);
  });

  it('keeps questions under 35 words', () => {
    const long = Object.entries(en).filter(([k, v]) => k.endsWith('.q') && v.split(/\s+/).length > 35);
    expect(long).toEqual([]);
  });

  // Time is hours until the last bus, never an abstract unit: "2 time", "{n} time",
  // "1 extra time" and "time left" all fail. "Home in time" is not a unit and passes.
  it('counts time in hours, never as a unit', () => {
    const unit = /(\d|\})\s+(extra\s+|more\s+)?time\b|\btime\s+(left|remaining)\b|\btokens?\b/i;
    expect(Object.entries(en).filter(([, v]) => unit.test(v))).toEqual([]);
  });

  // One clock only: the mission card sets up the last bus, not days of leave.
  it('sets up the last bus on the mission card', () => {
    expect(en['mission.body']).toMatch(/last bus/);
    expect(en['mission.body']).toContain('{hours} hours');
    expect(en['mission.body']).not.toMatch(/days of leave/);
  });

  it('has both plural forms for every plural key', () => {
    const keys = Object.keys(en);
    const missing = keys
      .filter((k) => k.endsWith('.one') || k.endsWith('.other'))
      .map((k) => k.replace(/\.(one|other)$/, ''))
      .filter((base) => !(`${base}.one` in en && `${base}.other` in en));
    expect(missing).toEqual([]);
  });

  it("states every officer's priority in one sentence", () => {
    for (const cp of CHECKPOINTS) {
      expect(en[`officer.${cp}.priority`], cp).toBeTruthy();
      expect(en[`officer.${cp}.priority`].split(/(?<=[.!?])\s+/), cp).toHaveLength(1);
    }
  });

  // Visible officer mood is deferred (docs/plan.md, fsx.10): no text names one.
  it('shows no officer mood word', () => {
    const mood = /\b(calm|wary|cold)\b/i;
    expect(Object.entries(en).filter(([k, v]) => k.startsWith('officer.') && mood.test(v))).toEqual([]);
    expect(Object.keys(en).filter((k) => /mood/i.test(k))).toEqual([]);
  });

  it('uses no em dashes', () => {
    expect(Object.entries(en).filter(([, v]) => v.includes('—'))).toEqual([]);
  });
});
