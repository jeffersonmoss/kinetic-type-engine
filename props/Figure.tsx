// Figure: a stroke body with a head dot, child or adult, posed stand, lean (walking), lie (on its side along the ground)
// or sit. A pose change is one 14-frame movement with every joint angle interpolated (eased in and out), never a snap.
// The figure faces right (+x); `flip` faces it left. Ported from the DOGEfather kit (K12).
import React from 'react';
import {FPS, clamp, easeInOutSine, lerp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, place, propColours, propGraphic, propQuad, propTransform} from './common';

export type FigureKind = 'child' | 'adult';
export type FigurePose = 'stand' | 'lean' | 'lie' | 'sit';
/** Natural standing heights in design units: an adult 150, a child 58 percent of that. */
export const FIGURE_HEIGHT = {child: 87, adult: 150};
/** Frames of one pose change. */
export const FIGURE_CHANGE_FRAMES = 14;

export interface FigureChange {
  /** Song seconds the change starts. */
  at: number;
  to: FigurePose;
}
export interface FigureProps extends PropBase {
  /** `size` is the standing height in world px (default 150 adult, 87 child). */
  kind?: FigureKind;
  /** Pose before any change (default 'stand'). */
  pose?: FigurePose;
  /** Colour (default the paper role). */
  tone?: string;
  /** Stroke width in design units (default 10 adult, 8 child); it scales with the figure. */
  stroke?: number;
  /** Song seconds (needed only with `changes`). */
  t?: number;
  changes?: FigureChange[];
  /** Walking leg-swing phase, radians; applies to the lean pose (omit for the static lean). */
  stride?: number;
  /** Face left instead of right. */
  flip?: boolean;
}

/** Which two poses the figure is between at time t, and how far (eased 0..1). Pure. */
export const figurePoseAt = (pose: FigurePose, changes: FigureChange[] | undefined, t: number | undefined): {from: FigurePose; to: FigurePose; p: number} => {
  let cur = pose;
  if (!changes || !changes.length || t === undefined) return {from: cur, to: cur, p: 1};
  const sorted = [...changes].sort((a, b) => a.at - b.at);
  for (const c of sorted) {
    if (t < c.at) break;
    const u = ((t - c.at) * FPS) / FIGURE_CHANGE_FRAMES;
    if (u < 1) return {from: cur, to: c.to, p: easeInOutSine(u)};
    cur = c.to;
  }
  return {from: cur, to: cur, p: 1};
};

// Skeleton, in units of the figure's height H. Absolute joint angles in degrees: 0 points straight down, 180 straight
// up, positive turns toward +x (the way the figure faces).
interface Build {thigh: number; shin: number; torso: number; neck: number; head: number; upper: number; fore: number}
const BUILD: Record<FigureKind, Build> = {
  adult: {thigh: 0.22, shin: 0.21, torso: 0.31, neck: 0.05, head: 0.09, upper: 0.15, fore: 0.14},
  // a child: shorter legs and a much larger head for its height
  child: {thigh: 0.17, shin: 0.16, torso: 0.28, neck: 0.04, head: 0.155, upper: 0.13, fore: 0.12},
};
interface Angles {torso: number; th1: number; sh1: number; th2: number; sh2: number; ua1: number; fa1: number; ua2: number; fa2: number}
type Ground = 'feet' | 'lowest';
const POSES: Record<FigurePose, Angles & {ground: Ground}> = {
  stand: {torso: 180, th1: 6, sh1: 6, th2: -6, sh2: -6, ua1: 12, fa1: 8, ua2: -12, fa2: -8, ground: 'feet'},
  lean: {torso: 170, th1: 22, sh1: 14, th2: -16, sh2: -30, ua1: 28, fa1: 52, ua2: -22, fa2: -10, ground: 'feet'},
  lie: {torso: 92, th1: -88, sh1: -92, th2: -95, sh2: -102, ua1: 78, fa1: 100, ua2: -72, fa2: -86, ground: 'lowest'},
  sit: {torso: 180, th1: 88, sh1: 2, th2: 92, sh2: -2, ua1: 14, fa1: 78, ua2: 8, fa2: 70, ground: 'feet'},
};
const strideAngles = (s: number): Angles => {
  const leg = (ph: number) => {
    const th = 3 + 20 * Math.sin(ph);
    return {th, sh: th - 6 - 18 * Math.max(0, Math.cos(ph))};
  };
  const a = leg(s), b = leg(s + Math.PI);
  return {torso: 170, th1: a.th, sh1: a.sh, th2: b.th, sh2: b.sh, ua1: 4 - 24 * Math.sin(s), fa1: 30 - 20 * Math.sin(s), ua2: 4 + 24 * Math.sin(s), fa2: 30 + 20 * Math.sin(s)};
};
const anglesOf = (pose: FigurePose, stride?: number): Angles => (pose === 'lean' && stride !== undefined ? strideAngles(stride) : POSES[pose]);
const dir = (deg: number): Pt => ({x: Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180)});

