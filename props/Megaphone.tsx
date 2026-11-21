// Megaphone: a handheld megaphone (Sweet Distillation storyboard item 57): mouthpiece, a straight cone flaring to the
// right, a bell rim with the dark open mouth seen in three-quarter view, a pistol grip with a trigger underneath, and
// `blast` sound arcs in front of the mouth. The same component in each speaker's colour (`tone`).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, arcD, mix, place, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 170 long from mouthpiece to rim, bell 108 across. Anchor at the grip (where a hand holds it); the
 *  axis runs 44 above it, pointing right (+x). `size` is the 170 length. */
export const MEGAPHONE_SIZE = {w: 170};
const OX = -16, OY = 14; // design coordinates are drawn with the grip centre moved to 0, 0
const AXIS = -44 + OY;
const RIM = {x: 124 + OX, y: AXIS};
export interface MegaphoneProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** Cone colour (default the paper role). */
  tone?: string;
  /** Mouthpiece, rim band, grip (default the ground role mixed a little toward detail). */
  trim?: string;
  /** 0 to 3 sound arcs in front of the mouth (fractions fade the next arc in). */
  blast?: number;
  /** Sound arc colour (default the edge role). Sweet Distillation: Ink on light grounds, Cream on Dusk. */
  arcs?: string;
  /** Mirror it to point left (bell toward -x, grip still underneath); megaphoneMouth and the quad follow. */
  flip?: boolean;
}
const megaPlace = (p: MegaphoneProps) => place(p, MEGAPHONE_SIZE.w);
/** A handheld megaphone pointing right. Anchor: the grip. */
export const Megaphone: React.FC<MegaphoneProps> = (p) => {
  const q = megaPlace(p);
  const sw = strokeOf(q);
  const C = roleColours(p.colours);
  const tone = p.tone ?? C.paper;
  const trim = p.trim ?? mix(C.ground, C.muted, 0.25);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const b = Math.max(0, Math.min(3, p.blast ?? 0));
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <g transform={p.flip ? 'scale(-1 1)' : undefined}>
      <g transform={`translate(${OX} ${OY})`}>
        {/* pistol grip and trigger guard */}
        <path d="M6 -32L32 -36L28 0Q16 9 3 3Z" fill={trim} {...E} />
        <path d="M32 -30Q46 -18 31 -9" fill="none" stroke={C.edge} strokeWidth={sw * 0.9} strokeLinecap="round" />
        <path d="M9 -22L27 -24M9 -12L26 -14" stroke={mix(trim, C.paper, 0.3)} strokeWidth={2.5} strokeLinecap="round" />
        {/* mouthpiece */}
        <path d={rrectPath(-42, -58, 24, 28, 6)} fill={trim} {...E} />
        {/* cone */}
        <path d="M-22 -62L112 -98L112 10L-22 -26Z" fill={tone} {...E} />
        <path d="M-6 -60L-6 -28" stroke={mix(tone, C.ground, 0.25)} strokeWidth={5} />
        <path d="M-10 -55L100 -86" stroke={mix(tone, C.paper, 0.45)} strokeWidth={5} strokeLinecap="round" />
        {/* bell rim (band) and the dark open mouth */}
        <ellipse cx={118} cy={-44} rx={16} ry={56} fill={trim} {...E} />
        <ellipse cx={121} cy={-44} rx={9} ry={45} fill={C.ground} />
      </g>
      {b > 0 && (
        <g fill="none" stroke={p.arcs ?? C.edge} strokeWidth={7 / (q.scale ?? 1)} strokeLinecap="round">
          {[0, 1, 2].map((k) => {
            const o = clamp(b - k);
            return o > 0 ? <path key={k} d={arcD(RIM, 74 + 30 * k, -34 + 4 * k, 34 - 4 * k)} opacity={o} /> : null;
          })}
        </g>
      )}
      </g>
    </g>
  );
};
/** World quad of the megaphone, with its sound arcs while `blast` is over 0. */
const mirror = (p: MegaphoneProps, b: {x: number; y: number; w: number; h: number}) => (p.flip ? {...b, x: -b.x - b.w} : b);
export const megaphoneQuad = (p: MegaphoneProps): Pt[] =>
  (p.blast ?? 0) > 0 ? propQuad(megaPlace(p), mirror(p, {x: -62, y: -110, w: 312, h: 160})) : propQuad(megaPlace(p), mirror(p, {x: -62, y: -90, w: 184, h: 116}));
/** World point at the centre of the bell's mouth (plates and arcs come from here). */
export const megaphoneMouth = (p: MegaphoneProps): Pt => propPoint(megaPlace(p), p.flip ? {x: -RIM.x, y: RIM.y} : RIM);
export const megaphoneGraphic = (o: PropGraphicOpts<MegaphoneProps>): DecorGraphic => propGraphic(o, Megaphone, megaphoneQuad);
