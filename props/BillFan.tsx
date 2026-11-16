// BillFan: Bills fanned like cash held at its corner. Ported from the DOGEfather kit (K14).
import React from 'react';
import {rot} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {BH, BILL_SIZE, BW, BillArt} from './Bill';
import {type PropBase, type PropGraphicOpts, f1, place, propColours, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';

export interface BillFanProps extends PropBase {
  /** Number of bills (default 5). */
  count?: number;
  /** Degrees between neighbouring bills when fully fanned (default 9). */
  step?: number;
  /** 0 = all stacked on the first bill, 1 = fanned. */
  fan: number;
}
/** `size` is one bill's width (natural 470). */
const fanPlace = (p: BillFanProps) => place(p, BILL_SIZE.w);
/** Bills fanned like cash in a hand. Anchor (x, y): the bottom-left corner of the stack, the pivot every bill turns
 *  about. Bill 0 lies flat (its body runs right and up from the pivot: 470 x 200) and is on top; bill k turns
 *  k * step * fan degrees counter-clockwise behind it, so the fan opens upward like cash held at its corner. */
export const BillFan: React.FC<BillFanProps> = (p) => {
  const n = Math.max(1, Math.round(p.count ?? 5));
  const step = p.step ?? 9;
  const q = fanPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  const order = Array.from({length: n}, (_, k) => n - 1 - k);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {order.map((k) => (
        <g key={k} transform={`rotate(${f1(-k * step * p.fan)}) translate(${BW} ${-BH})`}>
          <BillArt sw={sw} C={C} />
        </g>
      ))}
    </g>
  );
};
/** World quad of the fan's bounding box (in the fan's own frame). */
export const billFanQuad = (p: BillFanProps): Pt[] => {
  const n = Math.max(1, Math.round(p.count ?? 5));
  const step = p.step ?? 9;
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  for (let k = 0; k < n; k++) {
    for (const c of [{x: 0, y: 0}, {x: 2 * BW, y: 0}, {x: 2 * BW, y: -2 * BH}, {x: 0, y: -2 * BH}]) {
      const r = rot(c, -k * step * p.fan);
      x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x); y0 = Math.min(y0, r.y); y1 = Math.max(y1, r.y);
    }
  }
  return propQuad(fanPlace(p), {x: x0, y: y0, w: x1 - x0, h: y1 - y0});
};
/** World centre of bill k of a fan. */
export const billFanBillCentre = (p: BillFanProps, k: number): Pt => propPoint(fanPlace(p), rot({x: BW, y: -BH}, -k * (p.step ?? 9) * p.fan));
export const billFanGraphic = (o: PropGraphicOpts<BillFanProps>): DecorGraphic => propGraphic(o, BillFan, billFanQuad);
