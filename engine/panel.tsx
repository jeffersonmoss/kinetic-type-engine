// Panels (rules 40 and 175): coloured grounds that words may stand on (a panel is a ground, not a graphic,
// so words on it are not "covering a graphic"). A panel takes transforms over time: open on an edge, fold shut about an
// edge, flip over (its back shows), tear along a rule into two pieces, unroll from an edge, slide. Each transform lasts at
// least 8 frames; panelTrack() registers the outline for the validator's motion checks. Pure function of song time.
import React from 'react';
import {scoped} from './scope';
import {FPS, PALETTE} from './config';
import type {TrackedElement} from './motionCheck';
import type {Pt} from './types';
import {easeInOutSine, rot} from './util';

export type PanelKind = 'page' | 'cheque' | 'certificate' | 'receipt' | 'slab' | 'plank' | 'television' | 'drawer' | 'calendar' | 'doorSign' | 'book';
export type PanelEdge = 'left' | 'right' | 'top' | 'bottom';
export interface PanelOp {
  t: number;
  op: 'open' | 'fold' | 'flip' | 'tear' | 'unroll' | 'slide' | 'fall';
  /** Frames (at least 8). */
  frames?: number;
  /** open, fold, unroll: the edge it hinges on or unrolls from (default 'left' for open and unroll, 'bottom' for fold). */
  edge?: PanelEdge;
  /** slide, fall: offset in the panel's frame (fall accelerates, an ease-in, and the panel is gone when it ends); tear: how far the two pieces part (default 0.3 of the width). */
  to?: Pt;
  /** tear: where along the width the rule runs (0..1, default 0.5). */
  at?: number;
  /** flip: colour of the back. */
  back?: string;
}
export interface PanelDef {
  kind: PanelKind;
  /** Top-left, size and angle (degrees about the centre), in the space it is drawn in. */
  x: number; y: number; w: number; h: number; angle?: number;
  colour?: string;
  /** Colour of the panel's own markings (lines, bands). */
  ink?: string;
  ops?: PanelOp[];
  /** Song seconds it exists from (before: not drawn) and until. */
  from?: number; until?: number;
  /** Grey bars of body text (fractions of the panel's width and height: x, y, width, height), drawn instead of the kind's
   *  own markings (a page's body under its heading, entry 91). `barsUntil`: song seconds the bars close from both
   *  ends inward over 8 frames (DISAPPEAR takes them with it, entry 92). */
  bars?: Array<[number, number, number, number]>;
  barsUntil?: number;
}
export interface PanelState {
  visible: boolean;
  /** Scale about an edge point (open, fold, flip) and the point, in the panel's frame (origin top-left). */
  sx: number; sy: number; ox: number; oy: number;
  dx: number; dy: number;
  /** Fraction revealed from `edge` (unroll). */
  reveal: number; revealEdge: PanelEdge;
  /** Tear: parted distance and rule position; 0 when whole. */
  tear: number; tearAt: number;
  back: boolean; backColour?: string;
  /** Darkening (0 to 0.4) while it turns on an edge (open, fold), so it reads as a leaf swinging, not a squeeze. */
  shade: number;
}
const opP = (o: PanelOp, t: number) => easeInOutSine(((t - o.t) * FPS) / Math.max(8, o.frames ?? 8));
export const panelStateAt = (p: PanelDef, t: number): PanelState => {
  const s: PanelState = {visible: (p.from === undefined || t >= p.from) && (p.until === undefined || t < p.until), sx: 1, sy: 1, ox: 0, oy: 0, dx: 0, dy: 0, reveal: 1, revealEdge: 'left', tear: 0, tearAt: 0.5, back: false, shade: 0};
  for (const o of [...(p.ops ?? [])].sort((a, b) => a.t - b.t)) {
    const u = t < o.t ? 0 : opP(o, t);
    const before = t < o.t;
    switch (o.op) {
      case 'open': {
        const e = o.edge ?? 'left';
        const k = before ? 0 : u;
        if (e === 'left' || e === 'right') { s.sx *= Math.max(0.001, k); s.ox = e === 'left' ? 0 : p.w; } else { s.sy *= Math.max(0.001, k); s.oy = e === 'top' ? 0 : p.h; }
        if (before) s.visible = false;
        if (!before && u < 1) s.shade = Math.max(s.shade, 0.4 * (1 - k));
        break;
      }
      case 'fold': {
        if (before) break;
        const e = o.edge ?? 'bottom';
        const k = 1 - u;
        if (e === 'left' || e === 'right') { s.sx *= Math.max(0.001, k); s.ox = e === 'left' ? 0 : p.w; } else { s.sy *= Math.max(0.001, k); s.oy = e === 'top' ? 0 : p.h; }
        if (u >= 1) s.visible = false;
        s.shade = Math.max(s.shade, 0.4 * u);
        break;
      }
      case 'flip': {
        if (before) break;
        const c = Math.cos(Math.PI * u);
        s.sx *= Math.abs(c) < 0.001 ? 0.001 : c; s.ox = p.w / 2;
        if (c < 0) { s.back = !s.back; s.backColour = o.back; }
        break;
      }
      case 'tear': if (!before) { s.tear = u * (o.to?.x ?? 0.3 * p.w); s.tearAt = o.at ?? 0.5; } break;
      case 'unroll': s.reveal = before ? 0 : u; s.revealEdge = o.edge ?? 'left'; if (before) s.visible = false; break;
      case 'slide': if (!before) { s.dx += (o.to?.x ?? 0) * u; s.dy += (o.to?.y ?? 0) * u; } break;
      case 'fall': if (!before) { const q = Math.min(1, ((t - o.t) * FPS) / Math.max(8, o.frames ?? 8)); s.dx += (o.to?.x ?? 0) * q * q; s.dy += (o.to?.y ?? 0) * q * q; if (q >= 1) s.visible = false; } break;
    }
  }
  return s;
};

