// The vanish-retire fixture (KIT.md item 83): a row leaves by a `vanish` cue (letters fade in reading order) and the
// next row enters through its old place. Reuses the Sweet Distillation features song (made-up lyric, no audio).
//   node tools/validate-boards.mjs fixtures/vanish-retire/boards.ts              (BOARDS: 0 errors expected)
//   node tools/validate-boards.mjs fixtures/vanish-retire/boards.ts NO_VANISH    (same board without the vanish: overlap errors)
//   node tools/validate-boards.mjs fixtures/vanish-retire/boards.ts SCOPED       (NO_VANISH with an overlap waiver scoped to KEEP THIS: warnings)
//   node tools/validate-boards.mjs fixtures/vanish-retire/boards.ts SCOPED_MISS  (the waiver scoped to other words: still errors)
// Before item 83 the validator kept a vanished word "visible" (its word opacity stayed 1 while only its letters
// faded), so BOARDS reported overlap errors between CLEAR THE GROUND and KEEP THIS.
import '../sweet-distillation-features/song';
import {LINES, type Block, type Board, type Waiver} from '../../engine';
import {BRICK, SUN} from '../sweet-distillation-features/song';

const range = (line: number): [number, number] => [LINES[line].words[0], LINES[line].words[LINES[line].words.length - 1]];
const REST = {x: 640, y: 360, zoom: 1, rot: 0};
const GONE = range(10); // CLEAR THE GROUND, sung 22.0 to 22.6, line ends 23.2, retires 23.4
const KEEP = range(11); // KEEP THIS, sung from 23.4, set exactly where CLEAR THE GROUND stood
const AT = {x: 160, y: 300, angle: 0};

const blocks = (vanish: boolean): Block[] => [
  {words: GONE, attach: 'FREE', font: 'anton', cap: 100, at: AT, emerge: {move: 'type', from: {point: {x: AT.x, y: AT.y}}},
    // 14 letters one frame apart from frame 673.5, each fading over 6 frames: all gone by frame 692.5, before KEEP's
    // TYPE entrance starts (frame 693; it is sung at 702). Each word's reading ends when its last letter drops below
    // 0.45 (CLEAR 681.8, THE 684.8, GROUND 690.8), so none is checked for visibility after it has vanished.
    verb: vanish ? [{name: 'vanish', word: GONE[0], words: [GONE[0], GONE[0] + 1, GONE[1]], at: 22.45, params: {perLetter: 1}}] : undefined},
  {words: KEEP, attach: 'FREE', font: 'anton', cap: 100, at: AT, colour: {[KEEP[0]]: BRICK, [KEEP[1]]: BRICK}, emerge: {move: 'type', from: {point: {x: AT.x, y: AT.y}}}},
];
const WAIVE = [{rule: 'two-scales', why: 'a test board'}, {rule: 'level-run', why: 'a test board'}];
const board = (id: string, vanish: boolean, extra: Waiver[] = []): Board => ({
  id, start: 21.5, end: 25.5, bg: SUN, exit: 'fade', rigStart: REST, vignette: false, blocks: blocks(vanish), waive: [...WAIVE, ...extra],
});

export const BOARDS: Board[] = [board('vanish retire', true)];
export const NO_VANISH: Board[] = [board('no vanish', false)];
export const SCOPED: Board[] = [board('scoped waiver', false, [{rule: 'overlap', words: KEEP, why: 'scoped to KEEP THIS'}])];
export const SCOPED_MISS: Board[] = [board('scoped waiver, other words', false, [{rule: 'overlap', words: [0, 7], why: 'scoped to the hub words'}])];
