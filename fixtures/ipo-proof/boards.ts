// Parity fixture: the first video's Proof v3 board (IPO storyboard v3, ruling 196), copied from its repo at f07dd72
// with only the imports, the Mint Line declaration and its anchors changed. Original header:
// Proof v3 (Storyboard v3, ruling 196): verse 1, L04 to L10 (29.77 to 47.80 s), built from entries 91 to 97 on one v3
// board that starts on H1. Each line comes out of the arrangement the line before left: the page hinges open from the
// Line, the first page flips over the spine, the last page swings away to show LOST under it, the cheque unfolds from the
// month rule beside HALF YEAR, its signature rule runs on as the ticker tape, BUG lands under the tape, the rig dives onto
// the G, BUG turns into HUG, and the tape becomes the road.
// Rebuilt after Fable's review of the first render (fix list items 36 to 45) and the supervisor's stray-lines check
// (ruling 198): every graphic is in board.graphics with an end, every rule has an owner, an end or is persistent, and
// the pieces the first build skipped are built (the page odometer and the ream, the CRANE on the tape's growing end,
// the ant, the bite out of the E, the rows driving up the road). Where the storyboard's sizes or times cannot all hold
// together with the hard rules, the choice made is said in a comment here and listed in KIT.md sections 17 and 19.
// Data only, so the validator can load it:   node tools/validate-boards.mjs fixtures/ipo-proof/boards.ts
import './song';
import React from 'react';
import {
  LINES, clamp, morph, morphMarker, MORPH_MARKER_DIVE, rays, ruleAt, wordCorners,
  type Block, type Board, type BoardCtx, type BoardLayout, type BoardPanel, type DecorGraphic, type Pt, type RigKey, type RuleDef, type VerbCue, type VerbWordCtx,
} from '../../engine';
import {AntMark} from './AntMark';
import {mintPath} from './mintPath';
import {GOLD, INK, INK2, MINT, PAPER, VERMILION} from './palette';

/** Global index of word k of line `line`. */
const w = (line: number, k: number) => LINES[line].words[k];
const range = (line: number, a: number, b: number): [number, number] => [w(line, a), w(line, b)];
const all = (r: [number, number], c: string) => Object.fromEntries(Array.from({length: r[1] - r[0] + 1}, (_, k) => [r[0] + k, c]));
const words = (line: number, a: number, b: number) => Array.from({length: b - a + 1}, (_, k) => w(line, a + k));
const F = (frame: number) => frame / 30;

/** The H1 frame is 29.77 s (frame 893); the board starts on that frame and ends 10 frames after L10's last word ends
 *  (frame 1434), so that DRIVE and the L10 rows get their minimum life on screen. */
export const PROOF_START = 893 / 30;
export const PROOF_END = 1434 / 30;

const blocks: Block[] = [];
const rig: RigKey[] = [];
const rules: RuleDef[] = [];
const panels: BoardPanel[] = [];
const graphics: DecorGraphic[] = [];
const add = (b: Block) => blocks.push(b) - 1;
/** World point of screen point (sx, sy) for a camera at R = 90, zoom 1, centred on (cx, cy): a block set there at world
 *  angle -90 reads level with its top-left corner at (sx, sy). At R = 90 world +x is screen down and world -y screen right. */
const at90 = (cx: number, cy: number) => (sx: number, sy: number) => ({x: cx + (sy - 360), y: cy - (sx - 640), angle: -90});
/** A rectangle in world px as a polygon. */
const rectPoly = (x: number, y: number, rw: number, rh: number): Pt[] => [{x, y}, {x: x + rw, y}, {x: x + rw, y: y + rh}, {x, y: y + rh}];
const wordBox = (L: BoardLayout, i: number) => { const g = L.words.get(i)!; return wordCorners(L.blocks[g.block], g); };

// ------------------------------------------------------------------ world plan
// The Line (H1) stands at x 320 from y 820 up to its tip at y -100, above the frame. The pages hang on it, 900 by 1,180
// (entry 91: 620 by 800, too small for DISAPPEAR at the giant level and for the sideways legal pad of L05).
const SPINE_X = 320;
const PAGE = {x: SPINE_X, y: -120, w: 900, h: 1180};
/** The L05 pose: zoom 1, the spine about 210 px below the top of the frame (R = 78 after the roll, 90 after the tilt). */
const C5 = {x: 470, y: 400};
const S5 = at90(C5.x, C5.y);
/** Grey bars of body text on a page seen at R = 90 (world-vertical bars that read as rows on screen), at screen rows y. */
const barsAt90 = (ys: number[], x0 = 110, x1 = 1060) => ys.map((sy): [number, number, number, number] => {
  const p0 = S5(x1, sy), p1 = S5(x0, sy + 16);
  return [(p0.x - PAGE.x) / PAGE.w, (p0.y - PAGE.y) / PAGE.h, (p1.x - p0.x) / PAGE.w, (p1.y - p0.y) / PAGE.h];
});

// ------------------------------------------------------------------ L04 (HINGE: the page swings open from the Line)
// Entry 91. The page swings open to the right from the Line in 10 frames (entry: 9; ruling 192 puts swings at 10 to
// 16), PAGE ONE already printed on it. OF THE PAPERWORK and THE MIRACLE'S / NEAR are typed onto it, with five bars of
// body text under them. TILT +12 at 30.10, then a slow DIVE of 1.25 toward NEAR. Twelve Gold rays grow around THE
// MIRACLE'S NEAR from 31.30 and retract to nothing by 32.20, before the roll (Fable item 36). Sizes: PAGE ONE cap 140
// (accepted, Fable item 32); OF THE PAPERWORK cap 60 (the entry's size; 44 was under the 56 px floor); THE MIRACLE'S /
// NEAR on two rows at cap 90, 112 px on screen when NEAR is sung at the dive's 1.25 (Fable item 41).
panels.push({id: 'pageA', kind: 'page', ...PAGE, z: 4, colour: PAPER, ink: INK2, foldGap: 16,
  bars: [0.665, 0.69, 0.715, 0.74, 0.765].map((y): [number, number, number, number] => [0.058, y, y === 0.765 ? 0.45 : 0.86, 0.012]),
  // the first flip: as the roll lands (Fable item 38a), 10 frames so that the swing is exempt from the speed cap
  ops: [{t: PROOF_START, op: 'open', edge: 'left', frames: 10}, {t: F(977), op: 'fold', edge: 'left', frames: 10}]});
