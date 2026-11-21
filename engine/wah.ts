// K3 `wah` (Sweet Distillation, the talk box): the letters of a held word ride a sine on its baseline. Amplitude 4
// percent of the word's cap height, one cycle per two beats (from the song's beat times when the engine has them,
// else BEAT_FRAMES), 0.4 radians of phase per letter (the wave runs left to right), no scale change. It eases in over
// 6 frames from the cue's start and, with `dur` (seconds) or `frames`, out over the last 6. `still: 'ation'` leaves the
// letters from the last occurrence of that string to the end of the word (and any punctuation after it) at rest, so
// only the front of the word waves (the pinned suffix of the hook's morph hub, K7).
//   verb: [{name: 'wah', word: VACATION, at: 71.2, dur: 1.5, params: {still: 'ation'}}]
// params: still (string), amp (fraction of cap, default 0.04), beats (beats per cycle, default 2), phase (radians per
// letter, default 0.4), ease (frames, default 6), frames (length in frames; or the cue's `dur`).
import {BEATS, BEAT_FRAMES, FPS} from './config';
import {beatIndexAt} from './time';
import {clamp, easeInOutSine} from './util';
import {letterIdentity, registerVerb, type LetterMod} from './verbRegistry';

/** Song position in beats at seconds t: fractional beat index from the configured beat times (extrapolated past their
 *  ends at the median beat), or t over BEAT_FRAMES without beats. */
export const beatPosition = (t: number): number => {
  const n = BEATS.length;
  const per = BEAT_FRAMES / FPS;
  if (n < 2) return t / per;
  const k = beatIndexAt(t);
  if (k < 0) return (t - BEATS[0].t) / per;
  if (k >= n - 1) return n - 1 + (t - BEATS[n - 1].t) / per;
  return k + (t - BEATS[k].t) / Math.max(1e-6, BEATS[k + 1].t - BEATS[k].t);
};
/** Index of the first letter `still` leaves at rest (the last occurrence of the string, case ignored), or the word's
 *  length when it does not occur. */
export const wahStillFrom = (text: string, still: string | undefined): number => {
  if (!still) return [...text].length;
  const chars = [...text].map((c) => c.toUpperCase());
  const s = [...still.toUpperCase()];
  for (let k = chars.length - s.length; k >= 0; k--) if (s.every((c, j) => chars[k + j] === c)) return k;
  return chars.length;
};
export const WAH_AMP = 0.04;
export const WAH_PHASE = 0.4;

registerVerb('wah', {
  modify: (c) => {
    if (c.df < 0) return null;
    const p = c.cue.params ?? {};
    const ease = Math.max(1, (p.ease as number | undefined) ?? 6);
    const len = (p.frames as number | undefined) ?? (c.cue.dur !== undefined ? c.cue.dur * FPS : Infinity);
    const env = easeInOutSine(clamp(c.df / ease)) * (len < Infinity ? easeInOutSine(clamp((len - c.df) / ease)) : 1);
    if (env <= 0) return null;
    const amp = ((p.amp as number | undefined) ?? WAH_AMP) * c.geom.h * env;
    const ph = (p.phase as number | undefined) ?? WAH_PHASE;
    const cyc = (p.beats as number | undefined) ?? 2;
    const base = (2 * Math.PI * beatPosition(c.t)) / cyc;
    const stillFrom = wahStillFrom(c.geom.text, p.still as string | undefined);
    const letters: LetterMod[] = c.geom.adv.map((_, k) => (k >= stillFrom ? letterIdentity() : {...letterIdentity(), dy: -amp * Math.sin(base - ph * k)}));
    return {letters};
  },
});
