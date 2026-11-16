// MORPH (rules 58, 69, 104, 171): letters become other letters. The letters two words share stay on screen and travel
// to their new places at no more than 32 px per frame (straight, or round a centre for the chorus W). Each letter that
// is not shared collapses to its own centre line in 10 frames while the new letters open from theirs over 10 frames,
// starting 3 frames later (13 frames in all, ruling 194.10; the stages overlap by 7), and a narrowing letter fades with
// its width so it never shows as a bright sliver. The source word stays unretired until the morph is done, the
// target counts as displayed from the frame its last new letter is fully open, and the source is gone from that frame.
// Declare it on the target block: emerge: {move: 'morph', from: {word: BUG}, params: {keep: 'UG'}}, or build it with
// morph({from, to, keep}) from authoring.ts. params: fromWords (source words, default the anchor's word), keep (letters kept, in
// order, e.g. 'UG'; or pairs [[sourceLetter, targetLetter], ...] over the letters of all source / target words in reading
// order), arc ({about: Pt (world), dir: 1 | -1}: kept letters travel round it), collapse (10), delay (3).
import {FPS} from '../config';
import {letterBoxes} from '../letters';
import type {BoardLayout, Pt, VerbCue} from '../types';
import {clamp, easeInOutSine, normDeg} from '../util';
import {letterIdentity, registerVerb, type LetterMod} from '../verbRegistry';
import {PC, SINE_PEAK, blockOf, capFrames, toLocal, toWorld, wordsOfCue, wordsParam, zoomOf} from './common';

/** A morph lasts at least this many frames (ruling 194.10: 12 to 14). */
export const MORPH_MIN_FRAMES = 12;
/** Opacity of a closing or opening letter at width fraction w: under a third of its width it fades with the width, so
 *  a closing letter never passes through a bright sliver that reads as an I (ruling 194.10). */
const sliver = (w: number) => clamp(w * 3);
type Letter = {word: number; k: number; ch: string; c: Pt; w: number; h: number; angle: number};
const lettersOf = (L: BoardLayout, words: number[]): Letter[] => words.flatMap((i) => {
  const g = L.words.get(i)!;
  const b = L.blocks[g.block];
  return letterBoxes(g).map((lb) => ({word: i, k: lb.k, ch: lb.ch.toUpperCase(), c: toWorld(b, {x: lb.x + lb.w / 2, y: lb.y + lb.h / 2}), w: lb.w, h: lb.h, angle: b.angle}));
});
const srcWords = (cue: VerbCue, L: BoardLayout) => (cue.params?.fromWords !== undefined ? wordsParam(cue, L, 'fromWords') : wordsParam(cue, L, '__none'));
/** Kept letter pairs: indices into the flattened source and target letter lists. */
export const morphPairs = (cue: VerbCue, L: BoardLayout): [number, number][] => {
  const keep = cue.params?.keep as string | [number, number][] | undefined;
  if (Array.isArray(keep)) return keep;
  const S = lettersOf(L, srcWords(cue, L)), T = lettersOf(L, wordsOfCue(cue, L));
  const out: [number, number][] = [];
  let si = 0, ti = 0;
  for (const ch of (keep ?? '').toUpperCase()) {
    while (si < S.length && S[si].ch !== ch) si++;
    while (ti < T.length && T[ti].ch !== ch) ti++;
    if (si >= S.length || ti >= T.length) break;
    out.push([si++, ti++]);
  }
  return out;
};
type Plan = {start: number; travel: number; collapse: number; delay: number; end: number; pairs: [number, number][]; S: Letter[]; T: Letter[]};
const memo = new WeakMap<VerbCue, Plan>();
export const morphPlan = (cue: VerbCue, L: BoardLayout): Plan => {
  const hit = memo.get(cue);
  if (hit) return hit;
  const S = lettersOf(L, srcWords(cue, L)), T = lettersOf(L, wordsOfCue(cue, L));
  const pairs = morphPairs(cue, L);
  const land = Math.min(...wordsOfCue(cue, L).map((i) => L.words.get(i)!.sf));
  const z = zoomOf(L, cue.word, land);
  const arc = cue.params?.arc as {about: Pt; dir?: number} | undefined;
  let dist = 0;
  for (const [a, b] of pairs) {
    const p = S[a].c, q = T[b].c;
    if (arc) {
      const r0 = Math.hypot(p.x - arc.about.x, p.y - arc.about.y), r1 = Math.hypot(q.x - arc.about.x, q.y - arc.about.y);
      const a0 = Math.atan2(p.y - arc.about.y, p.x - arc.about.x), a1 = Math.atan2(q.y - arc.about.y, q.x - arc.about.x);
      let da = a1 - a0; const dir = arc.dir ?? 1;
      while (dir > 0 ? da < 0 : da > 0) da += dir > 0 ? 2 * Math.PI : -2 * Math.PI;
      dist = Math.max(dist, Math.abs(da) * Math.max(r0, r1) + Math.abs(r1 - r0));
    } else dist = Math.max(dist, Math.hypot(q.x - p.x, q.y - p.y));
  }
  // 12 to 14 frames in all (ruling 194.10): each stage 10 frames, the opening 3 behind the closing (overlap 7)
  const collapse = Math.max(8, PC(cue, 'collapse', 10));
  const delay = PC(cue, 'delay', 3);
  const travel = pairs.length ? capFrames(dist, z, collapse + delay, SINE_PEAK) : 0;
  const dur = Math.max(delay + collapse, travel, MORPH_MIN_FRAMES);
  const start = cue.at !== undefined ? cue.at * FPS : cue.params?.showFrom !== undefined ? (cue.params.showFrom as number) * FPS : land - dur;
  const plan = {start, travel, collapse, delay, end: start + dur, pairs, S, T};
  memo.set(cue, plan);
  return plan;
};
const allPairs = (cue: VerbCue, L: BoardLayout) => srcWords(cue, L).flatMap((a) => wordsOfCue(cue, L).map((b): [number, number] => [a, b]));

