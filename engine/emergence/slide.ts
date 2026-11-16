// Edge entrances (Fable item 37, ported from the Huang kit's wordState.ts entrancePlan and entranceMod): slideFrom and
// rise. Both use the Huang slide profile (cruise at constant speed, then ease out over the last 40 percent; 30 px per
// frame of own motion, just under the 32 px cap) and end each word on its own sung frame. The direction and distance
// are measured on screen with the camera of the word's sung frame, then held in the block's frame.
// slideFrom: each word slides in from a frame edge, starting just off frame. Validator `slide-early` (error): a
// slideFrom word more than half in frame earlier than `earlyOk` (8) frames before it is sung (Huang amendment A4).
// rise: each word rises out from behind a line just under its own landed box (`gap` 4 px), clipped there; `dir` turns
// it into a drawer from its own trailing side ('up' default, 'down', 'left', 'right').
// params (both): frames (minimum; slideFrom 8, rise 6), linear ({speed, settle}: constant speed, sine settle over the
// last `settle` frames), drop (px, slideFrom only: an extra fall over the last dropFrames (4) frames).
// slideFrom: edge 'left' | 'right' | 'top' | 'bottom' (the frame edge it enters from; authoring's slideFrom({from}) sets it), earlyOk (8). rise: dir, gap (4).
import {FPS, HEIGHT, WIDTH} from '../config';
import {camForBlock, toScreen, toWorld} from '../camera';
import {blockToWorld, worldToBlock} from '../layout';
import type {BoardLayout, Pt, VerbCue} from '../types';
import {clamp, easeInOutSine} from '../util';
import {registerVerb} from '../verbRegistry';
import {PC, wordsOfCue} from './common';

const SLIDE_EASE = 0.4;
const SLIDE_FACTOR = 1 - SLIDE_EASE + (SLIDE_EASE * 2) / Math.PI;
export const ENTRANCE_SPEED = 30;
export const SLIDE_EARLY_OK = 8;
const slideRemaining = (D: number, N: number, d: number) => {
  const u = clamp((d + N) / N);
  const v = D / (N * SLIDE_FACTOR);
  const a = SLIDE_EASE;
  const s = u < 1 - a ? v * N * u : v * N * (1 - a) + v * N * a * (2 / Math.PI) * Math.sin(((u - (1 - a)) / a) * (Math.PI / 2));
  return Math.max(0, D - s);
};
const linearRemaining = (speed: number, settle: number, d: number) => {
  const settleDist = (speed * settle * 2) / Math.PI;
  if (d >= 0) return 0;
  if (d >= -settle) return settleDist * (1 - Math.sin(((d + settle) / settle) * (Math.PI / 2)));
  return settleDist + speed * (-settle - d);
};
const linearFrames = (D: number, speed: number, settle: number) => settle + Math.max(0, Math.ceil((D - (speed * settle * 2) / Math.PI) / speed));
const DIRS: Record<string, Pt> = {left: {x: -1, y: 0}, right: {x: 1, y: 0}, up: {x: 0, y: -1}, down: {x: 0, y: 1}};

