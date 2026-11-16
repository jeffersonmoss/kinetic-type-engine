// Chipper: a towable wood chipper with a turning drum and a shaking body. Hero prop. Ported from the DOGEfather kit
// (K14, item 28). Pair it with ChipSpray at chipperChuteExit.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, Tube, arcD, circlePath, f1, mix, outline, place, polar, polyD, propColours, propGraphic, propPoint, propQuad, propTransform, rectAt, rrectPath, strokeOf} from './common';

// Anchor: bottom-centre, on the ground line under the wheel base. Natural size about 735 x 540 (x -370..365,
// y -540..0). Feed hopper on the LEFT, its mouth opening up-left; drum housing in the middle; curved discharge chute
// rising and turning to throw up and to the right; tow tongue and hitch on the right, with a jack.
/** `size` is the 735 width. */
export const CHIPPER_SIZE = {w: 735, h: 540};
export interface ChipperProps extends PropBase {
  /** Drum rotation in degrees (the knife slots and the one accent knife on the drum face turn by this). */
  drum?: number;
  /** Board-driven jitter in px: the body (not the wheel) is offset by (shake, -0.4 shake). */
  shake?: number;
}
const CH_T: Pt = {x: -270, y: -392}, CH_B: Pt = {x: -336, y: -196};
const CH_H1: Pt = {x: -100, y: -300}, CH_H2: Pt = {x: -100, y: -180};
const CH_MOUTH: Pt = {x: (CH_T.x + CH_B.x) / 2, y: (CH_T.y + CH_B.y) / 2};
const CH_DRUM: Pt = {x: 0, y: -240};
const CH_CHUTE = {s: {x: 10, y: -330}, c1: {x: 10, y: -430}, c2: {x: 118, y: -460}, e: {x: 175, y: -500}};
const chTan = (() => {const dx = CH_CHUTE.e.x - CH_CHUTE.c2.x, dy = CH_CHUTE.e.y - CH_CHUTE.c2.y, L = Math.hypot(dx, dy); return {x: dx / L, y: dy / L};})();
const chShake = (p: ChipperProps): Pt => ({x: p.shake ?? 0, y: -0.4 * (p.shake ?? 0)});
const chipperPlace = (p: ChipperProps) => place(p, CHIPPER_SIZE.w);

