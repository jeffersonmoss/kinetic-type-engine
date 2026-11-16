// DOOR (rule 57): the new word is already in place underneath the old one. The old word opens like a door on a rule at
// one of its edges (its width, or height, scaling to zero about that edge in 8 to 10 frames), or slides off like a lid,
// and the new word is seen from the first frame of the opening. The new block is drawn under the old one and is clipped
// to the part the door has already left, so the two are never drawn through each other; the hinge rule is drawn, and a
// swinging door darkens by up to 40 percent as it turns (ruling 194.2). params also: rule (false: no hinge rule).
// params: old (word or words; default the anchor's word), edge 'left' | 'right' | 'top' | 'bottom' (default 'left'),
// style 'swing' | 'lid', lidDir (degrees in the old word's block frame, default -90: up), frames (minimum 9).
import React from 'react';
import {FPS, PALETTE} from '../config';
import type {BoardLayout, Pt, VerbCue} from '../types';
import {clamp, mixHex} from '../util';
import {getVerb, registerVerb} from '../verbRegistry';
import {drawLines, exitFade} from '../lines';
import {BIG, PC, capFrames, centreOf, eased, firstSf, rectPath, toLocal, toWorld, wordsOfCue, wordsParam, zoomOf, type VerbWordCtx} from './common';

