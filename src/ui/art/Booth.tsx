// The checkpoint booth as pixel art on a 30x32 grid: an officer silhouette behind
// the glass, a counter, and the light on top. BoothArt is a group for a bigger scene
// (the queue); Booth is the same drawing on its own, for the officer view of the run.

import { Pixels } from './pixels';

export type BoothLight = 'red' | 'green';

// A peaked cap, the head, and shoulders that fill the window below.
const OFFICER = [
  '....oooo....',
  '...oooooo...',
  '..oooooooo..',
  '....oooo....',
  '...oooooo...',
  '...oooooo...',
  '....oooo....',
  '.....oo.....',
  '..oooooooo..',
  '.oooooooooo.',
  'oooooooooooo',
  'oooooooooooo',
  'oooooooooooo',
  'oooooooooooo',
  'oooooooooooo',
  'oooooooooooo',
  'oooooooooooo',
];

/** The booth in its own 30 x 32 cell box. */
export function BoothArt({ light, x = 0, y = 0 }: { light: BoothLight; x?: number; y?: number }) {
  return (
    <g className="booth-art" transform={`translate(${x} ${y})`}>
      <rect className="art-booth" x="0" y="0" width="30" height="4" />
      <g className={`booth-light ${light === 'green' ? 'go' : ''}`} data-light={light}>
        <rect x="25" y="1" width="3" height="2" />
      </g>
      <g className="officer-art"><Pixels rows={OFFICER} palette={{ o: 'art-officer' }} x={9} y={4} /></g>
      <rect className="art-glass" x="2" y="4" width="26" height="17" />
      <rect className="art-glare" x="5" y="15" width="2" height="4" />
      <rect className="art-glare" x="7" y="11" width="2" height="4" />
      <rect className="art-glare" x="9" y="7" width="2" height="4" />
      <rect className="art-booth" x="0" y="4" width="2" height="17" />
      <rect className="art-booth" x="28" y="4" width="2" height="17" />
      <rect className="art-counter" x="-1" y="21" width="32" height="2" />
      <rect className="art-booth" x="0" y="23" width="30" height="9" />
      <rect className="art-booth-panel" x="3" y="25" width="24" height="5" />
    </g>
  );
}

/** The officer view: the booth filling the scene, decoration only. */
export function Booth({ light = 'red' }: { light?: BoothLight }) {
  return (
    <svg className="art pixel booth" viewBox="-2 0 34 32" preserveAspectRatio="xMidYMax meet" shapeRendering="crispEdges" aria-hidden>
      <BoothArt light={light} />
    </svg>
  );
}
