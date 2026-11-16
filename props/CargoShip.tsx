// CargoShip: a cargo ship carrying a grain sack and a pill bottle, with a gentle roll. Ported from the DOGEfather kit
// (K14, item 25). Float it on a WaveLine with waveY.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {GrainSackArt} from './GrainSack';
import {PillBottleArt} from './PillBottle';
import {type PropBase, type PropGraphicOpts, circlePath, f1, outline, place, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

// Body-coloured hull with an accent bottom below the waterline, paper superstructure and bridge at the stern (left),
// funnel, foremast at the bow (right, so it sails left to right), a tied grain Sack and a pill Bottle on deck. Anchor:
// the waterline centre. Natural size about 524 x 232 (x -260..264, y -200..32).
/** `size` is the 524 width. */
export const CARGO_SHIP_SIZE = {w: 524, h: 232};
export interface CargoShipProps extends PropBase {
  /** Gentle roll in degrees about the anchor (added to angle). */
  rock?: number;
}
const SHIP_SACK = {x: -40, scale: 0.85}, SHIP_BOTTLE = {x: 96, scale: 0.55}, SHIP_DECK = -46;
const shipPlace = (p: CargoShipProps) => place(p, CARGO_SHIP_SIZE.w);
const rolled = (p: CargoShipProps) => { const q = shipPlace(p); return {...q, angle: (p.angle ?? 0) + (p.rock ?? 0)}; };
export const CargoShip: React.FC<CargoShipProps> = (p) => {
  const q = shipPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const hull = 'M-248 -46L190 -46Q236 -48 262 -62C250 -20 228 20 196 30L-226 30Q-244 30 -246 10Z';
  let windows = '';
  for (let k = 0; k < 4; k++) windows += rrectPath(-228 + k * 17, -128, 11, 14, 2);
  for (let k = 0; k < 4; k++) windows += rrectPath(-228 + k * 17, -98, 11, 12, 2);
  const inner = (s: number) => ({x: 0, y: 0, scale: (q.scale ?? 1) * s, hero: p.hero});
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={`rotate(${f1(p.rock ?? 0)})`}>
        <path d="M236 -60V-122M222 -108H250" stroke={C.paper} strokeWidth={Math.max(4, sw * 0.6)} strokeLinecap="round" />
        <path d="M-220 -154L-216 -196H-188L-184 -154Z" fill={C.body} {...outline(q, C)} />
        <path d="M-217.5 -188H-186.5" stroke={C.accent} strokeWidth={9} />
        <path d={rrectPath(-238, -142, 78, 98, 4)} fill={C.paper} {...outline(q, C)} />
        <path d={rrectPath(-248, -158, 98, 18, 4)} fill={C.paper} {...outline(q, C)} />
        <path d={windows + rrectPath(-240, -154, 82, 8, 2)} fill={C.ground} />
        <path d={hull} fill={C.body} />
        <path d="M-246 0L234 0C230 12 220 24 196 30L-226 30Q-244 30 -246 10Z" fill={C.accent} />
        <path d="M-246 0H234" stroke={C.paper} strokeWidth={sw * 0.5} />
        <path d={hull} fill="none" {...outline(q, C)} />
        <path d={circlePath(224, -34, 6)} fill={C.ground} />
        <g transform={`translate(${SHIP_SACK.x} ${SHIP_DECK}) scale(${SHIP_SACK.scale})`}>
          <GrainSackArt q={inner(SHIP_SACK.scale)} C={C} />
        </g>
        <g transform={`translate(${SHIP_BOTTLE.x} ${SHIP_DECK}) scale(${SHIP_BOTTLE.scale})`}>
          <PillBottleArt q={inner(SHIP_BOTTLE.scale)} C={C} />
        </g>
      </g>
    </g>
  );
};
export const cargoShipQuad = (p: CargoShipProps): Pt[] => propQuad(rolled(p), {x: -260, y: -200, w: 524, h: 232});
/** World bottom-centre of the Sack and the Bottle on deck (follows rock). */
export const cargoShipSack = (p: CargoShipProps): Pt => propPoint(rolled(p), {x: SHIP_SACK.x, y: SHIP_DECK});
export const cargoShipBottle = (p: CargoShipProps): Pt => propPoint(rolled(p), {x: SHIP_BOTTLE.x, y: SHIP_DECK});
export const cargoShipGraphic = (o: PropGraphicOpts<CargoShipProps>): DecorGraphic => propGraphic(o, CargoShip, cargoShipQuad);
