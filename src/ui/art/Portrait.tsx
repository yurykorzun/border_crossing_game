// Passport-style portraits as pixel art: a 20x24 grid of cells in the palette tokens
// (the .art-* fills in src/index.css), scaled up crisp by CSS. Head and shoulders on
// a plain background, inside a photo frame with a stamp over one corner. No image
// files, so nothing to fetch.

import { t } from '../../i18n';
import type { CharacterId } from '../../game/types';
import { Pixels } from './pixels';

// . frame  b background  h hair  t stubble  s skin  d skin shade  k eyes and mouth  w collar  c jacket
const SHOULDERS = [
  'bbbbcccwddwcccbbbb',
  'bbccccccwwccccccbb',
  'bccccccccccccccccb',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
];

/** The 18 inner columns of each traveler's photo, top to bottom; the frame is added around them. */
const FACES: Record<CharacterId, string[]> = {
  // Lena: shoulder-length brown hair with a side fringe.
  lena: [
    'bbbbbbbbbbbbbbbbbb',
    'bbbbbbhhhhhhbbbbbb',
    'bbbbhhhhhhhhhhbbbb',
    'bbbhhhhhhhhhhhhbbb',
    'bbbhhhhssssshhhbbb',
    'bbbhhhssssssshhbbb',
    'bbbhhsskssksshhbbb',
    'bbbhhsssssssshhbbb',
    'bbbhhssssdssshhbbb',
    'bbbhhssskkssshhbbb',
    'bbbhhhsssssshhhbbb',
    'bbbhhhhddddhhhhbbb',
    'bbbhhhhddddhhhhbbb',
    'bbbhcccwddwccchbbb',
    ...SHOULDERS.slice(1),
  ],
  // Mark: short black hair and stubble.
  mark: [
    'bbbbbbbbbbbbbbbbbb',
    'bbbbbbbbbbbbbbbbbb',
    'bbbbbhhhhhhhhbbbbb',
    'bbbbhhhhhhhhhhbbbb',
    'bbbbhsssssssshbbbb',
    'bbbbssssssssssbbbb',
    'bbbbssksssskssbbbb',
    'bbbbssssssssssbbbb',
    'bbbbssssddssssbbbb',
    'bbbbsttskksttsbbbb',
    'bbbbsttttttttsbbbb',
    'bbbbbttttttttbbbbb',
    'bbbbbbbddddbbbbbbb',
    'bbbbbbbddddbbbbbbb',
    ...SHOULDERS,
  ],
};

const FRAME = '.'.repeat(20);

/** A round entry stamp, drawn over the bottom-right corner. */
const STAMP = [
  '  rrr  ',
  ' r   r ',
  'r     r',
  'r rrr r',
  'r     r',
  ' r   r ',
  '  rrr  ',
];

export function Portrait({ id, className = '' }: { id: CharacterId; className?: string }) {
  const rows = [FRAME, ...FACES[id].map((r) => `.${r}.`), FRAME];
  const palette = {
    '.': 'art-frame',
    b: 'art-photo-bg',
    h: `art-hair-${id}`,
    t: 'art-stubble',
    s: 'art-skin',
    d: 'art-skin-shade',
    k: 'art-ink',
    w: 'art-collar',
    c: `art-coat-${id}`,
  };
  return (
    <svg
      className={`art pixel portrait-art ${className}`}
      viewBox="0 0 20 24"
      shapeRendering="crispEdges"
      role="img"
      aria-label={t('ui.portraitOf', { name: t(`char.${id}.name`) })}
      data-portrait={id}
    >
      <Pixels rows={rows} palette={palette} />
      <g className="art-stamp"><Pixels rows={STAMP} palette={{ r: 'art-stamp-ink' }} x={14} y={17} /></g>
    </svg>
  );
}
