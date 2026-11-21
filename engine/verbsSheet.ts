// Sheet verbs (Fable item 39), ported from the Huang kit's verbsV2.ts (its Storyboard v2 builder notes items 19 to 23):
// grow, shoveUp, turnBack, tumble, sinkBehind, slideAlong. Registered through the verb registry like the verbs in
// verbs.tsx. Every own motion stays at or under the 32 px per frame cap on screen (it divides by the camera
// zoom to turn screen px into block px).
import {FPS, PALETTE} from './config';
import {toScreen, toWorld} from './camera';
import {blockToWorld, worldToBlock} from './layout';
import type {BoardLayout, Pt, VerbCue, WordGeom} from './types';
import {clamp, easeInOutSine, rand, rot} from './util';
import {letterIdentity, registerVerb, type VerbWordCtx} from './verbRegistry';

const P = <T,>(c: {cue: VerbCue}, key: string, dflt: T): T => ((c.cue.params?.[key] as T | undefined) ?? dflt);
const rowmates = (L: BoardLayout, i: number): WordGeom[] => {
  const w = L.words.get(i)!;
  return L.blocks[w.block].words.filter((g) => Math.abs(g.y - w.y) < 1);
};
/** Screen vector to block-local vector for this word at the cue's camera. */
const screenToBlockVec = (c: VerbWordCtx, v: Pt): Pt => {
  const cam = c.camAt(c.at * FPS);
  return rot(rot({x: v.x / cam.zoom, y: v.y / cam.zoom}, -cam.rot), -c.block.angle);
};
/** A block-local clip polygon from a screen polygon at the cue's camera (static while the verb runs). */
const screenPolyToBlockClip = (c: VerbWordCtx, poly: Pt[]) => {
  const cam = c.camAt(c.at * FPS);
  return poly.map((p, k) => { const q = worldToBlock(c.block, toWorld(cam, p)); return `${k ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join('') + 'Z';
};

// grow(to, frames): the cue word scales about its baseline centre; the words before it on its row move left and the
// words after it move right by half its growth, so the row opens round it (hook 2 ALL IN, Growth., MORE).
registerVerb('grow', {
  affects: (cue, L) => rowmates(L, cue.word).map((g) => g.i),
  reserve: (cue) => ({sx: (cue.params?.to as number | undefined) ?? 1.4, sy: (cue.params?.to as number | undefined) ?? 1.4}),
  modify: (c) => {
    if (c.df < 0) return null;
    const to = P(c, 'to', 1.4), frames = P(c, 'frames', 8);
    const s = 1 + (to - 1) * easeInOutSine(c.df / frames);
    const w = c.L.words.get(c.cue.word)!;
    const half = (w.w * (s - 1)) / 2;
    if (c.i === c.cue.word) {
      const cy = w.y + w.h / 2;
      return {sx: s, sy: s, dy: (w.baseline - cy) * (1 - s)};
    }
    return {dx: c.geom.x < w.x ? -half : half};
  },
});

// shoveUp(steps, shrink): on each step frame the affected words rise by `dy` block px and shrink by `shrink`, eased
// over 8 frames (hook 3's ALL IN pile: each new ALL IN shoves the ones above it up and smaller).
registerVerb('shoveUp', {
  early: true,
  modify: (c) => {
    const steps = P<number[]>(c, 'steps', [c.at * FPS]);
    const dy = P(c, 'dy', c.geom.h * 1.15), shrink = P(c, 'shrink', 0.85);
    let n = 0;
    for (const s of steps) n += easeInOutSine(clamp((c.f - s) / 8));
    if (n <= 0) return null;
    const sc = Math.pow(shrink, n);
    return {dy: -dy * n, sx: sc, sy: sc};
  },
});

// turnBack(direction): each letter flips about its upright axis (8 frames, letters 1 frame apart), turning from the
// lyric colour to `back` (default the palette's body colour) at the half-way point, ending mirrored; then the word
// slides 60 px in `direction`. params.fallback = true turns the whole word at once. (The Huang kit also outlines the
// turned word with a 3 px stroke; the engine's WordMod has no stroke, so that is left out.)
registerVerb('turnBack', {
  modify: (c) => {
    if (c.df < 0) return null;
    const n = c.geom.adv.length;
    const whole = P(c, 'fallback', false);
    const flipEnd = 8 + (whole ? 0 : n - 1);
    const letters = c.geom.adv.map((_, k) => {
      const p = clamp((c.df - (whole ? 0 : k)) / 8);
      return {...letterIdentity(), sx: Math.cos(Math.PI * easeInOutSine(p)) || 0.001};
    });
    const turned = c.df >= (whole ? 4 : 4 + (n - 1) / 2);
    const dir = P(c, 'direction', 'left') === 'left' ? -1 : 1;
    const slide = 60 * easeInOutSine(clamp((c.df - flipEnd) / 10));
    const v = screenToBlockVec(c, {x: dir * slide, y: 0});
    return {letters, dx: v.x, dy: v.y, ...(turned ? {colour: P(c, 'back', PALETTE.body ?? PALETTE.shadow)} : {})};
  },
});

/** Screen distance fallen d frames after release: accelerates at 3 px per frame per frame up to 30 px per frame. */
const TUMBLE_ACC = 3, TUMBLE_VMAX = 30;
const tumbleFall = (d: number) => {
  if (d <= 0) return 0;
  const tv = TUMBLE_VMAX / TUMBLE_ACC;
  return d < tv ? (TUMBLE_ACC * d * d) / 2 : (TUMBLE_ACC * tv * tv) / 2 + TUMBLE_VMAX * (d - tv);
};
/** Frames a tumbling letter falls before it is surely below any window (800 screen px). */
export const tumbleFallFrames = (px: number) => Math.ceil(TUMBLE_VMAX / TUMBLE_ACC + Math.max(0, px - (TUMBLE_ACC * (TUMBLE_VMAX / TUMBLE_ACC) ** 2) / 2) / TUMBLE_VMAX);
export const TUMBLE_FALL_FRAMES = tumbleFallFrames(800);
/** Frames a letter of this cue falls before it is gone: params.out is the screen distance that takes it below the
 *  window (default 800 px). */
const fallFramesOf = (c: {cue: VerbCue}) => tumbleFallFrames(P(c, 'out', 800));
const tumbleOrder = (c: {cue: VerbCue}, n: number): number[] => {
  const o = P<'left' | 'right' | 'random' | number[]>(c, 'order', 'left');
  if (Array.isArray(o)) return o;
  const idx = Array.from({length: n}, (_, k) => k);
  if (o === 'right') return idx.reverse();
  if (o === 'random') return idx.map((k) => ({k, r: rand(k * 7.3 + n)})).sort((a, b) => a.r - b.r).map((x) => x.k);
  return idx;
};
/** Release frame offset of letter k within the cue (frames after `at`). */
const tumbleDelay = (c: {cue: VerbCue}, n: number, k: number) => {
  const span = P(c, 'span', 16);
  const order = tumbleOrder(c, n);
  const rank = order.indexOf(k);
  return n > 1 ? Math.round((span * Math.max(0, rank)) / (n - 1)) : 0;
};

// tumble(order): the letters drop out of the bottom of the window one after another inside one beat (`span` frames,
// default 16), each falling at most 30 px per frame on screen, with a few degrees of spin (hooks 1 and 4). The word is
// gone for good once the last letter has fallen `out` screen px (default 800; set it to what clears the window).
registerVerb('tumble', {
  removesAt: (c) => {
    const w = c.L.words.get(c.i)!;
    const n = w.adv.length;
    return Math.round(c.at * FPS) + Math.max(...w.adv.map((_, k) => tumbleDelay(c, n, k))) + fallFramesOf(c);
  },
  modify: (c) => {
    if (c.df < 0) return null;
    const n = c.geom.adv.length;
    const last = Math.max(...c.geom.adv.map((_, k) => tumbleDelay(c, n, k)));
    const FF = fallFramesOf(c);
    if (c.df > last + FF) return {hidden: true, opacity: 0};
    // the word's own opacity ramps to 0 over the last 6 frames, when every letter is already below the window
    const fade = 1 - clamp((c.df - (last + FF - 6)) / 6);
    const zoom = c.camAt(c.at * FPS).zoom;
    const letters = c.geom.adv.map((_, k) => {
      const d = c.df - tumbleDelay(c, n, k);
      const fall = tumbleFall(d) / zoom;
      const spin = (rand(k * 3.1 + c.i) < 0.5 ? -1 : 1) * (3 + 5 * rand(k * 1.7 + c.i)) * clamp(d / 12);
      return {...letterIdentity(), dx: c.down.x * fall, dy: c.down.y * fall, rot: spin, opacity: d > FF ? 0 : 1};
    });
    // detach: once let go the letters belong to the frame, not the sheet; the word is held
    // where the camera at the cue put it, so a later camera move (the sheet's way out) does not carry them
    if (P(c, 'detach', false)) {
      const g = c.geom, pt = {x: g.x + g.w / 2, y: g.y + g.h / 2};
      const s0 = toScreen(c.camAt(c.at * FPS), blockToWorld(c.block, pt));
      const p1 = worldToBlock(c.block, toWorld(c.camAt(c.f), s0));
      return {letters, opacity: fade, dx: p1.x - pt.x, dy: p1.y - pt.y};
    }
    return {letters, opacity: fade};
  },
});

// sinkBehind(shelf): the word sinks straight down (screen) behind a shelf line at screen y `shelf` and is clipped to
// the part of the screen above it (hooks 2 and 3, a GONE going behind the record's edge). `frames` default 14. With
// `alongSheet` (and `gap`, block px) it sinks along its block's down direction behind a rule under its own foot.
registerVerb('sinkBehind', {
  removesAt: (c) => Math.round(c.at * FPS) + ((c.cue.params?.frames as number | undefined) ?? 14),
  modify: (c) => {
    if (c.df < 0) return null;
    const frames = P(c, 'frames', 14), shelf = P(c, 'shelf', 600);
    const zoom = c.camAt(c.at * FPS).zoom;
    const dist = P(c, 'dist', (c.geom.boxH * zoom) + 12);
    const s = dist * easeInOutSine(clamp(c.df / frames));
    // `alongSheet`: the word sinks along its own block's down direction behind a rule `gap` block px under its foot,
    // so on a turning sheet it goes behind its own tilted rule, not straight down the screen (hook 2, item 42.5)
    if (c.cue.params?.alongSheet) {
      const y0 = c.geom.y + c.geom.h + P(c, 'gap', 14 / zoom);
      return {dx: 0, dy: s / zoom, clip: `M-99999 -99999L99999 -99999L99999 ${y0.toFixed(1)}L-99999 ${y0.toFixed(1)}Z`, opacity: c.df >= frames ? 0 : 1};
    }
    const v = screenToBlockVec(c, {x: 0, y: s});
    return {dx: v.x, dy: v.y, clip: screenPolyToBlockClip(c, [{x: -2000, y: -2000}, {x: 4000, y: -2000}, {x: 4000, y: shelf}, {x: -2000, y: shelf}]), opacity: c.df >= frames ? 0 : 1};
  },
});

// slideAlong(angle): the word slides `dist` screen px (default 420) along a screen direction (degrees, 0 = right, 90 =
// down), easing in and out at the speed cap or under, and is gone at the end (hooks 2 and 3). With `edgeX` it goes
// under a vertical edge at that screen x (hook 3's lip at the foot of the slope). Opt-in `fade: true`: the word (and its
// plate) also fades from 1 to 0 on the slide's easing, and its reading life ends as the slide starts (removesAt).
registerVerb('slideAlong', {
  removesAt: (c) => {
    if (c.cue.params?.fade === true) return Math.round(c.at * FPS);
    const dist = (c.cue.params?.dist as number | undefined) ?? 420;
    return Math.round(c.at * FPS) + ((c.cue.params?.frames as number | undefined) ?? Math.max(12, Math.ceil((1.571 * dist) / 30)));
  },
  modify: (c) => {
    if (c.df < 0) return null;
    const dist = P(c, 'dist', 420);
    const frames = P(c, 'frames', Math.max(12, Math.ceil((1.571 * dist) / 30)));
    const a = (P(c, 'angle', 0) * Math.PI) / 180;
    const s = dist * easeInOutSine(clamp(c.df / frames));
    const v = screenToBlockVec(c, {x: Math.cos(a) * s, y: Math.sin(a) * s});
    // optional `edgeX`: a screen x the word goes under (clipped left of it), so it leaves behind a standing rule
    // instead of being cut by the frame edge
    const edgeX = c.cue.params?.edgeX as number | undefined;
    const clip = edgeX === undefined ? undefined : screenPolyToBlockClip(c, [{x: edgeX, y: -2000}, {x: 4000, y: -2000}, {x: 4000, y: 4000}, {x: edgeX, y: 4000}]);
    const fadeOut = c.cue.params?.fade === true ? 1 - easeInOutSine(clamp(c.df / frames)) : 1;
    return {dx: v.x, dy: v.y, ...(clip ? {clip} : {}), opacity: c.df >= frames ? 0 : fadeOut};
  },
});
