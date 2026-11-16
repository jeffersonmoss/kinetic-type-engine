// SWELL (rule 65): a word grows to between 2 and 3.5 times its size about its own centre in 8 frames (longer when it is
// big: the corners stay within the cap) and its neighbours are shoved outward by the growth, keeping a 12 px gap. Used on
// repeated words, each repeat larger than the last.
// Two uses. As a cue on a word already on the board: {name: 'swell', word, at, params: {scale}}; the word stays grown.
// As a block's emergence (the repeat): emerge: {move: 'swell', from: {word: earlierWord}}: the new word appears exactly
// over the earlier one, at its size, and swells to its own laid-out size while the earlier word is replaced.
// params: scale (2.5, clamped 2 to 3.5; plain cue only), frames (minimum 8), gap (12), neighbours (words to shove; default
// every word on the board the grown word would come within the gap of, in any block; board rules are pushed the same way,
// ruling 194.7). In the emergence form the repeat starts at the earlier word's dim brightness and brightens as it grows.
import {FPS} from '../config';
import {wordCorners} from '../layout';
import type {BoardLayout, Pt, VerbCue, WordGeom} from '../types';
import {lerp, rot} from '../util';
import {registerVerb} from '../verbRegistry';
import {PC, capFrames, centreOf, eased, firstSf, toLocal, wordsParam, zoomOf} from './common';

const isEmerge = (cue: VerbCue) => cue.params?.emerged === true;
const grower = (cue: VerbCue) => cue.word;
const source = (cue: VerbCue, L: BoardLayout) => (isEmerge(cue) ? wordsParam(cue, L, '__none')[0] : undefined);
const worldCentre = (L: BoardLayout, g: WordGeom): Pt => { const c = wordCorners(L.blocks[g.block], g); return {x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2}; };
/** Start scale relative to the grown word's layout size, and the final scale. */
const scales = (cue: VerbCue, L: BoardLayout) => {
  const g = L.words.get(grower(cue))!;
  const src = source(cue, L);
  if (src !== undefined) { const sg = L.words.get(src)!; return {s0: sg.h / g.h, s1: 1}; }
  return {s0: 1, s1: Math.max(2, Math.min(3.5, PC(cue, 'scale', 2.5)))};
};
export const swellTiming = (cue: VerbCue, L: BoardLayout) => {
  const g = L.words.get(grower(cue))!;
  const {s0, s1} = scales(cue, L);
  const diag = Math.hypot(g.w, g.boxH) / 2;
  const src = source(cue, L);
  const shift = src !== undefined ? (() => { const a = worldCentre(L, L.words.get(src)!), b = worldCentre(L, g); return Math.hypot(a.x - b.x, a.y - b.y); })() : 0;
  const land = isEmerge(cue) ? firstSf(cue, L) : g.sf;
  const dur = capFrames(diag * Math.abs(s1 - s0) + shift, zoomOf(L, g.i, land), PC(cue, 'frames', 8));
  const start = cue.at !== undefined ? cue.at * FPS : isEmerge(cue) ? land - dur : g.sf + 10;
  return {start, dur, s0, s1};
};
/** How a swell pushes something away: in the grower's block frame, the axis ('x' or 'y'), the sign and the gap the
 *  thing had to the grower's laid-out box. */
type Push = {axis: 'x' | 'y'; sign: number; gap0: number};
/** The push on a box (world corners) from a swell (rule 65, ruling 194.7): everything near the grown word is shoved
 *  outward to keep a 12 px gap, in its own block or another, rules too; never grown across. */
