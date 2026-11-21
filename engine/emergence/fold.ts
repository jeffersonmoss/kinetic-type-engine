// FOLD (rule 61): the old block's height scales to zero about a rule, like a sheet folded shut, in 8 frames, and the new
// block's height opens from the same rule, starting 2 frames after the fold starts, in 8 frames. For closing one idea and
// opening its opposite. The fold axis is the anchor (a rule or a letter part), taken parallel to each block's rows.
// The new block opens on the other side of the rule; when both are on the same side it starts only when the old one has
// closed (16 frames in all), so the two are never drawn through each other (ruling 194.8).
// params: old (words; default every word of the anchor's block), frames (minimum 8), delay (2).
import {FPS} from '../config';
import type {BoardLayout, VerbCue} from '../types';
import {wordCorners} from '../layout';
import {registerVerb} from '../verbRegistry';
import {PC, anchorBlockWords, anchorOf, capFrames, centreOf, eased, firstSf, toLocal, wordsOfCue, wordsParam, zoomOf} from './common';

const oldWords = (cue: VerbCue, L: BoardLayout) => { const o = wordsParam(cue, L, 'old'); return cue.params?.old !== undefined ? o : anchorBlockWords(cue, L); };
/** True when the old and the new block lie on the same side of the fold rule. */
export const sameSide = (cue: VerbCue, L: BoardLayout): boolean => {
  const a = anchorOf(cue, L);
  const olds = oldWords(cue, L), news = wordsOfCue(cue, L);
  if (!a || !olds.length || !news.length) return false;
  const dir = {x: Math.cos((a.frameAngle * Math.PI) / 180), y: Math.sin((a.frameAngle * Math.PI) / 180)};
  const side = (ws: number[]) => {
    const pts = ws.flatMap((i) => { const g = L.words.get(i)!; return wordCorners(L.blocks[g.block], g); });
    const m = pts.reduce((q, p) => ({x: q.x + p.x / pts.length, y: q.y + p.y / pts.length}), {x: 0, y: 0});
    return Math.sign(dir.x * (m.y - a.p.y) - dir.y * (m.x - a.p.x));
  };
  return side(olds) === side(news);
};
export const foldTiming = (cue: VerbCue, L: BoardLayout) => {
  const land = firstSf(cue, L);
  const z = zoomOf(L, cue.word, land);
  const tall = (ws: number[]) => Math.max(1, ...ws.map((i) => L.words.get(i)!.boxH));
  const close = capFrames(tall(oldWords(cue, L)), z, PC(cue, 'frames', 8), undefined, cue);
  const open = capFrames(tall(wordsOfCue(cue, L)), z, PC(cue, 'frames', 8), undefined, cue);
  // the new block opens on the other side of the rule; on the same side it waits until the old block has closed, so the
  // two are never drawn through each other (rule 61, ruling 194.8)
  const same = sameSide(cue, L);
  const delay = same ? Math.max(close, PC(cue, 'delay', close)) : PC(cue, 'delay', 2);
  const start = cue.at !== undefined ? cue.at * FPS : cue.params?.showFrom !== undefined ? (cue.params.showFrom as number) * FPS : land - delay - open;
  return {start, close, open, delay};
};
registerVerb('fold', {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue, L) => [...oldWords(cue, L), ...wordsOfCue(cue, L)],
  defaultAt: (cue, L) => foldTiming(cue, L).start / FPS,
  overlapExempt: (cue, L) => oldWords(cue, L).flatMap((o) => wordsOfCue(cue, L).map((n): [number, number] => [o, n])),
  removesAt: (c) => { const t = foldTiming(c.cue, c.L); return oldWords(c.cue, c.L).includes(c.i) ? t.start + t.close : null; },
  modify: (c) => {
    const t = foldTiming(c.cue, c.L);
    const isOld = oldWords(c.cue, c.L).includes(c.i);
    const a = anchorOf(c.cue, c.L);
    const ce = centreOf(c.geom);
    const axisY = a ? toLocal(c.block, a.p).y : c.geom.y + c.geom.boxH;
    if (isOld) {
      const p = (c.f - t.start) / t.close;
      if (p < 0) return null;
      if (p >= 1) return {hidden: true, opacity: 0};
      const s = Math.max(0.001, 1 - eased(p));
      return {sy: s, dy: (axisY - ce.y) * (1 - s)};
    }
    const p = (c.f - t.start - t.delay) / t.open;
    if (p >= 1) return null;
    if (p <= 0) return {hidden: true, opacity: 0};
    const s = Math.max(0.001, eased(p));
    return {sy: s, dy: (axisY - ce.y) * (1 - s)};
  },
});
