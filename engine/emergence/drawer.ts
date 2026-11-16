// DRAWER (DOGE storyboard v2 item 59, K7; Fable item 37): the new words slide out from behind an edge of a word or a
// prop of the old line, clipped at that edge. Each word slides `depth` world px out along the edge's outward normal,
// ending on its own sung frame, so the clip edge is the entrance. Ported from DOGE's sheet/state.ts (drawerEdge,
// drawerClip, drawerDepth); the lead is lengthened so the slide stays within the 32 px per frame cap.
// Build it with drawer({host | rect, edge, depth?, lead?}) (authoring.ts). Place the block on the far side of the edge
// (an anchor on the host word's foot, top or flank, or on the prop), so it rests clear of the host.
// params: edge 'top' | 'bottom' | 'left' | 'right' (of the host box); rect (a world box {x, y, w, h, angle?}; default the
// host word `from.word`); depth (default each word's own extent across the edge plus 4, so it starts fully hidden);
// lead (frames, default 6, at least 4).
import {FPS} from '../config';
import {blockToWorld, worldToBlock} from '../layout';
import type {AnchorRef, BoardLayout, Pt, VerbCue} from '../types';
import {rot} from '../util';
import {registerVerb} from '../verbRegistry';
import {capFrames, wordsOfCue, zoomOf} from './common';

type Rect = {x: number; y: number; w: number; h: number; angle?: number};
export const DRAWER_LEAD = 6;
export const DRAWER_MIN_LEAD = 4;

/** The host edge (world segment a to b) and its outward unit normal n. */
export const drawerEdge = (cue: VerbCue, L: BoardLayout): {a: Pt; b: Pt; n: Pt} => {
  const rect = cue.params?.rect as Rect | undefined;
  const edge = (cue.params?.edge as string | undefined) ?? 'bottom';
  let q: Pt[];
  if (rect) {
    const c = {x: rect.x + rect.w / 2, y: rect.y + rect.h / 2};
    q = [{x: rect.x, y: rect.y}, {x: rect.x + rect.w, y: rect.y}, {x: rect.x + rect.w, y: rect.y + rect.h}, {x: rect.x, y: rect.y + rect.h}]
      .map((p) => { const r = rot({x: p.x - c.x, y: p.y - c.y}, rect.angle ?? 0); return {x: c.x + r.x, y: c.y + r.y}; });
  } else {
    const a = cue.params?.from as AnchorRef | undefined;
    if (!a || !('word' in a) || !L.words.has(a.word)) throw new Error('drawer: from must name a host word on the board, or give params.rect');
    const g = L.words.get(a.word)!;
    const b = L.blocks[g.block];
    q = [{x: g.x, y: g.y}, {x: g.x + g.w, y: g.y}, {x: g.x + g.w, y: g.y + g.h}, {x: g.x, y: g.y + g.h}].map((p) => blockToWorld(b, p));
  }
  const [a, b] = ({top: [q[0], q[1]], bottom: [q[3], q[2]], left: [q[0], q[3]], right: [q[1], q[2]]} as Record<string, Pt[]>)[edge] ?? [q[3], q[2]];
  const c = {x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2};
  const t = {x: b.x - a.x, y: b.y - a.y};
  const Lt = Math.hypot(t.x, t.y) || 1;
  let n = {x: -t.y / Lt, y: t.x / Lt};
  if ((a.x - c.x) * n.x + (a.y - c.y) * n.y < 0) n = {x: -n.x, y: -n.y};
  return {a, b, n};
};
const depthOf = (cue: VerbCue, L: BoardLayout, i: number) => {
  const d = cue.params?.depth as number | undefined;
  if (d !== undefined) return d;
  const {a, n} = drawerEdge(cue, L);
  const g = L.words.get(i)!;
  const b = L.blocks[g.block];
  const q = [{x: g.x, y: g.y}, {x: g.x + g.w, y: g.y}, {x: g.x + g.w, y: g.y + g.boxH}, {x: g.x, y: g.y + g.boxH}].map((p) => blockToWorld(b, p));
  return Math.max(...q.map((p) => (p.x - a.x) * n.x + (p.y - a.y) * n.y)) + 4;
};
/** Entrance frames of word i (ending on its sung frame). */
export const drawerLead = (cue: VerbCue, L: BoardLayout, i: number) => {
  const g = L.words.get(i)!;
  const want = Math.max(DRAWER_MIN_LEAD, Math.round((cue.params?.lead as number | undefined) ?? DRAWER_LEAD));
  return capFrames(depthOf(cue, L, i), zoomOf(L, i, g.sf), want);
};

registerVerb('drawer', {
  early: true, replacesEnter: true, gradual: true,
  affects: (cue, L) => wordsOfCue(cue, L),
  defaultAt: (cue, L) => Math.min(...wordsOfCue(cue, L).map((i) => L.words.get(i)!.sf - drawerLead(cue, L, i))) / FPS,
  modify: (c) => {
    const lead = drawerLead(c.cue, c.L, c.i);
    const d = c.f - c.geom.sf;
    if (d >= 0) return null;
    if (d < -lead) return {hidden: true, opacity: 0};
    const {a, b, n} = drawerEdge(c.cue, c.L);
    const p = (d + lead) / lead;
    const back = depthOf(c.cue, c.L, c.i) * (0.5 + 0.5 * Math.cos(Math.PI * p));
    const v = rot({x: -n.x * back, y: -n.y * back}, -c.block.angle);
    // the half-plane beyond the host edge, in the block frame
    const t = {x: b.x - a.x, y: b.y - a.y};
    const Lt = Math.hypot(t.x, t.y) || 1;
    const u = {x: t.x / Lt, y: t.y / Lt};
    const BIG = 40000;
    const poly = [
      {x: a.x - u.x * BIG, y: a.y - u.y * BIG}, {x: b.x + u.x * BIG, y: b.y + u.y * BIG},
      {x: b.x + u.x * BIG + n.x * BIG, y: b.y + u.y * BIG + n.y * BIG}, {x: a.x - u.x * BIG + n.x * BIG, y: a.y - u.y * BIG + n.y * BIG},
    ].map((q) => worldToBlock(c.block, q));
    const clip = `M${poly.map((q) => `${q.x} ${q.y}`).join('L')}Z`;
    return {dx: v.x, dy: v.y, clip};
  },
});
