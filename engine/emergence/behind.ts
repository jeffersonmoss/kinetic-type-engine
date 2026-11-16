// BEHIND (DOGE storyboard v2 item 60, K6): the old line's cover words carry an opaque plate (the palette's shadow, 18 px
// padding); the plate hinges or slides away and the new words are already there behind it. Ported from DOGE's
// sheet/state.ts (behindMatrix, behindPlateQuad, behindReveal): a hidden word is drawn from 2 frames before the plate
// has cleared it, and the validator fails a cover that still overlaps a hidden word on its sung frame (rule `behind`;
// DOGE's fallback is DRAWER from the same edge).
// The emergence is on the hidden block: emerge behind({cover, exit, frames?, pad?, colour?}). Lay the hidden block out
// inside the cover's box (an anchor on the cover block) and give it a lower `z` than the cover block. The cover words
// must share one block. The plate is drawn with the first cover word, under its glyphs, from the cover's first sung
// frame.
// params: cover (word indices; default every word of the anchor word's block), exit 'hinge-down' | 'hinge-up' |
// 'slide-left' | 'slide-right' | 'slide-up' (default 'slide-up'), frames (16), pad (18), colour (PALETTE.shadow).
import React from 'react';
import {FPS, PALETTE} from '../config';
import {blockToWorld, worldToBlock} from '../layout';
import type {BoardLayout, Pt, VerbCue} from '../types';
import {clamp, polysOverlap} from '../util';
import {registerVerb} from '../verbRegistry';
import {BIG, PC, anchorBlockWords, eased, rectPath, wordsOfCue, wordsParam} from './common';

export const BEHIND_FRAMES = 16;
export const BEHIND_PAD = 18;
type Exit = 'hinge-down' | 'hinge-up' | 'slide-left' | 'slide-right' | 'slide-up';

const coverOf = (cue: VerbCue, L: BoardLayout): number[] => {
  const c = wordsParam(cue, L, 'cover');
  return cue.params?.cover !== undefined ? c : anchorBlockWords(cue, L);
};
/** The cover's padded box in its block's frame. */
const coverBox = (cue: VerbCue, L: BoardLayout) => {
  const ws = coverOf(cue, L).map((i) => L.words.get(i)!);
  const pad = PC(cue, 'pad', BEHIND_PAD);
  return {block: ws[0].block, x0: Math.min(...ws.map((g) => g.x)) - pad, x1: Math.max(...ws.map((g) => g.x + g.w)) + pad,
    y0: Math.min(...ws.map((g) => g.y)) - pad, y1: Math.max(...ws.map((g) => g.y + g.boxH)) + pad};
};
export const behindTiming = (cue: VerbCue, L: BoardLayout) => {
  const frames = Math.max(8, PC(cue, 'frames', BEHIND_FRAMES));
  const hidden = wordsOfCue(cue, L);
  const first = Math.min(...hidden.map((i) => L.words.get(i)!.sf));
  const start = cue.at !== undefined ? cue.at * FPS : first - frames;
  return {start, frames};
};
const progressAt = (cue: VerbCue, L: BoardLayout, f: number) => {
  const {start, frames} = behindTiming(cue, L);
  return eased(clamp((f - start) / frames));
};
/** The cover's motion at progress p, as an affine map of block-local points (cover block frame). */
const coverMap = (cue: VerbCue, L: BoardLayout, p: number) => {
  const bx = coverBox(cue, L);
  const exit = PC(cue, 'exit', 'slide-up') as Exit;
  if (exit === 'hinge-down' || exit === 'hinge-up') {
    const s = Math.max(0.001, Math.cos((p * Math.PI) / 2));
    const y = exit === 'hinge-down' ? bx.y1 : bx.y0;
    return {sy: s, ty: y * (1 - s), tx: 0, map: (q: Pt): Pt => ({x: q.x, y: y + (q.y - y) * s})};
  }
  const tx = exit === 'slide-left' ? -(bx.x1 - bx.x0 + 24) * p : exit === 'slide-right' ? (bx.x1 - bx.x0 + 24) * p : 0;
  const ty = exit === 'slide-up' ? -(bx.y1 - bx.y0 + 24) * p : 0;
  return {sy: 1, ty, tx, map: (q: Pt): Pt => ({x: q.x + tx, y: q.y + ty})};
};
/** World quad of the plate at frame f (null once a hinge is edge-on or the move is done). */
export const behindPlateQuad = (cue: VerbCue, L: BoardLayout, f: number): Pt[] | null => {
  const p = progressAt(cue, L, f);
  if (p >= 0.995) return null;
  const bx = coverBox(cue, L);
  const b = L.blocks[bx.block];
  const m = coverMap(cue, L, p);
  return [{x: bx.x0, y: bx.y0}, {x: bx.x1, y: bx.y0}, {x: bx.x1, y: bx.y1}, {x: bx.x0, y: bx.y1}].map((q) => blockToWorld(b, m.map(q)));
};
const wordQuad = (L: BoardLayout, i: number): Pt[] => {
  const g = L.words.get(i)!;
  const b = L.blocks[g.block];
  return [{x: g.x, y: g.y}, {x: g.x + g.w, y: g.y}, {x: g.x + g.w, y: g.y + g.boxH}, {x: g.x, y: g.y + g.boxH}].map((q) => blockToWorld(b, q));
};
const revealMemo = new WeakMap<VerbCue, Map<number, number>>();
/** Frame from which hidden word h is drawn: 2 frames before the plate has cleared it. */
export const behindReveal = (cue: VerbCue, L: BoardLayout, h: number): number => {
  let memo = revealMemo.get(cue);
  if (!memo) { memo = new Map(); revealMemo.set(cue, memo); }
  const hit = memo.get(h);
  if (hit !== undefined) return hit;
  const {start, frames} = behindTiming(cue, L);
  const q = wordQuad(L, h);
  let clear = start + frames;
  for (let f = Math.floor(start); f <= start + frames; f++) {
    const pq = behindPlateQuad(cue, L, f);
    if (!pq || !polysOverlap(pq, q, 0)) { clear = f; break; }
  }
  memo.set(h, clear - 2);
  return clear - 2;
};
/** Hidden words the plate still overlaps on their sung frame (the build failure of K6). */
export const behindFailures = (cue: VerbCue, L: BoardLayout): number[] =>
  wordsOfCue(cue, L).filter((h) => { const pq = behindPlateQuad(cue, L, L.words.get(h)!.sf); return !!pq && polysOverlap(pq, wordQuad(L, h), 0); });

