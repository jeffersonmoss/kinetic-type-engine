// ChipSpray: about 40 wood chips (paper and body-coloured rectangles and slivers, one path per colour) on deterministic
// parabolas from a chute exit. Ported from the DOGEfather kit (K14, item 28).
import React from 'react';
import {rad, rand} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropColours, type PropGraphicOpts, polyD, propColours, propGraphic, rectPts} from './common';

// Anchor x, y = the exit point (world). `angle` is the spray direction in world degrees (default -50, up-right);
// `scale` scales distances and chips (this prop has no natural box, so it keeps a scale rather than a size). Each chip
// appears at the exit, grows to size, flies, and shrinks away before its life ends; all are gone by p = 1.
export interface ChipSprayProps {
  x: number; y: number;
  /** Progress 0..1 through a 20-frame spray. */
  p: number;
  angle?: number;
  scale?: number;
  opacity?: number;
  /** Number of chips (default 40). */
  count?: number;
  /** Seed so two sprays differ. */
  seed?: number;
  colours?: Partial<PropColours>;
}
/** The chips alive at progress p, in the spray's own frame (before translate and scale). */
const chipsAt = ({p, angle = -50, count = 40, seed = 0}: ChipSprayProps): {pts: Pt[]; dark: boolean}[] => {
  const out: {pts: Pt[]; dark: boolean}[] = [];
  for (let i = 0; i < count; i++) {
    const t0 = 0.35 * rand('chip', seed, i, 0);
    const life = 0.55 + 0.1 * rand('chip', seed, i, 1);
    const u = (p - t0) / life;
    if (u <= 0 || u >= 1) continue;
    const dir = rad(angle + (rand('chip', seed, i, 2) - 0.5) * 30);
    const V = 300 + 220 * rand('chip', seed, i, 3);
    const G = 380;
    const pos = {x: V * u * Math.cos(dir), y: V * u * Math.sin(dir) + 0.5 * G * u * u};
    const grow = Math.min(1, u / 0.12) * (u > 0.75 ? (1 - u) / 0.25 : 1);
    const r4 = rand('chip', seed, i, 4), r5 = rand('chip', seed, i, 5);
    const sliver = r4 > 0.55;
    const w = (sliver ? 20 + 8 * r5 : 10 + 8 * r5) * grow;
    const h = (sliver ? 3.5 : 5 + 4 * r5) * grow;
    const spin = (rand('chip', seed, i, 6) - 0.5) * 900 * u + 360 * r5;
    out.push({pts: rectPts(pos, w, h, spin), dark: i % 3 === 0});
  }
  return out;
};
export const ChipSpray: React.FC<ChipSprayProps> = (props) => {
  const {x, y, scale = 1, opacity = 1} = props;
  const C = propColours(props.colours);
  let light = '', dark = '';
  for (const c of chipsAt(props)) { if (c.dark) dark += polyD(c.pts); else light += polyD(c.pts); }
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
      <path d={dark} fill={C.body} stroke={C.paper} strokeWidth={1.5 / scale} strokeLinejoin="round" />
      <path d={light} fill={C.paper} />
    </g>
  );
};
/** World quad bounding the chips alive at progress p (an empty array when none is). */
export const chipSprayQuad = (props: ChipSprayProps): Pt[] => {
  const pts = chipsAt(props).flatMap((c) => c.pts);
  if (!pts.length) return [];
  const s = props.scale ?? 1;
  const xs = pts.map((v) => props.x + v.x * s), ys = pts.map((v) => props.y + v.y * s);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}];
};
/** A ChipSpray as a board graphic. Its box is null while no chip is alive. */
export const chipSprayGraphic = (o: PropGraphicOpts<ChipSprayProps>): DecorGraphic => {
  const g = propGraphic(o, ChipSpray, chipSprayQuad);
  return {...g, box: (c) => { const b = g.box(c); return b && b[0]?.length ? b : null; }};
};
