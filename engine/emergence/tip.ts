// TIP (rule 64): the rig tilts 15 degrees in 8 frames (tip() in authoring.ts makes the rig key) and every retired word on the
// board slides off down the slope, its letters separating by up to 30 px and each turning up to 40 degrees, gone within
// 20 frames. The block being sung is pinned. The slide accelerates to the 32 px per frame cap in 6 frames and keeps it,
// so a word travels about 540 px on screen and leaves the frame; a word still in frame fades over the last 6 frames.
// Cue it on any word with an explicit `at` (seconds). params: pinned (words that stay), frames (20), spread (30),
// turn (40), tiltFrames (8: the slope is read from the rig after the tilt).
import {FPS} from '../config';
import {SPEED_CAP} from '../motion';
import type {BoardLayout, VerbCue} from '../types';
import {clamp, rand, rot} from '../util';
import {letterIdentity, registerVerb} from '../verbRegistry';
import {PC} from './common';
import {retireFrame} from '../wordState';

export const tipVictims = (cue: VerbCue, L: BoardLayout): number[] => {
  const at = (cue.at ?? 0) * FPS;
  const pinned = new Set((cue.params?.pinned as number[] | undefined) ?? []);
  return L.order.filter((i) => !pinned.has(i) && L.blocks[L.words.get(i)!.block].def.pin !== 'screen' && retireFrame(L.board, i) <= at);
};
registerVerb('tip', {
  early: true, gradual: true,
  affects: tipVictims,
  removesAt: (c) => c.at * FPS + PC(c.cue, 'frames', 20),
  modify: (c) => {
    if (c.df < 0) return null;
    const F = PC(c.cue, 'frames', 20);
    if (c.df >= F) return {hidden: true, opacity: 0, keepAlive: true};
    const cam = c.camAt(c.at * FPS + PC(c.cue, 'tiltFrames', 8));
    // down the slope: screen-down, in this word's block frame, after the tilt
    const down = rot({x: 0, y: 1}, -(cam.rot + c.block.angle));
    const slope = rot(down, PC(c.cue, 'side', 1) > 0 ? -15 : 15);
    // a slide that is seen (ruling 194.3): it accelerates to the 32 px per frame cap in 6 frames and keeps that speed,
    // about 540 px on screen in 20 frames, so the words in the frame visibly leave it down the slope
    const RAMP = 6;
    const scr = c.df <= RAMP ? (SPEED_CAP * c.df * c.df) / (2 * RAMP) : (SPEED_CAP * RAMP) / 2 + SPEED_CAP * (c.df - RAMP);
    const g = scr / Math.max(0.01, cam.zoom);
    const u = clamp(c.df / F);
    const n = c.geom.adv.length;
    const spread = Math.min(30, PC(c.cue, 'spread', 30)) / Math.max(0.01, cam.zoom);
    const turn = Math.min(40, PC(c.cue, 'turn', 40));
    return {
      dx: slope.x * g, dy: slope.y * g, opacity: 1 - clamp((c.df - (F - 6)) / 6), keepAlive: true,
      letters: Array.from({length: n}, (_, k) => ({...letterIdentity(), dx: (k - (n - 1) / 2) / Math.max(1, n - 1) * 2 * spread * u, rot: (rand('tip', c.i, k) * 2 - 1) * turn * u})),
    };
  },
});
