// PillBottle: a prescription pill bottle with a child-proof cap and a plus label. Ported from the DOGEfather kit (K14,
// item 25). Its drawing is shared with CargoShip.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropColours, type PropGraphicOpts, type Placement, mix, outline, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

// Child-proof cap (ridged, with a band), amber body, neck ring, and a paper label carrying a dark plus and two text
// bars. Anchor: bottom-centre. Natural size 140 x 220 (x -70..70, y -220..0).
/** `size` is the 140 width. */
export const PILL_BOTTLE_SIZE = {w: 140, h: 220};
/** The bottle's drawing in design units. `q` is the placement its outlines are sized for. */
export const PillBottleArt: React.FC<{q: Placement; C: PropColours}> = ({q, C}) => {
  const sw = strokeOf(q);
  const amber = mix(C.accent, C.highlight, 0.45);
  let ridges = '';
  for (let x = -54; x <= 54; x += 12) ridges += `M${x} -213V-195`;
  return (
    <>
      <path d={rrectPath(-62, -170, 124, 170, 14)} fill={amber} {...outline(q, C)} />
      <path d={rrectPath(-50, -182, 100, 16, 3)} fill={mix(amber, C.ground, 0.2)} {...outline(q, C, 0.6)} />
      <path d={rrectPath(-66, -220, 132, 42, 8)} fill={C.paper} {...outline(q, C)} />
      <path d={ridges} stroke={C.muted} strokeWidth={4} strokeLinecap="round" />
      <path d="M-62 -188H62" stroke={C.muted} strokeWidth={sw * 0.5} />
      <path d={rrectPath(-52, -134, 104, 96, 6)} fill={C.paper} />
      <path d="M-7 -118H7V-104H21V-90H7V-76H-7V-90H-21V-104H-7Z" fill={C.ground} />
      <path d={rrectPath(-34, -64, 68, 7, 3) + rrectPath(-24, -51, 48, 6, 3)} fill={C.muted} />
    </>
  );
};
export type PillBottleProps = PropBase;
const bottlePlace = (p: PillBottleProps) => place(p, PILL_BOTTLE_SIZE.w);
export const PillBottle: React.FC<PillBottleProps> = (p) => {
  const q = bottlePlace(p);
  return <g transform={propTransform(q)} opacity={p.opacity ?? 1}><PillBottleArt q={q} C={propColours(p.colours)} /></g>;
};
export const pillBottleQuad = (p: PillBottleProps): Pt[] => propQuad(bottlePlace(p), {x: -70, y: -224, w: 140, h: 224});
export const pillBottleGraphic = (o: PropGraphicOpts<PillBottleProps>): DecorGraphic => propGraphic(o, PillBottle, pillBottleQuad);