const bPageOne = add({words: range(4, 0, 1), attach: 'FREE', font: 'anton', cap: 140, width: 900, on: 'pageA', colour: all(range(4, 0, 1), INK),
  at: {x: 380, y: 150, angle: 0},
  emerge: {move: 'hinge', from: {path: 'mint', s: 520}, params: {panel: 'pageA'}}});
add({words: range(4, 2, 4), attach: 'FREE', font: 'barlow', cap: 60, width: 900, on: 'pageA', colour: all(range(4, 2, 4), INK),
  anchor: {to: {block: bPageOne, corner: 'bl'}, align: 'tl', offset: {x: 4, y: 16}},
  emerge: {move: 'type', from: {word: w(4, 1), letter: 'last', part: 'foot'}}});
const bMiracle = add({words: range(4, 5, 6), attach: 'FREE', font: 'serif', cap: 72, width: 830, on: 'pageA', colour: all(range(4, 5, 6), VERMILION),
  at: {x: 382, y: 400, angle: 0},
  emerge: {move: 'type', from: {word: w(4, 4), letter: 'last', part: 'foot'}}});
const NEAR = w(4, 7);
const bNear = add({words: range(4, 7, 7), attach: 'FREE', font: 'serif', cap: 92, width: 830, on: 'pageA', colour: {[NEAR]: VERMILION},
  anchor: {to: {block: bMiracle, corner: 'bl'}, align: 'tl', offset: {x: 0, y: 24}},
  emerge: {move: 'type', from: {word: w(4, 6), letter: 0, part: 'foot'}}});
rig.push({t: PROOF_START, kind: 'hold', still: true, label: 'H1 rest'});
rig.push({t: 30.10, kind: 'tilt', by: 12, frames: 9, label: 'TILT +12'});
rig.push({t: 30.45, kind: 'dive', frames: 40, to: {zoom: 1.25, frame: {point: {x: 680, y: 400}}}, ease: 'sine', label: 'slow DIVE 1.25 toward NEAR'});
graphics.push(rays({id: 'rays L04', around: words(4, 5, 7), from: 31.30, until: F(966), gap: 14, length: 44, skip: [8, 9, 10, 11]}));

// ------------------------------------------------------------------ L05 (ROLL to R = 78; SHELF on the Line; DOOR twice)
// Entry 92. The rig rolls to R = 78 (Fable item 38b): the spine is now the top edge of the pad, which hangs below it 12
// degrees askew, and a TILT to R = 90 lands on DISAPPEAR's sung frame. THEN IT'S and ON HOW WE ALL rise out of the Line
// itself, on the Ink above the spine. The L04 page flips up over the spine as the roll lands and NINETY-SOME PAGES are
// already printed on the page beneath; that page flips at 33.70 and DISAPPEAR is on the last one.
// Two flips, not three (accepted, Fable item 34). ON HOW WE ALL are not on a page (entry: Ink on Paper): a page may not
// fold until 20 frames after its last printed word is sung (Fable item 28), and PAGES (33.05), ON (33.42), HOW (33.50),
// WE (33.72) and ALL (33.88) are too close together for any of them to sit on a page that flips before DISAPPEAR
// (34.06). They rise out of the Line after THEN IT'S instead, which is where THEN IT'S came from.
// A page number in the pad's corner runs like an odometer from 2 to 97 between 32.59 and 33.40 (its digits slide), and
// a ream of page edges thickens along the spine (Fable item 38d, entry 92).
const bThen = add({words: range(5, 0, 1), attach: 'FREE', font: 'barlow', cap: 60, width: 900,
  anchor: {to: {path: 'mint', s: 220}, align: 'baselineL', angle: -90, offset: {x: 0, y: -16}},
  emerge: {move: 'shelf', from: {path: 'mint', s: 230}}});
const bOnHow = add({words: range(5, 4, 7), attach: 'FREE', font: 'barlow', cap: 60, width: 900,
  anchor: {to: {block: bThen, corner: 'br'}, align: 'bl', angle: -90, offset: {x: 44, y: 0}},
  emerge: {move: 'shelf', from: {path: 'mint', s: 330}}});
panels.push({id: 'pageB', kind: 'page', ...PAGE, z: 3, colour: PAPER, ink: INK2, from: 30.10, bars: barsAt90([590, 622]),
  ops: [{t: F(1011), op: 'fold', edge: 'left', frames: 10}]});
add({words: range(5, 2, 2), attach: 'FREE', font: 'anton', cap: 140, width: 1100, on: 'pageB', colour: {[w(5, 2)]: INK},
  at: S5(200, 250),
  emerge: {move: 'hinge', from: {path: 'mint', s: 520}, params: {panel: 'pageA'}}});
add({words: range(5, 3, 3), attach: 'FREE', font: 'anton', cap: 150, width: 1100, on: 'pageB', colour: {[w(5, 3)]: INK},
  at: S5(200, 414),
  emerge: {move: 'hinge', from: {path: 'mint', s: 520}, params: {panel: 'pageA'}}});
const DISAPPEAR = w(5, 8);
panels.push({id: 'pageC', kind: 'page', ...PAGE, z: 2, colour: PAPER, ink: INK2, from: 30.10, bars: barsAt90([560, 592, 624]), barsUntil: 34.40, foldGap: 16,
  ops: [{t: F(1038), op: 'fold', edge: 'right', frames: 12}]});
// DISAPPEAR does what it says: its letters close to nothing from both ends inward from 34.40, 2 frames apart (accepted,
// Fable item 34), and the body text bars close with it. Cap 230 so that it and its full stop sit inside the margin.
add({words: range(5, 8, 8), attach: 'FREE', font: 'anton', cap: 230, width: 1300, on: 'pageC', colour: {[DISAPPEAR]: INK},
  at: S5(78, 280),
  emerge: {move: 'hinge', from: {path: 'mint', s: 520}, params: {panel: 'pageB'}},
  verb: [{name: 'closeIn', word: DISAPPEAR, at: 34.40, params: {per: 2, frames: 6}}]});
