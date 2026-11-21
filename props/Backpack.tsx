// Backpack: a canvas backpack seen from the front (Paper Trail storyboard items 59, 207 and 209): a domed main
// compartment with a carry handle on top and the tops of both shoulder straps showing behind it, a zipped front pocket
// with its pull, and the main zip running over the dome. `zip` 0 to 1 opens the main zip from the right end: the pull
// travels along the dome and the front lip drops away, showing the dark opening. Anything passed as `inside` (world
// space) is drawn between the back of the bag and its front wall, so an item rising out of the mouth is masked at the
// opening (keep items narrower than backpackMouthWidth).
import React from 'react';
import {clamp} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, circlePath, lineD, mix, place, polyD, propGraphic, propPoint, propQuad, propTransform, rrectPath} from './common';
import {clipKey, outlineFor, worldPx} from './drawingHelpers';
import {type RoleColours, roleColours} from './roles';

/** Natural size: 300 tall from the floor to the top of the handle (y -300 to 0), 232 wide with the straps (x -116 to
 *  116). Anchor: the bottom centre (it stands on a counter). `size` is the 300 height. */
export const BACKPACK_SIZE = {h: 300};
const BODY_D = 'M-104 -26L-104 -186C-104 -238 -60 -262 0 -262C60 -262 104 -238 104 -186L104 -26Q104 0 78 0L-78 0Q-104 0 -104 -26Z';
/** The main zip runs along this curve (a quadratic over the dome), from x -96 to 96. */
const ZIP = {a: {x: -96, y: -196}, c: {x: 0, y: -268}, b: {x: 96, y: -196}};
const zipAt = (u: number): Pt => {
  const v = 1 - u;
  return {x: v * v * ZIP.a.x + 2 * v * u * ZIP.c.x + u * u * ZIP.b.x, y: v * v * ZIP.a.y + 2 * v * u * ZIP.c.y + u * u * ZIP.b.y};
};
/** How far the front lip drops at full opening (design units). */
const GAPE = 34;
const N = 40;

export interface BackpackProps extends PropBase {
  colours?: Partial<RoleColours>;
  /** 0 zipped, 1 open: the pull runs from the right end of the dome to the left and the mouth opens behind it. */
  zip?: number;
  /** World-space content drawn inside the bag: behind the front wall, in front of the back panel. */
  inside?: React.ReactNode;
  /** Canvas colour (default the body role). */
  tone?: string;
}
const packPlace = (p: BackpackProps) => place(p, BACKPACK_SIZE.h);
/** The front lip at zip z: for each sample along the zip, how far it has dropped. */
const lipPts = (z: number): Pt[] => {
  const pull = 1 - clamp(z); // the pull's position along the zip (1 at the right end, 0 at the left)
  return Array.from({length: N + 1}, (_, k) => {
    const u = k / N;
    const base = zipAt(u);
    const open = u >= pull && pull < 1 ? Math.sin((Math.PI * (u - pull)) / Math.max(1e-3, 1 - pull)) : 0;
    return {x: base.x, y: base.y + GAPE * open * Math.min(1, clamp(z) * 1.6)};
  });
};

