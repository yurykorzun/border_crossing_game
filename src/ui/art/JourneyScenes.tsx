// The scenes around the run: the border post on the traveler screen, the desk you
// pack at, and the ending (the night bus, the empty stop if the bus left without
// you, or the border post again if you turned back). Same pixel grid and palette as the checkpoint scenes; each fills its
// box with `slice`, anchored at the bottom, so a short box crops the sky first.

import type { ReactNode } from 'react';
import { t } from '../../i18n';
import type { CharacterId } from '../../game/types';
import { Pixels } from './pixels';

function Scene({ label, w, h, name, children }: { label: string; w: number; h: number; name: string; children: ReactNode }) {
  return (
    <svg
      className="art pixel journey-art"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      data-scene={name}
    >
      {children}
    </svg>
  );
}

// A small car, side on, headlights pointing at the barrier.
const CAR = [
  '...kkkkkk.....',
  '..kggkkggk....',
  '.kkkkkkkkkkkka',
  'kkkkkkkkkkkkkk',
  '.dd......dd...',
];

// Flakes in the air, fixed so every render draws the same sky.
const SNOW: readonly [number, number][] = [[3, 2], [11, 5], [18, 1], [25, 7], [31, 3], [44, 2], [52, 6], [58, 1], [61, 9], [7, 10], [22, 11], [48, 12], [37, 8]];

/** Setup 1, and the turned-back ending: the border post in snow. `closed` is night, the barrier down, the car gone. */
export function BorderPost({ closed = false }: { closed?: boolean }) {
  const label = t(closed ? 'scene.turnedBack' : 'scene.traveler');
  return (
    <Scene label={label} w={64} h={22} name={closed ? 'turnedBack' : 'traveler'}>
      <rect className={closed ? 'art-night' : 'art-dusk-1'} x="0" y="0" width="64" height="5" />
      <rect className={closed ? 'art-night' : 'art-dusk-2'} x="0" y="5" width="64" height="5" />
      <rect className={closed ? 'art-night-low' : 'art-dusk-3'} x="0" y="10" width="64" height="5" />
      {/* Hills on the far side, then the snow you stand in. */}
      <rect className="art-hill" x="0" y="13" width="20" height="3" />
      <rect className="art-hill" x="40" y="12" width="24" height="4" />
      <rect className="art-snow" x="0" y="16" width="64" height="6" />
      <rect className="art-snow-shade" x="0" y="19" width="64" height="1" />
      {/* The booth: snow on the roof, lit amber windows. */}
      <rect className="art-snow" x="33" y="6" width="14" height="1" />
      <rect className="art-booth" x="34" y="7" width="12" height="10" />
      <rect className="art-window-lit" x="36" y="9" width="3" height="3" />
      <rect className="art-window-lit" x="41" y="9" width="3" height="3" />
      <rect className="art-lamp-wash" x="34" y="17" width="12" height="1" />
      {/* The barrier: up for the car at dusk, down at night. */}
      <rect className="art-post" x="31" y="12" width="2" height="5" />
      {closed ? (
        <g className="art-barrier">
          <rect x="11" y="13" width="20" height="1" />
          <rect className="art-barrier-band" x="15" y="13" width="3" height="1" />
          <rect className="art-barrier-band" x="23" y="13" width="3" height="1" />
        </g>
      ) : (
        <g className="art-barrier">
          <rect x="30" y="3" width="1" height="9" />
          <rect className="art-barrier-band" x="30" y="5" width="1" height="2" />
        </g>
      )}
      {!closed && <Pixels rows={CAR} palette={{ k: 'art-car', g: 'art-glass-solid', a: 'art-amber', d: 'art-officer' }} x={12} y={13} />}
      {SNOW.map(([x, y]) => <rect key={`${x}.${y}`} className="art-snow" x={x} y={y} width="1" height="1" />)}
    </Scene>
  );
}

// A mug with a wisp of steam.
const MUG = [
  '.s..',
  '..s.',
  'mmmm',
  'mmmmm',
  'mmmm',
];

