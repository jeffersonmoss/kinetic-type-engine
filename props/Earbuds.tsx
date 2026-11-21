// Earbuds: a pair of wireless earbuds (Paper Trail storyboard items 61 and 214): two glossy buds, each a rounded head
// with a dark speaker grille turned inward, a long stem below with a metal tip, mirrored and tilted apart.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, propGraphic, propQuad, propTransform, rrectPath} from './common';
import {outlineFor, worldPx} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: the pair is 120 wide (x -60 to 60) and 108 tall (y -54 to 54). Anchor: centre. `size` is the 120
 *  width. */
export const EARBUDS_SIZE = {w: 120};
export interface EarbudsProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Bud colour (default paper). */
  tone?: string;
}
const budsPlace = (p: EarbudsProps) => place(p, EARBUDS_SIZE.w);
export const Earbuds: React.FC<EarbudsProps> = (p) => {
  const q = budsPlace(p);
  const sw = outlineFor(q, EARBUDS_SIZE.w, 0.03);
  const C = roleColours(p.colours);
  const tone = p.tone ?? C.paper;
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const bud = (side: 1 | -1) => (
    <g transform={`translate(${side * 30} 0) rotate(${side * 12}) scale(${side} 1)`}>
      <path d={rrectPath(-8, -14, 16, 64, 8)} fill={tone} {...E} />
      <path d={rrectPath(-6, 40, 12, 9, 4)} fill={mix(C.muted, C.paper, 0.35)} />
      <path d="M-20 -24C-22 -46 4 -54 20 -42C30 -34 26 -16 14 -10C6 -6 -4 -4 -10 -10C-16 -14 -20 -18 -20 -24Z" fill={tone} {...E} />
      <path d={`M-14 -30C-15 -38 -8 -42 -2 -40`} fill="none" stroke={C.ground} strokeWidth={worldPx(q, 5)} strokeLinecap="round" />
      <path d={circlePath(12, -30, 3.5)} fill={mix(C.muted, C.ground, 0.4)} />
      <path d="M4 -46Q14 -46 18 -38" fill="none" stroke={mix(tone, C.paper, 0.8)} strokeWidth={worldPx(q, 2)} strokeLinecap="round" opacity={0.8} />
    </g>
  );
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {bud(-1)}
      {bud(1)}
    </g>
  );
};
export const earbudsQuad = (p: EarbudsProps): Pt[] => propQuad(budsPlace(p), {x: -62, y: -56, w: 124, h: 112});
export const earbudsGraphic = (o: PropGraphicOpts<EarbudsProps>): DecorGraphic => propGraphic(o, Earbuds, earbudsQuad);