// the roll starts on THEN's frame (967), after NEAR's sung window has ended on it, and lands at R = 78
rig.push({t: F(967), kind: 'roll', frames: 10, to: {rot: 78, zoom: 1, x: C5.x, y: C5.y}, label: 'ROLL to R = 78 (the pad hangs askew)'});
rig.push({t: F(977), kind: 'hold', still: true, label: 'rest at R = 78'});
rig.push({t: F(1014), kind: 'tilt', frames: 8, to: {rot: 90, zoom: 1, x: C5.x, y: C5.y}, label: 'TILT to R = 90, landing on DISAPPEAR'});
rig.push({t: F(1022), kind: 'hold', still: true, label: 'rest at R = 90 (no drift: DISAPPEAR fills the width)'});

/** The page odometer: two digit wheels at the pad's corner, 2 to 97 between 32.59 and 33.40 (digits slide). */
const ODO = S5(1090, 590); // top-left of the number, world (it reads level at R = 90)
const ODO_CAP = 44, ODO_W = 2 * 30;
const odoValue = (t: number) => 2 + 95 * (1 - (1 - clamp((t - 32.59) / (33.40 - 32.59))) ** 2);
graphics.push({id: 'page odometer', layer: 'over', from: 32.59, until: F(1038), owner: {panel: 'pageC'},
  box: () => [[0, 1, 2, 3].map((k) => { const q = [{x: 0, y: 0}, {x: ODO_W, y: 0}, {x: ODO_W, y: ODO_CAP * 1.3}, {x: 0, y: ODO_CAP * 1.3}][k]; return {x: ODO.x + q.y, y: ODO.y - q.x}; })],
  draw: (c) => {
    const v = odoValue(c.t);
    const tens = v / 10, units = v % 10;
    const H = ODO_CAP * 1.3;
    const wheel = (val: number, x: number, key: string) => {
      const base = Math.floor(val);
      const frac = val - base;
      return React.createElement('g', {key}, ...[0, 1].map((j) => React.createElement('text', {key: j, x, y: H * 0.85 + (j - frac) * H, fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: ODO_CAP * 1.4, fill: INK2}, String((base + j) % 10))));
    };
    const id = 'odo-clip';
    return React.createElement('g', {transform: `translate(${ODO.x} ${ODO.y}) rotate(-90)`},
      React.createElement('clipPath', {id}, React.createElement('rect', {x: -4, y: 0, width: ODO_W + 8, height: H})),
      React.createElement('g', {clipPath: `url(#${id})`}, wheel(tens, 0, 't'), wheel(units, 30, 'u')));
  }});
/** The ream: page edges along the spine, on the pad side, thickening from one to eight as the odometer runs. */
const reamCount = (t: number) => Math.round(1 + 7 * clamp((odoValue(t) - 2) / 95));
graphics.push({id: 'ream', layer: 'over', from: 32.59, until: F(1011), line: true, owner: {panel: 'pageC'},
  box: ({t}) => { const n = reamCount(t); return [rectPoly(SPINE_X + 2, PAGE.y + 40, 4 * n, PAGE.h - 80)]; },
  draw: (c) => React.createElement('g', null, ...Array.from({length: reamCount(c.t)}, (_, k) => React.createElement('line', {key: k,
    x1: SPINE_X + 4 + 4 * k, y1: PAGE.y + 40, x2: SPINE_X + 4 + 4 * k, y2: PAGE.y + PAGE.h - 40, stroke: INK2, strokeWidth: 2, opacity: 0.55}))),
});

// ------------------------------------------------------------------ L06 (DOOR, STACK; a STEP per row, TILT at HALF)
// Entry 93. The blank last page swings down off the spine about its far edge (12 frames, darkening as it turns; a fall
// out of the frame in 12 frames would move it 60 px a frame) and LOST is on the Ink ground where the page was. The rows
// land one under another on LOST's measure; the rig STEPs down per row so that each row read is whole and the row above
// is either at least half in frame or gone (Fable item 29), and TILTs -12 at HALF. A month rule beside HALF YEAR, drawn
// from 36.15 (Fable item 45), carries twelve month ticks; the first six fill Vermilion one at a time, 3 frames apart,
// from 36.63, and the ticks are gone before the cheque opens (Fable item 43).
const LOST = w(6, 0);
const LOST_O = S5(240, 236);
const bLost = add({words: range(6, 0, 3), attach: 'FREE', font: 'anton', cap: 300, stack: {measure: 800, dir: 'down'}, z: -1, showFrom: 34.0,
  colour: {[w(6, 1)]: VERMILION, [w(6, 2)]: VERMILION, [w(6, 3)]: VERMILION},
  at: LOST_O,
  emerge: {move: 'stack', from: {path: 'mint', s: 520}}});
const bInThe = add({words: range(6, 4, 6), attach: 'FREE', font: 'barlow', cap: 72, width: 900,
  anchor: {to: {block: bLost, corner: 'bl'}, align: 'tl', angle: -90, offset: {x: 0, y: 30}},
  emerge: {move: 'seam', from: {word: w(6, 3), letter: 0, part: 'foot'}, at: 35.90}});
const bHalf = add({words: range(6, 7, 8), attach: 'FREE', font: 'anton', cap: 300, stack: {measure: 480, dir: 'down'},
  anchor: {to: {block: bInThe, corner: 'bl'}, align: 'tl', angle: -90, offset: {x: 0, y: 30}},
  emerge: {move: 'stack', from: {word: w(6, 6), letter: 'last', part: 'foot'}}});
