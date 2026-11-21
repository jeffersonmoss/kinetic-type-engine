// The 3D turn's geometry and drawing (KIT 89; Fable brief, vertical energy pass, item 5). Pure math plus one small
// React component, shared by the turn verb (emergence/turn.ts), the board exit 'turn', the renderer (TypeStage) and,
// through the affine stand-in each turn puts into the word's mod, the validator.
//
// A turning element is a flat plane in its block's frame that rotates about a line in that plane (the pivot: an edge
// or the centre line) and is seen in true perspective by an eye `persp` block px in front of the pivot line: points
// that swing away shrink toward the pivot line, points that swing toward the eye grow (foreshortening, not a squash).
// For axis 'y' (a vertical line) the turning coordinate is x; for axis 'x' it is y.
//
// Why projected geometry and not CSS: the board is one SVG, drawn inside the camera transform, clip paths, smear
// samples and carries. Chrome does not apply perspective (3D CSS transforms) to SVG children, and lifting a word into
// an HTML layer would break its drawing order and every clip. A perspective projection is not affine, so the plane is
// cut into thin strips, each strip into two triangles, and each triangle is drawn as a clipped copy of the content
// under the one affine map that sends its three corners to their projected places: exact at every vertex, and within a
// fraction of a pixel inside. The same projection gives the validator its box, so the two cannot drift apart.
import React from 'react';
import type {Pt, TurnAxis, TurnPivot, TurnSpec} from './types';
import {clamp, easeInCubic, easeInOutCubic, easeInOutSine, easeInQuad, easeOutCubic, easeOutQuad, rad} from './util';

export const TURN_DEFAULTS = {axis: 'y' as TurnAxis, pivot: 'centre' as TurnPivot, dir: 1 as 1 | -1, deg: 90, frames: 10, stagger: 0, perspective: 900, unit: 'block' as const};
/** Below this |cos| the plane is edge-on and draws nothing. */
export const TURN_EDGE_COS = 0.02;

/** A plane mid-turn, in block-local px. theta: degrees; positive moves the side of the pivot with larger coordinate
 *  (right for axis y, bottom for axis x) away from the viewer. span: the plane's extent along the turning coordinate
 *  (the back face is drawn mirrored within it, so a flip past 90 degrees reads the right way round). centre: where the
 *  eye sits along the axis coordinate. */
export interface TurnPlane {axis: TurnAxis; theta: number; pivot: number; centre: number; persp: number; span: [number, number]}
/** What a turn puts into a WordMod (WordMod.turn): the plane the renderer projects the whole word through, or one plane
 *  per letter (stagger); 'hidden' is edge-on or not yet turned in, null a letter at rest. `stand` is the affine
 *  stand-in (block-local, about the word's centre) the turn added to the mod's dx, dy, sx, sy: the box of the projected
 *  word, which the validator measures. The renderer removes it and draws the projection instead. */
export interface TurnDraw {
  plane?: TurnPlane | 'hidden';
  letters?: (TurnPlane | 'hidden' | null)[];
  stand: {dx: number; dy: number; sx: number; sy: number};
}
export interface Rect {x0: number; y0: number; x1: number; y1: number}

/** The resolved spec: axis inferred from the pivot when not given (top or bottom: 'x'); a pivot that does not lie
 *  across the axis (top or bottom with axis 'y', left or right with axis 'x') falls back to the centre line. */
export const resolveTurn = (s: TurnSpec | undefined) => {
  const pivot0 = s?.pivot ?? TURN_DEFAULTS.pivot;
  const axis: TurnAxis = s?.axis ?? (pivot0 === 'top' || pivot0 === 'bottom' ? 'x' : 'y');
  const fits = pivot0 === 'centre' || (axis === 'y' ? pivot0 === 'left' || pivot0 === 'right' : pivot0 === 'top' || pivot0 === 'bottom');
  return {
    axis, pivot: (fits ? pivot0 : 'centre') as TurnPivot,
    dir: (s?.dir ?? 1) < 0 ? -1 : 1,
    deg: Math.max(0, s?.deg ?? TURN_DEFAULTS.deg),
    frames: Math.max(1, s?.frames ?? TURN_DEFAULTS.frames),
    stagger: Math.max(0, s?.stagger ?? 0),
    perspective: Math.max(50, s?.perspective ?? TURN_DEFAULTS.perspective),
    unit: s?.unit ?? TURN_DEFAULTS.unit,
    ease: turnEase(s?.ease),
  };
};
export type ResolvedTurn = ReturnType<typeof resolveTurn>;

