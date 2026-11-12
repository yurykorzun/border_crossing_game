// The queue before each checkpoint: a short scene that plays one beat per tap,
// then one button walks you up to the officer. No prose here: each beat's text
// is msg.<checkpoint>.<i> in src/i18n/en.ts (msg.<checkpoint>.<i>.<character>
// for a beat only one traveler sees), and the button is queue.<checkpoint>.go.
//
// The phone message that opens a queue after a desk follows what happened there
// (QueueMood in src/game/types.ts): after a delay your mother asks if you are
// through, after a call she says the officer asked about your relative, after a
// smooth desk she writes something ordinary. Queues offer no choice, because
// nothing in them changes what comes next.

import type { CharacterId, ContactId, FactId, QueueMood, RunState } from '../types';

/** phone: a message from someone, with the sender. speech and narration: what you hear or see in the queue. */
export type QueueKind = 'phone' | 'speech' | 'narration';

/** Who a phone message is from (msg.from.<id>): your mother, a relative you can name, work, or your friend's sister (The funeral). */
export type Sender = ContactId | 'work' | 'sister';

export interface QueueBeat {
  key: string;
  kind: QueueKind;
  from?: Sender;
  /** Only this traveler sees the beat. */
  character?: CharacterId;
  /** The booth light turns green on this beat (the clerk's "Next."). */
  light?: 'green';
  /** Only after a desk that went this way (QueueMood). */
  after?: QueueMood;
  /** A small kindness from a stranger or an officer, with nothing asked back. */
  kindness?: true;
  /** Only a run with this fact on file sees the beat: the contact statement its level gave the border (Level.statements). */
  fact?: FactId;
}

const beat = (key: string, kind: QueueKind, extra: Omit<QueueBeat, 'key' | 'kind'> = {}): QueueBeat => ({ key, kind, ...extra });

/** Your mother's message after a desk, one per way it went, in the queue before checkpoint `q`. */
const motherAfter = (q: number): QueueBeat[] => [
  beat(`msg.${q}.after.call.lena`, 'phone', { from: 'mother', after: 'call', character: 'lena' }),
  beat(`msg.${q}.after.call.mark`, 'phone', { from: 'mother', after: 'call', character: 'mark' }),
  beat(`msg.${q}.after.delay`, 'phone', { from: 'mother', after: 'delay' }),
  beat(`msg.${q}.after.smooth`, 'phone', { from: 'mother', after: 'smooth' }),
];

/** One queue per checkpoint, in CHECKPOINTS order. Every queue opens on the phone. */
export const QUEUES: readonly (readonly QueueBeat[])[] = [
  [
    beat('msg.0.0', 'phone', { from: 'mother' }),
    beat('msg.0.1.lena', 'phone', { from: 'mother', character: 'lena' }),
    beat('msg.0.1.mark', 'phone', { from: 'mother', character: 'mark' }),
    // The funeral: what your friend's sister told the border, in her own message.
    beat('msg.0.sister.sisterSaysDays', 'phone', { from: 'sister', fact: 'sisterSaysDays' }),
    beat('msg.0.sister.sisterSaysWeeks', 'phone', { from: 'sister', fact: 'sisterSaysWeeks' }),
    // The relative's own ordinary line, before any card can offer to name them (PERSONAL_LINES).
    beat('msg.0.personal.lena', 'phone', { from: 'cousin', character: 'lena' }),
    beat('msg.0.personal.mark', 'phone', { from: 'brother', character: 'mark' }),
    beat('msg.0.2', 'speech'),
    beat('msg.0.3', 'speech', { light: 'green' }),
  ],
  [
    ...motherAfter(1),
    beat('msg.1.1', 'narration', { kindness: true }),
    // How much cash you carry, before the inspector asks (c_cash, d_declared).
    beat('msg.1.cash', 'narration'),
    beat('msg.1.5', 'speech'),
  ],
  [
    ...motherAfter(2),
    beat('msg.2.1', 'narration', { kindness: true }),
    beat('msg.2.3', 'speech'),
    beat('msg.2.5', 'speech'),
  ],
];

/**
 * Each contact's first ordinary line, shown in the passport queue, so every person
 * you can name has spoken before any card or check offers to name them.
 */
export const PERSONAL_LINES: Record<CharacterId, Partial<Record<ContactId, string>>> = {
  lena: { mother: 'msg.0.0', cousin: 'msg.0.personal.lena' },
  mark: { mother: 'msg.0.0', brother: 'msg.0.personal.mark' },
};

/** The message on the packing screen, before you choose what to carry: work wants a return date. */
export const PREPARATION_MESSAGE: QueueBeat = beat('msg.prep', 'phone', { from: 'work' });

/** The beats this traveler sees in the queue before checkpoint `next`, after the desk went the way `s.after` says. */
export function queueBeats(next: number, s: Pick<RunState, 'character' | 'after'> & { facts?: RunState['facts'] }): QueueBeat[] {
  const mood = s.after?.[next] ?? 'smooth';
  return (QUEUES[next] ?? []).filter((b) => (!b.character || b.character === s.character) && (!b.after || b.after === mood)
    && (!b.fact || !!s.facts?.[b.fact]));
}

/**
 * The phone messages this traveler has seen so far, oldest first, for My story.
 * In a queue, `shown` is how many of its beats are up; queues already passed count in full.
 */
export function messagesSoFar(s: Pick<RunState, 'character' | 'checkpoint' | 'screen' | 'reaction' | 'after'> & { facts?: RunState['facts'] }, shown = Infinity): QueueBeat[] {
  const sc = s.screen;
  // The last reaction before a queue shows with that queue already set, but not started yet.
  const passed = sc.kind === 'between' ? sc.next : Math.min(s.checkpoint, QUEUES.length - 1) + 1;
  const beats: QueueBeat[] = [];
  for (let q = 0; q < passed; q++) beats.push(...queueBeats(q, s));
  if (sc.kind === 'between' && !s.reaction) beats.push(...queueBeats(sc.next, s).slice(0, shown));
  return beats.filter((b) => b.kind === 'phone');
}
