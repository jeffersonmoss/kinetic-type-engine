// PORTAL (rule 68, rule 176): the counter of a named O fills with the next ground colour by a wipe from its centre in
// 8 frames, and the rig DIVEs through the counter in 10 to 14 frames until that colour is the whole frame. The ground is
// a board-space disc GroundWipe; portal() in authoring.ts makes the wipe and the dive together. A block declared with
// emerge {move: 'portal', from: {word, letter, part: 'counter'}} is the text waiting inside: it is seen through the disc
// (clipped to it) until the colour is the whole ground. params: wipe (the GroundWipe object from portal()).
import {FPS} from '../config';
import {wipeFrames, wipeFullAt} from '../ground';
import type {GroundWipe} from '../types';
import {clamp, easeInOutSine} from '../util';
import {registerVerb} from '../verbRegistry';
import {anchorOf, circlePath, toLocal, wordsOfCue} from './common';

registerVerb('portal', {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue, L) => wordsOfCue(cue, L),
  // the waiting text is inside the counter, so inside the host word's box
  overlapExempt: (cue, L) => {
    const a = cue.params?.from as {word?: number} | undefined;
    return a?.word !== undefined ? wordsOfCue(cue, L).map((n): [number, number] => [a.word!, n]) : [];
  },
  defaultAt: (cue) => (cue.params?.wipe as GroundWipe | undefined)?.t0 ?? 0,
  // the host letter's word is held bright (not retired) until the dive has filled the frame (rule 56, ruling 194.1)
  holds: (cue, L) => {
    const a = cue.params?.from as {word?: number} | undefined;
    const w = cue.params?.wipe as GroundWipe | undefined;
    return a?.word !== undefined && L.words.has(a.word) && w ? [{word: a.word, until: wipeFullAt(L.board, w) * FPS}] : [];
  },
  modify: (c) => {
    const w = c.cue.params?.wipe as GroundWipe | undefined;
    const a = anchorOf(c.cue, c.L);
    if (!w || !a) return null;
    const t = c.f / FPS;
    if (t >= wipeFullAt(c.L.board, w)) return null;
    if (t < w.t0) return {hidden: true, opacity: 0};
    const p = easeInOutSine(clamp(((t - w.t0) * FPS) / wipeFrames(c.L.board, w)));
    const r = (w.r0 ?? 0) + ((w.r1 ?? 100) - (w.r0 ?? 0)) * p;
    const cen = toLocal(c.block, w.from ?? a.p);
    return {clip: circlePath(cen.x, cen.y, Math.max(0.01, r))};
  },
});
