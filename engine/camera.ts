// The camera of a board is its rig (rig.ts): a pure function of (board, frame). This module holds the camera helpers the
// rest of the engine shares: the camera of a block (screen-pinned blocks use SCREEN_CAM) and the world/screen maps.
import {RIG_CENTRE, SCREEN_CAM} from './config';
import {carryCam} from './carry';
import {rigAt, rigMoves} from './rig';
import type {Board, CameraState, Pt} from './types';
import {rot} from './util';

export {SCREEN_CAM};

/** Camera moves of a board (for validator reports): the rig's keys. */
export const cameraMoves = (board: Board): {start: number; dur: number; kind: string}[] =>
  rigMoves(board).map((m) => ({start: m.start, dur: m.dur, kind: m.kind}));

/** Camera state of a board at a (fractional) frame. */
export const cameraAt = (board: Board, frame: number): CameraState => rigAt(board, frame);

/** Camera that draws a given block: the board camera, or SCREEN_CAM for a screen-pinned block. */
export const camForBlock = (board: Board, block: number, frame: number): CameraState =>
  board.blocks[block]?.pin === 'screen' ? carryCam(board, frame, SCREEN_CAM) : cameraAt(board, frame);

/** World -> screen for a camera state. */
export const toScreen = (cam: CameraState, p: Pt): Pt => {
  const q = rot({x: (p.x - cam.x) * cam.zoom, y: (p.y - cam.y) * cam.zoom}, cam.rot);
  return {x: q.x + RIG_CENTRE.x, y: q.y + RIG_CENTRE.y};
};
/** Screen -> world for a camera state. */
export const toWorld = (cam: CameraState, p: Pt): Pt => {
  const q = rot({x: p.x - RIG_CENTRE.x, y: p.y - RIG_CENTRE.y}, -cam.rot);
  return {x: q.x / cam.zoom + cam.x, y: q.y / cam.zoom + cam.y};
};
/** SVG transform string placing world space on screen. */
export const cameraTransform = (cam: CameraState) =>
  `translate(${RIG_CENTRE.x} ${RIG_CENTRE.y}) rotate(${cam.rot}) scale(${cam.zoom}) translate(${-cam.x} ${-cam.y})`;
