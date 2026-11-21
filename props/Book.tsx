// Book: a closed hardback lying flat, in three-quarter view (Sweet Distillation storyboard item 53). The cover is on
// top, the spine (with two bands) on the left, and the foot of the book faces the viewer, so the page block shows as
// cream between the two boards with page lines. `open` swings the top board and half the pages over the spine until the
// book lies open on two page spreads with lines of print; `mark` stamps a copyright sign on the cover.
import React from 'react';
import {clamp, rad} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, propGraphic, propPoint, propQuad, propTransform, strokeOf} from './common';
import {type P3, type RoleColours, bboxOf, faceMatrix, hull, oblique, roleColours} from './roles';

/** Natural size: cover 150 wide (x), 200 long (receding), 30 thick. `size` is the 150 cover width. */
export const BOOK_SIZE = {w: 150, l: 200, t: 30};
/** Depth recedes up and to the left (screen px per unit of depth), so the left side (the spine) is seen. */
const RX = -0.3, RY = -0.28;
const P = oblique(RX, RY);
const facing = (n: P3) => n.x * -RX + n.h * RY + n.z < 0;

export interface BookProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** Cover colour (default the accent role). */
  cover?: string;
  /** Thickness in design units (default 30). */
  thick?: number;
  /** 0 closed, 1 lying open (the top board swings over the spine to the left). */
  open?: number;
  /** 0 to 1: a copyright sign stamped on the cover (scales up from 0.6 as it appears). */
  mark?: number;
  /** 'centre' (default): the anchor is the middle of the front bottom edge of the closed book. 'spine': the anchor is
   *  the front bottom corner at the spine, which stays put when the book opens (the gutter of an open book). */
  anchor?: 'centre' | 'spine';
  /** Outline width in world px, overriding the usual 6 (10 hero). BookPile uses it to keep each book's outline equal to a
   *  lone Book's whatever the pile's size. */
  outlinePx?: number;
}
const bookPlace = (p: BookProps) => place(p, BOOK_SIZE.w);

interface Face {m: string; w: number; h: number; kind: 'cover' | 'spine' | 'pagesTop' | 'edgeFront' | 'edgeFore' | 'inside'; pts: Pt[]}
/** The faces of the book that face the viewer, in drawing order, and the outline of each box (static half, swinging
 *  half), in design units with the anchor at 0, 0. */
const bookGeo = (p: BookProps) => {
  const W = BOOK_SIZE.w, L = BOOK_SIZE.l, T = p.thick ?? BOOK_SIZE.t, T2 = T / 2;
  const th = 180 * clamp(p.open ?? 0);
  const c = Math.cos(rad(th)), s = Math.sin(rad(th));
  const dx = (p.anchor ?? 'centre') === 'spine' ? 0 : -W / 2;
  const at = (q: P3): P3 => ({x: q.x + dx, h: q.h, z: q.z});
  const face = (O: P3, A: P3, B: P3, w: number, h: number, kind: Face['kind']): Face => {
    const o = at(O);
    const corners = [{u: 0, v: 0}, {u: w, v: 0}, {u: w, v: h}, {u: 0, v: h}].map(({u, v}) => P({x: o.x + A.x * u + B.x * v, h: o.h + A.h * u + B.h * v, z: o.z + A.z * u + B.z * v}));
    return {m: faceMatrix(P, o, A, B), w, h, kind, pts: corners};
  };
  const X: P3 = {x: 1, h: 0, z: 0}, H: P3 = {x: 0, h: 1, z: 0}, Z: P3 = {x: 0, h: 0, z: 1};
  // the static (lower) half: front edge, spine side, top (pages, seen when the book is open)
  const lower: Face[] = [
    face({x: 0, h: 0, z: 0}, X, H, W, T2, 'edgeFront'),
    face({x: 0, h: 0, z: 0}, Z, H, L, T2, 'spine'),
    face({x: 0, h: T2, z: 0}, X, Z, W, L, 'pagesTop'),
  ];
  // the swinging (upper) half turns about the hinge (x 0, h T/2): e1 along its width, e2 through its thickness
  const e1: P3 = {x: c, h: s, z: 0}, e2: P3 = {x: -s, h: c, z: 0};
  const hinge: P3 = {x: 0, h: T2, z: 0};
  const plus = (a: P3, b: P3, k: number): P3 => ({x: a.x + b.x * k, h: a.h + b.h * k, z: a.z + b.z * k});
  const neg = (a: P3): P3 => ({x: -a.x, h: -a.h, z: -a.z});
  const upper: Face[] = [face(hinge, e1, e2, W, T2, 'edgeFront')];
  if (facing(neg(e1))) upper.push(face(hinge, Z, e2, L, T2, 'spine'));
  if (facing(e1)) upper.push(face(plus(hinge, e1, W), Z, e2, L, T2, 'edgeFore'));
  if (facing(e2)) upper.push(face(plus(hinge, e2, T2), e1, Z, W, L, 'cover'));
  if (facing(neg(e2))) upper.push(face(hinge, e1, Z, W, L, 'inside'));
  const lowerPts = [0, W].flatMap((x) => [0, T2].flatMap((h) => [0, L].map((z) => P(at({x, h, z})))));
  const upperPts = [0, W].flatMap((u) => [0, T2].flatMap((k) => [0, L].map((z) => P(at(plus(plus(plus(hinge, e1, u), e2, k), Z, z))))));
  return {lower, upper, lowerHull: hull(lowerPts), upperHull: hull(upperPts), all: [...lowerPts, ...upperPts], th};
};

