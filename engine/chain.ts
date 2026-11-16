// Chain layout (kit pass 21, 16 November 2026): camera steps between lines that keep the previous line's last word whole
// inside the safe margin until its margin window ends (Fable item 29, KIT 95: 12 frames after its sung frame at cap 200
// px or more on screen, 20 otherwise; then crop-half). Jefferson's floor is unchanged: these helpers only solve where to
// put the camera and the next line so the rules hold; the validator still checks every frame.
//
//   marginWindowEnd(sf, cap)   the frame a word's margin window ends (sung frame + 12 or + 20)
//   chainStep(s)               given the world box of the word(s) still in their window, a camera angle and zoom, and
//                              where on screen the next line should land, returns the rig target (`to`) and the world
//                              point to place the next line's anchor at. The kept words sit inside the safe area at
//                              `keepAt` (moved the least distance needed to fit), so after the step they are whole in frame.
//   chainFit(s)                given the kept words and the next line's world box (already placed, for example by an
//                              emergence anchor), the camera that holds both inside the safe area at a given angle, at the
//                              largest zoom up to `zoom` that fits; `fits` is false when even that cannot hold the minimum cap.
//
// Example (a STEP down to the next line while SHE MIGHT WIPE US OUT's last word, OUT, is still in its window):
//   const out = boxOf('out');                                   // world corners of OUT, from a probe layout
//   const s = chainStep({keep: [out], rot: -12, zoom: 1, keepAt: {x: 1000, y: 120}, next: {x: 300, y: 420}});
//   put('mydude', {..., attach: 'FREE', at: {x: s.nextWorld.x, y: s.nextWorld.y, angle: 0}});   // the next line's anchor
//   rig.push({t: 25.70, kind: 'step', frames: 8, to: s.to});    // OUT stays whole at top right
//   rig.push({t: 25.97, kind: 'hold', still: true});            // no drift while OUT's window runs
// The step may start as soon as the next line needs it; the kept word is checked again only after the step (a step is a
// transit), and it is then inside the margin with `pad` px to spare for drift.
import {HEIGHT, WIDTH} from './config';
import type {Pt, RigTarget} from './types';
import {rot} from './util';
import {MARGIN_BIG_CAP, MARGIN_WHOLE, MARGIN_WHOLE_BIG, SAFE, SUNG_MIN_CAP} from './validate';

/** Last frame (exclusive) of a word's margin window: its sung frame plus 12 (cap on screen at least 200 px) or 20. */
export const marginWindowEnd = (sf: number, capOnScreen: number) => sf + (capOnScreen >= MARGIN_BIG_CAP ? MARGIN_WHOLE_BIG : MARGIN_WHOLE);

type Box = {x0: number; y0: number; x1: number; y1: number};
/** Screen offsets (from the frame centre, before the camera centre) of world points under angle r and zoom z. */
const rel = (p: Pt, r: number, z: number) => rot({x: p.x * z, y: p.y * z}, r);
const boxOf = (ps: Pt[]): Box => ({x0: Math.min(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), x1: Math.max(...ps.map((p) => p.x)), y1: Math.max(...ps.map((p) => p.y))});
/** Camera centre (world) that maps world point P to screen point S at angle r, zoom z. */
const centreFor = (P: Pt, S: Pt, r: number, z: number): Pt => { const d = rot({x: S.x - WIDTH / 2, y: S.y - HEIGHT / 2}, -r); return {x: P.x - d.x / z, y: P.y - d.y / z}; };
const toWorldAt = (C: Pt, S: Pt, r: number, z: number): Pt => { const d = rot({x: S.x - WIDTH / 2, y: S.y - HEIGHT / 2}, -r); return {x: C.x + d.x / z, y: C.y + d.y / z}; };
const toScreenAt = (C: Pt, P: Pt, r: number, z: number): Pt => { const q = rel({x: P.x - C.x, y: P.y - C.y}, r, z); return {x: q.x + WIDTH / 2, y: q.y + HEIGHT / 2}; };

export interface ChainStepDef {
  /** World polygons (word corners) that must be whole inside the safe margin when the move ends. */
  keep: Pt[][];
  /** Camera angle (R, degrees) and zoom after the move. */
  rot: number; zoom: number;
  /** Screen point for the centre of the kept box (default: the frame centre); it is moved the least distance needed to
   *  put the box inside the safe area less `pad`. */
  keepAt?: Pt;
  /** Screen point where the next line's anchor lands after the move. */
  next: Pt;
  /** Extra px inside the 48 px margin, for drift (default 8). */
  pad?: number;
}
export interface ChainResult {
  /** Rig target for the move (a step, roll, tilt or soar key's `to`). */
  to: RigTarget;
  /** World point of the next line's anchor (FREE `at`, or the point a block's anchor resolves to). */
  nextWorld: Pt;
  /** The kept box on screen after the move. */
  keepBox: Box;
  /** False when the kept words are larger than the safe area at this zoom. */
  fits: boolean;
}

export const chainStep = (s: ChainStepDef): ChainResult => {
  const pad = s.pad ?? 8, lo = SAFE + pad;
  const pts = s.keep.flat();
  const b = boxOf(pts.map((p) => rel(p, s.rot, s.zoom)));
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const want = s.keepAt ?? {x: WIDTH / 2, y: HEIGHT / 2};
  const fits = w <= WIDTH - 2 * lo && h <= HEIGHT - 2 * lo;
  const cx = Math.min(Math.max(want.x, lo + w / 2), WIDTH - lo - w / 2), cy = Math.min(Math.max(want.y, lo + h / 2), HEIGHT - lo - h / 2);
  // world point at the kept box's centre, then the camera centre that puts it at (cx, cy)
  const mid = rot({x: (b.x0 + b.x1) / 2 / s.zoom, y: (b.y0 + b.y1) / 2 / s.zoom}, -s.rot);
  const C = centreFor(mid, {x: cx, y: cy}, s.rot, s.zoom);
  const kb = boxOf(pts.map((p) => toScreenAt(C, p, s.rot, s.zoom)));
  return {to: {x: C.x, y: C.y, zoom: s.zoom, rot: s.rot}, nextWorld: toWorldAt(C, s.next, s.rot, s.zoom), keepBox: kb, fits};
};

export interface ChainFitDef {
  keep: Pt[][];
  /** World polygons of the next line (or whatever else must be in frame). */
  show: Pt[][];
  rot: number;
  /** Largest zoom wanted (default 1). */
  zoom?: number;
  /** World cap height of the smallest word that must stay at the 56 px floor (fits is false below it). */
  minCap?: number;
  pad?: number;
}
export const chainFit = (s: ChainFitDef): ChainResult & {zoom: number} => {
  const pad = s.pad ?? 8, lo = SAFE + pad;
  const pts = [...s.keep.flat(), ...s.show.flat()];
  const b = boxOf(pts.map((p) => rel(p, s.rot, 1)));
  const z = Math.min(s.zoom ?? 1, (WIDTH - 2 * lo) / Math.max(1, b.x1 - b.x0), (HEIGHT - 2 * lo) / Math.max(1, b.y1 - b.y0));
  const mid = rot({x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2}, -s.rot);
  const C = centreFor(mid, {x: WIDTH / 2, y: HEIGHT / 2}, s.rot, z);
  const kb = boxOf(s.keep.flat().map((p) => toScreenAt(C, p, s.rot, z)));
  const fits = s.minCap === undefined || s.minCap * z >= SUNG_MIN_CAP;
  return {to: {x: C.x, y: C.y, zoom: z, rot: s.rot}, nextWorld: mid, keepBox: kb, fits, zoom: z};
};
