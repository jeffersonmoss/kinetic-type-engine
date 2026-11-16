// Rocket: a rocket with fins, a porthole and a flickering flame. Ported from the DOGEfather kit (K14, item 29).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, f1, mix, outline, place, propColours, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';

// Accent nose cone, body-coloured body with a porthole, two accent side fins and a centre fin seen edge-on, nozzle, and
// a flame (accent outer, highlight inner, paper core). Points to -y at angle 0 (nose up). Anchor: the base of the
// body, where the flame starts (the nozzle exit). Natural size 124 x 394 without flame (x -62..62, y -380..14); the
// flame reaches about 170 below the anchor at full burn.
/** `size` is the 124 width. */
export const ROCKET_SIZE = {w: 124, h: 394};
export interface RocketProps extends PropBase {
  /** 0 no flame, 1 full: flame length and opacity. */
  burn?: number;
  /** Deterministic phase the board advances (for example frame * 0.5) for a gentle flame shape change. */
  flicker?: number;
}
/** Flame length in design units at burn and flicker. */
const flameLength = (burn: number, fl: number) => burn * (150 + 18 * Math.sin(fl) + 8 * Math.sin(fl * 2.3 + 1));
const rocketPlace = (p: RocketProps) => place(p, ROCKET_SIZE.w);
export const Rocket: React.FC<RocketProps> = (p) => {
  const q = rocketPlace(p);
  const C = propColours(p.colours);
  const burn = clamp(p.burn ?? 0), fl = p.flicker ?? 0;
  const flame = (w: number, L: number, wob: number) =>
    `M${-w} 0C${f1(-w * 1.15)} ${f1(L * 0.35)} ${f1(-w * 0.5 + wob)} ${f1(L * 0.75)} ${f1(wob)} ${f1(L)}C${f1(w * 0.5 + wob)} ${f1(L * 0.75)} ${f1(w * 1.15)} ${f1(L * 0.35)} ${w} 0Z`;
  const Lf = flameLength(burn, fl);
  const wob = 6 * Math.sin(fl * 1.3) * burn;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {burn > 0.01 && (
        <g opacity={clamp(burn * 2.5)}>
          <path d={flame(22, Lf, wob)} fill={C.accent} />
          <path d={flame(14, Lf * 0.68, wob * 0.7)} fill={C.highlight} />
          <path d={flame(7, Lf * 0.36, wob * 0.4)} fill={C.paper} />
        </g>
      )}
      <path d="M-20 -16H20L26 0H-26Z" fill={C.muted} {...outline(q, C, 0.7)} />
      <path d="M-34 -96C-52 -76 -62 -50 -62 -20L-62 14L-34 -6Z" fill={C.accent} {...outline(q, C)} />
      <path d="M34 -96C52 -76 62 -50 62 -20L62 14L34 -6Z" fill={C.accent} {...outline(q, C)} />
      <path d="M-34 -14V-258H34V-14Z" fill={C.body} {...outline(q, C)} />
      <path d="M-34 -258C-34 -320 -12 -362 0 -380C12 -362 34 -320 34 -258Z" fill={C.accent} {...outline(q, C)} />
      <path d="M-34 -258H34" stroke={C.paper} strokeWidth={strokeOf(q) * 0.6} />
      <path d={circlePath(0, -186, 20)} fill={mix(C.ground, C.accent2, 0.35)} {...outline(q, C)} />
      <path d={rrectPath(-7, -92, 14, 106, 3)} fill={mix(C.accent, C.ground, 0.25)} {...outline(q, C, 0.6)} />
    </g>
  );
};
/** World point of the nose tip and of the flame start. */
export const rocketNose = (p: RocketProps): Pt => propPoint(rocketPlace(p), {x: 0, y: -380});
export const rocketBase = (p: RocketProps): Pt => propPoint(rocketPlace(p), {x: 0, y: 0});
/** World quad of the rocket without its flame (as in the source kit). */
export const rocketQuad = (p: RocketProps): Pt[] => propQuad(rocketPlace(p), {x: -62, y: -380, w: 124, h: 394});
/** World polygons of the rocket's ink: the body quad, plus the flame's box while it burns. */
export const rocketInk = (p: RocketProps): Pt[][] => {
  const burn = clamp(p.burn ?? 0);
  const L = flameLength(burn, p.flicker ?? 0);
  return burn > 0.01 && L > 14 ? [rocketQuad(p), propQuad(rocketPlace(p), {x: -26, y: 0, w: 52, h: L + 8})] : [rocketQuad(p)];
};
export const rocketGraphic = (o: PropGraphicOpts<RocketProps>): DecorGraphic => propGraphic(o, Rocket, rocketInk);
