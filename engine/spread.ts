// K2 `spread` (Paper Trail, kit brief 1, 18 November 2026; storyboard items 46 and 122): the letters of a held word move
// apart along its baseline, from one fixed letter, until each gap between letters has opened by `to` em (the word's
// font size). One use in Paper Trail: TRAIL on the held note of chorus 1, frames 1,233 to 1,256, to 0.5 em, from a
// fixed T, so the letters end one to a sheet.
//   verb: [spread({word: TRAIL, at: 1233 / 30, to: 0.5, frames: 23})]
// or the plain cue {name: 'spread', word, at, params: {to, frames, anchor}}.
// params: to (em of extra spacing per gap, default 0.5), frames (default 23; lengthened so that the letter that travels
// furthest stays within SPREAD_SPEED_SHARE of the speed cap on screen at the cue's camera), anchor ('first' (default),
// 'last', 'centre', or a letter index: the letter that stays where it is). The spread holds once open.
// How the validator sees it: every word box the validator builds (margin, crop, overlap, ink-overlap, decor-ink, the
// motion checks of the word) grows with the letters (WordMod.extend, verbRegistry.ts), from the fixed letter outward,
// so the opened word must still fit the margin and clear its neighbours. The engine's existing `stretch` verb scales the
// glyphs along x and is a different picture (wider letters, no gaps), so this is a new verb, not an extension of it;
// Sweet Distillation's letter-spacing "stretch" on "long" (hookStation.tsx) is that `stretch` verb.
import {FPS} from './config';
import {framesForDistance} from './motion';
import type {BoardLayout, VerbCue} from './types';
import {easeInOutSine} from './util';
import {letterIdentity, registerVerb, type VerbWordCtx} from './verbRegistry';

/** Share of the speed cap the furthest letter may reach at the ease's peak (the camera is usually at rest on a held
 *  note; the validator's own cap is the full 32 px per frame). */
export const SPREAD_SPEED_SHARE = 0.9;
export const SPREAD_DEFAULT_TO = 0.5;
export const SPREAD_DEFAULT_FRAMES = 23;
export type SpreadAnchor = 'first' | 'last' | 'centre' | number;

export interface SpreadDef {
  /** The held word (global index). */
  word: number;
  /** Song seconds the spread starts (default the word's start + 10 frames, the verb default). */
  at?: number;
  /** Extra letter spacing per gap at the end, em (default 0.5). */
  to?: number;
  /** Frames to open (default 23; lengthened to keep within the speed cap). */
  frames?: number;
  /** The letter that stays put (default 'first'). */
  anchor?: SpreadAnchor;
  allowEarly?: boolean;
}
/** A `spread` cue for `block.verb`. */
export const spread = (d: SpreadDef): VerbCue => ({
  name: 'spread', word: d.word, at: d.at, allowEarly: d.allowEarly,
  params: {to: d.to ?? SPREAD_DEFAULT_TO, frames: d.frames ?? SPREAD_DEFAULT_FRAMES, anchor: d.anchor ?? 'first'},
});

const P = <T,>(cue: VerbCue, key: string, dflt: T): T => ((cue.params?.[key] as T | undefined) ?? dflt);
const anchorIndex = (a: SpreadAnchor, n: number) =>
  a === 'last' ? n - 1 : a === 'centre' ? (n - 1) / 2 : typeof a === 'number' ? Math.max(0, Math.min(n - 1, a)) : 0;

/** The spread of a word at a frame: per-letter offsets along the baseline (block px) and how far the word's box has
 *  grown to the left and right of its landed advance. `zoom` is the camera zoom at the cue's start. Pure. */
export const spreadAt = (cue: VerbCue, size: number, n: number, df: number, zoom: number): {dx: number[]; l: number; r: number; frames: number} => {
  const to = P(cue, 'to', SPREAD_DEFAULT_TO);
  const k0 = anchorIndex(P<SpreadAnchor>(cue, 'anchor', 'first'), n);
  const gap = to * size;
  const far = Math.max(k0, n - 1 - k0) * gap;
  const frames = framesForDistance(far * Math.max(0.01, zoom), P(cue, 'frames', SPREAD_DEFAULT_FRAMES), SPREAD_SPEED_SHARE);
  const e = df <= 0 ? 0 : easeInOutSine(df / frames);
  return {dx: Array.from({length: n}, (_, k) => (k - k0) * gap * e), l: k0 * gap * e, r: (n - 1 - k0) * gap * e, frames};
};

registerVerb('spread', {
  // the camera framing should keep room for the opened word about its centre
  reserve: (cue: VerbCue, L: BoardLayout) => {
    const w = L.words.get(cue.word);
    if (!w || !w.w) return null;
    const n = w.adv.length, k0 = anchorIndex(P<SpreadAnchor>(cue, 'anchor', 'first'), n);
    const gap = P(cue, 'to', SPREAD_DEFAULT_TO) * w.size;
    return {sx: (w.w + 2 * Math.max(k0, n - 1 - k0) * gap) / w.w};
  },
  modify: (c: VerbWordCtx) => {
    if (c.df <= 0 || c.i !== c.cue.word) return null;
    const n = c.geom.adv.length;
    const zoom = c.camAt(c.at * FPS).zoom;
    const s = spreadAt(c.cue, c.geom.size, n, c.df, zoom);
    return {letters: s.dx.map((dx) => ({...letterIdentity(), dx})), extend: {l: s.l, r: s.r}};
  },
});
