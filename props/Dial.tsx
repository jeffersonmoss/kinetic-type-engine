// Dial: a gauge with safe and danger bands, a trefoil and a needle. Ported from the DOGEfather kit (K14, item 24).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {TrefoilMark} from './TrefoilMark';
import {type PropBase, type PropGraphicOpts, arcD, circlePath, f1, mix, outline, place, polar, polyD, propColours, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';

// Anchor: centre. Natural diameter 360. The scale is a 240-degree arc from lower left (value 0) over the top to lower
// right (value 1); ticks every 10 degrees, longer every 30; accent2 safe band low, accent danger band high; trefoil on
// the lower face.
/** `size` is the 360 diameter. */
export const DIAL_SIZE = {w: 360, h: 360};
export interface DialProps extends PropBase {
  /** Needle value 0..1 (0 = left end of the arc, 1 = right end). Values outside are clamped to the pin stops. */
  value?: number;
  /** Safe band end (default 0.35) and danger band start (default 0.72), in value units. */
  safeTo?: number;
  dangerFrom?: number;
}
const DIAL_R = 180, DIAL_NEEDLE = 142;
const dialDeg = (v: number) => 150 + 240 * clamp(v, -0.02, 1.02);
const dialPlace = (p: DialProps) => place(p, DIAL_SIZE.w);
export const Dial: React.FC<DialProps> = (p) => {
  const q = dialPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  let minor = '', major = '';
  for (let k = 0; k <= 24; k++) {
    const a = 150 + k * 10, big = k % 3 === 0;
    const q0 = polar(big ? 116 : 132, a), q1 = polar(150, a);
    const seg = `M${f1(q0.x)} ${f1(q0.y)}L${f1(q1.x)} ${f1(q1.y)}`;
    if (big) major += seg; else minor += seg;
  }
  const a = dialDeg(p.value ?? 0);
  const tip = polar(DIAL_NEEDLE, a), tail = polar(-30, a), l = polar(7, a - 90), r = polar(7, a + 90);
  const needle = polyD([tail, {x: tail.x + l.x, y: tail.y + l.y}, tip, {x: tail.x + r.x, y: tail.y + r.y}]);
  const safeTo = p.safeTo ?? 0.35, dangerFrom = p.dangerFrom ?? 0.72;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={circlePath(0, 0, DIAL_R)} fill={C.body} {...outline(q, C)} />
      <path d={circlePath(0, 0, DIAL_R - 14)} fill="none" stroke={mix(C.body, C.ground, 0.4)} strokeWidth={3} />
      <path d={arcD({x: 0, y: 0}, 159, 150, 150 + 240 * safeTo)} fill="none" stroke={C.accent2} strokeWidth={14} />
      <path d={arcD({x: 0, y: 0}, 159, 150 + 240 * dangerFrom, 390)} fill="none" stroke={C.accent} strokeWidth={14} />
      <path d={minor} stroke={C.paper} strokeWidth={Math.max(3, sw * 0.5)} strokeLinecap="round" />
      <path d={major} stroke={C.paper} strokeWidth={Math.max(5, sw)} strokeLinecap="round" />
      {/* drawn at its natural size inside the dial's transform, so it scales with the dial */}
      <TrefoilMark x={0} y={84} colours={C} />
      <path d={needle} fill={C.paper} {...outline(q, C, 0.3)} />
      <path d={circlePath(0, 0, 18)} fill={C.ground} {...outline(q, C, 0.7)} />
      <path d={circlePath(0, 0, 5)} fill={C.muted} />
    </g>
  );
};
/** World point of the needle tip. */
export const dialNeedleTip = (p: DialProps): Pt => propPoint(dialPlace(p), polar(DIAL_NEEDLE, dialDeg(p.value ?? 0)));
export const dialQuad = (p: DialProps): Pt[] => propQuad(dialPlace(p), {x: -DIAL_R, y: -DIAL_R, w: 2 * DIAL_R, h: 2 * DIAL_R});
export const dialGraphic = (o: PropGraphicOpts<DialProps>): DecorGraphic => propGraphic(o, Dial, dialQuad);
