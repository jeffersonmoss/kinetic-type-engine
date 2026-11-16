// The Mint Line as an engine BoardPath: anchors name it {path: 'mint', s}, the validator tracks its tip and lists it on
// handoff H1, and TypeStage draws it under the words (the first video's MintLineView, unchanged).
import React from 'react';
import type {BoardPath} from '../../engine';
import {mintPath as mintPoints, mintPointAt, mintTipAt} from './mintLine';
import type {MintLineDef} from './mintTypes';
import {MINT} from './palette';

export const mintPath = (def: MintLineDef, id = 'mint', label = 'Mint Line'): BoardPath => ({
  id, label,
  pointAt: (s) => mintPointAt(def, s),
  tipAt: (t) => mintTipAt(def, t),
  draw: (c) => {
    const pts = mintPoints(def, c.t);
    if (pts.length < 2) return null;
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
    const w = Math.max(def.width ?? 8, 3 / Math.max(0.01, c.cam.zoom));
    return <path d={d} fill="none" stroke={def.colour ?? MINT} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" opacity={def.opacity ?? 1} />;
  },
});
