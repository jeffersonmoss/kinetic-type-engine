// Non-lyric captions (kit pass 21, 16 November 2026): type that is not a sung word (the title, the end card, a credit),
// as a board graphic the validator can see. caption() lays the text out with the same font metrics as a word (so its
// box is exact), draws it as SVG text with textLength, and marks the graphic `isType` (it fills a frame for
// `empty-frame`) and `caption` (validateV3 checks it like a sung word: safe margin, 56 px cap on screen, full opacity for
// 15 frames, crossed by no rule, kit line or other graphic). Lines of text are stacked with `leading` (x cap).
//
//   graphics.push(caption({id: 'end card', text: ['A FABLE BY', 'JEFFERSON MOSS'], font: 'barlow', cap: 64,
//     colour: INK, layer: 'screen', x: 640, y: 300, align: 'center', from: 238.0, until: 242.5}));
import React from 'react';
import {FONT_FAMILY, FONT_INFO, FONT_STYLE, textWidth, type FontKey} from './metrics';
import type {DecorGraphic, Pt} from './types';
import {rot} from './util';

export interface CaptionDef {
  id: string;
  /** One string per line, as displayed (Anton is upper-cased for you). */
  text: string | string[];
  font: FontKey;
  /** Cap height in px: screen px on the 'screen' layer, world px otherwise (then cap x zoom is checked on screen). */
  cap: number;
  colour: string;
  layer: DecorGraphic['layer'];
  /** The anchor point: the top of the first line's caps, at the left, centre or right edge (`align`). */
  x: number; y: number;
  align?: 'left' | 'center' | 'right';
  /** Degrees about the anchor (world or screen, as the layer). */
  angle?: number;
  /** Line pitch as a multiple of the cap height (default 1.5). */
  leading?: number;
  from: number; until: number;
  exit?: number;
  owner?: DecorGraphic['owner'];
  persistent?: boolean;
  /** Frames it must be readable at full opacity (default 15, Jefferson's floor). */
  minFrames?: number;
}

/** A caption's line boxes (cap box: top of caps to baseline), in its layer's coordinates. */
export const captionBoxes = (d: CaptionDef): {text: string; size: number; x: number; baseline: number; w: number; quad: Pt[]}[] => {
  const fi = FONT_INFO[d.font];
  const size = d.cap / fi.cap;
  const lines = (Array.isArray(d.text) ? d.text : [d.text]).map((s) => (fi.upper ? s.toUpperCase() : s));
  const pitch = d.cap * (d.leading ?? 1.5);
  const a = d.angle ?? 0;
  return lines.map((text, k) => {
    const w = textWidth(text, d.font, size);
    const x0 = d.align === 'right' ? -w : d.align === 'left' ? 0 : -w / 2;
    const top = k * pitch;
    const quad = [{x: x0, y: top}, {x: x0 + w, y: top}, {x: x0 + w, y: top + d.cap}, {x: x0, y: top + d.cap}].map((p) => { const q = rot(p, a); return {x: q.x + d.x, y: q.y + d.y}; });
    return {text, size, x: x0, baseline: top + d.cap, w, quad};
  });
};

export const caption = (d: CaptionDef): DecorGraphic => {
  const boxes = captionBoxes(d);
  const st = FONT_STYLE[d.font];
  return {
    id: d.id, layer: d.layer, from: d.from, until: d.until, exit: d.exit, owner: d.owner, persistent: d.persistent ?? !d.owner,
    isType: true,
    caption: {text: boxes.map((b) => b.text).join(' / '), cap: d.cap, minFrames: d.minFrames},
    box: () => boxes.map((b) => b.quad),
    draw: () => React.createElement('g', {transform: `translate(${d.x} ${d.y}) rotate(${d.angle ?? 0})`},
      ...boxes.map((b, k) => React.createElement('text', {key: k, x: b.x, y: b.baseline, fontFamily: FONT_FAMILY[d.font], fontStyle: st.fontStyle, fontWeight: st.fontWeight, fontSize: b.size, fill: d.colour, textLength: b.w, lengthAdjust: 'spacingAndGlyphs'}, b.text))),
  };
};
