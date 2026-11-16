// WitnessTable: a hearing-room witness table with a tent name card and a gooseneck microphone. Ported from the
// DOGEfather kit (K14, item 35).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size 520 x 340; `size` is the width. */
export const WITNESS_TABLE_SIZE = {w: 520, h: 340};
const MIC_END = {x: 30, y: -326};
const MIC_ANGLE = (Math.atan2(-6, -40) * 180) / Math.PI;
export type WitnessTableProps = PropBase;
const tablePlace = (p: WitnessTableProps) => place(p, WITNESS_TABLE_SIZE.w);
/** Hearing-room witness table: top slab at y -230 over a draped body-coloured skirt with folds, a blank tent name
 *  card, and a table-top gooseneck microphone (weighted base, coiled neck, head with an accent ring) whose head points
 *  left toward the witness seat. Anchor: bottom-centre. Natural size 520 x 340 (top at y -230, mic head to about
 *  y -340). */
export const WitnessTable: React.FC<WitnessTableProps> = (p) => {
  const q = tablePlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const folds = [-186, -124, -62, 0, 62, 124, 186].map((x) => `M${x} -206V-6`).join('');
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d="M-248 -212L248 -212L254 0L-254 0Z" fill={C.body} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <path d={folds} stroke={mix(C.body, C.ground, 0.35)} strokeWidth={4} />
      <path d={rrectPath(-260, -232, 520, 22, 4)} fill={mix(C.body, C.paper, 0.14)} stroke={C.paper} strokeWidth={sw} />
      <path d="M-170 -232L-60 -232L-72 -268L-158 -268Z" fill={C.paper} stroke={C.paper} strokeWidth={sw * 0.6} strokeLinejoin="round" />
      <path d={rrectPath(58, -244, 64, 12, 6)} fill={mix(C.body, C.ground, 0.3)} stroke={C.paper} strokeWidth={sw * 0.6} />
      <path d="M90 -244C92 -300 70 -320 30 -326" fill="none" stroke={C.paper} strokeWidth={8} strokeLinecap="round" />
      <path d="M90 -244C92 -300 70 -320 30 -326" fill="none" stroke={C.muted} strokeWidth={4} strokeDasharray="3 3" />
      <g transform={`translate(${MIC_END.x} ${MIC_END.y}) rotate(${f1(MIC_ANGLE)})`}>
        <path d={rrectPath(0, -11, 48, 22, 11)} fill={C.body} stroke={C.paper} strokeWidth={sw * 0.6} />
        <path d="M18 -8V8M26 -8V8M34 -8V8" stroke={C.muted} strokeWidth={2} />
        <rect x={0} y={-12} width={8} height={24} fill={C.accent} />
      </g>
    </g>
  );
};
export const witnessTableQuad = (p: WitnessTableProps): Pt[] => propQuad(tablePlace(p), {x: -260, y: -340, w: 520, h: 340});
/** World point of the microphone's head. */
export const tableMic = (p: WitnessTableProps): Pt =>
  propPoint(tablePlace(p), {x: MIC_END.x + 24 * Math.cos((MIC_ANGLE * Math.PI) / 180), y: MIC_END.y + 24 * Math.sin((MIC_ANGLE * Math.PI) / 180)});
export const witnessTableGraphic = (o: PropGraphicOpts<WitnessTableProps>): DecorGraphic => propGraphic(o, WitnessTable, witnessTableQuad);