type Plan = {N: number; D: number; dir: Pt; clip?: string};
const memo = new WeakMap<VerbCue, Map<number, Plan>>();
/** Screen quad of word i's landed box at its sung frame. */
const landedQuad = (L: BoardLayout, i: number) => {
  const g = L.words.get(i)!;
  const b = L.blocks[g.block];
  const cam = camForBlock(L.board, g.block, g.sf);
  return {cam, q: [{x: g.x, y: g.y}, {x: g.x + g.w, y: g.y}, {x: g.x + g.w, y: g.y + g.boxH}, {x: g.x, y: g.y + g.boxH}].map((p) => toScreen(cam, blockToWorld(b, p)))};
};
export const edgeEntrancePlan = (cue: VerbCue, L: BoardLayout, i: number): Plan => {
  let m = memo.get(cue);
  if (!m) { m = new Map(); memo.set(cue, m); }
  const hit = m.get(i);
  if (hit) return hit;
  const {cam, q} = landedQuad(L, i);
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  const linear = cue.params?.linear as {speed: number; settle: number} | undefined;
  const frames = (D: number, min: number) => (linear ? linearFrames(D, linear.speed, linear.settle) : Math.max(min, 6, Math.ceil(D / (ENTRANCE_SPEED * SLIDE_FACTOR))));
  let plan: Plan;
  if (cue.name === 'slideFrom') {
    const from = PC(cue, 'edge', 'right') as string;
    const D = Math.max(0, from === 'right' ? WIDTH - Math.min(...xs) + 2 : from === 'left' ? Math.max(...xs) + 2 : from === 'top' ? Math.max(...ys) + 2 : HEIGHT - Math.min(...ys) + 2);
    const dir = from === 'right' ? DIRS.left : from === 'left' ? DIRS.right : from === 'top' ? DIRS.down : DIRS.up;
    plan = {N: frames(D, PC(cue, 'frames', 8)), D, dir};
  } else {
    const dir = DIRS[PC(cue, 'dir', 'up') as string] ?? DIRS.up;
    const proj = q.map((p) => p.x * dir.x + p.y * dir.y);
    const gap = PC(cue, 'gap', 4);
    const D = Math.max(...proj) - Math.min(...proj) + gap;
    // the edge the word comes out from behind: its landed box's trailing side, `gap` behind it (static, block frame)
    const p0 = Math.min(...proj) - gap;
    const perp = {x: -dir.y, y: dir.x};
    const c = {x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2};
    const along = c.x * perp.x + c.y * perp.y;
    const o = {x: dir.x * p0 + perp.x * along, y: dir.y * p0 + perp.y * along};
    const B = 6000;
    const b = L.blocks[L.words.get(i)!.block];
    const poly = [{x: o.x - perp.x * B, y: o.y - perp.y * B}, {x: o.x + perp.x * B, y: o.y + perp.y * B},
      {x: o.x + perp.x * B + dir.x * B, y: o.y + perp.y * B + dir.y * B}, {x: o.x - perp.x * B + dir.x * B, y: o.y - perp.y * B + dir.y * B}]
      .map((p) => worldToBlock(b, toWorld(cam, p)));
    plan = {N: frames(D, PC(cue, 'frames', 6)), D, dir, clip: poly.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('') + 'Z'};
  }
  m.set(i, plan);
  return plan;
};

for (const name of ['slideFrom', 'rise'] as const) registerVerb(name, {
  early: true, replacesEnter: true,
  affects: (cue, L) => wordsOfCue(cue, L),
  defaultAt: (cue, L) => Math.min(...wordsOfCue(cue, L).map((i) => L.words.get(i)!.sf - edgeEntrancePlan(cue, L, i).N)) / FPS,
  // a slideFrom word starts wholly off frame, a rise word wholly clipped: both arrive by motion, never by a pop
  gradual: true,
  modify: (c) => {
    const plan = edgeEntrancePlan(c.cue, c.L, c.i);
    const d = c.f - c.geom.sf;
    if (d >= 0) return null;
    if (d < -plan.N) return {hidden: true, opacity: 0};
    const linear = c.cue.params?.linear as {speed: number; settle: number} | undefined;
    const rem = linear ? linearRemaining(linear.speed, linear.settle, d) : slideRemaining(plan.D, plan.N, d);
    // a screen offset at the sung frame's camera, as a block-local offset
    const cam = camForBlock(c.L.board, c.geom.block, c.geom.sf);
    const w0 = worldToBlock(c.block, toWorld(cam, {x: 0, y: 0})), w1 = worldToBlock(c.block, toWorld(cam, {x: -plan.dir.x * rem, y: -plan.dir.y * rem}));
    let dy = w1.y - w0.y;
    const drop = PC(c.cue, 'drop', 0);
    if (name === 'slideFrom' && drop) { const df = PC(c.cue, 'dropFrames', 4); dy -= drop * (1 - easeInOutSine(clamp((d + df) / df))); }
    return {dx: w1.x - w0.x, dy, clip: plan.clip};
  },
});