const Markings: React.FC<{p: PanelDef; ink: string}> = scoped(({p, ink}) => {
  const {w, h} = p;
  const sw = Math.max(2, Math.min(w, h) * 0.012);
  const line = (x1: number, y1: number, x2: number, y2: number, k: string, op = 0.35) => <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ink} strokeWidth={sw} opacity={op} />;
  switch (p.kind) {
    case 'page': return <g>{Array.from({length: 7}, (_, k) => line(w * 0.1, h * (0.18 + k * 0.1), w * (k === 6 ? 0.6 : 0.9), h * (0.18 + k * 0.1), `l${k}`))}</g>;
    case 'cheque': return <g>{line(w * 0.06, h * 0.7, w * 0.6, h * 0.7, 'a')}{line(w * 0.66, h * 0.82, w * 0.94, h * 0.82, 'b')}<rect x={w * 0.68} y={h * 0.18} width={w * 0.26} height={h * 0.2} fill="none" stroke={ink} strokeWidth={sw} opacity={0.35} /></g>;
    case 'certificate': return <g fill="none" stroke={ink} opacity={0.4}><rect x={w * 0.04} y={h * 0.06} width={w * 0.92} height={h * 0.88} strokeWidth={sw * 1.5} /><rect x={w * 0.07} y={h * 0.11} width={w * 0.86} height={h * 0.78} strokeWidth={sw * 0.7} /></g>;
    case 'receipt': return <g>{Array.from({length: 5}, (_, k) => line(w * 0.1, h * (0.15 + k * 0.15), w * 0.9, h * (0.15 + k * 0.15), `r${k}`, 0.25))}</g>;
    case 'plank': return <g>{[0.3, 0.55, 0.8].map((k, j) => line(0, h * k, w, h * (k + 0.03), `g${j}`, 0.2))}</g>;
    case 'television': return <g><rect x={w * 0.07} y={h * 0.09} width={w * 0.86} height={h * 0.74} rx={Math.min(w, h) * 0.06} fill={PALETTE.ground} />{line(w * 0.4, h * 0.92, w * 0.6, h * 0.92, 'st', 0.6)}</g>;
    case 'drawer': return <rect x={w * 0.38} y={h * 0.42} width={w * 0.24} height={h * 0.14} rx={h * 0.05} fill={ink} opacity={0.6} />;
    case 'calendar': return <g><rect x={0} y={0} width={w} height={h * 0.22} fill={PALETTE.accent} />{[0.3, 0.7].map((k) => <circle key={k} cx={w * k} cy={h * 0.04} r={Math.min(w, h) * 0.035} fill={PALETTE.shadow} />)}</g>;
    case 'doorSign': return <g fill="none" stroke={ink} strokeWidth={sw} opacity={0.6}><path d={`M${w * 0.2} 0L${w / 2} ${-h * 0.3}L${w * 0.8} 0`} /></g>;
    case 'book': return <g>{line(w / 2, 0, w / 2, h, 'sp', 0.45)}</g>;
    case 'slab': default: return null;
  }
});
const Bars: React.FC<{p: PanelDef; ink: string; t: number}> = scoped(({p, ink, t}) => {
  const k = p.barsUntil === undefined ? 1 : 1 - Math.min(1, Math.max(0, ((t - p.barsUntil) * FPS) / 8));
  if (k <= 0) return null;
  // each bar closes from both ends inward along its longer side
  return <g>{(p.bars ?? []).map(([x, y, bw, bh], j) => {
    const W = bw * p.w, H = bh * p.h, long = W >= H;
    const cx = (x + bw / 2) * p.w, cy = (y + bh / 2) * p.h;
    const ww = long ? W * k : W, hh = long ? H : H * k;
    return <rect key={j} x={cx - ww / 2} y={cy - hh / 2} width={ww} height={hh} fill={ink} opacity={0.3} />;
  })}</g>;
});
/** A panel at song seconds t; children are drawn on it (in its frame, origin top-left) and take its transforms. */
export const Panel: React.FC<{def: PanelDef; t: number; uid?: string; children?: React.ReactNode}> = scoped(({def: p, t, uid, children}) => {
  const s = panelStateAt(p, t);
  if (!s.visible) return null;
  const fill = s.back ? s.backColour ?? PALETTE.shadow : p.colour ?? PALETTE.paper;
  const ink = p.ink ?? PALETTE.shadow;
  const id = `panel-${uid ?? `${Math.round(p.x)}-${Math.round(p.y)}-${Math.round(p.w)}`}`;
  const edgeClip = (() => {
    if (s.reveal >= 1) return null;
    const r = s.reveal;
    const e = s.revealEdge;
    const x = e === 'right' ? p.w * (1 - r) : 0, y = e === 'bottom' ? p.h * (1 - r) : 0;
    const w = e === 'left' || e === 'right' ? p.w * r : p.w, h = e === 'top' || e === 'bottom' ? p.h * r : p.h;
    return {x, y, w, h};
  })();
  const body = (k: string, x0: number, x1: number, shift: number, turn: number) => (
    <g key={k} transform={`translate(${shift} 0) rotate(${turn} ${(x0 + x1) / 2} ${p.h / 2})`}>
      <clipPath id={`${id}-${k}`}><rect x={x0} y={-p.h} width={x1 - x0} height={p.h * 3} /></clipPath>
      <g clipPath={`url(#${id}-${k})`}>
        {p.kind === 'receipt'
          ? <path d={`M0 0L${p.w} 0L${p.w} ${p.h}${Array.from({length: 12}, (_, j) => `L${p.w - ((j + 0.5) * p.w) / 12} ${p.h - (j % 2 ? 0 : p.h * 0.04)}`).join('')}L0 ${p.h}Z`} fill={fill} />
          : <rect x={0} y={0} width={p.w} height={p.h} fill={fill} rx={p.kind === 'television' || p.kind === 'doorSign' ? Math.min(p.w, p.h) * 0.08 : 0} />}
        {!s.back && (p.bars ? <Bars p={p} ink={ink} t={t} /> : <Markings p={p} ink={ink} />)}
        {!s.back && children}
        {s.shade > 0.003 && <rect x={0} y={0} width={p.w} height={p.h} fill={PALETTE.ground} opacity={s.shade} />}
      </g>
    </g>
  );
  const tearX = p.w * s.tearAt;
  const content = s.tear > 0
    ? <g>{body('a', -p.w, tearX, -s.tear / 2, -8 * (s.tear / Math.max(1, 0.3 * p.w)))}{body('b', tearX, p.w * 2, s.tear / 2, 8 * (s.tear / Math.max(1, 0.3 * p.w)))}</g>
    : body('w', -p.w, p.w * 2, 0, 0);
  return (
    <g transform={`rotate(${p.angle ?? 0} ${p.x + p.w / 2} ${p.y + p.h / 2}) translate(${p.x + s.dx} ${p.y + s.dy}) translate(${s.ox} ${s.oy}) scale(${s.sx} ${s.sy}) translate(${-s.ox} ${-s.oy})`}>
      {edgeClip && <clipPath id={`${id}-reveal`}><rect x={edgeClip.x} y={edgeClip.y} width={edgeClip.w} height={edgeClip.h} /></clipPath>}
      <g clipPath={edgeClip ? `url(#${id}-reveal)` : undefined}>{content}</g>
    </g>
  );
});

