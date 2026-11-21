// MemoryCard: a microSD card (Paper Trail storyboard items 56, 113 and 157): the stepped, chamfered corner of a real
// microSD, eight gold contacts at its leading end and a grip ridge at the other, a padlock on it, and beside it a small
// paper panel of fixed scrambled mono marks (`seed`), the contents nobody could read. `shackle` opens the padlock; a
// small `strain` lifts or presses the shackle a few px (the "pulled once" and "presses down" cues); `scan` sweeps one
// Manila scan line across the marks, which stay the same marks after it. `MicroSdCard` is the bare card, shared with the
// Bug's card slot so the card keeps its notch and contacts from the slot to this prop.
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, polyD, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {MonoText, outlineFor} from './drawingHelpers';
import {type RoleColours, roleColours, seeded} from './roles';

/** Natural size: the card is 140 wide and 192 tall (x -70 to 70, y -96 to 96, anchor its centre); the mark panel sits
 *  to its right (x 84 to 200) and the padlock hangs over its lower half. `size` is the card's 140 width. */
export const MEMORY_CARD_SIZE = {w: 140, h: 192};
/** The microSD outline, centred, 140 x 192: the top third narrower on the right with a chamfered corner, then the
 *  step out to the full width (the shape that tells a microSD from any other card). */
export const MICRO_SD_OUTLINE: Pt[] = [
  {x: -70, y: -96}, {x: 36, y: -96}, {x: 52, y: -80}, {x: 52, y: -36}, {x: 70, y: -22}, {x: 70, y: 96}, {x: -70, y: 96},
];
/** Contacts (eight gold strips at the leading end, the top). */
const CONTACTS = Array.from({length: 8}, (_, k) => ({x: -60 + k * 13.2, y: -88, w: 9, h: k === 0 || k === 7 ? 30 : 36}));

/** The bare microSD card in design space (centred, 140 x 192), contacts side up. Draw it inside your own transform;
 *  `sw` is the outline width in those units. */
export const MicroSdCard: React.FC<{C: RoleColours; sw: number; fill?: string}> = ({C, sw, fill}) => {
  const body = fill ?? C.muted;
  return (
    <g>
      <path d={polyD(MICRO_SD_OUTLINE)} fill={body} stroke={C.edge} strokeWidth={sw} strokeLinejoin="round" />
      {CONTACTS.map((c, k) => <rect key={k} x={c.x} y={c.y} width={c.w} height={c.h} rx={2} fill={C.highlight} stroke={mix(C.highlight, C.ground, 0.45)} strokeWidth={sw * 0.35} />)}
      {/* the grip ridge at the trailing end, and a faint printed band */}
      <path d={rrectPath(-56, 74, 112, 8, 4)} fill={mix(body, C.ground, 0.25)} />
      <path d={rrectPath(-56, -20, 112, 70, 10)} fill={mix(body, C.paper, 0.18)} />
    </g>
  );
};

export interface MemoryCardProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Picks the fixed scrambled marks (default 7). The marks never change for one seed. */
  seed?: number;
  /** Padlock: 0 shut, 1 open (the shackle lifts clear of the body on its short leg). */
  shackle?: number;
  /** Extra lift of the shackle in design units, positive up, negative pressed down (Paper Trail: about +4 for the
   *  strained pull on "hard", -3 for the press on "shut"; at size 140 one unit is one world px). */
  strain?: number;
  /** 0 to 1: one Manila scan line sweeps the marks left to right; drawn only while 0 < scan < 1. */
  scan?: number;
  /** Show the mark panel (default true). */
  panel?: boolean;
  /** Show the padlock (default true). */
  lock?: boolean;
  /** Card body colour (default the muted role). */
  tone?: string;
}
const cardPlace = (p: MemoryCardProps) => place(p, MEMORY_CARD_SIZE.w);
const PANEL = {x: 84, y: -64, w: 116, h: 112};
const LOCK = {cx: 0, top: 26, w: 92, h: 70};
const GLYPHS = '#%&@$?*/<>=+~^{}xQ9kZ2v7';
/** The fixed scrambled marks for a seed: three rows of five. */
export const memoryCardMarks = (seed = 7): string[] =>
  [0, 1, 2].map((r) => Array.from({length: 5}, (_, k) => GLYPHS[Math.floor(seeded(seed, r * 5 + k) * GLYPHS.length)]).join(''));

