// Browser: a web browser window showing a grid of receipt thumbnails, a chat, or a blank page. Ported from the
// DOGEfather kit (K14, item 33).
import React from 'react';
import {clamp, easeOutCubic} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {KeyButton} from './Dialog';
import {type PropBase, type PropGraphicOpts, MONO_EM, bubbleD, leaderPath, linesD, mix, place, polyD, propColours, propGraphic, propQuad, propTransform, rrectPath, serratedEdge, strokeOf} from './common';

/** Natural size 720 x 520 (page 692 x 446); `size` is the width. */
export const BROWSER_SIZE = {w: 720, h: 520};
const BPAGE = {x: -346, y: -200, w: 692, h: 446};
const THUMB = {w: 120, h: 176};
const THUMB_GX = (BPAGE.w - 4 * THUMB.w) / 5, THUMB_GY = (BPAGE.h - 2 * THUMB.h) / 3;
export type BrowserPage = 'grid' | 'chat' | 'blank';
export interface BrowserProps extends PropBase {
  page?: BrowserPage;
  /** 'grid': 0..8 fractional, amount blocks appear on the thumbnails in order (each wipes on left to right). */
  amounts?: number;
  /** 'grid': index of the tapped thumbnail (accent2 tap ring), or -1. */
  tapped?: number;
  /** 'chat': 0..3, how many of the three bubbles have turned muted (fractional fades the next one). */
  ghosted?: number;
  /** Optional mono button at the bottom-left of the page (BLOCK). Meant for the 'chat' and 'blank' pages. */
  button?: {label: string; press: number};
  /** Font key of a configured monospaced font for the button (default `mono`, else the default font). */
  typeface?: string;
}
const thumbBox = (k: number) => {
  const c = k % 4, r = Math.floor(k / 4);
  return {x: BPAGE.x + THUMB_GX + c * (THUMB.w + THUMB_GX), y: BPAGE.y + THUMB_GY + r * (THUMB.h + THUMB_GY), w: THUMB.w, h: THUMB.h};
};
const paperOutline = (x: number, y: number, w: number, h: number, tooth = 12) => {
  const top = serratedEdge(x, x + w, y + tooth / 2, tooth, -1);
  const bot = serratedEdge(x, x + w, y + h - tooth / 2, tooth, 1).reverse();
  return polyD([...top, ...bot]);
};
const THUMB_PAPER = (() => {
  let d = '';
  for (let k = 0; k < 8; k++) { const b = thumbBox(k); d += paperOutline(b.x, b.y, b.w, b.h); }
  return d;
})();
const THUMB_MARKS = (() => {
  let bars = '', leaders = '';
  for (let k = 0; k < 8; k++) {
    const b = thumbBox(k);
    bars += rrectPath(b.x + 16, b.y + 34, 70, 8, 4) + rrectPath(b.x + 16, b.y + 52, 88, 6, 3) + rrectPath(b.x + 16, b.y + 66, 56, 6, 3);
    bars += rrectPath(b.x + 16, b.y + 140, 88, 4, 2);
    leaders += leaderPath({x: b.x + 18, y: b.y + 116}, {x: b.x + 54, y: b.y + 116}, 3, 9);
  }
  return {bars, leaders};
})();
const buttonBox = (label: string) => {
  const w = Math.max(160, label.length * MONO_EM * 36 + 56);
  return {x: BPAGE.x + 24, y: BPAGE.y + BPAGE.h - 24 - 64, w, h: 64};
};
const browserPlace = (p: BrowserProps) => place(p, BROWSER_SIZE.w);
/** Web browser window: accent, highlight and accent2 dots, a blank address bar, and a wall-coloured page. Pages:
 *  'grid' (a 4 by 2 grid of 120 x 176 receipt thumbnails, serrated top and bottom, accent pin, name lines, a dotted
 *  leader and a highlight amount block that wipes on per `amounts`; `tapped` puts an accent2 ring on one), 'chat'
 *  (three bubbles, `ghosted` of them muted), 'blank'. Optional mono `button` at the page's bottom-left. Anchor: centre.
 *  Natural size 720 x 520 (page 692 x 446). */
