// ContractSheet: a signed contract page. Ported from the DOGEfather kit (K14, S22).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size 300 x 400; `size` is the width. */
export const CONTRACT_SIZE = {w: 300, h: 400};
const CONTRACT_LINES = (() => {
  const ws = [250, 236, 250, 212, 244, 250, 228, 140];
  return ws.map((w, k) => rrectPath(-120, -122 + k * 24, w, 7, 3.5)).join('');
})();
const SCRIBBLE = 'M-104 136C-96 98 -82 100 -86 128C-89 150 -70 118 -60 112C-50 106 -56 134 -44 130C-30 126 -28 104 -16 110C-6 116 -12 136 0 132C14 128 16 114 30 119C40 122 44 131 58 124';
export type ContractSheetProps = PropBase;
const contractPlace = (p: ContractSheetProps) => place(p, CONTRACT_SIZE.w);
/** A contract page: paper sheet with a folded corner, a heading bar, ruled text lines, a signature line with an x mark
 *  and an accent2 (pen) scribble, and a date line. Anchor: centre. Natural size 300 x 400. */
export const ContractSheet: React.FC<ContractSheetProps> = (p) => {
  const q = contractPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d="M-150 -200L110 -200L150 -160L150 200L-150 200Z" fill={C.paper} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <path d="M110 -200L110 -160L150 -160Z" fill={mix(C.paper, C.ground, 0.2)} />
      <path d={rrectPath(-120, -166, 150, 14, 3)} fill={C.ground} />
      <path d={CONTRACT_LINES} fill={mix(C.paper, C.ground, 0.35)} />
      <path d="M-120 146H60M80 146H124M-134 128L-124 138M-124 128L-134 138" stroke={C.ground} strokeWidth={3} strokeLinecap="round" />
      <path d={SCRIBBLE} fill="none" stroke={C.accent2} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
};
export const contractQuad = (p: ContractSheetProps): Pt[] => propQuad(contractPlace(p), {x: -150, y: -200, w: 300, h: 400});
export const contractSheetGraphic = (o: PropGraphicOpts<ContractSheetProps>): DecorGraphic => propGraphic(o, ContractSheet, contractQuad);
