// BookPile and BookShelf (Sweet Distillation storyboard item 53). The Pile is closed Books lying flat, stacked with a
// slight offset, turn and change of size per book, covers in several palette roles; `bookPileTop` gives its summit.
// The Shelf is books standing upright on a wooden shelf, spines out, each with its head and foot bands.
import React from 'react';
import {clamp, easeInQuad} from '../engine';
import type {DecorGraphic, Pt} from '../engine';
import {type PropBase, type PropGraphicOpts, f1, mix, place, polyD, propGraphic, propPoint, propQuad, propTransform, rrectPath, strokeOf} from './common';
import {BOOK_RECEDE, BOOK_SIZE, Book, bookBox, bookCoverCentre} from './Book';
import {type RoleColours, roleColours, seeded} from './roles';

// ------------------------------------------------------------------ the pile

/** Natural size: books with 150 wide covers (each 0.86 to 1.06 of that), 22 to 32 thick. `size` is the 150 width. */
export const BOOK_PILE_SIZE = {w: 150};
export interface BookPileProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** Books in the pile (default 6). */
  count?: number;
  /** Seed of the per-book offsets, turns, sizes and colours (default 1). */
  seed?: number;
  /** 0 to 1: the top book drops in from 160 design units above (at 0 it is not drawn; 1 landed). Default 1. */
  drop?: number;
  /** Cover colours to cycle through (default: accent, accent2, body, ground, detail roles). */
  covers?: string[];
  /** World px outline of every book, constant whatever the pile's `size`, `count` or `hero` (default 6, a lone Book's). */
  outlinePx?: number;
}
const pilePlace = (p: BookPileProps) => place(p, BOOK_PILE_SIZE.w);
interface PileBook {x: number; y: number; size: number; angle: number; thick: number; cover: number}
/** Each book's placement in design units (anchor = pile bottom centre), bottom first. Pure. */
export const bookPileBooks = (p: BookPileProps): PileBook[] => {
  const n = Math.max(0, Math.round(p.count ?? 6));
  const seed = p.seed ?? 1;
  const out: PileBook[] = [];
  let y = 0;
  for (let k = 0; k < n; k++) {
    const r = (j: number) => seeded(seed, k * 7 + j);
    const size = BOOK_PILE_SIZE.w * (0.86 + 0.2 * r(1));
    const thick = 22 + 10 * r(2);
    const x = (r(3) - 0.5) * 22 + (k % 2 ? 4 : -4);
    const angle = (r(4) - 0.5) * 5;
    const cover = Math.floor(r(5) * 5 + k) % 5;
    // a book's thickness in world px is thick x (size / 150)
    out.push({x, y, size, angle, thick, cover});
    y -= thick * (size / BOOK_SIZE.w);
  }
  return out;
};
/** A pile of closed books lying flat. Anchor: bottom centre of the pile's front edge. */
export const BookPile: React.FC<BookPileProps> = (p) => {
  const q = pilePlace(p);
  const C = roleColours(p.colours);
  const covers = p.covers ?? [C.accent, C.accent2, C.body, C.ground === C.edge ? mix(C.ground, C.muted, 0.35) : C.ground, C.muted];
  const books = bookPileBooks(p);
  const drop = clamp(p.drop ?? 1);
  // books are drawn in design units of the pile; each book's outline is outlinePx world px (default 6, a lone Book's)
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {books.map((b, k) => {
        const top = k === books.length - 1;
        if (top && drop <= 0) return null;
        const fall = top ? -160 * (1 - easeInQuad(drop)) : 0;
        return (
          <Book key={k} x={b.x} y={b.y + fall} size={b.size} angle={b.angle} thick={b.thick} cover={covers[b.cover % covers.length]}
            hero={p.hero} outlinePx={(p.outlinePx ?? 6) / q.scale!} colours={p.colours} opacity={top ? clamp(drop * 4) : 1}
          />
        );
      })}
    </g>
  );
};
/** World point of the pile's summit: the centre of the top book's cover. */
export const bookPileTop = (p: BookPileProps): Pt => {
  const books = bookPileBooks(p);
  const q = pilePlace(p);
  if (!books.length) return propPoint(q, {x: 0, y: 0});
  const b = books[books.length - 1];
  return propPoint(q, bookCoverCentre({x: b.x, y: b.y, size: b.size, angle: b.angle, thick: b.thick}));
};
/** Design-space box of the pile. */
const pileBox = (p: BookPileProps) => {
  const books = bookPileBooks(p);
  if (!books.length) return {x: -75, y: -10, w: 150, h: 10};
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of books) {
    const bb = bookBox({x: 0, y: 0, thick: b.thick});
    const s = b.size / BOOK_SIZE.w;
    x0 = Math.min(x0, b.x + bb.x * s - 4); x1 = Math.max(x1, b.x + (bb.x + bb.w) * s + 4);
    y0 = Math.min(y0, b.y + bb.y * s - 6); y1 = Math.max(y1, b.y + (bb.y + bb.h) * s);
  }
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
};
export const bookPileQuad = (p: BookPileProps): Pt[] => propQuad(pilePlace(p), pileBox(p));
export const bookPileGraphic = (o: PropGraphicOpts<BookPileProps>): DecorGraphic => propGraphic(o, BookPile, bookPileQuad);

// ------------------------------------------------------------------ the shelf

