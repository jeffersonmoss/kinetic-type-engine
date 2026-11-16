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
