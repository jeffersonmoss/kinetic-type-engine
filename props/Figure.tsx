// Figure: a person, drawn as a stroke body with a head dot (look 'stroke', the default) or as a filled restroom-sign
// pictogram (look 'pictogram', item 73 of KIT.md), child or adult, posed stand, lean (walking), lie (on its side along the ground)
// or sit. A pose change is one 14-frame movement with every joint angle interpolated (eased in and out), never a snap.
// The figure faces right (+x); `flip` faces it left. Ported from the DOGEfather kit (K12).
import React from 'react';
import {FIGURE_LOOK, FPS, clamp, easeInOutSine, lerp} from '../engine';
import type {DecorGraphic, FigureLook, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, place, propColours, propGraphic, propPoint, propQuad, propTransform} from './common';
import {roleColours} from './roles';

export type FigureKind = 'child' | 'adult';
/** 'armUp' (Sweet Distillation K5): standing with arm 1 (on the side it faces) straight overhead; figureHand() gives
 *  that hand's world point so a megaphone, book or glass can sit in it. */
/** 'megaphone' (Sweet Distillation, Fable gate fix 5): standing with arm 1 bent, the upper arm down and forward and the
 *  forearm up, so the hand is in front of the face just below mouth height; figureMegaphone() seats a Megaphone's grip in
 *  it with the mouthpiece at the head. */
/** 'reach' (Paper Trail K5, 18 November 2026): standing with the torso leaning 15 degrees forward and arm 1 straight
 *  forward at shoulder height (a torch held out, a hand reaching behind a TV); figureHand() gives that hand. */
export type FigurePose = 'stand' | 'lean' | 'lie' | 'sit' | 'armUp' | 'megaphone' | 'reach';
export type {FigureLook};
/** The pictogram look's two body types: the man (trousers) and the woman (A-line dress). */
export type FigureVariant = 'man' | 'woman';
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
  /** 'stroke' (the stick body) or 'pictogram' (the filled restroom-sign figure). Default: the engine's `figureLook`
   *  (configureEngine), which defaults to 'stroke'. */
  look?: FigureLook;
  /** Pictogram only: 'man' or 'woman'. Default: chosen from the anchor position (see figureVariantAt). `stroke` is
   *  ignored by the pictogram look, whose limb thickness is proportional to the figure's height. */
  variant?: FigureVariant;
  /** K5: an armful of books under arm 2 (the arm on the side away from the way it faces), in any pose and either
   *  look: `true` for three books, or a count of 3 or 4 and the cover colours (default the accent2, highlight, accent
   *  and muted roles; page edges in paper). */
  carry?: boolean | {count?: 3 | 4; colours?: string[]};
}

/** The pictogram variant a figure gets when `variant` is not given: man or woman from a hash of its anchor position
 *  (rounded to whole px), so a crowd is mixed and each figure stays the same from frame to frame while it stands
 *  still. A figure that walks across the board changes anchor every frame: pass `variant` for it. Pure. */
export const figureVariantAt = (x: number, y: number): FigureVariant => {
  let h = Math.imul(Math.round(x) | 0, 0x9e3779b1) ^ Math.imul(Math.round(y) | 0, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) % 2 === 0 ? 'man' : 'woman';
};

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
  // K5: the stand with arm 1 straight up (180 is straight up), arm 2 as in the stand
  armUp: {torso: 180, th1: 6, sh1: 6, th2: -6, sh2: -6, ua1: 180, fa1: 180, ua2: -12, fa2: -8, ground: 'feet'},
  // the bent-arm megaphone hold: upper arm 20 degrees forward of straight down, forearm 150 (forward and up)
  megaphone: {torso: 180, th1: 6, sh1: 6, th2: -6, sh2: -6, ua1: 20, fa1: 150, ua2: -12, fa2: -8, ground: 'feet'},
  // Paper Trail K5: the torso 15 degrees forward of upright (165), arm 1 straight out forward (90 is horizontal, toward
  // the way it faces) from the shoulder, so at shoulder height; arm 2 hangs near plumb; the back leg a little behind
  reach: {torso: 165, th1: 8, sh1: 8, th2: -10, sh2: -10, ua1: 90, fa1: 90, ua2: -4, fa2: -2, ground: 'feet'},
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
const lookOf = (p: FigureProps): FigureLook => p.look ?? FIGURE_LOOK;

