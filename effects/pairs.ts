import type {EngineContext} from '../context';
import type {VerbDef} from '../engine/types';
import type {LetterMod} from '../engine/verbRegistry';
import {
  defineEffect, frames, nonempty, oneOf,
  type BlockView, type Env, type Glyph, type GlyphRef, type PairCall, type PairPlan, type Pin, type Pose, type Unit,
} from './define';
import {clamp, easeOut, easeSine, glyphKey, lerp, mapPoint, pivotOf, poseInk, unitOf, unmapPoint} from './geometry';

function run(view: BlockView, keep: string, which: string, refs?: readonly GlyphRef[]): Glyph[] {
  const glyphs = view.units.flatMap((unit) => unit.glyphs.filter((glyph) => !/^\s$/u.test(glyph.text)));
  const text = [...keep.replace(/\s/gu, '')];
  const matches = (candidate: readonly (Glyph | undefined)[]) =>
    candidate.length === text.length && candidate.every((glyph, i) => glyph?.text === text[i]);
  if (refs) {
    const lookup = new Map(glyphs.map((glyph) => [glyphKey(glyph), glyph]));
    const candidate = refs.map((ref) => lookup.get(glyphKey(ref)));
    if (new Set(refs.map(glyphKey)).size === refs.length && matches(candidate)) return candidate as Glyph[];
    throw new Error(`${which}: explicit kept glyphs do not spell "${keep}"`);
  }
  const found = glyphs.flatMap((_, i) => {
    const candidate = glyphs.slice(i, i + text.length);
    return matches(candidate) ? [candidate] : [];
  });
  if (found.length !== 1) throw new Error(`${which}: kept run "${keep}" has ${found.length} matches; resolve its glyphs explicitly`);
  return found[0];
}
const letter = (p: Pose): LetterMod => ({
  dx: p.dx ?? 0, dy: p.dy ?? 0, rot: p.rot ?? 0, s: 1, sx: p.sx ?? 1, sy: p.sy ?? 1, opacity: p.opacity ?? 1,
});
const refOf = ({word, index}: Glyph): GlyphRef => ({word, index});

function planRun(out: BlockView, inc: BlockView, keep: string, pin: Pin, release: number,
  env: Env, roll: boolean): PairPlan {
  const label = roll ? 'slotRoll' : 'matchCut';
  const oldRun = run(out, keep, `${label} outgoing`, env.keepFrom);
  const newRun = run(inc, keep, `${label} incoming`, env.keepTo);
  const oldSpace = out.space(pin, env.start ?? 0);
  const kept = new Map(oldRun.map((glyph) => [glyphKey(glyph), glyph]));
  const incoming = new Map(newRun.map((glyph, i) => [glyphKey(glyph), oldRun[i]]));
  const transfer = (from: Glyph, to: Glyph, view: BlockView, frame: number, settle: number): Pose => {
    const target = view.space(pin, frame);
    const point = unmapPoint(target, mapPoint(oldSpace, pivotOf(from)));
    const pivot = pivotOf(to);
    const angle = ((oldSpace.angle - target.angle + 540) % 360 + 360) % 360 - 180;
    const ratio = oldSpace.scale / target.scale;
    return {
      dx: (point.x - pivot.x) * (1 - settle), dy: (point.y - pivot.y) * (1 - settle),
      rot: angle * (1 - settle),
      sx: lerp(ratio * from.box.width / Math.max(0.01, to.box.width), 1, settle),
      sy: lerp(ratio * from.cap / to.cap, 1, settle),
    };
  };
  const poseIn = (u: number, unit: Unit, frame = env.start ?? 0): Pose => {
    const after = release < 1 ? clamp((u - release) / (1 - release)) : Number(u >= release);
    return {letters: unit.glyphs.map((g) => {
      const previous = incoming.get(glyphKey(g));
      if (previous) {
        if (u >= 1 && release < 1) return letter({});
        if (!env.carryIn && u < release) return letter({opacity: 0});
        return letter(transfer(previous, g, inc, frame, easeSine(after)));
      }
      const timed = env.incomingProgress?.(unit.word, frame);
      const changed = timed ?? (roll ? after : u);
      if (roll) {
        const opening = u >= release ? changed : 0;
        return letter({sy: Math.sin(Math.PI / 2 * easeSine(opening)), dy: -g.cap * (1 - opening) / 2, opacity: clamp(opening * 3)});
      }
      return letter({dy: g.cap * 0.18 * (1 - easeOut(changed)), opacity: clamp((changed - 0.2) * 2.5)});
    })};
  };
  const poseKept = (u: number, g: GlyphRef, frame = env.start ?? 0): Pose => {
    const glyph = kept.get(glyphKey(g));
    if (!glyph) return {};
    return u < release ? transfer(glyph, glyph, out, frame, 0) : {opacity: 0};
  };
  const poseOut = (u: number, unit: Unit, frame?: number): Pose => ({letters: unit.glyphs.map((g) => {
    if (kept.has(glyphKey(g))) return letter(poseKept(u, g, frame));
    if (!roll) return letter({});
    const p = release > 0 ? clamp(u / release) : 1;
    return letter({sy: Math.cos(Math.PI / 2 * easeSine(p)), dy: g.cap * p / 2, opacity: 1 - p});
  })});
  return {
    keptMask: oldRun.map(refOf), keptTargets: newRun.map(refOf),
    poseIn, poseKept, poseOut,
    ink: (u, unit, frame) => poseInk(unit, poseIn(u, unit, frame)),
  };
}

