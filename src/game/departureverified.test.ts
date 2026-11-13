// Departure inspection knows the address was verified (border_crossing_game-dap.43). Found on
// the live site after PR #56: on a day the bulletin orders every host phoned, naming your mother
// at a Departure desk read "Address verified." although the name settles nothing until the check,
// and the Scrutiny 3/3 secondary inspection then said "Not verified yet: your address here." The
// same inspection offered "Take the later shuttle" at "Bus needs 3 hours left", and its result
// said "Station now 3 hours away" on a trip that ends at the airport.
import { describe, expect, it } from 'vitest';
import { setStory, t, tn } from '../i18n';
import { BOT_STYLES, playRun } from './bots';
import { fileOf } from './carry';
import { changeLines, changeText, consequence } from './consequence';
import { CHARACTERS } from './content/world';
import { answerKey, deskOf, knownLine, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import { eventsBetween } from './play';
import type { Action, CarriedFile, RunState, Topic } from './types';
import { allSetups } from './walk';

/** A word for transport that belongs to the other levels, not to the shuttle to the airport. */
const NOT_THE_SHUTTLE = /\b(bus|buses|station)\b/i;

/** What one Departure run showed that it should not have. */
interface Seen {
  /** An inspection line "Not verified yet: X." after a desk said X was verified. */
  notVerified: string[];
  /** An option, cost or result naming a bus or a station. */
  transport: string[];
}

/** The answers on screen as they read: each label and its cost line. */
function optionTexts(s: RunState): string[] {
  if (s.reaction || (s.screen.kind !== 'encounter' && s.screen.kind !== 'inspection')) return [];
  const prefix = s.screen.kind === 'inspection' ? 'insp' : 'enc';
  const out: string[] = [];
  for (const o of options(s)) {
    if (!o.blocked && !o.documents) {
      const vars: Record<string, string> = {};
      if (o.card) vars.card = vars.cardThe = o.card;
      if (o.contact) vars.contact = vars.contactMine = o.contact;
      out.push(t(answerKey(s, o.approach.id, 'label'), vars));
    }
    const cost = consequence(o, `${prefix}.${s.screen.id}.${o.approach.id}`, CHARACTERS[s.character].protectedContact, deskOf(s), s);
    out.push(cost.parts.map((x) => (x.n === undefined ? t(x.key, x.vars) : tn(x.key, x.n, x.vars))).join(' · '));
  }
  return out;
}

/** Plays one Departure run from `setup` and reports what it showed. */
function departure(setup: RunSetup, actions: Action[], label: string, seen: Seen, counts: { verifiedThenInspected: number; connection: number }): void {
  setStory('departure');
  try {
    // Every point a desk in this run said or showed was verified.
    const verified = new Set<Topic>();
    let s = newRun(setup);
    for (const a of actions) {
      for (const x of optionTexts(s)) if (NOT_THE_SHUTTLE.test(x)) seen.transport.push(`${label} ${s.screen.kind}:${'id' in s.screen ? s.screen.id : ''} option "${x}"`);
      if (s.screen.kind === 'inspection' && s.screen.id === 's_connection') counts.connection++;
      const n = step(s, a);
      for (const c of changeLines(eventsBetween(s, n, a), CHARACTERS[s.character].protectedContact)) {
        const line = changeText(c);
        if (NOT_THE_SHUTTLE.test(line)) seen.transport.push(`${label} result "${line}"`);
        const m = /^(?:change\.verified|resolve(?:\.used)?)\.(\w+)$/.exec(c.key);
        if (m) verified.add(m[1] as Topic);
      }
      for (const topic of Object.keys(n.verified ?? {}) as Topic[]) verified.add(topic);
      s = n;
      if (s.screen.kind !== 'inspection' || s.reaction) continue;
      const [line] = knownLine(s);
      for (const topic of verified) {
        if (line?.key.startsWith(`insp.issue.${topic}`)) counts.verifiedThenInspected++;
        if (line?.key === `insp.issue.${topic}`) seen.notVerified.push(`${label} ${s.screen.id}: "${t(line.key)}" after ${topic} was verified`);
      }
    }
  } finally {
    setStory(undefined);
  }
}

describe('Departure never says "Not verified yet" for a point a desk verified, and its shuttle is no bus', () => {
  it('standalone Departure setups, seeds 1-10, every bot style', () => {
    const seen: Seen = { notVerified: [], transport: [] };
    const counts = { verifiedThenInspected: 0, connection: 0 };
    let runs = 0;
    for (let seed = 1; seed <= 10; seed++)
      for (const base of allSetups('departure'))
        for (const style of BOT_STYLES) {
          const setup = { ...base, seed };
          departure(setup, playRun(style, setup).actions, `${style} seed ${seed} ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin}`, seen, counts);
          runs++;
        }
    expect(seen.notVerified.slice(0, 10)).toEqual([]);
    expect(seen.transport.slice(0, 10)).toEqual([]);
    expect(runs).toBeGreaterThan(1000);
    expect(counts.verifiedThenInspected).toBeGreaterThan(0);
    expect(counts.connection).toBeGreaterThan(0);
  }, 300_000);

  it('Departure carried from Arrival, seeds 1-10, every bot style', () => {
    const seen: Seen = { notVerified: [], transport: [] };
    const counts = { verifiedThenInspected: 0, connection: 0 };
    let runs = 0;
    const arrivals = allSetups('arrival');
    for (let seed = 1; seed <= 10; seed++)
      BOT_STYLES.forEach((style, k) =>
        arrivals.forEach((base, i) => {
          const setup = { ...base, seed };
          let s = newRun(setup);
          for (const a of playRun(style, setup).actions) s = step(s, a);
          if (!s.ending) return;
          const file = fileOf(s);
          const out = allSetups('departure').filter((d) => d.character === file.character);
          const next: RunSetup = { ...out[(seed + i + k) % out.length], seed, file: file as CarriedFile };
          setStory('departure');
          let actions: Action[];
          try {
            actions = playRun(style, next).actions;
          } finally {
            setStory(undefined);
          }
          departure(next, actions, `${style} seed ${seed} ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin} then ${next.loadout.join('+')} ${next.bulletin}`, seen, counts);
          runs++;
        }),
      );
    expect(seen.notVerified.slice(0, 10)).toEqual([]);
    expect(seen.transport.slice(0, 10)).toEqual([]);
    expect(runs).toBeGreaterThan(1000);
    expect(counts.verifiedThenInspected).toBeGreaterThan(0);
    expect(counts.connection).toBeGreaterThan(0);
  }, 300_000);
});
