// Mug: a glass beer mug with a handle and an overflowing foam head. Ported from the DOGEfather kit (K14, item 22).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size: glass body 110 x 180 (x -55 to 55), handle to x 105, foam head to y -196. `size` is the 160 width. */
export const MUG_SIZE = {w: 160, h: 196};
const FOAM_TOP = (() => {
  // scalloped foam crown from x -58 to 58, bumps of radius 12 around y -184
  let d = 'M-52 -150L-52 -178';
  const xs = [-58, -35, -12, 12, 35, 58];
  d += `L${xs[0]} -180`;
  for (let k = 1; k < xs.length; k++) d += `A12.5 12.5 0 0 1 ${xs[k]} -180`;
  d += 'L52 -178L52 -150Z';
  return d;
})();
const MUG_HANDLE = 'M55 -152H83A22 22 0 0 1 105 -130V-58A22 22 0 0 1 83 -36H55V-60H71A10 10 0 0 0 81 -70V-118A10 10 0 0 0 71 -128H55Z';
export type MugProps = PropBase;
const mugPlace = (p: MugProps) => place(p, MUG_SIZE.w);
/** Glass beer mug with a handle and an overflowing foam head. Anchor: bottom-centre of the glass body. Glass is a paper
 *  tint at reduced opacity over a flat amber beer (highlight mixed 35 percent toward accent), thick base, two panel
 *  lines, paper foam with a drip. */
export const Mug: React.FC<MugProps> = (p) => {
  const q = mugPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const beer = mix(C.highlight, C.accent, 0.35);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={MUG_HANDLE} fill={C.paper} fillOpacity={0.18} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <path d={rrectPath(-55, -180, 110, 180, 10)} fill={C.paper} fillOpacity={0.16} />
      <path d={rrectPath(-46, -150, 92, 138, 5)} fill={beer} />
      <path d={FOAM_TOP} fill={C.paper} />
      <path d="M-28 -164V-24M28 -164V-24" stroke={C.paper} strokeOpacity={0.35} strokeWidth={5} strokeLinecap="round" />
      <path d="M-46 -12H46" stroke={C.paper} strokeOpacity={0.4} strokeWidth={3} />
      <path d={rrectPath(-55, -180, 110, 180, 10)} fill="none" stroke={C.paper} strokeWidth={sw} />
      <path d="M48 -178Q58 -158 57 -142Q56 -132 61 -132Q66 -132 64 -143L62 -180Z" fill={C.paper} />
    </g>
  );
};
export const mugQuad = (p: MugProps): Pt[] => propQuad(mugPlace(p), {x: -58, y: -196, w: 163, h: 196});
export const mugGraphic = (o: PropGraphicOpts<MugProps>): DecorGraphic => propGraphic(o, Mug, mugQuad);
