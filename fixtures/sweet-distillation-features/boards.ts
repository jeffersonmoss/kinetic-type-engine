// The Sweet Distillation features fixture (KIT.md section 20): one small board per engine addition, on a made-up lyric.
// Data only, so the validator can load it:
//   node tools/validate-boards.mjs fixtures/sweet-distillation-features/boards.ts            (BOARDS: serif hub and the rest)
//   node tools/validate-boards.mjs fixtures/sweet-distillation-features/boards.ts HUB_BARLOW (the hub in Barlow Condensed)
//   node tools/morph-drift.mjs fixtures/sweet-distillation-features/boards.ts [HUB_BARLOW]   (the kept letters' drift, K7)
// Boards:
//   hub      K7 + K3: DISTILLATION! > NATION > VACATION > DISTILLATION > STATION. > SELF-EDUCATION. > DISTILLATION >
//            IMITATION, each the morph of the one before (keep 'ation', match 'end', pin), every block on one anchor
//            point (baselineR, hang), each word doing `wah` with still 'ation' through the morph that replaces it
//   critic   K1: a Paren Pair round (IS IT DIFFERENT?), opening once, holding, closing
//   picture  K2: BIG TOP [rocka] BOOK, rocka drawn by a graphic
//   clear    K4: a Dusk disc with clears and keep: CLEAR THE GROUND is retired by its edge, KEEP THIS stays
//   last     K1: (NOT THE SAME): the pair slides off both frame edges, re-enters round a crate and carries it off right
import './song';
import {createElement} from 'react';
import {LINES, WORDS, morph, parenPair, wordCorners, type Block, type Board, type DecorGraphic, type FontKey, type Pt} from '../../engine';
import {BRICK, CREAM, DUSK, INK, POOL, SUN} from './song';

const w = (line: number, k = 0) => LINES[line].words[k];
const range = (line: number): [number, number] => [w(line, 0), w(line, LINES[line].words.length - 1)];
const REST = {x: 640, y: 360, zoom: 1, rot: 0};

// ------------------------------------------------------------------ hub (K7, K3)
/** The shared anchor of every hub word: the end of its baseline (punctuation hangs past it). */
export const HUB: Pt = {x: 1120, y: 420};
const HUB_LINES = [0, 1, 2, 3, 4, 5, 6, 7];
const hubBlocks = (font: FontKey): Block[] => HUB_LINES.map((line, k) => {
  const i = w(line);
  const next = k + 1 < HUB_LINES.length ? WORDS[w(HUB_LINES[k + 1])].start_s : undefined;
  return {
    words: [i, i], attach: 'FREE', font, cap: 88, colour: {[i]: CREAM},
    anchor: {to: {point: HUB}, align: 'baselineR', hang: true},
    keepUntil: next,
    emerge: k === 0 ? {move: 'type', from: {point: HUB}} : morph({from: w(HUB_LINES[k - 1]), keep: 'ation', match: 'end', pin: true}),
    // the talk box: the front of the word waves from 10 frames after it is sung until the morph that replaces it is done
    verb: [{name: 'wah', word: i, dur: next !== undefined ? next - WORDS[i].start_s - 10 / 30 : 1.2, params: {still: 'ation'}}],
  };
});
const hubBoard = (font: FontKey, id: string): Board => ({
  id, start: 0.5, end: 13.0, bg: DUSK, exit: 'fade', rigStart: REST, vignette: false, blocks: hubBlocks(font),
  waive: [
    {rule: 'two-scales', why: 'a test board of one-word lines at one size; nothing is meant to be giant'},
    {rule: 'level-run', why: 'the hub holds still and level on purpose: the pinned suffix is the subject'},
    {rule: 'variety', why: 'the hub holds still on purpose: the pinned suffix is the subject'},
  ],
});

// ------------------------------------------------------------------ critic (K1 open, hold, close)
// the opening ends as IS lands (it would cross IS's ink if it started on IS's sung frame, the default `at`)
const critic = parenPair({block: 0, from: 13.25, at: 13.25, until: 16.6, colour: INK, font: 'barlow'});

// ------------------------------------------------------------------ picture word (K2)
const ROCKA = w(9, 2);
const rocka: DecorGraphic = {
  id: 'rocka', layer: 'over', from: 18.2, until: 19.9,
  box: ({layout}) => { const g = layout.words.get(ROCKA)!; return [wordCorners(layout.blocks[g.block], g)]; },
  draw: (c) => {
    const g = c.layout.words.get(ROCKA)!;
    const q = wordCorners(c.layout.blocks[g.block], g);
    const [a, b, d, e] = q;
    // a rocket on its side: a body and a nose, filling the word's box
    const nose = {x: (b.x + d.x) / 2, y: (b.y + d.y) / 2};
    const bx = a.x + (b.x - a.x) * 0.72;
    return createElement('g', null,
      createElement('path', {d: `M${a.x} ${a.y}L${bx} ${a.y}L${nose.x} ${nose.y}L${bx} ${e.y}L${e.x} ${e.y}Z`, fill: BRICK}),
      createElement('circle', {cx: a.x + (bx - a.x) * 0.6, cy: nose.y, r: (e.y - a.y) * 0.22, fill: CREAM}));
  },
};

