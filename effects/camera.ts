import type {RigKey} from '../engine/types';
import {defineEffect, frames, numberIn, type Env, type LineView} from './define';

function angles(line: LineView) {
  const prior = line.previousAngle ?? 0;
  const delta = line.placement === 'turnCW' ? 90 : line.placement === 'turnCCW' ? -90 : 0;
  const target = line.angle ?? (delta ? prior + delta : 0);
  const travel = ((target - prior + 540) % 360 + 360) % 360 - 180;
  return {target: prior + travel, travel};
}

function frameLine(line: LineView, env: Env, start: number, frames: number, fill: number, first: boolean): RigKey[] {
  const {target, travel} = angles(line);
  const rotation = first && Math.abs(travel) > 0.01;
  const duration = Math.max(frames, rotation ? Math.ceil(Math.abs(travel) * 8 / 90) : 6);
  const to = {frame: {block: line.block}, rot: -target, fill};
  return [
    {t: start / env.ctx.fps, kind: rotation ? 'roll' : first ? 'step' : 'dive', frames: duration, to},
    {t: (start + duration) / env.ctx.fps, kind: 'hold', still: true, frames: 0, to},
  ];
}

interface Follow {frames?: number; fill?: number}
export const follow = defineEffect<Follow>({
  name: 'follow', kind: 'camera', source: 'none',
  params: {frames: frames(6), fill: numberIn(0.1, 1)},
  duration: (p) => p.frames ?? 12,
  keys: (line, p, env) => frameLine(line, env, line.start, p.frames ?? 12, p.fill ?? 0.92, true),
});

interface Ladder {frames?: number; steps?: number}
export const zoomLadder = defineEffect<Ladder>({
  name: 'zoomLadder', kind: 'camera', source: 'none',
  params: {frames: frames(8), steps: {accepts: (x) => frames(2).accepts(x) && Number(x) <= 8, expected: '2 to 8 steps'}},
  duration: (p, ctx) => (p.steps ?? 2) * Math.max(Math.ceil(ctx.beatFrames), p.frames ?? 12, 16),
  keys(line, p, env) {
    const steps = p.steps ?? 2;
    const move = p.frames ?? 12;
    const gap = Math.max(Math.ceil(env.ctx.beatFrames), move, 16);
    const {travel} = angles(line);
    const keys: RigKey[] = [];
    let end = -Infinity;
    for (let i = 0; i < steps; i++) {
      const start = line.repeats?.[i] ?? line.start + gap * i;
      if (!Number.isFinite(start) || start < end) throw new Error(`zoomLadder: step ${i + 1} starts before the preceding move lands`);
      const frames = Math.max(move, i === 0 ? Math.ceil(Math.abs(travel) * 8 / 90) : 0);
      keys.push(...frameLine(line, env, start, frames, 0.7 + 0.24 * i / (steps - 1), i === 0));
      end = start + frames;
    }
    return keys;
  },
});
