// The example scene: about 15 seconds of a made-up lyric on one board, using the engine's main moves. Read it beside
// KIT.md. Data only, so the validator can load it:   node tools/validate-boards.mjs example/boards.ts
//   L0  LIGHTS COME ON          SHELF out of the floor rule (R 0)
//   L1  THE WHOLE STREET TURNS  ROLL -90 (LIGHTS COME ON stays in frame, sideways); a SEAM out of the kerb rule; TURNS
//                               sprouts at the giant size
//   L2  STACK EVERY CRATE       TILT to R = -78; STACK (one word per row, every row justified to one measure); rays() with an end
//   L3  SIGN THE PAGE           TILT back to R = -90; a panel (a page) opens on the edge rule, its words printed on it; PAGE giant
//   L4  SET THE STAGE           TILT to R = -78; a SEAM above the page; STAGE is the MORPH of PAGE (AGE stays)
// From L1 on the rig rests at R = -90 or -78, and blocks are set at world angle 90, so they read level or tilted 12
// degrees; S(C, R) maps a screen point to the world point under it for a rest framed at C.
import './song';
import {createElement} from 'react';
import {LINES, behind, cameraFollow, drawer, rise, slideFrom, station, fanTurn, quarter, runTrack, morph, rays, type Carry, type Block, type Board, type BoardPanel, type DecorGraphic, type Pt, type RigKey, type RuleDef} from '../engine';
import {CREAM, DURATION_S, NIGHT, RED, SLATE, YELLOW} from './song';

/** Global index of word k of line `line`. */
const w = (line: number, k: number) => LINES[line].words[k];
const range = (line: number, a: number, b: number): [number, number] => [w(line, a), w(line, b)];
const all = (r: [number, number], c: string) => Object.fromEntries(Array.from({length: r[1] - r[0] + 1}, (_, k) => [r[0] + k, c]));
/** Song seconds of the frame a line starts on, less `frames` frames (a transit that brings in a line starts there). */
const lineStart = (line: number, frames = 0) => (Math.round(LINES[line].start_s * 30) - frames) / 30;
/** World point under screen point (sx, sy) when the rig rests at R (default -90), zoom 1, framed at C. */
const S = (C: Pt, R = -90) => (sx: number, sy: number): Pt => {
  const a = (-R * Math.PI) / 180, dx = sx - 640, dy = sy - 360;
  return {x: C.x + dx * Math.cos(a) - dy * Math.sin(a), y: C.y + dx * Math.sin(a) + dy * Math.cos(a)};
};

export const START = 0;
export const END = 14;

const blocks: Block[] = [];
const rig: RigKey[] = [];
const rules: RuleDef[] = [];
const panels: BoardPanel[] = [];
const graphics: DecorGraphic[] = [];
const add = (b: Block) => blocks.push(b) - 1;

// ------------------------------------------------------------------ L0: SHELF (R 0, framed at 640, 360)
rules.push({id: 'floor', job: 'shelf', from: {x: 150, y: 420}, angle: 0, length: 720, t0: 0.2, persistent: true});
add({words: range(0, 0, 2), attach: 'FREE', font: 'anton', cap: 90, width: 1000,
  anchor: {to: {rule: 'floor', s: 0}, align: 'baselineL', offset: {x: 10, y: -10}},
  emerge: {move: 'shelf', from: {rule: 'floor', s: 0.1}}});
rig.push({t: START, kind: 'hold', still: true, label: 'rest'});

// ------------------------------------------------------------------ L1: ROLL -90, SEAM, SPROUT
const C1 = {x: 470, y: 860};
const S1 = S(C1);
rules.push({id: 'kerb', job: 'seam', from: S1(300, 190), angle: 90, length: 880, t0: lineStart(1, 10), persistent: true});
add({words: range(1, 0, 2), attach: 'FREE', font: 'anton', cap: 60, width: 1200,
  anchor: {to: {rule: 'kerb', s: 0}, align: 'bl', angle: 90, offset: {x: 40, y: -12}},
  emerge: {move: 'seam', from: {rule: 'kerb', s: 0}, params: {side: 'R'}}});
