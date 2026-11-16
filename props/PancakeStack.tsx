// PancakeStack: a short stack of pancakes on a plate, seen in three-quarter view from about 25 degrees above the table
// (every circle an ellipse with ry = 0.42 rx), with a flat pat of butter on top. Made for "Right Chip, Wrong Huang"
// (Fable direction, pancake scene, 16 November 2026, items 10 to 18). Flat fills only: no outlines on the pancakes, no
// gradients, no blur, no shadows other than the drawn contact crescents.
//
// TWIN: the film keeps a copy of this geometry in its own kit (Right Chip Wrong Huang Music Video,
// video/src/components/kit/graphics/Tokens.tsx, `Stack` and `PANCAKE_GEOMETRY`), because that film does not import
// the engine. Change both together.
import React from 'react';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propColours, propGraphic, propQuad, propTransform} from './common';
import {ButterPatShape, butterColours} from './ButterPat';

/** View ratio: ry / rx of every circle on the table. */
export const PANCAKE_VIEW = 0.42;
/** Natural size (3 pancakes): the plate is 336 wide, the whole stack 195 high. `size` is the 336 plate width. */
export const PANCAKE_STACK_SIZE = {w: 336, h: 195};
/** Design units, anchor (0, 0) at the bottom centre of the plate, y up negative. */
export const PANCAKE_GEOMETRY = {
  plate: {cx: 0, cy: -77, rx: 168, ry: 70, thick: 6, rimRx: 140, rimRy: 59, rimW: 2},
  /** Each pancake is a short cylinder `thick` high; `top` is its top face centre for the bottom pancake, each next one
   *  20 higher. Differing widths and offsets are deliberate: pancakes are not identical discs. */
  thick: 20,
  firstTop: -100,
  /** [x offset of the top face centre, rx] from the bottom up (the first three are the film's stack). */
  layers: [[0, 132], [-4, 138], [3, 128], [-2, 134], [4, 130]] as [number, number][],
  /** Width of the pale batter rim round the griddled top face. */
  rim: 7,
  /** Contact crescent: the upper pancake's bottom ellipse shifted this far down, drawn on the pancake below. */
  shadowDrop: 4,
  /** The butter's base centre relative to the top pancake's top face centre, and its side. */
  butter: {dx: -11, dy: -4, side: 56, turn: 30},
  /** Griddle spots on the top face: [dx, dy, rx] relative to its centre (scaled by its rx / 128), none under the butter. */
  spots: [[-88, -10, 9], [67, -18, 8], [87, 12, 6], [-73, 22, 7], [42, -38, 6]] as [number, number, number][],
};

export interface PancakeStackProps extends PropBase {
  /** Number of pancakes, 2 to 5 (default 3). */
  count?: number;
  /** Draw the plate (default true). */
  plate?: boolean;
  /** Draw the butter pat on the top pancake (default true). */
  butter?: boolean;
}

