// DRAWER (DOGE storyboard v2 item 59, K7; Fable item 37): the new words slide out from behind an edge of a word or a
// prop of the old line, clipped at that edge. Each word slides `depth` world px out along the edge's outward normal,
// ending on its own sung frame, so the clip edge is the entrance. Ported from DOGE's sheet/state.ts (drawerEdge,
// drawerClip, drawerDepth); the lead is lengthened so the slide stays within the 32 px per frame cap.
// Build it with drawer({host | rect, edge, depth?, lead?}) (authoring.ts). Place the block on the far side of the edge
// (an anchor on the host word's foot, top or flank, or on the prop), so it rests clear of the host.
// params: edge 'top' | 'bottom' | 'left' | 'right' (of the host box); rect (a world box {x, y, w, h, angle?}; default the
// host word `from.word`); depth (default each word's own extent across the edge plus 4, so it starts fully hidden);
// lead (frames, default 6, at least 4).
// Stacked words (Fable gate DOGE B1 fix 11, 16 November 2026): a word with other words of the same drawer between it and
// the edge (a second row under a first) comes out from under those words, not from the edge itself: it is masked at
// their far side (a line parallel to the edge) and slides from wholly behind it. Before, every word was masked only at
// the host edge and slid its own distance from it, so a second row slid down through the first (APPLICATION. over
// HELL OF A in DOGE B1, frames 908 to 913).
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
/** Word i's box (world) projected on the edge's normal n and tangent u, measured from the edge's start a. */
const spans = (cue: VerbCue, L: BoardLayout, i: number) => {
  const {a, b: e, n} = drawerEdge(cue, L);
  const t = {x: e.x - a.x, y: e.y - a.y};
  const Lt = Math.hypot(t.x, t.y) || 1;
  const u = {x: t.x / Lt, y: t.y / Lt};
  const g = L.words.get(i)!;
  const b = L.blocks[g.block];
  const q = [{x: g.x, y: g.y}, {x: g.x + g.w, y: g.y}, {x: g.x + g.w, y: g.y + g.boxH}, {x: g.x, y: g.y + g.boxH}].map((p) => blockToWorld(b, p));
  const pn = q.map((p) => (p.x - a.x) * n.x + (p.y - a.y) * n.y), pu = q.map((p) => (p.x - a.x) * u.x + (p.y - a.y) * u.y);
  return {n0: Math.min(...pn), n1: Math.max(...pn), u0: Math.min(...pu), u1: Math.max(...pu)};
};
/** Distance from the host edge (along n) of the line word i comes out from under: the far side of the drawer's own
 *  words that lie wholly between it and the edge and overlap it along the edge (0 when none: the edge itself). */
const stackMemo = new WeakMap<VerbCue, Map<number, number>>();
export const drawerStack = (cue: VerbCue, L: BoardLayout, i: number): number => {
  let m = stackMemo.get(cue);
  if (!m) { m = new Map(); stackMemo.set(cue, m); }
  const hit = m.get(i);
  if (hit !== undefined) return hit;
  const me = spans(cue, L, i);
  let s = 0;
  for (const j of wordsOfCue(cue, L)) {
    if (j === i) continue;
    const o = spans(cue, L, j);
    if (o.n1 <= me.n0 + 1 && o.u1 > me.u0 + 1 && o.u0 < me.u1 - 1) s = Math.max(s, o.n1);
  }
  m.set(i, s);
  return s;
};
const depthOf = (cue: VerbCue, L: BoardLayout, i: number) => {
  const s = drawerStack(cue, L, i);
  const own = spans(cue, L, i).n1 + 4;
  const d = cue.params?.depth as number | undefined;
  // a stacked word travels from wholly behind the words before it (at least its own extent past their far side)
  return d !== undefined ? (s > 0 ? Math.max(d - s, own - s) : d) : own - s;
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
    const {a: a0, b: b0, n} = drawerEdge(c.cue, c.L);
    // a stacked word's mask edge is the far side of the drawer's words between it and the host edge
    const s = drawerStack(c.cue, c.L, c.i);
    const a = {x: a0.x + n.x * s, y: a0.y + n.y * s}, b = {x: b0.x + n.x * s, y: b0.y + n.y * s};
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
