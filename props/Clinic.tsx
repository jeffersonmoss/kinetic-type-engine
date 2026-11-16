// Clinic: a small house with a pitched roof, a plus-shaped window that lights and frost that grows. Ported from the
// DOGEfather kit (K14, item 26).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, f1, mix, place, propColours, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';

// Anchor: bottom-centre. Natural size about 236 x 218 (x -118..118, y -218..0).
/** `size` is the 236 width. */
export const CLINIC_SIZE = {w: 236, h: 218};
export interface ClinicProps extends PropBase {
  /** Window 0 dark to 1 lit (paper). */
  lit?: number;
  /** 0..1: the house tints accent2 and icicles grow along the eaves (up to 30 px). */
  frost?: number;
}
const CLINIC_EAVE = -122;
const clinicPlace = (p: ClinicProps) => place(p, CLINIC_SIZE.w);
export const Clinic: React.FC<ClinicProps> = (p) => {
  const q = clinicPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const fr = clamp(p.frost ?? 0), lit = clamp(p.lit ?? 0);
  const ol = {stroke: mix(C.paper, C.accent2, 0.35 * fr), strokeWidth: sw, strokeLinejoin: 'round' as const};
  const wall = mix(C.body, C.accent2, 0.45 * fr);
  const roof = mix(mix(C.body, C.muted, 0.35), C.accent2, 0.55 * fr);
  let ice = '';
  if (fr > 0.01) {
    const lens = [0.7, 1, 0.55, 0.85, 0.65, 1, 0.6, 0.9, 0.75, 0.5];
    for (let k = 0; k < 10; k++) {
      const x = -104 + k * 23.1, L = 30 * fr * lens[k];
      ice += `M${f1(x - 6)} ${CLINIC_EAVE}L${f1(x + 6)} ${CLINIC_EAVE}L${f1(x + 0.5)} ${f1(CLINIC_EAVE + 3 + L)}Z`;
    }
  }
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d="M-90 0V-126H90V0Z" fill={wall} {...ol} />
      <path d={`M-118 ${CLINIC_EAVE}L0 -218L118 ${CLINIC_EAVE}Z`} fill={roof} {...ol} />
      {fr > 0.01 && <path d={`M-114 ${CLINIC_EAVE - 4}L0 -212L114 ${CLINIC_EAVE - 4}`} fill="none" stroke={mix(C.paper, C.accent2, 0.25)} strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" opacity={fr} />}
      {ice && <path d={ice} fill={mix(C.paper, C.accent2, 0.45)} />}
      <path d="M-46 -100H-26V-80H-6V-60H-26V-40H-46V-60H-66V-80H-46Z" fill={mix(C.ground, C.paper, lit)} {...ol} strokeWidth={sw * 0.6} />
      <path d="M26 0V-86H66V0Z" fill={C.ground} {...ol} />
      <path d={circlePath(57, -42, 4)} fill={C.muted} />
    </g>
  );
};
/** World point at the foot of the door, where a Figure stands. */
export const clinicDoor = (p: ClinicProps): Pt => propPoint(clinicPlace(p), {x: 46, y: 0});
/** World outline of the house (convex: wall feet, eaves, ridge), for convergence and overlap tests. */
export const clinicWalls = (p: ClinicProps): Pt[] => { const q = clinicPlace(p); return [{x: -90, y: 0}, {x: -118, y: CLINIC_EAVE}, {x: 0, y: -218}, {x: 118, y: CLINIC_EAVE}, {x: 90, y: 0}].map((v) => propPoint(q, v)); };
export const clinicQuad = (p: ClinicProps): Pt[] => propQuad(clinicPlace(p), {x: -118, y: -218, w: 236, h: 218});
/** A Clinic as a board graphic; its box is the house outline (clinicWalls), which is tighter than the quad. */
export const clinicGraphic = (o: PropGraphicOpts<ClinicProps>): DecorGraphic => propGraphic(o, Clinic, clinicWalls);
