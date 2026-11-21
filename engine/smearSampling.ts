// The motion-blur sampling model shared by SmearStage (smear.tsx), which draws it, and the validator (validateV3.ts),
// which measures what it draws. Pure data: no React, no fonts.
//
// During a rig transit SmearStage renders the board at n sub-frame sample times over a 180 degree shutter (half a frame,
// ending on the frame itself) and adds the samples at 1 / n each. A word that exists in only some samples would be drawn
// at partial opacity, fading up from grey over a frame or more (Fable round 2 item 30; KIT section 20). So every word is
// in exactly one pass:
//   sharp  drawn once at the frame's own time, above the samples: a word being read (rule 178: from 3 frames after its
//          sung start until it retires) and a word arriving (shown at the frame but not, or less opaque, at the
//          shutter's start);
//   blur   in every sample: every other word that is shown at the frame or at the shutter's start (a word leaving
//          keeps its trail);
//   none   a word shown at neither is in no sample.
import {FPS, HEIGHT, WIDTH} from './config';
import {toWorld} from './camera';
import {rigAt, rigTransits, toScreenCam} from './rig';
import {carrySpan} from './carry';
import type {Board, Pt} from './types';
import type {WordMod} from './verbRegistry';
import {boardActive, retireFrame, wordStateAt} from './wordState';

export const SMEAR_SHUTTER = 180;
export const SMEAR_PX = 8;
export const SMEAR_MIN = 4, SMEAR_MAX = 16;
/** The shutter's length in frames. */
export const SMEAR_SPAN = SMEAR_SHUTTER / 360;

const probes = (): Pt[] => [0, 0.5, 1].flatMap((u) => [0, 0.5, 1].map((v) => ({x: u * WIDTH, y: v * HEIGHT})));

/** Is frame f inside one of a board's rig transits (after its first frame, up to and including its last)? A chunk
 *  carry in motion (carry.ts) counts as a transit here, so a slideUp or quarterCW blurs. */
export const inRigTransit = (board: Board, f: number) => rigTransits(board).some((tr) => f > tr.start && f < tr.end + 1e-6)
  || (board.carry ?? []).some((c) => { const [a, b] = carrySpan(c); return f > a - 1 && f <= b + 1e-6; });

/** Largest per-frame screen displacement of a frame point at frame f, over the boards in a transit (0 otherwise). */
export const rigDisplacementAt = (boards: Board[], f: number): number => {
  let worst = 0;
  for (const b of boards) {
    if (!boardActive(b, f) || !inRigTransit(b, f)) continue;
    const c1 = rigAt(b, f), c0 = rigAt(b, f - 1);
    for (const p of probes()) {
      const q = toScreenCam(c0, toWorld(c1, p));
      worst = Math.max(worst, Math.hypot(q.x - p.x, q.y - p.y));
    }
  }
  return worst;
};
/** Samples the smear uses at frame f (1: drawn once, sharp). */
export const smearSamplesAt = (boards: Board[], f: number): number => {
  const d = rigDisplacementAt(boards, f);
  if (d < SMEAR_PX) return 1;
  return Math.max(SMEAR_MIN, Math.min(SMEAR_MAX, Math.ceil(d / SMEAR_PX)));
};
/** Frame times of the n samples at frame f (the first is f itself). */
export const smearSampleFrames = (f: number, n: number): number[] => Array.from({length: n}, (_, k) => f - (SMEAR_SPAN * k) / n);

const shown = (m: WordMod) => !m.hidden && m.opacity > 0.02;
export type SmearWordPass = 'sharp' | 'blur' | 'none';
/** Which pass draws word i of a board at frame f while the smear is on (see the header). `state` defaults to wordStateAt. */
export const smearWordPass = (board: Board, i: number, sf: number, f: number, state: (f: number) => WordMod = (x) => wordStateAt(board, i, x)): SmearWordPass => {
  // board.smearType false: no blur for type; a word shown at f is drawn once, sharp (grounds and graphics still blur)
  if (board.smearType === false) return shown(state(f)) ? 'sharp' : 'none';
  const reading = board.readingIntervals?.[i];
  if (reading ? f >= reading.start && f <= reading.end : f >= sf + 3 && f < retireFrame(board, i)) return 'sharp';
  const now = state(f), early = state(f - SMEAR_SPAN);
  // a word in a 3D turn (in, out or turnSwap, KIT 89) is never smeared, whatever the board's smear settings (Fable
  // ruling, 18 November 2026: no motion blur on any 3D turn): drawn once, sharp, at the frame's own time, and no trail
  if (now.turn || early.turn) return shown(now) ? 'sharp' : 'none';
  if (shown(now) && (!shown(early) || early.opacity < now.opacity - 0.05)) return 'sharp';
  return shown(now) || shown(early) ? 'blur' : 'none';
};
/** The opacity at which word i is actually drawn at frame f, smear included: its own opacity in a sharp frame or pass,
 *  the mean of its opacities over the samples in the blur pass (0 for a hidden sample). */
export const drawnOpacityAt = (boards: Board[], board: Board, i: number, sf: number, f: number, state: (f: number) => WordMod = (x) => wordStateAt(board, i, x)): number => {
  const op = (m: WordMod) => (shown(m) ? m.opacity : 0);
  const n = smearSamplesAt(boards, f);
  if (n <= 1) return op(state(f));
  const pass = smearWordPass(board, i, sf, f, state);
  if (pass === 'none') return 0;
  if (pass === 'sharp') return op(state(f));
  return smearSampleFrames(f, n).reduce((s, x) => s + op(state(x)), 0) / n;
};
