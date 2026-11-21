// ClaimForm: a claim form on a clipboard (Paper Trail storyboard items 61, 209 and 214): a wooden board with a silver
// spring clip, a paper sheet with a CLAIM header and four ruled rows, each with an empty tick box at its left. `ticks`
// draws the ticks into the boxes one after another, top first, as a pen would; the row pitch is set to line up with
// the column of evidence bags beside it.
// `compact` (Fable layout-stills gate round 1, ruling 5): a short claim slip, 576 wide and 520 tall, a short header
// and four rows at pitch 100 whose ruled lines are 450 long, so a word printed on a row can be cap 64 (SHADES, about
// 424 px at cap 64, fits with room to spare). Its rows carry no placeholder text bars: the board prints the words.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {MonoText, outlineFor, worldPx} from './drawingHelpers';
import {type RoleColours, partialDash, roleColours} from './roles';

/** Natural size: the board is 420 wide (x -210 to 210); it runs from y -30 (top of the clip) to the last row plus
 *  110 (y 534 with the default four rows at pitch 88). Anchor: the board's top centre (y 0). Row k's ruled line sits
 *  at y 150 + k * pitch and runs x -102 to 150. `size` is the 420 width.
 *  Compact: 576 wide (x -288 to 288), y -24 (clip top) to the last row plus 36 (y 496 with four rows at pitch 100,
 *  520 tall in all); row k's ruled line at y 160 + k * pitch, x -194 to 256 (450 long). `size` is then the 576 width. */
