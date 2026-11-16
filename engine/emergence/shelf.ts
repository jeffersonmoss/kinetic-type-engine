// SHELF (rule 63) and EXTRUDE (rule 66). SHELF: words stand on a rule (or a board path); each rises out of it by
// 100 percent of its height, masked below the rule, ending on its sung frame (6 frames, longer for giant words so the
// rise stays within the cap). EXTRUDE: a stroke of a letter keeps going as a rule or the Line, and the block uses it:
// its words rise out of the extruded stroke the same way. Give the stroke as a board rule with `from` a letter anchor
// and `t0` , or let extrude draw its own hairline (params.draw, along the block's baseline).
// params: frames (minimum 6), per 'word' (default) | 'block' (all words rise together, ending on the first sung word).
import {FPS, PALETTE, SPEED_CAP} from '../config';
import type {BoardLayout, VerbCue} from '../types';
import {getVerb, registerVerb, type VerbWordCtx} from '../verbRegistry';
import {drawLines, exitFade, ownersRetire, type LineSeg} from '../lines';
import {BIG, P, PC, anchorOf, capFrames, rectPath, toWorld, wordsOfCue, zoomOf} from './common';

const riseFrames = (cue: VerbCue, L: BoardLayout, i: number) => {
  const g = L.words.get(i)!;
  return capFrames(g.boxH, zoomOf(L, i, g.sf), PC(cue, 'frames', 6));
};
const riseStart = (cue: VerbCue, L: BoardLayout, i: number) => {
  const ws = wordsOfCue(cue, L);
  if (PC(cue, 'per', 'word') === 'block') {
    const land = Math.min(...ws.map((j) => L.words.get(j)!.sf));
    const F = Math.max(...ws.map((j) => riseFrames(cue, L, j)));
    return cue.at !== undefined ? cue.at * FPS : cue.params?.showFrom !== undefined ? (cue.params.showFrom as number) * FPS : land - F;
  }
  if (cue.at !== undefined && i === ws[0]) return cue.at * FPS;
  return L.words.get(i)!.sf - riseFrames(cue, L, i);
};
const rise = (c: VerbWordCtx) => {
  const s = riseStart(c.cue, c.L, c.i);
  const F = PC(c.cue, 'per', 'word') === 'block' ? Math.max(...c.affected.map((j) => riseFrames(c.cue, c.L, j))) : riseFrames(c.cue, c.L, c.i);
  const p = (c.f - s) / F;
  if (p >= 1) return null;
  if (p <= 0) return {hidden: true, opacity: 0};
  const e = 0.5 - 0.5 * Math.cos(Math.PI * p);
  const base = c.geom.baseline;
  return {dy: c.geom.boxH * (1 - e), clip: rectPath(-BIG, -BIG, BIG, base)};
};
const def = (draw: boolean) => ({
  early: true, replacesEnter: true, gradual: true,
  affects: (cue: VerbCue, L: BoardLayout) => wordsOfCue(cue, L),
  defaultAt: (cue: VerbCue, L: BoardLayout) => Math.min(...wordsOfCue(cue, L).map((i) => riseStart(cue, L, i))) / FPS,
  modify: rise,
  // extrude's own stroke (ruling 198: it retires with the block it carries, fading over 6 frames)
  lines: draw ? (c: import('../verbRegistry').VerbCtxBase): LineSeg[] | null => {
    if (P(c, 'draw', false) !== true) return null;
    // from the anchor along the first row's baseline to under the block's far end, at the cap
    const a = anchorOf(c.cue, c.L);
    const b = c.L.blocks[(c.cue.params?.block as number | undefined) ?? c.L.words.get(c.cue.word)!.block];
    const end = toWorld(b, {x: b.rows[0].width + 0.1 * b.h, y: b.rows[0].baseline});
    const from = a?.p ?? toWorld(b, {x: 0, y: b.rows[0].baseline});
    const len = Math.hypot(end.x - from.x, end.y - from.y);
    const z = c.camAt(c.f).zoom;
    const t0 = (c.cue.params?.strokeAt as number | undefined) !== undefined ? (c.cue.params!.strokeAt as number) * FPS : c.at * FPS - Math.ceil((len * z) / SPEED_CAP);
    const u = Math.min(1, Math.max(0, ((c.f - t0) * SPEED_CAP) / Math.max(1, len * z)));
    const op = 0.7 * exitFade(c.f, ownersRetire(c.L.board, c.affected));
    if (u <= 0 || op <= 0.001) return null;
    return [{id: `extrude ${b.index}`, kind: 'extrude', a: from, b: {x: from.x + (end.x - from.x) * u, y: from.y + (end.y - from.y) * u}, width: Math.max(P(c, 'width', 3), 2 / z), opacity: op, colour: P(c, 'colour', PALETTE.paper), owner: c.affected}];
  } : undefined,
  overlay: draw ? (c: import('../verbRegistry').VerbCtxBase) => drawLines(getVerb('extrude')?.lines?.(c), c.camAt(c.f).zoom) : undefined,
});
registerVerb('shelf', def(false));
registerVerb('extrude', def(true));
