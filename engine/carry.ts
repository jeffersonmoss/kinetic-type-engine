// Chunk carries (DOGE K10, storyboard v2 item 75; Fable item 48): two separately built chunks move as one sheet across
// a boundary B (the incoming chunk's first frame). The motion is one shared function, applied by the outgoing chunk
// (side 'out', through its 45-frame tail) and the incoming chunk (side 'in', authored in its final place). Ported from
// the DOGEfather repo's lib/handoff.ts; the numbers are the same, so a DOGE chunk on this engine and one on DOGE's own
// kit meet exactly. In this engine a carry is folded into the board's camera (rigAt and camForBlock), so the stage, the
// smear and every validator check see it with no other change; screen-pinned blocks are carried too.
import type {Board, CameraState, Carry} from './types';
import {rot} from './util';

export const CARRY_TAIL = 45;
export const CARRY_LEAD = 45;
export const SLIDE_UP_PX = 520;
export const SLIDE_UP_FROM = 2;
export const SLIDE_UP_FRAMES = 30; // B+2 to B+31 inclusive
export const QUARTER_FRAMES = 27;
export const QUARTER_END_BEFORE_WORD = 8;
/** slideUp: outgoing type sits above this screen y at B (it is then off the top once slid 520 px). */
export const SLIDE_UP_OUT_MAX_Y = 520;
/** slideUp: incoming type sits below this screen y at B (item 75), so it starts off frame or at the bottom edge. */
export const SLIDE_UP_IN_MIN_Y = 648;
/** `clear` on an outgoing carry: the type fades over this many frames, starting the frame after the motion ends. */
export const CARRY_CLEAR_FRAMES = 12;

const ease = (u: number) => { const x = Math.min(1, Math.max(0, u)); return 0.5 - 0.5 * Math.cos(Math.PI * x); };

/** First and last frame of a carry's motion. */
export const carrySpan = (c: Carry): [number, number] => {
  if (c.kind === 'slideUp') return [c.B + SLIDE_UP_FROM, c.B + SLIDE_UP_FROM + SLIDE_UP_FRAMES - 1];
  if (c.firstWord === undefined) throw new Error('carry quarterCW needs firstWord (the incoming first word frame)');
  const end = c.firstWord - QUARTER_END_BEFORE_WORD;
  return [end - QUARTER_FRAMES, end];
};
/** The screen transform of a carry at an absolute frame: a shift in screen px and a turn (degrees, clockwise) about
 *  the frame centre. */
export const carryAt = (c: Carry, frame: number): {dx: number; dy: number; rot: number} => {
  const [a, b] = carrySpan(c);
  const p = ease((frame - (a - 1)) / (b - (a - 1)));
  if (c.kind === 'slideUp') return {dx: 0, dy: c.side === 'out' ? -SLIDE_UP_PX * p : SLIDE_UP_PX * (1 - p), rot: 0};
  return {dx: 0, dy: 0, rot: c.side === 'out' ? 90 * p : -90 * (1 - p)};
};
/** Frames over which the board's own camera must hold still for a carry (validator `carry`): from the earlier of B
 *  and the motion's first frame, to B+44 on the outgoing side (its tail) or to the motion's last frame on the incoming
 *  side. The `still-camera` rule (sheetRules) does not count these frames, so a carry needs no waiver. */
export const carryStillSpan = (c: Carry): [number, number] => {
  const [a, b] = carrySpan(c);
  return [Math.min(c.B, a), c.side === 'out' ? Math.max(c.B + CARRY_TAIL - 1, b) : b];
};
/** The frame at which an outgoing carry ends the reading interval of every word on its board, or null. A quarterCW
 *  ends it at the turn's first frame (type turning 90 degrees is not read, and after the turn it lies at +90); an
 *  outgoing carry with `clear` ends it at the latest when the clear starts. */
export const carryReadEnd = (c: Carry): number | null => {
  if (c.side !== 'out') return null;
  const ends: number[] = [];
  if (c.kind === 'quarterCW') ends.push(carrySpan(c)[0]);
  const cl = carryClearSpan(c);
  if (cl) ends.push(cl[0]);
  return ends.length ? Math.min(...ends) : null;
};
/** An outgoing carry's `clear`: [first frame of the fade, frame from which the type is hidden], or null. The fade
 *  starts `after` frames (default 0) after the frame following the motion's end and runs `frames` (default 12). */
export const carryClearSpan = (c: Carry): [number, number] | null => {
  if (c.side !== 'out' || !c.clear) return null;
  const o = c.clear === true ? {} : c.clear;
  const s = carrySpan(c)[1] + 1 + (o.after ?? 0);
  return [s, s + Math.max(1, o.frames ?? CARRY_CLEAR_FRAMES)];
};
/** The opacity factor the board's carry clears give its words at a frame: 1 before any clear, easing (sine) to 0 over
 *  the clear, and 0 (the word hidden) from its end. */
export const carryClearOpacity = (board: Board, frame: number): number => {
  let o = 1;
  for (const c of board.carry ?? []) {
    const cl = carryClearSpan(c);
    if (!cl || frame < cl[0]) continue;
    if (frame >= cl[1]) return 0;
    o *= 1 - ease((frame - cl[0]) / (cl[1] - cl[0]));
  }
  return o;
};
/** A camera state with the board's carries applied (identity when the board has none). */
export const carryCam = (board: Board, frame: number, cam: CameraState): CameraState => {
  if (!board.carry?.length) return cam;
  let out = cam;
  for (const c of board.carry) {
    const x = carryAt(c, frame);
    if (!x.dx && !x.dy && !x.rot) continue;
    // screen s' = centre + R(x.rot)(s - centre) + d. A turn about the frame centre adds to the camera angle; the shift
    // moves the camera centre by -d turned back into the world and divided by the zoom.
    const r = out.rot + x.rot;
    const d = rot({x: x.dx, y: x.dy}, -r);
    out = {x: out.x - d.x / out.zoom, y: out.y - d.y / out.zoom, zoom: out.zoom, rot: r};
  }
  return out;
};
/** True while any carry of the board is in motion at the frame. */
export const carrying = (board: Board, frame: number) =>
  (board.carry ?? []).some((c) => { const [a, b] = carrySpan(c); return frame >= a && frame <= b; });
/** True from B on for a board with an outgoing carry (slideUp or quarterCW). From then the board draws no Ground and no
 *  vignette, so its type rides over the incoming board, which draws them (KIT 36.1, item 72). */
export const carriedOff = (board: Board, frame: number) =>
  (board.carry ?? []).some((c) => c.side === 'out' && frame >= c.B);