add({words: range(1, 3, 3), attach: 'FREE', font: 'anton', cap: 300, width: 1200,
  at: {...S1(340, 230), angle: 90},
  emerge: {move: 'sprout', from: {word: w(1, 2), letter: 'last', part: 'foot'}}});
rig.push({t: lineStart(1, 12), kind: 'roll', by: -90, frames: 12, to: {frame: {point: C1}}, label: 'ROLL -90 (LIGHTS COME ON stays, sideways)'});

// ------------------------------------------------------------------ L2: STEP, STACK, rays with an end
const C2 = {x: C1.x, y: C1.y + 700};
const S2 = S(C2, -78);
add({words: range(2, 0, 2), attach: 'FREE', font: 'anton', cap: 60, stack: {measure: 420, dir: 'down'},
  at: {...S2(560, 72), angle: 90},
  emerge: {move: 'stack', from: {rule: 'kerb', s: 1}}});
graphics.push(rays({id: 'rays round the stack', around: [w(2, 0), w(2, 1), w(2, 2)], from: 6.3, until: lineStart(3, 4), gap: 24, length: 40, colour: YELLOW}));
rig.push({t: lineStart(2, 8), kind: 'tilt', frames: 8, to: {rot: -78, zoom: 1, frame: {point: C2}}, label: 'TILT +12 to the stack'});

// ------------------------------------------------------------------ L3: STEP; a page opens on the edge rule
const C3 = {x: C1.x, y: C1.y + 1500};
const S3 = S(C3);
// the page is 1,000 by 500 on screen at (140, 140); at R = -90 that is 500 by 1,000 in the world
const pTL = S3(140, 640); // world top-left: the screen bottom-left corner
const PAGE = {x: pTL.x, y: pTL.y, w: 500, h: 1000};
rules.push({id: 'edge', job: 'edge', from: {x: PAGE.x, y: PAGE.y}, angle: 90, length: PAGE.h, t0: lineStart(3, 22), until: lineStart(3, 2)});
panels.push({id: 'page', kind: 'page', ...PAGE, z: 0, colour: CREAM, ink: SLATE, bars: [], from: lineStart(3, 14),
  ops: [{t: lineStart(3, 14), op: 'open', edge: 'left', frames: 10}]});
const bSign = add({words: range(3, 0, 1), attach: 'FREE', font: 'anton', cap: 60, width: 900, on: 'page', colour: all(range(3, 0, 1), NIGHT),
  at: {...S3(200, 160), angle: 90},
  emerge: {move: 'hinge', from: {rule: 'edge', s: 0.5}, at: lineStart(3, 14), params: {panel: 'page'}}});
const bPage = add({words: range(3, 2, 2), attach: 'FREE', font: 'anton', cap: 372, width: 1000, on: 'page', colour: {[w(3, 2)]: SLATE},
  at: {...S3(200, 240), angle: 90},
  emerge: {move: 'hinge', from: {rule: 'edge', s: 0.5}, at: lineStart(3, 14), params: {panel: 'page'}}});
rig.push({t: lineStart(3, 22), kind: 'tilt', frames: 8, to: {rot: -90, zoom: 1, frame: {point: C3}}, label: 'TILT back to level, to the page'});

// ------------------------------------------------------------------ L4: SEAM, MORPH PAGE -> STAGE
add({words: range(4, 0, 1), attach: 'FREE', font: 'anton', cap: 72, width: 700,
  at: {...S3(200, 50), angle: 90},
  emerge: {move: 'seam', from: {word: w(3, 0), letter: 0, part: 'top'}, params: {side: 'U'}}});
add({words: range(4, 2, 2), attach: 'FREE', font: 'anton', cap: 372, width: 1200, colour: {[w(4, 2)]: RED},
  anchor: {to: {block: bPage, corner: 'tl'}, align: 'tl', angle: 90},
  emerge: morph({from: w(3, 2), keep: 'AGE'})});
