// PostCard: a social media post card (no bird, no logo). Ported from the DOGEfather kit (K14, L78).
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, propColours, propGraphic, propQuad, propTransform, rrectPath, strokeOf} from './common';

/** Natural size 440 x 220; `size` is the width. */
export const POST_CARD_SIZE = {w: 440, h: 220};
export type PostCardProps = PropBase;
const postPlace = (p: PostCardProps) => place(p, POST_CARD_SIZE.w);
/** A social post card: rounded body-coloured card, blank avatar circle, name and handle bars, three text lines and a
 *  row of three small action dots. No bird, no logo. Anchor: centre. Natural size 440 x 220. */
export const PostCard: React.FC<PostCardProps> = (p) => {
  const q = postPlace(p);
  const sw = strokeOf(q);
  const C = propColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-220, -110, 440, 220, 28)} fill={C.body} stroke={C.paper} strokeWidth={sw} />
      <circle cx={-162} cy={-52} r={32} fill={C.muted} />
      <path d={rrectPath(-114, -70, 130, 16, 8)} fill={C.paper} />
      <path d={rrectPath(-114, -44, 90, 12, 6)} fill={C.muted} />
      <path d={rrectPath(-186, 0, 364, 12, 6) + rrectPath(-186, 24, 340, 12, 6) + rrectPath(-186, 48, 220, 12, 6)} fill={mix(C.muted, C.paper, 0.35)} />
      <path d={circlePath(-170, 84, 6) + circlePath(-80, 84, 6) + circlePath(10, 84, 6)} fill={C.muted} />
    </g>
  );
};
export const postCardQuad = (p: PostCardProps): Pt[] => propQuad(postPlace(p), {x: -220, y: -110, w: 440, h: 220});
export const postCardGraphic = (o: PropGraphicOpts<PostCardProps>): DecorGraphic => propGraphic(o, PostCard, postCardQuad);
