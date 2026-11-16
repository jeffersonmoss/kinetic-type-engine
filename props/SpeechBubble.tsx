// SpeechBubble: a comic speech bubble drawn as ONE closed path (a rounded body with a curved tail), one fill and one
// stroke, so the outline runs unbroken round body and tail with no seam, patch or second shape. Made for "Right Chip,
// Wrong Huang" (Fable direction, pancake scene, 16 November 2026, items 22 to 25).
//
// Unlike the other props it is placed by its body box in world px (x, y, w, h), not by an anchor and a size, because
// the words it carries are laid out on that box. `grow` scales the whole bubble about the tail tip (the speaker), so
// a bubble can grow out of whoever is talking.
//
// TWIN: the film keeps a copy of this geometry in its own kit (Right Chip Wrong Huang Music Video,
// video/src/components/kit/graphics/Tokens.tsx, `speechBubbleD` and `speechBubbleOutline`), because that film does not
// import the engine. Change both together.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropGraphicOpts, f1, propColours, propGraphic, type PropColours} from './common';

export type BubbleSide = 'top' | 'right' | 'bottom' | 'left';
export interface SpeechBubbleGeometry {
  /** Body box, world px. */
  x: number; y: number; w: number; h: number;
  /** Corner radius of the body (default 32). */
  radius?: number;
  /** Where the tail ends (world px): point it at the speaker, stopping short of it. */
  tailTip: Pt;
  /** The side the tail leaves from and the two positions along it where its base starts and ends (world px: y for
   *  left and right, x for top and bottom). Keep both at least `radius` from the corners. */
  tailBase: {side: BubbleSide; from: number; to: number};
  /** Offset added to the midpoint of each tail edge to make its quadratic control point: how the edges bow (default
   *  {x: 0, y: 12}, a gentle downward bow). */
  tailBow?: Pt;
  /** 0 to 1: the bubble scaled about the tail tip (default 1). */
  grow?: number;
}
export interface SpeechBubbleProps extends SpeechBubbleGeometry {
  opacity?: number;
  /** Fill (default the paper role) and stroke (default the accent2 role), stroke width in world px (default 6). */
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  colours?: Partial<PropColours>;
}

const mid = (a: Pt, b: Pt): Pt => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
/** The tail's two base points in path order (clockwise round the body) and its two control points. */
const tailPoints = (g: SpeechBubbleGeometry) => {
  const {x, y, w, h} = g, b = g.tailBase, bow = g.tailBow ?? {x: 0, y: 12};
  // clockwise travel: top left to right, right top to bottom, bottom right to left, left bottom to top
  const along = (v: number): Pt => (b.side === 'top' ? {x: v, y} : b.side === 'right' ? {x: x + w, y: v} : b.side === 'bottom' ? {x: v, y: y + h} : {x, y: v});
  const increasing = b.side === 'top' || b.side === 'right';
  const [first, second] = increasing ? [Math.min(b.from, b.to), Math.max(b.from, b.to)] : [Math.max(b.from, b.to), Math.min(b.from, b.to)];
  const p0 = along(first), p1 = along(second), m0 = mid(p0, g.tailTip), m1 = mid(g.tailTip, p1);
  return {p0, p1, c0: {x: m0.x + bow.x, y: m0.y + bow.y}, c1: {x: m1.x + bow.x, y: m1.y + bow.y}};
};

/** The bubble's outline as one closed path at full size (world px): from the top left corner clockwise along the top,
 *  right side and bottom, round the tail where its side is reached, back to the top left corner. */
