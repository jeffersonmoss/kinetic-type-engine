// BassDrum: a marching bass drum, head facing the viewer, with two mallets that strike it. Ported from the DOGEfather
// kit (K14, S02 L05).
import React from 'react';
import {clamp, rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, Tube, circlePath, f1, mix, outline, place, polar, propColours, propGraphic, propPoint, propQuad, propTransform, rectAt, strokeOf} from './common';

// A marching bass drum on its side, head facing the viewer (a sliver of shell and back hoop shows to the right, with
// tension rods across it), carry strap above, two mallets from the sides. Anchor: centre of the head. Natural size:
// head diameter 340; with shell, mallets and strap about 580 x 420 (x -290..290, y -245..175).
/** `size` is the 580 overall width. */
export const BASS_DRUM_SIZE = {w: 580, h: 420};
export interface BassDrumProps extends PropBase {
  /** Per beater 0..1: 0 drawn back, 1 touching the head. */
  strikes?: [number, number];
  /** 0..1: the head flexes in (up to 6 px) at the strike point of any beater touching it. */
  flex?: number;
}
const BD_GRIP: [Pt, Pt] = [{x: -262, y: 40}, {x: 262, y: 40}];
const BD_HIT: [Pt, Pt] = [{x: -70, y: -20}, {x: 70, y: -20}];
const bdBall = (k: 0 | 1, s: number): Pt => {
  const g = BD_GRIP[k], h = BD_HIT[k];
  const r = rot({x: h.x - g.x, y: h.y - g.y}, (k === 0 ? -35 : 35) * (1 - clamp(s)));
  return {x: g.x + r.x, y: g.y + r.y};
};
const drumPlace = (p: BassDrumProps) => place(p, BASS_DRUM_SIZE.w);
export const BassDrum: React.FC<BassDrumProps> = (p) => {
  const q = drumPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const strikes = p.strikes ?? [0, 0];
  const flex = clamp(p.flex ?? 0);
  const back = {x: 84, y: -22};
  let rods = '', claws = '';
  for (let k = 0; k < 10; k++) {
    const a = k * 36 + 18;
    const q0 = polar(166, a), q1 = polar(166, a, back);
    rods += `M${f1(q0.x)} ${f1(q0.y)}L${f1(q1.x)} ${f1(q1.y)}`;
    claws += rectAt(polar(163, a), 26, 12, a);
  }
  const dents = ([0, 1] as const).map((k) => {
    const d = flex * clamp((strikes[k] - 0.85) / 0.15);
    if (d <= 0.01) return null;
    const h = BD_HIT[k], c = {x: h.x * (1 - 0.06 * d), y: h.y * (1 - 0.06 * d)};
    return (
      <g key={k}>
        <path d={circlePath(c.x, c.y, 18 + 22 * d)} fill={mix(C.paper, C.muted, 0.55 * d)} />
        <path d={circlePath(c.x, c.y, 34 + 30 * d)} fill="none" stroke={C.muted} strokeWidth={3} opacity={d} />
      </g>
    );
  });
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <Tube d="M-55 -150C-44 -246 128 -246 139 -150" w={18} fill={C.body} sw={sw * 0.8} edge={C.paper} />
      <path d={circlePath(back.x, back.y, 170)} fill={C.body} {...outline(q, C)} />
      <path d={circlePath(back.x / 2, back.y / 2, 167)} fill={C.accent} {...outline(q, C, 0.6)} />
      <path d={rods} stroke={C.muted} strokeWidth={5} strokeLinecap="round" />
      <path d={circlePath(0, 0, 170)} fill={C.body} {...outline(q, C)} />
      <path d={claws} fill={C.muted} stroke={C.paper} strokeWidth={sw * 0.35} strokeLinejoin="round" />
      <path d={circlePath(0, 0, 151)} fill={C.paper} />
      <path d={circlePath(0, 0, 138)} fill="none" stroke={mix(C.paper, C.muted, 0.45)} strokeWidth={3} />
      {dents}
      {([0, 1] as const).map((k) => {
        const g = BD_GRIP[k], b = bdBall(k, strikes[k]);
        const d = flex * clamp((strikes[k] - 0.85) / 0.15);
        const bc = {x: b.x * (1 - 0.06 * d), y: b.y * (1 - 0.06 * d)};
        const dir = {x: bc.x - g.x, y: bc.y - g.y}, L = Math.hypot(dir.x, dir.y);
        const end = {x: g.x + dir.x * (1 - 24 / L), y: g.y + dir.y * (1 - 24 / L)};
        return (
          <g key={k}>
            <path d={`M${f1(g.x)} ${f1(g.y)}L${f1(end.x)} ${f1(end.y)}`} stroke={C.paper} strokeWidth={10 + sw} strokeLinecap="round" />
            <path d={`M${f1(g.x)} ${f1(g.y)}L${f1(end.x)} ${f1(end.y)}`} stroke={C.muted} strokeWidth={10} strokeLinecap="round" />
            <path d={circlePath(g.x, g.y, 9)} fill={C.ground} {...outline(q, C, 0.5)} />
            <path d={circlePath(bc.x, bc.y, 26)} fill={C.body} {...outline(q, C)} />
          </g>
        );
      })}
    </g>
  );
};
/** World point where beater k (0 left, 1 right) meets the head. */
export const bassDrumStrikePoint = (p: BassDrumProps, k: 0 | 1): Pt => propPoint(drumPlace(p), BD_HIT[k]);
export const bassDrumQuad = (p: BassDrumProps): Pt[] => propQuad(drumPlace(p), {x: -290, y: -245, w: 580, h: 420});
export const bassDrumGraphic = (o: PropGraphicOpts<BassDrumProps>): DecorGraphic => propGraphic(o, BassDrum, bassDrumQuad);