/** The month rule (and the cheque's top edge): world-horizontal at y 820, on screen beside HALF YEAR at R = 78. */
const MONTH_O = {x: 1700, y: 820};
const MONTH: RuleDef = {id: 'month', job: 'edge', from: MONTH_O, angle: 0, length: 1100, t0: 36.15, until: 37.50};
rules.push(MONTH);
/** Twelve month ticks on the month rule; the first six fill Vermilion 3 frames apart from 36.63; gone by 37.20. */
const tickX = (k: number) => MONTH_O.x + 40 + k * 52;
graphics.push({id: 'month ticks', layer: 'over', from: 36.45, until: 37.20, line: true, owner: {words: words(6, 7, 8)},
  box: () => [rectPoly(tickX(0) - 16, MONTH_O.y + 8, tickX(11) - tickX(0) + 32, 32)],
  draw: (c) => React.createElement('g', {opacity: clamp((c.t - 36.45) * 5)}, ...Array.from({length: 12}, (_, k) => React.createElement('rect', {key: k,
    x: tickX(k) - 14, y: MONTH_O.y + 10, width: 28, height: 28, fill: k < 6 && c.t >= 36.63 + (k * 3) / 30 ? VERMILION : 'none', stroke: PAPER, strokeWidth: 3})))});
// The rest poses (world centre, zoom; R = 90, then 78): LOST is set where DISAPPEAR was, so the L05 pose frames it as
// the page swings off; each later pose keeps the row being read whole inside the margin and the row above it at least
// half in frame or gone (Fable item 29), and the step from LOST to EIGHTY keeps the giant level (rule 49).
const P6 = (x: number, zoom: number, rot = 90) => ({rot, zoom, x, y: C5.y});
rig.push({t: F(1050), kind: 'step', frames: 6, to: P6(800, 1), label: 'STEP to EIGHTY'});
rig.push({t: F(1059), kind: 'step', frames: 6, to: P6(955, 0.8), label: 'STEP to BILLION (and out to 0.8)'});
rig.push({t: F(1068), kind: 'step', frames: 6, to: P6(1260, 0.8), label: 'STEP to DOLLARS'});
rig.push({t: F(1079), kind: 'step', frames: 6, to: P6(1550, 0.8), label: 'STEP to IN THE FIRST'});
rig.push({t: F(1094), kind: 'tilt', frames: 9, to: P6(1900, 0.8, 78), label: 'TILT -12 at HALF'});

// ------------------------------------------------------------------ L07 (ROLL -90 to R = -12; the cheque unfolds; TYPE)
// Entry 94. The month rule becomes the top edge of the cheque and the cheque unfolds from it (10 frames from 37.20;
// entry: 8). I GOT ANOTHER and BLANK CHECK are printed on it; "Baby, sign right here" is typed along the signature rule.
// From 38.90 the rig DIVEs 1.33 onto the signature rule (entry: 2.2 from 38.45): Baby must be 56 px on screen when it is
// sung (38.61), so it is cap 60 on the board, and CHECK must stay whole 20 frames after it is sung, so the dive waits
// for that and frames BLANK CHECK whole above the signature, with the scrawl directly after HERE (Fable item 43). The
// cheque is 1,100 by 440 (accepted, Fable item 32); I GOT ANOTHER is cap 72.
const CHQ = {x: MONTH_O.x, y: MONTH_O.y, w: 1100, h: 440};
panels.push({id: 'cheque', kind: 'cheque', ...CHQ, z: 0, colour: PAPER, ink: INK2, bars: [], from: 37.20,
  ops: [{t: 37.20, op: 'open', edge: 'top', frames: 10}]});
// The signature rule runs on as the ticker tape and then the road (entries 94, 95 and 97): persistent.
const SIG: RuleDef = {id: 'sig', job: 'shelf', from: {x: CHQ.x + 70, y: CHQ.y + 400}, angle: 0, length: 990, t0: 37.45, speed: 12, colour: INK, opacity: 0.8, persistent: true};
rules.push(SIG);
add({words: range(7, 0, 2), attach: 'FREE', font: 'barlow', cap: 72, width: 1000, on: 'cheque', colour: all(range(7, 0, 2), INK),
  at: {x: CHQ.x + 40, y: CHQ.y + 30, angle: 0},
  emerge: {move: 'hinge', from: {rule: 'month', s: 0.5}, at: 37.20, params: {panel: 'cheque'}}});
add({words: range(7, 3, 4), attach: 'FREE', font: 'anton', cap: 120, width: 1000, on: 'cheque', colour: all(range(7, 3, 4), INK),
  at: {x: CHQ.x + 40, y: CHQ.y + 140, angle: 0},
  emerge: {move: 'hinge', from: {rule: 'month', s: 0.5}, at: 37.20, params: {panel: 'cheque'}}});
const BABY = w(7, 5), HERE = w(7, 8);
const bBaby = add({words: range(7, 5, 5), attach: 'FREE', font: 'serif', cap: 60, width: 600, on: 'cheque', colour: {[BABY]: VERMILION},
  anchor: {to: {rule: 'sig', s: 0.0}, align: 'baselineL', offset: {x: 0, y: -28}},
  emerge: {move: 'type', from: {rule: 'sig', s: 0.0}}});
add({words: range(7, 6, 8), attach: 'FREE', font: 'serif', cap: 56, width: 800, on: 'cheque', colour: all(range(7, 6, 8), INK),
  anchor: {to: {block: bBaby, corner: 'br'}, align: 'bl', offset: {x: 22, y: 0}},
  emerge: {move: 'type', from: {word: BABY, letter: 'last', part: 'flankR'}}});