rig.push({t: lineStart(4, 10), kind: 'tilt', frames: 9, to: {rot: -78, zoom: 0.8, frame: {point: S3(660, 340)}}, label: 'TILT +12 and out to 0.8 for SET THE STAGE'});
void bSign;

export const BOARD: Board = {
  id: 'example', start: START, end: END, bg: NIGHT, colour: CREAM, exit: 'none', font: 'anton',
  rigStart: {x: 640, y: 360, zoom: 1, rot: 0}, rig, rules, blocks, panels, graphics,
};

// ------------------------------------------------------------------ phase 2, group 1: FAN, DRAWER and a slideUp carry
// Second board (14.0 to 22.0 s, R 0):
//   L5  TURN THE CORNER    SHELF out of a floor rule
//   L6  AND FAN OUT        FAN +18 at the Joint (CORNER's last letter); fanTurn tilts the rig -18 about the Joint;
//                          the block sprouts out of the Joint
//   L7  OUT OF THE DRAWER  DRAWER out of the bottom edge of OUT, each word clipped there until it is sung
// then a STEP lifts the type above y 520 and the board slides up 520 px (carry slideUp, out) at B = frame 615.
// Third board (20.5 to 25 s): SLIDE UP is set on a shelf from the start, comes in from below with the carry (side
// 'in'), and is read when it is sung.
const B_SLIDE = 615;
const carryOut: Carry = {kind: 'slideUp', B: B_SLIDE, side: 'out'};
const carryIn: Carry = {kind: 'slideUp', B: B_SLIDE, side: 'in'};
const b2: Block[] = [];
const add2 = (b: Block) => b2.push(b) - 1;
const rules2: RuleDef[] = [{id: 'floor2', job: 'shelf', from: {x: 120, y: 250}, angle: 0, length: 1040, t0: 14.1, until: 17.4}];
const bTurn = add2({words: range(5, 0, 2), attach: 'FREE', font: 'anton', width: 1040, rows: [2, 1], hero: [w(5, 2)],
  anchor: {to: {rule: 'floor2', s: 0}, align: 'baselineL', offset: {x: 10, y: -8}},
  emerge: {move: 'shelf', from: {rule: 'floor2', s: 0.1}}});
const FAN = 18;
const bFan = add2({words: range(6, 0, 2), attach: 'FAN', fan: FAN, font: 'anton', cap: 84, width: 1000,
  emerge: {move: 'sprout', from: {word: w(5, 2), letter: 'last', part: 'flankR'}}});
add2({words: range(7, 0, 3), attach: 'FREE', font: 'anton', width: 1000, rows: [3, 1], hero: [w(7, 3)], style: {[w(7, 1)]: {tier: 1}, [w(7, 2)]: {tier: 1}},
  anchor: {to: {word: w(6, 2), part: 'foot'}, align: 'tl', angle: FAN, gap: 22, offset: {x: -40, y: 0}},
  emerge: drawer({host: w(6, 2), edge: 'bottom'})});
