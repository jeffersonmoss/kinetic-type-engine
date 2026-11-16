// Truss: a light truss beam, two parallel chords with zig-zag webbing, drawn in world px (no anchor transform). Ported
// from the DOGEfather kit (K14, S04 and S05). Hang Spots from it.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropGraphicOpts, f1, propColours, propGraphic} from './common';

export interface TrussProps {
  x0: number; x1: number; y: number;
  /** Distance between the chords (default 28). */
  depth?: number;
  opacity?: number;
  strokeWidth?: number;
  /** Line colour (default the paper role). */
  colour?: string;
}
export const Truss: React.FC<TrussProps> = ({x0, x1, y, depth = 28, opacity = 1, strokeWidth = 4, colour}) => {
  const h = depth / 2;
  let d = `M${x0} ${y - h}H${x1}M${x0} ${y + h}H${x1}`;
  const n = Math.max(1, Math.round((x1 - x0) / depth));
  const w = (x1 - x0) / n;
  d += `M${x0} ${y - h}`;
  for (let k = 1; k <= n; k++) d += `L${f1(x0 + k * w)} ${k % 2 ? y + h : y - h}`;
  return <path d={d} fill="none" stroke={colour ?? propColours().paper} strokeWidth={strokeWidth} strokeLinejoin="round" opacity={opacity} />;
};
export const trussQuad = ({x0, x1, y, depth = 28, strokeWidth = 4}: TrussProps): Pt[] => {
  const h = depth / 2 + strokeWidth / 2;
  return [{x: x0, y: y - h}, {x: x1, y: y - h}, {x: x1, y: y + h}, {x: x0, y: y + h}];
};
export const trussGraphic = (o: PropGraphicOpts<TrussProps>): DecorGraphic => propGraphic(o, Truss, trussQuad);
