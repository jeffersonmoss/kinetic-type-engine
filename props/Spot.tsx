// Spot: a stage spotlight can with barn doors, hung from a clamp on a truss, and a steady flat beam. Ported from the
// DOGEfather kit (K14, S04 and S05).
import React from 'react';
import {clamp, rad, rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, Tube, circlePath, f1, mix, outline, place, polyD, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

// Anchor: the clamp point, on the truss centre line (place it at the Truss's y). The can hangs below and points
// straight down at aim 0. Natural size of the fixture about 140 x 200 (beam extra).
/** `size` is the 140 fixture width. */
export const SPOT_SIZE = {w: 140, h: 200};
export interface SpotProps extends PropBase {
  /** Beam direction in degrees from straight down; positive swings the beam toward +x (screen right). */
  aim?: number;
  /** Beam length px (default 900) and full spread in degrees (default 22). */
  beam?: number;
  spread?: number;
  /** Beam opacity multiplier 0..1 (beam is paper at 0.16 times this). Also lights the lens. */
  on?: number;
}
const SPOT_PIVOT: Pt = {x: 0, y: 90};
const spotBeamDesign = (p: SpotProps): Pt[] => {
  const aim = p.aim ?? 0, len = p.beam ?? 900, spread = p.spread ?? 22;
  const dir = rot({x: 0, y: 1}, -aim), perp = {x: -dir.y, y: dir.x};
  const L = {x: SPOT_PIVOT.x + dir.x * 64, y: SPOT_PIVOT.y + dir.y * 64};
  const w0 = 34, w1 = w0 + len * Math.tan(rad(spread / 2));
  const F = {x: L.x + dir.x * len, y: L.y + dir.y * len};
  return [
    {x: L.x + perp.x * w0, y: L.y + perp.y * w0}, {x: F.x + perp.x * w1, y: F.y + perp.y * w1},
    {x: F.x - perp.x * w1, y: F.y - perp.y * w1}, {x: L.x - perp.x * w0, y: L.y - perp.y * w0},
  ];
};
const spotPlace = (p: SpotProps) => place(p, SPOT_SIZE.w);
export const Spot: React.FC<SpotProps> = (p) => {
  const q = spotPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const on = clamp(p.on ?? 1);
  const aim = p.aim ?? 0;
  const door = (s: 1 | -1) => `M${44 * s} 62L${f1(s * (44 + 28 * Math.sin(rad(34))))} ${f1(62 + 28 * Math.cos(rad(34)))}`;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {on > 0 && <path d={polyD(spotBeamDesign(p))} fill={C.paper} opacity={0.16 * on} />}
      <g transform={`translate(${SPOT_PIVOT.x} ${SPOT_PIVOT.y}) rotate(${f1(-aim)})`}>
        <Tube d={door(-1)} w={12} fill={C.body} sw={sw * 0.7} edge={C.paper} cap="round" />
        <Tube d={door(1)} w={12} fill={C.body} sw={sw * 0.7} edge={C.paper} cap="round" />
        <path d={rrectPath(-28, -62, 56, 22, 10)} fill={C.body} {...outline(q, C)} />
        <path d={rrectPath(-36, -48, 72, 102, 6)} fill={C.body} {...outline(q, C)} />
        <path d="M-24 -30H24M-24 -18H24" stroke={mix(C.body, C.ground, 0.5)} strokeWidth={4} strokeLinecap="round" />
        <path d={rrectPath(-44, 50, 88, 12, 3)} fill={C.muted} {...outline(q, C, 0.7)} />
        <path d={rrectPath(-36, 61, 72, 6, 2)} fill={mix(C.ground, C.paper, on)} />
      </g>
      <path d={rrectPath(-5, 22, 10, SPOT_PIVOT.y - 22, 2)} fill={C.muted} {...outline(q, C, 0.5)} />
      <path d={circlePath(SPOT_PIVOT.x, SPOT_PIVOT.y, 10)} fill={C.muted} {...outline(q, C, 0.6)} />
      <path d={rrectPath(-12, 4, 24, 22, 4)} fill={C.ground} {...outline(q, C, 0.6)} />
      <path d={circlePath(17, 15, 5)} fill={C.muted} />
    </g>
  );
};
/** World polygon of the beam (4 points: lens edges and far edges), for lighting a word in its pool. */
export const spotBeamPolygon = (p: SpotProps): Pt[] => { const q = spotPlace(p); return spotBeamDesign(p).map((v) => propPoint(q, v)); };
/** World quad of the fixture only (the beam is light words may sit in; it is not part of the box). */
export const spotQuad = (p: SpotProps): Pt[] => propQuad(spotPlace(p), {x: -70, y: -4, w: 140, h: 200});
export const spotGraphic = (o: PropGraphicOpts<SpotProps>): DecorGraphic => propGraphic(o, Spot, spotQuad);