const rig2: RigKey[] = [
  {t: 14.0, kind: 'hold', still: true, label: 'rest'},
  fanTurn({t: lineStart(6, 5), fan: FAN, joint: w(5, 2), to: {frame: {block: bFan}}}),
  {t: lineStart(7, 8), kind: 'step', frames: 8, to: {frame: {words: range(7, 0, 3)}, screen: {x: 640, y: 300}}, label: 'STEP to the drawer'},
  {t: 20.0, kind: 'step', frames: 8, to: {frame: {words: range(7, 0, 3)}, screen: {x: 640, y: 150}}, label: 'STEP: lift the type above y 520 for the carry'},
  {t: B_SLIDE / 30, kind: 'hold', still: true, label: 'hold through the slideUp carry'},
];
void bTurn; void bFan;
export const BOARD2: Board = {
  id: 'fan and drawer', start: 14, end: (B_SLIDE + 45) / 30, bg: NIGHT, colour: CREAM, exit: 'none', font: 'anton',
  rigStart: {x: 640, y: 400, zoom: 1, rot: 0}, rig: rig2, rules: rules2, blocks: b2, carry: [carryOut],
};
// Third board (20.5 to 31.7 s): SLIDE UP comes in with the carry, then
//   L9   HIDE BEHIND IT        BEHIND: SLIDE UP carries a plate, which slides up and away; HIDE BEHIND IT is already there
//   L10  RUN ALONG THE WHOLE ROW  RUN: one row wider than the frame, the camera tracks along it (runTrack)
//   L11  TURN RIGHT            QUARTER: the rig rolls -90 about ROW's last letter; the block is attached CW (so it reads
//                              level); the row stays in frame as a vertical strip. A STEP then carries both to the
//                              left band, where the quarterCW turns them off the top of the frame
// then a quarterCW carry (B = frame 910, the incoming first word on 945) turns TURN RIGHT off the bottom of the frame
// while the fourth board, ALL THE WAY ROUND, turns in from -90.
const B_QUARTER = 910;
const FIRST_ROUND = 945;
const rules3: RuleDef[] = [{id: 'floor3', job: 'shelf', from: {x: 300, y: 420}, angle: 0, length: 680, persistent: true}];
const b3: Block[] = [];
const add3 = (b: Block) => b3.push(b) - 1;
const bSlide = add3({words: range(8, 0, 1), attach: 'FREE', font: 'anton', cap: 150, width: 1000, showFrom: B_SLIDE / 30, z: 1,
  anchor: {to: {rule: 'floor3', s: 0}, align: 'baselineL', offset: {x: 10, y: -8}},
  emerge: {move: 'shelf', from: {rule: 'floor3', s: 0.1}, params: {per: 'block'}}});
add3({words: range(9, 0, 2), attach: 'FREE', font: 'anton', cap: 72, rows: [3], width: 900, z: 0,
  style: {[w(9, 2)]: {tier: 1}},
  anchor: {to: {block: bSlide, corner: 'tl'}, align: 'tl', angle: -12, offset: {x: 10, y: 80}},
  emerge: behind({cover: [w(8, 0), w(8, 1)], exit: 'slide-up'})});
const bRun = add3({words: range(10, 0, 4), attach: 'FREE', font: 'anton', cap: 120, rows: [5], width: 4000,
  style: {[w(10, 1)]: {tier: 1}, [w(10, 2)]: {tier: 1}},
  anchor: {to: {block: bSlide, corner: 'bl'}, align: 'tl', angle: -12, offset: {x: 0, y: 330}},
  emerge: {move: 'seam', from: {word: w(9, 2), letter: 'last', part: 'foot'}, at: lineStart(10, 26), params: {side: 'D', order: 'rigid'}}});
const bTurn2 = add3({words: range(11, 0, 1), attach: 'CW', font: 'anton', cap: 100, rows: [1, 1], width: 400,
  emerge: {move: 'sprout', from: {word: w(10, 4), letter: 'last', part: 'flankR'}}});
