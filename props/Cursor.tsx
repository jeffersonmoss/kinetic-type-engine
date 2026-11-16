// Cursor: the classic arrow pointer wearing a mortarboard, with a busy ring and a dropping lanyard badge. Ported from
// the DOGEfather kit (K14, item 20).
import React from 'react';
import {clamp, easeOutCubic, lerp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, monoFont, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size of the arrow alone (52 x 84; `size` is the 52 width); with the cap it reaches y -26, with the badge
 *  y 116. */
export const CURSOR_SIZE = {w: 52, h: 84};
const ARROW = 'M0 0L0 72L17 56L29 84L41 79L29 52L52 52Z';
const ARROW_C = {x: 20, y: 42};
const RING_R = 30;
export interface CursorProps extends PropBase {
  /** Mortarboard on (default true). */
  cap?: boolean;
  /** Tassel swing, degrees from hanging straight down. */
  tassel?: number;
  /** 0..1: the arrow shrinks into the ring's centre while the busy ring grows; at 1 it is the ring. */
  busy?: number;
  /** Rotation of the busy ring's bright arc, degrees. */
  spin?: number;
  /** 0..1 click: the pointer dips 4 px and scales to 0.95 about its tip. */
  press?: number;
  /** 0..1: a lanyard with a badge printed ACCESS drops onto it from above; at 1 it hangs from the cursor. */
  lanyard?: number;
  /** Badge text (default 'ACCESS'). */
  badgeText?: string;
  /** Font key of a configured monospaced font for the badge (default `mono`, else the default font). */
  typeface?: string;
}
const cursorPlace = (p: CursorProps) => place(p, CURSOR_SIZE.w);
/** The classic arrow pointer (paper fill, dark outline) wearing a mortarboard (dark board in slight perspective, skull
 *  cap, highlight button, cord and tassel that hangs with gravity). Anchor: the arrow's tip (the hot spot). Natural
 *  arrow 52 x 84; size 130 (scale 2.5) in its first use. */
export const Cursor: React.FC<CursorProps> = (p) => {
  const q = cursorPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const mono = monoFont(p.typeface);
  const fine = 3 / (q.scale ?? 1);
  const b = clamp(p.busy ?? 0);
  const pr = clamp(p.press ?? 0);
  const ly = clamp(p.lanyard ?? 0);
  const capOn = p.cap ?? true;
  const capA = lerp(-22.5, 0, b);
  const capT = {x: lerp(-3.06, ARROW_C.x + 2, b), y: lerp(-7.39, ARROW_C.y - RING_R - 19, b)};
  const spin = p.spin ?? 0;
  const a0 = ((spin - 90) * Math.PI) / 180, a1 = ((spin + 30) * Math.PI) / 180;
  const arc = `M${f1(RING_R * Math.cos(a0))} ${f1(RING_R * Math.sin(a0))}A${RING_R} ${RING_R} 0 0 1 ${f1(RING_R * Math.cos(a1))} ${f1(RING_R * Math.sin(a1))}`;
  const dropY = -(1 - easeOutCubic(ly)) * 180;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={`translate(0 ${(4 * pr).toFixed(2)}) scale(${(1 - 0.05 * pr).toFixed(4)})`}>
        {ly > 0 && (
          <path transform={`translate(0 ${f1(dropY)})`} opacity={clamp(ly * 4)} d="M-2 26Q10 4 25 25" fill="none" stroke={C.highlight} strokeWidth={4} strokeLinecap="round" />
        )}
        {b > 0 && (
          <g transform={`translate(${ARROW_C.x} ${ARROW_C.y}) scale(${b.toFixed(4)})`}>
            <circle r={RING_R} fill="none" stroke={C.ground} strokeWidth={18} />
            <circle r={RING_R} fill="none" stroke={mix(C.body, C.muted, 0.5)} strokeWidth={10} />
            <path d={arc} fill="none" stroke={C.paper} strokeWidth={10} strokeLinecap="round" />
          </g>
        )}
        {b < 1 && (
          <g transform={`translate(${ARROW_C.x} ${ARROW_C.y}) scale(${(1 - b).toFixed(4)}) translate(${-ARROW_C.x} ${-ARROW_C.y})`}>
            <path d={ARROW} fill={C.paper} stroke={C.ground} strokeWidth={sw} strokeLinejoin="round" />
          </g>
        )}
        {ly > 0 && (
          <g transform={`translate(0 ${f1(dropY)})`} opacity={clamp(ly * 4)}>
            <path d="M-2 26L13 64M25 25L15 64" fill="none" stroke={C.highlight} strokeWidth={4} strokeLinecap="round" />
            <path d={rrectPath(8, 60, 12, 12, 3)} fill={C.body} stroke={C.paper} strokeWidth={fine * 0.7} />
            <path d={rrectPath(-16, 70, 60, 44, 6)} fill={C.paper} stroke={C.ground} strokeWidth={fine} />
            <path d="M-13 73H41V82H-13Z" fill={C.highlight} />
            <path d={rrectPath(8, 74, 12, 4, 2)} fill={C.ground} />
            <text x={14} y={103} textAnchor="middle" fontFamily={mono.family} fontWeight={mono.weight} fontSize={13} fill={C.ground}>{p.badgeText ?? 'ACCESS'}</text>
          </g>
        )}
        {capOn && (
          <g transform={`translate(${f1(capT.x)} ${f1(capT.y)}) rotate(${f1(capA)})`}>
            <path d="M-16 -4L16 -4L15 10Q0 14 -15 10Z" fill={mix(C.ground, C.body, 0.6)} stroke={C.paper} strokeWidth={fine} strokeLinejoin="round" />
            <path d="M-36 -6L0 -16L36 -6L0 4Z" fill={C.ground} stroke={C.paper} strokeWidth={fine} strokeLinejoin="round" />
            <path d="M0 -6L26 -4" stroke={C.highlight} strokeWidth={3} strokeLinecap="round" />
            <circle cx={0} cy={-6} r={3.5} fill={C.highlight} />
            <g transform={`rotate(${f1(-capA + (p.tassel ?? 0))} 26 -4)`}>
              <path d="M26 -4L26 16" stroke={C.highlight} strokeWidth={3} strokeLinecap="round" />
              <path d="M22.5 15L29.5 15L32 32L20 32Z" fill={C.highlight} />
            </g>
          </g>
        )}
      </g>
    </g>
  );
};
/** World quad covering the cursor with its cap and (dropped) badge. */
export const cursorQuad = (p: CursorProps): Pt[] => propQuad(cursorPlace(p), {x: -40, y: -30, w: 100, h: (p.lanyard ?? 0) > 0 ? 146 : 116});
export const cursorGraphic = (o: PropGraphicOpts<CursorProps>): DecorGraphic => propGraphic(o, Cursor, cursorQuad);
