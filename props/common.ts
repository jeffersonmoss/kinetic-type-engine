// Shared conventions and drawing helpers for the prop library (ported from the DOGEfather kit's K14 props).
// Every prop is a pure React SVG component drawn in WORLD px (inside a board's camera transform, or any <g>), at a
// natural design size where 1 design unit = 1 world px at its natural size. It is placed by an anchor point (x, y) that
// each prop documents (usually bottom-centre for things that stand on a line, centre for things that float), turned by
// `angle` degrees about that anchor, and sized by `size`: the world px of one documented natural dimension (its
// `XXX_SIZE.w` unless the prop says otherwise). Working parts are plain numeric props (chain travel, needle value, lid
// angle, extension 0 to 1...): the board computes them from song time; a prop never reads the clock.
// Drawing rules: outlines 6 world px in the paper colour (10 for hero props), whatever the size; flat fills from the
// palette; no gradients, no blur, no shadows; a dashed outline (14 on, 10 off) means "never real"; a dotted leader is
// 4 px dots at a 16 px pitch. No logos, no likenesses, no real seals.
import React from 'react';
import {DEFAULT_FONT, FONT_FAMILY, FONT_STYLE, PALETTE, mixHex, rad, rot} from '../engine';
import type {DecorGraphic, Pt, TrackedElement} from '../engine';

// ------------------------------------------------------------------ placement

export interface PropBase {
  /** Anchor point in world px (each prop says where its anchor is). */
  x: number; y: number;
  /** World px of the prop's documented natural dimension (default: the natural size, so 1 design unit = 1 px). */
  size?: number;
  /** Degrees about the anchor, clockwise (default 0). */
  angle?: number;
  opacity?: number;
  /** Hero prop: 10 px outline instead of 6. */
  hero?: boolean;
  /** Colour overrides; every role defaults to the configured palette (see propColours). */
  colours?: Partial<PropColours>;
}
/** A resolved placement: anchor, uniform scale, angle (what the drawing helpers work in). */
export interface Placement {x: number; y: number; scale?: number; angle?: number; hero?: boolean}
/** Placement of a prop whose documented natural dimension is `natural` design units. */
export const place = (p: PropBase, natural: number): Placement => ({
  x: p.x, y: p.y, angle: p.angle, hero: p.hero, scale: Math.max(1e-3, (p.size ?? natural) / natural),
});

export const OUTLINE = 6;
export const HERO_OUTLINE = 10;
/** Dash pattern for "never real" (14 on, 10 off). */
export const NEVER_REAL_DASH = '14 10';
/** Dotted leader: dot diameter and pitch. */
export const LEADER_DOT = 4;
export const LEADER_PITCH = 16;
/** Advance of a monospaced character, em (Space Mono). */
export const MONO_EM = 0.612;

/** Outline width in design units, so that it is 6 (or 10) world px whatever the scale. */
export const strokeOf = (q: Placement) => (q.hero ? HERO_OUTLINE : OUTLINE) / (q.scale ?? 1);
/** SVG transform that places design space (anchor at 0, 0) at the prop's anchor, angle and scale. */
export const propTransform = (q: Placement) => `translate(${q.x} ${q.y}) rotate(${q.angle ?? 0}) scale(${q.scale ?? 1})`;
/** World point of a design-space point (relative to the anchor). */
export const propPoint = (q: Placement, v: Pt): Pt => {
  const r = rot({x: v.x * (q.scale ?? 1), y: v.y * (q.scale ?? 1)}, q.angle ?? 0);
  return {x: q.x + r.x, y: q.y + r.y};
};
/** World quad (TL, TR, BR, BL) of a design-space box: for DecorGraphic boxes, TrackedElement samples and keepClear. */
export const propQuad = (q: Placement, box: {x: number; y: number; w: number; h: number}): Pt[] =>
  [{x: box.x, y: box.y}, {x: box.x + box.w, y: box.y}, {x: box.x + box.w, y: box.y + box.h}, {x: box.x, y: box.y + box.h}].map((v) => propPoint(q, v));

// ------------------------------------------------------------------ colours

/** The colour roles props draw with. The first six are the engine's palette roles; `muted` and `wall` are derived
 *  (the engine palette has no role for them; see README). */
