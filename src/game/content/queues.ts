// The queue before each checkpoint: a short scene that plays one beat per tap,
// then one button walks you up to the officer. No prose here: each beat's text
// is msg.<checkpoint>.<i> in src/i18n/en.ts (msg.<checkpoint>.<i>.<character>
// for a beat only one traveler sees), and the button is queue.<checkpoint>.go.

import type { CharacterId, FactId, RunState } from '../types';
import { STATEMENTS } from './encounters';

/** phone: a message from someone, with the sender. speech and narration: what you hear or see in the queue. */
export type QueueKind = 'phone' | 'speech' | 'narration';

/** Who a phone message is from (msg.from.<id>). */
export type Sender = 'mother' | 'sister' | 'work';

export interface QueueBeat {
  key: string;
  kind: QueueKind;
  from?: Sender;
  /** Only this traveler sees the beat. */
  character?: CharacterId;
  /** Only a run with this fact on file sees the beat: the statement your friend's sister gave the border (Level.statements). */
  fact?: FactId;
  /** Only a run with no contact statement sees the beat: your mother's news in Arrival. */
  noStatement?: true;
  /** The booth light turns green on this beat (the clerk's "Next."). */
  light?: 'green';
}

const beat = (key: string, kind: QueueKind, extra: Omit<QueueBeat, 'key' | 'kind'> = {}): QueueBeat => ({ key, kind, ...extra });

/** One queue per checkpoint, in CHECKPOINTS order. Every queue opens on the phone. */
export const QUEUES: readonly (readonly QueueBeat[])[] = [
  [
    beat('msg.0.0', 'phone', { from: 'mother', noStatement: true }),
    // The funeral: what your friend's sister told the border, in her own message.
    beat('msg.0.0.sisterSaysDays', 'phone', { from: 'sister', fact: 'sisterSaysDays' }),
    beat('msg.0.0.sisterSaysWeeks', 'phone', { from: 'sister', fact: 'sisterSaysWeeks' }),
    beat('msg.0.1.lena', 'phone', { from: 'mother', character: 'lena' }),
    beat('msg.0.1.mark', 'phone', { from: 'mother', character: 'mark' }),
    beat('msg.0.2', 'speech'),
    beat('msg.0.3', 'speech', { light: 'green' }),
  ],
  [
    beat('msg.1.0', 'phone', { from: 'work' }),
    beat('msg.1.1', 'narration'),
    beat('msg.1.2', 'speech'),
    beat('msg.1.3', 'narration'),
    beat('msg.1.4', 'speech'),
    beat('msg.1.5', 'speech'),
  ],
  [
    beat('msg.2.0', 'phone', { from: 'mother' }),
    beat('msg.2.1', 'narration'),
    beat('msg.2.2', 'narration'),
    beat('msg.2.3', 'speech'),
    beat('msg.2.4', 'narration'),
    beat('msg.2.5', 'speech'),
  ],
];

/** The beats this traveler sees in the queue before checkpoint `next`, in this run. */
export function queueBeats(next: number, s: Pick<RunState, 'character' | 'facts'>): QueueBeat[] {
  const statement = STATEMENTS.some((x) => s.facts[x.fact]);
  return (QUEUES[next] ?? []).filter((b) =>
    (!b.character || b.character === s.character) && (!b.fact || !!s.facts[b.fact]) && !(b.noStatement && statement));
}

/**
 * The phone messages this traveler has seen so far, oldest first, for My story.
 * In a queue, `shown` is how many of its beats are up; queues already passed count in full.
 */
export function messagesSoFar(s: Pick<RunState, 'character' | 'facts' | 'checkpoint' | 'screen' | 'reaction'>, shown = Infinity): QueueBeat[] {
  const sc = s.screen;
  // The last reaction before a queue shows with that queue already set, but not started yet.
  const passed = sc.kind === 'between' ? sc.next : Math.min(s.checkpoint, QUEUES.length - 1) + 1;
  const beats: QueueBeat[] = [];
  for (let q = 0; q < passed; q++) beats.push(...queueBeats(q, s));
  if (sc.kind === 'between' && !s.reaction) beats.push(...queueBeats(sc.next, s).slice(0, shown));
  return beats.filter((b) => b.kind === 'phone');
}
