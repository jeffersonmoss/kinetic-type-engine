// Chainsaw: a chainsaw with a running chain and an exhaust puff. Hero prop. Ported from the DOGEfather kit (K14,
// item 30).
import React from 'react';
import {rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, Tube, circlePath, mix, outline, place, polyD, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

// Anchor: the centre of the rear handle grip. Bar points to +x at angle 0; the body sits right of the anchor and the
// front wrap handle arches over it. Natural size about 655 x 212 (x -75..580, y -128..84 about the anchor).
const CS_BAR_Y = 35, CS_BAR_X0 = 230, CS_BAR_X1 = 536, CS_BAR_HALF = 24;
/** `size` is the 655 width. */
export const CHAINSAW_SIZE = {w: 655, h: 212};

export interface ChainsawProps extends PropBase {
  /** Px of chain travel. The cutter teeth advance this far clockwise round the bar (top run toward the nose, round it,
   *  back along the underside), so +24 per frame makes the chain visibly run. Teeth pitch is about 66 px, so any
   *  advance under 33 px per frame reads as forward motion (no wagon-wheel reversal). */
  chain?: number;
  /** One exhaust puff cycle 0..1: appears at the exhaust, grows, drifts world-up and fades; nothing at 0 or 1. */
  puff?: number;
}
/** Track radius of the chain round the bar (depends on the outline width so teeth always clear it). */
const csTrackR = (sw: number) => CS_BAR_HALF + sw / 2 + 3;
/** Point, tangent (direction of travel) and outward normal at arc length s round the bar's chain track. */
const csTrack = (s: number, R: number) => {
  const L = CS_BAR_X1 - CS_BAR_X0, P = 2 * L + 2 * Math.PI * R;
  let u = ((s % P) + P) % P;
  if (u < L) return {pt: {x: CS_BAR_X0 + u, y: CS_BAR_Y - R}, tan: {x: 1, y: 0}, nor: {x: 0, y: -1}};
  u -= L;
  if (u < Math.PI * R) {
    const a = -Math.PI / 2 + u / R;
    return {pt: {x: CS_BAR_X1 + R * Math.cos(a), y: CS_BAR_Y + R * Math.sin(a)}, tan: {x: -Math.sin(a), y: Math.cos(a)}, nor: {x: Math.cos(a), y: Math.sin(a)}};
  }
  u -= Math.PI * R;
  if (u < L) return {pt: {x: CS_BAR_X1 - u, y: CS_BAR_Y + R}, tan: {x: -1, y: 0}, nor: {x: 0, y: 1}};
  u -= L;
  const a = Math.PI / 2 + u / R;
  return {pt: {x: CS_BAR_X0 + R * Math.cos(a), y: CS_BAR_Y + R * Math.sin(a)}, tan: {x: -Math.sin(a), y: Math.cos(a)}, nor: {x: Math.cos(a), y: Math.sin(a)}};
};
/** Cutter tooth outline in (along travel t, outward n): a chisel with its cutting corner leading. */
const CS_TOOTH: [number, number][] = [[-10, 0], [-7, 9], [5, 11], [9, 7], [4, 5], [6, 0]];
const CS_GAUGE: [number, number][] = [[-20, 0], [-18, 5], [-14, 5], [-13, 0]];
const sawPlace = (p: ChainsawProps) => place(p, CHAINSAW_SIZE.w);

/** Chainsaw: body-coloured housing with an accent top cover and vents, pull-start recess, starter grille, muffler,
 *  rear handle loop with grip, trigger and lockout, a front wrap handle and chain-brake guard, and a bar with a
 *  running chain of chisel teeth. */
export const Chainsaw: React.FC<ChainsawProps> = (p) => {
  const q = sawPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const barFill = mix(C.body, C.muted, 0.45);
  const R = csTrackR(sw);
  const L = CS_BAR_X1 - CS_BAR_X0, P = 2 * L + 2 * Math.PI * R;
  const n = Math.max(8, Math.round(P / 66)), pitch = P / n;
  const chain = p.chain ?? 0;
  let teeth = '';
  for (let k = 0; k < n; k++) {
    const {pt, tan, nor} = csTrack(k * pitch + chain, R);
    const map = ([t, m]: [number, number]) => ({x: pt.x + t * tan.x + m * nor.x, y: pt.y + t * tan.y + m * nor.y});
    teeth += polyD(CS_TOOTH.map(map)) + polyD(CS_GAUGE.map(map));
  }
  const track = `M${CS_BAR_X0} ${CS_BAR_Y - R}H${CS_BAR_X1}A${R} ${R} 0 0 1 ${CS_BAR_X1} ${CS_BAR_Y + R}H${CS_BAR_X0}A${R} ${R} 0 0 1 ${CS_BAR_X0} ${CS_BAR_Y - R}Z`;
  // Exhaust puff: drift is world-up, so undo the prop's angle and scale for the drift vector.
  const pf = p.puff ?? 0;
  let puff: React.ReactNode = null;
  if (pf > 0 && pf < 1) {
    const sc = q.scale ?? 1;
    const drift = rot({x: 14 * pf / sc, y: -90 * pf / sc}, -(p.angle ?? 0));
    const c = {x: 266 + drift.x, y: -26 + drift.y};
    const r = 7 + 17 * pf;
    const op = pf < 0.15 ? pf / 0.15 : (1 - pf) / 0.85;
    puff = <path d={circlePath(c.x, c.y, r) + circlePath(c.x - r * 0.7, c.y + r * 0.35, r * 0.62) + circlePath(c.x + r * 0.65, c.y + r * 0.3, r * 0.55)} fill={C.paper} opacity={op * 0.85} />;
  }
  const body = 'M50 -22C50 -50 76 -65 106 -65L216 -65C238 -65 250 -52 250 -32L250 62C250 74 240 84 228 84L72 84C60 84 50 74 50 62Z';
  const cover = 'M50 -14L50 -22C50 -50 76 -65 106 -65L216 -65C238 -65 250 -52 250 -32L250 -14Z';
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {/* chain band, teeth, then the bar over the band's inner half */}
      <path d={track} fill="none" stroke={mix(C.ground, C.muted, 0.35)} strokeWidth={9} />
      <path d={teeth} fill={C.paper} />
      <path d={rrectPath(CS_BAR_X0 - 20, CS_BAR_Y - CS_BAR_HALF, CS_BAR_X1 + CS_BAR_HALF - CS_BAR_X0 + 20, CS_BAR_HALF * 2, CS_BAR_HALF)} fill={barFill} {...outline(q, C)} />
      <path d={`M272 ${CS_BAR_Y}H500`} stroke={mix(barFill, C.ground, 0.5)} strokeWidth={4} strokeLinecap="round" />
      <path d={circlePath(CS_BAR_X1, CS_BAR_Y, 11)} fill="none" stroke={C.paper} strokeWidth={sw * 0.4} />
      <path d={circlePath(CS_BAR_X1, CS_BAR_Y, 3) + circlePath(286, CS_BAR_Y, 4) + circlePath(306, CS_BAR_Y, 4)} fill={C.paper} />
      {/* rear handle loop with its rubber grip, throttle trigger below and lockout on top */}
      <path d={rrectPath(-72, -15, 130, 81, 16) + rrectPath(-52, 15, 94, 33, 10)} fillRule="evenodd" fill={C.body} {...outline(q, C)} />
      <path d={rrectPath(-48, -8, 88, 16, 8)} fill={C.ground} />
      <path d="M14 15C16 27 22 33 30 33L37 33C40 27 40 21 40 15Z" fill={C.ground} {...outline(q, C, 0.6)} />
      <path d="M2 -15L6 -23L30 -23L34 -15Z" fill={C.ground} {...outline(q, C, 0.6)} />
      {/* engine body: housing, accent top cover with vents, pull-start recess, starter grille, muffler */}
      <path d={body} fill={C.body} />
      <path d={cover} fill={C.accent} />
      <path d="M160 -54L152 -26M178 -54L170 -26M196 -54L188 -26" stroke={C.ground} strokeWidth={7} strokeLinecap="round" />
      <path d="M50 -14H250" stroke={C.paper} strokeWidth={sw * 0.4} />
      <path d={body} fill="none" {...outline(q, C)} />
      <path d={rrectPath(64, 0, 62, 24, 10)} fill={C.ground} />
      <path d={rrectPath(76, 7, 38, 10, 5)} fill={C.paper} />
      <path d={circlePath(98, 54, 19)} fill={C.ground} />
      <path d="M86 47H110M84 54H112M86 61H110" stroke={C.body} strokeWidth={3} />
      <path d={rrectPath(228, -52, 26, 46, 6)} fill={C.ground} {...outline(q, C, 0.5)} />
      <path d="M234 -40H248M234 -29H248M234 -18H248" stroke={C.muted} strokeWidth={3} />
      <path d="M250 64L266 71L250 76L262 82L250 84Z" fill={C.muted} />
      {/* front wrap handle (a tube up the side and over the top) and the chain-brake hand guard */}
      <Tube d="M216 86L216 -44C216 -104 138 -110 126 -62" w={16} fill={C.ground} sw={sw * 0.7} edge={C.paper} />
      <path d="M240 -62L254 -114C258 -126 272 -126 277 -116L268 -62Z" fill={C.ground} {...outline(q, C)} />
      {puff}
    </g>
  );
};
/** World segment along the bar's cutting edge (the underside run of the chain), base by the body, tip at the nose. */
export const chainsawBar = (p: ChainsawProps): {base: Pt; tip: Pt} => {
  const q = sawPlace(p);
  const y = CS_BAR_Y + csTrackR(strokeOf(q)) + 6;
  return {base: propPoint(q, {x: 262, y}), tip: propPoint(q, {x: CS_BAR_X1, y})};
};
export const chainsawQuad = (p: ChainsawProps): Pt[] => propQuad(sawPlace(p), {x: -75, y: -128, w: 655, h: 214});
export const chainsawGraphic = (o: PropGraphicOpts<ChainsawProps>): DecorGraphic => propGraphic(o, Chainsaw, chainsawQuad);
