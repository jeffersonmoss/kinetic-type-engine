// IdBadge: an ID badge on a clip, with a blank photo square and text bars. Ported from the DOGEfather kit (K14,
// item 24). Its drawing is shared with BadgeRail.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropColours, type PropGraphicOpts, type Placement, circlePath, f1, outline, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

// Anchor: the clip's grip point (where it closes on a rail). It hangs down from there: clip, short strap, portrait
// paper card with a blank photo square (muted head-and-shoulders silhouette), two text bars, a stripe. Natural size
// 100 x 200 (x -50..50, y -18..182).
/** `size` is the 100 width. */
export const ID_BADGE_SIZE = {w: 100, h: 200};
export interface IdBadgeProps extends PropBase {
  /** Clip 0 closed, 1 open (the upper jaw swings up off the rail). */
  clip?: number;
}
/** The badge's drawing in design units (shared with BadgeRail). `q` is the placement its outlines are sized for. */
export const BadgeArt: React.FC<{q: Placement; clip: number; C: PropColours}> = ({q, clip, C}) => {
  const sw = strokeOf(q);
  const o = clamp(clip);
  return (
    <>
      <path d={rrectPath(-50, 40, 100, 140, 10)} fill={C.paper} {...outline(q, C)} />
      <path d={rrectPath(-12, 48, 24, 9, 4)} fill={C.ground} />
      <path d={rrectPath(-5, 12, 10, 42, 2)} fill={C.muted} stroke={C.paper} strokeWidth={sw * 0.35} />
      <path d={rrectPath(-27, 66, 54, 62, 3)} fill={C.body} />
      <path d={circlePath(0, 88, 12) + 'M-21 128C-21 110 -10 104 0 104C10 104 21 110 21 128Z'} fill={C.muted} />
      <path d={rrectPath(-36, 138, 72, 8, 3) + rrectPath(-26, 152, 52, 6, 3)} fill={C.ground} />
      <path d={rrectPath(-40, 165, 80, 8, 3)} fill={C.accent2} />
      {/* clip: lower jaw fixed to the strap, upper jaw hinged at its right end */}
      <path d={rrectPath(-16, 2, 32, 14, 4)} fill={C.muted} {...outline(q, C, 0.55)} />
      <g transform={`rotate(${f1(-38 * o)} 16 0)`}>
        <path d={rrectPath(-16, -16, 32, 14, 4)} fill={C.muted} {...outline(q, C, 0.55)} />
      </g>
      <path d={circlePath(16, 0, 4.5)} fill={C.body} {...outline(q, C, 0.35)} />
    </>
  );
};
const badgePlace = (p: IdBadgeProps) => place(p, ID_BADGE_SIZE.w);
export const IdBadge: React.FC<IdBadgeProps> = (p) => {
  const q = badgePlace(p);
  return <g transform={propTransform(q)} opacity={p.opacity ?? 1}><BadgeArt q={q} clip={p.clip ?? 0} C={propColours(p.colours)} /></g>;
};
export const idBadgeQuad = (p: IdBadgeProps): Pt[] => propQuad(badgePlace(p), {x: -50, y: -18, w: 100, h: 200});
export const idBadgeGraphic = (o: PropGraphicOpts<IdBadgeProps>): DecorGraphic => propGraphic(o, IdBadge, idBadgeQuad);
