// RELIGHT (rule 172): binds a later sung word to a block already on the board (the repeated WE KNOW, the second YOU,
// the second US, the sung EVIL of L32). The target lights (takes `colour`) and swells to `swell` over `frames`, ending on
// the sung word's start, and stays so. The validator checks the target's readability while the bound word is sung, and
// the target is not retired before the bound word's line is. Make the cue with relight() from authoring.ts.
// params: sung (the later word), colour, frames (minimum 8), swell (1.15).
import {FPS, WORDS} from '../config';
import {registerVerb} from '../verbRegistry';
import {PC, capFrames, eased, zoomOf} from './common';
import type {BoardLayout, VerbCue} from '../types';

export const relightTiming = (cue: VerbCue, L: BoardLayout) => {
  const g = L.words.get(cue.word)!;
  const sung = PC(cue, 'sung', -1);
  const sf = Math.round((WORDS[sung]?.start_s ?? g.start) * FPS);
  const sw = PC(cue, 'swell', 1.15);
  const dur = capFrames((Math.hypot(g.w, g.boxH) / 2) * Math.abs(sw - 1), zoomOf(L, cue.word, sf), PC(cue, 'frames', 8));
  return {start: cue.at !== undefined ? cue.at * FPS : sf - dur, dur, sw, sf};
};
registerVerb('relight', {
  early: true,
  defaultAt: (cue, L) => relightTiming(cue, L).start / FPS,
  binds: (cue) => [{display: cue.word, sung: PC(cue, 'sung', -1)}],
  modify: (c) => {
    const t = relightTiming(c.cue, c.L);
    const p = (c.f - t.start) / t.dur;
    if (p <= 0) return null;
    const s = 1 + (t.sw - 1) * eased(p);
    const colour = c.cue.params?.colour as string | undefined;
    return {sx: s, sy: s, colour: colour && c.f >= t.start ? colour : undefined};
  },
});