/** Natural size: books 120 to 160 tall, 22 to 40 thick, on a shelf 18 thick. `size` is the 160 tallest-book height. */
export const BOOK_SHELF_SIZE = {h: 160};
const SHELF_T = 18, SHELF_DEPTH = 110;
export interface BookShelfProps extends PropBase {
  /** Colour overrides: the roles of roles.ts (propColours' roles plus `edge` and `syrup`). */
  colours?: Partial<RoleColours>;
  /** Books on the shelf (default 12). */
  count?: number;
  seed?: number;
  /** Cover colours to cycle through (default: accent, accent2, body, ground, detail roles). */
  covers?: string[];
}
const shelfPlace = (p: BookShelfProps) => place(p, BOOK_SHELF_SIZE.h);
interface ShelfBook {x: number; w: number; h: number; cover: number; label: boolean}
const shelfBooks = (p: BookShelfProps): {books: ShelfBook[]; length: number} => {
  const n = Math.max(0, Math.round(p.count ?? 12));
  const seed = p.seed ?? 3;
  const books: ShelfBook[] = [];
  let x = 14;
  for (let k = 0; k < n; k++) {
    const r = (j: number) => seeded(seed, k * 5 + j);
    const w = 22 + 18 * r(1), h = 120 + 40 * r(2);
    books.push({x, w, h, cover: (k + Math.floor(r(3) * 3)) % 5, label: r(4) > 0.5});
    x += w + 1;
  }
  return {books, length: x + 13};
};
/** Length of the shelf in world px (anchor at its left end). */
export const bookShelfLength = (p: BookShelfProps) => shelfBooks(p).length * shelfPlace(p).scale!;
/** Books standing on a shelf, spines out, tops of the page blocks seen from slightly above. Anchor: the bottom left
 *  corner of the shelf's front edge (the shelf runs right from it, `bookShelfLength` long). */
export const BookShelf: React.FC<BookShelfProps> = (p) => {
  const q = shelfPlace(p);
  const sw = strokeOf(q);
  const C = roleColours(p.colours);
  const covers = p.covers ?? [C.accent, C.accent2, C.body, mix(C.ground, C.muted, 0.35), C.muted];
  const {books, length} = shelfBooks(p);
  const dx = BOOK_RECEDE.x * 70, dy = BOOK_RECEDE.y * 70; // book depth seen on the top faces
  const sdx = BOOK_RECEDE.x * SHELF_DEPTH, sdy = BOOK_RECEDE.y * SHELF_DEPTH;
  const wood = mix(C.body, C.ground, 0.15), woodTop = mix(C.body, C.paper, 0.18);
  const top = -SHELF_T;
  return (
    <g transform={propTransform(q)} opacity={p.opacity ?? 1}>
      {/* shelf top surface (receding) */}
      <path d={polyD([{x: 0, y: top}, {x: length, y: top}, {x: length + sdx, y: top + sdy}, {x: sdx, y: top + sdy}])} fill={woodTop} stroke={C.edge} strokeWidth={sw * 0.7} strokeLinejoin="round" />
      {books.map((b, k) => {
        const cov = covers[b.cover % covers.length];
        const y0 = top - b.h;
        const spine = mix(cov, C.ground, 0.12);
        return (
          <g key={k}>
            {/* top of the book: boards either side of the cream page block, receding */}
            <path d={polyD([{x: b.x, y: y0}, {x: b.x + b.w, y: y0}, {x: b.x + b.w + dx, y: y0 + dy}, {x: b.x + dx, y: y0 + dy}])} fill={cov} stroke={C.edge} strokeWidth={sw * 0.5} strokeLinejoin="round" />
            <path d={polyD([{x: b.x + 3.5, y: y0 - 0.5}, {x: b.x + b.w - 3.5, y: y0 - 0.5}, {x: b.x + b.w - 3.5 + dx * 0.92, y: y0 + dy * 0.92}, {x: b.x + 3.5 + dx * 0.92, y: y0 + dy * 0.92}])} fill={C.paper} />
            {/* spine with head and foot bands and, on some, a title label (no lettering) */}
            <path d={rrectPath(b.x, y0, b.w, b.h, 3)} fill={spine} stroke={C.edge} strokeWidth={sw * 0.6} />
            {[0.07, 0.12, 0.88, 0.93].map((u) => <rect key={u} x={b.x + 2} y={y0 + b.h * u - 2} width={b.w - 4} height={4} fill={C.highlight} />)}
            {b.label && <path d={rrectPath(b.x + b.w * 0.2, y0 + b.h * 0.3, b.w * 0.6, b.h * 0.3, 2)} fill={mix(C.paper, cov, 0.15)} />}
          </g>
        );
      })}
      {/* shelf front edge */}
      <path d={rrectPath(0, top, length, SHELF_T, 2)} fill={wood} stroke={C.edge} strokeWidth={sw} strokeLinejoin="round" />
      <path d={`M8 ${f1(top + SHELF_T * 0.55)}H${f1(length - 8)}`} stroke={mix(wood, C.ground, 0.25)} strokeWidth={1.5} />
    </g>
  );
};
export const bookShelfQuad = (p: BookShelfProps): Pt[] => {
  const {length} = shelfBooks(p);
  return propQuad(shelfPlace(p), {x: BOOK_RECEDE.x * SHELF_DEPTH - 4, y: -SHELF_T - BOOK_SHELF_SIZE.h + BOOK_RECEDE.y * 70 - 4, w: length - BOOK_RECEDE.x * SHELF_DEPTH + 8, h: SHELF_T + BOOK_SHELF_SIZE.h - BOOK_RECEDE.y * 70 + 8});
};
export const bookShelfGraphic = (o: PropGraphicOpts<BookShelfProps>): DecorGraphic => propGraphic(o, BookShelf, bookShelfQuad);
