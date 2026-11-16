// WitnessChair: a simple upholstered chair seen from the front. Ported from the DOGEfather kit (K14, item 35).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size 224 x 300; `size` is the width. */
export const WITNESS_CHAIR_SIZE = {w: 224, h: 300};
const CHAIR_TUFTS = [-48, 0, 48].flatMap((x) => [-262, -216].map((y) => circlePath(x, y, 4.5))).join('');
export type WitnessChairProps = PropBase;
const chairPlace = (p: WitnessChairProps) => place(p, WITNESS_CHAIR_SIZE.w);
/** Simple upholstered chair seen from the front: tufted back, armrests, seat cushion and four legs. Anchor:
 *  bottom-centre (between the front feet). Natural size 224 x 300. */
export const WitnessChair: React.FC<WitnessChairProps> = (p) => {
  const q = chairPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const uphol = C.body, leg = mix(C.body, C.ground, 0.3);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-72, -112, 11, 96, 3) + rrectPath(61, -112, 11, 96, 3)} fill={leg} stroke={C.paper} strokeWidth={sw * 0.6} />
      <path d={rrectPath(-88, -300, 176, 160, 30)} fill={uphol} stroke={C.paper} strokeWidth={sw} />
      <path d={CHAIR_TUFTS} fill={C.muted} />
      <path d={rrectPath(-106, -176, 16, 62, 4) + rrectPath(90, -176, 16, 62, 4)} fill={leg} stroke={C.paper} strokeWidth={sw * 0.6} />
      <path d={rrectPath(-112, -198, 30, 24, 10) + rrectPath(82, -198, 30, 24, 10)} fill={uphol} stroke={C.paper} strokeWidth={sw} />
      <path d="M-92 -166L92 -166L104 -148L-104 -148Z" fill={mix(uphol, C.paper, 0.12)} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <path d={rrectPath(-104, -150, 208, 40, 14)} fill={uphol} stroke={C.paper} strokeWidth={sw} />
      <path d={rrectPath(-94, -112, 14, 112, 3) + rrectPath(80, -112, 14, 112, 3)} fill={leg} stroke={C.paper} strokeWidth={sw * 0.6} />
    </g>
  );
};
export const witnessChairQuad = (p: WitnessChairProps): Pt[] => propQuad(chairPlace(p), {x: -112, y: -300, w: 224, h: 300});
/** World point at the centre of the seat's top (where a Bill sinks onto it). */
export const chairSeat = (p: WitnessChairProps): Pt => propPoint(chairPlace(p), {x: 0, y: -158});
export const witnessChairGraphic = (o: PropGraphicOpts<WitnessChairProps>): DecorGraphic => propGraphic(o, WitnessChair, witnessChairQuad);
