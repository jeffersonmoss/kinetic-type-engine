// ButterPat: a flat square pat of butter lying on something (a pancake, toast, a baked potato), seen from about 25
// degrees above the table, with a melt pool under it. Made for the pancake stack of "Right Chip, Wrong Huang"
// (Fable direction, pancake scene, 16 November 2026, items 13 to 17).
//
// TWIN: the film keeps a copy of this geometry in its own kit (Right Chip Wrong Huang Music Video,
// video/src/components/kit/graphics/Tokens.tsx, `butterPatParts`), because that film does not import the engine.
// Change both together.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propColours, propGraphic, propQuad, propTransform} from './common';

/** Natural size: a 56 square slab, 9 thick (about 6 to 1, a square book or first base). `size` is the 56 side. */
export const BUTTER_PAT_SIZE = {side: 56, thick: 9, cornerRadius: 4, poolRadius: 52};
export interface ButterPatProps extends PropBase {
  /** View ratio: how round things flatten (ry / rx of a circle on the table). 0.42 is about 25 degrees above. */
  tilt?: number;
  /** Degrees the square is turned on the table (30 reads as a square, not a bar). */
  turn?: number;
  /** Draw the melt pool under the pat (default true). */
  pool?: boolean;
}

/** Plan outline of a square of half side s with corners rounded at r, sampled clockwise on screen (y down). */
const roundedSquarePlan = (s: number, r: number, per = 6): Pt[] => {
  const c = s - r, out: Pt[] = [];
  const corners: [number, number, number][] = [[c, c, 0], [-c, c, 90], [-c, -c, 180], [c, -c, 270]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= per; k++) {
      const a = ((a0 + (90 * k) / per) * Math.PI) / 180;
      out.push({x: cx + r * Math.cos(a), y: cy + r * Math.sin(a)});
    }
  }
  return out;
};
const turnPt = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return {x: p.x * c - p.y * s, y: p.x * s + p.y * c};
};
const polyPath = (pts: Pt[]) => pts.map((v, k) => `${k ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('') + 'Z';
/** A smooth closed blob through `pts` (quadratic curves through the midpoints). */
const blobPath = (pts: Pt[]) => {
  const n = pts.length, mid = (a: Pt, b: Pt) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
  const m0 = mid(pts[n - 1], pts[0]);
  let d = `M${f1(m0.x)} ${f1(m0.y)}`;
  for (let k = 0; k < n; k++) { const m = mid(pts[k], pts[(k + 1) % n]); d += `Q${f1(pts[k].x)} ${f1(pts[k].y)} ${f1(m.x)} ${f1(m.y)}`; }
  return d + 'Z';
};
/** Radius multipliers of the melt pool at eight evenly spaced angles (irregular, not a lens). */
const POOL_WOBBLE = [1, 0.9, 1.05, 0.84, 0.98, 0.92, 1.04, 0.88];

/** The pat's parts as paths in design units, anchor (0, 0) at the centre of its base on the surface. The base lies at
 *  y 0, the top face `thick` higher; both are the plan square turned by `turn` and flattened by `tilt`. */
export const butterPatParts = (o: {side?: number; tilt?: number; turn?: number} = {}) => {
  const side = o.side ?? BUTTER_PAT_SIZE.side, tilt = o.tilt ?? 0.42, turn = o.turn ?? 30;
  const k = side / BUTTER_PAT_SIZE.side;
  const th = BUTTER_PAT_SIZE.thick * k;
  const plan = roundedSquarePlan(side / 2, BUTTER_PAT_SIZE.cornerRadius * k).map((p) => turnPt(p, turn));
  const proj = (p: Pt, dy: number): Pt => ({x: p.x, y: p.y * tilt + dy});
  const top = plan.map((p) => proj(p, -th));
  // front-facing segments (outward plan normal pointing at the viewer, +y): one run; split by which way it faces
  const n = plan.length;
  const front: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = plan[i], b = plan[(i + 1) % n];
    // the outward normal of a clockwise-on-screen outline is (dy, -dx); it faces the viewer when its y is positive
    if (-(b.x - a.x) > 1e-9) front.push(i);
  }
  // order the run so it is contiguous (it may wrap past index 0)
  const start = front.find((i) => !front.includes((i - 1 + n) % n)) ?? front[0];
  const run: number[] = [];
  for (let i = start; front.includes(i); i = (i + 1) % n) { run.push(i); if (run.length > n) break; }
  const band = (idx: number[]) => {
    if (!idx.length) return '';
    const pts = [...idx.map((i) => plan[i]), plan[(idx[idx.length - 1] + 1) % n]];
    return polyPath([...pts.map((p) => proj(p, -th)), ...pts.slice().reverse().map((p) => proj(p, 0))]);
  };
  // the right-hand face: the part of the run whose normal (dy, -dx) points right (+x)
  const right = run.filter((i) => { const a = plan[i], b = plan[(i + 1) % n]; return b.y - a.y > 0; });
  const pool = POOL_WOBBLE.map((w, j) => {
    const a = (j / POOL_WOBBLE.length) * Math.PI * 2 + 0.3;
    return {x: Math.cos(a) * BUTTER_PAT_SIZE.poolRadius * k * w, y: Math.sin(a) * BUTTER_PAT_SIZE.poolRadius * k * w * tilt};
  });
  return {top: polyPath(top), sides: band(run), right: band(right), pool: blobPath(pool), thick: th,
    /** Extent of the ink (pool included), design units relative to the anchor. */
    extent: {x0: -BUTTER_PAT_SIZE.poolRadius * k * 1.05, x1: BUTTER_PAT_SIZE.poolRadius * k * 1.05, y0: Math.min(...top.map((p) => p.y)), y1: Math.max(BUTTER_PAT_SIZE.poolRadius * k * 1.05 * tilt, ...plan.map((p) => p.y * tilt))}};
};

/** Butter colours from the palette roles: top face highlight mixed toward paper (pale butter), left face highlight,
 *  right face highlight a fifth toward ground, melt pool highlight 30 percent toward paper at 60 percent opacity. */
export const butterColours = (C: {highlight: string; paper: string; ground: string}) => ({
  top: mix(C.highlight, C.paper, 0.45), left: C.highlight, right: mix(C.highlight, C.ground, 0.2), pool: mix(C.highlight, C.paper, 0.3),
});

/** The pat drawn in design units at its anchor (no placement transform): for props that carry a pat (PancakeStack). */
export const ButterPatShape: React.FC<{side?: number; tilt?: number; turn?: number; pool?: boolean; colours: ReturnType<typeof butterColours>}> = ({side, tilt, turn, pool, colours}) => {
  const P = butterPatParts({side, tilt, turn});
  return (
    <g>
      {pool !== false && <path d={P.pool} fill={colours.pool} opacity={0.6} />}
      <path d={P.sides} fill={colours.left} />
      <path d={P.right} fill={colours.right} />
      <path d={P.top} fill={colours.top} />
    </g>
  );
};

const butterPlace = (p: ButterPatProps) => place(p, BUTTER_PAT_SIZE.side);
/** A flat square pat of butter on a surface, turned and seen from above at `tilt`. Anchor: the centre of its base. */
export const ButterPat: React.FC<ButterPatProps> = (p) => {
  const q = butterPlace(p);
  const C = propColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <ButterPatShape tilt={p.tilt} turn={p.turn} pool={p.pool} colours={butterColours(C)} />
    </g>
  );
};
export const butterPatQuad = (p: ButterPatProps): Pt[] => {
  const e = butterPatParts({tilt: p.tilt, turn: p.turn}).extent;
  return propQuad(butterPlace(p), {x: e.x0, y: e.y0, w: e.x1 - e.x0, h: e.y1 - e.y0});
};
export const butterPatGraphic = (o: PropGraphicOpts<ButterPatProps>): DecorGraphic => propGraphic(o, ButterPat, butterPatQuad);
