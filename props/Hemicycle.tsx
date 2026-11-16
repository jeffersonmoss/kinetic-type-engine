// Hemicycle: a parliament seat diagram that recolours from one colour to another. Ported from the DOGEfather kit (K14,
// item 34).
import React from 'react';
import {clamp, dotsPath} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propColours, propGraphic, propQuad, propTransform} from './common';

export interface HemicycleProps extends PropBase {
  /** Concentric rows (House 5, Senate 3). */
  rows?: number;
  /** Seats in all (House 120, Senate 50). */
  seats?: number;
  /** Outer radius of the seat centres' fan, design units (default 300 for 61 seats or more, else 200). `size` is the
   *  world width of the fan (natural 2 x radius). */
  radius?: number;
  /** Target colour (default accent2). */
  colour?: string;
  /** Starting colour (default muted). */
  start?: string;
  /** 0..1 recolour from `start` to `colour` (the board drives one 14-frame fade). */
  p?: number;
}
const radiusOf = (h: {seats?: number; radius?: number}) => h.radius ?? ((h.seats ?? 120) > 60 ? 300 : 200);
const hemiPlace = (h: HemicycleProps) => place(h, 2 * radiusOf(h));
/** Hemicycle seat layout (arcs, inner radius 0.4 of outer, rows filled in proportion to their length). */
export const hemicycleSeats = (h: {rows?: number; seats?: number; radius?: number}): {x: number; y: number; r: number}[] => {
  const rows = Math.max(1, Math.round(h.rows ?? 5));
  const seats = Math.max(rows, Math.round(h.seats ?? 120));
  const R = h.radius ?? (seats > 60 ? 300 : 200);
  const r0 = 0.4 * R, ring = (R - r0) / rows;
  const radii = Array.from({length: rows}, (_, i) => r0 + (i + 0.5) * ring);
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.max(2, Math.round((seats * r) / sum)));
  let diff = seats - counts.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; diff !== 0; i = (i - 1 + rows) % rows) { counts[i] += Math.sign(diff); diff -= Math.sign(diff); }
  const out: {x: number; y: number; r: number}[] = [];
  radii.forEach((r, i) => {
    const n = counts[i];
    const dot = Math.min(0.4 * ring, (0.42 * Math.PI * r) / (n - 1));
    for (let j = 0; j < n; j++) {
      const th = Math.PI * (1 - j / (n - 1));
      out.push({x: r * Math.cos(th), y: -r * Math.sin(th) - dot, r: dot});
    }
  });
  return out;
};
/** A parliament diagram: seat dots on concentric half-circle arcs. Anchor: centre of the arcs' base line (the lowest
 *  dots sit on it). House: rows 5, seats 120 (600 x 300 natural); Senate: rows 3, seats 50 (400 x 200). */
export const Hemicycle: React.FC<HemicycleProps> = (h) => {
  const C = propColours(h.colours);
  const col = mix(h.start ?? C.muted, h.colour ?? C.accent2, clamp(h.p ?? 0));
  return (
    <g transform={propTransform(hemiPlace(h))} opacity={h.opacity ?? 1}>
      <path d={dotsPath(hemicycleSeats(h))} fill={col} />
    </g>
  );
};
export const hemicycleQuad = (h: HemicycleProps): Pt[] => {
  const R = radiusOf(h);
  const pad = 0.1 * R;
  return propQuad(hemiPlace(h), {x: -R - pad, y: -R - pad, w: 2 * (R + pad), h: R + pad});
};
export const hemicycleGraphic = (o: PropGraphicOpts<HemicycleProps>): DecorGraphic => propGraphic(o, Hemicycle, hemicycleQuad);