// ------------------------------------------------------------------ the pictogram look
// Solid shapes after the standard US restroom sign: a round head with a gap under it, a solid torso with shoulders,
// arms as rounded limbs hanging clear of the torso, two legs with a gap between; the woman wears an A-line dress from
// a waist to about knee height. Every shape is built from the same skeleton joints as the stroke look (same angles,
// same 14-frame blend), so the poses and their changes work unchanged. Sizes are fractions of the figure's height H.
interface PictoSpec {head: number; gap: number; arm: number; leg: number; legGap: number; shWoman: number; waistWoman: number; flare: number; corner: number}
const PICTO: Record<FigureKind, PictoSpec> = {
  adult: {head: 0.085, gap: 0.035, arm: 0.062, leg: 0.078, legGap: 0.024, shWoman: 0.15, waistWoman: 0.11, flare: 0.15, corner: 0.05},
  // a child: the same shapes, a proportionally larger head, slightly sturdier limbs
  child: {head: 0.14, gap: 0.03, arm: 0.075, leg: 0.09, legGap: 0.026, shWoman: 0.18, waistWoman: 0.13, flare: 0.18, corner: 0.06},
};
/** Where the dress waist sits up the torso (fraction of its length) and its hem down the thigh (of the thigh). */
const WAIST_AT = 0.45, HEM_AT = 0.95;
interface PictoPoly {pts: Pt[]; sw: number}
interface PictoLimb {pts: Pt[]; w: number}
interface PictoGeo {head: Pt; headR: number; polys: PictoPoly[]; limbs: PictoLimb[]}
/** The pictogram shapes for the joint angles `a`, before the ground offset. Limbs 0 and 1 are the legs, 2 and 3 the arms. */
const pictoGeo = (a: Angles, kind: FigureKind, variant: FigureVariant, H: number): PictoGeo => {
  const s = PICTO[kind], b = BUILD[kind];
  const sk = fk(a, {...b, neck: s.gap, head: s.head}, H);
  const aw = s.arm * H, lw = s.leg * H, c = s.corner * H;
  const lo = (s.legGap * H + lw) / 2; // a leg's root sits this far from the pelvis, sideways
  const hip = 2 * lo + lw;
  const sh = variant === 'man' ? hip : s.shWoman * H;
  const armGap = (variant === 'man' ? 0.02 : 0.035) * H;
  const d = dir(a.torso), pn = {x: -d.y, y: d.x}; // up the torso, and the sideways normal (toward +x when upright)
  const T = b.torso * H;
  const tf = (t: number, side: number): Pt => ({x: d.x * t + pn.x * side, y: d.y * t + pn.y * side});
  const polys: PictoPoly[] = [];
  if (variant === 'man') {
    polys.push({sw: c, pts: [tf(T - c / 2, sh / 2 - c / 2), tf(T - c / 2, -(sh / 2 - c / 2)), tf(c / 2, -(hip / 2 - c / 2)), tf(c / 2, hip / 2 - c / 2)]});
  } else {
    const ww = s.waistWoman * H, wt = T * WAIST_AT, L = b.thigh * H * HEM_AT, f = s.flare * H;
    polys.push({sw: c, pts: [tf(T - c / 2, sh / 2 - c / 2), tf(T - c / 2, -(sh / 2 - c / 2)), tf(wt, -(ww / 2 - c / 2)), tf(wt, ww / 2 - c / 2)]});
    const t1 = dir(a.th1), t2 = dir(a.th2), n1 = dir(a.th1 + 90), n2 = dir(a.th2 + 90);
    const hem1 = {x: t1.x * L + n1.x * f, y: t1.y * L + n1.y * f}, hem2 = {x: t2.x * L - n2.x * f, y: t2.y * L - n2.y * f};
    polys.push({sw: c * 0.4, pts: [tf(wt, ww / 2), hem1, hem2, tf(wt, -ww / 2)]});
    // Paper Trail Fable gate loop 1, item 50: leaning 15 degrees (reach), the narrow waist made the torso read as a
    // separate wedge standing on the skirt's point. A bridge fills the front of the waist, from the torso's front edge
    // half way up to the skirt's front edge a third of the way down, so bodice and skirt read as one dress. It grows in
    // over leans of 10 to 15 degrees only (stand, lean, walk, sit and lie are drawn exactly as before).
    const lean = 180 - a.torso, dl = Math.abs(lean);
    const lam = clamp((dl - 10) / 5, 0, 1) * clamp((40 - dl) / 10, 0, 1);
    if (lam > 0) {
      const sg = Math.sign(lean) || 1, FT = 0.55, FS = 0.35;
      const w = tf(wt, sg * ww / 2);
      const top = tf(wt + FT * (T - c / 2 - wt), sg * (ww / 2 + (sh / 2 - ww / 2) * FT - 0.2 * c));
      const hem = sg > 0 ? hem1 : hem2;
      const bot = {x: w.x + (hem.x - w.x) * FS, y: w.y + (hem.y - w.y) * FS};
      const mix = (q: Pt) => ({x: w.x + (q.x - w.x) * lam, y: w.y + (q.y - w.y) * lam});
      polys.push({sw: c * 0.4, pts: [mix(top), mix(bot), tf(wt, 0)]});
    }
  }
  const shift = (r: Pt, from: Pt, v: Pt): Pt => ({x: r.x + v.x - from.x, y: r.y + v.y - from.y});
  const limb = (root: Pt, from: Pt, v1: Pt, v2: Pt, w: number): PictoLimb => ({pts: [root, shift(root, from, v1), shift(root, from, v2)], w});
  // Which side a limb's root sits on follows where its end is (its lateral position, eased over 0.05 H), so a walking
  // arm or leg that swings behind the body does not cross the torso: the roots swap smoothly where the two limbs meet.
  const lat = (v: Pt, from: Pt) => (v.x - from.x) * pn.x + (v.y - from.y) * pn.y;
  const sideOf = (l1: number, l2: number) => clamp((l1 - l2) / (0.05 * H), -1, 1);
  const ls = lo * sideOf(lat(sk.foot1, sk.pelvis), lat(sk.foot2, sk.pelvis));
  const r1 = tf(0, ls), r2 = tf(0, -ls);
  const as = (sh / 2 + armGap + aw / 2) * sideOf(lat(sk.hand1, sk.neck), lat(sk.hand2, sk.neck));
  const q1 = tf(T - aw / 2, as), q2 = tf(T - aw / 2, -as);
  return {
    head: sk.head, headR: sk.headR, polys,
    limbs: [
      limb(r1, sk.pelvis, sk.knee1, sk.foot1, lw), limb(r2, sk.pelvis, sk.knee2, sk.foot2, lw),
      limb(q1, sk.neck, sk.elbow1, sk.hand1, aw), limb(q2, sk.neck, sk.elbow2, sk.hand2, aw),
    ],
  };
};
const pictoOffset = (g: PictoGeo, rule: Ground): Pt => {
  if (rule === 'feet') {
    const f1 = g.limbs[0].pts[2], f2 = g.limbs[1].pts[2];
    return {x: -(f1.x + f2.x) / 2, y: -Math.max(f1.y, f2.y) - g.limbs[0].w / 2};
  }
  let low = g.head.y + g.headR;
  for (const l of g.limbs) for (const q of l.pts) low = Math.max(low, q.y + l.w / 2);
  for (const l of g.polys) for (const q of l.pts) low = Math.max(low, q.y + l.sw / 2);
  return {x: 0, y: -low};
};
/** The pictogram shapes of a figure at its current pose blend, with the ground offset and the variant resolved. */
const pictoFor = (p: FigureProps) => {
  const kind = p.kind ?? 'adult', H = FIGURE_HEIGHT[kind];
  const st = figurePoseAt(p.pose ?? 'stand', p.changes, p.t);
  const g = pictoGeo(blendAngles(anglesOf(st.from, p.stride), anglesOf(st.to, p.stride), st.p), kind, p.variant ?? figureVariantAt(p.x, p.y), H);
  const o1 = pictoOffset(g, POSES[st.from].ground), o2 = pictoOffset(g, POSES[st.to].ground);
  return {g, off: {x: lerp(o1.x, o2.x, st.p), y: lerp(o1.y, o2.y, st.p)}};
};
// ------------------------------------------------------------------ K5: books under arm 2, and the raised hand
/** One book of the armful: its cover and its page block (design space, before the ground offset), and its colour. */
interface BookShape {cover: Pt[]; pages: Pt[]; k: number}
const carryCount = (p: FigureProps) => (p.carry ? (typeof p.carry === 'object' ? p.carry.count ?? 3 : 3) : 0);
// (Fable loop 2 asks for three books; count 4 still works but stacks taller.)
/** The armful (Fable gate fix 6, 17 Nov 2026): `n` small solid books under the arm from `elbow` to `hand`, stacked
 *  along the torso and slightly askew (each turned a few degrees and nudged along its length), each book 0.062 H thick
 *  (Fable loop 2: 9 px at 150, 16 at 260). Each is a solid cover with an Ink edge (0.012 H) and a pale page-edge strip
 *  along one long side. Three by default. */
