// TrefoilMark: a radiation trefoil, three dark blades round a dot on a small highlight disc. Ported from the
// DOGEfather kit (K14, used on the Dial).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, f1, outline, place, polar, propColours, propGraphic, propQuad, propTransform} from './common';

/** Anchor: centre. Natural diameter 56 (`size`). */
export const TREFOIL_SIZE = {w: 56, h: 56};
export const trefoilPath = (r: number) => {
  const dot = r * 0.15, r0 = r * 0.24, r1 = r * 0.78;
  let d = circlePath(0, 0, dot);
  for (const c of [-150, -30, 90]) {
    const a0 = c - 30, a1 = c + 30;
    const p0 = polar(r0, a0), p1 = polar(r1, a0), p2 = polar(r1, a1), p3 = polar(r0, a1);
    d += `M${f1(p0.x)} ${f1(p0.y)}L${f1(p1.x)} ${f1(p1.y)}A${r1} ${r1} 0 0 1 ${f1(p2.x)} ${f1(p2.y)}L${f1(p3.x)} ${f1(p3.y)}A${r0} ${r0} 0 0 0 ${f1(p0.x)} ${f1(p0.y)}Z`;
  }
  return d;
};
export type TrefoilMarkProps = PropBase;
const trefoilPlace = (p: TrefoilMarkProps) => place(p, TREFOIL_SIZE.w);
export const TrefoilMark: React.FC<TrefoilMarkProps> = (p) => {
  const q = trefoilPlace(p);
  const C = propColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={circlePath(0, 0, 28)} fill={C.highlight} {...outline(q, C, 0.5)} />
      <path d={trefoilPath(28)} fill={C.ground} />
    </g>
  );
};
export const trefoilQuad = (p: TrefoilMarkProps): Pt[] => propQuad(trefoilPlace(p), {x: -30, y: -30, w: 60, h: 60});
export const trefoilGraphic = (o: PropGraphicOpts<TrefoilMarkProps>): DecorGraphic => propGraphic(o, TrefoilMark, trefoilQuad);