/** Outline of a panel at t (in the space it is drawn in), for keepClear (do not: a panel is a ground) or tracking. */
export const panelQuad = (p: PanelDef, t: number): Pt[] | null => {
  const s = panelStateAt(p, t);
  if (!s.visible) return null;
  const corners = [{x: 0, y: 0}, {x: p.w, y: 0}, {x: p.w, y: p.h}, {x: 0, y: p.h}].map((q) => ({x: s.ox + (q.x - s.ox) * s.sx + s.dx, y: s.oy + (q.y - s.oy) * s.sy + s.dy}));
  const c = {x: p.w / 2, y: p.h / 2};
  return corners.map((q) => { const r = rot({x: q.x - c.x, y: q.y - c.y}, p.angle ?? 0); return {x: p.x + c.x + r.x, y: p.y + c.y + r.y}; });
};
/** The panel as a tracked element (abrupt exempt: open, unroll and fold reveal it geometrically; while it opens or folds
 *  on an edge in 10 to 16 frames it is a swing, judged by angle, not edge speed: ruling 192, Fable item 27). */
export const panelTrack = (p: PanelDef, id: string): TrackedElement => ({
  id, exempt: ['abrupt'],
  sample: (t) => { const q = panelQuad(p, t); if (!q) return null; const s = panelStateAt(p, t); return {opacity: 1, quad: q, state: s.back ? 'back' : 'front', swing: panelSwingExempt(p, t)}; },
});

