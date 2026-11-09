// The queue scenes, one per checkpoint, static pixel art on a 64x60 grid. The
// passport queue (QueueScene): the rope line,
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

// The jar of honey the inspector at the next table holds up to the light.
const JAR = [
  '.kk.',
  'hhhh',
  'hhhh',
  'hhhh',
];

// The inspector at the next table, side on, one arm raised towards the jar.
const INSPECTOR = [
  '.....o...',
  '.....o...',
  'oooo.o...',
  'oooo.o...',
  '.oo..o...',
  'oooooo...',
  'oooooo...',
  'ooaooo...',
  'oooooo...',
  'oooooo...',
  'oooooo...',
];

/** The customs queue (queue 2): steel tables, the inspector with the honey, the woman ahead, your bag in your hand. */
export function CustomsQueueScene({ character }: { character: CharacterId }) {
  return (
    <svg className="art pixel queue-art" viewBox="0 0 64 60" preserveAspectRatio="xMidYMax meet" shapeRendering="crispEdges" aria-hidden>
      <rect className="art-wall-customs" x="0" y="0" width="64" height="36" />
      <rect className="art-floor" x="0" y="36" width="64" height="24" />
      <rect className="art-skirting" x="0" y="36" width="64" height="1" />
      <rect className="art-skirting" x="0" y="47" width="64" height="1" />
      <rect className="art-lamp" x="8" y="2" width="20" height="1" />
      <rect className="art-lamp" x="38" y="2" width="20" height="1" />
      <rect className="art-lamp-wash" x="38" y="3" width="20" height="2" />

      {/* The far table: an inspector holding a jar up to the light over an open suitcase. */}
      <Pixels rows={INSPECTOR} palette={{ o: 'art-officer', a: 'art-amber' }} x={44} y={14} />
      <Pixels rows={JAR} palette={{ k: 'art-booth', h: 'art-amber' }} x={48} y={10} />
      <rect className="art-steel" x="36" y="25" width="26" height="2" />
      <rect className="art-steel-leg" x="38" y="27" width="1" height="9" />
      <rect className="art-steel-leg" x="59" y="27" width="1" height="9" />
      <rect className="art-bag-open" x="51" y="22" width="9" height="3" />

      {/* The near table, empty, waiting for the woman ahead of you. */}
      <rect className="art-steel" x="0" y="29" width="22" height="2" />
      <rect className="art-steel-edge" x="0" y="31" width="22" height="1" />
      <rect className="art-steel-leg" x="2" y="32" width="1" height="8" />
      <rect className="art-steel-leg" x="19" y="32" width="1" height="8" />
      <Pixels rows={PASSENGER} palette={{ p: 'art-passenger', a: 'art-bag', g: 'art-bag' }} x={22} y={18} />

      {/* Your bag, its handle in your fist. */}
      <rect className="art-bag-lining" x="45" y="46" width="2" height="7" />
      <rect className="art-bag-lining" x="53" y="46" width="2" height="7" />
      <Pixels rows={HAND} palette={{ s: 'art-skin', d: 'art-skin-shade', c: `art-coat-${character}` }} x={45} y={38} />
      <rect className="art-bag" x="38" y="52" width="24" height="8" />
      <rect className="art-bag-lining" x="38" y="52" width="24" height="1" />
    </svg>
  );
}

// A man sitting on the bench, side on: head, back, knees, shins.
const SITTER = [
  '.pppp...',
  '.pppp...',
  '..pp....',
  'pppppp..',
  'pppppp..',
  'pppppp..',
  'pppppppp',
  'pppppppp',
  '.....pp.',
  '.....pp.',
  '.....pp.',
];

// Your phone, the reply still sending: a bar of light that does not fill.
const PHONE = [
  'kkkkkkkk',
  'kllllllk',
  'kllllllk',
  'kwwwwllk',
  'kllllllk',
  'kllllllk',
  'kllllllk',
  'kkkkkkkk',
];

// Doors down the corridor: x, top, width.
const DOORS: readonly [number, number, number][] = [[4, 12, 9], [18, 15, 7], [44, 15, 7]];

/** The interview queue (queue 3): a corridor with a bench fixed to the wall, doors along it, your phone in your hand. */
export function InterviewQueueScene({ character }: { character: CharacterId }) {
  return (
    <svg className="art pixel queue-art" viewBox="0 0 64 60" preserveAspectRatio="xMidYMax meet" shapeRendering="crispEdges" aria-hidden>
      <rect className="art-wall-interview" x="0" y="0" width="64" height="36" />
      <rect className="art-floor" x="0" y="36" width="64" height="24" />
      <rect className="art-skirting" x="0" y="36" width="64" height="1" />
      <rect className="art-skirting" x="0" y="48" width="64" height="1" />

      {DOORS.map(([x, y, w]) => (
        <g key={x}>
          <rect className="art-booth" x={x} y={y} width={w} height={36 - y} />
          <rect className="art-door" x={x + 1} y={y + 1} width={w - 2} height={35 - y} />
        </g>
      ))}
      {/* The door at the end of the corridor, light under it. */}
      <rect className="art-booth" x="29" y="18" width="7" height="18" />
      <rect className="art-door" x="30" y="19" width="5" height="17" />
      <rect className="art-lamp" x="30" y="35" width="5" height="1" />
      <rect className="art-lamp" x="31" y="3" width="3" height="1" />
      <rect className="art-lamp-wash" x="28" y="4" width="9" height="2" />

      {/* The bench fixed to the wall, and the man who has been here since the morning. */}
      <rect className="art-steel" x="38" y="31" width="24" height="2" />
      <rect className="art-steel-leg" x="40" y="33" width="1" height="3" />
      <rect className="art-steel-leg" x="59" y="33" width="1" height="3" />
      <Pixels rows={SITTER} palette={{ p: 'art-passenger' }} x={46} y={23} />

      {/* Your phone, close to the eye. */}
      <Pixels rows={PHONE} palette={{ k: 'art-booth', l: 'art-glass-solid', w: 'art-amber' }} x={44} y={36} />
      <Pixels rows={HAND} palette={{ s: 'art-skin', d: 'art-skin-shade', c: `art-coat-${character}` }} x={41} y={44} />
    </svg>
  );
}
