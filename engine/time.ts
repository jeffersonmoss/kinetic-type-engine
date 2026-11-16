// Song time helpers: the composition's song time, the beat being played and the loudness, from the configured song.
import {useCurrentFrame} from 'remotion';
import {BEATS, ENERGY, FPS} from './config';

/** Absolute song seconds in a composition that starts at song second `start` (use it as the `t` of a TypeStage). */
export const useSongTime = (start: number) => start + useCurrentFrame() / FPS;

/** Index of the last beat at or before song seconds t (-1 before the first beat, or with no beats configured). */
export const beatIndexAt = (t: number) => {
  let lo = 0, hi = BEATS.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (BEATS[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
};

/** Smoothed loudness 0 to 1 at song seconds t from the configured 10 Hz energy track (0.5 without one). */
export const energyAt = (t: number) => {
  if (!ENERGY.length) return 0.5;
  const x = t * 10, i = Math.floor(x), f = x - i;
  const a = ENERGY[Math.min(Math.max(i, 0), ENERGY.length - 1)], b = ENERGY[Math.min(Math.max(i + 1, 0), ENERGY.length - 1)];
  return a + (b - a) * f;
};
