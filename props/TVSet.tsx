// TVSet: a flat-screen television seen from behind or from the side (Paper Trail storyboard items 58, 73, 78, 187).
// view 'back': the wide back panel (wall role, Lamp in the film) on a pedestal stand, a raised electronics housing with
// vent slots, four mounting screws, a rating sticker, a power inlet with a cable hanging to the floor, and at the left
// edge a recessed column of side-facing ports (two HDMI, the USB port the Bug plugs into, an audio jack). Anything
// passed as `plugged` is drawn masked at the USB port's mouth with the socket lip over it, so a Bug's plug goes into
// the port instead of lying on the panel (put bugPlugCollar at tvUsbPort). view 'side': the thin flat-screen profile
// with its back bulge on a stand, screen facing left.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {clipKey, outlineFor, worldPx} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: the back panel is 940 wide (x -470 to 470) and the set stands 446 tall on its foot (y -446 to 0).
 *  Anchor: the bottom centre of the stand's foot, on the floor. `size` is the 940 width (the side view keeps the same
 *  scale, so a back and a side view at one size have one height). */
export const TV_SIZE = {w: 940, h: 446};
const PANEL = {x: -470, y: -446, w: 940, h: 360};
const HOUSING = {x: -330, y: -372, w: 660, h: 262};
const RECESS = {x: -458, y: -400, w: 56, h: 270};
/** Free panel area, clear of every detail (the lyric lane, storyboard item 79). */
const LANE = {x: -390, y: -366, w: 540, h: 250};
const SCREWS = [{x: 196, y: -318}, {x: 296, y: -318}, {x: 196, y: -230}, {x: 296, y: -230}];
const STICKER = {x: 186, y: -196, w: 120, h: 66};
const INLET = {x: 380, y: -150, w: 36, h: 24};

export interface TVSetProps extends PropBase {
  colours?: Partial<RoleColours>;
  view?: 'back' | 'side';
  /** Panel colour (default the wall role mixed 10 percent toward paper, one step off a wall-role ground). */
  panel?: string;
  /** Length of the Bug the USB port is sized for, world px (default 300): the port's mouth is a little taller than
   *  that Bug's plug. */
  bugSize?: number;
  /** Back view: drawn masked at the USB port's mouth, under the socket lip (a plugged-in Bug). World space. */
  plugged?: React.ReactNode;
  /** Back view: the power cable hanging from the inlet to the floor (default true). */
  cable?: boolean;
}
const tvPlace = (p: TVSetProps) => place(p, TV_SIZE.w);
/** The USB port's mouth (design space): on the recess's right wall, facing right. */
const usbMouth = (p: TVSetProps) => {
  const s = (p.size ?? TV_SIZE.w) / TV_SIZE.w;
  const plugH = (60 / 360) * (p.bugSize ?? 300) / s; // the plug's 60-unit height at that bug size, in TV design units
  return {x: RECESS.x + RECESS.w, y: -262, h: plugH + 8};
};
/** Side-facing ports drawn as their faces turned toward the panel's centre (squeezed, so they read as facing sideways). */
const PORTS = [{y: -372, kind: 'hdmi'}, {y: -330, kind: 'hdmi'}, {y: -190, kind: 'jack'}] as const;

