// Thumb: a thumb alone, lying level and pointing right (Paper Trail storyboard items 61 and 75: "the size of your
// thumb", lying parallel under the Bug). Redrawn after Fable's props gate, loop 1, item 55: no fist and no fingers. Short
// and stout, about 2.3 times as long as wide, a broad nail over the last third with its pale free edge, two creases at
// the knuckle, and a fuller base that ends in a soft rounded end (loop 2, item 12: no cut face). Flat, paper tone.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propGraphic, propPoint, propQuad, propTransform} from './common';
import {outlineFor} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 100 from the base (the soft rounded end, the "knuckle" end) to the tip, about 44 wide (y -22 to 22).
 *  Anchor: the middle of the base end; the thumb points along +x to x 100. `size` is that whole length, so a Thumb
 *  the length of a Bug is `size = bug length`. */
export const THUMB_SIZE = {w: 100};
export interface ThumbProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Skin colour (default paper). */
  tone?: string;
}
const thumbPlace = (p: ThumbProps) => place(p, THUMB_SIZE.w);
/** Outline: the fuller base (half-width 22) narrowing a little at the knuckle and through the last third to a rounded
 *  tip; the base ends in a soft rounded end in the same tone (Fable props gate loop 2, item 12: no cut face). */
const BODY = 'M14 -21.5C24 -22 34 -20 46 -19.5C62 -19 76 -18.5 86 -16.5C97 -14 100.5 -6 100.5 0C100.5 6 97 14 86 16.5C76 18.5 62 19 46 19.5C34 20 24 22 14 21.5C3 21 -0.5 12 -0.5 0C-0.5 -12 3 -21 14 -21.5Z';
/** The nail: broad, on the last third, with a curved cuticle, set a little toward the upper side. */
const NAIL = 'M67 -13.5C76 -14.5 86 -14 92 -11C97 -7.5 97.5 4 92 7.5C86 10.5 76 11 67 10C64 6 64 -9.5 67 -13.5Z';
const FREE_EDGE = 'M92 -11C97 -7.5 97.5 4 92 7.5C94.5 4 94.5 -7.5 92 -11Z';
export const Thumb: React.FC<ThumbProps> = (p) => {
  const q = thumbPlace(p);
  const sw = outlineFor(q, 100, 0.03);
  const C = roleColours(p.colours);
  const tone = p.tone ?? C.paper;
  const crease = mix(tone, C.muted, 0.75);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={BODY} fill={tone} stroke={C.edge} strokeWidth={sw} strokeLinejoin="round" />
      {/* two creases at the knuckle */}
      <path d="M44 -15Q47 -6 44 4M50 -16Q53.5 -8 50.5 1" fill="none" stroke={crease} strokeWidth={sw * 0.6} strokeLinecap="round" />
      {/* a faint pad line along the underside */}
      <path d="M14 13Q40 16 62 13" fill="none" stroke={mix(tone, C.muted, 0.35)} strokeWidth={sw * 0.5} strokeLinecap="round" />
      <path d={NAIL} fill={mix(tone, C.muted, 0.22)} stroke={crease} strokeWidth={sw * 0.6} strokeLinejoin="round" />
      <path d={FREE_EDGE} fill={mix(tone, C.paper, 0.6)} />
      <path d="M70 -10Q80 -11.5 88 -9" fill="none" stroke={mix(tone, C.paper, 0.7)} strokeWidth={sw * 0.5} strokeLinecap="round" opacity={0.8} />
    </g>
  );
};
export const thumbQuad = (p: ThumbProps): Pt[] => propQuad(thumbPlace(p), {x: -2, y: -24, w: 104, h: 48});
/** World point at the base end (one end of the size tick). */
export const thumbKnuckle = (p: ThumbProps): Pt => propPoint(thumbPlace(p), {x: 0, y: 0});
/** World point at the thumb's tip (the other end). */
export const thumbTip = (p: ThumbProps): Pt => propPoint(thumbPlace(p), {x: 100, y: 0});
export const thumbGraphic = (o: PropGraphicOpts<ThumbProps>): DecorGraphic => propGraphic(o, Thumb, thumbQuad);
