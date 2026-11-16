// Font metrics, so layout is a pure function that also runs in node (the validator).
// Every word is drawn with SVG textLength + lengthAdjust="spacingAndGlyphs", so on screen each word fills exactly the
// box computed here; a width estimate that is a few percent off only squeezes or widens glyphs. Cap height must be
// right, though: it sets row leading and every collision check. The numbers come from the metrics file the video passes
// to configureEngine (fonts/*.metrics.json, written by tools/measure-fonts.mjs and tools/measure-outlines.mjs).
import {FONT_INFO} from './config';
import type {FontKey} from './types';

export {FONT_FAMILY, FONT_STYLE, FONT_INFO, METRICS_MEASURED, METRICS_SOURCE} from './config';
export type {FontInfo, FontStyle} from './config';
export type {FontKey};

/** Per-letter advance widths in px for `text` at `size`. */
export const letterAdvances = (text: string, font: FontKey, size: number): number[] => {
  const info = FONT_INFO[font];
  if (!info) throw new Error(`font "${font}" is not configured (configureEngine fonts)`);
  const cs = [...text];
  return cs.map((c, k) => ((info.table[c] ?? info.fallback) + (k + 1 < cs.length ? info.kern[c + cs[k + 1]] ?? 0 : 0)) * size);
};
/** Advance width of `text` in px at `size`. */
export const textWidth = (text: string, font: FontKey, size: number) =>
  letterAdvances(text, font, size).reduce((a, b) => a + b, 0);
