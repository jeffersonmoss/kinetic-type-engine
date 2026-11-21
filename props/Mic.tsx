// Mic: a ball-head vocal microphone in a clip on a straight stand with a round base (Sweet Distillation storyboard
// items 39 and 55; the talk box's microphone, fed by the Hose). `pulse` swells the head and sends two sound arcs.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, arcD, f1, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';
import {type RoleColours, roleColours} from './roles';

/** Natural size: head 90 across. With the default 330 stand the whole mic is 562 tall (y -562 to 0). `size` is the
 *  90 head width. */
export const MIC_SIZE = {w: 90};
const BASE_H = 18, HANDLE = 104, HEAD_R = 45, BAND = 14;
export interface MicProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** Pole length in design units (default 330). */
  stand?: number;
  /** 0 to 1: the head swells by 6 percent and two sound arcs show (a board pulses it on a sung word). */
  pulse?: number;
  /** Sound arc colour (default the edge role). Sweet Distillation: Ink on light grounds, Cream on Dusk. */
  arcs?: string;
}
const micPlace = (p: MicProps) => place(p, MIC_SIZE.w);
const geo = (p: MicProps) => {
  const S = p.stand ?? 330;
  const poleTop = -BASE_H - S;
  const handleBot = poleTop + 12, handleTop = handleBot - HANDLE;
  const bandTop = handleTop - BAND;
  const head = {x: 0, y: bandTop - HEAD_R + 6};
  return {S, poleTop, handleBot, handleTop, bandTop, head};
};
/** A ball-head microphone on a stand. Anchor: bottom centre of the round base. */
export const Mic: React.FC<MicProps> = (p) => {
  const q = micPlace(p);
  const sw = strokeOf(q);
  const C = roleColours(p.colours);
  const g = geo(p);
  const pu = clamp(p.pulse ?? 0);
  const metal = C.muted, metalDark = mix(C.muted, C.ground, 0.4), metalLight = mix(C.muted, C.paper, 0.5);
  const handle = mix(C.ground, C.muted, 0.25);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const hs = 1 + 0.06 * pu;
  // grille mesh: diagonal lines clipped to the ball by keeping each chord inside the circle
  const mesh: string[] = [];
  const R = HEAD_R - 4;
  for (let k = -5; k <= 5; k++) {
    const c = (k * R) / 5.5;
    const h = Math.sqrt(Math.max(0, R * R - c * c));
    // two families of chords at +45 and -45 degrees through offset c
    const r2 = Math.SQRT1_2;
    mesh.push(`M${f1(c * r2 - h * r2)} ${f1(-c * r2 - h * r2)}L${f1(c * r2 + h * r2)} ${f1(-c * r2 + h * r2)}`);
    mesh.push(`M${f1(c * r2 + h * r2)} ${f1(c * r2 - h * r2)}L${f1(c * r2 - h * r2)} ${f1(c * r2 + h * r2)}`);
  }
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {/* round base seen slightly from above, the pole, the clip */}
      <path d={`M-74 -4C-74 ${-BASE_H - 6} 74 ${-BASE_H - 6} 74 -4C74 4 -74 4 -74 -4Z`} fill={handle} {...E} />
      <path d={rrectPath(-6, g.poleTop, 12, g.S + BASE_H - 6, 3)} fill={metal} {...E} />
      <path d={rrectPath(-14, -BASE_H - 2 - 40, 28, 14, 3)} fill={metalDark} {...E} />
      <path d={`M-20 ${g.handleBot - 30}V${g.handleBot - 6}Q0 ${g.handleBot + 8} 20 ${g.handleBot - 6}V${g.handleBot - 30}`} fill="none" stroke={C.edge} strokeWidth={sw + 6} strokeLinecap="round" />
      <path d={`M-20 ${g.handleBot - 30}V${g.handleBot - 6}Q0 ${g.handleBot + 8} 20 ${g.handleBot - 6}V${g.handleBot - 30}`} fill="none" stroke={metalDark} strokeWidth={6} strokeLinecap="round" />
      {/* handle: tapers from the band down to the clip */}
      <path d={`M-22 ${g.handleTop}L22 ${g.handleTop}L15 ${g.handleBot}L-15 ${g.handleBot}Z`} fill={handle} {...E} />
      <path d={`M-12 ${g.handleTop + 10}L-9 ${g.handleBot - 8}`} stroke={metalLight} strokeWidth={3} strokeLinecap="round" opacity={0.7} />
      {/* band and ball head with grille */}
      <path d={rrectPath(-27, g.bandTop, 54, BAND, 4)} fill={metalDark} {...E} />
      <g transform={`translate(0 ${f1(g.head.y)}) scale(${hs.toFixed(4)})`}>
        <circle r={HEAD_R} fill={metal} {...E} />
        <path d={mesh.join('')} stroke={metalDark} strokeWidth={2} />
        <path d={`M${-HEAD_R} 0Q0 10 ${HEAD_R} 0`} fill="none" stroke={metalDark} strokeWidth={3.5} />
        <path d={arcD({x: 0, y: 0}, HEAD_R - 9, 200, 250)} fill="none" stroke={metalLight} strokeWidth={6} strokeLinecap="round" />
      </g>
      {pu > 0 && (
        <g opacity={pu} fill="none" stroke={p.arcs ?? C.edge} strokeWidth={5} strokeLinecap="round">
          <path d={arcD(g.head, HEAD_R + 18, -40, 40)} />
          <path d={arcD(g.head, HEAD_R + 34, -34, 34)} />
        </g>
      )}
    </g>
  );
};
export const micQuad = (p: MicProps): Pt[] => {
  const g = geo(p);
  const top = g.head.y - HEAD_R * 1.06 - 6;
  return propQuad(micPlace(p), {x: -78, y: top, w: 78 + Math.max(78, HEAD_R + 40), h: -top + 6});
};
/** World point at the centre of the ball head (words sprout from here). */
export const micHead = (p: MicProps): Pt => propPoint(micPlace(p), geo(p).head);
/** World point at the bottom of the handle, inside the clip (where a hose or cable goes in). */
export const micTail = (p: MicProps): Pt => propPoint(micPlace(p), {x: 0, y: geo(p).handleBot});
export const micGraphic = (o: PropGraphicOpts<MicProps>): DecorGraphic => propGraphic(o, Mic, micQuad);