export interface PropColours {
  /** Darkest ink: dark screens, holes, mono type on paper (DOGEfather Carbon). Default PALETTE.ground. */
  ground: string;
  /** Prop bodies, plates, cases (DOGEfather Slate). Default PALETTE.shadow. */
  body: string;
  /** Outlines, paper, light parts (DOGEfather Thermal). Default PALETTE.paper. */
  paper: string;
  /** Money, lit lights, warning yellow (DOGEfather Highlighter). Default PALETTE.highlight. */
  highlight: string;
  /** Red parts: cuts, ties, alerts, fire (DOGEfather Kerf). Default PALETTE.accent. */
  accent: string;
  /** Blue parts: pens, links, frost (DOGEfather Ballpoint). Default PALETTE.accent2. */
  accent2: string;
  /** Grey detail lines and metal (DOGEfather Ghost). Default: ground mixed 60 percent toward paper. */
  muted: string;
  /** A second dark ground (screens, browser pages; DOGEfather Wall). Default: ground mixed 60 percent toward body. */
  wall: string;
}
/** The prop colours, read from the configured palette at call time (call it inside a component body). */
export const propColours = (o?: Partial<PropColours>): PropColours => {
  const P = PALETTE;
  return {
    ground: P.ground, body: P.shadow, paper: P.paper, highlight: P.highlight, accent: P.accent, accent2: P.accent2,
    muted: mixHex(P.ground, P.paper, 0.6), wall: mixHex(P.ground, P.shadow, 0.6),
    ...o,
  };
};
/** Linear mix of two #rrggbb colours (0 = a, 1 = b). */
export const mix = mixHex;

// ------------------------------------------------------------------ fonts

/** Family and weight for a prop's mono text: `font` if given, else a configured font named `mono`, else the default
 *  font. Geometry assumes a monospaced face with 0.612 em advances (Space Mono). */
export const monoFont = (font?: string): {family: string; weight: number} => {
  const key = font ?? (FONT_FAMILY.mono ? 'mono' : DEFAULT_FONT);
  return {family: FONT_FAMILY[key] ?? 'monospace', weight: FONT_STYLE[key]?.fontWeight ?? 700};
};

// ------------------------------------------------------------------ path helpers (design space)

