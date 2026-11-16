// GrainSack: a burlap sack tied at the neck with a cord, a wheat-ear mark on its face (no logo). Ported from the
// DOGEfather kit (K14, item 25). Its drawing is shared with CargoShip.
import React from 'react';
import {rad, rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropColours, type PropGraphicOpts, type Placement, mix, outline, place, polyD, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

// Anchor: bottom-centre. Natural size 130 x 140 (x -65..65, y -140..0).
/** `size` is the 130 width. */
export const GRAIN_SACK_SIZE = {w: 130, h: 140};
/** The sack's drawing in design units. `q` is the placement its outlines are sized for. */
export const GrainSackArt: React.FC<{q: Placement; C: PropColours}> = ({q, C}) => {
  const sw = strokeOf(q);
  const burlap = mix(C.paper, C.muted, 0.4);
  let grains = '';
  for (let k = 0; k < 3; k++) {
    const y = -44 - k * 14;
    for (const s of [-1, 1]) {
      const c = {x: s * 7, y: y - 3};
      const pts: Pt[] = [];
      for (let a = 0; a < 360; a += 30) {const v = rot({x: 4 * Math.cos(rad(a)), y: 8 * Math.sin(rad(a))}, s * 35); pts.push({x: c.x + v.x, y: c.y + v.y});}
      grains += polyD(pts);
    }
  }
  grains += polyD(Array.from({length: 12}, (_, k) => ({x: 4 * Math.cos(rad(k * 30)), y: -92 + 8 * Math.sin(rad(k * 30))})));
  return (
    <>
      <path d="M-16 -104C-22 -112 -28 -122 -26 -134L-14 -126L-6 -140L4 -128L14 -138L20 -124L28 -130C26 -118 22 -110 16 -104Z" fill={burlap} {...outline(q, C, 0.8)} />
      <path d="M-50 0C-66 0 -66 -30 -62 -50C-58 -75 -26 -92 -16 -104L16 -104C26 -92 58 -75 62 -50C66 -30 66 0 50 0Z" fill={burlap} {...outline(q, C)} />
      <path d="M-40 -10Q0 -4 40 -10M-50 -46Q-30 -40 -22 -30" fill="none" stroke={mix(burlap, C.ground, 0.3)} strokeWidth={3} strokeLinecap="round" />
      <path d={rrectPath(-21, -111, 42, 10, 4)} fill={C.accent} {...outline(q, C, 0.5)} />
      <path d="M0 -22V-84" stroke={C.ground} strokeWidth={Math.max(3, sw * 0.5)} strokeLinecap="round" />
      <path d={grains} fill={C.ground} />
    </>
  );
};
export type GrainSackProps = PropBase;
const sackPlace = (p: GrainSackProps) => place(p, GRAIN_SACK_SIZE.w);
export const GrainSack: React.FC<GrainSackProps> = (p) => {
  const q = sackPlace(p);
  return <g transform={propTransform(q)} opacity={p.opacity ?? 1}><GrainSackArt q={q} C={propColours(p.colours)} /></g>;
};
export const grainSackQuad = (p: GrainSackProps): Pt[] => propQuad(sackPlace(p), {x: -68, y: -144, w: 136, h: 144});
export const grainSackGraphic = (o: PropGraphicOpts<GrainSackProps>): DecorGraphic => propGraphic(o, GrainSack, grainSackQuad);