export const Backpack: React.FC<BackpackProps> = (p) => {
  const q = packPlace(p);
  const sw = outlineFor(q, BACKPACK_SIZE.h, 0.02);
  const C = roleColours(p.colours);
  const tone = p.tone ?? C.body;
  const shade = mix(tone, C.ground, 0.22), deep = mix(tone, C.ground, 0.4), light = mix(tone, C.paper, 0.22);
  const teeth = mix(C.muted, C.ground, 0.2);
  const z = clamp(p.zip ?? 0);
  const id = clipKey('pack', p);
  const E = {stroke: C.edge, strokeWidth: sw, strokeLinejoin: 'round' as const};
  const zipLine = Array.from({length: N + 1}, (_, k) => zipAt(k / N));
  const lip = lipPts(z);
  const pull = zipAt(1 - z);
  // mouth: between the zip line (the back half stays up) and the dropped lip
  const mouthD = polyD([...zipLine, ...[...lip].reverse()]);
  // the front wall: the body below the lip
  const frontClip = polyD([{x: -140, y: lip[0].y}, ...lip, {x: 140, y: lip[N].y}, {x: 140, y: 20}, {x: -140, y: 20}]);
  const insideClip = `M-104 0V-196H-1000V-3000H1000V-196H104V0Z`;
  const teethDash = `${worldPx(q, 3).toFixed(2)} ${worldPx(q, 3).toFixed(2)}`;
  const handleD = 'M-28 -262C-30 -306 30 -306 28 -262';
  return (
    <g opacity={p.opacity ?? 1}>
      <g transform={propTransform(q)}>
        <defs>
          <clipPath id={`${id}-front`}><path d={frontClip} /></clipPath>
        </defs>
        {/* straps peeking out behind, the handle */}
        <path d="M-82 -236C-122 -210 -126 -120 -112 -30" fill="none" stroke={C.edge} strokeWidth={26 + 2 * sw} strokeLinecap="round" />
        <path d="M-82 -236C-122 -210 -126 -120 -112 -30" fill="none" stroke={deep} strokeWidth={26} strokeLinecap="round" />
        <path d="M82 -236C122 -210 126 -120 112 -30" fill="none" stroke={C.edge} strokeWidth={26 + 2 * sw} strokeLinecap="round" />
        <path d="M82 -236C122 -210 126 -120 112 -30" fill="none" stroke={deep} strokeWidth={26} strokeLinecap="round" />
        <path d={handleD} fill="none" stroke={C.edge} strokeWidth={12 + 2 * sw} strokeLinecap="round" />
        <path d={handleD} fill="none" stroke={deep} strokeWidth={12} strokeLinecap="round" />
        {/* the back of the bag (the whole body; the front wall is drawn again over the inside) */}
        <path d={BODY_D} fill={tone} {...E} />
        {z > 0 && <path d={mouthD} fill={C.ground} />}
        {z > 0 && <path d={lineD(zipLine)} fill="none" stroke={shade} strokeWidth={worldPx(q, 3)} />}
      </g>
      {p.inside && (
        <g>
          <clipPath id={`${id}-in`}><path d={insideClip} transform={propTransform(q)} /></clipPath>
          <g clipPath={`url(#${id}-in)`}>{p.inside}</g>
        </g>
      )}
      <g transform={propTransform(q)}>
        <g clipPath={`url(#${id}-front)`}>
          <path d={BODY_D} fill={tone} {...E} />
          <path d="M-86 -150C-92 -110 -92 -60 -84 -30" fill="none" stroke={light} strokeWidth={worldPx(q, 5)} strokeLinecap="round" />
          {/* front pocket with its zip and pull */}
          <path d={rrectPath(-78, -132, 156, 112, 26)} fill={shade} {...E} />
          <path d="M-62 -114Q0 -124 62 -114" fill="none" stroke={teeth} strokeWidth={worldPx(q, 4)} strokeDasharray={teethDash} />
          <path d={rrectPath(50, -118, 10, 26, 4)} fill={C.muted} stroke={C.edge} strokeWidth={worldPx(q, 1.5)} />
          <path d="M-60 -58H60" stroke={deep} strokeWidth={worldPx(q, 2.5)} opacity={0.6} />
        </g>
        {/* the main zip: the closed part's teeth on the dome, the open lip's edge, and the pull */}
        <path d={lineD(zipLine.slice(0, Math.round((1 - z) * N) + 1))} fill="none" stroke={teeth} strokeWidth={worldPx(q, 5)} strokeDasharray={teethDash} />
        {z > 0 && <path d={lineD(lip.slice(Math.round((1 - z) * N)))} fill="none" stroke={teeth} strokeWidth={worldPx(q, 5)} strokeDasharray={teethDash} />}
        <g transform={`translate(${pull.x.toFixed(2)} ${pull.y.toFixed(2)})`}>
          <path d={rrectPath(-6, -4, 12, 30, 4)} fill={C.muted} stroke={C.edge} strokeWidth={worldPx(q, 1.5)} />
          <path d={circlePath(0, 18, 3)} fill={C.edge} />
        </g>
      </g>
    </g>
  );
};
export const backpackQuad = (p: BackpackProps): Pt[] => propQuad(packPlace(p), {x: -126, y: -300, w: 252, h: 300});
/** World point at the centre of the open mouth (items rise out of here). */
export const backpackMouth = (p: BackpackProps): Pt => propPoint(packPlace(p), {x: 0, y: zipAt(0.5).y + GAPE / 2});
/** World width of the open mouth (an item rising out must be narrower than this). */
export const backpackMouthWidth = (p: BackpackProps): number => 150 * ((p.size ?? BACKPACK_SIZE.h) / BACKPACK_SIZE.h);
export const backpackGraphic = (o: PropGraphicOpts<BackpackProps>): DecorGraphic => propGraphic(o, Backpack, backpackQuad);
