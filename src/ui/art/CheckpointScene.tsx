// The run's counter view, one scene per checkpoint, on a 40x44 grid: you stand on
// your side of the counter with your shoulder in the foreground, under warm amber
// light. The scene changes with what just happened (SceneState): a document you
// handed over lies on the officer's side, the officer writes while a fact goes on
// file, and during a check your passport or the medicine box is gone from the counter.

import { t } from '../../i18n';
import type { CharacterId, Checkpoint } from '../../game/types';
import { OFFICER } from './officer';
import { Pixels } from './pixels';

export interface SceneState {
  /** A document was handed over at this checkpoint. */
  handedOver: boolean;
  /** A fact just went on file: the officer is writing. */
  writing: boolean;
  /** A check is running: the officer took your passport (or the box) away. */
  away: boolean;
  /** You still have the medicine. */
  medicine: boolean;
}

// The top of your coat: shoulder and upper arm, bottom left, close to the eye.
const SHOULDER = [
  '......cccccc......',
  '...cccccccccccc...',
  '.cccccccccccccccc.',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
  'cccccccccccccccccc',
];

// The far queue behind the clerk, in silhouette, either side of him.
const CROWD = [
  '.qq...qq..............qq...qq.',
  '.qq...qq..............qq...qq.',
  'qqqq.qqqq............qqqq.qqqq',
  'qqqqqqqqq............qqqqqqqqq',
  'qqqqqqqqq............qqqqqqqqq',
  'qqqqqqqqq............qqqqqqqqq',
];

// Your passport lying on the counter.
const PASSPORT = [
  'rrrrrrr',
  'rrryrrr',
  'rryyyrr',
  'rrrrrrr',
  'rryyyrr',
];

// A folded sheet of paper with lines of writing: the document you handed over.
const DOCUMENT = [
  'ppppppp',
  'pkkkkpp',
  'ppppppp',
  'pkkkppp',
  'ppppppp',
];

// The medicine box: a pale carton with a green band.
const BOX = [
  'wwwwwww',
  'wgggggw',
  'wwwwwww',
  'wwwwwww',
  'wwwwwww',
];

// The inspector seen from the side, walking away with your box: head, back and legs.
const WALKER = [
  '.oooo.',
  'oooooo',
  '.oooo.',
  '..oo..',
  'oooooo',
  'oooooo',
  'oaoooo',
  'oooooo',
  'oooooo',
  'oooooo',
  '.oo.oo',
  '.oo..o',
  'oo...o',
];

const OFFICER_PALETTE = { o: 'art-officer', a: 'art-amber' };

/** A sheet and a moving pen: a fact going on file. */
function Writing({ x, y }: { x: number; y: number }) {
  return (
    <g className="scene-writing" data-writing>
      <rect className="art-paper" x={x} y={y} width="6" height="3" />
      <rect className="art-ink" x={x + 1} y={y + 1} width="3" height="1" />
      <g className="scene-pen"><rect className="art-ink" x={x + 4} y={y - 2} width="1" height="3" /></g>
    </g>
  );
}

/** Your document on the officer's side; it slides there from yours unless motion is reduced. */
function HandedOver({ x, y }: { x: number; y: number }) {
  return (
    <g className="scene-doc" data-doc>
      <Pixels rows={DOCUMENT} palette={{ p: 'art-paper', k: 'art-ink' }} x={x} y={y} />
    </g>
  );
}

function Shoulder({ character }: { character: CharacterId }) {
  return <Pixels rows={SHOULDER} palette={{ c: `art-coat-${character}` }} x={-3} y={34} />;
}

/** Passport control: the clerk behind the glass, the queue behind him, your passport on the counter. */
function Passport({ s, character }: { s: SceneState; character: CharacterId }) {
  return (
    <>
      <rect className="art-wall" x="0" y="0" width="40" height="44" />
      <rect className="art-floor" x="2" y="6" width="36" height="22" />
      <Pixels rows={CROWD} palette={{ q: 'art-crowd' }} x={5} y={22} />
      {!s.away && <g className="officer-art"><Pixels rows={OFFICER} palette={OFFICER_PALETTE} x={14} y={11} /></g>}
      {s.writing && <Writing x={27} y={25} />}
      {s.handedOver && <HandedOver x={7} y={23} />}
      <rect className="art-glass" x="2" y="6" width="36" height="22" />
      <rect className="art-glare" x="4" y="19" width="1" height="4" />
      <rect className="art-glare" x="5" y="15" width="1" height="4" />
      <rect className="art-glare" x="33" y="9" width="1" height="4" />
      {/* The booth frame, the amber lamp strip along its top, the slot under the glass. */}
      <rect className="art-booth" x="0" y="0" width="40" height="5" />
      <rect className="art-lamp" x="3" y="5" width="34" height="1" />
      <rect className="art-booth" x="0" y="5" width="2" height="23" />
      <rect className="art-booth" x="38" y="5" width="2" height="23" />
      <rect className="art-counter" x="0" y="28" width="40" height="2" />
      <rect className="art-booth" x="8" y="28" width="10" height="1" />
      <rect className="art-desk" x="0" y="30" width="40" height="14" />
      <rect className="art-lamp-wash" x="6" y="30" width="28" height="2" />
      {!s.away && <Pixels rows={PASSPORT} palette={{ r: 'art-passport', y: 'art-emblem' }} x={23} y={32} />}
      <Shoulder character={character} />
    </>
  );
}

