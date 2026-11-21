// Sunglasses: a pair of classic thick-rimmed sunglasses, front view (Paper Trail storyboard items 61 and 214): a
// tortoiseshell frame with a brow bar and bridge, dark lenses with a diagonal glint, the hinges and temple stubs.
import React from 'react';
import {PALETTE} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propGraphic, propQuad, propTransform} from './common';
import {outlineFor, worldPx} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 200 wide (x -100 to 100), 70 tall (y -36 to 34). Anchor: the bridge centre. `size` is the 200 width. */
export const SUNGLASSES_SIZE = {w: 200};
export interface SunglassesProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Frame colour (default the body role, darkened: tortoiseshell brown). */
  frame?: string;
}
const glassesPlace = (p: SunglassesProps) => place(p, SUNGLASSES_SIZE.w);
const LENS = 'M8 -22H78Q88 -22 87 -10L82 14Q78 28 62 28H24Q12 28 10 16L6 -10Q5 -22 8 -22Z';
export const Sunglasses: React.FC<SunglassesProps> = (p) => {
  const q = glassesPlace(p);
  const sw = outlineFor(q, SUNGLASSES_SIZE.w, 0.02);
  const C = roleColours(p.colours);
  const frame = p.frame ?? mix(C.body, C.ground, 0.3);
  const lens = mix(C.ground, PALETTE.shadow, 0.5);
  const side = (s: 1 | -1) => (
    <g transform={`scale(${s} 1)`}>
      <path d="M86 -26L100 -30L100 -16L88 -14Z" fill={frame} stroke={C.edge} strokeWidth={sw} strokeLinejoin="round" />
      <path d={LENS} fill={frame} stroke={frame} strokeWidth={16} strokeLinejoin="round" />
      <path d={LENS} fill={lens} />
      <path d="M30 -14L18 14M50 -16L34 20" stroke={C.paper} strokeWidth={worldPx(q, 4)} strokeLinecap="round" opacity={0.55} />
    </g>
  );
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {/* outer edge first (the frame's silhouette), then each side */}
      <g>
        {[1, -1].map((s) => <path key={s} d={LENS} transform={`scale(${s} 1)`} fill="none" stroke={C.edge} strokeWidth={16 + 2 * sw} strokeLinejoin="round" />)}
        <path d="M-90 -30H90" stroke={C.edge} strokeWidth={12 + 2 * sw} strokeLinecap="round" />
        <path d="M-12 -14Q0 -24 12 -14" fill="none" stroke={C.edge} strokeWidth={10 + 2 * sw} strokeLinecap="round" />
      </g>
      <path d="M-90 -30H90" stroke={frame} strokeWidth={12} strokeLinecap="round" />
      <path d="M-12 -14Q0 -24 12 -14" fill="none" stroke={frame} strokeWidth={10} strokeLinecap="round" />
      {side(1)}
      {side(-1)}
      <path d="M-84 -32H84" stroke={mix(frame, C.paper, 0.3)} strokeWidth={worldPx(q, 2.5)} strokeLinecap="round" />
    </g>
  );
};
export const sunglassesQuad = (p: SunglassesProps): Pt[] => propQuad(glassesPlace(p), {x: -102, y: -40, w: 204, h: 78});
export const sunglassesGraphic = (o: PropGraphicOpts<SunglassesProps>): DecorGraphic => propGraphic(o, Sunglasses, sunglassesQuad);
