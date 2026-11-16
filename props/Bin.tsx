// Bin: a ribbed desktop trash can with a hinged domed lid. Ported from the DOGEfather kit (K14, item 22).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size 200 x 256 (body 190 at the top, lid dome to y -256 closed; the lid handle reaches y -264). `size` is
 *  the 200 width. */
export const BIN_SIZE = {w: 200, h: 256};
const BIN_HINGE = {x: 100, y: -236};
const BIN_RIBS = (() => {
  let d = '';
  for (let i = 1; i < 8; i++) d += `M${f1(-75 + (150 * i) / 8)} -14L${f1(-95 + (190 * i) / 8)} -212`;
  return d;
})();
export interface BinProps extends PropBase {
  /** Lid angle, degrees: 0 closed; positive tips it open about its back hinge (at the right of the rim). */
  lid?: number;
}
const binPlace = (p: BinProps) => place(p, BIN_SIZE.w);
/** Ribbed desktop trash can (tapered body with seven ribs, rim, dark mouth) with a hinged domed lid. Anchor:
 *  bottom-centre. Natural size 200 x 256. */
export const Bin: React.FC<BinProps> = (p) => {
  const q = binPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d="M-75 0L75 0L95 -220L-95 -220Z" fill={C.body} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <path d={BIN_RIBS} stroke={mix(C.body, C.paper, 0.25)} strokeWidth={6} strokeLinecap="round" />
      <path d={rrectPath(-100, -230, 200, 14, 5)} fill={mix(C.body, C.paper, 0.12)} stroke={C.paper} strokeWidth={sw} />
      <ellipse cx={0} cy={-232} rx={92} ry={12} fill={C.ground} stroke={C.paper} strokeWidth={sw * 0.6} />
      <g transform={`rotate(${f1(p.lid ?? 0)} ${BIN_HINGE.x} ${BIN_HINGE.y})`}>
        <path d="M-102 -232A102 13 0 0 0 102 -232L98 -244Q0 -268 -98 -244Z" fill={C.body} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
        <path d={rrectPath(-24, -264, 48, 10, 5)} fill={mix(C.body, C.paper, 0.2)} stroke={C.paper} strokeWidth={sw * 0.6} />
      </g>
      <circle cx={BIN_HINGE.x - 4} cy={BIN_HINGE.y} r={6} fill={C.muted} />
    </g>
  );
};
/** World quad of the bin with its lid closed (an open lid swings outside this box). */
export const binQuad = (p: BinProps): Pt[] => propQuad(binPlace(p), {x: -104, y: -268, w: 208, h: 268});
/** World point at the centre of the bin's opening (where things drop in). */
export const binMouth = (p: BinProps): Pt => propPoint(binPlace(p), {x: 0, y: -232});
export const binGraphic = (o: PropGraphicOpts<BinProps>): DecorGraphic => propGraphic(o, Bin, binQuad);
