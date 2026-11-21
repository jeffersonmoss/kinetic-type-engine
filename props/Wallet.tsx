// Wallet: a closed leather bifold wallet (Paper Trail storyboard items 61 and 209): stitched edges, a strap flap with
// a snap, a card and a banknote showing at the top.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, mix, place, propGraphic, propQuad, propTransform, rrectPath} from './common';
import {outlineFor, worldPx} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 160 x 108 (x -80 to 80, y -54 to 54; the card and note stand to y -70). Anchor: centre. `size` is
 *  the 160 width. */
export const WALLET_SIZE = {w: 160};
export interface WalletProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** Leather colour (default the body role darkened). */
  tone?: string;
}
const walletPlace = (p: WalletProps) => place(p, WALLET_SIZE.w);
export const Wallet: React.FC<WalletProps> = (p) => {
  const q = walletPlace(p);
  const sw = outlineFor(q, WALLET_SIZE.w, 0.025);
  const C = roleColours(p.colours);
  const leather = p.tone ?? mix(C.body, C.ground, 0.25);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const stitch = `${worldPx(q, 5).toFixed(2)} ${worldPx(q, 4).toFixed(2)}`;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={rrectPath(-50, -70, 76, 40, 3)} fill={mix(C.muted, C.paper, 0.35)} {...E} />
      <path d="M-40 -60H10" stroke={C.muted} strokeWidth={sw * 0.7} />
      <path d={rrectPath(-68, -64, 60, 40, 4)} fill={C.paper} {...E} />
      <path d={rrectPath(-60, -58, 18, 12, 2)} fill={C.highlight} />
      <path d={rrectPath(-80, -54, 160, 108, 12)} fill={leather} {...E} />
      <path d={rrectPath(-72, -46, 144, 92, 8)} fill="none" stroke={mix(leather, C.paper, 0.45)} strokeWidth={worldPx(q, 2)} strokeDasharray={stitch} />
      <path d={`M24 -30H80V30H24Q14 30 14 20V-20Q14 -30 24 -30Z`} fill={mix(leather, C.ground, 0.18)} {...E} />
      <path d={circlePath(36, 0, 8)} fill={mix(C.muted, C.paper, 0.4)} stroke={C.edge} strokeWidth={sw * 0.6} />
      <path d="M-60 26H-10" stroke={mix(leather, C.ground, 0.3)} strokeWidth={sw * 0.6} />
    </g>
  );
};
export const walletQuad = (p: WalletProps): Pt[] => propQuad(walletPlace(p), {x: -82, y: -72, w: 164, h: 128});
export const walletGraphic = (o: PropGraphicOpts<WalletProps>): DecorGraphic => propGraphic(o, Wallet, walletQuad);
