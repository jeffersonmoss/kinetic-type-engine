// Lanyard: a staff lanyard and badge for a standing adult pictogram Figure (Paper Trail storyboard items 61 and 157,
// the security staff). Figure.tsx has no lanyard option, so this is drawn over a Figure as a separate prop: give it the
// same x, y, size, pose and flip as the Figure. The cord runs from both sides of the neck down to a clip; the badge
// hangs plumb from the clip (so on a figure leaning forward it swings clear of the chest, as a real one does).
// Its geometry repeats the pictogram's standing proportions in Figure.tsx (BUILD and PICTO, adult); if those change,
// change the constants here.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propGraphic, propQuad, propTransform, rrectPath} from './common';
import {worldPx} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** The figure's standing height (150, the adult Figure's natural size): `size` is the figure's size. */
export const LANYARD_SIZE = {h: 150};
export interface LanyardProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** The Figure's pose: 'stand' (default) or 'reach' (torso 15 degrees forward). */
  pose?: 'stand' | 'reach';
  /** As the Figure's `flip`. */
  flip?: boolean;
  /** Cord colour (default the accent2 role, darkened). */
  cord?: string;
  /** Badge header colour (default the accent2 role). */
  band?: string;
}
const lanPlace = (p: LanyardProps) => place(p, LANYARD_SIZE.h);
// Adult pictogram proportions (Figure.tsx): thigh + shin 0.43, torso 0.31, leg width 0.078, all times H.
const H = 150, LEGS = 0.43 * H, LEG_W = 0.078 * H, TORSO = 0.31 * H;
const POSE = {stand: {torso: 180, th1: 6, th2: -6}, reach: {torso: 165, th1: 8, th2: -10}};
const dir = (deg: number): Pt => ({x: Math.sin((deg * Math.PI) / 180), y: Math.cos((deg * Math.PI) / 180)});
/** Neck, the sideways normal and the clip point in design units (flip not applied). */
const lanGeom = (pose: 'stand' | 'reach') => {
  const a = POSE[pose];
  const f1 = dir(a.th1), f2 = dir(a.th2);
  const pelvis = {x: -((f1.x + f2.x) * LEGS) / 2, y: -Math.max(f1.y, f2.y) * LEGS - LEG_W / 2};
  const d = dir(a.torso), n = {x: -d.y, y: d.x};
  const neck = {x: pelvis.x + d.x * TORSO, y: pelvis.y + d.y * TORSO};
  const at = (t: number, s: number): Pt => ({x: neck.x - d.x * t + n.x * s, y: neck.y - d.y * t + n.y * s});
  // the cord leaves the shoulder line 0.045 H either side of the neck, 0.012 H below it, and meets at a clip
  // 0.15 H below the neck, hanging plumb
  const cl = at(0.012 * H, 0.045 * H), cr = at(0.012 * H, -0.045 * H);
  const clip = {x: neck.x + (pose === 'reach' ? 0.03 * H : 0), y: neck.y + 0.15 * H};
  return {cl, cr, clip};
};
const BADGE = {w: 0.08 * H, h: 0.1 * H};
export const Lanyard: React.FC<LanyardProps> = (p) => {
  const q = lanPlace(p);
  const C = roleColours(p.colours);
  const {cl, cr, clip} = lanGeom(p.pose ?? 'stand');
  const cord = p.cord ?? mix(C.accent2, C.ground, 0.35);
  const cw = Math.max(worldPx(q, 2), 2.2);
  const bx = clip.x - BADGE.w / 2, by = clip.y + 2.2;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={p.flip ? 'scale(-1 1)' : undefined}>
        <path d={`M${cl.x.toFixed(2)} ${cl.y.toFixed(2)}L${clip.x.toFixed(2)} ${clip.y.toFixed(2)}L${cr.x.toFixed(2)} ${cr.y.toFixed(2)}`} fill="none" stroke={cord} strokeWidth={cw} strokeLinejoin="round" strokeLinecap="round" />
        <path d={rrectPath(clip.x - 1.6, clip.y - 1, 3.2, 4.4, 1)} fill={mix(C.muted, C.paper, 0.4)} />
        <path d={rrectPath(bx, by, BADGE.w, BADGE.h, 1.6)} fill={C.paper} stroke={C.edge} strokeWidth={Math.max(worldPx(q, 1.5), 1.2)} />
        <path d={rrectPath(bx, by, BADGE.w, BADGE.h * 0.3, 1.6)} fill={p.band ?? C.accent2} />
        <path d={rrectPath(bx + 1.8, by + BADGE.h * 0.4, BADGE.w * 0.36, BADGE.h * 0.44, 0.8)} fill={C.muted} />
        <path d={rrectPath(bx + BADGE.w * 0.54, by + BADGE.h * 0.45, BADGE.w * 0.34, 1.4, 0.7) + rrectPath(bx + BADGE.w * 0.54, by + BADGE.h * 0.62, BADGE.w * 0.26, 1.4, 0.7)} fill={C.ground} />
      </g>
    </g>
  );
};
export const lanyardQuad = (p: LanyardProps): Pt[] => {
  const {cl, cr, clip} = lanGeom(p.pose ?? 'stand');
  const x0 = Math.min(cl.x, cr.x, clip.x - BADGE.w / 2) - 2, x1 = Math.max(cl.x, cr.x, clip.x + BADGE.w / 2) + 2;
  const y0 = Math.min(cl.y, cr.y) - 2, y1 = clip.y + BADGE.h + 6;
  return propQuad(lanPlace(p), p.flip ? {x: -x1, y: y0, w: x1 - x0, h: y1 - y0} : {x: x0, y: y0, w: x1 - x0, h: y1 - y0});
};
export const lanyardGraphic = (o: PropGraphicOpts<LanyardProps>): DecorGraphic => propGraphic(o, Lanyard, lanyardQuad);