const EASES: Record<string, (p: number) => number> = {
  linear: (p) => clamp(p), sine: easeInOutSine, inOutSine: easeInOutSine, cubic: easeInOutCubic, inOutCubic: easeInOutCubic,
  outCubic: easeOutCubic, inCubic: easeInCubic, inQuad: easeInQuad, outQuad: easeOutQuad,
  quart: (p) => { const x = clamp(p); return x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2; },
};
/** An engine ease by name ('linear', 'sine' or 'inOutSine' (default), 'cubic' or 'inOutCubic', 'outCubic', 'inCubic',
 *  'inQuad', 'outQuad', 'quart'); an easeX spelling ('easeOutCubic') works too. */
export const turnEase = (name?: string): ((p: number) => number) => {
  if (!name) return easeInOutSine;
  const k = name.replace(/^ease/, '');
  return EASES[k] ?? EASES[k.charAt(0).toLowerCase() + k.slice(1)] ?? easeInOutSine;
};

/** The plane of a rect turning about `pivot` at theta degrees, the eye `perspBlock` block px in front of the pivot. */
export const planeFor = (r: Rect, t: ResolvedTurn, theta: number, perspBlock: number): TurnPlane => {
  const y = t.axis === 'y';
  const lo = y ? r.x0 : r.y0, hi = y ? r.x1 : r.y1;
  const pivot = t.pivot === 'left' || t.pivot === 'top' ? lo : t.pivot === 'right' || t.pivot === 'bottom' ? hi : (lo + hi) / 2;
  const centre = y ? (r.y0 + r.y1) / 2 : (r.x0 + r.x1) / 2;
  return {axis: t.axis, theta, pivot, centre, persp: perspBlock, span: [lo, hi]};
};

/** Projects a block-local point through a turning plane. */
export const projectTurn = (pl: TurnPlane, p: Pt, reach = 0): Pt => {
  const c = Math.cos(rad(pl.theta)), s = Math.sin(rad(pl.theta));
  const y = pl.axis === 'y';
  let a = y ? p.x : p.y; // the turning coordinate
  const v = (y ? p.y : p.x) - pl.centre;
  if (c < 0) a = pl.span[0] + pl.span[1] - a; // the back face, printed to read the right way round
  const u = a - pl.pivot;
  // the eye never comes inside the plane: at least 1.25 times the farthest point's reach from the pivot
  const far = Math.max(Math.abs(pl.span[0] - pl.pivot), Math.abs(pl.span[1] - pl.pivot), reach);
  const P = Math.max(pl.persp, 1.25 * far);
  const k = P / (P + u * s);
  const a2 = pl.pivot + u * c * k, v2 = pl.centre + v * k;
  return y ? {x: a2, y: v2} : {x: v2, y: a2};
};
export const edgeOn = (pl: TurnPlane) => Math.abs(Math.cos(rad(pl.theta))) < TURN_EDGE_COS;

/** Block-local bounding box of a rect through a plane (its corners: the projection keeps straight lines straight). */
export const projectedBox = (pl: TurnPlane, r: Rect): Rect => {
  const reach = reachOf(pl, r);
  const q = [{x: r.x0, y: r.y0}, {x: r.x1, y: r.y0}, {x: r.x1, y: r.y1}, {x: r.x0, y: r.y1}].map((p) => projectTurn(pl, p, reach));
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  return {x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys)};
};
const reachOf = (pl: TurnPlane, r: Rect) => {
  const y = pl.axis === 'y';
  return Math.max(Math.abs((y ? r.x0 : r.y0) - pl.pivot), Math.abs((y ? r.x1 : r.y1) - pl.pivot));
};

/** The affine stand-in (about centre (cx, cy)) that maps the box [x0, x1] x [y0, y1] onto `b`. */
export const standFor = (cx: number, cy: number, box: Rect, b: Rect) => {
  const sx = Math.max(0.001, (b.x1 - b.x0) / Math.max(1e-6, box.x1 - box.x0));
  const sy = Math.max(0.001, (b.y1 - b.y0) / Math.max(1e-6, box.y1 - box.y0));
  return {sx, sy, dx: b.x0 - cx - (box.x0 - cx) * sx, dy: b.y0 - cy - (box.y0 - cy) * sy};
};