/** A microSD card with a padlock and a panel of scrambled marks. Anchor: the card's centre. */
export const MemoryCard: React.FC<MemoryCardProps> = (p) => {
  const q = cardPlace(p);
  const sw = outlineFor(q, MEMORY_CARD_SIZE.w, 0.035);
  const C = roleColours(p.colours);
  const silver = mix(C.muted, C.paper, 0.45);
  const lift = 30 * clamp(p.shackle ?? 0) + (p.strain ?? 0);
  const L = LOCK;
  const scan = p.scan ?? 0;
  const marks = memoryCardMarks(p.seed);
  // shackle: a U, its long left leg stays in the body when open, its short right leg comes clear
  const shOuter = 30, shT = 12, legTop = L.top - 46;
  const shackleD = `M${-shOuter + shT / 2} ${L.top + 40}V${legTop + shOuter}A${shOuter - shT / 2} ${shOuter - shT / 2} 0 0 1 ${shOuter - shT / 2} ${legTop + shOuter}V${L.top + 10}`;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {(p.panel ?? true) && (
        <g>
          <path d={rrectPath(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 8)} fill={C.paper} stroke={C.edge} strokeWidth={sw} strokeLinejoin="round" />
          {marks.map((m, r) => <MonoText key={r} x={PANEL.x + 14} y={PANEL.y + 34 + r * 32} text={m} size={24} width={88} fill={C.ground} />)}
          {scan > 0 && scan < 1 && (() => {
            const x = PANEL.x + 6 + (PANEL.w - 12) * scan;
            return (
              <g>
                <rect x={Math.max(PANEL.x + 6, x - 22)} y={PANEL.y + 6} width={Math.min(22, x - PANEL.x - 6)} height={PANEL.h - 12} fill={C.highlight} opacity={0.3} />
                <rect x={x - 2.5} y={PANEL.y + 4} width={5} height={PANEL.h - 8} fill={C.highlight} />
              </g>
            );
          })()}
        </g>
      )}
      <MicroSdCard C={C} sw={sw} fill={p.tone} />
      {(p.lock ?? true) && (
        <g>
          <g transform={`translate(0 ${(-lift).toFixed(2)})`}>
            <path d={shackleD} fill="none" stroke={C.edge} strokeWidth={shT + 2 * sw} strokeLinecap="round" />
            <path d={shackleD} fill="none" stroke={silver} strokeWidth={shT} strokeLinecap="round" />
            <path d={`M${-shOuter + shT / 2 - 2} ${legTop + shOuter}A${shOuter - shT / 2 - 2} ${shOuter - shT / 2 - 2} 0 0 1 ${-6} ${legTop + 6}`} fill="none" stroke={mix(silver, C.paper, 0.6)} strokeWidth={3} strokeLinecap="round" />
          </g>
          <path d={rrectPath(-L.w / 2, L.top, L.w, L.h, 12)} fill={C.highlight} stroke={C.edge} strokeWidth={sw} strokeLinejoin="round" />
          <path d={rrectPath(-L.w / 2 + 8, L.top + 8, L.w - 16, 6, 3)} fill={mix(C.highlight, C.paper, 0.45)} />
          <path d={circlePath(0, L.top + 32, 8) + `M-4 ${L.top + 36}L4 ${L.top + 36}L6 ${L.top + 54}L-6 ${L.top + 54}Z`} fill={C.ground} />
        </g>
      )}
    </g>
  );
};
/** World quad of the card, its panel and the padlock with the shackle at its current lift. */
export const memoryCardQuad = (p: MemoryCardProps): Pt[] => {
  const lift = 30 * clamp(p.shackle ?? 0) + Math.max(0, p.strain ?? 0);
  const x1 = (p.panel ?? true) ? PANEL.x + PANEL.w + 4 : 74;
  const y0 = Math.min(-100, LOCK.top - 52 - lift);
  return propQuad(cardPlace(p), {x: -74, y: y0, w: x1 + 74, h: LOCK.top + LOCK.h + 4 - y0});
};
/** World quad of the mark panel (where a scan line or a word sits beside the card). */
export const memoryCardPanel = (p: MemoryCardProps): Pt[] => propQuad(cardPlace(p), PANEL);
/** World point at the padlock's keyhole (a hand pulls the lock here). */
export const memoryCardLock = (p: MemoryCardProps): Pt => propPoint(cardPlace(p), {x: 0, y: LOCK.top + 32});
/** World quad of the bare card (no panel, no lock). */
export const memoryCardCardQuad = (p: MemoryCardProps): Pt[] => propQuad(cardPlace(p), {x: -70, y: -96, w: 140, h: 192});
export const memoryCardGraphic = (o: PropGraphicOpts<MemoryCardProps>): DecorGraphic => propGraphic(o, MemoryCard, memoryCardQuad);
