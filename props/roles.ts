// Colour roles for the props added for Sweet Distillation (Book, Still, Bot and the rest). The same roles as
// common.ts propColours, with three differences that only matter to a film that sets the engine palette's optional prop
// roles (KIT.md 2.5): `body` reads PALETTE.body, `muted` reads PALETTE.detail and `wall` reads PALETTE.ground2. With
// those roles unset the engine fills them with the same defaults common.ts derives, so the colours are identical.
// Two more roles: `edge`, the outline colour (default: the darker of the palette's ground and paper, so a film on light
// grounds gets dark outlines), and `syrup`, the distillate (default: highlight mixed 30 percent toward accent).
// Read inside a component body, never at module load.
import {PALETTE, mixHex} from '../engine';
import {type PropColours, propColours} from './common';

export interface RoleColours extends PropColours {
  /** Outline and edge colour of the new props. */
  edge: string;
  /** Liquid in the Still, the Hose bulges, the Glass, the Bot's fill and a Drop. */
  syrup: string;
}
const lum = (hex: string) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  if (v.some(Number.isNaN)) return 0.5;
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
/** The prop colours with the engine palette's prop roles honoured, plus `edge` and `syrup`. */
export const roleColours = (o?: Partial<RoleColours>): RoleColours => {
  const P = PALETTE;
  const base = propColours();
  const r: RoleColours = {
    ...base,
    body: P.body ?? base.body,
    muted: P.detail ?? base.muted,
    wall: P.ground2 ?? base.wall,
    edge: lum(P.ground) <= lum(P.paper) ? P.ground : P.paper,
    syrup: mixHex(P.highlight, P.accent, 0.3),
  };
  return {...r, ...o};
};
/** Stroke-dasharray that draws the first `frac` of a path of length `L` as dashes `on`/`off` long (frac 1: the whole
 *  dashed path; 0: nothing). `on` 0 means a solid stroke drawn on. */
export const partialDash = (L: number, frac: number, on = 0, off = 0): string | undefined => {
  const f = Math.max(0, Math.min(1, frac));
  if (f >= 1 && on <= 0) return undefined;
  const drawn = L * f;
  if (on <= 0) return `${drawn.toFixed(2)} ${(L + 1).toFixed(2)}`;
  const parts: number[] = [];
  let s = 0;
  while (s < drawn) {
    const d = Math.min(on, drawn - s);
    parts.push(d);
    s += d;
    if (s >= drawn) break;
    const g = Math.min(off, drawn - s);
    parts.push(g);
    s += g;
  }
  if (!parts.length) return `0 ${(L + 1).toFixed(2)}`;
  if (parts.length % 2 === 1) parts.push(L + 1);
  else parts[parts.length - 1] += L + 1;
  return parts.map((n) => n.toFixed(2)).join(' ');
};
/** Perimeter of a rounded rectangle. */
export const rrectPerimeter = (w: number, h: number, r: number) => {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  return 2 * (w + h) - 8 * q + 2 * Math.PI * q;
};
/** A small seeded random in [0, 1) (stable per seed and index). */
export const seeded = (seed: number, k: number) => {
  let h = Math.imul((seed | 0) + 0x9e3779b1, 0x85ebca6b) ^ Math.imul((k | 0) + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

// ------------------------------------------------------------------ simple oblique 3D (three-quarter views)

/** A 3D point: x right, h up, z away from the viewer. */
export interface P3 {x: number; h: number; z: number}
/** Oblique projection with depth receding along (rx, ry) screen px per unit of z (rx < 0: depth goes up-left, so the
 *  left side of a box is seen; rx > 0: the right side). */
export const oblique = (rx: number, ry: number) => (p: P3) => ({x: p.x + rx * p.z, y: -p.h + ry * p.z});
/** SVG matrix that maps a face's own coordinates (u along A, v along B, from origin O) to the screen. */
export const faceMatrix = (P: (p: P3) => {x: number; y: number}, O: P3, A: P3, B: P3) => {
  const o = P(O), a = P({x: O.x + A.x, h: O.h + A.h, z: O.z + A.z}), b = P({x: O.x + B.x, h: O.h + B.h, z: O.z + B.z});
  const f = (n: number) => n.toFixed(4);
  return `matrix(${f(a.x - o.x)} ${f(a.y - o.y)} ${f(b.x - o.x)} ${f(b.y - o.y)} ${f(o.x)} ${f(o.y)})`;
};
/** Convex hull of 2D points (monotone chain), counter-clockwise. */
export const hull = (pts: {x: number; y: number}[]) => {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: {x: number; y: number}, a: {x: number; y: number}, b: {x: number; y: number}) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: typeof p = [], up: typeof p = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let k = p.length - 1; k >= 0; k--) { const q = p[k]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
};
/** Bounding box of points as {x, y, w, h}. */
export const bboxOf = (pts: {x: number; y: number}[]) => {
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return {x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0};
};
