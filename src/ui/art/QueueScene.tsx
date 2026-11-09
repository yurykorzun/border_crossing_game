// The passport queue as one static pixel-art scene on a 96x64 grid: the rope line,
// the booth with its light, the passenger ahead, and your hand holding the passport
// in the foreground. Only the booth light changes: red until "Next.", then green.

import { BoothArt } from './Booth';
import type { BoothLight } from './Booth';
import { Pixels } from './pixels';
import type { CharacterId } from '../../game/types';

// Seen from behind: head, coat, a strap across the back to a bag at the hip, legs.
const PASSENGER = [
  '....pppp....',
  '...pppppp...',
  '...pppppp...',
  '....pppp....',
  '..appppppp..',
  '.papppppppp.',
  '.ppappppppp.',
  '.pppapppppp.',
  '.ppppappppp.',
  '.pppppapppp.',
  '.ppppppappp.',
  '.pppppppapgg',
  '.ppppppppagg',
  '.pppppppppgg',
  '.pppppppppgg',
  '.pppppppppp.',
  '..pppppppp..',
  '..pppppppp..',
  '..ppp..ppp..',
  '..ppp..ppp..',
  '..ppp..ppp..',
  '..pp....pp..',
];

// The passport, its cover emblem and two lines of gold lettering.
const PASSPORT = [
  'llllllllllllllllll',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnyyyynnnnnnl',
  'lnnnnnynnnnynnnnnl',
  'lnnnnnynnnnynnnnnl',
  'lnnnnnynnnnynnnnnl',
  'lnnnnnynnnnynnnnnl',
  'lnnnnnnyyyynnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnyyyyyyyyyynnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnyyyyyyyynnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'lnnnnnnnnnnnnnnnnl',
  'llllllllllllllllll',
];

// Fingers behind the passport's edge, the thumb over its front, the cuff below.
const HAND = [
  '.....ssss.',
  '...sssssss',
  '..ssssddss',
  '.sssssddss',
  '.sssssssss',
  'ssssssssss',
  'sssssssss.',
  'ssssssss..',
  'cccccccccc',
  'cccccccccc',
  'cccccccccc',
  'cccccccccc',
  'cccccccccc',
  'cccccccccc',
];

// Rope posts, 16 cells apart; the first stands off the left edge so the rope runs in from there.
const POSTS = [-14, 2, 18];

/**
 * A 64x60 grid, anchored to the bottom of the scene and fit to its width: the phone
 * scene is taller than wide, so the wall simply continues above (.scene-passport).
 * The sleeve in the foreground is the traveler's own jacket, as in the portrait.
 */
export function QueueScene({ light, character }: { light: BoothLight; character: CharacterId }) {
  return (
    <svg className="art pixel queue-art" viewBox="0 0 64 60" preserveAspectRatio="xMidYMax meet" shapeRendering="crispEdges" aria-hidden>
      <rect className="art-wall" x="0" y="0" width="64" height="36" />
      <rect className="art-floor" x="0" y="36" width="64" height="24" />
      <rect className="art-skirting" x="0" y="36" width="64" height="1" />
      <rect className="art-skirting" x="0" y="45" width="64" height="1" />
      <rect className="art-skirting" x="0" y="55" width="64" height="1" />

      <BoothArt light={light} x={33} y={5} />
      <Pixels rows={PASSENGER} palette={{ p: 'art-passenger', a: 'art-bag', g: 'art-bag' }} x={20} y={16} />

      {/* The rope line: posts with a sagging rope between them. */}
      {POSTS.map((x) => (
        <g key={x} className="art-post">
          <rect x={x - 1} y="30" width="3" height="2" />
          <rect x={x} y="32" width="1" height="10" />
          <rect x={x - 2} y="42" width="5" height="1" />
        </g>
      ))}
      {POSTS.slice(1).map((x) => (
        <g key={x} className="art-rope">
          <rect x={x - 15} y="32" width="3" height="1" />
          <rect x={x - 12} y="33" width="2" height="1" />
          <rect x={x - 10} y="34" width="5" height="1" />
          <rect x={x - 5} y="33" width="2" height="1" />
          <rect x={x - 3} y="32" width="3" height="1" />
        </g>
      ))}

      {/* Your hand and passport, close to the eye. */}
      <Pixels rows={PASSPORT} palette={{ l: 'art-passport-edge', n: 'art-passport', y: 'art-emblem' }} x={43} y={27} />
      <Pixels rows={HAND} palette={{ s: 'art-skin', d: 'art-skin-shade', c: `art-coat-${character}` }} x={37} y={45} />
    </svg>
  );
}