// the roll starts on the line boundary (entry: 37.10), so that YEAR is not sung during it and turned upside down
rig.push({t: F(1117), kind: 'roll', frames: 10, to: {rot: -12, zoom: 1, frame: {point: {x: CHQ.x + CHQ.w / 2, y: CHQ.y + CHQ.h / 2}}}, label: 'ROLL -90 to R = -12'});
rig.push({t: F(1167), kind: 'dive', frames: 10, to: {zoom: 1.33, frame: {point: {x: CHQ.x + 468, y: CHQ.y + 330}}}, label: 'DIVE 1.33 onto the signature rule'});
// a slow track along the signature rule keeps SIGN RIGHT HERE whole and brings the tape's start into frame by 40.03
rig.push({t: F(1180), kind: 'track', frames: 21, to: {rot: -12, zoom: 1.33, frame: {point: {x: CHQ.x + 940, y: CHQ.y + 330}}}, label: 'TRACK along the signature rule'});
/** The cheque's amount box, the X at the signature rule and the scrawled signature from 39.50 in 14 frames (L07). */
const SCRAWL_X = CHQ.x + 884, SCRAWL_Y = CHQ.y + 380;
const scrawl = 'M0 0 C15 -29 25 15 39 -10 S59 -25 74 0 S98 -20 113 -5 S137 5 147 -15';
graphics.push({id: 'cheque marks', layer: 'over', from: 37.55, until: 40.40, owner: {panel: 'cheque', words: words(7, 5, 8)},
  box: () => [rectPoly(CHQ.x + 800, CHQ.y + 40, 260, 100), rectPoly(CHQ.x + 30, CHQ.y + 360, 34, 40)],
  draw: (c) => {
    const op = clamp((c.t - 37.55) * 5);
    return React.createElement('g', {opacity: op},
      React.createElement('rect', {x: CHQ.x + 800, y: CHQ.y + 40, width: 260, height: 100, fill: 'none', stroke: INK2, strokeWidth: 4, opacity: 0.6}),
      React.createElement('text', {x: CHQ.x + 30, y: CHQ.y + 396, fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 48, fill: INK2}, 'X'));
  }});
graphics.push({id: 'signature scrawl', layer: 'over', from: 39.50, until: 40.60, line: true, owner: {panel: 'cheque', words: [HERE]},
  box: ({t}) => (t < 39.5 ? null : [rectPoly(SCRAWL_X - 4, SCRAWL_Y - 32, 156, 46)]),
  draw: (c) => {
    const u = clamp(((c.t - 39.50) * 30) / 14);
    return React.createElement('path', {d: scrawl, transform: `translate(${SCRAWL_X} ${SCRAWL_Y})`, fill: 'none', stroke: INK, strokeWidth: 5, pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - u});
  }});

// ------------------------------------------------------------------ L08 (CRANE on the tape's end; EXTRUDE; SWELL; STACK)
// Entry 95, rebuilt per Fable item 37. The signature rule runs on to the right, off the cheque, and doubles into a
// ticker tape (an Ink 2 band 90 px deep between two rules). The rig stays at R = -12, so the tape climbs at 12 degrees,
// and CRANEs on the tape's growing end from 40.03 to 41.47 at the dive's zoom of 1.33 (the crane keeps the zoom it
// starts with; the entry's 1.7 would carry ANT out of frame 20 frames early), so that each tape word (cap 60 on the
// board, 80 px on screen) extrudes just behind the end as the end passes. THE TICKER IS and WE BE A rise out of the tape's top
// rule; ANT (Mint) rises inside the tape (cap 60: at the entry's 110 it would cross both rules); TRILLION-DOLLAR is on
// the tape at tape size and SWELLs to twice that, bulging the rules apart, while the rig SOARs to the BUG framing (zoom
// 0.94, so that BUG spans 807 px); BUG lands under it, justified to an 859 measure (accepted, Fable item 32), 3 frames
// after a TILT to level lands, and rests at the giant level for 12 frames (rule 49: L07 has no giant word). The film's
// one ant walks along the top rule and stops above ANT at 40.75; the L09 dive carries it out of frame (entry 95 has it
// walk on, but walking on it would cross WE BE A, which is still unretired).
const TAPE_X = CHQ.x + 1060, TAPE_Y = CHQ.y + 400, TAPE_W = 90, TAPE_LEN = 2700, TAPE_SPEED = 16, TAPE_T0 = F(1183);
const tapeTip = (t: number) => TAPE_X + Math.max(0, Math.min(TAPE_LEN, (t - TAPE_T0) * 30 * TAPE_SPEED));
// The tape's rules are the tape, then the road (entries 95 and 97): persistent.
/** L10's road: the bottom rule stays, the top rule moves out to a road 500 px wide (Fable item 42a) in 16 frames from
 *  44.17 (26 px a frame, under the 32 px cap), just above the frame while L09 is read, so that it is open when the roll
 *  to R = 90 starts and I TOLD THE WORLD slides out between its rules. */
const ROAD_BOT = TAPE_Y + TAPE_W, ROAD_W = 500, ROAD_TOP = ROAD_BOT - ROAD_W;
const tapeTopMove = (t: number) => ({dy: -(ROAD_W - TAPE_W) * clamp(((t - F(1325)) * 30) / 16)});
rules.push({id: 'tapeTop', job: 'shelf', from: {x: TAPE_X, y: TAPE_Y}, angle: 0, length: TAPE_LEN, t0: TAPE_T0, speed: TAPE_SPEED, persistent: true, move: tapeTopMove});
rules.push({id: 'tapeBot', job: 'shelf', from: {x: TAPE_X, y: TAPE_Y + TAPE_W}, angle: 0, length: TAPE_LEN, t0: TAPE_T0, speed: TAPE_SPEED, persistent: true});
const WORD_LIFT = 40; // the tape words stand 40 px above the top rule, so the ant walks under them
const bTicker = add({words: range(8, 0, 2), attach: 'FREE', font: 'barlow', cap: 60, width: 900,
  anchor: {to: {rule: 'tapeTop', s: 20.4 / TAPE_LEN}, align: 'baselineL', offset: {x: 0, y: -WORD_LIFT}},
  emerge: {move: 'extrude', from: {rule: 'tapeTop', s: 20.4 / TAPE_LEN}}});
const ANT = w(8, 3);
add({words: range(8, 3, 3), attach: 'FREE', font: 'barlow', cap: 60, width: 400, colour: {[ANT]: MINT},
  anchor: {to: {rule: 'tapeBot', s: 397.8 / TAPE_LEN}, align: 'baselineL', offset: {x: 0, y: -15}},
  emerge: {move: 'extrude', from: {rule: 'tapeBot', s: 397.8 / TAPE_LEN}}});
add({words: range(8, 4, 6), attach: 'FREE', font: 'barlow', cap: 60, width: 900,
  anchor: {to: {rule: 'tapeTop', s: 544 / TAPE_LEN}, align: 'baselineL', offset: {x: 0, y: -WORD_LIFT}},
  emerge: {move: 'extrude', from: {rule: 'tapeTop', s: 544 / TAPE_LEN}}});
