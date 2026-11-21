// SecurityCamera: a bullet security camera on a wall bracket (Paper Trail storyboard items 57, 190 and 193): a wall
// plate, an arm to a ball joint, the cylindrical body hanging under the joint with a sun hood over its top that runs
// past the lens, the dark lens with a glint, and a REC light under the hood. It is mounted on a wall to its right and
// looks left and down (`aim` degrees below horizontal; `flip` mounts it on a left wall looking right). `ghost` draws it
// as a dashed "not there" outline that `draw` draws on and `solid` fills in (the camera that is not there, then is).
// `cone` adds a light view cone from the lens, drawn under the camera; securityCameraCone() gives the same polygon so a
// board can draw the cone under everything else on the board.
import React from 'react';
import {clamp, rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, polyD, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {neverRealDash, outlineFor, polyLength, worldPx} from './drawingHelpers';
import {partialDash, rrectPerimeter, type RoleColours, roleColours} from './roles';

/** Natural size: 260 from the wall plate to the tip of the hood at aim 0 (x -260 to 10), about 120 tall. Anchor: the
 *  centre of the wall plate. `size` is that 260 length. */
export const SECURITY_CAMERA_SIZE = {w: 260};
const PLATE = {x: -8, y: -46, w: 18, h: 92};
const JOINT = {x: -72, y: 22};
// body frame: origin at the joint, the camera looks toward -x
const BODY = {x: -184, y: 18, w: 172, h: 56};
const HOOD: Pt[] = [{x: -214, y: 10}, {x: -40, y: 2}, {x: -36, y: 12}, {x: -196, y: 20}, {x: -214, y: 24}];
const STEM = {x: -52, y: -2, w: 22, h: 24};
const LENS = {x: -186, y: 46};
const REC = {x: -158, y: 62};

export interface SecurityCameraCone {
  /** Degrees below horizontal (default the camera's `aim`). */
  aim?: number;
  /** Full angle of the cone, degrees (default 34). */
  spread?: number;
  /** Length from the lens, design units (default 620). */
  length?: number;
}
export interface SecurityCameraProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Degrees below horizontal the camera looks (default 25). The body swivels on its ball joint. */
  aim?: number;
  /** Mount on a left wall, looking right. */
  flip?: boolean;
  /** The red REC light: 0 off, 1 on. */
  rec?: number;
  /** Dashed outline only ("not there"). */
  ghost?: boolean;
  /** Ghost only: 0 to 1, the dashed outline draws on. Default 1. */
  draw?: number;
  /** Ghost only: 0 to 1, the fills fade in over the dashes (at 1 it is the real camera; a board then drops `ghost`). */
  solid?: number;
  /** Dash colour (default the muted role). */
  ghostColour?: string;
  /** The view cone, drawn under the camera. */
  cone?: SecurityCameraCone;
  /** Cone colour (default the wall role mixed a little toward paper) and opacity (default 0.6). */
  coneColour?: string;
  coneOpacity?: number;
  /** Body colour (default paper). */
  tone?: string;
}
const camPlace = (p: SecurityCameraProps) => place(p, SECURITY_CAMERA_SIZE.w);
const aimOf = (p: SecurityCameraProps) => p.aim ?? 25;
/** A body-frame point (looking toward -x from the joint) in design space, turned by the aim. */
const bodyPt = (p: SecurityCameraProps, v: Pt): Pt => { const r = rot(v, -aimOf(p)); return {x: JOINT.x + r.x, y: JOINT.y + r.y}; };
const mirror = (p: SecurityCameraProps, v: Pt): Pt => (p.flip ? {x: -v.x, y: v.y} : v);
/** Cone polygon in design space (flip applied). */
const conePts = (p: SecurityCameraProps): Pt[] => {
  const c = p.cone ?? {};
  const aim = c.aim ?? aimOf(p), spread = c.spread ?? 34, L = c.length ?? 620;
  const apex = bodyPt(p, {x: LENS.x - 4, y: LENS.y});
  const pts: Pt[] = [apex];
  for (let k = 0; k <= 12; k++) {
    const a = 180 - aim - spread / 2 + (spread * k) / 12; // 180 looks left; with y down, 180 - aim looks left and down
    const r = (a * Math.PI) / 180;
    pts.push({x: apex.x + L * Math.cos(r), y: apex.y + L * Math.sin(r)});
  }
  return pts.map((v) => mirror(p, v));
};

