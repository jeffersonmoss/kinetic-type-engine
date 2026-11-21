// Small pure helpers shared by the engine (no React, no Remotion runtime, safe in node).
import {FPS} from './config';
import type {Pt} from './types';

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const easeOutCubic = (p: number) => 1 - Math.pow(1 - clamp(p), 3);
export const easeInCubic = (p: number) => Math.pow(clamp(p), 3);
export const easeInQuad = (p: number) => Math.pow(clamp(p), 2);
export const easeOutQuad = (p: number) => 1 - Math.pow(1 - clamp(p), 2);
/** Gentlest standard in-out ease: peak speed is pi/2 times the average (the engine's motion-legibility ease). */
export const easeInOutSine = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(p));
export const easeInOutCubic = (p: number) => { const x = clamp(p); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
/** Piecewise-linear keyframes with optional per-segment easing; xs ascending. */
export const keys = (x: number, xs: number[], ys: number[], ease: (p: number) => number = (p) => p) => {
  if (x <= xs[0]) return ys[0];
  for (let k = 1; k < xs.length; k++) if (x <= xs[k]) return lerp(ys[k - 1], ys[k], ease((x - xs[k - 1]) / (xs[k] - xs[k - 1])));
  return ys[ys.length - 1];
};
/** Damped spring settling from 0 to 1 (pure, closed form). omega in rad/frame, zeta damping ratio. */
export const springAt = (frames: number, omega = 0.9, zeta = 0.45) => {
  if (frames <= 0) return 0;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * frames) * (Math.cos(wd * frames) + ((zeta * omega) / wd) * Math.sin(wd * frames));
};

/** Seconds to the nearest frame (the storyboard's start frame convention). */
export const sfOf = (s: number) => Math.round(s * FPS);

/** Deterministic hash-based random in [0, 1) from any number of numeric/string keys. */
export const rand = (...k: (number | string)[]) => {
  let h = 2166136261 >>> 0;
  const s = k.join('|');
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
};

export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
export const rot = (p: Pt, degrees: number): Pt => {
  const c = Math.cos(rad(degrees)), s = Math.sin(rad(degrees));
  return {x: p.x * c - p.y * s, y: p.x * s + p.y * c};
};
export const add = (a: Pt, b: Pt): Pt => ({x: a.x + b.x, y: a.y + b.y});
export const sub = (a: Pt, b: Pt): Pt => ({x: a.x - b.x, y: a.y - b.y});
export const scale = (a: Pt, k: number): Pt => ({x: a.x * k, y: a.y * k});
export const len = (a: Pt) => Math.hypot(a.x, a.y);
/** Normalises an angle to (-180, 180]. */
export const normDeg = (a: number) => { let x = ((a % 360) + 360) % 360; if (x > 180) x -= 360; return x; };

/** SVG path of many small circles (one element for a whole particle field). */
export const dotsPath = (pts: {x: number; y: number; r: number}[]) =>
  pts.filter((p) => p.r > 0.05).map((p) => `M${(p.x - p.r).toFixed(1)} ${p.y.toFixed(1)}a${p.r.toFixed(2)} ${p.r.toFixed(2)} 0 1 0 ${(2 * p.r).toFixed(2)} 0a${p.r.toFixed(2)} ${p.r.toFixed(2)} 0 1 0 ${(-2 * p.r).toFixed(2)} 0Z`).join('');
/** SVG path from a polygon. */
export const polyPath = (pts: Pt[], close = true) =>
  pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + (close ? 'Z' : '');

/** Separating-axis test for two convex polygons (used by the validator's overlap check). */
export const polysOverlap = (a: Pt[], b: Pt[], inset = 0) => {
  for (const poly of [a, b]) {
    for (let k = 0; k < poly.length; k++) {
      const p1 = poly[k], p2 = poly[(k + 1) % poly.length];
      const n = {x: p2.y - p1.y, y: p1.x - p2.x};
      const L = Math.hypot(n.x, n.y) || 1;
      const proj = (P: Pt[]) => P.map((p) => (p.x * n.x + p.y * n.y) / L);
      const pa = proj(a), pb = proj(b);
      if (Math.max(...pa) - inset <= Math.min(...pb) || Math.max(...pb) - inset <= Math.min(...pa)) return false;
    }
  }
  return true;
};
/** Mixes two #rgb or #rrggbb colours (k = 0: a, 1: b). */
export const mixHex = (a: string, b: string, k: number) => {
  if (!Number.isFinite(k)) return a;
  const h = (c: string) => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (!m) return null;
    const s = m[1].length === 3 ? m[1][0] + m[1][0] + m[1][1] + m[1][1] + m[1][2] + m[1][2] : m[1];
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  };
  const x = h(a), y = h(b);
  if (!x || !y) return a;
  const u = clamp(k);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * u).toString(16).padStart(2, '0')).join('');
};

/** Sutherland-Hodgman: `subject` clipped to the convex polygon `clip` (either winding). */
export const clipConvex = (subject: Pt[], clip: Pt[]): Pt[] => {
  if (subject.length < 3 || clip.length < 3) return [];
  const sign = polyArea(clip, true) >= 0 ? 1 : -1;
  let out = subject;
  for (let k = 0; k < clip.length && out.length; k++) {
    const a = clip[k], b = clip[(k + 1) % clip.length];
    const inside = (p: Pt) => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= 0;
    const cut = (p: Pt, q: Pt): Pt => {
      const d1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x), d2 = (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
      const u = d1 / (d1 - d2 || 1e-12);
      return {x: p.x + (q.x - p.x) * u, y: p.y + (q.y - p.y) * u};
    };
    const inp = out; out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j], q = inp[(j + 1) % inp.length];
      if (inside(q)) { if (!inside(p)) out.push(cut(p, q)); out.push(q); } else if (inside(p)) out.push(cut(p, q));
    }
  }
  return out;
};
/** Polygon area (absolute, or signed with `signed`). */
export function polyArea(q: Pt[], signed = false): number {
  let a = 0;
  for (let k = 0; k < q.length; k++) { const p = q[k], r = q[(k + 1) % q.length]; a += p.x * r.y - r.x * p.y; }
  return signed ? a / 2 : Math.abs(a / 2);
}
