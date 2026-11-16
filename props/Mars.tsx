// Mars: a red planet disc with craters and up to three plan domes drawing on along its upper limb. Ported from the
// DOGEfather kit (K14, item 29).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {DomeArt} from './HabitatDome';
import {type PropBase, type PropGraphicOpts, circlePath, f1, mix, outline, place, polar, propColours, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';

// An accent disc with two darker craters; up to three HabitatDomes on its upper limb. Anchor: centre. Natural diameter
// 260 (domes add up to 38 above the limb).
/** `size` is the 260 diameter. */
export const MARS_SIZE = {w: 260, h: 260};
export interface MarsProps extends PropBase {
  /** 0..3 fractional: dome k (0, 1, 2; left to right along the upper limb) draws on as domes goes k to k+1. */
  domes?: number;
}
const MARS_R = 130, MARS_DOME_ANGLES = [-128, -90, -52];
const marsPlace = (p: MarsProps) => place(p, MARS_SIZE.w);
export const Mars: React.FC<MarsProps> = (p) => {
  const q = marsPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const crater = mix(C.accent, C.ground, 0.3), rim = mix(C.accent, C.ground, 0.5);
  const domes = p.domes ?? 0;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={circlePath(0, 0, MARS_R)} fill={C.accent} {...outline(q, C)} />
      <path d={circlePath(-42, 38, 30) + circlePath(52, 4, 19)} fill={crater} stroke={rim} strokeWidth={4} />
      <path d={circlePath(-12, 82, 7)} fill={crater} />
      {MARS_DOME_ANGLES.map((a, k) => {
        const prog = clamp(domes - k);
        if (prog <= 0) return null;
        const b = polar(MARS_R, a);
        return (
          <g key={k} transform={`translate(${f1(b.x)} ${f1(b.y)}) rotate(${a + 90})`}>
            <DomeArt draw={prog} sw={sw} worldScale={q.scale ?? 1} colour={C.paper} />
          </g>
        );
      })}
    </g>
  );
};
/** World base-centre of dome k on Mars's limb. */
export const marsDomePoint = (p: MarsProps, k: number): Pt => propPoint(marsPlace(p), polar(MARS_R, MARS_DOME_ANGLES[k] ?? -90));
export const marsQuad = (p: MarsProps): Pt[] => propQuad(marsPlace(p), {x: -MARS_R - 10, y: -MARS_R - 46, w: 2 * MARS_R + 20, h: 2 * MARS_R + 46});
export const marsGraphic = (o: PropGraphicOpts<MarsProps>): DecorGraphic => propGraphic(o, Mars, marsQuad);
