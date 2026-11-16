// Tie: a long necktie under a shirt collar, the knot and blade swinging. Ported from the DOGEfather kit (K14, item 18).
import React from 'react';
import {rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propColours, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';

/** Natural size of the Tie: 132 wide at the collar (`size` = this width), from the collar top (y -50) to the tip (y 520). */
export const TIE_SIZE = {w: 132, h: 570};
const TIE_TIP = 520;
const BLADE = 'M-17 54L17 54L52 440L0 520L-52 440Z';
const KNOT = 'M-28 0L28 0Q30 0 29 4L19 52Q18 55 15 55L-15 55Q-18 55 -19 52L-29 4Q-30 0 -28 0Z';
const COLLAR = 'M-56 -50L56 -50L66 -40L54 14L24 4L-24 4L-54 14L-66 -40Z';
const COLLAR_FOLDS = 'M-6 -38L-26 2M-6 -38L-62 -41M6 -38L26 2M6 -38L62 -41';

export interface TieProps extends PropBase {
  /** Swing of the knot and blade about the anchor, degrees (positive clockwise). The collar stays put. */
  swing?: number;
}
const tiePlace = (p: TieProps) => place(p, TIE_SIZE.w);
/** The Tie. Anchor: the top centre of the knot. Natural size 132 x 570 (collar from y -50, knot y 0 to 55, blade to
 *  the tip at y 520). A long accent-coloured necktie with a darker knot and dimple, under a paper-coloured shirt
 *  collar whose two points sit either side of the knot top. */
export const Tie: React.FC<TieProps> = (p) => {
  const q = tiePlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const knotDark = mix(C.accent, C.ground, 0.2);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={`rotate(${f1(p.swing ?? 0)})`}>
        <path d={BLADE} fill={C.accent} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M0 90L0 500" fill="none" stroke={knotDark} strokeWidth={2} opacity={0.6} />
      </g>
      <path d={COLLAR} fill={C.paper} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <path d={COLLAR_FOLDS} fill="none" stroke={C.muted} strokeWidth={3} strokeLinecap="round" />
      <g transform={`rotate(${f1(p.swing ?? 0)})`}>
        <path d={KNOT} fill={knotDark} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
        <path d="M-9 44Q0 30 9 44" fill="none" stroke={mix(C.accent, C.ground, 0.45)} strokeWidth={3} strokeLinecap="round" />
      </g>
    </g>
  );
};
export const tieQuad = (p: TieProps): Pt[] => propQuad(tiePlace(p), {x: -66, y: -50, w: 132, h: 570});
/** World point of the tie's tip (where things drop from), following the swing. */
export const tieTip = (p: TieProps): Pt => propPoint(tiePlace(p), rot({x: 0, y: TIE_TIP}, p.swing ?? 0));
/** World point of the knot's centre (where a slip tucks behind it), following the swing. */
export const tieKnot = (p: TieProps): Pt => propPoint(tiePlace(p), rot({x: 0, y: 27}, p.swing ?? 0));
export const tieGraphic = (o: PropGraphicOpts<TieProps>): DecorGraphic => propGraphic(o, Tie, tieQuad);
