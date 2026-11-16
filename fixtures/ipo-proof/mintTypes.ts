// Types of the fixture's Mint Line (copied from the first video's kit types, where it was a board field).
import type {Pt} from '../../engine';

export interface MintSeg {
  t: number;
  /** World degrees (0 = +x, -90 = up). Default: keep. */
  heading?: number;
  /** World px per frame. Default: keep. */
  speed?: number;
  /** Frames over which the heading turns to its new value (default 8; 0 makes a corner). */
  turnFrames?: number;
  /** Exponential climb: from the segment start, offset v = a (e^(k u) - 1 - k u) to the left of the heading along u. */
  exp?: {k: number; a?: number};
  /** The tip stops (the Line rests). */
  stop?: boolean;
}
export interface MintLineDef {
  /** Song seconds the tip starts moving from `start`. */
  t0: number;
  start: Pt;
  heading: number;
  /** World px per frame. */
  speed: number;
  /** Line already drawn before t0 (inherited across a handoff); its last point should be `start`. */
  prefix?: Pt[];
  segs?: MintSeg[];
  /** World px (default 8); never under 3 px on screen. */
  width?: number;
  colour?: string;
  opacity?: number;
}