export const CLAIM_FORM_SIZE = {w: 420};
/** The compact slip's natural width (`size` of a compact ClaimForm). */
export const CLAIM_FORM_COMPACT_SIZE = {w: 576};
export interface ClaimFormProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Design units between rows (default 88, compact 100; 84 to 92 keeps the full sheet's proportions). Set it so the
   *  rows line up with whatever stands beside the form (the bag column pitch divided by the form's scale). */
  pitch?: number;
  /** Rows (default 4). */
  rows?: number;
  /** 0 to `rows`: ticks drawn so far (2.5 = two ticks and half of the third). */
  ticks?: number;
  /** Tick colour (default the ground role, ink). */
  tickColour?: string;
  /** Header text (default CLAIM). */
  title?: string;
  /** The compact claim slip (576 wide, about 520 tall, rows at pitch 100 for words at cap 64). Default false. */
  compact?: boolean;
}
interface FormLayout {
  w: number; r: number; row0: number; pitch: number;
  clip: {x: number; y: number; w: number; h: number; r: number}; grip: {x: number; y: number; w: number; h: number}; clipLine: {y: number; x: number};
  paper: {x: number; top: number; bottomPad: number}; boardPad: number;
  title: {x: number; y: number; size: number}; bars: [number, number, number, number][]; rule: {y: number; x0: number; x1: number};
  box: {x: number; w: number}; line: {x0: number; x1: number}; textBars: boolean;
}
const FULL: FormLayout = {
  w: 420, r: 18, row0: 150, pitch: 88,
  clip: {x: -82, y: -30, w: 164, h: 58, r: 12}, grip: {x: -40, y: -18, w: 80, h: 16}, clipLine: {y: 18, x: 60},
  paper: {x: -180, top: 24, bottomPad: 92}, boardPad: 110,
  title: {x: -150, y: 92, size: 38}, bars: [[40, 64, 110, 12], [40, 84, 80, 10]], rule: {y: 112, x0: -150, x1: 150},
  box: {x: -170, w: 46}, line: {x0: -102, x1: 150}, textBars: true,
};
const COMPACT: FormLayout = {
  w: 576, r: 16, row0: 160, pitch: 100,
  clip: {x: -82, y: -24, w: 164, h: 50, r: 12}, grip: {x: -40, y: -13, w: 80, h: 14}, clipLine: {y: 16, x: 60},
  paper: {x: -270, top: 18, bottomPad: 22}, boardPad: 36,
  title: {x: -240, y: 58, size: 32}, bars: [[96, 34, 150, 11], [96, 52, 104, 9]], rule: {y: 76, x0: -240, x1: 256},
  box: {x: -256, w: 46}, line: {x0: -194, x1: 256}, textBars: false,
};
const layoutOf = (p: ClaimFormProps) => (p.compact ? COMPACT : FULL);
const formPlace = (p: ClaimFormProps) => place(p, layoutOf(p).w);
const geom = (p: ClaimFormProps) => {
  const L = layoutOf(p);
  const pitch = p.pitch ?? L.pitch, rows = p.rows ?? 4;
  const y = (k: number) => L.row0 + k * pitch;
  const last = y(rows - 1);
  return {L, pitch, rows, y, paperBottom: last + L.paper.bottomPad, boardBottom: last + L.boardPad};
};
/** The tick, relative to the box's left edge and the row line. */
const TICK: Pt[] = [{x: 8, y: -24}, {x: 20, y: -10}, {x: 44, y: -46}];
const TICK_LEN = Math.hypot(12, 14) + Math.hypot(24, 36);
export const ClaimForm: React.FC<ClaimFormProps> = (p) => {
  const q = formPlace(p);
  const g = geom(p), L = g.L;
  const sw = outlineFor(q, L.w, 0.012);
  const C = roleColours(p.colours);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const board = C.body, silver = mix(C.muted, C.paper, 0.45);
  const ink = p.tickColour ?? C.ground;
  const ticks = clamp(p.ticks ?? 0, 0, g.rows);
  const half = L.w / 2;
  const title = p.title ?? 'CLAIM';
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-half, 0, L.w, g.boardBottom, L.r)} fill={board} {...E} />
      <path d={rrectPath(L.paper.x, L.paper.top, -2 * L.paper.x, g.paperBottom - L.paper.top, 4)} fill={C.paper} {...E} />
      {/* the spring clip */}
      <path d={rrectPath(L.clip.x, L.clip.y, L.clip.w, L.clip.h, L.clip.r)} fill={silver} {...E} />
      <path d={rrectPath(L.grip.x, L.grip.y, L.grip.w, L.grip.h, L.grip.h / 2)} fill={mix(silver, C.ground, 0.35)} />
      <path d={`M${-L.clipLine.x} ${L.clipLine.y}H${L.clipLine.x}`} stroke={mix(silver, C.ground, 0.25)} strokeWidth={worldPx(q, 3)} />
      {/* header */}
      <MonoText x={L.title.x} y={L.title.y} text={title} size={L.title.size} width={title.length * 0.612 * L.title.size} fill={C.ground} />
      <path d={L.bars.map(([x, y, w, h]) => rrectPath(x, y, w, h, h / 2)).join('')} fill={C.muted} />
      <path d={`M${L.rule.x0} ${L.rule.y}H${L.rule.x1}`} stroke={C.ground} strokeWidth={worldPx(q, 3)} />
      {Array.from({length: g.rows}, (_, k) => {
        const y = g.y(k);
        const f = clamp(ticks - k);
        return (
          <g key={k}>
            <path d={rrectPath(L.box.x, y - L.box.w, L.box.w, L.box.w, 6)} fill={C.paper} stroke={C.ground} strokeWidth={worldPx(q, 4)} />
            {L.textBars && <path d={rrectPath(L.line.x0, y - 34, 90 + 40 * ((k * 3) % 4), 10, 5)} fill={mix(C.muted, C.paper, 0.2)} />}
            <path d={`M${L.line.x0} ${y}H${L.line.x1}`} stroke={mix(C.muted, C.ground, 0.2)} strokeWidth={worldPx(q, 2.5)} />
            {f > 0 && (
              <path
                d={TICK.map((v, j) => `${j ? 'L' : 'M'}${L.box.x + v.x} ${y + v.y}`).join('')}
                fill="none" stroke={ink} strokeWidth={worldPx(q, 9)} strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray={partialDash(TICK_LEN, f)}
              />
            )}
          </g>
        );
      })}
    </g>
  );
};
export const claimFormQuad = (p: ClaimFormProps): Pt[] => {
  const g = geom(p), L = g.L;
  return propQuad(formPlace(p), {x: -L.w / 2 - 2, y: L.clip.y - 2, w: L.w + 4, h: g.boardBottom - L.clip.y + 4});
};
/** World point at the left end of row k's ruled line (the line the row's text sits on). */
export const claimFormRow = (p: ClaimFormProps, k: number): Pt => propPoint(formPlace(p), {x: layoutOf(p).line.x0, y: geom(p).y(k)});
/** World point at the right end of row k's ruled line (with claimFormRow, the length a printed word may take). */
export const claimFormRowEnd = (p: ClaimFormProps, k: number): Pt => propPoint(formPlace(p), {x: layoutOf(p).line.x1, y: geom(p).y(k)});
/** World point at the centre of row k's tick box (where a pen tip goes). */
export const claimFormBox = (p: ClaimFormProps, k: number): Pt => {
  const L = layoutOf(p);
  return propPoint(formPlace(p), {x: L.box.x + L.box.w / 2, y: geom(p).y(k) - L.box.w / 2});
};
export const claimFormGraphic = (o: PropGraphicOpts<ClaimFormProps>): DecorGraphic => propGraphic(o, ClaimForm, claimFormQuad);
