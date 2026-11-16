// Pen: a click ballpoint pen in writing pose. Ported from the DOGEfather kit (K14, item 31).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural length 362 along the pen's axis (`size` is this length), 32 thick (clip to 22 off-axis). */
export const PEN_SIZE = {w: 362, h: 44};
/** At angle 0 the pen's axis runs from the tip up and to the right at 45 degrees (writing pose). */
export const PEN_AXIS_DEG = -45;
const PEN_RIDGES = (() => { let d = ''; for (let u = 52; u <= 122; u += 10) d += `M${u} -14V14`; return d; })();
export interface PenProps extends PropBase {
  /** 0..1: the click button pressed in (10 px). */
  click?: number;
}
const penPlace = (p: PenProps) => place(p, PEN_SIZE.w);
/** Ballpoint pen: metal point with ball, ridged grip, accent2 barrel, end cap with a pocket clip, and a click button.
 *  Anchor: the tip. At angle 0 the body runs up and to the right from the tip at 45 degrees, so it writes like a
 *  right hand; add `angle` to turn it about the tip. */
export const Pen: React.FC<PenProps> = (p) => {
  const q = penPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const grip = mix(C.accent2, C.ground, 0.35), metal = mix(C.paper, C.muted, 0.45);
  const c = clamp(p.click ?? 0);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={`rotate(${PEN_AXIS_DEG})`}>
        <path d={rrectPath(336 - 10 * c, -8, 26, 16, 4)} fill={metal} stroke={C.paper} strokeWidth={sw * 0.6} />
        <path d="M3 -3L40 -15L318 -16L342 -15L342 15L318 16L40 15L3 3Z" fill="none" stroke={C.paper} strokeWidth={2 * sw} strokeLinejoin="round" />
        <circle cx={2.5} cy={0} r={2.5} fill={C.muted} />
        <path d="M3 -3L40 -13L40 13L3 3Z" fill={metal} />
        <rect x={40} y={-15} width={92} height={30} fill={grip} />
        <path d={PEN_RIDGES} stroke={mix(C.accent2, C.ground, 0.6)} strokeWidth={3} />
        <rect x={132} y={-16} width={186} height={32} fill={C.accent2} />
        <path d={rrectPath(318, -15, 24, 30, 4)} fill={grip} />
        <path d="M196 -24H334V-14H200Q193 -14 193 -19Q193 -24 196 -24Z" fill={metal} stroke={C.paper} strokeWidth={sw * 0.6} strokeLinejoin="round" />
      </g>
    </g>
  );
};
export const penQuad = (p: PenProps): Pt[] => propQuad({...penPlace(p), angle: (p.angle ?? 0) + PEN_AXIS_DEG}, {x: -4, y: -26, w: 368, h: 44});
/** World point of the pen's writing tip. */
export const penTip = (p: PenProps): Pt => ({x: p.x, y: p.y});
export const penGraphic = (o: PropGraphicOpts<PenProps>): DecorGraphic => propGraphic(o, Pen, penQuad);