const TRILLION = w(8, 7), BUG = w(8, 8);
const bTrillion = add({words: range(8, 7, 7), attach: 'FREE', font: 'anton', cap: 60, width: 900,
  anchor: {to: {rule: 'tapeBot', s: 714 / TAPE_LEN}, align: 'baselineL', offset: {x: 0, y: -15}},
  emerge: {move: 'extrude', from: {rule: 'tapeBot', s: 714 / TAPE_LEN}},
  // the swell shoves only L08 and L09 words: by default it would also shove L10's rows, which are laid out on the road
  // in its reach (rows that will be there 4 seconds later)
  verb: [{name: 'swell', word: TRILLION, at: F(1247), params: {scale: 2, neighbours: [...words(8, 0, 6), ...words(8, 8, 8), ...words(9, 0, 11)]}}]});
const bBug = add({words: range(8, 8, 8), attach: 'FREE', font: 'anton', cap: 400, stack: {measure: 859, dir: 'down'},
  anchor: {to: {block: bTrillion, corner: 'bl'}, align: 'tl', offset: {x: -215, y: 78}},
  emerge: {move: 'stack', from: {block: bTrillion, corner: 'bl'}}});
rig.push({t: F(1201), kind: 'crane', frames: 43, to: {rot: -12, zoom: 1.33}, follow: (t) => ({board: {x: tapeTip(t), y: TAPE_Y}, screen: {x: 900 + 60 * clamp((t - F(1201)) / (43 / 30)), y: 400 - 60 * clamp((t - F(1201)) / (43 / 30))}}), label: 'CRANE on the tape\'s growing end'});
/** The BUG framing: zoom 0.94 so that BUG (859 measure) spans 807 px, with THE TICKER IS whole at the top of the frame. */
const BUG_FRAME = {rot: 0, zoom: 0.94, frame: {point: {x: 3688, y: 1492}}};
rig.push({t: F(1244), kind: 'soar', frames: 10, to: {...BUG_FRAME, rot: -12}, label: 'SOAR to the BUG framing during the swell'});
rig.push({t: F(1254), kind: 'tilt', frames: 8, to: BUG_FRAME, label: 'TILT to level, landing before BUG lands (BUG rests giant 12 frames)'});
/** The ticker tape's band between its two rules, growing with them (L08 on; the road in L10). */
const bandPoly = (t: number): Pt[] | null => {
  const top = ruleAt(BOARD, 'tapeTop', t), bot = ruleAt(BOARD, 'tapeBot', t);
  if (!top || !bot) return null;
  return [top.a, top.b, bot.b, bot.a];
};
graphics.push({id: 'tape band', layer: 'under', from: TAPE_T0, until: PROOF_END + 1, ground: true,
  box: ({t}) => { const p = bandPoly(t); return p ? [p] : null; },
  draw: (c) => { const p = bandPoly(c.t); return p ? React.createElement('path', {d: `M${p.map((q) => `${q.x} ${q.y}`).join('L')}Z`, fill: INK2}) : null; }});
/** The ant: from the cheque's edge along the top rule to above ANT (40.75), and there it stays; the L09 dive carries it
 *  out of frame (walking on, it would cross WE BE A, which is still unretired). */
const ANT_SIZE = 46;
const antAt = (L: BoardLayout, t: number): Pt | null => {
  const top = ruleAt(BOARD, 'tapeTop', t);
  if (!top) return null;
  const q = wordBox(L, ANT);
  const stop = (Math.min(...q.map((p) => p.x)) + Math.max(...q.map((p) => p.x))) / 2;
  const x0 = CHQ.x + CHQ.w - 40;
  const f = t * 30;
  const x = f < 1222 ? x0 + (stop - x0) * (1 - (1 - clamp((f - 1188) / (1222 - 1188))) ** 2) : stop;
  const y = x < TAPE_X ? TAPE_Y : top.a.y + (top.b.y - top.a.y) * clamp((x - top.a.x) / Math.max(1, top.b.x - top.a.x));
  return {x, y};
};
graphics.push({id: 'ant', layer: 'over', from: F(1188), until: 42.90, owner: {words: [ANT]},
  box: ({t, layout}) => { const p = antAt(layout, t); return p ? [rectPoly(p.x - ANT_SIZE * 0.55, p.y - ANT_SIZE * 0.62, ANT_SIZE * 1.15, ANT_SIZE * 0.62)] : null; },
  draw: (c) => { const p = antAt(c.layout, c.t); return p ? React.createElement(AntMark, {x: p.x, y: p.y, size: ANT_SIZE, colour: VERMILION, t: c.t, walk: c.frame < 1222}) : null; }});

// ------------------------------------------------------------------ L09 (DIVE 2.2 onto the G; TYPE; SOAR; SEAM; MORPH)
// Entry 96, per Fable item 40. The rig DIVEs 2.2 times onto the right flank of the G of BUG, with at least 250 px of the
// G in frame; DO WE / BITE? are typed out from the end of its bar, "Well, we might." typed beneath them, all cap 62 on
// the board (136 px on screen in the dive, 58 after the SOAR, which starts on WELL so that the rows below it are read
// at the SOAR's framing). WELL WE / MIGHT. is two rows and COME ON / GIVE / US A three, so that BUG, the lane and the
// rows fit the frame at 0.932, where BUG is 800 px wide (the giant level) until the morph marker. A bite of three scallops comes out of the top
// right of the E of BITE at 42.95. After the SOAR back, COME ON, GIVE US A slides out of a seam at the flank of the G
// below the typed rows, cap 70, and HUG is the rhyme morph of BUG: the B closes and an H opens while UG stays, marked
// by a DIVE of 1.25 that SOARs straight back (Fable item 40e: held, it would push GIVE US A and HUG out of the margin). From 44.55 two Paper round brackets slide in from above and below either side of
// HUG and squeeze it by 8 percent; the right one comes down a clear lane between HUG and the rows (Fable item 40d).
const G_FLANK = {word: BUG, letter: 'last' as const, part: 'flankR' as const};
const ROW_CAP = 62, LANE = 90;
const bDoWe = add({words: range(9, 0, 1), attach: 'FREE', font: 'barlow', cap: ROW_CAP, width: 900,
  anchor: {to: {block: bBug, corner: 'tr'}, align: 'tl', offset: {x: LANE, y: 60}},
  emerge: {move: 'type', from: G_FLANK}});
