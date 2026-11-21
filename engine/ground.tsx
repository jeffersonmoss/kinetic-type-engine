// Ground changes (rules 37 and 176): the ground colour changes only by a travelling edge, a disc from a
// point or a flame-shaped edge rising from the bottom, or by a PORTAL (a disc inside a counter, then the rig dives
// through it). Never by a cut or a short fade. Pure state (groundAt) plus the renderer (Ground), shared by the stage
// and the validator.
import React from 'react';
import {scoped} from './scope';
import {FPS, HEIGHT, PALETTE, WIDTH} from './config';
import {cameraAt, cameraTransform} from './camera';
import {SPEED_CAP} from './motion';
import type {Board, GroundWipe, Pt} from './types';
import {clamp, easeInOutSine, mixHex} from './util';

/** Height of the flame tongues (screen px). */
export const FLAME_TONGUE = 90;
const PEAK = Math.PI / 2; // easeInOutSine peak speed over average
const farCorner = (p: Pt) => Math.max(...[[0, 0], [WIDTH, 0], [0, HEIGHT], [WIDTH, HEIGHT]].map(([x, y]) => Math.hypot(x - p.x, y - p.y))) + 4;

/** Frames a wipe's edge takes: at least `frames` (default 12, board discs 8) and within the 32 px per frame cap. */
export const wipeFrames = (board: Board, w: GroundWipe): number => {
  if (w.shape === 'flame') return Math.max(w.frames ?? 12, Math.ceil(((HEIGHT + 2 * FLAME_TONGUE) * PEAK) / SPEED_CAP));
  if ((w.space ?? 'screen') === 'screen') return Math.max(w.frames ?? 12, Math.ceil((farCorner(w.from ?? {x: WIDTH / 2, y: HEIGHT / 2}) * PEAK) / SPEED_CAP));
  const zoom = cameraAt(board, w.t0 * FPS).zoom;
  return Math.max(w.frames ?? 8, Math.ceil((((w.r1 ?? 100) - (w.r0 ?? 0)) * zoom * PEAK) / SPEED_CAP));
};
/** Song seconds at which a wipe's colour is the whole ground. */
export const wipeFullAt = (board: Board, w: GroundWipe) =>
  w.fullAt ?? ((w.space ?? 'screen') === 'screen' ? w.t0 + wipeFrames(board, w) / FPS : Infinity);

export interface GroundState {
  /** The colour that covers the whole frame under any partial wipes. */
  full: string;
  /** Wipes in progress (or board discs waiting for their dive), in drawing order, with their progress 0..1. */
  partial: {w: GroundWipe; p: number}[];
}
export const groundAt = (board: Board, t: number): GroundState => {
  const ws = [...(board.ground ?? [])].sort((a, b) => a.t0 - b.t0);
  let full = board.bg;
  let partial: GroundState['partial'] = [];
  for (const w of ws) {
    if (t < w.t0) continue;
    if (t >= wipeFullAt(board, w)) { full = w.colour; partial = []; continue; }
    partial.push({w, p: easeInOutSine(((t - w.t0) * FPS) / wipeFrames(board, w))});
  }
  const fade = board.fadeToBlack;
  if (fade && Number.isFinite(fade.from) && Number.isFinite(fade.to) && t >= fade.from) {
    const p = fade.to <= fade.from ? 1 : clamp((t - fade.from) / (fade.to - fade.from));
    full = mixHex(full, '#000000', p);
  }
  return {full, partial};
};

/** The ground of a board at t (screen space, under everything on the board). */
export const Ground: React.FC<{board: Board; t: number}> = scoped(({board, t}) => {
  const g = groundAt(board, t);
  const cam = cameraAt(board, t * FPS);
  return (
    <g>
      <rect x={-10} y={-10} width={WIDTH + 20} height={HEIGHT + 20} fill={g.full} />
      {g.partial.map(({w, p}, k) => {
        if (w.shape === 'flame') {
          const Y = HEIGHT + FLAME_TONGUE - p * (HEIGHT + 2 * FLAME_TONGUE);
          const n = 48;
          const pts = Array.from({length: n + 1}, (_, j) => {
            const x = (j / n) * WIDTH;
            // a fixed row of tongues (no flicker): pointed peaks every 80 px with a slower swell
            const saw = 1 - Math.abs(((x / 80) % 1) * 2 - 1);
            const y = Y + FLAME_TONGUE * (1 - saw) * (0.6 + 0.4 * Math.sin(x / 210));
            return `${x.toFixed(1)} ${y.toFixed(1)}`;
          });
          return <path key={k} d={`M-10 ${HEIGHT + 10}L${pts.join('L')}L${WIDTH + 10} ${HEIGHT + 10}Z`} fill={w.colour} />;
        }
        if ((w.space ?? 'screen') === 'screen') {
          const c = w.from ?? {x: WIDTH / 2, y: HEIGHT / 2};
          return <circle key={k} cx={c.x} cy={c.y} r={Math.max(0, p * farCorner(c))} fill={w.colour} />;
        }
        const c = w.from ?? {x: 0, y: 0};
        const r = (w.r0 ?? 0) + ((w.r1 ?? 100) - (w.r0 ?? 0)) * clamp(p);
        const cid = `gclip-${Math.round(c.x)}-${Math.round(c.y)}-${k}`;
        return (
          <g key={k} transform={cameraTransform(cam)}>
            {w.clip && <clipPath id={cid}><path d={`M${w.clip.map((q) => `${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join('L')}Z`} /></clipPath>}
            <circle cx={c.x} cy={c.y} r={Math.max(0, r)} fill={w.colour} clipPath={w.clip ? `url(#${cid})` : undefined} />
          </g>
        );
      })}
    </g>
  );
});

/** The warm vignette (rule 73): Ink 2 to transparent, 18 percent at the corners, fixed to the screen. */
export const Vignette: React.FC<{uid?: string; opacity?: number}> = scoped(({uid = 'v', opacity = 0.18}) => (
  <g pointerEvents="none">
    <defs>
      <radialGradient id={`vig-${uid}`} cx={WIDTH / 2} cy={HEIGHT / 2} r={Math.hypot(WIDTH, HEIGHT) / 2} gradientUnits="userSpaceOnUse">
        <stop offset="0.55" stopColor={PALETTE.shadow} stopOpacity={0} />
        <stop offset="1" stopColor={PALETTE.shadow} stopOpacity={opacity} />
      </radialGradient>
    </defs>
    <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill={`url(#vig-${uid})`} />
  </g>
));
