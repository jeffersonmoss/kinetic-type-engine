// Scales: the scales of justice (Paper Trail storyboard items 61 and 231), silver, static and level: a stepped foot, a
// column with a ball finial, a beam across the top, and two shallow pans hung on three cords each.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {outlineFor} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 260 wide across the pans (x -130 to 130), 300 tall (y -300 to 0). Anchor: the bottom centre of the
 *  foot. `size` is the 260 width. */
export const SCALES_SIZE = {w: 260};
export interface ScalesProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Metal colour (default silver, the muted role mixed toward paper). */
  tone?: string;
}
const scalesPlace = (p: ScalesProps) => place(p, SCALES_SIZE.w);
const BEAM_Y = -258, PAN_Y = -130, HANG_X = 96;
export const Scales: React.FC<ScalesProps> = (p) => {
  const q = scalesPlace(p);
  const sw = outlineFor(q, SCALES_SIZE.w, 0.02);
  const C = roleColours(p.colours);
  const metal = p.tone ?? mix(C.muted, C.paper, 0.5);
  const shade = mix(metal, C.ground, 0.28);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const pan = (s: 1 | -1) => {
    const x = s * HANG_X;
    return (
      <g key={s}>
        <path d={`M${x} ${BEAM_Y + 8}L${x - 30} ${PAN_Y}M${x} ${BEAM_Y + 8}L${x} ${PAN_Y}M${x} ${BEAM_Y + 8}L${x + 30} ${PAN_Y}`} stroke={C.edge} strokeWidth={sw + 4} strokeLinecap="round" />
        <path d={`M${x} ${BEAM_Y + 8}L${x - 30} ${PAN_Y}M${x} ${BEAM_Y + 8}L${x} ${PAN_Y}M${x} ${BEAM_Y + 8}L${x + 30} ${PAN_Y}`} stroke={metal} strokeWidth={4} strokeLinecap="round" />
        <path d={`M${x - 34} ${PAN_Y - 4}H${x + 34}Q${x + 30} ${PAN_Y + 26} ${x} ${PAN_Y + 26}Q${x - 30} ${PAN_Y + 26} ${x - 34} ${PAN_Y - 4}Z`} fill={metal} {...E} />
        <path d={`M${x - 26} ${PAN_Y + 6}Q${x} ${PAN_Y + 18} ${x + 26} ${PAN_Y + 6}`} fill="none" stroke={shade} strokeWidth={sw * 0.6} />
        <path d={circlePath(x, BEAM_Y + 6, 7)} fill={metal} stroke={C.edge} strokeWidth={sw * 0.7} />
      </g>
    );
  };
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d="M-70 0L-58 -22H58L70 0Z" fill={metal} {...E} />
      <path d={rrectPath(-34, -40, 68, 20, 4)} fill={shade} {...E} />
      <path d={rrectPath(-8, BEAM_Y, 16, -40 - BEAM_Y, 4)} fill={metal} {...E} />
      <path d={`M-${HANG_X + 8} ${BEAM_Y - 6}H${HANG_X + 8}`} stroke={C.edge} strokeWidth={14 + 2 * sw} strokeLinecap="round" />
      <path d={`M-${HANG_X + 8} ${BEAM_Y - 6}H${HANG_X + 8}`} stroke={metal} strokeWidth={14} strokeLinecap="round" />
      <path d={`M-${HANG_X} ${BEAM_Y - 9}H${HANG_X}`} stroke={mix(metal, C.paper, 0.5)} strokeWidth={3} strokeLinecap="round" />
      <path d={circlePath(0, BEAM_Y - 8, 16)} fill={metal} {...E} />
      <path d={circlePath(0, BEAM_Y - 34, 13)} fill={metal} {...E} />
      <path d={circlePath(-4, BEAM_Y - 38, 4)} fill={mix(metal, C.paper, 0.7)} />
      {pan(-1)}
      {pan(1)}
    </g>
  );
};
export const scalesQuad = (p: ScalesProps): Pt[] => propQuad(scalesPlace(p), {x: -132, y: -308, w: 264, h: 308});
/** World points at the centres of the two pans (left, right), for anything set in them. */
export const scalesPans = (p: ScalesProps): [Pt, Pt] => [propPoint(scalesPlace(p), {x: -HANG_X, y: PAN_Y - 4}), propPoint(scalesPlace(p), {x: HANG_X, y: PAN_Y - 4})];
export const scalesGraphic = (o: PropGraphicOpts<ScalesProps>): DecorGraphic => propGraphic(o, Scales, scalesQuad);