// ------------------------------------------------------------------ clearing disc (K4)
const KEEP = range(11);

// ------------------------------------------------------------------ last scene (K1 slide off, re-enter, carry)
const CRATE = {x: 460, y: 330, w: 360, h: 180};
const crate: DecorGraphic = {
  id: 'crate', layer: 'under', from: 30.2, until: 34.2, persistent: true,
  box: () => [[{x: CRATE.x, y: CRATE.y}, {x: CRATE.x + CRATE.w, y: CRATE.y}, {x: CRATE.x + CRATE.w, y: CRATE.y + CRATE.h}, {x: CRATE.x, y: CRATE.y + CRATE.h}]],
  draw: () => createElement('rect', {x: CRATE.x, y: CRATE.y, width: CRATE.w, height: CRATE.h, rx: 12, fill: POOL}),
};
const last = parenPair({block: 0, from: 27.0 - 0.6, at: 27.0 - 0.6, until: 34.2, colour: INK, font: 'barlow',
  exit: 'slide', exitAt: 28.7, reenter: {at: 30.5, rect: CRATE, carry: {at: 32.2, edge: 'right', graphics: ['crate']}}});

export const BOARDS: Board[] = [
  hubBoard('serif', 'hub'),
  {
    id: 'critic', start: 13.2, end: 17.0, bg: SUN, exit: 'fade', rigStart: REST, vignette: false,
    blocks: [{words: range(8), attach: 'FREE', font: 'barlow', cap: 90, at: {x: 330, y: 310, angle: 0}, emerge: {move: 'type', from: {point: {x: 330, y: 310}}}}],
    graphics: [...critic.graphics],
    track: critic.track(() => BOARDS[1]),
    waive: [{rule: 'two-scales', why: 'a one-line test board'}, {rule: 'level-run', why: 'a one-line test board'}],
  },
  {
    id: 'picture', start: 17.4, end: 21.2, bg: SUN, exit: 'fade', rigStart: REST, vignette: false,
    blocks: [{words: range(9), attach: 'FREE', font: 'anton', cap: 100, at: {x: 120, y: 290, angle: 0}, style: {[ROCKA]: {picture: 'rocka'}},
      emerge: {move: 'type', from: {point: {x: 120, y: 290}}}}],
    graphics: [rocka],
    waive: [{rule: 'two-scales', why: 'a one-line test board'}, {rule: 'level-run', why: 'a one-line test board'}],
  },
  {
    id: 'clear', start: 21.5, end: 25.5, bg: SUN, exit: 'fade', rigStart: REST, vignette: false,
    blocks: [
      {words: range(10), attach: 'FREE', font: 'anton', cap: 100, at: {x: 160, y: 170, angle: 0}, emerge: {move: 'type', from: {point: {x: 160, y: 170}}}},
      {words: KEEP, attach: 'FREE', font: 'anton', cap: 100, at: {x: 160, y: 420, angle: 0}, colour: {[KEEP[0]]: BRICK, [KEEP[1]]: BRICK}, emerge: {move: 'type', from: {point: {x: 160, y: 420}}}},
    ],
    ground: [{colour: DUSK, shape: 'disc', t0: 23.3, from: {x: 900, y: 260}, clears: true, keep: [KEEP[0], KEEP[1]]}],
    waive: [{rule: 'two-scales', why: 'a test board'}, {rule: 'level-run', why: 'a test board'}],
  },
  {
    id: 'last', start: 26.2, end: 34.4, bg: SUN, exit: 'fade', rigStart: REST, vignette: false,
    blocks: [{words: range(12), attach: 'FREE', font: 'barlow', cap: 90, at: {x: 360, y: 90, angle: 0}, emerge: {move: 'type', from: {point: {x: 360, y: 90}}}}],
    graphics: [...last.graphics, ...last.wrap([crate])],
    track: last.track(() => BOARDS[4]),
    waive: [{rule: 'two-scales', why: 'a one-line test board'}, {rule: 'level-run', why: 'a one-line test board'}],
  },
];
/** The hub again in Barlow Condensed (upper case, a second face for the pinned suffix; it has no N-stop kern). */
export const HUB_BARLOW: Board[] = [hubBoard('barlow', 'hub barlow')];
