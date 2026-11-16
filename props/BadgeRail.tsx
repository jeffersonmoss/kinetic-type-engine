// BadgeRail: a rail with ID badges clipped to it, each of which can unclip, drop and tilt. Ported from the DOGEfather
// kit (K14, item 24).
import React from 'react';
import {rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {BadgeArt} from './IdBadge';
import {type PropBase, type PropGraphicOpts, circlePath, f1, outline, place, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';

// Anchor: centre of the rail. Natural rail length 560 (plus end mounts, 600 overall); badges hang below to about
// y 182. Badge k hangs at x = (k - (count-1)/2) * spacing (spacing 170 for three).
/** `size` is the 600 overall width. */
export const BADGE_RAIL_SIZE = {w: 600, h: 204};
export interface BadgeRailProps extends PropBase {
  count?: number;
  /** Per badge, 0 clip closed on the rail, 1 open. */
  clips?: number[];
  /** Per badge, px it has fallen below its hanging position (the board animates the fall and the rise back). */
  drops?: number[];
  /** Per badge, degrees of tilt about its clip. */
  tilts?: number[];
}
const badgeSpacing = (n: number) => Math.min(170, 520 / Math.max(1, n));
const badgeX = (n: number, k: number) => (k - (n - 1) / 2) * badgeSpacing(n);
const railPlace = (p: BadgeRailProps) => place(p, BADGE_RAIL_SIZE.w);
export const BadgeRail: React.FC<BadgeRailProps> = (p) => {
  const q = railPlace(p);
  const C = propColours(p.colours);
  const n = p.count ?? 3;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-280, -9, 560, 18, 9)} fill={C.body} {...outline(q, C)} />
      <path d={circlePath(-284, 0, 15) + circlePath(284, 0, 15)} fill={C.muted} {...outline(q, C)} />
      {Array.from({length: n}, (_, k) => (
        <g key={k} transform={`translate(${f1(badgeX(n, k))} ${f1(p.drops?.[k] ?? 0)}) rotate(${f1(p.tilts?.[k] ?? 0)})`}>
          <BadgeArt q={q} clip={p.clips?.[k] ?? 0} C={C} />
        </g>
      ))}
    </g>
  );
};
/** World point where badge k clips onto the rail (its resting hang point). */
export const badgeHangPoint = (p: BadgeRailProps, k: number): Pt => propPoint(railPlace(p), {x: badgeX(p.count ?? 3, k), y: 0});
/** World centre of badge k's card, given its current drop and tilt. */
export const badgeCardCentre = (p: BadgeRailProps, k: number): Pt => {
  const c = rot({x: 0, y: 110}, p.tilts?.[k] ?? 0);
  return propPoint(railPlace(p), {x: badgeX(p.count ?? 3, k) + c.x, y: (p.drops?.[k] ?? 0) + c.y});
};
/** World quad of the rail with its badges hanging at rest (dropped badges fall outside it). */
export const badgeRailQuad = (p: BadgeRailProps): Pt[] => propQuad(railPlace(p), {x: -300, y: -18, w: 600, h: 204});
export const badgeRailGraphic = (o: PropGraphicOpts<BadgeRailProps>): DecorGraphic => propGraphic(o, BadgeRail, badgeRailQuad);
