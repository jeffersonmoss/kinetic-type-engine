// Motion legibility limits (Builder brief, items 11 to 13; Jefferson, 15 November 2026): "each element is moved only
// fast enough that the eye is still able to follow it and see it clearly". The engine's own motion obeys these, and the
// validator checks words, tracked decor and any element registered with validateElements().
import {SPEED_CAP} from './config';
import type {Pt} from './types';

export {SPEED_CAP, SPEED_CAP_FRACTION, BEAT_FRAMES} from './config';

/*
 * Speed cap (config.ts SPEED_CAP_FRACTION): 0.025 of the frame width per frame, 32 px per frame at 1280 wide (0.75
 * frame widths per second). Why: the eye follows a moving target smoothly, and sees it sharply, up to roughly 30
 * degrees per second; faster targets are tracked in jumps and read as flickers. A 16:9 frame at a normal viewing
 * distance spans about 36 degrees, so 30 deg/s is about 0.83 frame widths per second. It applies to every point of an
 * element on screen, camera motion included. SPEED_CAP is in px at the configured width; BEAT_FRAMES is the song's
 * median beat in frames (an element changes state at most once per beat).
 */
/** Entrances, exits and transitions last at least this many frames. */
export const MIN_TRANSITION_FRAMES = 6;
/** Anything that appears stays visible at least this many frames (0.5 s, item 12.2). */
export const MIN_VISIBLE_FRAMES = 15;
/** Opacity above which an element counts as visible for appear and disappear events. */
export const VISIBLE_THRESHOLD = 0.25;
/** Peak speed of easeInOutSine relative to its average speed (pi/2); the engine eases entrances and transits with it. */
export const IN_OUT_PEAK = Math.PI / 2;

/** Shares of the speed cap: words often enter while the camera is moving, and the two speeds add up. */
export const CAMERA_SPEED_SHARE = 0.7;
export const ENTRANCE_SPEED_SHARE = 0.3;
/** Frames a move of `distance` screen px needs with easeInOutSine within `share` of the speed cap (at least minFrames). */
export const framesForDistance = (distance: number, minFrames = MIN_TRANSITION_FRAMES, share = CAMERA_SPEED_SHARE) =>
  Math.max(minFrames, Math.ceil((IN_OUT_PEAK * distance) / (SPEED_CAP * share)));

/** Largest scale change (from 1) an element may make in `frames` frames with easeInOutSine; `sizePx` is its diagonal on screen. */
export const maxScaleDelta = (sizePx: number, frames: number, share = ENTRANCE_SPEED_SHARE) => (SPEED_CAP * share * frames) / (IN_OUT_PEAK * Math.max(1, sizePx / 2));

/** Quad of an axis-aligned or rotated rectangle (for tracked elements): top-left x, y, size, angle in degrees about its centre. */
export const rectQuad = (x: number, y: number, w: number, h: number, angle = 0): Pt[] => {
  const cx = x + w / 2, cy = y + h / 2, a = (angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([px, py]) => ({x: cx + px * c - py * s, y: cy + px * s + py * c}));
};