registerVerb('morph', {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue, L) => [...srcWords(cue, L), ...wordsOfCue(cue, L)],
  defaultAt: (cue, L) => morphPlan(cue, L).start / FPS,
  overlapExempt: allPairs,
  holds: (cue, L) => { const p = morphPlan(cue, L); return srcWords(cue, L).map((word) => ({word, until: p.end})); },
  displayFrom: (cue, L, i) => (wordsOfCue(cue, L).includes(i) ? morphPlan(cue, L).end : null),
  removesAt: (c) => (srcWords(c.cue, c.L).includes(c.i) ? morphPlan(c.cue, c.L).end : null),
  modify: (c) => {
    const pl = morphPlan(c.cue, c.L);
    const f = c.f;
    const isSrc = srcWords(c.cue, c.L).includes(c.i);
    const n = c.geom.adv.length;
    if (isSrc) {
      if (f < pl.start) return null;
      if (f >= pl.end) return {hidden: true, opacity: 0};
      const base = pl.S.findIndex((l) => l.word === c.i);
      const letters: LetterMod[] = Array.from({length: n}, (_, k) => {
        const si = base + k;
        const pair = pl.pairs.find(([a]) => a === si);
        if (!pair) { const w = Math.max(0.001, 1 - easeInOutSine((f - pl.start) / pl.collapse)); return {...letterIdentity(), sx: w, opacity: sliver(w)}; }
        const from = pl.S[si], to = pl.T[pair[1]];
        const u = pl.travel > 0 ? easeInOutSine((f - pl.start) / pl.travel) : 1;
        const arc = c.cue.params?.arc as {about: Pt; dir?: number} | undefined;
        let q: Pt;
        if (arc) {
          const r0 = Math.hypot(from.c.x - arc.about.x, from.c.y - arc.about.y), r1 = Math.hypot(to.c.x - arc.about.x, to.c.y - arc.about.y);
          const a0 = Math.atan2(from.c.y - arc.about.y, from.c.x - arc.about.x);
          let da = Math.atan2(to.c.y - arc.about.y, to.c.x - arc.about.x) - a0; const dir = arc.dir ?? 1;
          while (dir > 0 ? da < 0 : da > 0) da += dir > 0 ? 2 * Math.PI : -2 * Math.PI;
          const r = r0 + (r1 - r0) * u, ang = a0 + da * u;
          q = {x: arc.about.x + Math.cos(ang) * r, y: arc.about.y + Math.sin(ang) * r};
        } else q = {x: from.c.x + (to.c.x - from.c.x) * u, y: from.c.y + (to.c.y - from.c.y) * u};
        const ql = toLocal(c.block, q), pl0 = toLocal(c.block, from.c);
        const s = 1 + (to.h / from.h - 1) * u;
        const sx = (1 + ((to.w / Math.max(1e-6, from.w)) / (to.h / from.h) - 1) * u);
        return {dx: ql.x - pl0.x, dy: ql.y - pl0.y, rot: normDeg(to.angle - from.angle) * u, s, sx, opacity: 1};
      });
      return {letters};
    }
    // target word
    if (f < pl.start) return {hidden: true, opacity: 0};
    if (f >= pl.end) return null;
    const base = pl.T.findIndex((l) => l.word === c.i);
    const letters: LetterMod[] = Array.from({length: n}, (_, k) => {
      const ti = base + k;
      if (pl.pairs.some(([, b]) => b === ti)) return {...letterIdentity(), opacity: 0}; // the travelling letter stands in
      const o = clamp((f - pl.start - pl.delay) / pl.collapse);
      const e = Math.max(0.001, easeInOutSine(o));
      return {...letterIdentity(), sx: e, opacity: sliver(e)};
    });
    return {letters};
  },
});
void blockOf;