export const speechBubbleD = (g: SpeechBubbleGeometry) => {
  const {x, y, w, h} = g, r = Math.min(g.radius ?? 32, w / 2, h / 2);
  const T = tailPoints(g), side = g.tailBase.side, tip = g.tailTip;
  const tail = `L${f1(T.p0.x)} ${f1(T.p0.y)}Q${f1(T.c0.x)} ${f1(T.c0.y)} ${f1(tip.x)} ${f1(tip.y)}Q${f1(T.c1.x)} ${f1(T.c1.y)} ${f1(T.p1.x)} ${f1(T.p1.y)}`;
  const arc = (ex: number, ey: number) => `A${f1(r)} ${f1(r)} 0 0 1 ${f1(ex)} ${f1(ey)}`;
  return `M${f1(x + r)} ${f1(y)}` + (side === 'top' ? tail : '') + `L${f1(x + w - r)} ${f1(y)}` + arc(x + w, y + r)
    + (side === 'right' ? tail : '') + `L${f1(x + w)} ${f1(y + h - r)}` + arc(x + w - r, y + h)
    + (side === 'bottom' ? tail : '') + `L${f1(x + r)} ${f1(y + h)}` + arc(x, y + h - r)
    + (side === 'left' ? tail : '') + `L${f1(x)} ${f1(y + r)}` + arc(x + r, y) + 'Z';
};

const scaleAbout = (p: Pt, c: Pt, k: number): Pt => ({x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k});
const quadAt = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({x: (1 - t) ** 2 * a.x + 2 * t * (1 - t) * c.x + t * t * b.x, y: (1 - t) ** 2 * a.y + 2 * t * (1 - t) * c.y + t * t * b.y});
/** The full outline (body and tail, world px, scaled by `grow` about the tip) as a polygon, for keepClear and boxes.
 *  It is concave where the tail meets the body; a validator that tests convex polygons sees its hull. */
export const speechBubbleOutline = (g: SpeechBubbleGeometry, pad = 0): Pt[] => {
  const {x, y, w, h} = g, r = Math.min(g.radius ?? 32, w / 2, h / 2), T = tailPoints(g), side = g.tailBase.side;
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => { for (let k = 0; k <= 4; k++) { const a = ((a0 + (90 * k) / 4) * Math.PI) / 180; out.push({x: cx + (r + pad) * Math.cos(a), y: cy + (r + pad) * Math.sin(a)}); } };
  const tail = () => { out.push(T.p0); for (let k = 1; k <= 6; k++) out.push(quadAt(T.p0, T.c0, g.tailTip, k / 6)); for (let k = 1; k <= 6; k++) out.push(quadAt(g.tailTip, T.c1, T.p1, k / 6)); };
  corner(x + r, y + r, 180); if (side === 'top') tail();
  corner(x + w - r, y + r, 270); if (side === 'right') tail();
  corner(x + w - r, y + h - r, 0); if (side === 'bottom') tail();
  corner(x + r, y + h - r, 90); if (side === 'left') tail();
  const k = g.grow ?? 1;
  return out.map((p) => scaleAbout(p, g.tailTip, k));
};
/** The body box (world px, scaled by `grow` about the tip) as a quad TL, TR, BR, BL: where the words go. */
export const speechBubbleBodyQuad = (g: SpeechBubbleGeometry): Pt[] => {
  const k = g.grow ?? 1;
  return [{x: g.x, y: g.y}, {x: g.x + g.w, y: g.y}, {x: g.x + g.w, y: g.y + g.h}, {x: g.x, y: g.y + g.h}].map((p) => scaleAbout(p, g.tailTip, k));
};

/** One closed path, one fill, one stroke, round joins and caps. */
export const SpeechBubble: React.FC<SpeechBubbleProps> = (p) => {
  const C = propColours(p.colours);
  const k = p.grow ?? 1;
  if (k <= 0) return null;
  const tip = p.tailTip;
  return (
    <g opacity={p.opacity ?? 1} transform={k === 1 ? undefined : `translate(${f1(tip.x)} ${f1(tip.y)}) scale(${k}) translate(${f1(-tip.x)} ${f1(-tip.y)})`}>
      <path d={speechBubbleD(p)} fill={p.fill ?? C.paper} stroke={p.stroke ?? C.accent2} strokeWidth={p.strokeWidth ?? 6} strokeLinejoin="round" strokeLinecap="round" />
    </g>
  );
};
export const speechBubbleQuad = (p: SpeechBubbleProps): Pt[] => speechBubbleOutline(p, (p.strokeWidth ?? 6) / 2);
export const speechBubbleGraphic = (o: PropGraphicOpts<SpeechBubbleProps>): DecorGraphic => propGraphic(o, SpeechBubble, speechBubbleQuad);
