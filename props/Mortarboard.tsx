// Mortarboard: the graduation cap that Cursor wears, as a prop of its own (Sweet Distillation storyboard item 51, K6;
// it drops onto the tiny Bot's head on "self-education"). The same shapes and colours as Cursor's cap: a dark square
// board in slight perspective, the skull cap under it, a highlight button, a cord to the corner and a tassel that hangs
// with gravity whatever the cap's angle. Cursor.tsx is unchanged and still draws its own copy.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propColours, propGraphic, propPoint, propQuad, propTransform} from './common';

/** Natural size: the board 72 wide (x -36 to 36); the cap is 28 tall above the anchor and the tassel hangs to 38 below
 *  the board's corner. `size` is the 72 board width. */
export const MORTARBOARD_SIZE = {w: 72};
/** Cursor's cap shapes have the skull cap's bottom at y 12; the anchor is moved there. */
const DY = -12;
export interface MortarboardProps extends PropBase {
  /** Tassel swing, degrees from hanging straight down (positive swings it toward +x). */
  tassel?: number;
  /** Board top colour (default the ground role). Sweet Distillation on Dusk: Smog. */
  board?: string;
  /** Where the cord ends along the board, design units right of centre (default 26). 34 puts the tassel off the side
   *  of a head as wide as the board (the 80 px Bot with a 44 px cap). */
  cord?: number;
}
const mbPlace = (p: MortarboardProps) => place(p, MORTARBOARD_SIZE.w);
/** A mortarboard. Anchor: the bottom centre of the skull cap (set it on top of a head). */
export const Mortarboard: React.FC<MortarboardProps> = (p) => {
  const q = mbPlace(p);
  const C = propColours(p.colours);
  const fine = 3 / (q.scale ?? 1);
  // the cord end: on the board's right edge (which runs from 0, 4 to 36, -6), default 26 along
  const cx = p.cord ?? 26, cy = cx === 26 ? -4 : Math.round((4 - (10 * Math.min(36, cx)) / 36) * 10) / 10;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={`translate(0 ${DY})`}>
        <path d="M-16 -4L16 -4L15 10Q0 14 -15 10Z" fill={mix(C.ground, C.body, 0.6)} stroke={C.paper} strokeWidth={fine} strokeLinejoin="round" />
        <path d="M-36 -6L0 -16L36 -6L0 4Z" fill={p.board ?? C.ground} stroke={C.paper} strokeWidth={fine} strokeLinejoin="round" />
        <path d={`M0 -6L${cx} ${cy}`} stroke={C.highlight} strokeWidth={3} strokeLinecap="round" />
        <circle cx={0} cy={-6} r={3.5} fill={C.highlight} />
        <g transform={`rotate(${f1(-(p.angle ?? 0) + (p.tassel ?? 0))} ${cx} ${cy})`}>
          <path d={`M${cx} ${cy}L${cx} ${cy + 20}`} stroke={C.highlight} strokeWidth={3} strokeLinecap="round" />
          <path d={`M${cx - 3.5} ${cy + 19}L${cx + 3.5} ${cy + 19}L${cx + 6} ${cy + 36}L${cx - 6} ${cy + 36}Z`} fill={C.highlight} />
        </g>
      </g>
    </g>
  );
};
export const mortarboardQuad = (p: MortarboardProps): Pt[] => propQuad(mbPlace(p), {x: -40, y: -32, w: 84, h: 56});
/** World point at the top of the board (the button). */
export const mortarboardButton = (p: MortarboardProps): Pt => propPoint(mbPlace(p), {x: 0, y: -6 + DY});
export const mortarboardGraphic = (o: PropGraphicOpts<MortarboardProps>): DecorGraphic => propGraphic(o, Mortarboard, mortarboardQuad);
