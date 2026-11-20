import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { ENCOUNTERS, INSPECTIONS, CHECKS } from '../game/content/encounters';
import { BEAT_COUNT, BULLETINS, CHARACTERS, CONTACTS, DESTINATIONS, DESTINATION_IDS, EVIDENCE, EVIDENCE_IDS, OFFICERS } from '../game/content/world';
import { QUEUES } from '../game/content/queues';
import { CHECKPOINTS } from '../game/types';

/** Every key the content can ask for. */
function contentKeys(): string[] {
  const keys: string[] = [];
  for (const e of ENCOUNTERS) {
    keys.push(`enc.${e.id}.q`);
    for (const a of e.approaches) keys.push(`enc.${e.id}.${a.id}.label`, `enc.${e.id}.${a.id}.reaction`);
    // A worded answer has its own reaction (Approach.worded).
    for (const a of e.approaches) if (a.worded) keys.push(`enc.${e.id}.${a.id}.${a.worded.key}.reaction`);
  }
  for (const i of INSPECTIONS) {
    keys.push(`insp.${i.id}.q`);
    for (const a of i.approaches) keys.push(`insp.${i.id}.${a.id}.label`, `insp.${i.id}.${a.id}.reaction`);
    // The build-up (dap.17): the reminder, the progression lines and each result's line.
    keys.push(`insp.${i.id}.remind`);
    for (let n = 1; n <= i.steps; n++) keys.push(`insp.${i.id}.step.${n}`);
    for (const r of i.results) keys.push(`insp.${i.id}.result.${r.result}`);
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
  for (const d of DESTINATION_IDS) {
    keys.push(`destination.${d}.name`, DESTINATIONS[d].town);
    for (const r of DESTINATIONS[d].requirements) keys.push(r.briefing);
  }
  for (const cp of CHECKPOINTS) {
    keys.push(`checkpoint.${cp}`, `officer.${cp}`, `officer.${cp}.priority`);
    if (OFFICERS[cp].reactions.length) keys.push(`officer.${cp}.flags`);
    for (let n = 0; n < BEAT_COUNT; n++) keys.push(`beat.${cp}.${n}`);
  }
  QUEUES.forEach((beats, n) => {
    keys.push(`queue.${n}.go`);
    for (const b of beats) keys.push(b.key, ...(b.from ? [`msg.from.${b.from}`] : []));
  });
  // The title with a saved run, and the ending's next steps.
  keys.push('ui.resume', 'ui.newCrossing', 'ui.retry', 'ui.continueTo', 'ui.pickLevel');
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
    // The one exception is the ending's row label Yury worded (ending review, 2026-11-10),
    // whose value beside it reads in hours: "Time left at border exit" over "5 hours".
    expect(en['ui.timeLeftRow']).toBe('Time left at border exit');
    expect(Object.entries(en).filter(([k, v]) => k !== 'ui.timeLeftRow' && unit.test(v))).toEqual([]);
  });

  // One clock only: the mission card sets up the last bus, not days of leave (BeginStep).
  it('sets up the last bus on the mission card', () => {
    expect(en['ui.lastBus#other']).toMatch(/^Last bus/);
    expect(en['ui.lastBus#other']).toContain('{n} hours');
    expect(en['ui.allowTravel#other']).toContain('{n} hours');
    for (const k of ['mission.title', 'mission.body', 'ui.lastBus#other', 'ui.allowTravel#other']) expect(en[k]).not.toMatch(/days of leave/);
  });

  // The final check says Before you cross; Begin the crossing is only the button (g0q.3).
  it('heads the final check Before you cross', () => {
    expect(en['ui.beforeYouCross']).toBe('Before you cross');
    expect(Object.values(en).filter((v) => v === 'Begin the crossing')).toHaveLength(1);
  });

  // A count is a plural key, `<key>#<CLDR category>`, read by t(key, { n }) through
  // Intl.PluralRules. Every one has the #other form t() falls back to, and any text
  // with {n} is one, so a number never lands in a sentence that cannot agree with it.
  describe.each([['en', en], ['ru', ru]] as const)('%s plural keys', (_, table) => {
    it('use CLDR category names', () => {
      expect(Object.keys(table).filter((k) => k.includes('#') && !/#(zero|one|two|few|many|other)$/.test(k))).toEqual([]);
    });

    it('each have an #other form', () => {
      const bases = Object.keys(table).filter((k) => k.includes('#')).map((k) => k.slice(0, k.indexOf('#')));
      expect([...new Set(bases)].filter((b) => !(`${b}#other` in table))).toEqual([]);
    });

    it('hold every text that takes {n}', () => {
      expect(Object.entries(table).filter(([k, v]) => v.includes('{n}') && !k.includes('#')).map(([k]) => k)).toEqual([]);
    });

    it('never share a name with a plain key', () => {
      const bases = new Set(Object.keys(table).filter((k) => k.includes('#')).map((k) => k.slice(0, k.indexOf('#'))));
      expect([...bases].filter((b) => b in table)).toEqual([]);
    });
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