const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${f1(cx - rx)} ${f1(cy)}A${f1(rx)} ${f1(ry)} 0 1 0 ${f1(cx + rx)} ${f1(cy)}A${f1(rx)} ${f1(ry)} 0 1 0 ${f1(cx - rx)} ${f1(cy)}Z`;

/** The stack's pancakes, bottom first: top face centre (cx, cy) and radii. */
export const pancakeLayers = (count = 3) => {
  const G = PANCAKE_GEOMETRY, n = Math.max(2, Math.min(5, Math.round(count)));
  return G.layers.slice(0, n).map(([dx, rx], j) => ({cx: dx, cy: G.firstTop - G.thick * j, rx, ry: rx * PANCAKE_VIEW}));
};
/** Every part of the stack as paths in design units (see PANCAKE_GEOMETRY for the anchor). */
export const pancakeStackParts = (count = 3) => {
  const G = PANCAKE_GEOMETRY, L = pancakeLayers(count), t = G.thick;
  const pl = G.plate;
  const layers = L.map((c, j) => {
    // side band: down the left end, round the front half of the bottom ellipse, up the right end, back along the
    // front half of the top ellipse
    const band = `M${f1(c.cx - c.rx)} ${f1(c.cy)}V${f1(c.cy + t)}A${f1(c.rx)} ${f1(c.ry)} 0 0 0 ${f1(c.cx + c.rx)} ${f1(c.cy + t)}V${f1(c.cy)}A${f1(c.rx)} ${f1(c.ry)} 0 0 1 ${f1(c.cx - c.rx)} ${f1(c.cy)}Z`;
    const irx = c.rx - G.rim;
    // contact crescent on the pancake below: this pancake's bottom ellipse shifted down, narrowed so it stays on
    // the lower pancake (no clip needed); only its front edge shows below this pancake's band
    const below = j > 0 ? L[j - 1] : null;
    const shadow = below
      ? ell(c.cx, c.cy + t + G.shadowDrop, Math.max(0, Math.min(c.rx, below.rx - Math.abs(c.cx - below.cx)) - 1), c.ry)
      : '';
    return {band, face: ell(c.cx, c.cy, c.rx, c.ry), griddle: ell(c.cx, c.cy, irx, irx * PANCAKE_VIEW), shadow, c};
  });
  const top = L[L.length - 1];
  const k = top.rx / 128;
  const spots = G.spots.map(([dx, dy, r]) => ell(top.cx + dx * k, top.cy + dy * k, r, r * PANCAKE_VIEW)).join('');
  return {
    plateEdge: ell(pl.cx, pl.cy + pl.thick, pl.rx, pl.ry),
    plateFace: ell(pl.cx, pl.cy, pl.rx, pl.ry),
    plateRim: ell(pl.cx, pl.cy, pl.rimRx, pl.rimRy),
    layers, spots,
    butterAt: {x: top.cx + G.butter.dx, y: top.cy + G.butter.dy},
    /** Top of the ink (the top pancake's back edge), design units. */
    topY: top.cy - top.ry,
  };
};

/** Stack colours from the palette roles: batter edge paper mixed 35 percent toward highlight, griddled face highlight
 *  16 percent toward ground, plate paper (its edge 30 percent toward ground, its rim line 20). */
export const pancakeColours = (C: {paper: string; highlight: string; ground: string}) => ({
  batter: mix(C.paper, C.highlight, 0.35),
  griddled: mix(C.highlight, C.ground, 0.16),
  spot: mix(C.highlight, C.ground, 0.32),
  contact: mix(C.highlight, C.ground, 0.46),
  plate: C.paper,
  plateEdge: mix(C.paper, C.ground, 0.3),
  plateRim: mix(C.paper, C.ground, 0.2),
});

/** The stack drawn in design units at its anchor (no placement transform). */
export const PancakeStackShape: React.FC<{count?: number; plate?: boolean; butter?: boolean; colours: ReturnType<typeof pancakeColours>; butterColours: ReturnType<typeof butterColours>}> = (p) => {
  const S = pancakeStackParts(p.count);
  const C = p.colours, G = PANCAKE_GEOMETRY;
  return (
    <g>
      {p.plate !== false && (
        <g>
          <path d={S.plateEdge} fill={C.plateEdge} />
          <path d={S.plateFace} fill={C.plate} />
          <path d={S.plateRim} fill="none" stroke={C.plateRim} strokeWidth={G.plate.rimW} />
        </g>
      )}
      {S.layers.map((l, j) => (
        <g key={j}>
          {l.shadow && <path d={l.shadow} fill={C.contact} />}
          <path d={l.band} fill={C.batter} />
          <path d={l.face} fill={C.batter} />
          <path d={l.griddle} fill={C.griddled} />
        </g>
      ))}
      <path d={S.spots} fill={C.spot} opacity={0.55} />
      {p.butter !== false && (
        <g transform={`translate(${f1(S.butterAt.x)} ${f1(S.butterAt.y)})`}>
          <ButterPatShape side={G.butter.side} tilt={PANCAKE_VIEW} turn={G.butter.turn} colours={p.butterColours} />
        </g>
      )}
    </g>
  );
};

const stackPlace = (p: PancakeStackProps) => place(p, PANCAKE_STACK_SIZE.w);
/** A stack of pancakes on a plate with a pat of butter, three-quarter view. Anchor: the bottom centre of the plate. */
export const PancakeStack: React.FC<PancakeStackProps> = (p) => {
  const q = stackPlace(p);
  const C = propColours(p.colours);
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <PancakeStackShape count={p.count} plate={p.plate} butter={p.butter} colours={pancakeColours(C)} butterColours={butterColours(C)} />
    </g>
  );
};
export const pancakeStackQuad = (p: PancakeStackProps): Pt[] => {
  const S = pancakeStackParts(p.count);
  const top = Math.min(S.topY, p.butter === false ? S.topY : S.butterAt.y - 30);
  return propQuad(stackPlace(p), {x: -PANCAKE_STACK_SIZE.w / 2, y: top, w: PANCAKE_STACK_SIZE.w, h: -top});
};
export const pancakeStackGraphic = (o: PropGraphicOpts<PancakeStackProps>): DecorGraphic => propGraphic(o, PancakeStack, pancakeStackQuad);