/** Song seconds at which a panel starts to leave for good (its first fold or fall), or null: the words printed on it are
 *  removed then (they leave with it, as the old word of a DOOR does). */
export const panelGoneAt = (p: PanelDef): number | null => {
  let out: number | null = null;
  for (const o of p.ops ?? []) if (o.op === 'fold' || o.op === 'fall') out = out === null ? o.t : Math.min(out, o.t);
  if (p.until !== undefined) out = out === null ? p.until : Math.min(out, p.until);
  return out;
};
/** Song seconds a panel is mid swing (opening or folding on an edge). */
export const panelSwinging = (p: PanelDef, t: number) => panelStateAt(p, t).shade > 0.003;
/** Swing lengths exempt from the speed cap (Fable item 27, confirming KIT 79.1 for ruling 192's 10 to 16 frames). */
export const SWING_EXEMPT_FRAMES: [number, number] = [10, 16];
/** True while the panel opens or folds on an edge in an op of 10 to 16 frames: only then are the panel and the words on
 *  it exempt from the speed cap (a longer or shorter swing is checked like any motion). */
export const panelSwingExempt = (p: PanelDef, t: number): boolean => {
  if (!panelSwinging(p, t)) return false;
  return (p.ops ?? []).some((o) => {
    if (o.op !== 'open' && o.op !== 'fold') return false;
    const fr = Math.max(8, o.frames ?? 8);
    const df = (t - o.t) * FPS;
    return df >= 0 && df <= fr && fr >= SWING_EXEMPT_FRAMES[0] && fr <= SWING_EXEMPT_FRAMES[1];
  });
};