export const Browser: React.FC<BrowserProps> = (p) => {
  const q = browserPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const page = p.page ?? 'grid';
  const bubbleFills = [mix(C.body, C.paper, 0.16), C.accent2, mix(C.body, C.paper, 0.16)];
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-360, -260, 720, 520, 16)} fill={C.body} stroke={C.paper} strokeWidth={sw} />
      <circle cx={-326} cy={-230} r={8} fill={C.accent} />
      <circle cx={-302} cy={-230} r={8} fill={C.highlight} />
      <circle cx={-278} cy={-230} r={8} fill={C.accent2} />
      <path d={rrectPath(-220, -246, 440, 32, 16)} fill={mix(C.body, C.ground, 0.45)} />
      <rect x={BPAGE.x} y={BPAGE.y} width={BPAGE.w} height={BPAGE.h} fill={C.wall} />
      {page === 'grid' && (
        <>
          <path d={THUMB_PAPER} fill={C.paper} />
          <path d={THUMB_MARKS.bars} fill={mix(C.paper, C.ground, 0.3)} />
          <path d={THUMB_MARKS.leaders} fill={mix(C.paper, C.ground, 0.45)} />
          {Array.from({length: 8}, (_, k) => {
            const b = thumbBox(k);
            const a = clamp((p.amounts ?? 0) - k);
            return (
              <g key={k}>
                {a > 0 && <rect x={b.x + 60} y={b.y + 104} width={(44 * easeOutCubic(a)).toFixed(2)} height={24} fill={C.highlight} />}
                <circle cx={b.x + b.w / 2} cy={b.y + 14} r={9} fill={C.accent} stroke={C.ground} strokeWidth={2} />
              </g>
            );
          })}
          {(p.tapped ?? -1) >= 0 && (p.tapped ?? -1) < 8 && (() => {
            const b = thumbBox(p.tapped as number);
            return <circle cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={58} fill="none" stroke={C.accent2} strokeWidth={6} />;
          })()}
        </>
      )}
      {page === 'chat' && [0, 1, 2].map((k) => {
        const right = k === 1;
        const w = 360, h = 96;
        const x = right ? BPAGE.x + BPAGE.w - 40 - w : BPAGE.x + 40;
        const y = BPAGE.y + 30 + k * 122;
        const g = clamp((p.ghosted ?? 0) - k);
        return (
          <g key={k}>
            <path d={bubbleD(x, y, w, h, right)} fill={mix(bubbleFills[k], C.muted, g)} />
            <path d={linesD(x + 24, y + 26, [w - 90, w - 150], 26, 12)} fill={mix(right ? mix(C.accent2, C.paper, 0.6) : C.muted, mix(C.muted, C.ground, 0.35), g)} />
          </g>
        );
      })}
      {p.button && (() => {
        const b = buttonBox(p.button.label);
        return <KeyButton {...b} press={p.button.press} label={p.button.label} font={36} typeface={p.typeface} C={C} />;
      })()}
    </g>
  );
};
export const browserQuad = (p: BrowserProps): Pt[] => propQuad(browserPlace(p), {x: -360, y: -260, w: 720, h: 520});
/** World quad of the page area. */
export const browserPageRect = (p: BrowserProps): Pt[] => propQuad(browserPlace(p), BPAGE);
/** World quad of grid thumbnail k (0 to 7, row-major: 0 to 3 top row). */
export const browserThumbRect = (p: BrowserProps, k: number): Pt[] => propQuad(browserPlace(p), thumbBox(k));
/** World quad of thumbnail k's amount block (where a flying highlight block lands). */
export const browserAmountRect = (p: BrowserProps, k: number): Pt[] => { const b = thumbBox(k); return propQuad(browserPlace(p), {x: b.x + 60, y: b.y + 104, w: 44, h: 24}); };
/** World quad of the button face (label 'BLOCK' assumed when the prop has no button), including its depression. */
export const browserButtonRect = (p: BrowserProps): Pt[] => {
  const b = buttonBox(p.button?.label ?? 'BLOCK');
  return propQuad(browserPlace(p), {...b, y: b.y + 4 * clamp(p.button?.press ?? 0)});
};
export const browserGraphic = (o: PropGraphicOpts<BrowserProps>): DecorGraphic => propGraphic(o, Browser, browserQuad);
