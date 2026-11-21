// SHOVE, mode 'push' (rule 59), extending the K8 shove (whose behaviour is unchanged when `mode` is not 'push').
// The new words enter along a direction at a steady speed within the 32 px per frame cap; the old block moves away only
// while touched, keeping a 12 px gap, then coasts to rest in 6 frames. With `corner` the old block is then pushed round
// a corner: it turns a quarter turn about its far end and becomes a margin note.
// params: mode 'push', target (old words; default every word of the anchor's block), dir (world degrees the new words
// travel; default from the new block toward the old one), distance (world px the new words travel; default: from just
// outside the frame, ruling 194.5), enter ('edge' default; 'near': only their own extent plus the gap), gap (12), corner
// (1 or -1: turn direction after the push). The push replaces the new words' entrance (replacesEnter), not the old
// block's. The new words are at full opacity throughout; the validator errors when the
// push never touches the old block (shove-contact).
import {FPS, HEIGHT, WIDTH} from '../config';
import {camForBlock, toScreen} from '../camera';
import {wordCorners} from '../layout';
import {SPEED_CAP} from '../motion';
import type {BoardLayout, Pt, VerbCue} from '../types';
import {clamp, easeInOutSine, rot} from '../util';
import {getVerb, registerVerb, type VerbDef} from '../verbRegistry';
import {PC, SINE_PEAK, anchorBlockWords, capFrames, firstSf, wordsOfCue, wordsParam, zoomOf} from './common';

