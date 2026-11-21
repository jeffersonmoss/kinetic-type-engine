// Small drawing helpers shared by the props added for Paper Trail (18 November 2026): outline widths that stay in
// proportion on small props, the "never real" dash in world px, stable clip-path ids, path lengths for draw-on, and a
// mono text element squeezed to an exact width so prop labels never overflow with a fallback face.
// Nothing here reads the palette or the clock; every function is pure.
import React from 'react';
import type {Pt} from '../engine';
import {HERO_OUTLINE, NEVER_REAL_DASH, OUTLINE, type Placement, monoFont} from './common';

/** Outline width in design units: 6 world px (10 for hero props), but no more than `frac` of the prop's drawn size
 *  (natural dimension times scale) and never under 2 world px, so a prop drawn small does not turn into an outline
 *  blob (the Sweet Distillation tiny-Bot fault, Fable props gate loop 1 fix 4). */
export const outlineFor = (q: Placement, natural: number, frac = 0.017): number => {
  const s = q.scale ?? 1;
  const world = Math.max(2, Math.min(q.hero ? HERO_OUTLINE : OUTLINE, frac * natural * s));
  return world / s;
};
/** A world-px width in design units. */
export const worldPx = (q: Placement, px: number) => px / (q.scale ?? 1);
/** The "never real" dash (14 on, 10 off world px) in design units. */
export const neverRealDash = (q: Placement): string => {
  const [on, off] = NEVER_REAL_DASH.split(' ').map(Number);
  return `${(on / (q.scale ?? 1)).toFixed(2)} ${(off / (q.scale ?? 1)).toFixed(2)}`;
};
/** A clip-path id that is stable for a prop instance (from its placement), so two props of one kind on a board get
 *  different ids frame after frame without hooks. */
export const clipKey = (prefix: string, p: {x: number; y: number; size?: number; angle?: number}, extra = ''): string =>
  `${prefix}-${[p.x, p.y, p.size ?? 0, p.angle ?? 0].map((v) => Math.round(v * 10)).join('_')}${extra ? `-${extra}` : ''}`.replace(/[^A-Za-z0-9_-]/g, 'm');
/** Length of a polyline (closed adds the last segment back to the start). */
export const polyLength = (pts: Pt[], closed = true): number => {
  let L = 0;
  for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
  if (closed && pts.length > 1) L += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  return L;
};
/** Points of a quadratic Bezier (a, control c, b), n segments. */
export const quadPts = (a: Pt, c: Pt, b: Pt, n = 16): Pt[] =>
  Array.from({length: n + 1}, (_, k) => {
    const u = k / n, v = 1 - u;
    return {x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y};
  });
/** Points of a circular arc (centre c, radius r) from a0 to a1 degrees. */
export const arcPts = (c: Pt, r: number, a0: number, a1: number, n = 16): Pt[] =>
  Array.from({length: n + 1}, (_, k) => {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    return {x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a)};
  });

/** Mono prop text set at `size` design units and squeezed or stretched to exactly `width` (Space Mono's 0.612 em
 *  advance gives the natural width; a fallback face then cannot overflow its plate). `anchor` is where x sits. */
export const MonoText: React.FC<{x: number; y: number; text: string; size: number; fill: string; width?: number; anchor?: 'start' | 'middle' | 'end'; font?: string; opacity?: number}> = ({x, y, text, size, fill, width, anchor = 'start', font, opacity}) => {
  const f = monoFont(font);
  const w = width ?? text.length * 0.612 * size;
  return React.createElement('text', {
    x, y, fill, opacity, fontFamily: f.family, fontWeight: f.weight, fontSize: size, textAnchor: anchor,
    textLength: w.toFixed(2), lengthAdjust: 'spacingAndGlyphs',
  }, text);
};
