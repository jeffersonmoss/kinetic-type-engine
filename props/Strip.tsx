// Strip: receipt paper that prints mono figures character by character as the paper feeds, with pen strikes, pen
// brackets and a highlight block. Ported from the DOGEfather kit (K13, storyboard item 78).
import React from 'react';
import {FPS, clamp, easeInOutSine, lerp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {ReceiptPaper, type Serrated} from './ReceiptPaper';
import {type PropColours, type PropGraphicOpts, type Placement, MONO_EM, f1, lineD, monoFont, place, propColours, propGraphic, propPoint, propQuad, propTransform} from './common';

/** The full-lane Strip: inner width 1136 px, mono font 132, cap 93 (fits "$8,000,000,000", 8.568 em). */
export const STRIP_FULL_LANE = {width: 1136, font: 132, cap: 93};
const CAP_EM = 0.7;
/** Pen strokes and brackets default to 6 frames. */
const MARK_FRAMES = 6;
/** Feed jolt per printed character, px, and its length in frames. */
const FEED_PX = 4, FEED_FRAMES = 6;

export interface StripMark {
  /** Inclusive character indices [first, last]. */
  chars: [number, number];
  /** Song seconds the stroke starts. */
  at: number;
  /** Frames to draw it, left to right (default 6). */
  frames?: number;
}
export interface StripHighlight {
  /** Inclusive character indices the block sits behind. */
  chars: [number, number];
  /** Song seconds the block starts drawing on (left to right over 6 frames). */
  from: number;
  /** With drawBackAt: the block draws back, right to left over 6 frames, to end after this character. */
  drawBackTo?: number;
  drawBackAt?: number;
}
export interface StripProps {
  /** Top-left of the paper, world px. */
  x: number; y: number;
  /** World px of the paper's width (default its natural width, `stripSize`). */
  size?: number;
  angle?: number; opacity?: number;
  text: string;
  /** Inner (text) width, design units (default 1136). */
  width?: number;
  /** Mono font size, design units (default 132; cap 0.7 em). */
  font?: number;
  /** Font key of a configured monospaced font (default `mono`, else the default font). */
  typeface?: string;
  /** Song seconds. */
  t: number;
  /** Song seconds: characters appear left to right at an even rate, the first at printFrom, the last at printTo.
   *  Omit both for a strip that is already printed. */
  printFrom?: number; printTo?: number;
  strikes?: StripMark[];
  brackets?: StripMark[];
  highlight?: StripHighlight;
  /** Torn edges (default 'both'). */
  serrated?: Serrated;
  colours?: Partial<PropColours>;
}
const stripGeom = (p: StripProps) => {
  const font = p.font ?? STRIP_FULL_LANE.font;
  const inner = p.width ?? STRIP_FULL_LANE.width;
  const cap = CAP_EM * font, adv = MONO_EM * font;
  const padX = 0.4 * font, vpad = 0.6 * font;
  return {font, inner, cap, adv, padX, vpad, w: inner + 2 * padX, h: cap + 2 * vpad, baseline: vpad + cap};
};
/** Paper size of a strip (design units, = world px at its natural size). */
export const stripSize = (p: StripProps) => { const g = stripGeom(p); return {w: g.w, h: g.h}; };
const charTime = (p: StripProps, k: number) => {
  if (p.printFrom === undefined) return -Infinity;
  const n = [...p.text].length;
  const to = p.printTo ?? p.printFrom;
  return n > 1 ? p.printFrom + ((to - p.printFrom) * k) / (n - 1) : p.printFrom;
};
/** Paper feed offset (negative = up) at time t: each printed character lifts the paper a few px and it settles. */
const feedAt = (p: StripProps) => {
  if (p.printFrom === undefined) return 0;
  const n = [...p.text].length;
  let m = 0;
  for (let k = 0; k < n; k++) {
    const tau = (p.t - charTime(p, k)) * FPS;
    if (tau >= 0 && tau <= FEED_FRAMES) m = Math.max(m, Math.sin((Math.PI * tau) / FEED_FRAMES));
  }
  return -FEED_PX * m;
};
const base = (p: StripProps): Placement => place({x: p.x, y: p.y, size: p.size, angle: p.angle}, stripGeom(p).w);
const strikePts = (p: StripProps, m: StripMark): Pt[] => {
  const g = stripGeom(p);
  const xa = g.padX + m.chars[0] * g.adv - 0.12 * g.adv, xb = g.padX + (m.chars[1] + 1) * g.adv + 0.12 * g.adv;
  const ym = g.baseline - 0.5 * g.cap;
  return [{x: xa, y: ym + 0.05 * g.cap}, {x: xb, y: ym - 0.05 * g.cap}];
};
const bracketPts = (p: StripProps, m: StripMark): Pt[] => {
  const g = stripGeom(p);
  const xa = g.padX + m.chars[0] * g.adv + 0.05 * g.adv, xb = g.padX + (m.chars[1] + 1) * g.adv - 0.05 * g.adv;
  const y1 = g.baseline + 0.12 * g.font, y2 = g.baseline + 0.24 * g.font;
  return [{x: xa, y: y1}, {x: xa, y: y2}, {x: xb, y: y2}, {x: xb, y: y1}];
};
/** The first fraction q (by length) of a polyline, and its end point. */
const partial = (pts: Pt[], q: number): {pts: Pt[]; tip: Pt} => {
  const segs = pts.slice(1).map((b, k) => Math.hypot(b.x - pts[k].x, b.y - pts[k].y));
  let left = segs.reduce((a, b) => a + b, 0) * clamp(q);
  const out: Pt[] = [pts[0]];
  for (let k = 0; k < segs.length; k++) {
    if (left >= segs[k]) { out.push(pts[k + 1]); left -= segs[k]; continue; }
    const u = segs[k] ? left / segs[k] : 0;
    out.push({x: lerp(pts[k].x, pts[k + 1].x, u), y: lerp(pts[k].y, pts[k + 1].y, u)});
    break;
  }
  return {pts: out, tip: out[out.length - 1]};
};
const markProgress = (t: number, m: StripMark) => clamp(((t - m.at) * FPS) / (m.frames ?? MARK_FRAMES));

/** Receipt Strip. Anchor: the paper's top-left (x, y). Paper width = width + 0.8 em, height = cap + 1.2 em (1,242 x 251
 *  for the full lane). Characters are a mono face (Space Mono 700 in the first use) in the ground colour, centred in
 *  0.612 em cells from 0.4 em in; each appears (2-frame ink-in, never blinking) at its time between printFrom and
 *  printTo while the paper jolts up 4 px and settles. Strikes are accent2 (pen) strokes through a character group (it
 *  stays readable); brackets are pen brackets under it; the highlight is a highlight block behind it that draws on
 *  and can draw back. */
export const Strip: React.FC<StripProps> = (p) => {
  const g = stripGeom(p);
  const C = propColours(p.colours);
  const mono = monoFont(p.typeface);
  const chars = [...p.text];
  const feed = feedAt(p);
  // strikes and brackets are 10 world px wide at the full-lane font
  const penW = Math.max(10, 0.076 * g.font);
  let hl: React.ReactNode = null;
  if (p.highlight && p.t >= p.highlight.from) {
    const h = p.highlight;
    const x0 = g.padX + h.chars[0] * g.adv - 0.12 * g.adv;
    const xFull = g.padX + (h.chars[1] + 1) * g.adv + 0.12 * g.adv;
    let x1 = lerp(x0, xFull, easeInOutSine(((p.t - h.from) * FPS) / 6));
    if (h.drawBackAt !== undefined && h.drawBackTo !== undefined && p.t >= h.drawBackAt) {
      const xBack = g.padX + (h.drawBackTo + 1) * g.adv + 0.12 * g.adv;
      x1 = lerp(x1, xBack, easeInOutSine(((p.t - h.drawBackAt) * FPS) / 6));
    }
    if (x1 > x0) hl = <rect x={f1(x0)} y={f1(g.baseline - g.cap - 0.2 * g.font)} width={f1(x1 - x0)} height={f1(g.cap + 0.4 * g.font)} fill={C.highlight} />;
  }
  const marks = [...(p.brackets ?? []).map((m) => ({m, pts: bracketPts(p, m)})), ...(p.strikes ?? []).map((m) => ({m, pts: strikePts(p, m)}))];
  return (
    <g transform={propTransform(base(p))} opacity={p.opacity ?? 1}>
      <g transform={`translate(0 ${feed.toFixed(2)})`}>
        <ReceiptPaper x={0} y={0} w={g.w} h={g.h} serrated={p.serrated ?? 'both'} fill={C.paper} ink={C.ground} />
        {hl}
        {chars.map((c, k) => {
          const a = p.printFrom === undefined ? 1 : clamp(((p.t - charTime(p, k)) * FPS) / 2);
          if (a <= 0 || c === ' ') return null;
          return (
            <text key={k} x={f1(g.padX + (k + 0.5) * g.adv)} y={f1(g.baseline)} textAnchor="middle" fontFamily={mono.family} fontWeight={mono.weight} fontSize={g.font} fill={C.ground} opacity={a}>
              {c}
            </text>
          );
        })}
        {marks.map(({m, pts}, k) => {
          const q = markProgress(p.t, m);
          if (q <= 0) return null;
          return <path key={k} d={lineD(partial(pts, q).pts)} fill="none" stroke={C.accent2} strokeWidth={f1(penW)} strokeLinecap="round" strokeLinejoin="round" />;
        })}
      </g>
    </g>
  );
};
/** World quad of the strip's paper (without the feed jolt). */
export const stripQuad = (p: StripProps): Pt[] => { const g = stripGeom(p); return propQuad(base(p), {x: 0, y: 0, w: g.w, h: g.h}); };
/** World quad of character k's cell (cap box), including the paper's current feed offset. */
export const stripCharRect = (p: StripProps, k: number): Pt[] => {
  const g = stripGeom(p);
  return propQuad(base(p), {x: g.padX + k * g.adv, y: g.baseline - g.cap + feedAt(p), w: g.adv, h: g.cap});
};
/** World point of the moving tip of whichever strike or bracket is being drawn at t (the last one started, if
 *  several), or null when none is drawing. Place the Pen's tip there. */
export const stripPenTip = (p: StripProps, t: number): Pt | null => {
  const q = {...p, t};
  const feed = feedAt(q);
  let best: {at: number; tip: Pt} | null = null;
  const consider = (m: StripMark, pts: Pt[]) => {
    const pr = ((t - m.at) * FPS) / (m.frames ?? MARK_FRAMES);
    if (pr < 0 || pr > 1) return;
    if (best && best.at > m.at) return;
    best = {at: m.at, tip: partial(pts, pr).tip};
  };
  (p.brackets ?? []).forEach((m) => consider(m, bracketPts(p, m)));
  (p.strikes ?? []).forEach((m) => consider(m, strikePts(p, m)));
  if (!best) return null;
  const tip = (best as {at: number; tip: Pt}).tip;
  return propPoint(base(p), {x: tip.x, y: tip.y + feed});
};
/** A Strip as a board graphic. Its props function must pass the song time it is given as `t`. */
export const stripGraphic = (o: PropGraphicOpts<StripProps>): DecorGraphic => propGraphic(o, Strip, stripQuad);
