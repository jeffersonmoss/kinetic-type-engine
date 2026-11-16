// Bill: a banknote in the highlight colour with fine engraving, no numerals, no portrait, no seal. Ported from the
// DOGEfather kit (K14, storyboard item 17).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropColours, type PropGraphicOpts, f1, mix, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size of one Bill (2.35 : 1). `size` is its width. */
export const BILL_SIZE = {w: 470, h: 200};
export const BW = BILL_SIZE.w / 2, BH = BILL_SIZE.h / 2;

/** A sine wave laid along the segment a to b (offset perpendicular to it): one subpath. */
const waveAlong = (a: Pt, b: Pt, amp: number, wl: number, phase: number, step = 3) => {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  const n = Math.max(2, Math.round(L / step));
  let d = '';
  for (let k = 0; k <= n; k++) {
    const s = (L * k) / n;
    const o = amp * Math.sin((2 * Math.PI * s) / wl + phase);
    d += `${k ? 'L' : 'M'}${f1(a.x + ux * s - uy * o)} ${f1(a.y + uy * s + ux * o)}`;
  }
  return d;
};
/** A closed modulated ellipse (guilloche ring). */
const ringWave = (cx: number, cy: number, rx: number, ry: number, amp: number, lobes: number, phase: number, n = 220) => {
  let d = '';
  for (let k = 0; k <= n; k++) {
    const th = (2 * Math.PI * k) / n;
    const m = amp * Math.sin(lobes * th + phase);
    d += `${k ? 'L' : 'M'}${f1(cx + (rx + m) * Math.cos(th))} ${f1(cy + (ry + m) * Math.sin(th))}`;
  }
  return d + 'Z';
};
/** A spirograph rosette (not a seal: no text, no emblem). */
const rosette = (cx: number, cy: number, r: number, amp: number, lobes: number, phase: number, n = 160) => {
  let d = '';
  for (let k = 0; k <= n; k++) {
    const th = (2 * Math.PI * k) / n;
    const rr = r + amp * Math.sin(lobes * th + phase);
    d += `${k ? 'L' : 'M'}${f1(cx + rr * Math.cos(th))} ${f1(cy + rr * Math.sin(th))}`;
  }
  return d + 'Z';
};

// The engraving is fixed geometry, so it is built once (colours are applied at draw time).
const BAND = 16; // centre line of the guilloche band, inset from the edge
const GUILLOCHE = (() => {
  const x0 = -BW + BAND, x1 = BW - BAND, y0 = -BH + BAND, y1 = BH - BAND;
  let d = '';
  for (const ph of [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3]) {
    d += waveAlong({x: x0, y: y0}, {x: x1, y: y0}, 4.5, 18, ph);
    d += waveAlong({x: x0, y: y1}, {x: x1, y: y1}, 4.5, 18, ph);
    d += waveAlong({x: x0, y: y0}, {x: x0, y: y1}, 4.5, 18, ph);
    d += waveAlong({x: x1, y: y0}, {x: x1, y: y1}, 4.5, 18, ph);
  }
  return d;
})();
const OVAL_RING = ringWave(0, 0, 60, 68, 3, 18, 0) + ringWave(0, 0, 60, 68, 3, 18, Math.PI);
const ROSETTE = rosette(128, 0, 30, 6, 9, 0) + rosette(128, 0, 30, 6, 9, Math.PI) + rosette(128, 0, 16, 3, 9, Math.PI / 2);
const CORNERS: Pt[] = [{x: -BW + 8, y: -BH + 8}, {x: BW - 8 - 66, y: -BH + 8}, {x: -BW + 8, y: BH - 8 - 48}, {x: BW - 8 - 66, y: BH - 8 - 48}];
const TEXT_BARS = [rrectPath(-174, -24, 92, 8, 4), rrectPath(-163, -4, 70, 8, 4), rrectPath(-174, 16, 92, 8, 4)].join('');

/** The Bill's drawing in design units, centred on (0, 0) (shared with BillFan). */
export const BillArt: React.FC<{sw: number; C: PropColours}> = ({sw, C}) => {
  // engraving ink: the note colour mixed toward the darkest ink
  const ink = mix(C.highlight, C.ground, 0.45), inkSoft = mix(C.highlight, C.ground, 0.24), pale = mix(C.highlight, C.paper, 0.45);
  return (
    <>
      <path d={rrectPath(-BW, -BH, 2 * BW, 2 * BH, 8)} fill={C.highlight} stroke={C.paper} strokeWidth={sw} strokeLinejoin="round" />
      <path d={rrectPath(-BW + 10, -BH + 10, 2 * BW - 20, 2 * BH - 20, 4)} fill="none" stroke={ink} strokeWidth={2.5} />
      <path d={rrectPath(-BW + 22, -BH + 22, 2 * BW - 44, 2 * BH - 44, 3)} fill="none" stroke={ink} strokeWidth={1.5} />
      <path d={GUILLOCHE} fill="none" stroke={inkSoft} strokeWidth={1.4} />
      {CORNERS.map((c, k) => (
        <g key={k}>
          <path d={rrectPath(c.x, c.y, 66, 48, 6)} fill={ink} />
          <path d={rrectPath(c.x + 7, c.y + 7, 52, 34, 4)} fill="none" stroke={pale} strokeWidth={2} />
        </g>
      ))}
      <path d={TEXT_BARS} fill={inkSoft} />
      <path d={ROSETTE} fill="none" stroke={inkSoft} strokeWidth={1.4} />
      <path d={OVAL_RING} fill="none" stroke={inkSoft} strokeWidth={1.4} />
      <ellipse cx={0} cy={0} rx={50} ry={58} fill={pale} stroke={ink} strokeWidth={3} />
      <ellipse cx={0} cy={0} rx={44} ry={52} fill="none" stroke={ink} strokeWidth={1.2} />
    </>
  );
};

export type BillProps = PropBase;
/** The Bill. Anchor: centre. Natural size 470 x 200 (`size` = width). A highlight-coloured banknote with a fine engraved
 *  double border, a guilloche rope band, four empty corner blocks (no numerals), an empty portrait oval with a
 *  guilloche ring, a rosette at right and text-band bars at left (no text). */
export const Bill: React.FC<BillProps> = (p) => {
  const q = place(p, BILL_SIZE.w);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <BillArt sw={strokeOf(q)} C={propColours(p.colours)} />
    </g>
  );
};
export const billQuad = (p: BillProps): Pt[] => propQuad(place(p, BILL_SIZE.w), {x: -BW, y: -BH, w: 2 * BW, h: 2 * BH});
export const billGraphic = (o: PropGraphicOpts<BillProps>): DecorGraphic => propGraphic(o, Bill, billQuad);