export const doorTiming = (cue: VerbCue, L: BoardLayout) => {
  const old = wordsParam(cue, L, 'old');
  const land = firstSf(cue, L);
  const edge = PC(cue, 'edge', 'left');
  const horiz = edge === 'left' || edge === 'right';
  const size = Math.max(1, ...old.map((i) => { const g = L.words.get(i)!; return horiz ? g.w : g.boxH; }));
  const dur = capFrames(PC(cue, 'style', 'swing') === 'lid' ? size * 1.2 : size, zoomOf(L, cue.word, land), PC(cue, 'frames', 9));
  // the new word is seen from the first frame of the opening, and must be whole when it is sung
  const start = cue.at !== undefined ? cue.at * FPS : cue.params?.showFrom !== undefined ? (cue.params.showFrom as number) * FPS : land - dur;
  return {start, dur, old};
};
/** World outline of an old (door) word at frame f, as the door has left it. */
const doorQuad = (cue: VerbCue, L: BoardLayout, o: number, f: number): Pt[] | null => {
  const {start, dur} = doorTiming(cue, L);
  const p = (f - start) / dur;
  if (p >= 1) return null;
  const g = L.words.get(o)!;
  const b = L.blocks[g.block];
  const e = eased(Math.max(0, p));
  let x0 = g.x, x1 = g.x + g.w, y0 = g.y, y1 = g.y + g.boxH;
  const edge = PC(cue, 'edge', 'left');
  if (PC(cue, 'style', 'swing') === 'lid') {
    const a = (PC(cue, 'lidDir', -90) * Math.PI) / 180;
    const d = 1.2 * (Math.abs(Math.cos(a)) * g.w + Math.abs(Math.sin(a)) * g.boxH) * e;
    x0 += Math.cos(a) * d; x1 += Math.cos(a) * d; y0 += Math.sin(a) * d; y1 += Math.sin(a) * d;
  } else {
    const s = 1 - e;
    if (edge === 'left') x1 = g.x + g.w * s; else if (edge === 'right') x0 = g.x + g.w * (1 - s);
    else if (edge === 'top') y1 = g.y + g.boxH * s; else y0 = g.y + g.boxH * (1 - s);
  }
  return [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}].map((q) => toWorld(b, q));
};
/** The old word's colour, darkened by up to 40 percent as it turns (rule 57: a leaf swinging, not a word squeezed). */
const doorColour = (c: VerbWordCtx, e: number) => {
  const bg = c.L.board.bg.toUpperCase();
  const base = c.geom.opts.colour ?? c.L.board.colour ?? ((PALETTE.light ?? []).some((k) => k.toUpperCase() === bg) ? PALETTE.ground : PALETTE.paper);
  return mixHex(base, PALETTE.ground, 0.4 * e);
};
registerVerb('door', {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue, L) => [...wordsParam(cue, L, 'old'), ...wordsOfCue(cue, L)],
  defaultAt: (cue, L) => doorTiming(cue, L).start / FPS,
  overlapExempt: (cue, L) => wordsParam(cue, L, 'old').flatMap((o) => wordsOfCue(cue, L).map((n): [number, number] => [o, n])),
  removesAt: (c) => { const d = doorTiming(c.cue, c.L); return d.old.includes(c.i) ? d.start + d.dur : null; },
  // the hinge rule is drawn (rule 57): a Paper hairline along the edge the door turns on, from the opening until
  // 6 frames after it, then it fades over 6 frames (ruling 198: it leaves with the door it belongs to)
  lines: (c) => {
    if (PC(c.cue, 'style', 'swing') === 'lid' || PC(c.cue, 'rule', true) === false) return null;
    const {start, dur, old} = doorTiming(c.cue, c.L);
    const df = c.f - start;
    if (df < 0 || df >= dur + 12 || !old.length) return null;
    const op = 0.7 * exitFade(df, dur + 6);
    const edge = PC(c.cue, 'edge', 'left');
    const g = c.L.words.get(old[0])!;
    const b = c.L.blocks[g.block];
    const pad = 0.12 * g.boxH;
    const ends = edge === 'left' ? [{x: g.x, y: g.y - pad}, {x: g.x, y: g.y + g.boxH + pad}] : edge === 'right' ? [{x: g.x + g.w, y: g.y - pad}, {x: g.x + g.w, y: g.y + g.boxH + pad}]
      : edge === 'top' ? [{x: g.x - pad, y: g.y}, {x: g.x + g.w + pad, y: g.y}] : [{x: g.x - pad, y: g.y + g.boxH}, {x: g.x + g.w + pad, y: g.y + g.boxH}];
    const [a, e] = ends.map((q) => toWorld(b, q));
    const z = c.camAt(c.f).zoom;
    return [{id: `hinge ${g.i}`, kind: 'hinge', a, b: e, width: Math.max(3, 2 / Math.max(0.01, z)), opacity: op, colour: PALETTE.paper, owner: [...wordsOfCue(c.cue, c.L)]}];
  },
  overlay: (c) => drawLines(getVerb('door')?.lines?.(c), c.camAt(c.f).zoom),
  modify: (c) => {
    const {start, dur, old} = doorTiming(c.cue, c.L);
    const p = (c.f - start) / dur;
    if (!old.includes(c.i)) {
      // the new word: there from the first frame of the opening, clipped to what the door has already left (the two
      // are never drawn through each other; ruling 194.2)
      if (p < 0) return {hidden: true, opacity: 0};
      if (p >= 1) return null;
      const holes = old.map((o) => doorQuad(c.cue, c.L, o, c.f)).filter((q): q is Pt[] => !!q).map((q) => q.map((w) => toLocal(c.block, w)));
      if (!holes.length) return null;
      return {clip: rectPath(-BIG, -BIG, BIG, BIG) + holes.map((q) => `M${q.map((v) => `${v.x.toFixed(2)} ${v.y.toFixed(2)}`).join('L')}Z`).join('')};
    }
    if (p < 0) return null;
    if (p >= 1) return {hidden: true, opacity: 0};
    const g = c.geom, ce = centreOf(g);
    const edge = PC(c.cue, 'edge', 'left');
    const e = eased(p);
    if (PC(c.cue, 'style', 'swing') === 'lid') {
      const a = (PC(c.cue, 'lidDir', -90) * Math.PI) / 180;
      const d = 1.2 * (Math.abs(Math.cos(a)) * g.w + Math.abs(Math.sin(a)) * g.boxH) * e;
      return {dx: Math.cos(a) * d, dy: Math.sin(a) * d, opacity: 1 - clamp((p - 0.6) / 0.4)};
    }
    const s = Math.max(0.001, 1 - e);
    const colour = doorColour(c, e);
    if (edge === 'left' || edge === 'right') {
      const ex = edge === 'left' ? g.x : g.x + g.w;
      return {sx: s, dx: (ex - ce.x) * (1 - s), tint: colour};
    }
    const ey = edge === 'top' ? g.y : g.y + g.boxH;
    return {sy: s, dy: (ey - ce.y) * (1 - s), tint: colour};
  },
});