export const f1 = (n: number) => n.toFixed(1);
/** Closed polygon path. */
export const polyD = (pts: Pt[]) => pts.map((v, k) => `${k ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('') + 'Z';
/** Open polyline path. */
export const lineD = (pts: Pt[]) => pts.map((v, k) => `${k ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('');
export const polar = (r: number, deg: number, c: Pt = {x: 0, y: 0}): Pt => ({x: c.x + r * Math.cos(rad(deg)), y: c.y + r * Math.sin(rad(deg))});
/** Arc path (centre c, radius r) from angle a0 to a1 degrees, clockwise on screen when a1 > a0. */
export const arcD = (c: Pt, r: number, a0: number, a1: number) => {
  const s = polar(r, a0, c), e = polar(r, a1, c);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0, sweep = a1 > a0 ? 1 : 0;
  return `M${f1(s.x)} ${f1(s.y)}A${r} ${r} 0 ${large} ${sweep} ${f1(e.x)} ${f1(e.y)}`;
};
/** Rotated rectangle (centre c, width w along angle deg, height h) as a closed path. */
export const rectAt = (c: Pt, w: number, h: number, deg: number) => polyD(rectPts(c, w, h, deg));
export const rectPts = (c: Pt, w: number, h: number, deg: number): Pt[] =>
  [{x: -w / 2, y: -h / 2}, {x: w / 2, y: -h / 2}, {x: w / 2, y: h / 2}, {x: -w / 2, y: h / 2}].map((v) => { const r = rot(v, deg); return {x: c.x + r.x, y: c.y + r.y}; });
/** A dotted leader from a to b as one path of round dots (fill it). */
export const leaderPath = (a: Pt, b: Pt, dot = LEADER_DOT, pitch = LEADER_PITCH) => {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.floor(L / pitch));
  const r = dot / 2;
  let d = '';
  for (let k = 0; k <= n; k++) {
    const u = n ? k / n : 0;
    const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
    d += `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
  return d;
};
/** Serrated (torn receipt) edge along y = y0 from x0 to x1, teeth `tooth` px wide pointing `dir` (-1 up, 1 down);
 *  returns the polyline points (left to right) for building a paper outline. */
export const serratedEdge = (x0: number, x1: number, y0: number, tooth = 12, dir: -1 | 1 = -1): Pt[] => {
  const n = Math.max(1, Math.round((x1 - x0) / tooth));
  const w = (x1 - x0) / n;
  const pts: Pt[] = [];
  for (let k = 0; k < n; k++) { pts.push({x: x0 + k * w, y: y0}); pts.push({x: x0 + (k + 0.5) * w, y: y0 + dir * tooth * 0.5}); }
  pts.push({x: x1, y: y0});
  return pts;
};
/** Rounded-rect path. */
export const rrectPath = (x: number, y: number, w: number, h: number, r: number) => {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${x + q} ${y}H${x + w - q}A${q} ${q} 0 0 1 ${x + w} ${y + q}V${y + h - q}A${q} ${q} 0 0 1 ${x + w - q} ${y + h}H${x + q}A${q} ${q} 0 0 1 ${x} ${y + h - q}V${y + q}A${q} ${q} 0 0 1 ${x + q} ${y}Z`;
};
/** Circle path. */
export const circlePath = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
/** A chat bubble body with a small tail at the bottom outer corner (both subpaths clockwise, so they union). */
export const bubbleD = (x: number, y: number, w: number, h: number, right: boolean) => {
  const body = rrectPath(x, y, w, h, 18);
  const tail = right
    ? `M${x + w - 4} ${y + h - 18}L${x + w + 10} ${y + h + 8}L${x + w - 24} ${y + h - 2}Z`
    : `M${x + 24} ${y + h - 2}L${x - 10} ${y + h + 8}L${x + 4} ${y + h - 18}Z`;
  return body + tail;
};
/** Rounded text-line bars (no real text), one per width, `pitch` apart. */
export const linesD = (x: number, y: number, widths: number[], pitch: number, h: number) =>
  widths.map((w, k) => rrectPath(x, y + k * pitch, w, h, h / 2)).join('');

/** Outline attributes in the paper colour, strokeOf wide times k. */
export const outline = (q: Placement, C: PropColours, k = 1) => ({stroke: C.paper, strokeWidth: strokeOf(q) * k, strokeLinejoin: 'round' as const});
/** A tube: a centreline drawn as a wide outline-colour stroke with a narrower fill-colour stroke on top. */
export const Tube: React.FC<{d: string; w: number; fill: string; sw: number; edge: string; cap?: 'butt' | 'round'}> = ({d, w, fill, sw, edge, cap = 'butt'}) =>
  React.createElement(React.Fragment, null,
    React.createElement('path', {d, fill: 'none', stroke: edge, strokeWidth: w + 2 * sw, strokeLinecap: cap, strokeLinejoin: 'round'}),
    React.createElement('path', {d, fill: 'none', stroke: fill, strokeWidth: w, strokeLinecap: cap, strokeLinejoin: 'round'}));

// ------------------------------------------------------------------ board glue

/** Options for a prop's DecorGraphic helper: the DecorGraphic fields except box and draw, plus the prop's props, fixed
 *  or as a function of song seconds (the same function feeds both draw and box, so they cannot drift apart). */
export interface PropGraphicOpts<P> extends Omit<DecorGraphic, 'box' | 'draw' | 'layer'> {
  /** Default 'under'. */
  layer?: DecorGraphic['layer'];
  props: P | ((t: number) => P);
}
/** Builds a DecorGraphic for a prop component and its quad function. `box` is the prop's world quad (null while its
 *  opacity is 0). */
export const propGraphic = <P extends {opacity?: number}>(o: PropGraphicOpts<P>, Comp: React.FC<P>, quad: (p: P) => Pt[] | Pt[][]): DecorGraphic => {
  const {props, layer, ...rest} = o;
  const at = (t: number): P => (typeof props === 'function' ? (props as (t: number) => P)(t) : props);
  return {
    ...rest,
    layer: layer ?? 'under',
    box: ({t}) => {
      const p = at(t);
      if ((p.opacity ?? 1) <= 0) return null;
      const b = quad(p);
      return b.length && Array.isArray(b[0]) ? (b as Pt[][]) : [b as Pt[]];
    },
    draw: (c) => React.createElement(Comp, at(c.t)),
  };
};
/** A TrackedElement for a moving prop (board.track): samples its world quad at song seconds t. `props` returns null
 *  when the prop does not exist at t. `state` names what counts as a visible state change (a screen, a pose). */
export const propTrack = <P extends {opacity?: number}>(
  id: string, props: (t: number) => P | null, quad: (p: P) => Pt[],
  opts: {from?: number; to?: number; state?: (p: P) => string | number; exempt?: TrackedElement['exempt']} = {},
): TrackedElement => ({
  id, from: opts.from, to: opts.to, exempt: opts.exempt,
  sample: (t) => {
    const p = props(t);
    if (!p) return null;
    return {opacity: p.opacity ?? 1, quad: quad(p), state: opts.state?.(p)};
  },
});