interface Skeleton {pelvis: Pt; neck: Pt; head: Pt; knee1: Pt; foot1: Pt; knee2: Pt; foot2: Pt; elbow1: Pt; hand1: Pt; elbow2: Pt; hand2: Pt; headR: number}
const fk = (a: Angles, b: Build, H: number): Skeleton => {
  const at = (o: Pt, deg: number, len: number): Pt => { const d = dir(deg); return {x: o.x + d.x * len * H, y: o.y + d.y * len * H}; };
  const pelvis = {x: 0, y: 0};
  const neck = at(pelvis, a.torso, b.torso);
  const head = at(neck, a.torso, b.neck + b.head);
  const knee1 = at(pelvis, a.th1, b.thigh), foot1 = at(knee1, a.sh1, b.shin);
  const knee2 = at(pelvis, a.th2, b.thigh), foot2 = at(knee2, a.sh2, b.shin);
  const elbow1 = at(neck, a.ua1, b.upper), hand1 = at(elbow1, a.fa1, b.fore);
  const elbow2 = at(neck, a.ua2, b.upper), hand2 = at(elbow2, a.fa2, b.fore);
  return {pelvis, neck, head, knee1, foot1, knee2, foot2, elbow1, hand1, elbow2, hand2, headR: b.head * H};
};
/** Offset that puts a skeleton on the ground line at the anchor, by a pose's ground rule. */
const groundOffset = (s: Skeleton, rule: Ground, sw: number): Pt => {
  if (rule === 'feet') return {x: -(s.foot1.x + s.foot2.x) / 2, y: -Math.max(s.foot1.y, s.foot2.y) - sw / 2};
  const pts = [s.pelvis, s.neck, s.knee1, s.foot1, s.knee2, s.foot2, s.elbow1, s.hand1, s.elbow2, s.hand2];
  const low = Math.max(...pts.map((q) => q.y + sw / 2), s.head.y + s.headR);
  return {x: 0, y: -low};
};
const blendAngles = (a: Angles, b: Angles, p: number): Angles => {
  const o = {} as Angles;
  (Object.keys(a) as (keyof Angles)[]).forEach((k) => { o[k] = lerp(a[k], b[k], p); });
  return o;
};
const figurePlace = (p: FigureProps) => place(p, FIGURE_HEIGHT[p.kind ?? 'adult']);

/** A Figure. Anchor: the point between the feet on the ground line (for 'lie', the hip's x on the ground line).
 *  `size`: standing height in world px (natural 87 child, 150 adult). Poses: 'stand', 'lean' (walking lean, one leg
 *  forward; `stride` animates the legs and arms), 'lie' (on its side along the ground, head toward the facing side),
 *  'sit' (seated, thighs level, shins down). One path for the body and one dot for the head. */
export const Figure: React.FC<FigureProps> = (p) => {
  const kind = p.kind ?? 'adult';
  const H = FIGURE_HEIGHT[kind];
  const b = BUILD[kind];
  const sw = p.stroke ?? (kind === 'adult' ? 10 : 8);
  const st = figurePoseAt(p.pose ?? 'stand', p.changes, p.t);
  const A = anglesOf(st.from, p.stride), B = anglesOf(st.to, p.stride);
  const sk = fk(blendAngles(A, B, st.p), b, H);
  const o1 = groundOffset(sk, POSES[st.from].ground, sw), o2 = groundOffset(sk, POSES[st.to].ground, sw);
  const off = {x: lerp(o1.x, o2.x, st.p), y: lerp(o1.y, o2.y, st.p)};
  const q = (v: Pt) => `${(v.x + off.x).toFixed(2)} ${(v.y + off.y).toFixed(2)}`;
  const d =
    `M${q(sk.foot1)}L${q(sk.knee1)}L${q(sk.pelvis)}L${q(sk.knee2)}L${q(sk.foot2)}` +
    `M${q(sk.pelvis)}L${q(sk.neck)}` +
    `M${q(sk.hand1)}L${q(sk.elbow1)}L${q(sk.neck)}L${q(sk.elbow2)}L${q(sk.hand2)}`;
  const tone = p.tone ?? propColours(p.colours).paper;
  return (
    <g transform={propTransform(figurePlace(p))} opacity={p.opacity ?? 1}>
      <g transform={p.flip ? 'scale(-1 1)' : undefined}>
        <path d={d} fill="none" stroke={tone} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={(sk.head.x + off.x).toFixed(2)} cy={(sk.head.y + off.y).toFixed(2)} r={sk.headR.toFixed(2)} fill={tone} />
      </g>
    </g>
  );
};
/** World quad around the figure for its current pose blend (standing: about 0.6 H wide by H tall). */
export const figureQuad = (p: FigureProps): Pt[] => {
  const H = FIGURE_HEIGHT[p.kind ?? 'adult'];
  const st = figurePoseAt(p.pose ?? 'stand', p.changes, p.t);
  const lying = lerp(st.from === 'lie' ? 1 : 0, st.to === 'lie' ? 1 : 0, st.p);
  const w = lerp(0.6 * H, 1.15 * H, clamp(lying)), h = lerp(H, 0.3 * H, clamp(lying));
  return propQuad(figurePlace(p), {x: -w / 2, y: -h, w, h});
};
/** A Figure as a board graphic. Pass `t` in the props function if the figure has pose changes. */
export const figureGraphic = (o: PropGraphicOpts<FigureProps>): DecorGraphic => propGraphic(o, Figure, figureQuad);
