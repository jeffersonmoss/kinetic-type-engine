import type {EngineContext} from '../context';
import type {Pt, TurnAxis, TurnPivot} from '../engine/types';
import {
  cascade, defineEffect, frames, nonempty, numberIn, oneOf, reverse, type StressSelector,
  type Base, type Env, type Pose, type Unit, type UnitCall, type UnitEffectDef,
} from './define';
import type {EffectTarget} from './lower';
import {clamp, easeOut, easeSine, lerp, pivotOf, poseInk} from './geometry';

type Timed = {frames?: number};
function unitEffect<P extends object>(
  def: Base<P> & Omit<UnitEffectDef<P>, keyof Base<P> | 'ink'>,
) {
  return defineEffect<P>({...def, ink: (u, unit, p, env) => poseInk(unit, def.pose(u, unit, p, env))});
}

type Rise = Timed & {dir?: 'up' | 'down' | 'left' | 'right'; gap?: number};
const lift: Record<NonNullable<Rise['dir']>, Pt> = {
  up: {x: 0, y: 1}, down: {x: 0, y: -1}, left: {x: 1, y: 0}, right: {x: -1, y: 0},
};
export const rise = unitEffect<Rise>({
  name: 'rise', kind: 'enter', source: 'landmark', release: 0.75, holdsSource: true,
  params: {frames: frames(6), dir: oneOf('up', 'down', 'left', 'right'), gap: numberIn(0, 200)},
  duration: (p) => p.frames ?? 8,
  pose(u, unit, p, env) {
    if (u >= 1) return {};
    const dir = lift[p.dir ?? 'up'];
    const centre = pivotOf(unit);
    const extent = dir.x ? unit.box.width : unit.box.height;
    const projected = env.source && ((env.source.x - centre.x) * dir.x + (env.source.y - centre.y) * dir.y);
    const distance = Math.min(extent * 2, Math.max(extent, projected ?? 0)) + (p.gap ?? 4);
    const travel = distance * (1 - easeOut(u));
    return {dx: dir.x * travel, dy: dir.y * travel, opacity: clamp(u * 2)};
  },
});

type Type = {gap?: number; fade?: number};
const typeParams = {gap: frames(0), fade: frames(1)};
const typeSpan = (glyphs: number, p: Type) => Math.max(0, glyphs - 1) * (p.gap ?? 2) + (p.fade ?? 3);
const typePose = (u: number, unit: Unit, p: Type, env: Env): Pose => {
  const elapsed = u * (env.span ?? typeSpan(unit.glyphs.length, p));
  const fading = (k: number) => clamp((elapsed - k * (p.gap ?? 2)) / (p.fade ?? 3));
  if (unit.glyphs.length === 1) return {opacity: fading(0)};
  return {letters: unit.glyphs.map((_, k) => ({dx: 0, dy: 0, rot: 0, s: 1, opacity: fading(k)}))};
};
export const type = unitEffect<Type>({
  name: 'type', kind: 'enter', source: 'none', params: typeParams,
  duration: (p) => p.fade ?? 3, span: typeSpan, pose: typePose,
});
export const nest = unitEffect<Type>({
  name: 'nest', kind: 'enter', source: 'landmark', holdsSource: true, params: typeParams,
  duration: (p) => p.fade ?? 3, span: typeSpan, pose: typePose,
});

type TurnIn = Timed & {axis?: TurnAxis; pivot?: TurnPivot; perspective?: number};
export const turnIn = unitEffect<TurnIn>({
  name: 'turnIn', kind: 'enter', source: 'edge',
  params: {frames: frames(6), axis: oneOf('x', 'y'), pivot: oneOf('left', 'right', 'top', 'bottom', 'centre'),
    perspective: numberIn(50, 10000)},
  duration: (p) => p.frames ?? 12,
  pose(u, unit, p, env) {
    if (u >= 1) return {};
    const axis = p.axis ?? (env.edge === 'left' || env.edge === 'right' ? 'y' : 'x');
    const pivot = p.pivot ?? env.edge ?? 'bottom';
    const projected = env.projectTurn?.({axis, pivot, perspective: p.perspective, ease: 'outCubic'}, u);
    const opening = Math.sin(easeOut(u) * Math.PI / 2);
    const affine = axis === 'x' ? {sy: opening} : {sx: opening};
    const centre = env.blockCentre ?? pivotOf(unit);
    const dx = env.source ? (env.source.x - centre.x) * (1 - easeOut(u)) : 0;
    const dy = env.source ? (env.source.y - centre.y) * (1 - easeOut(u)) : 0;
    return {...(projected ?? affine), dx: dx + (projected?.dx ?? 0), dy: dy + (projected?.dy ?? 0), opacity: clamp(u * 3)};
  },
});

const stampFrames = (p: Timed, ctx: EngineContext) => p.frames ?? Math.max(8, Math.round(ctx.beatFrames));
export const stamp = unitEffect<Timed>({
  name: 'stamp', kind: 'enter', source: 'landmark', params: {frames: frames(6)}, holdsSource: true,
  duration: stampFrames,
  pose(u, unit, p, env) {
    if (u >= 1) return {};
    const span = env.span ?? stampFrames(p, env.ctx);
    const hit = clamp((u * span - Math.max(0, span - 8)) / Math.min(8, span));
    const centre = pivotOf(unit);
    const settle = 1 - easeOut(hit);
    const source = env.source;
    const aim = (target: number | undefined, rest: number) =>
      Math.max(-unit.cap / 2, Math.min(unit.cap / 2, (target ?? rest) - rest)) * settle;
    return {sx: 1 + 0.24 * settle, sy: 1 + 0.24 * settle,
      dx: aim(source?.x, centre.x), dy: aim(source?.y, centre.y), opacity: clamp(hit * 4)};
  },
});

