// The checkpoint booth as pixel art on a 30x32 grid: an officer silhouette behind
// the glass, a counter, and the light on top. BoothArt is a group for a bigger scene
// (the queue). The run's counter view is CheckpointScene, which shares OFFICER (officer.ts).

import { OFFICER } from './officer';
import { Pixels } from './pixels';

export type BoothLight = 'red' | 'green';

// The far queue on the other side, seen through the glass on either side of the officer.
const CROWD = [
  '.qq..qq.............qq..qq',
  '.qq..qq.............qq..qq',
  'qqqqqqqq...........qqqqqqq',
  'qqqqqqqq...........qqqqqqq',
  'qqqqqqqq...........qqqqqqq',
  'qqqqqqqq...........qqqqqqq',
];

// Your passport, lying on the counter.
const PASSPORT = [
  'rrrrrrr',
  'rrryrrr',
];

/**
 * The booth in its own 30 x 32 cell box. `counter` is the officer view from the
 * traveler's side: the far queue behind the officer and your passport on the counter.
 */
export function BoothArt({ light, x = 0, y = 0, counter = false }: { light: BoothLight; x?: number; y?: number; counter?: boolean }) {
  return (
    <g className="booth-art" transform={`translate(${x} ${y})`}>
      <rect className="art-booth" x="0" y="0" width="30" height="4" />
      <g className={`booth-light ${light === 'green' ? 'go' : ''}`} data-light={light}>
        <rect x="25" y="1" width="3" height="2" />
      </g>
      {counter && <Pixels rows={CROWD} palette={{ q: 'art-crowd' }} x={2} y={12} />}
      <g className="officer-art"><Pixels rows={OFFICER} palette={{ o: 'art-officer', a: 'art-amber' }} x={9} y={4} /></g>
      <rect className="art-glass" x="2" y="4" width="26" height="17" />
      <rect className="art-glare" x="5" y="15" width="2" height="4" />
      <rect className="art-glare" x="7" y="11" width="2" height="4" />
      <rect className="art-glare" x="9" y="7" width="2" height="4" />
      <rect className="art-booth" x="0" y="4" width="2" height="17" />
      <rect className="art-booth" x="28" y="4" width="2" height="17" />
      <rect className="art-counter" x="-1" y="21" width="32" height="2" />
      <rect className="art-booth" x="0" y="23" width="30" height="9" />
      <rect className="art-booth-panel" x="3" y="25" width="24" height="5" />
      {counter && <Pixels rows={PASSPORT} palette={{ r: 'art-passport', y: 'art-amber' }} x={18} y={20} />}
    </g>
  );
}
