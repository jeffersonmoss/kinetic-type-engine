// SPROUT (rule 55): the new block scales from 0.08 to 1 about a named point on an old letter (a stem top, a serif, a
// terminal, the end of a tail) with an overshoot of at most 6 percent. 8 to 10 frames as the style bible says, longer
// when the block is big: the engine stretches it so that no corner moves faster than 32 px per frame.
// params: frames (minimum, default 9), overshoot (0.06, capped at 0.06).
import {FPS} from '../config';
import type {BoardLayout, VerbCue} from '../types';
import {clamp, easeInOutSine, lerp} from '../util';
import {registerVerb} from '../verbRegistry';
import {PC, anchorOf, capFrames, centreOf, firstSf, scaleAbout, toLocal, wordsOfCue, zoomOf} from './common';
import {wordCorners} from '../layout';

const S0 = 0.08;
/** Scale at progress p: eases up to 1 + overshoot at 0.75, settles to 1 (peak speed about 2.1 x average; 2.2 is used for the cap, a margin for rounding). */
const sproutScale = (p: number, ov: number) => (p < 0.75 ? lerp(S0, 1 + ov, easeInOutSine(p / 0.75)) : lerp(1 + ov, 1, easeInOutSine((p - 0.75) / 0.25)));
export const sproutTiming = (cue: VerbCue, L: BoardLayout): {start: number; dur: number} => {
  const land = firstSf(cue, L);
  const a = anchorOf(cue, L);
  const words = wordsOfCue(cue, L);
  const pivot = a?.p ?? {x: 0, y: 0};
  let far = 0;
  for (const i of words) { const g = L.words.get(i)!; for (const q of wordCorners(L.blocks[g.block], g)) far = Math.max(far, Math.hypot(q.x - pivot.x, q.y - pivot.y)); }
  const ov = Math.min(0.06, PC(cue, 'overshoot', 0.06));
  const dur = capFrames(far * (1 + ov - S0), zoomOf(L, cue.word, land), PC(cue, 'frames', 9), 2.2);
  const start = cue.at !== undefined ? cue.at * FPS : cue.params?.showFrom !== undefined ? (cue.params.showFrom as number) * FPS : land - dur;
  return {start, dur};
};
registerVerb('sprout', {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue, L) => wordsOfCue(cue, L),
  defaultAt: (cue, L) => sproutTiming(cue, L).start / FPS,
  modify: (c) => {
    const {start, dur} = sproutTiming(c.cue, c.L);
    const p = (c.f - start) / dur;
    if (p >= 1) return null;
    if (p < 0) return {hidden: true, opacity: 0};
    const a = anchorOf(c.cue, c.L);
    const s = sproutScale(clamp(p), Math.min(0.06, PC(c.cue, 'overshoot', 0.06)));
    const piv = a ? toLocal(c.block, a.p) : centreOf(c.geom);
    return {...scaleAbout(centreOf(c.geom), piv, s), sx: s, sy: s};
  },
});