registerVerb('behind', {
  early: true, replacesEnter: true, gradual: true, lead: 3000,
  affects: (cue, L) => [...coverOf(cue, L), ...wordsOfCue(cue, L)],
  defaultAt: (cue, L) => behindTiming(cue, L).start / FPS,
  overlapExempt: (cue, L) => coverOf(cue, L).flatMap((o) => wordsOfCue(cue, L).map((n): [number, number] => [o, n])),
  removesAt: (c) => { const t = behindTiming(c.cue, c.L); return coverOf(c.cue, c.L).includes(c.i) ? Math.ceil(t.start + t.frames) : null; },
  modify: (c) => {
    const cover = coverOf(c.cue, c.L);
    const {start, frames} = behindTiming(c.cue, c.L);
    if (!cover.includes(c.i)) {
      if (c.f < behindReveal(c.cue, c.L, c.i)) return {hidden: true, opacity: 0};
      // while the plate still crosses it, the hidden word is drawn only outside the plate (it is behind it)
      const pq = behindPlateQuad(c.cue, c.L, c.f);
      if (!pq) return null;
      const q = pq.map((v) => worldToBlock(c.block, v));
      return {clip: rectPath(-BIG, -BIG, BIG, BIG) + `M${q.map((v) => `${v.x.toFixed(2)} ${v.y.toFixed(2)}`).join('L')}Z`};
    }
    if (c.f < c.geom.sf && c.f < start) return null;
    if (c.f >= start + frames) return {hidden: true, opacity: 0};
    const p = progressAt(c.cue, c.L, c.f);
    const m = coverMap(c.cue, c.L, p);
    const g = c.geom, cy = g.y + g.h / 2, cx = g.x + g.w / 2;
    // the word's own transform scales about its centre: shift it so the scale is about the cover's hinge line
    const at = m.map({x: cx, y: cy});
    const out: Record<string, unknown> = {dx: at.x - cx, dy: at.y - cy, sy: m.sy};
    if (c.i === cover[0]) {
      const bx = coverBox(c.cue, c.L);
      const first = Math.min(...cover.map((i) => c.L.words.get(i)!.sf));
      if (c.f >= first) out.underlay = [React.createElement('rect', {key: 'behind plate', x: bx.x0, y: bx.y0, width: bx.x1 - bx.x0, height: bx.y1 - bx.y0, fill: PC(c.cue, 'colour', PALETTE.shadow)})];
    }
    return out;
  },
});
