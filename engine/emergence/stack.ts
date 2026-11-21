// STACK (rule 62): each new word lands one row above (or below) the last, every row justified to one measure (the
// block's `stack` layout), leading 8 percent of the cap height. A word lands by a drop of at most 40 px on screen over
// 6 frames, ending on its sung frame, at full opacity from its first frame (Fable round 2 item 30), with a squash of 6 percent on landing
// (ruling 194.6). The rig STEPs one row per word (stackSteps in authoring.ts).
// params: drop (screen px, max 40), dir 'up' | 'down' | 'left' | 'right' (travel in the block frame), frames (6).
// Without dir, drop from above for an upward stack and from below for a downward stack.
import {FPS} from '../config';
import type {BoardLayout, VerbCue} from '../types';
import {easeInQuad} from '../util';
import {registerVerb} from '../verbRegistry';
import {P, PC, wordsOfCue, zoomOf} from './common';

const dirOf = (cue: VerbCue, L: BoardLayout) => {
  const b = L.blocks[(cue.params?.block as number | undefined) ?? L.words.get(cue.word)!.block];
  switch (cue.params?.dir) {
    case 'up': return 'below';
    case 'down': return 'above';
    case 'left': return 'right';
    case 'right': return 'left';
  }
  // A direct legacy cue could name its source side in params.from. An emergence puts an anchor there instead.
  const from = cue.params?.from;
  if (from === 'above' || from === 'below' || from === 'left' || from === 'right') return from;
  return b.def.stack?.dir === 'down' ? 'below' : 'above';
};
/** params.run (screen px, ruling 198 / Fable item 42b): instead of the 40 px drop, each word drives `run` px into its
 *  row and brakes: it travels at full opacity on a decelerating ease (easeOutQuad, so the peak speed, at the start, is
 *  twice the average) over as many frames as keep that peak within 30 px per frame, ending on its sung frame, then
 *  squashes 6 percent on landing. Returns the start frame for `defaultAt` (null without `run`). */
const runLen = (cue: VerbCue, L: BoardLayout, i: number) => {
  const run = PC(cue, 'run', 0);
  if (!(run > 0)) return null;
  const z = zoomOf(L, i, L.words.get(i)!.sf);
  return {run: run / Math.max(0.01, z), frames: Math.max(6, Math.ceil((2 * run) / 30 - 1e-9))};
};
const runFrames = (cue: VerbCue, L: BoardLayout, i: number): number | null => {
  const r = runLen(cue, L, i);
  return r ? L.words.get(i)!.sf - r.frames : null;
};
const runMod = (c: import('../verbRegistry').VerbWordCtx, start: number) => {
  const r = runLen(c.cue, c.L, c.i)!;
  const d = c.f - c.geom.sf;
  if (d >= 5) return null;
  if (d >= 0) { const k = Math.sin((Math.PI * d) / 5); const sy = 1 - 0.06 * k; return {sx: 1 + 0.03 * k, sy, dy: (c.geom.h * (1 - sy)) / 2}; }
  if (c.f < start) return {hidden: true, opacity: 0};
  const p = (c.f - start) / r.frames;
  const off = r.run * (1 - p) * (1 - p);
  const dir = dirOf(c.cue, c.L);
  return dir === 'above' ? {dy: -off} : dir === 'below' ? {dy: off} : dir === 'left' ? {dx: -off} : {dx: off};
};
registerVerb('stack', {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue, L) => wordsOfCue(cue, L),
  defaultAt: (cue, L) => (Math.min(...wordsOfCue(cue, L).map((i) => runFrames(cue, L, i) ?? L.words.get(i)!.sf - PC(cue, 'frames', 6))) - 0) / FPS,
  modify: (c) => {
    const runF = runFrames(c.cue, c.L, c.i);
    if (runF !== null) return runMod(c, runF);
    const F = Math.max(6, P(c, 'frames', 6));
    const d = c.f - c.geom.sf; // ends on the sung frame
    const SQUASH = 5;
    if (d >= SQUASH) return null;
    if (d >= 0) {
      // a squash of 6 percent on landing, about the baseline (ruling 194.6)
      const k = Math.sin((Math.PI * d) / SQUASH);
      const sy = 1 - 0.06 * k, sx = 1 + 0.03 * k;
      return {sx, sy, dy: (c.geom.h * (1 - sy)) / 2};
    }
    if (d < -F) return {hidden: true, opacity: 0};
    const z = zoomOf(c.L, c.i, c.geom.sf);
    // a 40 px drop on an ease-in (peak twice the average) over 6 frames peaks at about 13 px per frame
    const dist = Math.min(40, P(c, 'drop', 40)) / Math.max(0.01, z);
    const off = dist * (1 - easeInQuad((d + F) / F));
    const dir = dirOf(c.cue, c.L);
    const v = dir === 'above' ? {dy: -off} : dir === 'below' ? {dy: off} : dir === 'left' ? {dx: -off} : {dx: off};
    // at full opacity from its first frame: it drops in, it does not fade up from grey (ruling 194.6 allowed a half-opacity
    // first frame; Fable round 2 item 30 removed it)
    return v;
  },
});
