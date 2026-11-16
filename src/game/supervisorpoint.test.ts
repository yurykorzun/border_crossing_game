// The supervisor asks about the point she named (border_crossing_game-dap.49). Found on the
// live site after PR #58: Departure customs announced "A supervisor checks your address here",
// passport had already said "Address settled.", and the interview's inspection then read
// "Reopened by a new flag: your address here." over "Your shuttle has left." with one answer.
// Customs offered "Reveals your father's condition" after passport had noted it, the employer
// question named the employer while the contract still said "Reveals your employer", and a
// formal review's reaction sat under a "Secondary inspection" header before any inspection.
import { describe, expect, it } from 'vitest';
import { setStory, t } from '../i18n';
import { BOT_STYLES, playRun } from './bots';
import type { BotRun } from './bots';
import { fileOf } from './carry';
import { SEPARATOR } from './consequence';
import { INSPECTION_BY_ID } from './content/encounters';
import { inspectionIssue, knownLine, newRun, options, step } from './engine';
import type { RunSetup } from './engine';
import { playStep } from './play';
import { transcriptOf } from './transcript';
import type { CarriedFile, FactId, RunState, Topic } from './types';
import { allSetups } from './walk';

/** Words an inspection's question uses for the point it is about. */
const ASKS: Record<Topic, RegExp> = {
  accommodation: /\b(stay|stayed|staying|address)\b/i,
  purpose: /\bwhy\b/i,
  medicine: /\b(medicine|prescription)\b/i,
} as Record<Topic, RegExp>;

/** The distinct problems, each once with the first run that showed it and how often. */
const distinct = (bad: string[]): string[] => {
  const seen = new Map<string, { first: string; n: number }>();
  for (const b of bad) {
    const kind = b.replace(/ \(.*\)$/, '');
    const x = seen.get(kind);
    if (x) x.n++;
    else seen.set(kind, { first: b, n: 1 });
  }
  return [...seen.values()].map((x) => `${x.n}x ${x.first}`);
};

/** The facts flagged since `topic` was verified: the new reasons that reopened it. */
const flaggedSince = (s: RunState, topic: Topic): FactId[] => (s.flagged ?? []).slice(s.verified?.[topic]?.flags ?? 0);

/** One run from `setup`, checked screen by screen. Returns what it showed that it should not have. */
function check(setup: RunSetup, run: BotRun, label: string, counts: { inspections: number; announced: number; reopened: number }): string[] {
  const bad: string[] = [];
  const tr = transcriptOf(run, setup);
  setStory(setup.level);
  try {
    let s = newRun(setup);
    run.actions.forEach((a, i) => {
      const lines = tr.lines.filter((l) => l.step === i);
      const where = `${s.screen.kind}${'id' in s.screen ? `:${s.screen.id}` : ''}`;
      const at = ` (${label} step ${i})`;
      const card = !s.reaction && !s.documentList && (s.screen.kind === 'encounter' || s.screen.kind === 'inspection');
      // The header names an inspection only on the inspection card itself.
      const header = lines.some((l) => l.key === 'ui.inInspection');
      // The card, or the list of documents behind its "Show a document".
      if (header !== (s.screen.kind === 'inspection' && !s.reaction)) bad.push(`${where}: header ${header ? 'shown' : 'missing'}${s.reaction ? ' on a reaction' : ''}${at}`);
      const question = card ? lines.find((l) => /\.q$/.test(l.key))?.text ?? '' : '';
      if (card && s.screen.kind === 'inspection') {
        counts.inspections++;
        const issue = inspectionIssue(s)!;
        if (s.supervisor && issue !== s.supervisor) bad.push(`${where}: announced ${s.supervisor}, inspects ${issue}${at}`);
        if (!ASKS[issue].test(question)) bad.push(`${where}: asks "${question}", not about ${issue}${at}`);
        const open = options(s).filter((o) => !o.blocked);
        if (open.length < 2) bad.push(`${where}: offers [${open.map((o) => o.approach.id)}]${at}`);
        const [known] = knownLine(s);
        if (known?.key.endsWith('.reopened')) {
          counts.reopened++;
          const f = known.vars?.fact as FactId | undefined;
          if (!f || !flaggedSince(s, issue).includes(f)) bad.push(`${where}: ${issue} reopened naming ${f ?? 'no fact'}${at}`);
        }
      }
      if (card) {
        for (const l of lines)
          for (const k of l.key.split(SEPARATOR)) {
            const m = /^fact\.(\w+)\.reveal$/.exec(k);
            if (!m) continue;
            const f = m[1] as FactId;
            if (s.facts[f]?.length) bad.push(`${where}: "${l.text}" with ${f} on file at [${s.facts[f]}]${at}`);
            else if (question.toLowerCase().includes(t(`fact.${f}`).toLowerCase())) bad.push(`${where}: "${l.text}" under "${question}"${at}`);
          }
      }
      const n = playStep(s, a);
      // The supervisor's announcement names the point, and a point settled on the way names what reopened it.
      for (const e of n.log.slice(s.log.length)) {
        const m = /^supervisor\.announce\.(\w+)/.exec(e.key);
        if (!m) continue;
        counts.announced++;
        const topic = m[1] as Topic;
        if (!n.verified?.[topic]) continue;
        const f = e.vars?.fact as FactId | undefined;
        if (!f || !flaggedSince(n, topic).includes(f)) bad.push(`${where}: announces settled ${topic} again naming ${f ?? 'no fact'}${at}`);
      }
      s = n;
    });
  } finally {
    setStory(undefined);
  }
  return bad;
}