const old = getVerb('shove') as VerbDef;
const isPush = (cue: VerbCue) => cue.params?.mode === 'push';
const targets = (cue: VerbCue, L: BoardLayout) => (cue.params?.target !== undefined ? wordsParam(cue, L, 'target') : anchorBlockWords(cue, L));
const cornersOf = (L: BoardLayout, ws: number[]) => ws.flatMap((i) => { const g = L.words.get(i)!; return wordCorners(L.blocks[g.block], g); });
const mean = (pts: Pt[]) => pts.reduce((a, p) => ({x: a.x + p.x / pts.length, y: a.y + p.y / pts.length}), {x: 0, y: 0});
type Plan = {u: Pt; D: number; v: number; start: number; travelF: number; contact: number; S: number; coast: number; turnStart: number; turnF: number; pivot: Pt; corner: number};
const memo = new WeakMap<VerbCue, Plan>();
export const pushPlan = (cue: VerbCue, L: BoardLayout): Plan => {
  const hit = memo.get(cue);
  if (hit) return hit;
  const mine = wordsOfCue(cue, L), tg = targets(cue, L);
  const mc = cornersOf(L, mine), tc = cornersOf(L, tg);
  const dirDeg = cue.params?.dir as number | undefined;
  let u: Pt;
  if (dirDeg !== undefined) u = {x: Math.cos((dirDeg * Math.PI) / 180), y: Math.sin((dirDeg * Math.PI) / 180)};
  else { const a = mean(mc), b = mean(tc); const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; u = {x: (b.x - a.x) / l, y: (b.y - a.y) / l}; }
  const proj = (p: Pt) => p.x * u.x + p.y * u.y;
  const gap = PC(cue, 'gap', 12);
  const ext = Math.max(...mc.map(proj)) - Math.min(...mc.map(proj));
  const land = firstSf(cue, L);
  const z = zoomOf(L, cue.word, land);
  // the new words enter from outside the frame along dir (ruling 194.5: never a fade in place): the distance that
  // puts their landed box just past the frame edge behind them, at the camera of the landing frame
  const cam = camForBlock(L.board, L.words.get(cue.word)!.block, land);
  const us = rot(u, cam.rot);
  const sp = (p: Pt) => { const q = toScreen(cam, p); return q.x * us.x + q.y * us.y; };
  const frame = [{x: 0, y: 0}, {x: WIDTH, y: 0}, {x: 0, y: HEIGHT}, {x: WIDTH, y: HEIGHT}].map((q) => q.x * us.x + q.y * us.y);
  const offscreen = (Math.max(...mc.map(sp)) - Math.min(...frame)) / Math.max(0.01, cam.zoom) + gap;
  // the old block must end clear of the new words' final place by the gap
  const S = Math.max(0, Math.max(...mc.map(proj)) + gap - Math.min(...tc.map(proj)));
  // kit pass 21: the new words travel at least S plus the gap, so they touch the old block after setting off (when S
  // exceeded D the old block jumped by S - D on the first frame: a speed error)
  const D = Math.max(S + gap, PC(cue, 'distance', PC(cue, 'enter', 'edge') === 'edge' ? Math.max(ext + gap, offscreen) : ext + gap));
  // kit pass 21: the steady speed keeps 8 percent under the cap at the largest zoom either block is seen at during the
  // push and its coast (the zoom at the landing frame alone let rig drift or a dive carry it over the cap)
  const blocks = [...new Set([...mine, ...tg].map((i) => L.words.get(i)!.block))];
  const zoomMax = (f0: number, f1: number) => { let m = z; for (let f = Math.floor(f0); f <= Math.ceil(f1); f++) for (const k of blocks) m = Math.max(m, camForBlock(L.board, k, f).zoom); return m; };
  let v = Math.min(SPEED_CAP / Math.max(0.01, z), D / 6);
  for (let pass = 0; pass < 2; pass++) {
    const tf = Math.ceil(D / v), s0 = cue.at !== undefined ? cue.at * FPS : land - tf;
    v = Math.min((0.92 * SPEED_CAP) / Math.max(0.01, zoomMax(s0, s0 + tf + 6)), D / 6);
  }
  const travelF = Math.ceil(D / v);
  const start = cue.at !== undefined ? cue.at * FPS : land - travelF;
  const contact = D - S; // distance the new words travel before they touch
  const coast = 6;
  const corner = PC(cue, 'corner', 0);
  // pivot: the old block's far end (farthest along u), at its middle across
  const far = tc.reduce((a, p) => (proj(p) > proj(a) ? p : a), tc[0]);
  const len = Math.max(...tc.map(proj)) - Math.min(...tc.map(proj));
  const turnF = corner ? capFrames((len * Math.PI) / 2, z, 9, SINE_PEAK, cue) : 0;
  const plan = {u, D, v, start, travelF, contact, S, coast, turnStart: start + travelF + coast, turnF, pivot: far, corner};
  memo.set(cue, plan);
  return plan;
};
registerVerb('shove', {
  ...old,
  early: true,
  gradual: true,
  affects: (cue, L) => (isPush(cue) ? [...wordsOfCue(cue, L), ...targets(cue, L)] : old.affects!(cue, L)),
  // the push is the new words' entrance (they arrive from outside the frame), as every other emergence move replaces
  // its words' entrance; the old block it pushes keeps its own (the K8 shove replaces none)
  replacesEnter: (cue, L) => (isPush(cue) ? wordsOfCue(cue, L) : []),
  // kit pass 21: the new words are hidden until they set off. modify() said so for df < 0, but the kit does not call a
  // verb before its start (lead 0), so they stood at full opacity in their landed place, then jumped back by the push
  // distance on the first frame (arrival-pop, speed)
  hiddenBefore: (cue, L) => (isPush(cue) ? wordsOfCue(cue, L) : []),
  overlapExempt: (cue, L) => (isPush(cue) ? wordsOfCue(cue, L).flatMap((a) => targets(cue, L).map((b): [number, number] => [a, b])) : old.overlapExempt!(cue, L)),
  defaultAt: (cue, L) => (isPush(cue) ? pushPlan(cue, L).start / FPS : old.defaultAt!(cue, L)),
  modify: (c) => {
    if (!isPush(c.cue)) return old.modify!(c);
    const pl = pushPlan(c.cue, c.L);
    const df = c.f - pl.start;
    const mine = wordsOfCue(c.cue, c.L).includes(c.i);
    const toLocalVec = (w: Pt) => rot(w, -c.block.angle);
    if (mine) {
      if (df < 0) return {hidden: true, opacity: 0};
      const x = Math.min(pl.D, df * pl.v); // travelled
      const back = toLocalVec({x: -pl.u.x * (pl.D - x), y: -pl.u.y * (pl.D - x)});
      return x >= pl.D ? null : {dx: back.x, dy: back.y};
    }
    if (df < 0) return null;
    const x = Math.min(pl.D, df * pl.v);
    let d = Math.max(0, x - pl.contact);
    if (df > pl.travelF && pl.S > 0) { const k = clamp((df - pl.travelF) / pl.coast); d = pl.S + pl.v * pl.coast * (k - k * k / 2) / 1; }
    const shift = toLocalVec({x: pl.u.x * d, y: pl.u.y * d});
    let out: {dx: number; dy: number; rot?: number} = {dx: shift.x, dy: shift.y};
    if (pl.corner && c.f > pl.turnStart) {
      const a = 90 * pl.corner * easeInOutSine((c.f - pl.turnStart) / pl.turnF);
      // rotate the word's centre about the pivot (world), applied in this block's frame
      const g = c.geom;
      const cw = wordCorners(c.block, g);
      const cen = {x: (cw[0].x + cw[2].x) / 2 + pl.u.x * d, y: (cw[0].y + cw[2].y) / 2 + pl.u.y * d};
      const piv = {x: pl.pivot.x + pl.u.x * d, y: pl.pivot.y + pl.u.y * d};
      const r = rot({x: cen.x - piv.x, y: cen.y - piv.y}, a);
      const moved = toLocalVec({x: piv.x + r.x - cen.x, y: piv.y + r.y - cen.y});
      out = {dx: out.dx + moved.x, dy: out.dy + moved.y, rot: a};
    }
    return out;
  },
});
