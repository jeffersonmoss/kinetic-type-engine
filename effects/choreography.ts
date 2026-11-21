import {toScreen} from '../engine/camera';
import {blockToWorld, wordCorners} from '../engine/layout';
import type {BlockGeom, CameraState, FrameEdge, Pt, WordGeom} from '../engine/types';
import {defineEffect, frames, numberIn, oneOf, type Env, type Pose, type Unit, type UnitCall} from './define';
import {easeSine, poseInk, rotate} from './geometry';

type Turn = {axis: 'x' | 'y'; frames?: number};
const turnParams = {axis: {...oneOf('x', 'y'), required: true}, frames: frames(1)};
function turnPose(u: number, {axis}: Turn, env: Env): Pose {
  if (u >= 1) return {};
  const spec = {axis, unit: 'word', pivot: 'centre', frames: 1, perspective: 6000, ease: 'sine'} as const;
  const projection = env.projectTurn?.(spec, u);
  const scale = Math.sin(Math.PI / 2 * easeSine(u));
  return projection ?? (axis === 'x' ? {sy: scale} : {sx: scale});
}
function turnOutPose(u: number, p: Turn, env: Env): Pose {
  return u >= 1 ? {...turnPose(0, p, env), hidden: true} : turnPose(1 - u, p, env);
}

export const quarterTurnIn = defineEffect<Turn>({
  name: 'quarterTurnIn', kind: 'enter', source: 'none', params: turnParams,
  duration: (p) => p.frames ?? 9,
  pose: (u, _, p, env) => turnPose(u, p, env),
  ink: (u, unit, p, env) => poseInk(unit, turnPose(u, p, env)),
});
export const quarterTurnOut = defineEffect<Turn>({
  name: 'quarterTurnOut', kind: 'exit', source: 'none', params: turnParams,
  duration: (p) => p.frames ?? 9,
  pose: (u, _, p, env) => turnOutPose(u, p, env),
  ink: (u, unit, p, env) => poseInk(unit, turnOutPose(u, p, env)),
});

type Depth = {frames?: number; spin?: number};
const depthParams = {frames: frames(1), spin: numberIn(-360, 360)};
// Scale is the perspective factor for depth P * (1 / scale - 1). At infinite distance the box has zero area.
function depthPose(u: number, {spin = 0}: Depth): Pose {
  const p = easeSine(u);
  return {sx: p, sy: p, rot: spin * (1 - p) ** 2, hidden: p === 0};
}
export const diveIn = defineEffect<Depth>({
  name: 'diveIn', kind: 'enter', source: 'none', params: depthParams,
  duration: (p) => p.frames ?? 9,
  pose: (u, _, p) => depthPose(u, p),
  ink: (u, unit, p) => poseInk(unit, depthPose(u, p)),
});
export const diveOut = defineEffect<Depth>({
  name: 'diveOut', kind: 'exit', source: 'none', params: depthParams,
  duration: (p) => p.frames ?? 9,
  pose: (u, _, p) => depthPose(1 - u, p),
  ink: (u, unit, p) => poseInk(unit, depthPose(1 - u, p)),
});

type Slide = {dx: number; dy: number; frames?: number};
const slideParams = {dx: {...numberIn(-10000, 10000), required: true}, dy: {...numberIn(-10000, 10000), required: true}, frames: frames(1)};
function slidePose(u: number, {dx, dy}: Slide): Pose {
  const p = easeSine(u);
  return {dx: p * dx, dy: p * dy};
}
function pushOutPose(u: number, p: Slide): Pose {
  return {...slidePose(u, p), hidden: u >= 1};
}
export const pushIn = defineEffect<Slide>({
  name: 'pushIn', kind: 'enter', source: 'none', params: slideParams,
  duration: (p) => p.frames ?? 12,
  pose: (u, _, p) => slidePose(1 - u, p),
  ink: (u, unit, p) => poseInk(unit, slidePose(1 - u, p)),
});
export const pushOut = defineEffect<Slide>({
  name: 'pushOut', kind: 'exit', source: 'none', params: slideParams,
  duration: (p) => p.frames ?? 12,
  pose: (u, _, p) => pushOutPose(u, p),
  ink: (u, unit, p) => poseInk(unit, pushOutPose(u, p)),
});

