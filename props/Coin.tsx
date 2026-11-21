// Coin and CoinStack (Sweet Distillation storyboard item 59). A coin is drawn as a real disc in three-quarter view: its
// face (a plain field inside a raised ring, no numerals or portrait) and its edge band with reeding, the fine grooves
// round the rim of a real coin. `flat` tips it from standing on its edge, face to the viewer, onto its face on the
// table, seen from above as an ellipse with the reeded edge below. CoinStack piles coins lying flat.
import React from 'react';
import {clamp, easeInQuad, lerp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';
import {type RoleColours, roleColours, seeded} from './roles';

/** Natural size: 80 across, 9 thick. `size` is the 80 diameter. */
export const COIN_SIZE = {d: 80, t: 9};
const R = 40, TH = 9, REEDS = 60;
type V3 = [number, number, number];
const norm = (v: V3): V3 => { const n = Math.hypot(...v) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** Coin axis (unit, screen x right, y down, z toward the viewer) for a flat amount: standing (turned 34 degrees so the
 *  edge shows) to lying on the table seen from 20 degrees above it. */
const axisOf = (flat: number): V3 => {
  const a0: V3 = norm([Math.sin(0.6), 0, Math.cos(0.6)]);
  const a1: V3 = norm([0, -0.94, 0.34]);
  const k = clamp(flat);
  return norm([lerp(a0[0], a1[0], k), lerp(a0[1], a1[1], k), lerp(a0[2], a1[2], k)]);
};
interface CoinGeo {front: Pt[]; back: Pt[]; band: Pt[]; reeds: [Pt, Pt][]; ticks: [Pt, Pt][]; ring: Pt[]; lowest: number; box: {x0: number; y0: number; x1: number; y1: number}}
/** The coin's outlines, centre at 0, 0 before the ground offset. */
const coinGeo = (flat: number): CoinGeo => {
  const a = axisOf(flat);
  const ref: V3 = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const u = norm(cross(a, ref)), v = norm(cross(a, u));
  const P = (phi: number, r: number, h: number): Pt => ({
    x: r * (Math.cos(phi) * u[0] + Math.sin(phi) * v[0]) + h * a[0],
    y: r * (Math.cos(phi) * u[1] + Math.sin(phi) * v[1]) + h * a[1],
  });
  // which face looks at the viewer: the one whose normal has positive z
  const s = a[2] >= 0 ? 1 : -1;
  const N = 72;
  const ring = (r: number, h: number) => Array.from({length: N}, (_, k) => P((2 * Math.PI * k) / N, r, h));
  const front = ring(R, (s * TH) / 2), back = ring(R, (-s * TH) / 2);
  // the edge band: the hull of both rims
  const band = hullOf([...front, ...back]);
  const reeds: [Pt, Pt][] = [];
  for (let k = 0; k < REEDS; k++) {
    const phi = (2 * Math.PI * k) / REEDS;
    const nz = Math.cos(phi) * u[2] + Math.sin(phi) * v[2];
    if (nz > 0.08) reeds.push([P(phi, R, TH / 2), P(phi, R, -TH / 2)]);
  }
  // denticles: short ticks round the face's rim, the beaded border of a real coin
  const ticks: [Pt, Pt][] = Array.from({length: 48}, (_, k) => {
    const phi = (2 * Math.PI * k) / 48;
    return [P(phi, R * 0.84, (s * TH) / 2), P(phi, R * 0.95, (s * TH) / 2)];
  });
  const all = [...front, ...back];
  const xs = all.map((q) => q.x), ys = all.map((q) => q.y);
  return {front, back, band, reeds, ticks, ring: ring(R * 0.8, (s * TH) / 2 + s * 0.01), lowest: Math.max(...ys), box: {x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys)}};
};
const hullOf = (pts: Pt[]) => {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let k = p.length - 1; k >= 0; k--) { const q = p[k]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop();
  return lo.concat(up);
};
const poly = (P: Pt[]) => P.map((v, k) => `${k ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('') + 'Z';

export interface CoinProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** 0 standing on its edge facing the viewer (turned a little so the reeded edge shows), 1 lying flat on its face. */
  flat?: number;
  /** Metal colour (default the highlight role, a gold coin). */
  metal?: string;
}
const coinPlace = (p: CoinProps) => place(p, COIN_SIZE.d);
/** Draws the coin in design units with its lowest point at y 0 (for CoinStack, which places several). */
const CoinBody: React.FC<{flat: number; metal: string; C: RoleColours; sw: number}> = ({flat, metal, C, sw}) => {
  const g = coinGeo(flat);
  const edgeCol = mix(metal, C.ground, 0.28), reed = mix(metal, C.ground, 0.5), face = metal, rim = mix(metal, C.paper, 0.25);
  return (
    <g transform={`translate(0 ${f1(-g.lowest)})`}>
      <path d={poly(g.band)} fill={edgeCol} stroke={C.edge} strokeWidth={sw} strokeLinejoin="round" />
      {g.reeds.map(([a, b], k) => <path key={k} d={`M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`} stroke={reed} strokeWidth={1.6} />)}
      <path d={poly(g.front)} fill={rim} stroke={C.edge} strokeWidth={sw * 0.6} strokeLinejoin="round" />
      {g.ticks.map(([a, b], k) => <path key={`t${k}`} d={`M${f1(a.x)} ${f1(a.y)}L${f1(b.x)} ${f1(b.y)}`} stroke={reed} strokeWidth={1.8} strokeLinecap="round" />)}
      <path d={poly(g.ring)} fill={face} stroke={mix(metal, C.ground, 0.35)} strokeWidth={2.2} />
    </g>
  );
};
/** A coin. Anchor: the point it rests on (its lowest point), centred under it. */
export const Coin: React.FC<CoinProps> = (p) => {
  const q = coinPlace(p);
  const C = roleColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <CoinBody flat={p.flat ?? 0} metal={p.metal ?? C.highlight} C={C} sw={strokeOf(q) * 0.7} />
    </g>
  );
};
const coinBox = (flat: number) => {
  const g = coinGeo(flat);
  return {x: g.box.x0 - 3, y: g.box.y0 - g.lowest - 3, w: g.box.x1 - g.box.x0 + 6, h: g.box.y1 - g.box.y0 + 6};
};
export const coinQuad = (p: CoinProps): Pt[] => propQuad(coinPlace(p), coinBox(p.flat ?? 0));
/** World point at the centre of the coin's face. */
export const coinCentre = (p: CoinProps): Pt => propPoint(coinPlace(p), {x: 0, y: -coinGeo(p.flat ?? 0).lowest});
export const coinGraphic = (o: PropGraphicOpts<CoinProps>): DecorGraphic => propGraphic(o, Coin, coinQuad);

// ------------------------------------------------------------------ CoinStack

export interface CoinStackProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** Coins in the stack (default 5). */
  count?: number;
  /** 0 to 1: the top coin drops on from 90 design units above (0 not drawn, 1 landed). Default 1. */
  drop?: number;
  seed?: number;
  metal?: string;
}
const stackPlace = (p: CoinStackProps) => place(p, COIN_SIZE.d);
const STEP = TH * 0.94 + 1;
/** A stack of coins lying flat. Anchor: the bottom of the stack, centred. `size` is one coin's 80 diameter. */
export const CoinStack: React.FC<CoinStackProps> = (p) => {
  const q = stackPlace(p);
  const C = roleColours(p.colours);
  const n = Math.max(0, Math.round(p.count ?? 5));
  const drop = clamp(p.drop ?? 1);
  const metal = p.metal ?? C.highlight;
  const sw = strokeOf(q) * 0.7;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {Array.from({length: n}, (_, k) => {
        const top = k === n - 1;
        if (top && drop <= 0) return null;
        const jx = (seeded(p.seed ?? 5, k) - 0.5) * 7;
        const y = -k * STEP - (top ? 90 * (1 - easeInQuad(drop)) : 0);
        return <g key={k} transform={`translate(${f1(jx)} ${f1(y)})`} opacity={top ? clamp(drop * 4) : 1}><CoinBody flat={1} metal={metal} C={C} sw={sw} /></g>;
      })}
    </g>
  );
};
export const coinStackQuad = (p: CoinStackProps): Pt[] => {
  const b = coinBox(1), n = Math.max(1, Math.round(p.count ?? 5));
  return propQuad(stackPlace(p), {x: b.x - 4, y: b.y - (n - 1) * STEP, w: b.w + 8, h: b.h + (n - 1) * STEP});
};
/** World point on top of the stack (where the next coin lands). */
export const coinStackTop = (p: CoinStackProps): Pt => propPoint(stackPlace(p), {x: 0, y: -Math.max(0, Math.round(p.count ?? 5)) * STEP - coinGeo(1).lowest});
export const coinStackGraphic = (o: PropGraphicOpts<CoinStackProps>): DecorGraphic => propGraphic(o, CoinStack, coinStackQuad);
