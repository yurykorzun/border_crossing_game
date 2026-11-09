// Content lint: the structural half of the encounter checklist (docs/design.md
// "Encounter checklist"). The other questions need a person; these four a test
// can answer for every card, so a new card that breaks one fails npm test.
//
// 1. Every related or follow-up card has a reason to appear: a `when`, or a
//    check result that queues it.
// 2. Every answer does something its siblings don't (its kind, effects, check).
// 3. Every scrutiny or time effect is explained: scrutiny names a reason the
//    card can point at, and the reaction text says what the hours are spent on.
// 4. Every card changes something: a resource, a fact, a claim or an option.
//    A calm card is the one exception, because its job is the pause itself.

import type { Approach, Check, CheckId, Cond, Effect, Encounter, FactId, Inspection, ScrutinyReason } from './types';

export interface Content {
  encounters: readonly Encounter[];
  inspections: readonly Inspection[];
  checks: Record<CheckId, Check>;
}

/** Looks up player text by key (t() from src/i18n), or undefined when there is none. */
export type Text = (key: string) => string | undefined;

const HOURS: Record<number, string> = { 1: 'an hour', 2: 'two hours', 3: 'three hours' };
const NUMBER: Record<number, string> = { 1: 'one', 2: 'two', 3: 'three' };

/**
 * Why a reaction does not explain its hours, or null (fsx.12). It must state the
 * hours the answer always costs inside a sentence that says what they are spent
 * on: at least two words before the hours, not "It takes" or "That takes". An
 * extra hour that depends on the day must be stated too (`most`).
 */
export function unexplained(text: string, hours: number, most = hours): string | null {
  const phrase = HOURS[hours];
  if (!phrase) return `no wording for ${hours} hours`;
  const sentence = text.split(/(?<=[.!?"])\s+/).find((x) => x.toLowerCase().includes(phrase));
  if (!sentence) return `does not say "${phrase}"`;
  const before = sentence.slice(0, sentence.toLowerCase().indexOf(phrase)).trim();
  if (before.split(/\s+/).filter(Boolean).length < 2 || /^\W*(it|that|this)\s+takes?\b/i.test(before)) return `"${sentence}" does not say what the time is spent on`;
  if (most !== hours && !text.toLowerCase().includes(NUMBER[most])) return `does not say it can be ${most} hours`;
  return null;
}

/** Hours an effect list always costs, and at most (conditional hours included). */
export function hoursOf(effects: readonly Effect[]): { always: number; most: number } {
  const time = effects.filter((e): e is Effect & { time: number } => 'time' in e);
  return {
    always: -time.filter((e) => !e.when).reduce((n, e) => n + e.time, 0),
    most: -time.reduce((n, e) => n + e.time, 0),
  };
}

/** Facts a condition guarantees are on file (top level only: an `any` guarantees none of its branches). */
const factsIn = (c: Cond | undefined): FactId[] => c?.facts ?? [];

/** What makes an answer different from its siblings. `requires` is left out: two answers that only differ in when they show are the same answer. */
const signature = (a: Approach) =>
  JSON.stringify({ kind: a.kind, topic: a.topic, contacts: a.contacts, namesOnly: a.namesOnly, check: a.check, effects: a.effects });

/** The check results that queue this card. */
const sources = (content: Content, id: string): { check: Check; index: number }[] =>
  Object.values(content.checks).flatMap((check) =>
    check.cases.flatMap((c, index) => (c.followUp === id ? [{ check, index }] : [])));

/**
 * Whether a scrutiny reason is something the card can point at, read from the
 * content alone (the engine checks the same at run time, in scrutinyApplies()).
 * A check: this card is a result of it. A fact: a condition on the card, the
 * answer or the effect puts it on file, an earlier effect of the answer files it,
 * or every check result that queues the card comes with it.
 */
function reasonHolds(content: Content, card: Encounter | Inspection, a: Approach, i: number, reason: ScrutinyReason): boolean {
  const queued = sources(content, card.id);
  if (reason in content.checks) return queued.some((q) => q.check.id === reason);
  const fact = reason as FactId;
  const effect = a.effects[i];
  if ([card.when, a.requires, effect.when].some((c) => factsIn(c).includes(fact))) return true;
  if (a.effects.slice(0, i).some((e) => 'fact' in e && e.fact === fact && !e.when)) return true;
  if (!queued.length) return false;
  // The check found it, or the answer that started the check filed it.
  const files = (es: readonly Effect[] | undefined) => (es ?? []).some((e) => 'fact' in e && e.fact === fact);
  const openers = [...content.encounters, ...content.inspections].flatMap((c) => c.approaches);
  return queued.every(({ check, index }) =>
    files(check.cases[index].effects) || openers.some((o) => o.check === check.id && files(o.effects)));
}

/** Whether an answer changes something: spends a resource, has an effect, or opens a check. */
const changes = (a: Approach) => (a.kind !== 'say' && a.kind !== 'verify') || a.effects.length > 0 || !!a.check;

/** Every structural problem in the content, one line each. Empty means it passes. */
export function lintContent(content: Content, text: Text): string[] {
  const problems: string[] = [];
  const cards: { card: Encounter | Inspection; prefix: string }[] = [
    ...content.encounters.map((card) => ({ card, prefix: 'enc' })),
    ...content.inspections.map((card) => ({ card, prefix: 'insp' })),
  ];

  for (const { card, prefix } of cards) {
    const kind = 'kind' in card && 'checkpoint' in card ? card.kind : 'inspection';

    // 1. A reason to appear.
    if ((kind === 'related' || kind === 'followup') && !card.when && !sources(content, card.id).length)
      problems.push(`${card.id}: no reason to appear (a ${kind} card needs a \`when\` or a check result that queues it)`);

    // 2. Distinct answers.
    const seen = new Map<string, string>();
    for (const a of card.approaches) {
      const sig = signature(a);
      const twin = seen.get(sig);
      if (twin) problems.push(`${card.id}: answers ${twin} and ${a.id} do the same thing`);
      else seen.set(sig, a.id);
    }

    // 3. Explained effects.
    for (const a of card.approaches) {
      a.effects.forEach((e, i) => {
        if ('scrutiny' in e && !reasonHolds(content, card, a, i, e.reason))
          problems.push(`${card.id}.${a.id}: scrutiny for ${e.reason}, which nothing on this card puts on file or checks`);
      });
      const { always, most } = hoursOf(a.effects);
      if (most > 0) {
        const key = `${prefix}.${card.id}.${a.id}.reaction`;
        const line = text(key);
        const why = line === undefined ? 'has no reaction text' : unexplained(line, always, most);
        if (why) problems.push(`${card.id}.${a.id}: costs time but ${key} ${why}`);
      }
    }

    // 4. Changes something.
    const calm = 'calm' in card && card.calm;
    if (!calm && !card.approaches.some(changes))
      problems.push(`${card.id}: no answer changes anything (a resource, a fact, a claim or an option)`);
  }

  for (const check of Object.values(content.checks)) {
    for (const c of check.cases) {
      for (const e of c.effects ?? []) {
        if ('scrutiny' in e && e.reason !== check.id && !factsIn(c.when).includes(e.reason as FactId))
          problems.push(`check ${check.id}.${c.result}: scrutiny for ${e.reason}, which this result does not establish`);
      }
    }
  }
  return problems;
}
