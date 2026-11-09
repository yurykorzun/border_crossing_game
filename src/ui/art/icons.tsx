// Small pixel-art icons for the run screen's header and tray, each on a 10x10 grid.
// `#` takes the text colour (currentColor), `a` the amber token. Decorative only:
// the words next to them (or the button's aria-label) carry the meaning.

import { Pixels } from './pixels';

const PALETTE = { '#': 'icon-ink', a: 'art-amber' };

const CLOCK = [
  '...####...',
  '..#....#..',
  '.#...a..#.',
  '#....a...#',
  '#....a...#',
  '#....aaa.#',
  '#........#',
  '.#......#.',
  '..#....#..',
  '...####...',
];

const FLAG = [
  '#.........',
  '#aaaaaa...',
  '#aaaaaaa..',
  '#aaaaaaaa.',
  '#aaaaaaa..',
  '#aaaaaa...',
  '#.........',
  '#.........',
  '#.........',
  '##........',
];

const DOCUMENT = [
  '.#####....',
  '.#....#...',
  '.#....##..',
  '.#......#.',
  '.#.aaaa.#.',
  '.#......#.',
  '.#.aaaa.#.',
  '.#......#.',
  '.#.aa...#.',
  '.########.',
];

const FOLDER = [
  '..........',
  '####......',
  '#...#####.',
  '#........#',
  '##########',
  '#........#',
  '#..aaaa..#',
  '#........#',
  '#........#',
  '##########',
];

const GEAR = [
  '....##....',
  '.#.####.#.',
  '..######..',
  '.###..###.',
  '###....###',
  '###....###',
  '.###..###.',
  '..######..',
  '.#.####.#.',
  '....##....',
];

/** A recorded claim. */
const CHECK = [
  '..........',
  '.........#',
  '........##',
  '.......##.',
  '#.....##..',
  '##...##...',
  '.##.##....',
  '..###.....',
  '...#......',
  '..........',
];

/** Scrutiny or a check: someone looks closer. */
const SHIELD = [
  '.########.',
  '#........#',
  '#...aa...#',
  '#...aa...#',
  '#...aa...#',
  '#........#',
  '.#..aa..#.',
  '.#......#.',
  '..#....#..',
  '...####...',
];

const ICONS = { clock: CLOCK, flag: FLAG, document: DOCUMENT, folder: FOLDER, gear: GEAR, check: CHECK, shield: SHIELD } as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={`icon icon-${name}`} viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden>
      <Pixels rows={ICONS[name]} palette={PALETTE} />
    </svg>
  );
}