/** Customs: the medicine box on the steel table, the inspector, the back door he takes it through. */
function Customs({ s, character }: { s: SceneState; character: CharacterId }) {
  return (
    <>
      <rect className="art-wall-customs" x="0" y="0" width="40" height="30" />
      <rect className="art-floor" x="0" y="30" width="40" height="14" />
      <rect className="art-lamp" x="8" y="0" width="24" height="1" />
      <rect className="art-lamp-wash" x="8" y="1" width="24" height="2" />
      {/* The back door, ajar while the inspector takes your box through it. */}
      <rect className="art-booth" x="27" y="9" width="10" height="21" />
      <rect className={s.away ? 'art-lamp' : 'art-door'} x="28" y="10" width="8" height="20" />
      {s.away && <rect className="art-door" x="32" y="10" width="4" height="20" />}
      <rect className="art-glass-solid" x="29" y="12" width="2" height="3" />
      {s.away ? (
        <g className="officer-art">
          <Pixels rows={WALKER} palette={OFFICER_PALETTE} x={23} y={17} />
          {s.medicine && <Pixels rows={BOX} palette={{ w: 'art-box', g: 'art-box-band' }} x={19} y={21} />}
        </g>
      ) : (
        <g className="officer-art"><Pixels rows={OFFICER} palette={OFFICER_PALETTE} x={12} y={13} /></g>
      )}
      {/* The steel inspection table, your open bag on it. */}
      <rect className="art-steel" x="0" y="30" width="40" height="3" />
      <rect className="art-steel-edge" x="0" y="33" width="40" height="1" />
      <rect className="art-lamp-wash" x="4" y="30" width="32" height="1" />
      <rect className="art-bag-open" x="1" y="25" width="9" height="5" />
      <rect className="art-bag-lining" x="2" y="25" width="7" height="1" />
      {!s.away && s.medicine && <Pixels rows={BOX} palette={{ w: 'art-box', g: 'art-box-band' }} x={15} y={25} />}
      {s.writing && <Writing x={25} y={27} />}
      {s.handedOver && <HandedOver x={4} y={30} />}
      <rect className="art-steel-leg" x="3" y="34" width="2" height="10" />
      <rect className="art-steel-leg" x="35" y="34" width="2" height="10" />
      <Shoulder character={character} />
    </>
  );
}

/** The security interview: the officer seated at a table with a sheet of paper, under a hanging lamp. */
function Interview({ s, character }: { s: SceneState; character: CharacterId }) {
  return (
    <>
      <rect className="art-wall-interview" x="0" y="0" width="40" height="44" />
      <rect className="art-booth" x="19" y="0" width="2" height="5" />
      <rect className="art-lamp" x="16" y="5" width="8" height="2" />
      <rect className="art-lamp-wash" x="12" y="7" width="16" height="3" />
      <rect className="art-lamp-wash" x="8" y="10" width="24" height="3" />
      {/* The officer's chair, and the officer in it unless he went to check something. */}
      <rect className="art-booth" x="13" y="14" width="14" height="13" />
      {!s.away && <g className="officer-art"><Pixels rows={OFFICER.slice(0, 15)} palette={OFFICER_PALETTE} x={14} y={12} /></g>}
      {/* The table and the sheet of paper in front of him. */}
      <rect className="art-table" x="0" y="27" width="40" height="4" />
      <rect className="art-table-edge" x="0" y="31" width="40" height="1" />
      <rect className="art-table-edge" x="4" y="32" width="2" height="12" />
      <rect className="art-table-edge" x="34" y="32" width="2" height="12" />
      <rect className="art-paper" x="16" y="26" width="8" height="2" />
      {s.writing && <Writing x={26} y={25} />}
      {s.handedOver && <HandedOver x={5} y={26} />}
      <Shoulder character={character} />
    </>
  );
}

const DRAW = { passport: Passport, customs: Customs, interview: Interview } as const;

/**
 * Fills the run's scene box with `slice`, centred: a tall box (a short question)
 * loses the edges, a short one (answers that wrap) loses the ceiling and the floor,
 * and the officer at the counter stays in view either way.
 */
export function CheckpointScene({ checkpoint, character, state }: { checkpoint: Checkpoint; character: CharacterId; state: SceneState }) {
  const Draw = DRAW[checkpoint];
  return (
    <svg
      className="art pixel checkpoint-art"
      viewBox="0 0 40 44"
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="crispEdges"
      role="img"
      aria-label={t(`scene.${checkpoint}`)}
      data-scene={checkpoint}
    >
      <Draw s={state} character={character} />
    </svg>
  );
}
