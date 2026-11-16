// FileDrawer: a filing cabinet whose top drawer slides out toward the viewer, showing manila folders. Ported from the
// DOGEfather kit (K14, item 35).
import React from 'react';
import {clamp, lerp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropColours, type PropGraphicOpts, f1, mix, place, polyD, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size of the cabinet: 360 x 460 (two drawers; the top one opens; `size` is the 360 width). Fully open, the
 *  drawer front reaches x -236 and y -166. */
export const FILE_DRAWER_SIZE = {w: 360, h: 460};
const OPEN = {x: -160, y: -440, w: 320, h: 200};
const drawerGeom = (e: number) => {
  const s = 1 + 0.1 * e;
  const cx = -60 * e, cy = -340 + 64 * e;
  return {s, cx, cy, x0: cx - 160 * s, x1: cx + 160 * s, y0: cy - 100 * s, y1: cy + 100 * s};
};
const DrawerFront: React.FC<{cx: number; cy: number; s: number; sw: number; C: PropColours}> = ({cx, cy, s, sw, C}) => (
  <>
    <path d={rrectPath(cx - 160 * s, cy - 100 * s, 320 * s, 200 * s, 8)} fill={C.body} stroke={C.paper} strokeWidth={sw} />
    <path d={rrectPath(cx - 40 * s, cy - 70 * s, 80 * s, 34 * s, 4)} fill={mix(C.body, C.ground, 0.3)} stroke={C.muted} strokeWidth={3} />
    <path d={rrectPath(cx - 32 * s, cy - 63 * s, 64 * s, 20 * s, 2)} fill={C.paper} />
    <path d={rrectPath(cx - 56 * s, cy + 6 * s, 112 * s, 20 * s, 10 * s)} fill={C.muted} stroke={C.paper} strokeWidth={sw * 0.6} />
  </>
);
export interface FileDrawerProps extends PropBase {
  /** 0 closed, 1 fully out toward the viewer. */
  extension?: number;
}
const drawerPlace = (p: FileDrawerProps) => place(p, FILE_DRAWER_SIZE.w);
/** Filing cabinet seen straight on; its top drawer slides out toward the viewer on runners. As it extends, its front
 *  moves down (64 px), left (60 px) and grows 10 percent, and the drawer shows its open top (dark, with four manila
 *  folders and staggered tabs emerging from the cabinet) and its right side with a telescoping runner, in simple
 *  oblique projection. Anchor: bottom-centre of the cabinet. */
export const FileDrawer: React.FC<FileDrawerProps> = (p) => {
  const q = drawerPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const manila = mix(C.paper, C.highlight, 0.22);
  const e = clamp(p.extension ?? 0);
  const g = drawerGeom(e);
  const folders: React.ReactNode[] = [];
  if (e > 0.02) {
    const fs = [0.78, 0.56, 0.34, 0.12];
    const tabs = [0.62, 0.12, 0.42, 0.2];
    fs.forEach((f, k) => {
      const u = f / e;
      if (u >= 0.98) return;
      const y = lerp(g.y0, OPEN.y, u);
      const xa = lerp(g.x0, OPEN.x, u) + 12, xb = lerp(g.x1, OPEN.x + OPEN.w, u) - 12;
      const su = lerp(g.s, 1, u);
      const hf = Math.min(30 * su, y - OPEN.y - 16);
      if (hf < 3) return;
      const w = xb - xa, tw = 0.22 * w, tx = xa + tabs[k] * w;
      folders.push(
        <path key={k} d={`M${f1(xa)} ${f1(y)}V${f1(y - hf)}H${f1(tx)}L${f1(tx + 6)} ${f1(y - hf - 12)}H${f1(tx + tw - 6)}L${f1(tx + tw)} ${f1(y - hf)}H${f1(xb)}V${f1(y)}Z`} fill={manila} stroke={mix(manila, C.ground, 0.5)} strokeWidth={2} strokeLinejoin="round" />,
      );
    });
  }
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-180, -460, 360, 460, 10)} fill={mix(C.body, C.ground, 0.15)} stroke={C.paper} strokeWidth={sw} />
      <DrawerFront cx={0} cy={-120} s={1} sw={sw} C={C} />
      {e > 0 && (
        <>
          <rect x={OPEN.x} y={OPEN.y} width={OPEN.w} height={OPEN.h} fill={C.ground} />
          {/* right side wall and runner */}
          <path d={polyD([{x: OPEN.x + OPEN.w, y: OPEN.y}, {x: g.x1, y: g.y0}, {x: g.x1, y: g.y1}, {x: OPEN.x + OPEN.w, y: OPEN.y + OPEN.h}])} fill={mix(C.body, C.ground, 0.35)} stroke={C.paper} strokeWidth={sw * 0.6} strokeLinejoin="round" />
          <path d={`M${OPEN.x + OPEN.w} ${OPEN.y + OPEN.h - 8}L${f1(lerp(OPEN.x + OPEN.w, g.x1, 0.6))} ${f1(lerp(OPEN.y + OPEN.h, g.y1, 0.6) - 8)}`} stroke={C.muted} strokeWidth={7} strokeLinecap="round" />
          <path d={`M${f1(lerp(OPEN.x + OPEN.w, g.x1, 0.3))} ${f1(lerp(OPEN.y + OPEN.h, g.y1, 0.3) - 18)}L${f1(g.x1)} ${f1(g.y1 - 18)}`} stroke={mix(C.muted, C.paper, 0.4)} strokeWidth={5} strokeLinecap="round" />
          {/* open top of the drawer */}
          <path d={polyD([{x: OPEN.x, y: OPEN.y}, {x: OPEN.x + OPEN.w, y: OPEN.y}, {x: g.x1, y: g.y0}, {x: g.x0, y: g.y0}])} fill={mix(C.ground, C.body, 0.35)} stroke={C.paper} strokeWidth={sw * 0.6} strokeLinejoin="round" />
          {folders}
        </>
      )}
      <DrawerFront cx={g.cx} cy={g.cy} s={g.s} sw={sw} C={C} />
    </g>
  );
};
export const fileDrawerQuad = (p: FileDrawerProps): Pt[] => propQuad(drawerPlace(p), {x: -240, y: -460, w: 420, h: 460});
/** World point where documents rise out of the open drawer (centre of its open top). */
export const drawerOpening = (p: FileDrawerProps): Pt => {
  const g = drawerGeom(clamp(p.extension ?? 0));
  return propPoint(drawerPlace(p), {x: g.cx / 2, y: (g.y0 + OPEN.y) / 2});
};
export const fileDrawerGraphic = (o: PropGraphicOpts<FileDrawerProps>): DecorGraphic => propGraphic(o, FileDrawer, fileDrawerQuad);
