// Palm and SunDisc (Sweet Distillation storyboard item 60): the boulevard at dusk. Palm: a silhouette palm tree, a
// curved trunk that leans and rises, ring marks across it (the scars of old fronds), seven arching fronds with toothed
// leaflet edges, a cluster of coconuts at the crown. SunDisc: the setting sun as a disc cut by a horizon rule, with the
// sunset stripes across its lower part; `set` lowers it behind the rule.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';
import {type RoleColours, roleColours} from './roles';

// ------------------------------------------------------------------ Palm

/** Natural size: 300 tall (base at y 0, frond tops at about y -300), about 300 wide. `size` is the 300 height. */
export const PALM_SIZE = {h: 300};
const CROWN = {x: 46, y: -236};
const FRONDS = [
  {a: -168, L: 128}, {a: -138, L: 140}, {a: -104, L: 112}, {a: -72, L: 128}, {a: -40, L: 150}, {a: -10, L: 140}, {a: 18, L: 118},
];
export interface PalmProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** Silhouette colour (default the ground role). */
  tone?: string;
  /** Degrees the fronds sway (each frond a little differently). */
  sway?: number;
}
const palmPlace = (p: PalmProps) => place(p, PALM_SIZE.h);
const qpt = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y});
const trunk = () => {
  const a = {x: 0, y: 0}, c = {x: -14, y: -140}, b = {x: CROWN.x, y: CROWN.y + 6};
  const N = 24, L: Pt[] = [], R: Pt[] = [], mid: {p: Pt; n: Pt; w: number}[] = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const p = qpt(a, c, b, t), p2 = qpt(a, c, b, Math.min(1, t + 0.01)), p1 = qpt(a, c, b, Math.max(0, t - 0.01));
    const dx = p2.x - p1.x, dy = p2.y - p1.y, n = Math.hypot(dx, dy) || 1;
    const nx = -dy / n, ny = dx / n;
    const w = 15 - 7 * t + (k === 0 ? 4 : 0);
    L.push({x: p.x - nx * w, y: p.y - ny * w}); R.push({x: p.x + nx * w, y: p.y + ny * w});
    mid.push({p, n: {x: nx, y: ny}, w});
  }
  return {L, R, mid};
};
const frond = (ang: number, len: number, sway: number) => {
  const a = ((ang + sway) * Math.PI) / 180;
  const dir = {x: Math.cos(a), y: Math.sin(a)};
  const end = {x: CROWN.x + dir.x * len, y: CROWN.y + dir.y * len + len * 0.42};
  const ctrl = {x: CROWN.x + dir.x * len * 0.6, y: CROWN.y + dir.y * len * 0.6 - len * 0.16};
  const N = 18, up: Pt[] = [], dn: Pt[] = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const p = qpt(CROWN, ctrl, end, t), p2 = qpt(CROWN, ctrl, end, Math.min(1, t + 0.02)), p1 = qpt(CROWN, ctrl, end, Math.max(0, t - 0.02));
    const dx = p2.x - p1.x, dy = p2.y - p1.y, n = Math.hypot(dx, dy) || 1;
    let nx = -dy / n, ny = dx / n;
    if (ny > 0) { nx = -nx; ny = -ny; } // nx, ny points to the upper side of the frond
    const w = 18 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7) * (1 - 0.35 * t);
    up.push({x: p.x + nx * w * 0.45, y: p.y + ny * w * 0.45});
    // the lower edge hangs the leaflets: a tooth every other sample
    const tooth = k % 2 ? 1.0 : 0.55;
    dn.push({x: p.x - nx * w * tooth + dx / n * 5 * (k % 2), y: p.y - ny * w * tooth + dy / n * 5 * (k % 2)});
  }
  return [...up, ...dn.reverse()];
};
/** A silhouette palm tree. Anchor: the base of the trunk on the ground. */
export const Palm: React.FC<PalmProps> = (p) => {
  const q = palmPlace(p);
  const C = roleColours(p.colours);
  const tone = p.tone ?? C.ground;
  const ring = mix(tone, C.wall === tone ? C.muted : C.wall, 0.5);
  const tr = trunk();
  const sway = p.sway ?? 0;
  const trunkD = [...tr.L, ...[...tr.R].reverse()].map((v, k) => `${k ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('') + 'Z';
  const rings = tr.mid.filter((_, k) => k > 1 && k < tr.mid.length - 2 && k % 2 === 0).map((m, k) => {
    const a = {x: m.p.x - m.n.x * m.w * 0.8, y: m.p.y - m.n.y * m.w * 0.8}, b = {x: m.p.x + m.n.x * m.w * 0.8, y: m.p.y + m.n.y * m.w * 0.8};
    return <path key={k} d={`M${f1(a.x)} ${f1(a.y)}Q${f1(m.p.x)} ${f1(m.p.y + 5)} ${f1(b.x)} ${f1(b.y)}`} fill="none" stroke={ring} strokeWidth={2.6} strokeLinecap="round" />;
  });
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={trunkD} fill={tone} />
      {rings}
      {FRONDS.map((f, k) => (
        <path key={k} d={frond(f.a, f.L, sway * (0.6 + 0.15 * (k % 3))).map((v, j) => `${j ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('') + 'Z'} fill={tone} stroke={tone} strokeWidth={1.5} strokeLinejoin="round" />
      ))}
      {[{x: -8, y: 10}, {x: 8, y: 12}, {x: 0, y: 22}].map((c, k) => <circle key={k} cx={CROWN.x + c.x} cy={CROWN.y + c.y} r={9} fill={tone} stroke={ring} strokeWidth={2} />)}
    </g>
  );
};
export const palmQuad = (p: PalmProps): Pt[] => propQuad(palmPlace(p), {x: -110, y: -306, w: 320, h: 306});
/** World point at the crown, where the fronds meet. */
export const palmCrown = (p: PalmProps): Pt => propPoint(palmPlace(p), CROWN);
export const palmGraphic = (o: PropGraphicOpts<PalmProps>): DecorGraphic => propGraphic(o, Palm, palmQuad);

