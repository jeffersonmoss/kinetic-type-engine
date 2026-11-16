// Board panels (rules 40 and 175): a page, a cheque, a certificate on a board, in world space, that
// words are printed on (block.on). A panel's ops (open on an edge, fold shut, flip, slide, fall) move it and every word
// on it together: a page that swings open from the Line arrives with PAGE ONE already printed on it, a page that flips
// up over the spine takes its words with it and shows the page beneath. Pure; wordState and TypeStage share it.
import {FPS} from './config';
import {panelQuad as panelQuadAt, panelStateAt, panelTrack} from './panel';
import type {TrackedElement} from './motionCheck';
import type {Board, BoardLayout, BoardPanel, Pt, WordGeom} from './types';
import {normDeg, polysOverlap, rot} from './util';
import type {WordMod} from './verbRegistry';
import {blockToWorld, worldToBlock} from './layout';

export const panelById = (board: Board, id: string): BoardPanel | undefined => board.panels?.find((p) => p.id === id);

/** Where a point of the panel's rest position (world) is at song seconds t, and the panel's scale along its own axes. */
export const panelMapAt = (p: BoardPanel, t: number) => {
  const s = panelStateAt(p, t);
  const C = {x: p.x + p.w / 2, y: p.y + p.h / 2};
  const A = p.angle ?? 0;
  const map = (c: Pt): Pt => {
    const r = rot({x: c.x - C.x, y: c.y - C.y}, -A);
    const q = {x: r.x + C.x - p.x, y: r.y + C.y - p.y}; // panel frame (origin top-left)
    const q2 = {x: s.ox + (q.x - s.ox) * s.sx + p.x + s.dx, y: s.oy + (q.y - s.oy) * s.sy + p.y + s.dy};
    const w = rot({x: q2.x - C.x, y: q2.y - C.y}, A);
    return {x: w.x + C.x, y: w.y + C.y};
  };
  return {state: s, map, angle: A};
};

/** The transform a word printed on a panel takes at frame f (block-local offsets and scales), or null. */
export const panelWordMod = (board: Board, L: BoardLayout, w: WordGeom, f: number): Partial<WordMod> | null => {
  const b = L.blocks[w.block];
  const id = b.def.on;
  if (!id) return null;
  const p = panelById(board, id);
  if (!p) return null;
  const {state: s, map, angle} = panelMapAt(p, f / FPS);
  if (!s.visible || s.back) return {hidden: true, opacity: 0};
  const c = blockToWorld(b, {x: w.x + w.w / 2, y: w.y + w.h / 2});
  const c2 = map(c);
  const d = rot({x: c2.x - c.x, y: c2.y - c.y}, -b.angle);
  const rel = Math.abs(normDeg(b.angle - angle)) % 180;
  const swap = rel > 45 && rel < 135;
  return {dx: d.x, dy: d.y, sx: swap ? s.sy : s.sx, sy: swap ? s.sx : s.sy};
};

/** Every board panel as a tracked element (graphic motion checks; open, fold and unroll are geometric reveals). */
export const panelTracks = (board: Board): TrackedElement[] => (board.panels ?? []).map((p) => panelTrack(p, `panel ${p.id}`));

/** Drawing key of a word's layer (TypeStage's layered sort): a panel is [z, 0, 0], a block on it [panel z, 1, block z],
 *  a free block [block z, 2, 0]. */
const layerKey = (board: Board, L: BoardLayout, block: number): number[] => {
  const d = L.blocks[block].def;
  return d.on ? [panelById(board, d.on)?.z ?? 0, 1, d.z ?? 0] : [d.z ?? 0, 2, 0];
};
const above = (a: number[], b: number[]) => { for (let k = 0; k < 3; k++) if (a[k] !== b[k]) return a[k] > b[k]; return false; };
const inside = (p: Pt, q: Pt[]) => {
  let sgn = 0;
  for (let k = 0; k < q.length; k++) {
    const a = q[k], b = q[(k + 1) % q.length];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(c) < 1e-9) continue;
    const s = Math.sign(c);
    if (sgn && s !== sgn) return false;
    sgn = s;
  }
  return true;
};
/** Occlusion by panels drawn above a word (a page lying on the page beneath, a page over LOST): the word is hidden when
 *  a panel above covers it whole, and clipped to what no panel above covers when one covers part of it. The drawing
 *  order already hides it on screen; this tells the validator the same thing (a word revealed by a page turning or
 *  falling arrives by a mask, not by a cut). `quad` is the word's world outline as drawn. */
export const panelCover = (board: Board, L: BoardLayout, w: WordGeom, f: number, quad: Pt[]): Partial<WordMod> | null => {
  if (!board.panels?.length) return null;
  const key = layerKey(board, L, w.block);
  const covers: Pt[][] = [];
  for (const p of board.panels) {
    if (!above([p.z ?? 0, 0, 0], key)) continue;
    const q = panelQuadAt(p, f / FPS);
    if (!q) continue;
    if (quad.every((c) => inside(c, q))) return {hidden: true, opacity: 0};
    if (polysOverlap(quad, q, 0.5)) covers.push(q);
  }
  if (!covers.length) return null;
  const b = L.blocks[w.block];
  const B = 1e5;
  return {clip: `M${-B} ${-B}L${B} ${-B}L${B} ${B}L${-B} ${B}Z` + covers.map((q) => `M${q.map((c) => { const v = worldToBlock(b, c); return `${v.x.toFixed(2)} ${v.y.toFixed(2)}`; }).join('L')}Z`).join('')};
};

/** True when a panel stands between two blocks' layers (one of them is printed on a panel drawn above the other's
 *  layer): the lower word is drawn under that panel and clipped by it, so the two are never drawn through each other. */
export const panelSeparates = (board: Board, L: BoardLayout, a: number, b: number): boolean => {
  if (!board.panels?.length || a === b) return false;
  const ka = layerKey(board, L, a), kb = layerKey(board, L, b);
  const da = L.blocks[a].def.on, db = L.blocks[b].def.on;
  if (da && da === db) return false;
  const pa = da ? [ka[0], 0, 0] : null, pb = db ? [kb[0], 0, 0] : null;
  return (!!pa && above(pa, kb)) || (!!pb && above(pb, ka));
};

/** The panel drawn between two blocks' layers, and which block is under it (Fable item 31): the validator skips their
 *  overlap only where the panel covers it, so ink already uncovered while the panel opens or folds is checked. */
export const separatingPanel = (board: Board, L: BoardLayout, a: number, b: number): {panel: BoardPanel; lower: number} | null => {
  if (!board.panels?.length || a === b) return null;
  const ka = layerKey(board, L, a), kb = layerKey(board, L, b);
  const da = L.blocks[a].def.on, db = L.blocks[b].def.on;
  if (da && da === db) return null;
  if (da && above([ka[0], 0, 0], kb)) { const p = panelById(board, da); if (p) return {panel: p, lower: b}; }
  if (db && above([kb[0], 0, 0], ka)) { const p = panelById(board, db); if (p) return {panel: p, lower: a}; }
  return null;
};
