// Globe: a desk globe on a meridian holder that turns and shows lit points. Ported from the DOGEfather kit (K14,
// item 29).
import React from 'react';
import {clamp, rad, rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, f1, outline, place, polar, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

// A body-coloured sphere with muted meridians and parallels (orthographic, axis tilted 20 degrees and pitched so the
// north pole leans toward the viewer), held by a half-ring meridian holder on a stem and domed base. Anchor:
// bottom-centre of the base. Natural size about 310 x 380 (x -155..155, y -380..0). Sphere radius 130, centre
// (0, -220).
/** `size` is the 310 width. */
export const GLOBE_SIZE = {w: 310, h: 380};
export interface GlobeDot {lat: number; lon: number; lit: number}
export interface GlobeProps extends PropBase {
  /** Lit points (highlight) on the face; lit 0..1 is the dot's opacity. Points on the far side are not drawn. */
  dots?: GlobeDot[];
  /** Longitude at the centre of the face (default 0); turning it spins the globe. */
  turn?: number;
}
const GL_C: Pt = {x: 0, y: -220}, GL_R = 130, GL_TILT = 20, GL_PITCH = 14;
/** Design point and depth (z > 0 is the visible side) of a latitude/longitude on the globe. */
const glProj = (lat: number, lon: number, turn = 0) => {
  const f = rad(lat), l = rad(lon - turn);
  const x = Math.cos(f) * Math.sin(l), y = Math.sin(f), z = Math.cos(f) * Math.cos(l);
  const b = rad(GL_PITCH);
  const y2 = y * Math.cos(b) - z * Math.sin(b), z2 = z * Math.cos(b) + y * Math.sin(b);
  const s = rot({x, y: -y2}, GL_TILT);
  return {pt: {x: GL_C.x + GL_R * s.x, y: GL_C.y + GL_R * s.y}, z: z2};
};
const globePlace = (p: GlobeProps) => place(p, GLOBE_SIZE.w);
export const Globe: React.FC<GlobeProps> = (p) => {
  const q = globePlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const turn = p.turn ?? 0;
  let grid = '';
  const trace = (pts: {pt: Pt; z: number}[]) => {
    let pen = false;
    for (const v of pts) {
      if (v.z > 0.02) {grid += `${pen ? 'L' : 'M'}${f1(v.pt.x)} ${f1(v.pt.y)}`; pen = true;} else pen = false;
    }
  };
  for (let lon = 0; lon < 360; lon += 30) trace(Array.from({length: 37}, (_, k) => glProj(-90 + k * 5, lon + (turn % 30), 0)));
  for (const lat of [-60, -30, 0, 30, 60]) trace(Array.from({length: 61}, (_, k) => glProj(lat, k * 6, 0)));
  const top = polar(GL_R + 18, -90 + GL_TILT, GL_C), bot = polar(GL_R + 18, 90 + GL_TILT, GL_C);
  const ringR = GL_R + 18;
  const ring = `M${f1(top.x)} ${f1(top.y)}A${ringR} ${ringR} 0 0 1 ${f1(bot.x)} ${f1(bot.y)}`;
  const pinT = polar(GL_R * Math.cos(rad(GL_PITCH)), -90 + GL_TILT, GL_C), pinB = polar(GL_R * Math.cos(rad(GL_PITCH)), 90 + GL_TILT, GL_C);
  const stemTop = GL_C.y + ringR;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-9, stemTop - 6, 18, -30 - stemTop + 10, 3)} fill={C.muted} {...outline(q, C, 0.6)} />
      <path d="M-96 0C-96 -22 -46 -32 0 -32C46 -32 96 -22 96 0Z" fill={C.body} {...outline(q, C)} />
      <path d={circlePath(GL_C.x, GL_C.y, GL_R)} fill={C.body} {...outline(q, C)} />
      <path d={grid} fill="none" stroke={C.muted} strokeWidth={Math.max(2.5, sw * 0.4)} strokeLinejoin="round" strokeLinecap="round" />
      {(p.dots ?? []).map((d, k) => {
        const v = glProj(d.lat, d.lon, turn);
        if (v.z <= 0.05 || d.lit <= 0) return null;
        return <path key={k} d={circlePath(v.pt.x, v.pt.y, 8)} fill={C.highlight} stroke={C.ground} strokeWidth={2.5} opacity={clamp(d.lit)} />;
      })}
      <path d={`M${f1(top.x)} ${f1(top.y)}L${f1(pinT.x)} ${f1(pinT.y)}M${f1(bot.x)} ${f1(bot.y)}L${f1(pinB.x)} ${f1(pinB.y)}`} stroke={C.muted} strokeWidth={6} strokeLinecap="round" />
      <path d={ring} fill="none" stroke={C.paper} strokeWidth={12 + 2 * sw} strokeLinecap="round" />
      <path d={ring} fill="none" stroke={C.muted} strokeWidth={12} strokeLinecap="round" />
    </g>
  );
};
/** World point of a latitude/longitude on the globe's face, with visible = on the near side. */
export const globePoint = (p: GlobeProps, lat: number, lon: number): Pt & {visible: boolean} => {
  const v = glProj(lat, lon, p.turn ?? 0);
  return {...propPoint(globePlace(p), v.pt), visible: v.z > 0.05};
};
export const globeQuad = (p: GlobeProps): Pt[] => propQuad(globePlace(p), {x: -155, y: -380, w: 310, h: 380});
export const globeGraphic = (o: PropGraphicOpts<GlobeProps>): DecorGraphic => propGraphic(o, Globe, globeQuad);
