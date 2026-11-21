// Glass and Drop (Sweet Distillation storyboard item 58). Glass: a straight tumbler in three-quarter view, an
// elliptical rim, slightly tapered walls, a heavy base, a highlight streak, filled with Syrup to `level`. `tilt` tips it
// about the base corner on the side it tips toward, and the liquid surface stays level (the same volume, until it
// reaches the lip and pours). Drop: a teardrop of Syrup.
import React from 'react';
import {clamp, lerp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 110 wide at the rim, 146 tall (base at y 0, rim at y -146). `size` is the 110 width. */
export const GLASS_SIZE = {w: 110, h: 146};
const H = GLASS_SIZE.h, RT = 55, RB = 46, RY = 12, BASE = 14;
// the inside of the glass, upright, as a polygon (the base's top to the rim)
const INNER: Pt[] = [{x: -RB + 4, y: -BASE}, {x: RB - 4, y: -BASE}, {x: RT - 4, y: -H}, {x: -(RT - 4), y: -H}];
export interface GlassProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** 0 to 1: how full (fraction of the inside's area when upright). */
  level?: number;
  /** Degrees it tips about the base corner on that side (negative tips left). */
  tilt?: number;
}
const glassPlace = (p: GlassProps) => place(p, GLASS_SIZE.w);
const area = (P: Pt[]) => { let a = 0; for (let k = 0; k < P.length; k++) { const u = P[k], v = P[(k + 1) % P.length]; a += u.x * v.y - v.x * u.y; } return Math.abs(a) / 2; };
/** The part of polygon P at or below the line y = Y (y grows downward). */
const below = (P: Pt[], Y: number): Pt[] => {
  const out: Pt[] = [];
  for (let k = 0; k < P.length; k++) {
    const a = P[k], b = P[(k + 1) % P.length];
    const ina = a.y >= Y, inb = b.y >= Y;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (Y - a.y) / (b.y - a.y); out.push({x: a.x + (b.x - a.x) * t, y: Y}); }
  }
  return out;
};
const tipXf = (tilt: number) => {
  const piv = {x: tilt < 0 ? -RB : RB, y: 0};
  const a = (tilt * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (v: Pt): Pt => ({x: piv.x + (v.x - piv.x) * c - (v.y - piv.y) * s, y: piv.y + (v.x - piv.x) * s + (v.y - piv.y) * c});
};
/** The liquid polygon (design space, after the tilt) for a level and tilt. */
const liquid = (level: number, tilt: number): {poly: Pt[]; surfaceY: number} | null => {
  const L = clamp(level);
  if (L <= 0) return null;
  const X = tipXf(tilt);
  const P = INNER.map(X);
  const target = L * area(INNER);
  // the liquid cannot stand above the lower rim corner (it pours out)
  const lip = Math.max(X(INNER[2]).y, X(INNER[3]).y);
  let lo = Math.min(...P.map((v) => v.y)), hi = Math.max(...P.map((v) => v.y));
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (area(below(P, m)) > target) lo = m; else hi = m; }
  const Y = Math.max((lo + hi) / 2, lip);
  return {poly: below(P, Y), surfaceY: Y};
};
/** A tumbler of Syrup. Anchor: centre of the base on the table (it tips about a base corner). */
export const Glass: React.FC<GlassProps> = (p) => {
  const q = glassPlace(p);
  const sw = strokeOf(q);
  const C = roleColours(p.colours);
  const tilt = p.tilt ?? 0;
  const piv = {x: tilt < 0 ? -RB : RB, y: 0};
  const liq = liquid(p.level ?? 0, tilt);
  const glassTint = C.paper;
  const syrupTop = mix(C.syrup, C.paper, 0.35);
  const wall = `M${-RB} 0L${-RT} ${-H}A${RT} ${RY} 0 0 0 ${RT} ${-H}L${RB} 0A${RB} ${RY * 0.85} 0 0 1 ${-RB} 0Z`;
  // a level surface: an ellipse while nearly upright, flattening to a line as it tips
  const surf = liq ? (() => {
    const xs = liq.poly.filter((v) => Math.abs(v.y - liq.surfaceY) < 0.01).map((v) => v.x);
    if (xs.length < 2) return null;
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const ry = RY * 0.9 * Math.max(0, Math.cos((tilt * Math.PI) / 180)) * clamp(1 - Math.abs(tilt) / 60);
    return {cx: (x0 + x1) / 2, rx: (x1 - x0) / 2, ry};
  })() : null;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {/* everything below is in the glass's tipped frame except the liquid, which is computed level */}
      <g transform={`rotate(${f1(tilt)} ${piv.x} ${piv.y})`}>
        <path d={wall} fill={glassTint} opacity={0.32} />
        <ellipse cx={0} cy={-H} rx={RT} ry={RY} fill={mix(glassTint, C.ground, 0.12)} opacity={0.45} />
      </g>
      {liq && (
        <g>
          <path d={liq.poly.map((v, k) => `${k ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('') + 'Z'} fill={C.syrup} />
          {surf && surf.ry > 0.5 && <ellipse cx={f1(surf.cx)} cy={f1(liq.surfaceY)} rx={f1(surf.rx)} ry={f1(surf.ry)} fill={syrupTop} stroke={C.edge} strokeWidth={sw * 0.35} />}
          {surf && surf.ry <= 0.5 && <path d={`M${f1(surf.cx - surf.rx)} ${f1(liq.surfaceY)}H${f1(surf.cx + surf.rx)}`} stroke={C.edge} strokeWidth={sw * 0.5} />}
        </g>
      )}
      <g transform={`rotate(${f1(tilt)} ${piv.x} ${piv.y})`}>
        {/* heavy base: a thicker band of glass at the bottom */}
        <path d={`M${-RB} 0L${-RB + 1.5} ${-BASE}A${RB - 1.5} ${RY * 0.8} 0 0 0 ${RB - 1.5} ${-BASE}L${RB} 0A${RB} ${RY * 0.85} 0 0 1 ${-RB} 0Z`} fill={mix(glassTint, C.muted, 0.35)} opacity={0.75} />
        {/* highlight streak and the outline: walls, base curve, full rim */}
        <path d={`M${-RB + 12} -24L${-RT + 13} ${-H + 18}`} stroke={C.paper} strokeWidth={7} strokeLinecap="round" opacity={0.9} />
        <path d={`M${-RB} 0L${-RT} ${-H}M${RT} ${-H}L${RB} 0A${RB} ${RY * 0.85} 0 0 1 ${-RB} 0`} fill="none" stroke={C.edge} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
        <ellipse cx={0} cy={-H} rx={RT} ry={RY} fill="none" stroke={C.edge} strokeWidth={sw} />
      </g>
    </g>
  );
};
export const glassQuad = (p: GlassProps): Pt[] => {
  const X = tipXf(p.tilt ?? 0);
  const pts = [{x: -RT, y: -H - RY}, {x: RT, y: -H - RY}, {x: RB, y: RY}, {x: -RB, y: RY}, {x: -RT, y: -H + RY}, {x: RT, y: -H + RY}].map(X);
  const xs = pts.map((v) => v.x), ys = pts.map((v) => v.y);
  const x0 = Math.min(...xs) - 4, y0 = Math.min(...ys) - 4;
  return propQuad(glassPlace(p), {x: x0, y: y0, w: Math.max(...xs) + 4 - x0, h: Math.max(...ys) + 4 - y0});
};
/** World point at the centre of the rim (where a hose or straw goes in), after the tilt. */
export const glassRim = (p: GlassProps): Pt => propPoint(glassPlace(p), tipXf(p.tilt ?? 0)({x: 0, y: -H}));
/** World point at the rim's lip on the side it tips toward (where it pours from). */
export const glassLip = (p: GlassProps): Pt => propPoint(glassPlace(p), tipXf(p.tilt ?? 0)({x: (p.tilt ?? 0) < 0 ? -RT : RT, y: -H}));
export const glassGraphic = (o: PropGraphicOpts<GlassProps>): DecorGraphic => propGraphic(o, Glass, glassQuad);

// ------------------------------------------------------------------ Drop

/** Natural size: 30 tall, 20 wide (round part centred at 0, 0; the point up). `size` is the 30 height. */
export const DROP_SIZE = {h: 30};
export interface DropProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** 0 to 1: lengthens the drop as it falls (up to 1.5 times as tall, a little narrower). */
  stretch?: number;
}
const dropPlace = (p: DropProps) => place(p, DROP_SIZE.h);
/** A teardrop of Syrup, point up. Anchor: the centre of its round part. */
export const Drop: React.FC<DropProps> = (p) => {
  const q = dropPlace(p);
  const sw = strokeOf(q);
  const C = roleColours(p.colours);
  const s = clamp(p.stretch ?? 0);
  const r = lerp(10, 8.5, s), top = -lerp(20, 32, s);
  const d = `M0 ${f1(top)}C${f1(r * 0.5)} ${f1(top * 0.55)} ${f1(r)} ${f1(-r * 0.4)} ${f1(r)} 0A${f1(r)} ${f1(r)} 0 0 1 ${f1(-r)} 0C${f1(-r)} ${f1(-r * 0.4)} ${f1(-r * 0.5)} ${f1(top * 0.55)} 0 ${f1(top)}Z`;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={d} fill={C.syrup} stroke={C.edge} strokeWidth={sw * 0.5} strokeLinejoin="round" />
      <ellipse cx={-r * 0.38} cy={-r * 0.2} rx={r * 0.2} ry={r * 0.32} fill={mix(C.syrup, C.paper, 0.6)} />
    </g>
  );
};
export const dropQuad = (p: DropProps): Pt[] => propQuad(dropPlace(p), {x: -12, y: -34, w: 24, h: 46});
export const dropGraphic = (o: PropGraphicOpts<DropProps>): DecorGraphic => propGraphic(o, Drop, dropQuad);