const rig3: RigKey[] = [
  {t: B_SLIDE / 30, kind: 'hold', still: true, label: 'hold through the slideUp carry'},
  {t: lineStart(10, 22), kind: 'tilt', frames: 10, by: 12, to: {frame: {word: w(10, 0)}, screen: {x: 390, y: 360}}, label: 'TILT +12 to the start of the RUN row'},
  runTrack({words: range(10, 0, 4), lead: -6, screen: {x: 1080, y: 360}}),
  quarter({t: lineStart(11, 16), by: -90, joint: w(10, 4), frames: 12, to: {frame: {block: bTurn2}, screen: {x: 1060, y: 360}}}),
  {t: 29.8, kind: 'step', frames: 8, to: {frame: {block: bTurn2}, screen: {x: 130, y: 360}}, label: 'STEP to the left band before the quarterCW'},
  {t: B_QUARTER / 30, kind: 'hold', still: true, label: 'hold through the quarterCW carry'},
];
void bRun;
export const BOARD3: Board = {
  id: 'slide up', start: B_SLIDE / 30, end: (B_QUARTER + 45) / 30, bg: NIGHT, colour: CREAM, exit: 'none', font: 'anton',
  rigStart: {x: 640, y: 360, zoom: 1, rot: 0}, rules: rules3, rig: rig3, blocks: b3,
  carry: [carryIn, {kind: 'quarterCW', B: B_QUARTER, side: 'out', firstWord: FIRST_ROUND}],
  waive: [{rule: 'two-scales', why: 'a short demonstration board: no line here is set at the giant level'}],
};
const rules4: RuleDef[] = [{id: 'floor4', job: 'shelf', from: {x: 160, y: 470}, angle: 0, length: 960, persistent: true}];
export const BOARD4: Board = {
  id: 'all the way round', start: B_QUARTER / 30, end: 34, bg: NIGHT, colour: CREAM, exit: 'none', font: 'anton',
  rigStart: {x: 640, y: 360, zoom: 1, rot: 0}, rules: rules4,
  carry: [{kind: 'quarterCW', B: B_QUARTER, side: 'in', firstWord: FIRST_ROUND}],
  rig: [{t: B_QUARTER / 30, kind: 'hold', still: true, label: 'hold through the quarterCW carry'}],
  blocks: [{words: range(12, 0, 3), attach: 'FREE', font: 'anton', width: 960, rows: [2, 2], showFrom: B_QUARTER / 30,
    anchor: {to: {rule: 'floor4', s: 0}, align: 'bl', offset: {x: 0, y: -12}},
    emerge: {move: 'shelf', from: {rule: 'floor4', s: 0.1}, params: {per: 'block'}}}],
};

// ------------------------------------------------------------------ group 2 (34 to 43 s): the sheet-camera rules on
// L13 SLIDE IN FROM THE RIGHT slides up into a low row from the bottom frame edge (slideFrom: a word lands near the edge
// it enters from, or `slide-early` fails it); a fast STEP 700 px right leaves its first words cropped, so they are carried
// out (carryOut) while the rest stay; L14 RISE AND SHINE rises from behind its own foot line (rise). A lamp box at the
// right is a tracked prop the type keeps clear of (prop-clear, prop-size).
const LAMP = {x: 1760, y: 330, w: 120, h: 170};
const lampQuad: Pt[] = [{x: LAMP.x, y: LAMP.y}, {x: LAMP.x + LAMP.w, y: LAMP.y}, {x: LAMP.x + LAMP.w, y: LAMP.y + LAMP.h}, {x: LAMP.x, y: LAMP.y + LAMP.h}];
export const BOARD5: Board = {
  id: 'sheet rules', start: 34, end: 41, bg: NIGHT, colour: CREAM, exit: 'none', font: 'anton', sheetRules: true, carryOut: true,
  rigStart: {x: 640, y: 360, zoom: 1, rot: 0},
  waive: [{rule: 'two-scales', why: 'a short demonstration board: no line here is set at the giant level'}, {rule: 'level-run', why: 'a short demonstration board of two level lines'}],
  rules: [{id: 'floor5', job: 'shelf', from: {x: 800, y: 430}, angle: 0, length: 900, t0: 37.2, until: 41}],
  rig: [
    {t: lineStart(14, 22), kind: 'step', frames: 12, to: {frame: {point: {x: 1340, y: 360}}, screen: {x: 640, y: 360}}, label: 'STEP 700 px right'},
  ],
  blocks: [
    {words: range(13, 0, 4), attach: 'FREE', font: 'anton', width: 1100, rows: [5], anchor: {to: {point: {x: 90, y: 520}}, align: 'tl'}, style: {[w(13, 1)]: {tier: 1}, [w(13, 3)]: {tier: 1}},
      emerge: slideFrom({from: 'bottom'})},
    {words: range(14, 0, 2), attach: 'FREE', font: 'anton', width: 900, rows: [3], anchor: {to: {rule: 'floor5', s: 0}, align: 'bl', offset: {x: 0, y: -14}}, style: {[w(14, 1)]: {tier: 1}},
      emerge: rise({from: {rule: 'floor5', s: 0.2}})},
  ],
  graphics: [{id: 'lamp', layer: 'under', from: 37.2, until: 41, persistent: true, box: () => [lampQuad],
    draw: (_c, life) => createElement('rect', {x: LAMP.x, y: LAMP.y, width: LAMP.w, height: LAMP.h, fill: SLATE, opacity: Math.min(1, life.age / 6)})}],
  track: [{id: 'lamp', clear: true, minSize: 120, from: 37.2, to: 40.9, sample: (t) => (t >= 37.2 ? {opacity: Math.min(1, (t - 37.2) * 5), quad: lampQuad} : null)}],
};