const BITE = w(9, 2);
/** The bite: three scallops out of the top right of the E of BITE (no more than a fifth of the letter), from 42.95. */
const bite: VerbCue = {name: 'custom', word: BITE, at: 42.95, allowEarly: true, params: {fn: (c: VerbWordCtx) => {
  if (c.df < 0) return null;
  const g = c.geom;
  let x = g.x;
  for (let k = 0; k < 3; k++) x += g.adv[k];
  const ex = x + g.adv[3], ey = g.y;
  const r = 0.16 * g.adv[3];
  const B = 1e5;
  const circ = (cx: number, cy: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  const u = clamp(c.df / 2);
  return {clip: `M${-B} ${-B}L${B} ${-B}L${B} ${B}L${-B} ${B}Z` + [[ex - 0.15 * g.adv[3], ey + 0.06 * g.h], [ex - 0.03 * g.adv[3], ey + 0.2 * g.h], [ex - 0.32 * g.adv[3], ey - 0.02 * g.h]].map(([cx, cy]) => circ(cx, cy - (1 - u) * 3 * r)).join('')};
}}};
const bBite = add({words: range(9, 2, 2), attach: 'FREE', font: 'anton', cap: ROW_CAP, width: 900, colour: {[BITE]: VERMILION},
  anchor: {to: {block: bDoWe, corner: 'bl'}, align: 'tl', offset: {x: 0, y: 14}},
  emerge: {move: 'type', from: {word: w(9, 1), letter: 'last', part: 'foot'}, params: {gap: 1}},
  verb: [bite]});
const bWell = add({words: range(9, 3, 5), attach: 'FREE', font: 'serif', cap: ROW_CAP, width: 900, rows: [2, 1], colour: all(range(9, 3, 5), GOLD),
  anchor: {to: {block: bBite, corner: 'bl'}, align: 'tl', offset: {x: 0, y: 14}},
  emerge: {move: 'type', from: {word: BITE, letter: 0, part: 'foot'}}});
const bCome = add({words: range(9, 6, 10), attach: 'FREE', font: 'barlow', cap: 70, width: 900, rows: [2, 1, 2],
  anchor: {to: {block: bWell, corner: 'bl'}, align: 'tl', offset: {x: 0, y: 30}},
  emerge: {move: 'seam', from: G_FLANK}});
const HUG = w(9, 11);
/** HUG is squeezed 8 percent by the brackets from 44.55 (8 frames). */
const squeeze: VerbCue = {name: 'custom', word: HUG, at: 44.55, allowEarly: true, params: {fn: (c: VerbWordCtx) => {
  if (c.df < 0) return null;
  return {sx: 1 - 0.08 * clamp(c.df / 8)};
}}};
add({words: range(9, 11, 11), attach: 'FREE', font: 'anton', cap: 400, stack: {measure: 859, dir: 'down'},
  anchor: {to: {block: bBug, corner: 'tl'}, align: 'tl'},
  emerge: morph({from: BUG, keep: 'UG'}),
  verb: [squeeze]});
rig.push({t: F(1274), kind: 'dive', frames: 9, about: G_FLANK, to: {zoom: 2.2, frame: {anchor: G_FLANK}, screen: {x: -60, y: 410}}, label: 'DIVE 2.2 onto the flank of the G'});
// zoom 0.932: BUG spans 800 px, the giant level, for the 20 frames before the morph marker (rule 49)
rig.push({t: F(1292), kind: 'soar', frames: 12, to: {zoom: 0.932, frame: {point: {x: 3889, y: 1707}}}, label: 'SOAR back'});
// The morph marker is a punch-in: DIVE 1.25 and SOAR straight back (8 frames each). Held at 1.25 it would push
// GIVE US A and HUG out of the margin while they are read: at the SOAR's framing the rows already fill the frame's height.
rig.push(morphMarker({t: F(1324), frames: 8}));
rig.push({t: F(1332), kind: 'soar', by: MORPH_MARKER_DIVE, frames: 8, label: 'SOAR back from the morph marker'});
/** Two tall Paper round brackets either side of HUG, sliding in along its height from 44.55 (8 frames): the hug. */
const bracketGeom = (L: BoardLayout, t: number) => {
  const u = clamp(((t - 44.55) * 30) / 8);
  const g = wordBox(L, HUG);
  const x0 = Math.min(...g.map((p) => p.x)), x1 = Math.max(...g.map((p) => p.x)), y0 = Math.min(...g.map((p) => p.y)), y1 = Math.max(...g.map((p) => p.y));
  // HUG's squeeze (8 percent about its centre) pulls each side in by 4 percent; the brackets follow it in, 24 px clear
  const inset = 0.04 * (x1 - x0) * clamp(((t - 44.55) * 30) / 8);
  const slide = (1 - u) * 160;
  return [-1, 1].map((d) => {
    const x = d < 0 ? x0 + inset - 24 : x1 - inset + 24;
    const dy = d < 0 ? slide : -slide; // the left one rises from below, the right one comes down from above
    return {x, a: y0 - 20 + dy, b: y1 + 20 + dy, bow: d * 46, op: u};
  });
};
graphics.push({id: 'hug brackets', layer: 'over', from: 44.55, until: F(1349), line: true, owner: {words: [HUG]},
  box: ({t, layout}) => (t < 44.55 ? null : bracketGeom(layout, t).map((b) => rectPoly(Math.min(b.x, b.x + b.bow) - 8, b.a, Math.abs(b.bow) + 16, b.b - b.a))),
  draw: (c) => React.createElement('g', null, ...bracketGeom(c.layout, c.t).map((b, k) => React.createElement('path', {key: k,
    d: `M${b.x} ${b.a} Q${b.x + b.bow * 2} ${(b.a + b.b) / 2} ${b.x} ${b.b}`, fill: 'none', stroke: PAPER, strokeWidth: 14, strokeLinecap: 'round'})))});

// ------------------------------------------------------------------ L10 (ROLL to R = 90; the tape is a road; SEAM, STACK)
// Entry 97, per Fable item 42. The rig rolls to R = 90: the tape's rules run up the frame, a road seen from above, with
// HUG's foot and the L09 rows sideways at the top left. The road is 500 px wide (the entry: the PUMP THE BRAKES measure
// plus 60; the measure is 335 here, so that I TOLD THE WORLD to BRAKES fits the frame's height, and I TOLD THE WORLD,
// cap 58 and 466 px long, needs the 500); its right-hand rule moves out over 16 frames from 44.17, just above the frame
// while L09 is read, so it is open as the roll starts. All of L10 lies past the grown TRILLION-DOLLAR, which sits on
// the tape. I TOLD THE WORLD slides out of a seam at HUG's G.
// PUMP / THE / BRAKES drive up the road from below the frame, each at most 32 px a frame over more than 300 px, and
// brake into their rows (a squash of 8 percent). The skid marks are dropped: drawn as the storyboard has them (two
// Paper rules trailing a word along its baseline) they read as hash marks on the road's lines, which is what Jefferson
// saw, and a skid trailing a row that drives up the road would lie across the row below it. 'CAUSE SHE AIN'T SAFE TO
// slides out of a seam one word at a time, and DRIVE (Vermilion) sways 3 degrees either way once a second.
const C10 = {x: 4420, y: (ROAD_TOP + ROAD_BOT) / 2};
const S10 = at90(C10.x, C10.y);
const bTold = add({words: range(10, 0, 3), attach: 'FREE', font: 'barlow', cap: 58, width: 900,
  at: S10(640 - (ROAD_BOT - 17 - C10.y), 80), // 17 px inside the road's bottom rule, 80 px from the frame's top (HUG's foot above it)
  // the seam opens at HUG's G as the roll starts (the tape's edge is off screen until the roll lands)
  emerge: {move: 'seam', from: {word: HUG, letter: 'last', part: 'flankR'}, params: {side: 'R'}}});
const brake = (word: number, at: number): VerbCue => ({name: 'brake', word, at, allowEarly: true, params: {squash: 0.08, skid: 0}});
const PUMP = w(10, 4), THE = w(10, 5), BRAKES = w(10, 6);
const sf = (i: number) => Math.round(LINES[10].start_s * 30) / 30 + 0 * i;
void sf;
const bPump = add({words: range(10, 4, 6), attach: 'FREE', font: 'anton', cap: 200, stack: {measure: 335, dir: 'down', leading: 0.14},
  anchor: {to: {block: bTold, corner: 'bl'}, align: 'tl', angle: -90, offset: {x: 65, y: 40}},
  emerge: {move: 'stack', from: {block: bTold, corner: 'bl'}, params: {run: 310}},
  verb: [brake(PUMP, F(1367)), brake(THE, F(1374)), brake(BRAKES, F(1376))]});
const bCause = add({words: range(10, 7, 11), attach: 'FREE', font: 'barlow', cap: 64, width: 466, rows: [3, 2],
  anchor: {to: {block: bPump, corner: 'bl'}, align: 'tl', angle: -90, offset: {x: -65, y: 30}},
  emerge: {move: 'seam', from: {word: BRAKES, letter: 0, part: 'foot'}}});
const DRIVE = w(10, 12);
const sway: VerbCue = {name: 'custom', word: DRIVE, at: 47.11, allowEarly: true, params: {fn: (c: VerbWordCtx) => {
  const u = c.t - c.at;
  return u < 0 ? null : {rot: 3 * Math.sin(2 * Math.PI * u)};
}}};
add({words: range(10, 12, 12), attach: 'FREE', font: 'anton', cap: 160, width: 466, colour: {[DRIVE]: VERMILION},
  anchor: {to: {block: bCause, corner: 'bl'}, align: 'tl', angle: -90, offset: {x: 0, y: 24}},
  // Keep DRIVE's entrance from the right clear of the preceding tilted row.
  emerge: {move: 'stack', from: {word: w(10, 11), letter: 0, part: 'foot'}, params: {dir: 'left'}},
  verb: [sway]});
// the roll starts on L10's first sung frame (accepted, Fable item 34) and takes 11 frames, landing as HUG retires
rig.push({t: F(1343), kind: 'roll', frames: 11, to: {rot: 90, zoom: 1, x: C10.x, y: C10.y}, label: 'ROLL to R = 90 (the tape is a road)'});
// the STEPs keep PUMP at least half in frame (its line is still sung) while THE, BRAKES and the CAUSE rows are read
rig.push({t: F(1381), kind: 'step', frames: 7, to: {rot: 90, zoom: 1, frame: {word: THE}, screen: {x: 640, y: 222}}, label: 'STEP to CAUSE SHE AIN\'T SAFE TO'});
rig.push({t: F(1406), kind: 'step', frames: 6, to: {rot: 90, zoom: 1, frame: {block: bCause}, screen: {x: 640, y: 230}}, label: 'STEP to DRIVE (THE wholly out above, BRAKES whole)'});

export const BOARD: Board = {
  id: 'proof v3', start: PROOF_START, end: PROOF_END, bg: INK, colour: PAPER, exit: 'none', font: 'barlow',
  handoff: {start: 'H1', end: 'open'}, rigStart: {x: 640, y: 360, zoom: 1, rot: 0}, rig, rules, blocks, panels, graphics,
  paths: [mintPath({t0: PROOF_START, start: {x: SPINE_X, y: -100}, heading: -90, speed: 0, prefix: [{x: SPINE_X, y: 820}, {x: SPINE_X, y: -100}]})],
};
export const BOARDS: Board[] = [BOARD];
void bMiracle; void bNear; void bLost; void bHalf; void bOnHow; void bCome; void bTicker; void PUMP; void THE; void BRAKES; void INK; void GOLD; void INK2;
void (null as unknown as BoardCtx);
