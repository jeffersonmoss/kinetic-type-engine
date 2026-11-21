// IdCard: a photo ID card (Paper Trail storyboard items 61 and 209): a rounded card with a header band, a grey rounded
// square where a photo would be (no face, ever), text bars, and a slot punched for a lanyard clip.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, mix, place, propGraphic, propQuad, propTransform, rrectPath} from './common';
import {outlineFor} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 170 x 108 (x -85 to 85, y -54 to 54). Anchor: centre. `size` is the 170 width. */
export const ID_CARD_SIZE = {w: 170};
export interface IdCardProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Header band colour (default the wall role). */
  band?: string;
}
const idPlace = (p: IdCardProps) => place(p, ID_CARD_SIZE.w);
export const IdCard: React.FC<IdCardProps> = (p) => {
  const q = idPlace(p);
  const sw = outlineFor(q, ID_CARD_SIZE.w, 0.025);
  const C = roleColours(p.colours);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-85, -54, 170, 108, 12)} fill={C.paper} {...E} />
      <path d="M-85 -30V-42Q-85 -54 -73 -54H73Q85 -54 85 -42V-30Z" fill={p.band ?? C.wall} />
      <path d={rrectPath(-14, -48, 28, 8, 4)} fill={C.paper} stroke={C.edge} strokeWidth={sw * 0.5} />
      <path d={rrectPath(-72, -20, 52, 62, 9)} fill={mix(C.muted, C.paper, 0.25)} stroke={mix(C.muted, C.ground, 0.25)} strokeWidth={sw * 0.6} />
      <path d={rrectPath(-8, -16, 78, 11, 5) + rrectPath(-8, 4, 64, 8, 4) + rrectPath(-8, 20, 72, 8, 4)} fill={C.muted} />
      <path d={rrectPath(-8, 34, 40, 6, 3)} fill={mix(C.muted, C.paper, 0.35)} />
      <path d="M-85 -30V-42Q-85 -54 -73 -54H73Q85 -54 85 -42V-30" fill="none" {...E} />
    </g>
  );
};
export const idCardQuad = (p: IdCardProps): Pt[] => propQuad(idPlace(p), {x: -87, y: -56, w: 174, h: 112});
export const idCardGraphic = (o: PropGraphicOpts<IdCardProps>): DecorGraphic => propGraphic(o, IdCard, idCardQuad);