interface Match {keep: string; pin: Pin; frames?: number}
export const matchCut = defineEffect<Match>({
  name: 'matchCut', kind: 'transform', source: 'landmark', dismissesOld: false, release: 0.5,
  params: {keep: nonempty, pin: {...oneOf('screen', 'board'), required: true}, frames: frames(6)},
  duration: (p) => p.frames ?? 12,
  plan: (out, inc, p, env) => planRun(out, inc, p.keep, p.pin, env.release ?? 0.5, env, false),
});

interface Slot {keep: string; frames?: number}
export const slotRoll = defineEffect<Slot>({
  name: 'slotRoll', kind: 'transform', source: 'landmark', dismissesOld: true, release: 0.5,
  params: {keep: nonempty, frames: frames(6)},
  duration: (p) => p.frames ?? 12,
  plan: (out, inc, p, env) => planRun(out, inc, p.keep, 'board', env.release ?? 0.5, env, true),
});

export interface PairBinding {
  out: BlockView;
  inc: BlockView;
  /** Absolute start frame, chosen by the compiler against both lines' readings. */
  at: number;
  keepFrom?: readonly GlyphRef[];
  keepTo?: readonly GlyphRef[];
  carryIn?: boolean;
  /** Per-word appearance and landing of changed glyphs. Kept glyphs transfer on the pair clock. */
  incoming?: readonly {word: number; start: number; end: number}[];
}

/** Lower a pair to a single cue on the incoming block. Its affected set also includes the old carrier. */
export function lowerPair<P extends object>(call: PairCall<P>, ctx: EngineContext, binding: PairBinding) {
  const {at, out, inc, carryIn, keepFrom, keepTo} = binding;
  const duration = call.def.duration(call.params, ctx);
  const release = call.def.release ?? 0.5;
  if (!Number.isSafeInteger(duration) || duration < 1 || !Number.isFinite(at)) throw new Error(`${call.name}: invalid pair timing`);
  const timing = new Map(binding.incoming?.map((span) => [span.word, {...span}]));
  if ([...timing.values()].some(({start, end}) => !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < at)) {
    throw new Error(`${call.name}: invalid incoming word timing`);
  }
  const incomingProgress = (word: number, frame: number) => {
    const span = timing.get(word);
    return span ? clamp((frame - span.start) / (span.end - span.start)) : undefined;
  };
  const plan = call.def.plan(out, inc, call.params, {ctx, start: at, release, carryIn, keepFrom, keepTo, incomingProgress});
  const incoming = inc.units.map((unit) => unit.word);
  const incomingSet = new Set(incoming);
  const kept = new Set(plan.keptMask.map(glyphKey));
  const old = carryIn ? [] : out.units.filter((unit) => call.def.dismissesOld || unit.glyphs.some((glyph) => kept.has(glyphKey(glyph))));
  if (old.some((unit) => incomingSet.has(unit.word))) throw new Error(`${call.name}: outgoing and incoming words need distinct IDs`);
  const affected = [...incoming, ...old.map((unit) => unit.word)];
  const releaseFrame = at + duration * release;
  const oldGone = new Set(old.filter((unit) => call.def.dismissesOld
    || unit.glyphs.every((glyph) => /^\s$/u.test(glyph.text) || kept.has(glyphKey(glyph)))).map((unit) => unit.word));
  const progress = (frame: number) => clamp((frame - at) / duration);
  const oldPose = (u: number, unit: Unit, frame: number) => plan.poseOut?.(u, unit, frame)
    ?? {letters: unit.glyphs.map((glyph) => letter(plan.poseKept(u, glyph, frame)))};
  const definition: VerbDef = {
    effectName: call.name,
    early: true, gradual: true,
    affects: () => [...affected],
    replacesEnter: () => [...incoming],
    defaultAt: () => at / ctx.fps,
    holds: () => carryIn ? [] : [...new Set(plan.keptMask.map(({word}) => word))].map((word) => ({word, until: releaseFrame})),
    removesAt: ({i}) => oldGone.has(i) ? releaseFrame : null,
    modify(c) {
      const u = progress(c.f);
      const unit = unitOf(c.geom);
      return incomingSet.has(c.i) ? plan.poseIn(u, unit, c.f) : oldPose(u, unit, c.f);
    },
    ink(c) {
      const u = progress(c.f);
      const unit = unitOf(c.geom);
      return incomingSet.has(c.i) ? plan.ink(u, unit, c.f) : poseInk(unit, oldPose(u, unit, c.f));
    },
  };
  return {definition, releaseFrame, keptMask: plan.keptMask, keptTargets: plan.keptTargets, dismissesOld: call.def.dismissesOld};
}
