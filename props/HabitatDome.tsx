// HabitatDome: a "plan" dome, a dashed outline (never real) drawn on by stroke length. Ported from the DOGEfather kit
// (K14, item 29). Its drawing is shared with Mars.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, NEVER_REAL_DASH, place, propColours, propGraphic, propQuad, propTransform, strokeOf} from './common';

// A half-circle shell with short feet, a dashed paper outline drawn on as `draw` goes 0 to 1. Anchor: centre of its
// base, dome rising toward -y. Natural size 84 x 38. No fill: it is not real.
/** `size` is the 84 width. */
export const HABITAT_DOME_SIZE = {w: 84, h: 38};
const DOME_R = 34;
const DOME_D = `M-42 0H${-DOME_R}A${DOME_R} ${DOME_R} 0 0 1 ${DOME_R} 0H42`;
const DOME_LEN = 2 * (42 - DOME_R) + Math.PI * DOME_R;
/** stroke-dasharray that shows the first `prog` of a path of length `len` in a dash pattern (on, off). */
const dashDrawOn = (len: number, prog: number, on: number, off: number): string | null => {
  const D = clamp(prog) * len;
  if (D <= 0.5) return null;
  if (prog >= 1) return `${on} ${off}`;
  const parts: number[] = [];
  let acc = 0;
  while (acc < D) {
    const seg = Math.min(on, D - acc); parts.push(seg); acc += seg;
    if (acc >= D) break;
    const g = Math.min(off, D - acc); parts.push(g); acc += g;
  }
  if (parts.length % 2 === 1) parts.push(len + on + off); else parts.push(0, len + on + off);
  return parts.map((v) => v.toFixed(2)).join(' ');
};
const [DASH_ON, DASH_OFF] = NEVER_REAL_DASH.split(/\s+/).map(Number);
/** Dome drawing in its own design space; `worldScale` is the total scale so dashes stay in world px. */
export const DomeArt: React.FC<{draw: number; sw: number; worldScale: number; colour: string}> = ({draw, sw, worldScale, colour}) => {
  const da = dashDrawOn(DOME_LEN, draw, DASH_ON / worldScale, DASH_OFF / worldScale);
  if (!da) return null;
  return <path d={DOME_D} fill="none" stroke={colour} strokeWidth={sw} strokeDasharray={da} />;
};
export interface HabitatDomeProps extends PropBase {
  /** 0..1 drawn-on progress by stroke length (default 1). */
  draw?: number;
}
const domePlace = (p: HabitatDomeProps) => place(p, HABITAT_DOME_SIZE.w);
export const HabitatDome: React.FC<HabitatDomeProps> = (p) => {
  const q = domePlace(p);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <DomeArt draw={p.draw ?? 1} sw={strokeOf(q)} worldScale={q.scale ?? 1} colour={propColours(p.colours).paper} />
    </g>
  );
};
export const habitatDomeQuad = (p: HabitatDomeProps): Pt[] => {
  const q = domePlace(p), h = strokeOf(q) / 2;
  return propQuad(q, {x: -42 - h, y: -DOME_R - h, w: 84 + 2 * h, h: DOME_R + 2 * h});
};
/** A HabitatDome as a board graphic (box null until it starts drawing on). */
export const habitatDomeGraphic = (o: PropGraphicOpts<HabitatDomeProps>): DecorGraphic => {
  const g = propGraphic(o, HabitatDome, habitatDomeQuad);
  const at = (t: number) => (typeof o.props === 'function' ? o.props(t) : o.props);
  return {...g, box: (c) => (clamp(at(c.t).draw ?? 1) * DOME_LEN <= 0.5 ? null : g.box(c))};
};
