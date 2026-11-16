// Monitor: a desktop monitor on a stand showing a ledger, with an optional help-desk headset. Ported from the
// DOGEfather kit (K14, items 21 and S18).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, leaderPath, mix, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size of the Monitor without the headset (560 x 480; `size` is the 560 width); the headset adds about 70 on
 *  the right. */
export const MONITOR_SIZE = {w: 560, h: 480};
const MSCR = {x: -262, y: -462, w: 524, h: 306};
const LEDGER_ROWS = 5;
const LEDGER_LABELS = [96, 120, 80, 108, 88];
export interface MonitorProps extends PropBase {
  /** 0 = dark screen, 1 = lit with its ledger. */
  lit?: number;
  /** 0..1: the ledger's highlight blocks are outlined, top to bottom, as this goes 0 to 1. */
  select?: number;
  /** A help-desk headset with a boom mic hung on the top-right corner. */
  headset?: boolean;
}
const monitorPlace = (p: MonitorProps) => place(p, MONITOR_SIZE.w);
/** Desktop monitor on a stand showing a ledger: five rows, each a label bar, a dotted leader and a highlight amount
 *  block. Anchor: bottom-centre of the stand's foot. Natural size 560 x 480 (screen inner 524 x 306). */
export const Monitor: React.FC<MonitorProps> = (p) => {
  const q = monitorPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const monLit = mix(C.wall, C.accent2, 0.28);
  const lit = clamp(p.lit ?? 1);
  const sel = clamp(p.select ?? 0) * LEDGER_ROWS;
  const rows: React.ReactNode[] = [];
  let leaders = '';
  let labels = '';
  for (let j = 0; j < LEDGER_ROWS; j++) {
    const y = -398 + j * 50;
    const lw = LEDGER_LABELS[j];
    labels += rrectPath(-236, y - 7, lw, 14, 7);
    leaders += leaderPath({x: -236 + lw + 18, y}, {x: 80, y});
    const s = clamp(sel - j);
    rows.push(
      <g key={j}>
        <rect x={96} y={y - 16} width={112} height={32} fill={C.highlight} />
        {s > 0 && <rect x={89} y={y - 23} width={126} height={46} fill="none" stroke={C.paper} strokeWidth={4} pathLength={1} strokeDasharray={`${s.toFixed(3)} 1`} />}
      </g>,
    );
  }
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {p.headset && (
        // back earcup, peeking out behind the right edge
        <path d={rrectPath(306, -474, 40, 56, 16)} fill={mix(C.body, C.ground, 0.4)} stroke={C.paper} strokeWidth={sw} />
      )}
      <path d="M-130 0L130 0L112 -20L-112 -20Z" fill={C.body} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <path d={rrectPath(-24, -140, 48, 122, 6)} fill={C.body} stroke={C.paper} strokeWidth={sw} />
      <path d={rrectPath(-280, -480, 560, 350, 14)} fill={C.body} stroke={C.paper} strokeWidth={sw} />
      <path d={rrectPath(MSCR.x, MSCR.y, MSCR.w, MSCR.h, 4)} fill={mix(C.ground, monLit, lit)} />
      <circle cx={244} cy={-143} r={4} fill={lit > 0.5 ? C.highlight : C.muted} />
      <g opacity={lit}>
        <path d={rrectPath(-236, -446, 150, 14, 7)} fill={C.paper} />
        <path d="M-240 -428H240" stroke={C.muted} strokeWidth={2} />
        <path d={labels} fill={mix(C.muted, C.paper, 0.4)} />
        <path d={leaders} fill={C.muted} />
        {rows}
      </g>
      {p.headset && (
        <g>
          {/* headband over the corner, front earcup on the bezel, boom mic curling down outside the screen */}
          <path d="M248 -474A42 42 0 0 1 328 -474" fill="none" stroke={C.paper} strokeWidth={sw + 8} strokeLinecap="round" />
          <path d="M248 -474A42 42 0 0 1 328 -474" fill="none" stroke={mix(C.body, C.ground, 0.2)} strokeWidth={8} strokeLinecap="round" />
          <path d="M262 -428Q312 -392 300 -342" fill="none" stroke={C.paper} strokeWidth={6} strokeLinecap="round" />
          <circle cx={300} cy={-338} r={11} fill={C.body} stroke={C.paper} strokeWidth={sw * 0.7} />
          <path d={rrectPath(226, -478, 46, 60, 17)} fill={mix(C.body, C.ground, 0.2)} stroke={C.paper} strokeWidth={sw} />
          <path d={rrectPath(236, -466, 26, 36, 10)} fill={mix(C.body, C.paper, 0.15)} />
        </g>
      )}
    </g>
  );
};
export const monitorQuad = (p: MonitorProps): Pt[] => propQuad(monitorPlace(p), {x: -280, y: -480, w: p.headset ? 630 : 560, h: 480});
/** World quad of the monitor's screen. */
export const monitorScreenRect = (p: MonitorProps): Pt[] => propQuad(monitorPlace(p), MSCR);
/** World quad of ledger block j (0 = top), for a Cursor to aim at. */
export const monitorBlockRect = (p: MonitorProps, j: number): Pt[] => propQuad(monitorPlace(p), {x: 96, y: -414 + j * 50, w: 112, h: 32});
export const monitorGraphic = (o: PropGraphicOpts<MonitorProps>): DecorGraphic => propGraphic(o, Monitor, monitorQuad);