export const TVSet: React.FC<TVSetProps> = (p) => {
  const q = tvPlace(p);
  const sw = outlineFor(q, TV_SIZE.w, 0.008);
  const C = roleColours(p.colours);
  // Fable props gate loop 1, item 57: the slab is one step lighter than the wall role (Lamp in the film), with a wider
  // edge, so it holds on a Lamp ground as well as on Night.
  const panel = p.panel ?? mix(C.wall, C.paper, 0.1);
  const dark = mix(panel, C.ground, 0.55), light = mix(panel, C.paper, 0.1);
  const metal = mix(C.muted, C.paper, 0.35);
  const E = {stroke: C.edge, strokeWidth: sw * 1.6, strokeLinejoin: 'round' as const};
  const thin = Math.max(worldPx(q, 1.5), sw * 0.45);
  if ((p.view ?? 'back') === 'side') {
    return (
      <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
        {/* foot, neck, back bulge, the thin panel with its dark screen face on the left */}
        <path d={rrectPath(-130, -20, 260, 20, 6)} fill={dark} {...E} />
        <path d="M8 -150L40 -150L22 -20L-6 -20Z" fill={mix(panel, C.ground, 0.25)} {...E} />
        <path d="M10 -372C64 -350 66 -150 10 -118Z" fill={panel} {...E} />
        <path d="M30 -320C44 -290 44 -200 32 -170" fill="none" stroke={light} strokeWidth={thin * 2} strokeLinecap="round" />
        <path d={rrectPath(-14, PANEL.y, 26, PANEL.h, 8)} fill={panel} {...E} />
        <path d={`M-14 ${PANEL.y + 12}V${PANEL.y + PANEL.h - 12}`} stroke={C.ground} strokeWidth={8} strokeLinecap="round" />
      </g>
    );
  }
  const m = usbMouth(p);
  const id = clipKey('tv', p);
  const vents = Array.from({length: 2}, (_, r) => Array.from({length: 14}, (_, k) => rrectPath(-266 + k * 38, -356 + r * 20, 24, 8, 4)).join('')).join('');
  const cable = `M${INLET.x + INLET.w / 2} ${INLET.y + INLET.h}C${INLET.x + 20} -60 ${INLET.x + 46} -40 ${INLET.x + 50} -8Q${INLET.x + 54} 0 ${INLET.x + 80} 0H${INLET.x + 120}`;
  return (
    <g opacity={p.opacity ?? 1}>
      <g transform={propTransform(q)}>
        {/* stand */}
        <path d={rrectPath(-190, -22, 380, 22, 8)} fill={dark} {...E} />
        <path d={rrectPath(-40, -100, 80, 82, 6)} fill={mix(panel, C.ground, 0.3)} {...E} />
        {/* the back panel and its raised housing */}
        <path d={rrectPath(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 14)} fill={panel} {...E} />
        <path d={rrectPath(HOUSING.x, HOUSING.y, HOUSING.w, HOUSING.h, 34)} fill={light} stroke={dark} strokeWidth={thin} />
        <path d={vents} fill={dark} />
        {SCREWS.map((s, k) => (
          <g key={k}>
            <path d={circlePath(s.x, s.y, 9)} fill={metal} stroke={dark} strokeWidth={thin} />
            <path d={`M${s.x - 5} ${s.y}H${s.x + 5}M${s.x} ${s.y - 5}V${s.y + 5}`} stroke={dark} strokeWidth={thin} />
          </g>
        ))}
        <path d={rrectPath(STICKER.x, STICKER.y, STICKER.w, STICKER.h, 4)} fill={C.paper} stroke={dark} strokeWidth={thin} />
        <path d={rrectPath(STICKER.x + 10, STICKER.y + 10, 56, 8, 2) + rrectPath(STICKER.x + 10, STICKER.y + 26, 100, 5, 2) + rrectPath(STICKER.x + 10, STICKER.y + 38, 84, 5, 2) + rrectPath(STICKER.x + 10, STICKER.y + 50, 92, 5, 2)} fill={C.muted} />
        <path d={rrectPath(STICKER.x + 82, STICKER.y + 8, 28, 14, 2)} fill="none" stroke={C.muted} strokeWidth={thin} />
        {/* power inlet */}
        <path d={rrectPath(INLET.x, INLET.y, INLET.w, INLET.h, 5)} fill={dark} stroke={C.edge} strokeWidth={thin} />
        {/* the port recess at the left edge: a dark column whose right wall carries the side-facing ports */}
        <path d={rrectPath(RECESS.x, RECESS.y, RECESS.w, RECESS.h, 8)} fill={dark} stroke={C.edge} strokeWidth={thin} />
        <path d={`M${RECESS.x + RECESS.w - 12} ${RECESS.y + 8}V${RECESS.y + RECESS.h - 8}`} stroke={mix(dark, C.paper, 0.14)} strokeWidth={14} />
        {PORTS.map((pt, k) => (
          <g key={k} transform={`translate(${RECESS.x + RECESS.w - 14} ${pt.y})`}>
            {pt.kind === 'hdmi'
              ? <path d="M-12 -12H8V12H-12L-16 6V-6Z" fill={C.ground} stroke={metal} strokeWidth={thin * 1.4} strokeLinejoin="round" />
              : <><circle cx={-2} cy={0} r={8} fill={metal} /><circle cx={-2} cy={0} r={4} fill={C.ground} /></>}
          </g>
        ))}
        {/* the USB port: a dark mouth on the recess wall */}
        <path d={rrectPath(m.x - 18, m.y - m.h / 2, 18, m.h, 3)} fill={C.ground} />
        <path d={rrectPath(m.x - 15, m.y - m.h / 2 + 4, 6, m.h - 8, 2)} fill={mix(C.ground, C.muted, 0.35)} />
        {/* the cable */}
        {(p.cable ?? true) && (
          <g>
            <path d={cable} fill="none" stroke={C.edge} strokeWidth={10 + 2 * thin} strokeLinecap="round" />
            <path d={cable} fill="none" stroke={mix(C.ground, C.muted, 0.35)} strokeWidth={10} strokeLinecap="round" />
          </g>
        )}
      </g>
      {p.plugged && (
        <g>
          <clipPath id={`${id}-usb`}>
            <path d={`M${m.x} -2000H4000V4000H${m.x}Z`} transform={propTransform(q)} />
          </clipPath>
          <g clipPath={`url(#${id}-usb)`}>{p.plugged}</g>
        </g>
      )}
      {/* the socket lip over the plug */}
      <g transform={propTransform(q)}>
        <path d={rrectPath(m.x - 2, m.y - m.h / 2 - 5, 9, m.h + 10, 3)} fill={metal} stroke={C.edge} strokeWidth={thin} />
      </g>
    </g>
  );
};
/** World quad of the set (panel, stand, cable; or the side profile). */
export const tvQuad = (p: TVSetProps): Pt[] =>
  (p.view ?? 'back') === 'side'
    ? propQuad(tvPlace(p), {x: -130, y: PANEL.y, w: 260, h: -PANEL.y})
    : propQuad(tvPlace(p), {x: PANEL.x, y: PANEL.y, w: (p.cable ?? true) ? PANEL.w + 30 : PANEL.w, h: -PANEL.y});
/** World point at the USB port's mouth (back view): put a Bug's bugPlugCollar here. */
export const tvUsbPort = (p: TVSetProps): Pt => { const m = usbMouth(p); return propPoint(tvPlace(p), {x: m.x, y: m.y}); };
/** World quad of the free panel area, clear of vents, screws, sticker, ports and cable (the lyric lane). */
export const tvLane = (p: TVSetProps): Pt[] => propQuad(tvPlace(p), LANE);
/** World quad of the back panel itself (a board prints words on it, or masks a rise at its bottom edge). */
export const tvPanel = (p: TVSetProps): Pt[] => propQuad(tvPlace(p), PANEL);
/** Side view: world point on the back of the set at port height (where a bug sits behind it). */
export const tvSidePort = (p: TVSetProps): Pt => propPoint(tvPlace(p), {x: 52, y: -262});
/** Side view: world quad of the thin panel (a drawer rect for words coming out from behind the TV). */
export const tvSidePanel = (p: TVSetProps): Pt[] => propQuad(tvPlace(p), {x: -14, y: PANEL.y, w: 26, h: PANEL.h});
export const tvGraphic = (o: PropGraphicOpts<TVSetProps>): DecorGraphic => propGraphic(o, TVSet, tvQuad);