// ------------------------------------------------------------------ group 3 (41 to 49 s): follow, station, sheet verbs
// L15 FOLLOW THE LONG LINE HOME is one row wider than the frame, rising out of a floor rule; a cameraFollow CRANE glides
// along it, holding the word being sung left of centre, and LONG grows (grow) with the row opening round it. station()
// takes the camera down to L16 TUMBLE TURN SINK SLIDE, rising from behind their own foot line, where each word then does its own verb: TUMBLE's letters fall
// out of frame, TURN turns its back, SINK sinks behind a shelf line, SLIDE slides off along the row.
const rules6: RuleDef[] = [{id: 'floor6', job: 'shelf', from: {x: 80, y: 520}, angle: 0, length: 2500, t0: 41.0, until: 44.2}];
export const BOARD6: Board = {
  id: 'follow and verbs', start: 41, end: DURATION_S, bg: NIGHT, colour: CREAM, exit: 'none', font: 'anton',
  rigStart: {x: 640, y: 360, zoom: 1, rot: 0}, rules: rules6,
  waive: [{rule: 'two-scales', why: 'a short demonstration board: no line here is set at the giant level'}, {rule: 'level-run', why: 'a short demonstration board of two level lines'}],
  rig: [
    cameraFollow({t: 41.5, frames: Math.round((43.6 - 41.5) * 30), words: [w(15, 0), w(15, 1), w(15, 2), w(15, 3), w(15, 4)], board: () => BOARD6, screen: {x: 520, y: 400}, lag: 14}),
    station({t: lineStart(16, 12), pin: {world: {x: 700, y: 1000}, screen: {x: 660, y: 380}}, frames: 12, label: 'station: down to L16'}),
  ],
  blocks: [
    {words: range(15, 0, 4), attach: 'FREE', font: 'anton', cap: 130, width: 2400, rows: [5], anchor: {to: {rule: 'floor6', s: 0}, align: 'bl', offset: {x: 0, y: -14}},
      style: {[w(15, 1)]: {tier: 1}}, emerge: {move: 'shelf', from: {rule: 'floor6', s: 0.05}},
      verb: [{name: 'grow', word: w(15, 2), at: 42.75, params: {to: 1.3, frames: 8}}]},
    {words: range(16, 0, 3), attach: 'FREE', font: 'anton', cap: 96, width: 900, rows: [4], anchor: {to: {point: {x: 120, y: 940}}, align: 'tl'},
      emerge: rise({from: {point: {x: 640, y: 1060}}}),
      verb: [
        {name: 'tumble', word: w(16, 0), at: 46.3, params: {span: 12}},
        {name: 'turnBack', word: w(16, 1), at: 46.5, params: {direction: 'left'}},
        {name: 'sinkBehind', word: w(16, 2), at: 46.7, params: {shelf: 520}},
        {name: 'slideAlong', word: w(16, 3), at: 46.9, params: {angle: 0, dist: 420}},
      ]},
  ],
};
export const BOARDS: Board[] = [BOARD, BOARD2, BOARD3, BOARD4, BOARD5, BOARD6];
