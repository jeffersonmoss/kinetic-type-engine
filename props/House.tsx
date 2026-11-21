// House: a small house, front elevation (Paper Trail storyboard items 61 and 145): a pitched roof with a chimney, a
// door with a knob and step, and one window with a cross bar that is lit (`lit`). Nobody in it or near it.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {outlineFor} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 244 wide at the eaves (x -122 to 122), 236 tall to the ridge (y -236 to 0). Anchor: the bottom
 *  centre, on the ground. `size` is the 244 width. */
export const HOUSE_SIZE = {w: 244};
export interface HouseProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** 0 to 1: the window lit (default 1). */
  lit?: number;
}
const housePlace = (p: HouseProps) => place(p, HOUSE_SIZE.w);
export const House: React.FC<HouseProps> = (p) => {
  const q = housePlace(p);
  const sw = outlineFor(q, HOUSE_SIZE.w, 0.022);
  const C = roleColours(p.colours);
  const walls = mix(C.paper, C.muted, 0.3), roof = mix(C.body, C.ground, 0.4), door = C.body;
  const lit = clamp(p.lit ?? 1);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(48, -222, 26, 60, 2)} fill={roof} {...E} />
      <path d={rrectPath(-100, -142, 200, 142, 2)} fill={walls} {...E} />
      <path d="M-122 -136L0 -236L122 -136Z" fill={roof} {...E} />
      <path d="M-96 -150L0 -222L96 -150" fill="none" stroke={mix(roof, C.paper, 0.18)} strokeWidth={sw * 0.6} />
      <path d={rrectPath(-74, -92, 46, 92, 4)} fill={door} {...E} />
      <circle cx={-38} cy={-46} r={4} fill={C.edge} />
      <path d={rrectPath(-82, -6, 62, 6, 2)} fill={mix(walls, C.ground, 0.25)} />
      <path d={rrectPath(8, -106, 66, 56, 3)} fill={mix(mix(C.ground, C.wall, 0.5), C.highlight, lit)} {...E} />
      <path d="M41 -106V-50M8 -78H74" stroke={C.edge} strokeWidth={sw * 0.8} />
      <path d={rrectPath(2, -50, 78, 7, 2)} fill={mix(walls, C.ground, 0.2)} stroke={C.edge} strokeWidth={sw * 0.5} />
    </g>
  );
};
export const houseQuad = (p: HouseProps): Pt[] => propQuad(housePlace(p), {x: -124, y: -238, w: 248, h: 238});
/** World point at the bottom centre of the door (a strip runs down to it). */
export const houseDoor = (p: HouseProps): Pt => propPoint(housePlace(p), {x: -51, y: 0});
export const houseGraphic = (o: PropGraphicOpts<HouseProps>): DecorGraphic => propGraphic(o, House, houseQuad);