const BOOK_TURN = [-6, 5, -3, 7];
const BOOK_LEN = [0.21, 0.18, 0.2, 0.17];
const bookShapes = (elbow: Pt, hand: Pt, torsoDeg: number, H: number, n: number): BookShape[] => {
  if (!n) return [];
  const c = {x: lerp(elbow.x, hand.x, 0.55), y: lerp(elbow.y, hand.y, 0.55)};
  const T = 0.062 * H; // 9.3 px thick at the 150 px man, 16 at 260 (Fable loop 2 fix 3)
  const out: BookShape[] = [];
  for (let k = 0; k < n; k++) {
    // up the torso; across it, turned a few degrees per book; through the book's thickness
    const up = dir(torsoDeg), across = dir(torsoDeg - 90 + BOOK_TURN[k % 4]), thick = {x: -across.y, y: across.x};
    const L = BOOK_LEN[k % 4] * H;
    const v0 = (k - (n - 1) / 2) * T, nudge = (k % 2 ? -1 : 1) * 0.025 * H;
    const base = {x: c.x + up.x * v0 + across.x * nudge, y: c.y + up.y * v0 + across.y * nudge};
    const at = (u: number, w: number): Pt => ({x: base.x + across.x * u + thick.x * w, y: base.y + across.y * u + thick.y * w});
    const box = (u0: number, u1: number, w0: number, w1: number) => [at(u0, w0), at(u1, w0), at(u1, w1), at(u0, w1)];
    // pages: a thin line along the book's length, set in from the spine end
    // the page edge: a pale strip along one long side, set in from the spine end
    out.push({k, cover: box(-L / 2, L / 2, -T / 2, T / 2), pages: box(-L / 2 + 0.12 * L, L / 2 - 0.04 * L, T * 0.12, T * 0.36)});
  }
  return out;
};
const bookColours = (p: FigureProps) => {
  const C = propColours(p.colours);
  const own = typeof p.carry === 'object' ? p.carry.colours : undefined;
  return {covers: own?.length ? own : [C.accent2, C.highlight, C.accent, C.muted], pages: C.paper, edge: roleColours(p.colours).edge};
};
const BookArm: React.FC<{books: BookShape[]; p: FigureProps; off: Pt}> = ({books, p, off}) => {
  const {covers, pages, edge} = bookColours(p);
  const H = FIGURE_HEIGHT[p.kind ?? 'adult'];
  const d = (pts: Pt[], close = true) => pts.map((q, k) => `${k ? 'L' : 'M'}${(q.x + off.x).toFixed(2)} ${(q.y + off.y).toFixed(2)}`).join('') + (close ? 'Z' : '');
  // Ink edges about 1.5 world px at 150 px tall (0.01 H), the page line a little thinner
  return (
    <g>
      {books.map((b) => (
        <g key={b.k}>
          <path d={d(b.cover)} fill={covers[b.k % covers.length]} stroke={edge} strokeWidth={(0.012 * H).toFixed(2)} strokeLinejoin="round" />
          <path d={d(b.pages)} fill={pages} />
        </g>
      ))}
    </g>
  );
};
/** The arm-2 joints the books sit under (pictogram limb 3, or the stroke skeleton), the torso angle and H. */
const armTwo = (p: FigureProps) => {
  const kind = p.kind ?? 'adult', H = FIGURE_HEIGHT[kind];
  const st = figurePoseAt(p.pose ?? 'stand', p.changes, p.t);
  const a = blendAngles(anglesOf(st.from, p.stride), anglesOf(st.to, p.stride), st.p);
  return {a, H, st};
};
const strokeSkeleton = (p: FigureProps) => {
  const kind = p.kind ?? 'adult';
  const sw = p.stroke ?? (kind === 'adult' ? 10 : 8);
  const {a, H, st} = armTwo(p);
  const sk = fk(a, BUILD[kind], H);
  const o1 = groundOffset(sk, POSES[st.from].ground, sw), o2 = groundOffset(sk, POSES[st.to].ground, sw);
  return {sk, off: {x: lerp(o1.x, o2.x, st.p), y: lerp(o1.y, o2.y, st.p)}, a, H, sw};
};
/** K5: the world point of the figure's raised hand (hand 1, the one `armUp` lifts; for other poses the same hand where
 *  it is), so a megaphone, book or glass can be drawn in it. Follows pose changes, `flip`, `size` and `angle`. */