/** Draws one face in its own coordinates (u across, v along). */
const FaceView: React.FC<{f: Face; C: RoleColours; cover: string; sw: number; mark: number}> = ({f, C, cover, sw, mark}) => {
  const seam = sw * 0.45;
  const spineInk = mix(cover, C.ground, 0.22);
  const band = C.highlight;
  const pageLine = mix(C.paper, C.ground, 0.32);
  const print = mix(C.paper, C.ground, 0.45);
  const cb = 3.5; // board thickness
  let body: React.ReactNode = null;
  if (f.kind === 'cover') {
    const m = clamp(mark);
    const r = f.w * 0.2, cx = f.w / 2, cy = f.h / 2;
    body = (
      <>
        <rect x={0} y={0} width={f.w} height={f.h} fill={cover} />
        <rect x={f.w * 0.1} y={f.h * 0.08} width={f.w * 0.8} height={f.h * 0.84} fill="none" stroke={mix(cover, C.paper, 0.3)} strokeWidth={seam * 0.8} />
        {m > 0 && (
          <g transform={`translate(${f1(cx)} ${f1(cy)}) scale(${(0.6 + 0.4 * m).toFixed(3)})`} opacity={m}>
            <circle r={r} fill="none" stroke={C.paper} strokeWidth={r * 0.2} />
            <path d={`M${f1(r * 0.42)} ${f1(-r * 0.36)}A${f1(r * 0.52)} ${f1(r * 0.52)} 0 1 0 ${f1(r * 0.42)} ${f1(r * 0.36)}`} fill="none" stroke={C.paper} strokeWidth={r * 0.2} strokeLinecap="round" />
          </g>
        )}
      </>
    );
  } else if (f.kind === 'spine') {
    // the spine: cover cloth a little darker, two raised bands near the head and foot
    body = (
      <>
        <rect x={0} y={0} width={f.w} height={f.h} fill={spineInk} />
        {[0.1, 0.16, 0.84, 0.9].map((k) => <rect key={k} x={f.w * k - 2.5} y={0} width={5} height={f.h} fill={band} />)}
      </>
    );
  } else if (f.kind === 'edgeFront' || f.kind === 'edgeFore') {
    // boards top and bottom, the page block between them with page lines
    const n = 3;
    body = (
      <>
        <rect x={0} y={0} width={f.w} height={f.h} fill={cover} />
        <rect x={f.kind === 'edgeFront' ? 5 : 3} y={cb} width={f.w - (f.kind === 'edgeFront' ? 8 : 6)} height={f.h - cb} fill={C.paper} />
        {Array.from({length: n}, (_, k) => {
          const y = cb + ((f.h - cb) * (k + 1)) / (n + 1);
          return <path key={k} d={`M${f.kind === 'edgeFront' ? 8 : 6} ${f1(y)}H${f1(f.w - 6)}`} stroke={pageLine} strokeWidth={1.4} />;
        })}
      </>
    );
  } else {
    // a page spread surface: board margin, cream page, lines of print
    const rows = 9;
    body = (
      <>
        <rect x={0} y={0} width={f.w} height={f.h} fill={f.kind === 'inside' ? cover : C.paper} />
        <rect x={0} y={4} width={f.w - 4} height={f.h - 8} fill={C.paper} />
        {Array.from({length: rows}, (_, k) => {
          const v = f.h * 0.14 + ((f.h * 0.72) * k) / (rows - 1);
          const w = k === rows - 1 ? 0.45 : 0.72 + 0.1 * ((k * 7) % 3) / 2;
          return <rect key={k} x={f.w * 0.14} y={v - 3} width={f.w * w * 0.86} height={6} rx={3} fill={print} />;
        })}
      </>
    );
  }
  return <g transform={f.m}>{body}<rect x={0} y={0} width={f.w} height={f.h} fill="none" stroke={C.edge} strokeWidth={seam} strokeLinejoin="round" /></g>;
};

