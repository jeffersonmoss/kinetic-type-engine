// NoSign: the prohibition sign (Paper Trail storyboard items 61, 182 and 185): a paper disc, a thick accent ring and a
// slash from upper left to lower right over a dark icon. Icons: 'speech' (a speech bubble), 'upload' (an arrow rising
// out of a tray) and 'chat' (two overlapping chat bubbles), or any node drawn in the disc's -36..36 box. `lift` lifts
// the ring and slash off the icon and fades them, leaving the icon standing free (item 185).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, propGraphic, propQuad, propTransform, rrectPath} from './common';
import {outlineFor} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 120 across the ring (radius 60). Anchor: the centre. `size` is the 120 diameter. */
export const NO_SIGN_SIZE = {w: 120};
export type NoSignIcon = 'speech' | 'upload' | 'chat';
export interface NoSignProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** The icon under the slash (default 'speech'), or a custom node drawn in design units inside -36..36. */
  icon?: NoSignIcon | React.ReactNode;
  /** 0 to 1: the ring and slash lift up off the disc and fade (default 0). */
  lift?: number;
  /** Ring and slash colour (default the accent role). */
  ring?: string;
  /** Icon colour (default the ground role). */
  ink?: string;
}
const signPlace = (p: NoSignProps) => place(p, NO_SIGN_SIZE.w);
const R = 60, RW = 12;
const Icon: React.FC<{icon: NoSignIcon; ink: string; paper: string}> = ({icon, ink, paper}) => {
  if (icon === 'upload') {
    return (
      <>
        <path d="M0 -32L-20 -8H-8V12H8V-8H20Z" fill={ink} strokeLinejoin="round" stroke={ink} strokeWidth={3} />
        <path d="M-28 6V24H28V6" fill="none" stroke={ink} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  }
  if (icon === 'chat') {
    return (
      <>
        <path d={rrectPath(-6, -30, 40, 28, 9) + 'M22 -4L30 8L12 -2Z'} fill={ink} />
        <path d={rrectPath(-34, -16, 44, 32, 10) + 'M-24 14L-30 28L-12 15Z'} fill={ink} stroke={paper} strokeWidth={4} strokeLinejoin="round" />
        <path d={circlePath(-22, 0, 3.5) + circlePath(-12, 0, 3.5) + circlePath(-2, 0, 3.5)} fill={paper} />
      </>
    );
  }
  return (
    <>
      <path d="M-30 -6C-30 -22 -16 -30 0 -30C16 -30 30 -22 30 -6C30 10 16 18 0 18C-4 18 -8 17 -11 16L-24 28L-21 12C-27 7 -30 1 -30 -6Z" fill={ink} />
      <path d="M-14 -10H14M-14 2H6" stroke={paper} strokeWidth={5} strokeLinecap="round" />
    </>
  );
};
export const NoSign: React.FC<NoSignProps> = (p) => {
  const q = signPlace(p);
  const sw = outlineFor(q, NO_SIGN_SIZE.w, 0.03);
  const C = roleColours(p.colours);
  const ring = p.ring ?? C.accent, ink = p.ink ?? C.ground;
  const lift = clamp(p.lift ?? 0);
  const icon = p.icon ?? 'speech';
  const s = Math.SQRT1_2 * (R - RW / 2);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={circlePath(0, 0, R)} fill={mix(C.paper, ring, 0.04)} stroke={C.edge} strokeWidth={sw} />
      {typeof icon === 'string' ? <Icon icon={icon as NoSignIcon} ink={ink} paper={C.paper} /> : icon}
      <g transform={`translate(0 ${(-lift * 90).toFixed(2)})`} opacity={1 - lift}>
        <path d={circlePath(0, 0, R - RW / 2)} fill="none" stroke={ring} strokeWidth={RW} />
        <path d={`M${-s} ${-s}L${s} ${s}`} stroke={ring} strokeWidth={RW} strokeLinecap="butt" />
        <path d={circlePath(0, 0, R)} fill="none" stroke={C.edge} strokeWidth={sw} />
      </g>
    </g>
  );
};
export const noSignQuad = (p: NoSignProps): Pt[] => propQuad(signPlace(p), {x: -62, y: -62 - 90 * clamp(p.lift ?? 0), w: 124, h: 124 + 90 * clamp(p.lift ?? 0)});
export const noSignGraphic = (o: PropGraphicOpts<NoSignProps>): DecorGraphic => propGraphic(o, NoSign, noSignQuad);
