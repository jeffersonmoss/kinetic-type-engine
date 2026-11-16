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
/** Mixes two #rrggbb colours (k = 0: a, 1: b). */
export const mixHex = (a: string, b: string, k: number) => {
  const h = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const x = h(a), y = h(b);
  if (x.some(Number.isNaN) || y.some(Number.isNaN)) return a;
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * clamp(k)).toString(16).padStart(2, '0')).join('');
};
