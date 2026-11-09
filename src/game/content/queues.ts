// The queue before each checkpoint: a short scene that plays one beat per tap,
// then one button walks you up to the officer. No prose here: each beat's text
// is msg.<checkpoint>.<i> in src/i18n/en.ts (msg.<checkpoint>.<i>.<character>
// for a beat only one traveler sees), and the button is queue.<checkpoint>.go.

import type { CharacterId } from '../types';

/** phone: a message in the phone panel. speech and narration: a caption over the scene. */
export type QueueKind = 'phone' | 'speech' | 'narration';

/** Who a phone message is from (msg.from.<id>). */
export type Sender = 'mother' | 'work';

export interface QueueBeat {
  key: string;
  kind: QueueKind;
  from?: Sender;
  /** Only this traveler sees the beat. */
  character?: CharacterId;
}

const beat = (key: string, kind: QueueKind, extra: Omit<QueueBeat, 'key' | 'kind'> = {}): QueueBeat => ({ key, kind, ...extra });

/** One queue per checkpoint, in CHECKPOINTS order. Every queue opens on the phone. */
export const QUEUES: readonly (readonly QueueBeat[])[] = [
  [
    beat('msg.0.0', 'phone', { from: 'mother' }),
    beat('msg.0.1.lena', 'phone', { from: 'mother', character: 'lena' }),
    beat('msg.0.1.mark', 'phone', { from: 'mother', character: 'mark' }),
    beat('msg.0.2', 'speech'),
    beat('msg.0.3', 'speech'),
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

/** The beats this traveler sees in the queue before checkpoint `next`. */
export function queueBeats(next: number, character: CharacterId): QueueBeat[] {
  return (QUEUES[next] ?? []).filter((b) => !b.character || b.character === character);
}
