// ReceiptPaper: thermal receipt paper with faint banding and serrated (torn) edges. Ported from the DOGEfather kit
// (K14, storyboard item 13). Drawn directly in world px (no anchor transform).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropGraphicOpts, f1, mix, polyD, propColours, propGraphic, serratedEdge} from './common';

export type Serrated = 'top' | 'bottom' | 'both' | 'none';
export interface ReceiptPaperProps {
  /** Top-left of the paper (the tips of the top teeth), in the current coordinate space. */
  x: number; y: number;
  w: number; h: number;
  /** Serrated (torn) edges, teeth 12 px (default 'both'). */
  serrated?: Serrated;
  /** Tooth width (default 12). */
  tooth?: number;
  opacity?: number;
  /** Paper colour (default the paper role). */
  fill?: string;
  /** Ink the banding is mixed toward (default the ground role). */
  ink?: string;
}
/** Outline path of a receipt sheet with optional serrated top and bottom edges (teeth inside the w x h box). */
export const receiptOutline = (x: number, y: number, w: number, h: number, serrated: Serrated = 'both', tooth = 12): string => {
  const half = tooth / 2;
  const top = serrated === 'top' || serrated === 'both' ? serratedEdge(x, x + w, y + half, tooth, -1) : [{x, y}, {x: x + w, y}];
  const bot = serrated === 'bottom' || serrated === 'both' ? serratedEdge(x, x + w, y + h - half, tooth, 1).reverse() : [{x: x + w, y: y + h}, {x, y: y + h}];
  return polyD([...top, ...bot]);
};
/** Thermal receipt paper: flat fill, a faint 2 percent horizontal banding (4 px lines at a 12 px pitch, 2 percent
 *  toward the ink), serrated top and/or bottom. Anchor: top-left. No outline (paper reads on dark grounds). */
export const ReceiptPaper: React.FC<ReceiptPaperProps> = ({x, y, w, h, serrated = 'both', tooth = 12, opacity = 1, fill, ink}) => {
  const C = propColours();
  const paper = fill ?? C.paper;
  let bands = '';
  for (let yy = y + tooth; yy + 4 <= y + h - tooth; yy += 12) bands += `M${f1(x)} ${f1(yy)}h${f1(w)}v4h${f1(-w)}Z`;
  return (
    <g opacity={opacity}>
      <path d={receiptOutline(x, y, w, h, serrated, tooth)} fill={paper} />
      {bands && <path d={bands} fill={mix(paper, ink ?? C.ground, 0.02)} />}
    </g>
  );
};
export const receiptPaperQuad = (p: ReceiptPaperProps): Pt[] => [{x: p.x, y: p.y}, {x: p.x + p.w, y: p.y}, {x: p.x + p.w, y: p.y + p.h}, {x: p.x, y: p.y + p.h}];
export const receiptPaperGraphic = (o: PropGraphicOpts<ReceiptPaperProps>): DecorGraphic => propGraphic(o, ReceiptPaper, receiptPaperQuad);