const repeatStackEffect = unitEffect<Timed & {clock?: 'sung'}>({
  name: 'repeatStack', kind: 'enter', source: 'landmark', bindsRepeats: true, holdsSource: true,
  params: {clock: oneOf('sung'), frames: frames(6)},
  duration: (p) => p.frames ?? 8,
  pose(u, unit) {
    if (u >= 1) return {};
    return {dy: unit.cap * 0.32 * (1 - easeOut(u)), opacity: clamp(2 * u)};
  },
});

/** The compiler emits a row copy for each occurrence, so a later landmark can address the second copy. */
export const repeatStack = Object.assign((params: {frames?: number; clock?: 'sung'} = {}) => {
  const call = repeatStackEffect(params);
  return params.clock === 'sung' ? cascade(call, {by: 'word', clock: 'sung'}) : call;
}, {def: repeatStackEffect.def});

export interface RepeatToken {word: number; text: string; sungFrame: number}
/** Bind repeated sung copies of a row, preserving the second occurrence as its own landmark. */
export function bindRepeatStack(phrase: readonly string[], tokens: readonly RepeatToken[], firstRow = 0): EffectTarget[] {
  if (!phrase.length || tokens.length < phrase.length || tokens.length % phrase.length !== 0
    || new Set(tokens.map((token) => token.word)).size !== tokens.length) {
    throw new Error('repeatStack: expected complete sung copies of the row with distinct word IDs');
  }
  return tokens.map((token, index) => {
    const expected = phrase[index % phrase.length];
    if (token.text !== expected || !Number.isFinite(token.sungFrame)) {
      throw new Error(`repeatStack: token ${token.word} must spell "${expected}" and have a sung frame`);
    }
    return {word: token.word, row: firstRow + Math.floor(index / phrase.length),
      glyphs: [...expected].length, sungFrame: token.sungFrame};
  });
}

export const fall = unitEffect<Timed>({
  name: 'fall', kind: 'exit', source: 'none', params: {frames: frames(6)}, duration: (p) => p.frames ?? 24,
  pose(u, _unit, p, env) {
    const span = env.span ?? p.frames ?? 24;
    const dist = env.ctx.limits.speedCap * span / (2 * (env.zoom ?? 1));
    const down = env.down ?? {x: 0, y: 1};
    return {dx: down.x * dist * u ** 2, dy: down.y * dist * u ** 2, opacity: 1 - clamp((u - 1 / 3) * 1.5)};
  },
});
export const fade = unitEffect<Timed>({
  name: 'fade', kind: 'exit', source: 'none', params: {frames: frames(6)}, duration: (p) => p.frames ?? 8,
  pose: (u) => ({opacity: 1 - u}),
});

export function retractExit<P extends object>(entrance: UnitCall<P>): UnitCall<P> {
  const reversed = reverse(entrance);
  return Object.freeze({...reversed, name: `retractExit(${entrance.name})`,
    def: Object.freeze({...reversed.def, name: 'retractExit'})});
}

type Dock = Timed & {to?: 'margin' | 'spine'; scale?: number};
export const dockExit = unitEffect<Dock>({
  name: 'dockExit', kind: 'exit', persistent: true, source: 'landmark',
  params: {to: oneOf('margin', 'spine'), scale: numberIn(0.1, 1), frames: frames(6)},
  duration: (p) => p.frames ?? 14,
  pose(u, unit, p, env) {
    if (!env.source || !env.blockCentre) throw new Error('dockExit requires a resolved margin or spine and a block centre');
    const centre = pivotOf(unit);
    const t = easeSine(u);
    const s = lerp(1, p.scale ?? 0.45, t);
    return {sx: s, sy: s, keepAlive: true, opacity: lerp(1, 0.45, t),
      dx: (env.source.x - env.blockCentre.x) * t + (centre.x - env.blockCentre.x) * (s - 1),
      dy: (env.source.y - env.blockCentre.y) * t + (centre.y - env.blockCentre.y) * (s - 1)};
  },
});

type Punch = Timed & {word?: string; scale?: number};
const punch = unitEffect<Punch>({
  name: 'beatPunch', kind: 'accent', source: 'none', hit: 0.5,
  params: {word: {...nonempty, required: false}, scale: numberIn(1, 1.35), frames: frames(6)},
  duration: (p) => p.frames ?? 8,
  pose(u, _unit, p) {
    if (u >= 1) return {};
    const s = 1 + ((p.scale ?? 1.12) - 1) * Math.sin(Math.PI * u) ** 2;
    return {sx: s, sy: s};
  },
});
export const beatPunch = Object.assign((target: string | StressSelector, params: Omit<Punch, 'word'> = {}) => {
  if (typeof target === 'string') {
    if (!target.trim()) throw new Error('beatPunch: word must be nonempty text');
    return punch({...params, word: target});
  }
  return Object.freeze({...punch(params), stressTarget: target});
}, {def: punch.def});
