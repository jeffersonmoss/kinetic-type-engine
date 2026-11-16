// Printer: a thermal receipt printer seen from the front, slot facing up. Ported from the DOGEfather kit (K14, item 32).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, polyD, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, serratedEdge, strokeOf} from './common';

export interface PrinterProps extends PropBase {
  /** Width of the slot in design units (default 800). `size` is the whole body's width (natural width + 140). */
  width?: number;
}
export const printerSize = (p: {width?: number}) => ({w: (p.width ?? 800) + 140, h: 236});
const printerPlace = (p: PrinterProps) => place(p, printerSize(p).w);
/** Thermal receipt printer seen from the front, slot facing up: a body-coloured case, the dark slot, a serrated muted
 *  tear bar just in front of the slot, a lid seam, a feed button and a highlight status light. Anchor: centre of the
 *  slot. Natural size (width + 140) x 236, from y -16 to 220. Draw the paper first and the Printer over it, so the body
 *  hides the paper's tail and the paper comes out of the slot. */
export const Printer: React.FC<PrinterProps> = (p) => {
  const q = printerPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const W = p.width ?? 800, hw = W / 2;
  const bar = [...serratedEdge(-hw - 16, hw + 16, 12, 12, -1), {x: hw + 16, y: 28}, {x: -hw - 16, y: 28}];
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-hw - 70, -16, W + 140, 236, 28)} fill={C.body} stroke={C.paper} strokeWidth={sw} />
      <path d={rrectPath(-hw - 10, -8, W + 20, 16, 6)} fill={C.ground} />
      <path d={polyD(bar)} fill={C.muted} stroke={C.paper} strokeWidth={sw * 0.5} strokeLinejoin="round" />
      <path d={`M${-hw - 66} 120H${hw + 66}`} stroke={mix(C.body, C.ground, 0.45)} strokeWidth={4} />
      <circle cx={hw + 4} cy={170} r={18} fill={mix(C.body, C.paper, 0.2)} stroke={C.paper} strokeWidth={sw * 0.5} />
      <circle cx={hw - 40} cy={170} r={6} fill={C.highlight} />
    </g>
  );
};
export const printerQuad = (p: PrinterProps): Pt[] => { const W = p.width ?? 800; return propQuad(printerPlace(p), {x: -W / 2 - 70, y: -16, w: W + 140, h: 236}); };
/** World points of the slot: its centre and its two ends (paper of the slot's width feeds up from here). */
export const printerSlot = (p: PrinterProps): {centre: Pt; left: Pt; right: Pt} => {
  const W = p.width ?? 800, q = printerPlace(p);
  return {centre: propPoint(q, {x: 0, y: 0}), left: propPoint(q, {x: -W / 2, y: 0}), right: propPoint(q, {x: W / 2, y: 0})};
};
export const printerGraphic = (o: PropGraphicOpts<PrinterProps>): DecorGraphic => propGraphic(o, Printer, printerQuad);
