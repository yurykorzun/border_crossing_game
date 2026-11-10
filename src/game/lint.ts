// Content lint: the structural half of the encounter checklist (docs/design.md
// "Encounter checklist"). The other questions need a person; these four a test
// can answer for every card, so a new card that breaks one fails npm test.
//
// 1. Every related or follow-up card has a reason to appear: a `when`, or a
//    check result that queues it.
// 2. Every answer does something its siblings don't (its kind, effects, check).
// 3. Every scrutiny or time effect is explained: scrutiny names a reason the
//    card can point at, and the reaction text (or a check result's outcome
//    line) says what the hours are spent on, without a count of its own.
// 4. Every card changes something: a resource, a fact, a claim or an option.
//    A calm card with its one answer is the only exception, because its job
//    is the pause itself (fsx.6: the free answer the honest run counts on).

import type { Approach, Check, CheckId, Cond, Effect, Encounter, FactId, Inspection, ScrutinyReason } from './types';

export interface Content {
  encounters: readonly Encounter[];
  inspections: readonly Inspection[];
  checks: Record<CheckId, Check>;
}

/** Looks up player text by key (t() from src/i18n), or undefined when there is none. */
export type Text = (key: string) => string | undefined;

/**
 * Why a time-costing reaction does not explain its hours, or null (fsx.12,
 * dhv.1). It says what the hours are spent on and leaves the count to the
 * engine: the result already adds an "N hours lost" line, and a fixed count in
 * the prose goes wrong on a records day or when a weakness or call-in adds an
 * hour. So no "hour" or "minute" in it at all, at least three words, and no
 * bare "It takes" or "That takes".
 */
export function unexplained(text: string): string | null {
  const sentences = text.split(/(?<=[.!?"])\s+/).filter(Boolean);
  const counted = sentences.find((x) => /\b(hours?|minutes?)\b/i.test(x));
  if (counted) return `"${counted}" states the hours, which the result line already shows`;
  if (text.split(/\s+/).filter(Boolean).length < 3) return `"${text}" does not say what the time is spent on`;
  const vague = sentences.find((x) => /^\W*(it|that|this)\s+takes?\b/i.test(x));
  if (vague) return `"${vague}" does not say what the time is spent on`;
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

/**
 * What makes an answer different from its siblings: its effects, its check and
 * what it spends. `requires` is left out: two answers that only differ in when
 * they show are the same answer. Say and verify spend nothing of their own, so
 * they count as one kind and a say and a verify with the same effects are twins
 * (a verify on a weak topic costs an extra hour, but that comes from the
 * character, not the card). Evidence spends a document, a contact exposes
 * someone, a perk uses the perk and withdraw ends the run, so those stay apart.
 */
const spends = (a: Approach) => (a.kind === 'say' || a.kind === 'verify' ? 'nothing' : a.kind);
const signature = (a: Approach) =>
  canonical({ spends: spends(a), topic: a.topic, contacts: a.contacts, namesOnly: a.namesOnly, check: a.check, effects: a.effects });

/**
 * One string per value, whatever order its keys were written in, so two effects
 * that say the same thing compare equal. Array order is kept, because it means
 * something: effects apply in turn (a `send` sends what is on file by then) and
 * a contact list is tried first to last.
 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`;
  return JSON.stringify(v);
}

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
  // An earlier effect files it always, or under the very condition this scrutiny has.
  const same = (c: Cond | undefined) => !c || JSON.stringify(c) === JSON.stringify(effect.when);
  if (a.effects.slice(0, i).some((e) => 'fact' in e && e.fact === fact && same(e.when))) return true;
  if (!queued.length) return false;
  // The check found it, or the answer that started the check filed it.
  const files = (es: readonly Effect[] | undefined) => (es ?? []).some((e) => 'fact' in e && e.fact === fact);
  const openers = [...content.encounters, ...content.inspections].flatMap((c) => c.approaches);
  return queued.every(({ check, index }) =>
    files(check.cases[index].effects) || openers.some((o) => o.check === check.id && files(o.effects)));
}

/**
 * Whether an effect can do anything, by the rules apply() in engine.ts uses:
 * hours and scrutiny move either way, so only 0 is nothing, and travel only
 * ever adds hours (a negative amount is clamped to 0), so only more than 0 counts.
 */
const acts = (e: Effect) =>
  !('time' in e && e.time === 0) && !('scrutiny' in e && e.scrutiny === 0) && !('travel' in e && e.travel <= 0);

/** Whether an answer changes something: spends a resource, has an effect that acts, or opens a check. */
const changes = (a: Approach) => (a.kind !== 'say' && a.kind !== 'verify') || a.effects.some(acts) || !!a.check;

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
      if (hoursOf(a.effects).most > 0) {
        const key = `${prefix}.${card.id}.${a.id}.reaction`;
        const line = text(key);
        const why = line === undefined ? 'has no reaction text' : unexplained(line);
        if (why) problems.push(`${card.id}.${a.id}: costs time but ${key} ${why}`);
      }
    }

    // 4. Changes something. The calm exception is narrow: exactly one answer,
    // so a calm flag cannot hide a choice where nothing happens.
    const calm = 'calm' in card && card.calm && card.approaches.length === 1;
    if (!calm && !card.approaches.some(changes))
      problems.push(`${card.id}: no answer changes anything (a resource, a fact, a claim or an option)`);
  }

  for (const check of Object.values(content.checks)) {
    for (const c of check.cases) {
      for (const e of c.effects ?? []) {
        if ('scrutiny' in e && e.reason !== check.id && !factsIn(c.when).includes(e.reason as FactId))
          problems.push(`check ${check.id}.${c.result}: scrutiny for ${e.reason}, which this result does not establish`);
      }
      // A result that costs time says what the hours go on, in its outcome line.
      if (hoursOf(c.effects ?? []).most > 0) {
        const key = `check.${check.id}.${c.result}`;
        const line = text(key);
        const why = line === undefined ? 'has no outcome text' : unexplained(line);
        if (why) problems.push(`check ${check.id}.${c.result}: costs time but ${key} ${why}`);
      }
    }
  }
  return problems;
}