export const Chipper: React.FC<ChipperProps> = (p) => {
  const q = chipperPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const ol = (k = 1) => outline(q, C, k);
  const sh = chShake(p);
  const t = chTan, n = {x: t.y, y: -t.x}; // n: the chute's outer (upper) side
  const E = CH_CHUTE.e;
  const at = (a: number, b: number): Pt => ({x: E.x + t.x * a + n.x * b, y: E.y + t.y * a + n.y * b});
  const chuteD = `M${CH_CHUTE.s.x} ${CH_CHUTE.s.y}C${CH_CHUTE.c1.x} ${CH_CHUTE.c1.y} ${CH_CHUTE.c2.x} ${CH_CHUTE.c2.y} ${E.x} ${E.y}`;
  const mouthLen = Math.hypot(CH_B.x - CH_T.x, CH_B.y - CH_T.y);
  const mouthDeg = (Math.atan2(CH_B.y - CH_T.y, CH_B.x - CH_T.x) * 180) / Math.PI;
  const tanDeg = (Math.atan2(t.y, t.x) * 180) / Math.PI;
  let bolts = '';
  for (let k = 0; k < 8; k++) {const b = polar(100, k * 45 + 22.5, CH_DRUM); bolts += circlePath(b.x, b.y, 4);}
  let slots = '';
  for (let k = 1; k < 3; k++) slots += rectAt(polar(48, k * 120 - 90), 44, 12, k * 120 - 90);
  const wheel = {x: -20, y: -62};
  let lugs = '';
  for (let k = 0; k < 5; k++) {const b = polar(20, k * 72 - 90, wheel); lugs += circlePath(b.x, b.y, 3.5);}
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={`translate(${f1(sh.x)} ${f1(sh.y)})`}>
        {/* frame, tongue, hitch and jack */}
        <path d="M232 -108L342 -84L342 -68L232 -90Z" fill={C.body} {...ol()} />
        <path d={rrectPath(-244, -112, 494, 24, 6)} fill={C.body} {...ol()} />
        <path d={rrectPath(-250, -186, 16, 82, 4)} fill={C.body} {...ol()} />
        <path d={rrectPath(336, -90, 28, 26, 10)} fill={C.muted} {...ol()} />
        <path d={rrectPath(283, -98, 14, 72, 3)} fill={C.muted} {...ol(0.6)} />
        <path d={rrectPath(272, -28, 36, 10, 3)} fill={C.muted} {...ol(0.6)} />
        {/* feed hopper: flaring trapezoid from the drum housing to a wide mouth, accent stop bar along its top */}
        <path d={polyD([CH_T, CH_H1, CH_H2, CH_B])} fill={C.body} {...ol()} />
        <Tube d="M-286 -408L-184 -362" w={14} fill={C.accent} sw={sw * 0.7} edge={C.paper} cap="round" />
        <ellipse cx={CH_MOUTH.x} cy={CH_MOUTH.y} rx={mouthLen / 2} ry={34} transform={`rotate(${f1(mouthDeg)} ${f1(CH_MOUTH.x)} ${f1(CH_MOUTH.y)})`} fill={C.ground} {...ol()} />
        {/* engine box (accent cover) with vents and exhaust stack */}
        <path d={rrectPath(203, -276, 14, 40, 3)} fill={C.ground} {...ol(0.6)} />
        <path d={rrectPath(120, -240, 120, 130, 12)} fill={C.accent} {...ol()} />
        <path d="M140 -210H220M140 -192H220M140 -174H220" stroke={C.ground} strokeWidth={7} strokeLinecap="round" />
        {/* discharge chute: a tube rising from the housing top and turning up-right, hood and dark exit */}
        <Tube d={chuteD} w={56} fill={C.body} sw={sw} edge={C.paper} />
        <path d={polyD([at(-6, 33), at(30, 33), at(38, 20), at(-6, 20)])} fill={C.body} {...ol(0.8)} />
        <ellipse cx={E.x} cy={E.y} rx={9} ry={25} transform={`rotate(${f1(tanDeg)} ${E.x} ${E.y})`} fill={C.ground} {...ol(0.5)} />
        {/* drum housing: disc, darker drum face with knife slots turning by `drum`, one accent knife, hub */}
        <path d={rrectPath(-80, -142, 160, 34, 6)} fill={C.body} {...ol()} />
        <path d={circlePath(CH_DRUM.x, CH_DRUM.y, 115)} fill={C.body} {...ol()} />
        <path d={bolts} fill={C.muted} />
        <path d={circlePath(CH_DRUM.x, CH_DRUM.y, 80)} fill={mix(C.body, C.ground, 0.45)} {...ol(0.5)} />
        <g transform={`translate(${CH_DRUM.x} ${CH_DRUM.y}) rotate(${f1(p.drum ?? 0)})`}>
          <path d={slots} fill={C.muted} />
          <path d={rectAt(polar(48, -90), 44, 12, -90)} fill={C.accent} />
          <path d={circlePath(0, 0, 20)} fill={C.muted} {...ol(0.5)} />
        </g>
        <path d={rrectPath(-26, -372, 72, 26, 6)} fill={C.muted} {...ol(0.7)} />
        {/* fender over the wheel */}
        <Tube d={arcD(wheel, 80, 200, 340)} w={14} fill={C.body} sw={sw} edge={C.paper} />
      </g>
      {/* wheel (does not shake) and the jack caster */}
      <path d={circlePath(wheel.x, wheel.y, 62)} fill={C.ground} {...ol()} />
      <path d={circlePath(wheel.x, wheel.y, 34)} fill={C.body} {...ol(0.5)} />
      <path d={lugs + circlePath(wheel.x, wheel.y, 8)} fill={C.muted} />
      <path d={circlePath(290, -10, 9)} fill={C.muted} {...ol(0.5)} />
    </g>
  );
};
/** Centre of the hopper opening, where things go in (world). */
export const chipperHopperMouth = (p: ChipperProps): Pt => {const s = chShake(p); return propPoint(chipperPlace(p), {x: CH_MOUTH.x + s.x, y: CH_MOUTH.y + s.y});};
/** The chute exit, where chips come out (world). Pass it to ChipSpray's x, y. */
export const chipperChuteExit = (p: ChipperProps): Pt => {
  const s = chShake(p);
  return propPoint(chipperPlace(p), {x: CH_CHUTE.e.x + chTan.x * 6 + s.x, y: CH_CHUTE.e.y + chTan.y * 6 + s.y});
};
/** Spray direction in world degrees for the chute as placed (about -35 plus the prop's angle). */
export const chipperChuteAngle = (p: ChipperProps) => (Math.atan2(chTan.y, chTan.x) * 180) / Math.PI + (p.angle ?? 0);
export const chipperQuad = (p: ChipperProps): Pt[] => propQuad(chipperPlace(p), {x: -370, y: -540, w: 735, h: 540});
export const chipperGraphic = (o: PropGraphicOpts<ChipperProps>): DecorGraphic => propGraphic(o, Chipper, chipperQuad);