type Tumble = {frames?: number};
function tumblePose(u: number, unit: Unit, env: Env): Pose {
  const p = easeSine(u);
  const down = env.down ?? {x: 0, y: 1};
  const travel = 2 * Math.hypot(env.ctx.format.width, env.ctx.format.height) / Math.max(0.01, env.zoom ?? 1);
  return {
    hidden: u >= 1,
    letters: unit.glyphs.map((_, i) => {
      const spread = (i - (unit.glyphs.length - 1) / 2) * 0.09;
      return {
        dx: p * travel * (down.x + down.y * spread),
        dy: p * travel * (down.y - down.x * spread),
        rot: p * (180 + i * 45) * (i % 2 ? 1 : -1), s: 1, opacity: 1,
      };
    }),
  };
}
export const tumbleOut = defineEffect<Tumble>({
  name: 'tumbleOut', kind: 'exit', source: 'none', params: {frames: frames(1)},
  duration: (p) => p.frames ?? 16,
  pose: (u, unit, _, env) => tumblePose(u, unit, env),
  ink: (u, unit, _, env) => poseInk(unit, tumblePose(u, unit, env)),
});

export const flip = defineEffect<Turn>({
  name: 'flip', kind: 'accent', source: 'none', params: turnParams,
  duration: (p) => p.frames ?? 14,
  pose(u, _, p, env) {
    if (u <= 0 || u >= 1) return {};
    return turnPose(Math.abs(2 * u - 1), p, env);
  },
  ink(u, unit, p, env) {
    return poseInk(unit, u <= 0 || u >= 1 ? {} : turnPose(Math.abs(2 * u - 1), p, env));
  },
});

type Reframe = Slide & {turn: number; scale: number; offsetX?: number; offsetY?: number};
const reframeParams = {...slideParams, turn: {...numberIn(-360, 360), required: true},
  scale: {...numberIn(0.05, 10), required: true}, offsetX: numberIn(-10000, 10000), offsetY: numberIn(-10000, 10000)};
function reframePose(u: number, {dx, dy, turn, scale, offsetX = 0, offsetY = 0}: Reframe): Pose {
  const p = easeSine(u);
  const s = 1 + (scale - 1) * p;
  const offset = rotate({x: offsetX * s, y: offsetY * s}, p * turn);
  return {dx: p * dx + offset.x - offsetX, dy: p * dy + offset.y - offsetY, rot: p * turn, sx: s, sy: s};
}
export const reframe = defineEffect<Reframe>({
  name: 'reframe', kind: 'accent', source: 'none', params: reframeParams,
  duration: (p) => p.frames ?? 12,
  pose: (u, _, p) => reframePose(u, p),
  ink: (u, unit, p) => poseInk(unit, reframePose(u, p)),
});

/** Block-local displacement that moves a word completely past the given frame edge at camera `cam`. */
export function pushVector(shape: BlockGeom, word: WordGeom, cam: CameraState,
  format: {width: number; height: number}, side: FrameEdge, margin = 4): {dx: number; dy: number} {
  const pts = wordCorners(shape, {...word, h: word.boxH}).map((p) => toScreen(cam, p));
  const xs = pts.map(({x}) => x), ys = pts.map(({y}) => y);
  const screen: Pt = side === 'left' ? {x: -(Math.max(...xs) + margin), y: 0}
    : side === 'right' ? {x: format.width - Math.min(...xs) + margin, y: 0}
    : side === 'top' ? {x: 0, y: -(Math.max(...ys) + margin)}
    : {x: 0, y: format.height - Math.min(...ys) + margin};
  const zoom = Math.max(0.01, cam.zoom);
  const local = rotate({x: screen.x / zoom, y: screen.y / zoom}, -shape.angle - cam.rot);
  return {dx: local.x, dy: local.y};
}

export interface ScreenPose {scale: number; angle: number; centre: Pt}
/** Build a `reframe()` accent moving a word between two screen-space lockup poses about `pivot`. */
export function reframeBetween(shape: BlockGeom, word: WordGeom, cam: CameraState, pivot: Pt,
  from: ScreenPose, to: ScreenPose, duration?: number): UnitCall<Reframe> {
  const origin = toScreen(cam, blockToWorld(shape, {x: word.x + word.w / 2, y: word.y + word.h / 2}));
  const angle = -shape.angle - cam.rot;
  const zoom = Math.max(0.01, cam.zoom);
  const occupied = rotate({x: (origin.x - pivot.x) * from.scale / zoom, y: (origin.y - pivot.y) * from.scale / zoom}, from.angle);
  const offset = rotate(occupied, angle);
  const d = rotate({x: (to.centre.x - from.centre.x) / zoom, y: (to.centre.y - from.centre.y) / zoom}, angle);
  return reframe({
    dx: d.x, dy: d.y, offsetX: offset.x, offsetY: offset.y,
    turn: to.angle - from.angle, scale: to.scale / from.scale,
    ...(duration !== undefined ? {frames: duration} : {}),
  });
}