/** SVG matrix taking source triangle s to destination triangle d. */
const affine = (s: Pt[], d: Pt[]): string | null => {
  const den = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y);
  if (Math.abs(den) < 1e-9) return null;
  const A = ((d[1].x - d[0].x) * (s[2].y - s[0].y) - (d[2].x - d[0].x) * (s[1].y - s[0].y)) / den;
  const C = ((d[2].x - d[0].x) * (s[1].x - s[0].x) - (d[1].x - d[0].x) * (s[2].x - s[0].x)) / den;
  const B = ((d[1].y - d[0].y) * (s[2].y - s[0].y) - (d[2].y - d[0].y) * (s[1].y - s[0].y)) / den;
  const D = ((d[2].y - d[0].y) * (s[1].x - s[0].x) - (d[1].y - d[0].y) * (s[2].x - s[0].x)) / den;
  const E = d[0].x - A * s[0].x - C * s[0].y, F = d[0].y - B * s[0].x - D * s[0].y;
  const n = (x: number) => (Math.abs(x) < 1e-9 ? '0' : x.toFixed(6));
  return `matrix(${n(A)} ${n(B)} ${n(C)} ${n(D)} ${n(E)} ${n(F)})`;
};

/** Draws `children` (block-local) through a turning plane: the rect `r` cut into strips across the turning direction
 *  (more where the plane is steeper), each strip into two triangles, each a clipped copy of the children under its own
 *  affine map. Triangles overlap by `seam` block px so no hairline shows between them; give the group its opacity
 *  outside, so the overlaps never double up. */
export const TurnProjected: React.FC<{plane: TurnPlane | 'hidden'; rect: Rect; uid: string; seam?: number; children: React.ReactNode}> = ({plane, rect, uid, seam = 0.8, children}) => {
  if (plane === 'hidden' || edgeOn(plane)) return null;
  const y = plane.axis === 'y';
  const lo = y ? rect.x0 : rect.y0, hi = y ? rect.x1 : rect.y1;
  const across0 = y ? rect.y0 : rect.x0, across1 = y ? rect.y1 : rect.x1;
  const s = Math.abs(Math.sin(rad(plane.theta)));
  const n = Math.max(2, Math.min(32, Math.ceil(((hi - lo) / 24) * (0.35 + s))));
  const pt = (a: number, b: number): Pt => (y ? {x: a, y: b} : {x: b, y: a});
  const reach = reachOf(plane, rect);
  const pr = (p: Pt) => projectTurn(plane, p, reach);
  const tris: Pt[][] = [];
  for (let k = 0; k < n; k++) {
    const a0 = lo + ((hi - lo) * k) / n, a1 = lo + ((hi - lo) * (k + 1)) / n;
    tris.push([pt(a0, across0), pt(a1, across0), pt(a1, across1)], [pt(a0, across0), pt(a1, across1), pt(a0, across1)]);
  }
  return (
    <g>
      {tris.map((t, k) => {
        const m = affine(t, t.map(pr));
        if (!m) return null;
        // the clip triangle, grown by `seam` about its centroid
        const c = {x: (t[0].x + t[1].x + t[2].x) / 3, y: (t[0].y + t[1].y + t[2].y) / 3};
        const g = t.map((p) => { const d = Math.hypot(p.x - c.x, p.y - c.y) || 1; return {x: p.x + ((p.x - c.x) / d) * seam, y: p.y + ((p.y - c.y) / d) * seam}; });
        const id = `${uid}-t${k}`;
        return (
          <g key={k} transform={m}>
            <clipPath id={id}><path d={`M${g[0].x.toFixed(2)} ${g[0].y.toFixed(2)}L${g[1].x.toFixed(2)} ${g[1].y.toFixed(2)}L${g[2].x.toFixed(2)} ${g[2].y.toFixed(2)}Z`} /></clipPath>
            <g clipPath={`url(#${id})`}>{children}</g>
          </g>
        );
      })}
    </g>
  );
};
