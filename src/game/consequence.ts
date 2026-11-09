// The one line under each answer: what you give up now or put at risk, in plain
// words, with one icon. The full record (claims, facts on file) stays in My story.
// src/ui/parts.tsx renders it and src/game/transcript.ts writes it down, so both
// read the same parts.

import { has } from '../i18n';
import type { Option } from './engine';
import type { ContactId } from './types';

export type PartKind = 'medicine' | 'contact' | 'withdraw' | 'scrutiny' | 'check' | 'time' | 'card' | 'fact' | 'claim' | 'perk' | 'free' | 'blocked';
/** amber: attention or escalation. red: a confirmed serious consequence. */
export type Tone = 'plain' | 'amber' | 'red';
export type IconKind = 'document' | 'clock' | 'check' | 'shield' | 'flag';

export interface Part {
  kind: PartKind;
  key: string;
  vars?: Record<string, string | number>;
  /** Plural count: render with tn(key, n). */
  n?: number;
  tone: Tone;
}

export interface Consequence {
  icon: IconKind;
  parts: Part[];
}

export const MAX_PARTS = 3;
export const SEPARATOR = ' · ';

/** Most serious first. Picks the icon and decides what goes when there are more than 3 parts. */
const SEVERITY: PartKind[] = ['medicine', 'contact', 'withdraw', 'scrutiny', 'check', 'time', 'card', 'fact', 'claim', 'perk', 'free', 'blocked'];
/** Never dropped from the line. */
const KEEP: PartKind[] = ['medicine', 'contact', 'scrutiny', 'time'];
/** Reading order on the line: what you hand over, then what happens, then what it costs. */
const ORDER: PartKind[] = ['card', 'contact', 'fact', 'claim', 'check', 'time', 'scrutiny', 'medicine', 'withdraw', 'perk', 'free', 'blocked'];

const ICON: Record<PartKind, IconKind> = {
  medicine: 'shield',
  contact: 'document',
  withdraw: 'flag',
  scrutiny: 'shield',
  check: 'shield',
  time: 'clock',
  card: 'document',
  fact: 'document',
  claim: 'check',
  perk: 'check',
  free: 'check',
  blocked: 'document',
};

/**
 * The parts for one answer. `cardKey` is the answer's key without `.label`
 * (`enc.p_purpose.family`): a `<cardKey>.check` text, when there is one, names the
 * check ("Register check").
 */
export function consequence(o: Option, cardKey: string, protectedContact: ContactId): Consequence {
  const a = o.approach;
  if (o.blocked) return { icon: 'document', parts: [{ kind: 'blocked', key: `ui.blocked.${o.blocked}`, tone: 'plain' }] };

  const all: Part[] = [];
  if (o.card) all.push({ kind: 'card', key: 'ui.line.uses', vars: { cardShort: o.card }, tone: 'plain' });
  if (o.contact)
    all.push({ kind: 'contact', key: 'ui.line.contact', vars: { contact: o.contact }, tone: o.contact === protectedContact ? 'red' : 'amber' });
  // Time and scrutiny are summed, so a weakness reads "Costs 2 hours", not two parts.
  let time = 0;
  let scrutiny = 0;
  const claims: string[] = [];
  for (const e of o.effects) {
    if ('time' in e) time += e.time;
    else if ('scrutiny' in e) scrutiny += e.scrutiny;
    else if ('loseMedicine' in e) all.push({ kind: 'medicine', key: 'ui.line.medicine', tone: 'red' });
    else if ('fact' in e) all.push({ kind: 'fact', key: `fact.${e.fact}.reveal`, tone: 'plain' });
    else if ('claim' in e) claims.push(e.claim);
  }
  const checkKey = `${cardKey}.check`;
  if (a.check || has(checkKey)) all.push({ kind: 'check', key: has(checkKey) ? checkKey : 'ui.line.check', tone: 'amber' });
  if (time) all.push({ kind: 'time', key: 'ui.line.time', n: Math.abs(time), tone: 'plain' });
  if (scrutiny) all.push({ kind: 'scrutiny', key: 'ui.line.scrutiny', vars: { n: scrutiny }, tone: 'amber' });
  if (a.kind === 'withdraw') all.push({ kind: 'withdraw', key: 'ui.line.withdraw', tone: 'plain' });
  // A claim only shows when nothing else does: "Recorded as your reason for visiting".
  if (!all.length && claims.length) all.push({ kind: 'claim', key: `claim.${claims[0]}.recorded`, tone: 'plain' });
  if (a.kind === 'perk') all.push({ kind: 'perk', key: 'ui.line.perk', tone: 'plain' });
  if (!all.length) all.push({ kind: 'free', key: 'ui.line.free', tone: 'plain' });

  const rank = (p: Part) => (KEEP.includes(p.kind) ? -1 : 0) * 100 + SEVERITY.indexOf(p.kind);
  const kept = [...all].sort((x, y) => rank(x) - rank(y)).slice(0, MAX_PARTS);
  const icon = ICON[[...kept].sort((x, y) => SEVERITY.indexOf(x.kind) - SEVERITY.indexOf(y.kind))[0].kind];
  return { icon, parts: kept.sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind)) };
}
