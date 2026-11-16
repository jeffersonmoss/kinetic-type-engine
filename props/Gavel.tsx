// Gavel: a gavel and round sound block; the gavel swings down onto the block. Ported from the DOGEfather kit (K14,
// item 34).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size: sound block 180 wide (x -90 to 90, top face centre y -40); the gavel's handle pivot sits at
 *  (220, -100), so the whole prop spans about x -90 to 232 and up to y -330 when raised. `size` is the 322 width. */
export const GAVEL_SIZE = {w: 322, h: 330};
const GAVEL_PIVOT = {x: 220, y: -100};
export interface GavelProps extends PropBase {
  /** 0 = raised (head up 50 degrees about the handle's end), 1 = contact: the head's flat end face on the block. */
  swing?: number;
}
const gavelPlace = (p: GavelProps) => place(p, GAVEL_SIZE.w);
/** Gavel and round sound block. The gavel turns about the end of its handle; at swing 1 the handle is level and the
 *  head stands upright with its lower flat end face resting on the centre of the block's top. Wood is the accent mixed
 *  half toward the ground, with brass bands. Anchor: bottom-centre of the sound block. */
export const Gavel: React.FC<GavelProps> = (p) => {
  const q = gavelPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const wood = mix(C.accent, C.ground, 0.5), woodLight = mix(wood, C.paper, 0.22), brass = mix(C.highlight, C.accent, 0.35);
  const th = 50 * (1 - clamp(p.swing ?? 0));
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d="M-90 -40V-14A90 14 0 0 0 90 -14V-40Z" fill={wood} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <ellipse cx={0} cy={-40} rx={90} ry={14} fill={woodLight} stroke={C.paper} strokeWidth={sw} />
      <g transform={`translate(${GAVEL_PIVOT.x} ${GAVEL_PIVOT.y}) rotate(${f1(th)})`}>
        <path d="M12 -8L-192 -10L-192 10L12 8A8 8 0 0 0 12 -8Z" fill={wood} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
        <path d={rrectPath(-200, -14, 10, 28, 2)} fill={brass} />
        <path d={rrectPath(-248, -60, 56, 120, 6)} fill={wood} stroke={C.paper} strokeWidth={sw} />
        <path d={rrectPath(-249, -48, 58, 9, 2) + rrectPath(-249, 39, 58, 9, 2)} fill={brass} />
        <ellipse cx={-220} cy={-60} rx={27} ry={5} fill={woodLight} />
        <ellipse cx={-220} cy={60} rx={27} ry={5} fill={woodLight} />
      </g>
    </g>
  );
};
export const gavelQuad = (p: GavelProps): Pt[] => propQuad(gavelPlace(p), {x: -90, y: -330, w: 322, h: 330});
/** World point at the centre of the head's striking face. */
export const gavelFace = (p: GavelProps): Pt => {
  const th = (50 * (1 - clamp(p.swing ?? 0)) * Math.PI) / 180;
  const v = {x: -220, y: 60};
  return propPoint(gavelPlace(p), {x: GAVEL_PIVOT.x + v.x * Math.cos(th) - v.y * Math.sin(th), y: GAVEL_PIVOT.y + v.x * Math.sin(th) + v.y * Math.cos(th)});
};
export const gavelGraphic = (o: PropGraphicOpts<GavelProps>): DecorGraphic => propGraphic(o, Gavel, gavelQuad);