// ------------------------------------------------------------------ SunDisc

/** Natural size: a 440 diameter disc (radius 220). `size` is the 440 diameter. */
export const SUN_DISC_SIZE = {d: 440};
const SR = 220;
export interface SunDiscProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** 0 to 1: how far it has set (0 half set, its centre on the horizon; 1 gone below it). */
  set?: number;
  /** Horizon rule length in design units (default 704, 1.6 diameters), centred under the disc. */
  horizon?: number;
  /** Sunset stripes cut across the lower part of the disc (default 3; 0 for none). */
  stripes?: number;
  /** Disc colour (default the highlight role); stripe colour (default the ground2 role, the dusk). */
  tone?: string; stripeTone?: string;
}
const sunPlace = (p: SunDiscProps) => place(p, SUN_DISC_SIZE.d);
/** The setting sun on a horizon rule. Anchor: the point on the horizon under the disc's centre. */
export const SunDisc: React.FC<SunDiscProps> = (p) => {
  const q = sunPlace(p);
  const sw = strokeOf(q);
  const C = roleColours(p.colours);
  const tone = p.tone ?? C.highlight, stripe = p.stripeTone ?? C.wall;
  const d = SR * clamp(p.set ?? 0); // disc centre below the horizon
  const hw = Math.sqrt(Math.max(0, SR * SR - d * d));
  const HL = (p.horizon ?? SR * 3.2) / 2;
  const n = Math.max(0, Math.round(p.stripes ?? 3));
  const stripes = Array.from({length: n}, (_, k) => {
    // stripes belong to the disc: set relative to its centre, they sink with it
    const yc = -SR * (0.08 + 0.15 * k), th = 13 - 3.5 * k;
    const y = yc + d;
    if (y + th / 2 > 0) return null;
    const half = Math.sqrt(Math.max(0, SR * SR - yc * yc));
    return <rect key={k} x={-half - 2} y={y - th / 2} width={2 * half + 4} height={th} fill={stripe} />;
  });
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {hw > 0.5 && <path d={`M${f1(-hw)} 0A${SR} ${SR} 0 0 1 ${f1(hw)} 0Z`} fill={tone} />}
      {hw > 0.5 && stripes}
      <path d={`M${f1(-HL)} 0H${f1(HL)}`} stroke={C.edge} strokeWidth={sw} strokeLinecap="round" />
    </g>
  );
};
export const sunDiscQuad = (p: SunDiscProps): Pt[] => {
  const HL = (p.horizon ?? SR * 3.2) / 2, d = SR * clamp(p.set ?? 0);
  return propQuad(sunPlace(p), {x: -HL - 4, y: -(SR - d) - 4, w: 2 * HL + 8, h: SR - d + 12});
};
export const sunDiscGraphic = (o: PropGraphicOpts<SunDiscProps>): DecorGraphic => propGraphic(o, SunDisc, sunDiscQuad);
