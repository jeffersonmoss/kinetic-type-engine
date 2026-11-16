// Dialog: a system alert window with a warning triangle and one button that depresses. Ported from the DOGEfather kit
// (K14, item 23). Its KeyButton is shared with Browser.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropColours, type PropGraphicOpts, MONO_EM, circlePath, mix, monoFont, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size 520 x 300; `size` is the width. */
export const DIALOG_SIZE = {w: 520, h: 300};
const DBTN = {x: -130, y: 34, w: 260, h: 72};
export interface DialogProps extends PropBase {
  /** 0..1: the button depresses 4 px. */
  press?: number;
  /** Optional mono label on the button (usually left to the type engine). */
  label?: string;
  /** Font key of a configured monospaced font for the label (default `mono`, else the default font). */
  typeface?: string;
}
/** A keycap button: a paper face with an accent2 default ring over a darker base, depressing 4 px on `press`. */
export const KeyButton: React.FC<{x: number; y: number; w: number; h: number; press: number; label?: string; font?: number; typeface?: string; C: PropColours}> = ({x, y, w, h, press, label, font = 38, typeface, C}) => {
  const dy = 4 * clamp(press);
  const size = label ? Math.min(font, (w - 36) / (label.length * MONO_EM)) : font;
  const mono = monoFont(typeface);
  return (
    <>
      <path d={rrectPath(x, y + 4, w, h, 16)} fill={mix(C.paper, C.ground, 0.4)} />
      <g transform={`translate(0 ${dy.toFixed(2)})`}>
        <path d={rrectPath(x, y, w, h, 16)} fill={C.paper} stroke={C.accent2} strokeWidth={4} />
        {label && (
          <text x={x + w / 2} y={y + h / 2 + 0.35 * size} textAnchor="middle" fontFamily={mono.family} fontWeight={mono.weight} fontSize={size} fill={C.ground}>
            {label}
          </text>
        )}
      </g>
    </>
  );
};
const dialogPlace = (p: DialogProps) => place(p, DIALOG_SIZE.w);
/** System alert window: title bar with an accent close dot and a title bar stand-in, a plain highlight warning triangle
 *  with a dark exclamation mark, three grey message bars, and one button (paper keycap with an accent2 default ring)
 *  that depresses 4 px on `press`. Anchor: centre. Natural size 520 x 300. */
export const Dialog: React.FC<DialogProps> = (p) => {
  const q = dialogPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-260, -150, 520, 300, 14)} fill={C.body} stroke={C.paper} strokeWidth={sw} />
      <path d="M-257 -102V-136Q-257 -147 -246 -147H246Q257 -147 257 -136V-102Z" fill={mix(C.body, C.paper, 0.12)} />
      <path d="M-257 -101H257" stroke={C.muted} strokeWidth={2} />
      <circle cx={-226} cy={-125} r={10} fill={C.accent} />
      <path d={rrectPath(-60, -131, 120, 12, 6)} fill={C.muted} />
      <path d="M-170 -84Q-166 -90 -162 -84L-118 -6Q-114 2 -124 2L-216 2Q-226 2 -222 -6Z" fill={C.highlight} />
      <path d={rrectPath(-175, -62, 10, 38, 5) + circlePath(-170, -12, 6)} fill={C.ground} />
      <path d={rrectPath(-90, -76, 290, 14, 7) + rrectPath(-90, -50, 240, 14, 7) + rrectPath(-90, -24, 160, 14, 7)} fill={C.muted} />
      <KeyButton {...DBTN} press={p.press ?? 0} label={p.label} typeface={p.typeface} C={C} />
    </g>
  );
};
export const dialogQuad = (p: DialogProps): Pt[] => propQuad(dialogPlace(p), {x: -260, y: -150, w: 520, h: 300});
/** World quad of the button face (including its current 0 to 4 px depression), for lyric words drawn on it. */
export const dialogButtonRect = (p: DialogProps): Pt[] => propQuad(dialogPlace(p), {...DBTN, y: DBTN.y + 4 * clamp(p.press ?? 0)});
export const dialogGraphic = (o: PropGraphicOpts<DialogProps>): DecorGraphic => propGraphic(o, Dialog, dialogQuad);