export const figureHand = (p: FigureProps): Pt => {
  let v: Pt;
  if (lookOf(p) === 'pictogram') { const {g, off} = pictoFor(p); const h = g.limbs[2].pts[2]; v = {x: h.x + off.x, y: h.y + off.y}; }
  else { const {sk, off} = strokeSkeleton(p); v = {x: sk.hand1.x + off.x, y: sk.hand1.y + off.y}; }
  return propPoint(figurePlace(p), p.flip ? {x: -v.x, y: v.y} : v);
};
/** Sweet Distillation (Fable gate fix 5): where to draw a Megaphone held by this figure, in its hand, mouthpiece at
 *  the head, bell away from the face and tilted up `tilt` degrees (default 10). Spread the result into <Megaphone>:
 *  {x, y, size, angle, flip}. `k` is the megaphone's length as a fraction of the figure's height (default 0.6; keep it
 *  0.55 to 0.65). Meant for the 'megaphone' pose; in another pose it still puts the grip in hand 1. */
export const figureMegaphone = (p: FigureProps, k = 0.6, tilt = 10): {x: number; y: number; size: number; angle: number; flip: boolean} => {
  const h = figureHand(p);
  const H = p.size ?? FIGURE_HEIGHT[p.kind ?? 'adult'];
  const turn = (p.angle ?? 0) + (p.flip ? tilt : -tilt);
  return {x: h.x, y: h.y, size: k * H, angle: turn, flip: !!p.flip};
};
/** The books of a carrying figure in design space with the ground offset applied (flip not applied). */
const carriedBooks = (p: FigureProps): Pt[][] => {
  const n = carryCount(p);
  if (!n) return [];
  if (lookOf(p) === 'pictogram') {
    const {g, off} = pictoFor(p);
    const {a, H} = armTwo(p);
    return bookShapes(g.limbs[3].pts[1], g.limbs[3].pts[2], a.torso, H, n).map((b) => b.cover.map((q) => ({x: q.x + off.x, y: q.y + off.y})));
  }
  const {sk, off, a, H} = strokeSkeleton(p);
  return bookShapes(sk.elbow2, sk.hand2, a.torso, H, n).map((b) => b.cover.map((q) => ({x: q.x + off.x, y: q.y + off.y})));
};