export const swellPushOf = (cue: VerbCue, L: BoardLayout, quad: Pt[]): Push | null => {
  const g = L.words.get(grower(cue))!;
  const gb = L.blocks[g.block];
  const {s1} = scales(cue, L);
  const gap = PC(cue, 'gap', 12);
  const loc = quad.map((p) => toLocal(gb, p));
  const x0 = Math.min(...loc.map((p) => p.x)), x1 = Math.max(...loc.map((p) => p.x)), y0 = Math.min(...loc.map((p) => p.y)), y1 = Math.max(...loc.map((p) => p.y));
  const gc = centreOf(g);
  const ex = (g.w * (s1 - 1)) / 2 + gap, ey = (g.boxH * (s1 - 1)) / 2 + gap;
  // would it touch the fully grown box (plus the gap)?
  if (x1 < g.x - ex || x0 > g.x + g.w + ex || y1 < g.y - ey || y0 > g.y + g.boxH + ey) return null;
  // beside the word (its band overlaps the word's height): pushed sideways; otherwise up or down
  const side = y1 > g.y + 0.15 * g.boxH && y0 < g.y + 0.85 * g.boxH;
  if (side) { const left = (x0 + x1) / 2 < gc.x; return {axis: 'x', sign: left ? -1 : 1, gap0: left ? g.x - x1 : x0 - (g.x + g.w)}; }
  const above = (y0 + y1) / 2 < gc.y;
  return {axis: 'y', sign: above ? -1 : 1, gap0: above ? g.y - y1 : y0 - (g.y + g.boxH)};
};
/** World offset of a pushed thing at frame f. */
export const swellOffsetAt = (cue: VerbCue, L: BoardLayout, push: Push, f: number): Pt => {
  const g = L.words.get(grower(cue))!;
  const t = swellTiming(cue, L);
  const p = (f - t.start) / t.dur;
  if (p <= 0) return {x: 0, y: 0};
  const s = lerp(t.s0, t.s1, eased(p));
  const extra = push.axis === 'x' ? (g.w * (s - 1)) / 2 : (g.boxH * (s - 1)) / 2;
  const d = Math.max(0, extra + PC(cue, 'gap', 12) - Math.max(0, push.gap0)) * push.sign;
  return rot(push.axis === 'x' ? {x: d, y: 0} : {x: 0, y: d}, L.blocks[g.block].angle);
};
const nbMemo = new WeakMap<VerbCue, Map<number, Push>>();
const neighbourPushes = (cue: VerbCue, L: BoardLayout): Map<number, Push> => {
  const hit = nbMemo.get(cue);
  if (hit) return hit;
  const out = new Map<number, Push>();
  const g = L.words.get(grower(cue))!;
  const src = source(cue, L);
  const only = cue.params?.neighbours !== undefined ? new Set(wordsParam(cue, L, 'neighbours')) : null;
  if (!isEmerge(cue)) for (const i of L.order) {
    if (i === g.i || i === src || (only && !only.has(i))) continue;
    const n = L.words.get(i)!;
    const pu = swellPushOf(cue, L, wordCorners(L.blocks[n.block], n));
    if (pu) out.set(i, pu);
  }
  nbMemo.set(cue, out);
  return out;
};
const neighbours = (cue: VerbCue, L: BoardLayout): number[] => [...neighbourPushes(cue, L).keys()];
registerVerb('swell', {
  early: true, gradual: true,
  replacesEnter: false,
  affects: (cue, L) => [grower(cue), ...neighbours(cue, L), ...(source(cue, L) !== undefined ? [source(cue, L)!] : [])],
  defaultAt: (cue, L) => swellTiming(cue, L).start / FPS,
  overlapExempt: (cue, L) => (source(cue, L) !== undefined ? [[grower(cue), source(cue, L)!]] : []),
  removesAt: (c) => (c.i === source(c.cue, c.L) ? swellTiming(c.cue, c.L).start : null),
  modify: (c) => {
    const t = swellTiming(c.cue, c.L);
    const p = (c.f - t.start) / t.dur;
    const gi = grower(c.cue);
    const src = source(c.cue, c.L);
    const g = c.L.words.get(gi)!;
    const s = lerp(t.s0, t.s1, eased(p));
    if (c.i === src) return p >= 0 ? {hidden: true, opacity: 0} : null;
    if (c.i === gi) {
      if (src !== undefined && p < 0) return {hidden: true, opacity: 0};
      if (src !== undefined && p < 1) {
        // the repeat grows out of the earlier word: it starts at that word's brightness (retired text is dim) and
        // brightens as it grows, so the growth is what is seen, not a fade (ruling 194.7)
        const o0 = 0.45;
        const a = toLocal(c.block, worldCentre(c.L, c.L.words.get(src)!)), b = centreOf(g);
        const e = eased(p);
        return {sx: s, sy: s, dx: (a.x - b.x) * (1 - e), dy: (a.y - b.y) * (1 - e), opacity: lerp(o0, 1, e)};
      }
      if (src === undefined && p <= 0) return null;
      // emergence: start exactly over the source word, then travel to its own place while growing
      let dx = 0, dy = 0;
      if (src !== undefined) {
        const a = toLocal(c.block, worldCentre(c.L, c.L.words.get(src)!)), b = centreOf(g);
        dx = (a.x - b.x) * (1 - eased(p)); dy = (a.y - b.y) * (1 - eased(p));
      }
      return {sx: s, sy: s, dx, dy};
    }
    // neighbour (any block of the board): shoved outward by the growth with a 12 px gap
    if (src !== undefined || p <= 0) return null;
    const pu = neighbourPushes(c.cue, c.L).get(c.i);
    if (!pu) return null;
    const w = rot(swellOffsetAt(c.cue, c.L, pu, c.f), -c.block.angle);
    return {dx: w.x, dy: w.y};
  },
});