/** A bullet security camera. Anchor: the centre of its wall plate. */
export const SecurityCamera: React.FC<SecurityCameraProps> = (p) => {
  const q = camPlace(p);
  const sw = outlineFor(q, SECURITY_CAMERA_SIZE.w, 0.025);
  const C = roleColours(p.colours);
  const tone = p.tone ?? C.paper;
  const metal = mix(C.muted, C.paper, 0.3);
  const aim = aimOf(p);
  const rec = clamp(p.rec ?? 0);
  const ghost = !!p.ghost;
  const draw = clamp(p.draw ?? 1), solid = ghost ? clamp(p.solid ?? 0) : 1;
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const armD = `M${PLATE.x + 4} -6Q${(PLATE.x + JOINT.x) / 2} -14 ${JOINT.x} ${JOINT.y}`;
  const armLen = 80;
  // ghost dashes, each part drawn on by its own length
  const dash = neverRealDash(q);
  const [on, off] = dash.split(' ').map(Number);
  const G = (L: number) => ({fill: 'none', stroke: p.ghostColour ?? C.muted, strokeWidth: Math.max(sw, worldPx(q, 3)), strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const, strokeDasharray: partialDash(L, draw, on, off)});
  const fills = (
    <g opacity={solid}>
      <path d={rrectPath(PLATE.x, PLATE.y, PLATE.w, PLATE.h, 5)} fill={metal} {...E} />
      <circle cx={PLATE.x + 9} cy={-30} r={3.5} fill={C.edge} /><circle cx={PLATE.x + 9} cy={30} r={3.5} fill={C.edge} />
      <path d={armD} fill="none" stroke={C.edge} strokeWidth={14 + 2 * sw} strokeLinecap="round" />
      <path d={armD} fill="none" stroke={metal} strokeWidth={14} strokeLinecap="round" />
      <g transform={`translate(${JOINT.x} ${JOINT.y}) rotate(${-aim})`}>
        <path d={rrectPath(STEM.x, STEM.y, STEM.w, STEM.h, 4)} fill={metal} {...E} />
        <path d={`M${BODY.x + 20} ${BODY.y}H${BODY.x + BODY.w - 26}Q${BODY.x + BODY.w} ${BODY.y} ${BODY.x + BODY.w} ${BODY.y + BODY.h / 2}Q${BODY.x + BODY.w} ${BODY.y + BODY.h} ${BODY.x + BODY.w - 26} ${BODY.y + BODY.h}H${BODY.x + 20}Q${BODY.x + 12} ${BODY.y + BODY.h} ${BODY.x + 12} ${BODY.y + BODY.h / 2}Q${BODY.x + 12} ${BODY.y} ${BODY.x + 20} ${BODY.y}Z`} fill={tone} {...E} />
        <path d={`M${BODY.x + 46} ${BODY.y + 6}V${BODY.y + BODY.h - 6}`} stroke={mix(tone, C.ground, 0.25)} strokeWidth={worldPx(q, 2.5)} />
        <path d={`M${BODY.x + 60} ${BODY.y + 14}H${BODY.x + BODY.w - 30}`} stroke={mix(tone, C.paper, 0.6)} strokeWidth={worldPx(q, 3)} strokeLinecap="round" />
        {/* lens: the front face of the body seen a little from the side, dark glass with a glint */}
        <ellipse cx={LENS.x} cy={LENS.y} rx={9} ry={24} fill={C.ground} {...E} />
        <path d={`M${LENS.x - 3} ${LENS.y - 22}Q${LENS.x - 6} ${LENS.y - 12} ${LENS.x - 4} ${LENS.y - 2}`} fill="none" stroke={C.paper} strokeWidth={worldPx(q, 2.5)} strokeLinecap="round" opacity={0.75} />
        {/* the REC light */}
        {rec > 0 && <circle cx={REC.x} cy={REC.y} r={11} fill={C.accent} opacity={0.3 * rec} />}
        <circle cx={REC.x} cy={REC.y} r={5.5} fill={mix(mix(C.accent, C.ground, 0.6), C.accent, rec)} stroke={C.edge} strokeWidth={worldPx(q, 1.4)} />
        <path d={polyD(HOOD)} fill={mix(tone, C.muted, 0.18)} {...E} />
      </g>
    </g>
  );
  const bodyL = rrectPerimeter(BODY.w - 12, BODY.h, 26);
  const ghostLines = ghost ? (
    <g>
      <path d={rrectPath(PLATE.x, PLATE.y, PLATE.w, PLATE.h, 5)} {...G(rrectPerimeter(PLATE.w, PLATE.h, 5))} />
      <path d={armD} {...G(armLen)} />
      <g transform={`translate(${JOINT.x} ${JOINT.y}) rotate(${-aim})`}>
        <path d={rrectPath(BODY.x + 12, BODY.y, BODY.w - 12, BODY.h, 26)} {...G(bodyL)} />
        <path d={polyD(HOOD)} {...G(polyLength(HOOD))} />
        <path d={rrectPath(STEM.x, STEM.y, STEM.w, STEM.h, 4)} {...G(rrectPerimeter(STEM.w, STEM.h, 4))} />
      </g>
    </g>
  ) : null;
  return (
    <g opacity={p.opacity ?? 1}>
      {p.cone && <path d={polyD(conePts(p).map((v) => propPoint(q, v)))} fill={p.coneColour ?? mix(C.wall, C.paper, 0.12)} opacity={p.coneOpacity ?? 0.6} />}
      <g transform={propTransform(q)}>
        <g transform={p.flip ? 'scale(-1 1)' : undefined}>
          {solid > 0 && fills}
          {ghostLines}
        </g>
      </g>
    </g>
  );
};
/** World polygon of the view cone (draw it under everything on the board, or rely on the prop's own). */
export const securityCameraCone = (p: SecurityCameraProps): Pt[] => conePts(p).map((v) => propPoint(camPlace(p), v));
/** World point at the lens (where a listening trace ends). */
export const securityCameraLens = (p: SecurityCameraProps): Pt => propPoint(camPlace(p), mirror(p, bodyPt(p, {x: LENS.x - 4, y: LENS.y})));
/** World point at the REC light. */
export const securityCameraRec = (p: SecurityCameraProps): Pt => propPoint(camPlace(p), mirror(p, bodyPt(p, {x: REC.x, y: REC.y})));
/** World quad of the camera (plate, arm and body at the current aim; not the cone). */
export const securityCameraQuad = (p: SecurityCameraProps): Pt[] => {
  const pts = [{x: PLATE.x, y: PLATE.y}, {x: PLATE.x + PLATE.w, y: PLATE.y + PLATE.h}, ...[...HOOD, {x: BODY.x, y: BODY.y + BODY.h}, {x: BODY.x + BODY.w, y: BODY.y + BODY.h}, {x: STEM.x, y: STEM.y}].map((v) => bodyPt(p, v))].map((v) => mirror(p, v));
  const xs = pts.map((v) => v.x), ys = pts.map((v) => v.y);
  const x0 = Math.min(...xs) - 6, y0 = Math.min(...ys) - 6;
  return propQuad(camPlace(p), {x: x0, y: y0, w: Math.max(...xs) + 6 - x0, h: Math.max(...ys) + 6 - y0});
};
export const securityCameraGraphic = (o: PropGraphicOpts<SecurityCameraProps>): DecorGraphic => propGraphic(o, SecurityCamera, securityCameraQuad);
