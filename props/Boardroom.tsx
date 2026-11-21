// Boardroom: the bosses at a long table, seen front-on (Paper Trail storyboard items 37, 60, 87 and 175): a wooden
// table top with a front panel down to the floor, and behind it `count` pictogram Figures (paper tone, man and woman
// alternating) in high-backed executive chairs. Standing (`seated` 0) their heads and chests are over the table and the
// chair backs show beside them; `seated` 1 lowers them together into the chairs, so the high backs rise behind their
// heads. Only what is above the table top is drawn of each figure.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {clipKey, outlineFor, worldPx} from './drawingHelpers';
import {Figure, type FigureVariant} from './Figure';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 130 of table per boss (520 wide for count 4, x -260 to 260); the figures are 208 tall standing (1.6
 *  times their place at the table), the chair backs reach y -184, the table top is at y -89. Anchor: the bottom centre
 *  of the table, on the floor. `size` is the table width (default 130 x count). */
export const BOARDROOM_PLACE = 130;
const H = 208;
// Fable props gate loop 1, item 56: seated, heads and shoulders clear the table edge (the figure sinks 0.14 H, so the
// shoulders stand 0.21 H above the table top), and the chair backs rise only a little above the seated heads.
const TOP = -0.43 * H, SLAB = 0.06 * H, CHAIR_TOP = -0.885 * H, CHAIR_W = 0.42 * H, SINK = 0.14 * H;

export interface BoardroomProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Number of bosses (default 4). */
  count?: number;
  /** 0 standing, 1 seated (all together). */
  seated?: number;
  /** Figure colour (default paper). */
  tone?: string;
  /** Variants in order (default man, woman alternating). */
  variants?: FigureVariant[];
}
const countOf = (p: BoardroomProps) => Math.max(1, Math.round(p.count ?? 4));
const roomPlace = (p: BoardroomProps) => place(p, BOARDROOM_PLACE * countOf(p));
const seatX = (n: number, k: number) => -BOARDROOM_PLACE * (n - 1) / 2 + BOARDROOM_PLACE * k;

export const Boardroom: React.FC<BoardroomProps> = (p) => {
  const q = roomPlace(p);
  const n = countOf(p);
  const sw = outlineFor(q, BOARDROOM_PLACE * n, 0.012);
  const C = roleColours(p.colours);
  const s = clamp(p.seated ?? 0);
  const half = (BOARDROOM_PLACE * n) / 2;
  const chair = mix(C.body, C.ground, 0.55), chairLight = mix(chair, C.paper, 0.14);
  const wood = mix(C.body, C.paper, 0.08), woodDark = mix(C.body, C.ground, 0.28);
  const id = clipKey('room', p);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const variants = p.variants ?? ['man', 'woman'];
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <defs>
        <clipPath id={`${id}-over`}><rect x={-half - 200} y={-600} width={2 * half + 400} height={600 + TOP} /></clipPath>
      </defs>
      {Array.from({length: n}, (_, k) => {
        const x = seatX(n, k);
        return (
          <g key={`c${k}`}>
            <path d={`M${x - CHAIR_W / 2} ${TOP}V${CHAIR_TOP + 26}Q${x - CHAIR_W / 2} ${CHAIR_TOP} ${x - CHAIR_W / 2 + 26} ${CHAIR_TOP}H${x + CHAIR_W / 2 - 26}Q${x + CHAIR_W / 2} ${CHAIR_TOP} ${x + CHAIR_W / 2} ${CHAIR_TOP + 26}V${TOP}Z`} fill={chair} {...E} />
            <path d={`M${x - CHAIR_W / 2 + 12} ${CHAIR_TOP + 30}Q${x} ${CHAIR_TOP + 40} ${x + CHAIR_W / 2 - 12} ${CHAIR_TOP + 30}`} fill="none" stroke={chairLight} strokeWidth={worldPx(q, 3)} strokeLinecap="round" />
          </g>
        );
      })}
      <g clipPath={`url(#${id}-over)`}>
        {Array.from({length: n}, (_, k) => (
          <Figure key={`f${k}`} x={seatX(n, k)} y={s * SINK} size={H} look="pictogram" variant={variants[k % variants.length]} tone={p.tone ?? C.paper} />
        ))}
      </g>
      {/* the table: top slab and front panel to the floor */}
      <path d={rrectPath(-half, TOP + SLAB - 2, 2 * half, -TOP - SLAB + 2, 4)} fill={woodDark} {...E} />
      <path d={`M${-half + 26} ${TOP + SLAB + 10}V-10M${half - 26} ${TOP + SLAB + 10}V-10`} stroke={mix(woodDark, C.ground, 0.3)} strokeWidth={worldPx(q, 3)} />
      <path d={rrectPath(-half - 10, TOP, 2 * half + 20, SLAB, 4)} fill={wood} {...E} />
    </g>
  );
};
export const boardroomQuad = (p: BoardroomProps): Pt[] => {
  const half = (BOARDROOM_PLACE * countOf(p)) / 2;
  return propQuad(roomPlace(p), {x: -half - 10, y: -H - 4, w: 2 * half + 20, h: H + 4});
};
/** World points at each boss's head centre at the current `seated`. */
export const boardroomHeads = (p: BoardroomProps): Pt[] => {
  const n = countOf(p), s = clamp(p.seated ?? 0);
  return Array.from({length: n}, (_, k) => propPoint(roomPlace(p), {x: seatX(n, k), y: -0.9 * H + s * SINK}));
};
/** World point at the centre of the table top's front edge (words rise from the table's top edge here). */
export const boardroomTableTop = (p: BoardroomProps): Pt => propPoint(roomPlace(p), {x: 0, y: TOP});
export const boardroomGraphic = (o: PropGraphicOpts<BoardroomProps>): DecorGraphic => propGraphic(o, Boardroom, boardroomQuad);