/** A bot run in the level's own wording, as the transcript plays it. */
function played(style: (typeof BOT_STYLES)[number], setup: RunSetup): BotRun {
  setStory(setup.level);
  try {
    return playRun(style, setup);
  } finally {
    setStory(undefined);
  }
}

function sweep(level: 'arrival' | 'departure' | 'funeral') {
  const counts = { inspections: 0, announced: 0, reopened: 0 };
  const bad: string[] = [];
  let runs = 0;
  for (let seed = 1; seed <= 10; seed++)
    for (const base of allSetups(level))
      for (const style of BOT_STYLES) {
        const setup = { ...base, seed };
        bad.push(...check(setup, played(style, setup), `${style} seed ${seed} ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin}`, counts));
        runs++;
      }
  return { bad, runs, counts };
}

describe('the supervisor asks about the point she named (dap.49)', () => {
  for (const level of ['arrival', 'departure', 'funeral'] as const)
    it(`${level}, seeds 1-10, every bot style`, () => {
      const { bad, runs, counts } = sweep(level);
      expect(distinct(bad).slice(0, 25)).toEqual([]);
      expect(runs).toBeGreaterThan(100);
      expect(counts.inspections).toBeGreaterThan(0);
      expect(counts.announced).toBeGreaterThan(0);
    }, 600_000);

  it('Departure carried from Arrival, seeds 1-10, every bot style', () => {
    const counts = { inspections: 0, announced: 0, reopened: 0 };
    const bad: string[] = [];
    let runs = 0;
    const arrivals = allSetups('arrival');
    for (let seed = 1; seed <= 10; seed++)
      BOT_STYLES.forEach((style, k) =>
        arrivals.forEach((base, i) => {
          const setup = { ...base, seed };
          let s = newRun(setup);
          for (const a of played(style, setup).actions) s = step(s, a);
          if (!s.ending) return;
          const file = fileOf(s);
          const out = allSetups('departure').filter((d) => d.character === file.character);
          const next: RunSetup = { ...out[(seed + i + k) % out.length], seed, file: file as CarriedFile };
          bad.push(...check(next, played(style, next), `${style} seed ${seed} ${setup.character} ${setup.loadout.join('+')} ${setup.bulletin} then ${next.loadout.join('+')} ${next.bulletin}`, counts));
          runs++;
        }),
      );
    expect(distinct(bad).slice(0, 25)).toEqual([]);
    expect(runs).toBeGreaterThan(100);
    expect(counts.inspections).toBeGreaterThan(0);
    expect(counts.reopened).toBeGreaterThan(0);
  }, 600_000);

  it('every inspection card is about an issue its question can name', () => {
    for (const id of INSPECTION_BY_ID.keys()) expect(ASKS[INSPECTION_BY_ID.get(id)!.issue], id).toBeDefined();
  });
});