/** Bounding box of the pictogram shapes in design space (flip applied). */
const pictoBox = (p: FigureProps): {x: number; y: number; w: number; h: number} => {
  const {g, off} = pictoFor(p);
  let x0 = g.head.x - g.headR, x1 = g.head.x + g.headR, y0 = g.head.y - g.headR, y1 = g.head.y + g.headR;
  const add = (q: Pt, r: number) => { x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r); y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r); };
  for (const l of g.limbs) for (const q of l.pts) add(q, l.w / 2);
  for (const l of g.polys) for (const q of l.pts) add(q, l.sw / 2);
  // K5: the books (already offset; take the offset back out to share the box arithmetic)
  for (const b of carriedBooks(p)) for (const q of b) add({x: q.x - off.x, y: q.y - off.y}, 0);
  const bx0 = x0 + off.x, bx1 = x1 + off.x;
  return p.flip ? {x: -bx1, y: y0 + off.y, w: bx1 - bx0, h: y1 - y0} : {x: bx0, y: y0 + off.y, w: bx1 - bx0, h: y1 - y0};
};
const PictoFigure: React.FC<FigureProps> = (p) => {
  const {g, off} = pictoFor(p);
  // K5: books under arm 2, drawn over the body and under that arm
  const books = carryCount(p) ? bookShapes(g.limbs[3].pts[1], g.limbs[3].pts[2], armTwo(p).a.torso, armTwo(p).H, carryCount(p)) : [];
  const tone = p.tone ?? propColours(p.colours).paper;
  const f = (n: number) => n.toFixed(2);
  const path = (pts: Pt[]) => pts.map((q, k) => `${k ? 'L' : 'M'}${f(q.x)} ${f(q.y)}`).join('');
  return (
    <g transform={propTransform(figurePlace(p))} opacity={p.opacity ?? 1}>
      <g transform={p.flip ? 'scale(-1 1)' : undefined}>
        <g transform={`translate(${f(off.x)} ${f(off.y)})`}>
          {g.limbs.map((l, k) => (books.length && k === 3 ? null : <path key={k} d={path(l.pts)} fill="none" stroke={tone} strokeWidth={f(l.w)} strokeLinecap="round" strokeLinejoin="round" />))}
          {g.polys.map((l, k) => <path key={`b${k}`} d={path(l.pts) + 'Z'} fill={tone} stroke={tone} strokeWidth={f(l.sw)} strokeLinejoin="round" />)}
          <circle cx={f(g.head.x)} cy={f(g.head.y)} r={f(g.headR)} fill={tone} />
          {books.length > 0 && <BookArm books={books} p={p} off={{x: 0, y: 0}} />}
          {books.length > 0 && <path d={path(g.limbs[3].pts)} fill="none" stroke={tone} strokeWidth={f(g.limbs[3].w)} strokeLinecap="round" strokeLinejoin="round" />}
        </g>
      </g>
    </g>
  );
};

