// HosePath: the black hose of Sweet Distillation (storyboard items 39 and 55) as an engine BoardPath, so anchors can
// name it ({path: id, s}), the validator tracks its tip and TypeStage draws it under the words. A smooth curve through
// the given world points, drawn as a rubber hose (dark tube, a sheen line, a clamp collar at each end), with Syrup
// bulges travelling along it.
import React from 'react';
import {PALETTE, mixHex} from '../engine';
import type {BoardPath, Pt} from '../engine';
import {f1} from './common';
import {roleColours} from './roles';

export interface HoseBulge {
  /** Arc length along the hose, world px from its start. */
  s: number;
  /** 0 to 1 size (default 1): a bulge entering or leaving can grow or shrink. */
  size?: number;
}
export interface HoseDef {
  id: string;
  label?: string;
  /** World points the hose passes through (at least 2); a Catmull-Rom curve is fitted through them. */
  points: Pt[];
  /** Tube width, world px (default 18). */
  width?: number;
  /** Syrup bulges, fixed or as a function of song seconds. */
  bulges?: HoseBulge[] | ((t: number) => HoseBulge[]);
  /** How much of the hose is drawn (world px of arc length from the start), fixed or by song seconds; default all. */
  upTo?: number | ((t: number) => number);
  /** Hose colour (default the edge role: the darker of ground and paper), sheen (default the detail role), bulge colour
   *  (default the syrup role), outline (default the edge role mixed toward paper so it shows on the hose). */
  colour?: string; sheen?: string; syrup?: string; edge?: string;
  /** Draw a clamp collar at the start and end (default true). */
  collars?: boolean;
  opacity?: number;
}
interface Sampled {pts: Pt[]; acc: number[]; length: number}
const catmull = (P: Pt[], per = 24): Pt[] => {
  if (P.length < 2) return [...P];
  const out: Pt[] = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(P[P.length - 1]);
  return out;
};
const sample = (points: Pt[]): Sampled => {
  const pts = catmull(points);
  const acc = [0];
  for (let k = 1; k < pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
  return {pts, acc, length: acc[acc.length - 1]};
};
const at = (S: Sampled, s: number): {p: Pt; heading: number} => {
  const L = S.length;
  const u = Math.max(0, Math.min(L, s));
  let lo = 0, hi = S.acc.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S.acc[m] <= u) lo = m; else hi = m; }
  const a = S.pts[lo], b = S.pts[hi];
  const seg = S.acc[hi] - S.acc[lo] || 1;
  const k = (u - S.acc[lo]) / seg;
  return {p: {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k}, heading: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI};
};
/** Length of a hose's curve in world px. */
export const hoseLength = (points: Pt[]) => sample(points).length;
/** Point and heading at arc length s of a hose through `points` (the same curve the BoardPath uses). */
export const hosePointAt = (points: Pt[], s: number) => at(sample(points), s);

/** Builds the hose BoardPath. Put it in `board.paths`. */
export const hose = (def: HoseDef): BoardPath => {
  const S = sample(def.points);
  const upTo = (t: number) => Math.min(S.length, typeof def.upTo === 'function' ? def.upTo(t) : def.upTo ?? S.length);
  return {
    id: def.id,
    label: def.label ?? `hose ${def.id}`,
    pointAt: (s) => at(S, s),
    tipAt: (t) => at(S, upTo(t)),
    draw: (c) => {
      const C = roleColours();
      const w = def.width ?? 18;
      const colour = def.colour ?? C.edge, sheen = def.sheen ?? C.muted, syrup = def.syrup ?? C.syrup;
      const edge = def.edge ?? C.edge;
      const L = upTo(c.t);
      if (L <= 0) return null;
      // the drawn polyline up to L
      const pts: Pt[] = [];
      for (let k = 0; k < S.pts.length && S.acc[k] < L; k++) pts.push(S.pts[k]);
      pts.push(at(S, L).p);
      const d = pts.map((v, k) => `${k ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('');
      // the sheen runs along the upper-left side of the tube: each point pushed along its normal, toward -y
      const off = w * 0.22;
      const sheenD = pts.map((v, k) => {
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        const tx = b.x - a.x, ty = b.y - a.y, n = Math.hypot(tx, ty) || 1;
        let nx = -ty / n, ny = tx / n;
        if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
        return `${k ? 'L' : 'M'}${f1(v.x + nx * off)} ${f1(v.y + ny * off)}`;
      }).join('');
      const bl = typeof def.bulges === 'function' ? def.bulges(c.t) : def.bulges ?? [];
      const collar = (s: number, key: string) => {
        const {p, heading} = at(S, s);
        return <rect key={key} x={-9} y={-(w / 2 + 5)} width={18} height={w + 10} rx={3} fill={C.muted} stroke={edge} strokeWidth={3} transform={`translate(${f1(p.x)} ${f1(p.y)}) rotate(${f1(heading)})`} />;
      };
      return (
        <g opacity={def.opacity ?? 1}>
          <path d={d} fill="none" stroke={edge} strokeWidth={w + 6} strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} fill="none" stroke={colour} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
          <path d={sheenD} fill="none" stroke={sheen} strokeWidth={Math.max(2, w * 0.16)} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />
          {bl.filter((b) => b.s > 0 && b.s < L).map((b, k) => {
            const {p, heading} = at(S, b.s);
            const z = Math.max(0, Math.min(1, b.size ?? 1));
            const len = 46 * z, wid = (w + 16) * z;
            return (
              <g key={`b${k}`} transform={`translate(${f1(p.x)} ${f1(p.y)}) rotate(${f1(heading)})`}>
                <ellipse rx={f1(len / 2)} ry={f1(wid / 2)} fill={syrup} stroke={edge} strokeWidth={3} />
                <ellipse cx={f1(-len * 0.1)} cy={f1(-wid * 0.2)} rx={f1(len * 0.22)} ry={f1(wid * 0.1)} fill={mixHex(syrup, PALETTE.paper, 0.55)} />
              </g>
            );
          })}
          {(def.collars ?? true) && [collar(4, 'c0'), L >= S.length ? collar(S.length - 4, 'c1') : null]}
        </g>
      );
    },
  };
};