/** Setup 2: a desk with a stack of papers and a mug by a snowy window, a filing cabinet. */
export function Desk() {
  return (
    <Scene label={t('scene.preparation')} w={96} h={20} name="preparation">
      <rect className="art-wall" x="0" y="0" width="96" height="20" />
      {/* The window: night snow outside, the frame and its sill. */}
      <rect className="art-booth" x="50" y="1" width="26" height="13" />
      <rect className="art-night" x="51" y="2" width="24" height="11" />
      <rect className="art-snow" x="51" y="11" width="24" height="2" />
      {[[53, 3], [58, 6], [63, 4], [69, 7], [72, 3], [55, 9], [66, 9]].map(([x, y]) => (
        <rect key={`${x}.${y}`} className="art-snow" x={x} y={y} width="1" height="1" />
      ))}
      <rect className="art-booth" x="62" y="2" width="1" height="11" />
      {/* The lamp's warm pool on the wall and the desk. */}
      <rect className="art-lamp-wash" x="8" y="6" width="34" height="8" />
      <rect className="art-booth" x="10" y="8" width="1" height="6" />
      <rect className="art-lamp" x="8" y="7" width="5" height="2" />
      {/* The desk, the stack of papers, a passport on top, the mug. */}
      <rect className="art-table" x="0" y="14" width="84" height="2" />
      <rect className="art-table-edge" x="0" y="16" width="84" height="4" />
      <rect className="art-paper-shade" x="18" y="10" width="12" height="4" />
      <rect className="art-paper" x="19" y="9" width="11" height="1" />
      <rect className="art-paper" x="18" y="11" width="12" height="1" />
      <rect className="art-paper" x="19" y="13" width="11" height="1" />
      <rect className="art-passport" x="21" y="8" width="6" height="1" />
      <Pixels rows={MUG} palette={{ m: 'art-mug', s: 'art-steam' }} x={36} y={9} />
      {/* The filing cabinet. */}
      <rect className="art-cabinet" x="84" y="4" width="11" height="16" />
      <rect className="art-booth" x="84" y="9" width="11" height="1" />
      <rect className="art-booth" x="84" y="14" width="11" height="1" />
      <rect className="art-amber" x="88" y="6" width="3" height="1" />
      <rect className="art-amber" x="88" y="11" width="3" height="1" />
      <rect className="art-amber" x="88" y="16" width="3" height="1" />
    </Scene>
  );
}

// A hand from below holding the medicine box (or an empty hand, if it was taken).
const HAND_BOX = [
  'wwwwwwwwww',
  'wggggggggw',
  'wwwwwwwwww',
  'swwwwwwwws',
  'sswwwwwwss',
  'ssssssssss',
  '.ssssssss.',
  '..ssssss..',
  '..cccccc..',
  '..cccccc..',
];
const HAND_EMPTY = [
  '..........',
  '..........',
  '.s.s.s.s..',
  '.s.s.s.s..',
  '.sssssss.s',
  '.sssssssss',
  '.ssssssss.',
  '..ssssss..',
  '..cccccc..',
  '..cccccc..',
];

// You, sitting on the bench, the medicine box on your knees (or your hands in your lap).
const SITTING_BOX = [
  '..hhh..',
  '.hsssh.',
  '..sss..',
  '.ccccc.',
  'ccccccc',
  'cwwwwwc',
  'cwggwwc',
  'ccccccc',
  '.cc.cc.',
  '.cc.cc.',
  '.kk.kk.',
];
const SITTING_EMPTY = [
  '..hhh..',
  '.hsssh.',
  '..sss..',
  '.ccccc.',
  'ccccccc',
  'ccccccc',
  'csscssc',
  'ccccccc',
  '.cc.cc.',
  '.cc.cc.',
  '.kk.kk.',
];

/** Snow falling through the streetlight, fixed. */
const STOP_SNOW: readonly [number, number][] = [[4, 3], [9, 8], [17, 6], [21, 11], [26, 4], [33, 9], [39, 2], [45, 7], [52, 4], [58, 10], [61, 2], [13, 13], [36, 14], [55, 15]];

/**
 * The missed-bus ending: an empty stop under a streetlight at night, you on the bench,
 * the medicine box on your knees when you kept it. Same 64x30 box as NightBus, so the
 * ending card keeps its height.
 */