/** A hardback book lying flat in three-quarter view. Anchor: the middle of the front bottom edge (or the spine end of
 *  it with `anchor: 'spine'`). Cover in `cover` (default accent), pages in the paper role, bands in the highlight
 *  role, outlines in the edge role. */
export const Book: React.FC<BookProps> = (p) => {
  const q = bookPlace(p);
  const sw = p.outlinePx !== undefined ? p.outlinePx / (q.scale ?? 1) : strokeOf(q);
  const C = roleColours(p.colours);
  const cover = p.cover ?? C.accent;
  const g = bookGeo(p);
  const outline = (pts: Pt[]) => pts.map((v, k) => `${k ? 'L' : 'M'}${f1(v.x)} ${f1(v.y)}`).join('') + 'Z';
  const upperOrder = g.upper;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      <path d={outline(g.lowerHull)} fill={C.edge} stroke={C.edge} strokeWidth={sw * 1.4} strokeLinejoin="round" />
      {g.lower.map((f, k) => <FaceView key={`l${k}`} f={f} C={C} cover={cover} sw={sw} mark={0} />)}
      <path d={outline(g.upperHull)} fill={C.edge} stroke={C.edge} strokeWidth={sw * 1.4} strokeLinejoin="round" />
      {upperOrder.map((f, k) => <FaceView key={`u${k}`} f={f} C={C} cover={cover} sw={sw} mark={p.mark ?? 0} />)}
    </g>
  );
};
/** Design-space box of the book at its current opening (for quads). */
export const bookBox = (p: BookProps) => {
  const b = bboxOf(bookGeo(p).all);
  const pad = 3;
  return {x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad};
};
export const bookQuad = (p: BookProps): Pt[] => propQuad(bookPlace(p), bookBox(p));
/** World point at the centre of the closed cover (where a copyright mark sits, where a hand rests on the book). */
export const bookCoverCentre = (p: BookProps): Pt => {
  const W = BOOK_SIZE.w, L = BOOK_SIZE.l, T = p.thick ?? BOOK_SIZE.t;
  const dx = (p.anchor ?? 'centre') === 'spine' ? 0 : -W / 2;
  const v = P({x: W / 2 + dx, h: T, z: L / 2});
  return propPoint(bookPlace(p), v);
};
/** Design-space top of the closed book's cover outline, front edge (y of the cover's front edge) and back edge. */
export const bookTopY = (p: BookProps) => ({front: -(p.thick ?? BOOK_SIZE.t), back: -(p.thick ?? BOOK_SIZE.t) + RY * BOOK_SIZE.l});
/** The receding offset of the book's depth (screen px per design unit of depth), shared by BookPile and BookShelf. */
export const BOOK_RECEDE = {x: RX, y: RY};
export const bookGraphic = (o: PropGraphicOpts<BookProps>): DecorGraphic => propGraphic(o, Book, bookQuad);