/** A Figure. Anchor: the point between the feet on the ground line (for 'lie', the hip's x on the ground line).
 *  `size`: standing height in world px (natural 87 child, 150 adult). Poses: 'stand', 'lean' (walking lean, one leg
 *  forward; `stride` animates the legs and arms), 'lie' (on its side along the ground, head toward the facing side),
 *  'sit' (seated, thighs level, shins down). One path for the body and one dot for the head. */
export const Figure: React.FC<FigureProps> = (p) => {
  if (lookOf(p) === 'pictogram') return <PictoFigure {...p} />;
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
        {carryCount(p) > 0 && <BookArm books={bookShapes(sk.elbow2, sk.hand2, blendAngles(A, B, st.p).torso, H, carryCount(p))} p={p} off={off} />}
        {carryCount(p) > 0 && <path d={`M${q(sk.neck)}L${q(sk.elbow2)}L${q(sk.hand2)}`} fill="none" stroke={tone} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
      </g>
    </g>
  );
};
/** World quad around the figure for its current pose blend (standing: about 0.6 H wide by H tall). */
export const figureQuad = (p: FigureProps): Pt[] => {
  if (lookOf(p) === 'pictogram') return propQuad(figurePlace(p), pictoBox(p));
  const H = FIGURE_HEIGHT[p.kind ?? 'adult'];
  const st = figurePoseAt(p.pose ?? 'stand', p.changes, p.t);
  const lying = lerp(st.from === 'lie' ? 1 : 0, st.to === 'lie' ? 1 : 0, st.p);
  const w = lerp(0.6 * H, 1.15 * H, clamp(lying)), h = lerp(H, 0.3 * H, clamp(lying));
  const books = carriedBooks(p);
  const raised = st.from === 'armUp' || st.to === 'armUp' || st.from === 'megaphone' || st.to === 'megaphone' || st.from === 'reach' || st.to === 'reach';
  if (books.length || raised) {
    // K5: grow the box to hold the books and the raised hand (design space, flip applied)
    const extra = books.flat();
    if (raised) { const {sk, off, sw} = strokeSkeleton(p); for (const v of [sk.elbow1, sk.hand1]) { extra.push({x: v.x + off.x, y: v.y + off.y - sw / 2}, {x: v.x + off.x, y: v.y + off.y + sw / 2}); } }
    const pts = extra.map((q) => ({x: p.flip ? -q.x : q.x, y: q.y}));
    const x0 = Math.min(-w / 2, ...pts.map((q) => q.x)), x1 = Math.max(w / 2, ...pts.map((q) => q.x));
    const y0 = Math.min(-h, ...pts.map((q) => q.y)), y1 = Math.max(0, ...pts.map((q) => q.y));
    return propQuad(figurePlace(p), {x: x0, y: y0, w: x1 - x0, h: y1 - y0});
  }
  return propQuad(figurePlace(p), {x: -w / 2, y: -h, w, h});
};
/** A Figure as a board graphic. Pass `t` in the props function if the figure has pose changes. */
export const figureGraphic = (o: PropGraphicOpts<FigureProps>): DecorGraphic => propGraphic(o, Figure, figureQuad);
