// Node-side sampling of animated, clipped words (spec 43.2, 47): the same pose maths as viewer.html, no browser.
import './interp.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function restCorners(w) {
  const r = mul(w.R, w.w / 2), u = mul(w.U, w.h / 2);
  return [add(w.C, add(mul(r, -1), mul(u, -1))), add(w.C, add(r, mul(u, -1))), add(w.C, add(r, u)), add(w.C, add(mul(r, -1), u))];
}

// Clip a 3D polygon to the half-space (x - P) . n >= 0.
export function clipPolyPlane(poly, P, n) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[(i + poly.length - 1) % poly.length], b = poly[i];
    const da = dot(sub(a, P), n), db = dot(sub(b, P), n);
    if (db >= 0) {
      if (da < 0) out.push(add(a, mul(sub(b, a), da / (da - db))));
      out.push(b);
    } else if (da >= 0) out.push(add(a, mul(sub(b, a), da / (da - db))));
  }
  return out;
}

// Posed and clipped word quad at `frame` (rest geometry when the word has no motion).
export function wordPolygonAt(w, frame, byId) {
  const I = globalThis.KT_INTERP;
  const X = (w.motion && w.motion.length) ? I.wordXform(w, frame) : (p => p);
  let poly = restCorners(w).map(X);
  for (const c of I.wordClips(w, frame, byId)) poly = clipPolyPlane(poly, c.P, c.n);
  return poly;
}
export function wordFullPolygonAt(w, frame) {
  const I = globalThis.KT_INTERP;
  const X = (w.motion && w.motion.length) ? I.wordXform(w, frame) : (p => p);
  return restCorners(w).map(X);
}

export function polyArea3(poly) {
  if (poly.length < 3) return 0;
  let s = [0, 0, 0];
  for (let i = 1; i + 1 < poly.length; i++) {
    const a = sub(poly[i], poly[0]), b = sub(poly[i + 1], poly[0]);
    s = add(s, [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
  }
  return Math.hypot(...s) / 2;
}

// Screen projection: returns NDC points (null if any point is behind the camera) and bbox.
export function projectPoly(poly, pose, vfov = 40) {
  const I = globalThis.KT_INTERP;
  const q = poly.map(p => I.project(p, pose, vfov));
  if (!q.length || q.some(x => !x)) return null;
  const xs = q.map(p => p.x), ys = q.map(p => p.y);
  return { pts: q, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

export const isVisible = (v, f) => (f >= v.on && (v.off == null || f < v.off)) || (v.reveal_on != null && f >= v.reveal_on);