export function EmptyStop({ medicine, character }: { medicine: boolean; character: CharacterId }) {
  return (
    <Scene label={t(medicine ? 'scene.emptyStop' : 'scene.emptyStopEmpty')} w={64} h={30} name="emptyStop">
      <rect className="art-night" x="0" y="0" width="64" height="14" />
      <rect className="art-night-low" x="0" y="14" width="64" height="8" />
      {/* The far side of the road: low town, one lit window. */}
      <rect className="art-hill" x="0" y="17" width="64" height="5" />
      <rect className="art-window-lit" x="50" y="18" width="2" height="1" />
      {/* The road, empty, with the bus's tyre tracks in the snow, then the kerb you sit on. */}
      <rect className="art-snow-shade" x="0" y="22" width="64" height="3" />
      <rect className="art-booth" x="0" y="23" width="64" height="1" />
      <rect className="art-snow" x="0" y="25" width="64" height="5" />
      {/* The streetlight: a post, its amber head, the warm pool it throws on the bench. */}
      <rect className="art-post" x="10" y="3" width="1" height="22" />
      <rect className="art-post" x="10" y="3" width="5" height="1" />
      <rect className="art-lamp" x="13" y="4" width="3" height="1" />
      <rect className="art-lamp-wash" x="11" y="5" width="8" height="4" />
      <rect className="art-lamp-wash" x="9" y="9" width="14" height="6" />
      <rect className="art-lamp-wash" x="7" y="15" width="20" height="10" />
      {/* The stop sign, and the timetable under it. */}
      <rect className="art-post" x="44" y="9" width="1" height="16" />
      <rect className="art-amber" x="42" y="7" width="5" height="3" />
      <rect className="art-paper" x="43" y="12" width="3" height="4" />
      {/* The bench, and you on it. */}
      <rect className="art-table" x="14" y="21" width="16" height="1" />
      <rect className="art-table-edge" x="15" y="22" width="1" height="3" />
      <rect className="art-table-edge" x="28" y="22" width="1" height="3" />
      <Pixels rows={medicine ? SITTING_BOX : SITTING_EMPTY} palette={{ h: `art-hair-${character}`, s: 'art-skin', c: `art-coat-${character}`, w: 'art-box', g: 'art-box-band', k: 'art-car' }} x={19} y={14} />
      {STOP_SNOW.map(([x, y]) => <rect key={`${x}.${y}`} className="art-snow" x={x} y={y} width="1" height="1" />)}
    </Scene>
  );
}

/** Rain streaks on the bus window, fixed. */
const RAIN: readonly [number, number][] = [[6, 4], [12, 9], [17, 5], [23, 11], [29, 6], [34, 13], [40, 4], [46, 10], [51, 6], [57, 12], [9, 14], [43, 15], [26, 15]];

/** The ending after admission: your hand on the medicine box on a night bus, the hospital through a rainy window. */
export function NightBus({ medicine, character }: { medicine: boolean; character: CharacterId }) {
  return (
    <Scene label={t(medicine ? 'scene.bus' : 'scene.busEmpty')} w={64} h={30} name="bus">
      <rect className="art-booth" x="0" y="0" width="64" height="30" />
      <rect className="art-night" x="3" y="2" width="58" height="16" />
      {/* The hospital: a tall block with lit windows, low town on either side. */}
      <rect className="art-hill" x="3" y="13" width="58" height="5" />
      <rect className="art-hospital" x="34" y="5" width="16" height="13" />
      {[7, 10, 13].map((y) => [36, 40, 44].map((x) => <rect key={`${x}.${y}`} className="art-window-lit" x={x} y={y} width="2" height="1" />))}
      <rect className="art-lamp" x="40" y="3" width="4" height="2" />
      {RAIN.map(([x, y]) => <rect key={`${x}.${y}`} className="art-rain" x={x} y={y} width="1" height="2" />)}
      <rect className="art-booth" x="31" y="2" width="1" height="16" />
      <rect className="art-glass" x="3" y="2" width="58" height="16" />
      {/* The seat back in front of you, a warm reading light. */}
      <rect className="art-lamp-wash" x="0" y="18" width="64" height="2" />
      <rect className="art-seat" x="4" y="20" width="56" height="10" />
      <rect className="art-seat-edge" x="4" y="20" width="56" height="1" />
      <Pixels rows={medicine ? HAND_BOX : HAND_EMPTY} palette={{ w: 'art-box', g: 'art-box-band', s: 'art-skin', c: `art-coat-${character}` }} x={27} y={20} />
    </Scene>
  );
}
