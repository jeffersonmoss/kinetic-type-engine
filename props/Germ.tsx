// Germ: a spiked-ball virus particle. Ported from the DOGEfather kit (K14, item 27).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, f1, mix, place, polar, propColours, propGraphic, propQuad, propTransform, strokeOf} from './common';

// Accent body, accent spike stems with paper knob tips. Anchor: centre. Natural diameter 40. Its body outline is half
// the standard width (3 px) so a 40 px particle still reads.
/** `size` is the 40 diameter. */
export const GERM_SIZE = {w: 40, h: 40};
export interface GermProps extends PropBase {
  /** Rotation of the particle, degrees. */
  spin?: number;
}
const germPlace = (p: GermProps) => place(p, GERM_SIZE.w);
export const Germ: React.FC<GermProps> = (p) => {
  const q = germPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  let stems = '', tips = '';
  for (let k = 0; k < 9; k++) {
    const a = k * 40;
    const q0 = polar(11, a), q1 = polar(16, a), t = polar(17, a);
    stems += `M${f1(q0.x)} ${f1(q0.y)}L${f1(q1.x)} ${f1(q1.y)}`;
    tips += circlePath(t.x, t.y, 3);
  }
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={`rotate(${f1(p.spin ?? 0)})`}>
        <path d={stems} stroke={C.accent} strokeWidth={3.5} strokeLinecap="round" />
        <path d={tips} fill={C.paper} />
        <path d={circlePath(0, 0, 12)} fill={C.accent} stroke={C.paper} strokeWidth={sw * 0.5} />
        <path d={circlePath(-4, -3, 2.6) + circlePath(4, 3, 2) + circlePath(3, -5, 1.6)} fill={mix(C.accent, C.ground, 0.35)} />
      </g>
    </g>
  );
};
export const germQuad = (p: GermProps): Pt[] => propQuad(germPlace(p), {x: -20, y: -20, w: 40, h: 40});
export const germGraphic = (o: PropGraphicOpts<GermProps>): DecorGraphic => propGraphic(o, Germ, germQuad);
