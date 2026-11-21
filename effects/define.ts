import type {EngineContext} from '../context';
import type {FrameEdge, Pt, RigKey, SlideSource, TurnSpec, VerbDef} from '../engine/types';
import type {WordMod} from '../engine/verbRegistry';

export interface Box {x: number; y: number; width: number; height: number}
export interface GlyphRef {readonly word: number; readonly index: number}
/** A rotation and uniform scale from block coordinates to board or screen coordinates. */
export interface Space {origin: Pt; angle: number; scale: number}
export type Pin = 'board' | 'screen';
export interface Unit {
  readonly word: number;
  readonly text: string;
  readonly box: Box;
  readonly cap: number;
  readonly glyphs: readonly Glyph[];
}
export interface Glyph extends Omit<Unit, 'glyphs'>, GlyphRef {
  /** Ink bounds may include descenders. Landmark alignment uses the cap box. */
  readonly inkBox?: Box;
}
export interface BlockView {
  readonly units: readonly Unit[];
  space(pin: Pin, frame: number): Space;
}
export interface LineView {
  readonly block: number;
  readonly placement?: 'below' | 'above' | 'right' | 'left' | 'inside' | 'overlay' | 'turnCW' | 'turnCCW';
  readonly angle?: number;
  readonly previousAngle?: number;
  readonly start: number;
  /** Optional absolute frame starts for the successive camera steps. */
  readonly repeats?: readonly number[];
}
export type Pose = Partial<WordMod>;
export interface Env {
  readonly ctx: EngineContext;
  readonly frame?: number;
  readonly start?: number;
  readonly span?: number;
  readonly release?: number;
  readonly anchor?: SlideSource;
  readonly source?: Pt;
  readonly blockCentre?: Pt;
  readonly edge?: FrameEdge;
  readonly down?: Pt;
  readonly zoom?: number;
  readonly projectTurn?: (spec: TurnSpec, progress: number) => Pose | null;
  /** Cross-scene carrier, already drawn by the incoming board at its first frame. */
  readonly carryIn?: boolean;
  readonly keepFrom?: readonly GlyphRef[];
  readonly keepTo?: readonly GlyphRef[];
  /** Optional per-word progress for new ink, independent of kept glyph ownership. */
  readonly incomingProgress?: (word: number, frame: number) => number | undefined;
}
type Field<T> = {accepts: (value: unknown) => boolean; expected: string; required?: boolean; readonly value?: T};
export type ParamSchema<P> = {[K in keyof P]-?: Field<Exclude<P[K], undefined>>};
export const frames = (min: number): Field<number> => ({
  accepts: (value) => Number.isSafeInteger(value) && Number(value) >= min, expected: `an integer >= ${min}`,
});
export const numberIn = (min: number, max: number): Field<number> => ({
  accepts: (value) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max,
  expected: `a number from ${min} to ${max}`,
});
export const oneOf = <T extends string>(...values: T[]): Field<T> => ({
  accepts: (value) => values.some((item) => item === value), expected: values.join(' or '),
});
export const nonempty: Field<string> = {
  accepts: (value) => typeof value === 'string' && value.trim().length > 0, expected: 'nonempty text', required: true,
};

export interface Base<P extends object> {
  name: string;
  params: ParamSchema<P>;
  duration(p: Readonly<P>, ctx: EngineContext): number;
  /** Normalized progress at source release. */
  release?: number;
  source: 'landmark' | 'edge' | 'none';
}
export interface UnitEffectDef<P extends object> extends Base<P> {
  kind: 'enter' | 'exit' | 'accent';
  pose(u: number, unit: Unit, p: Readonly<P>, env: Env): Pose;
  ink(u: number, unit: Unit, p: Readonly<P>, env: Env): Box;
  bindsRepeats?: boolean;
  /** Override the nominal duration for a unit with this many glyphs. */
  span?(glyphs: number, p: Readonly<P>, ctx: EngineContext): number;
  /** Persistent exits, such as dock, remain as readable ink after motion. */
  persistent?: boolean;
  /** Whether the landmark stays lit until release. */
  holdsSource?: boolean;
}
export interface PairPlan {
  readonly keptMask: readonly GlyphRef[];
  readonly keptTargets: readonly GlyphRef[];
  poseIn(u: number, unit: Unit, frame?: number): Pose;
  poseKept(u: number, g: GlyphRef, frame?: number): Pose;
  poseOut?(u: number, unit: Unit, frame?: number): Pose;
  ink(u: number, unit: Unit, frame?: number): Box;
}
export interface PairTransformDef<P extends object> extends Base<P> {
  kind: 'transform';
  dismissesOld: boolean;
  plan(out: BlockView, inc: BlockView, p: Readonly<P>, env: Env): PairPlan;
}
export interface CameraRecipeDef<P extends object> extends Base<P> {
  kind: 'camera';
  keys(line: LineView, p: Readonly<P>, env: Env): RigKey[];
}
type Definition<P extends object> = UnitEffectDef<P> | PairTransformDef<P> | CameraRecipeDef<P>;
type Call<P extends object, D extends Definition<P>> = Readonly<{name: string; def: Readonly<D>; params: Readonly<P>}>;
export interface UnitCall<P extends object> extends Call<P, UnitEffectDef<P>> {
  readonly cascade?: Readonly<CascadeOptions>;
  readonly reversed?: boolean;
}
export type PairCall<P extends object> = Call<P, PairTransformDef<P>>;
export type CameraCall<P extends object> = Call<P, CameraRecipeDef<P>>;
type Builder<P extends object, D extends Definition<P>, C> =
  ((...args: {} extends P ? [params?: P] : [params: P]) => C) & {readonly def: Readonly<D>};
export type UnitBuilder<P extends object> = Builder<P, UnitEffectDef<P>, UnitCall<P>>;
export type PairBuilder<P extends object> = Builder<P, PairTransformDef<P>, PairCall<P>>;
export type CameraBuilder<P extends object> = Builder<P, CameraRecipeDef<P>, CameraCall<P>>;

const builtInNames = new Set<string>();
/** Use a separate scope when loading each film's local definitions. */
export const createEffectScope = () => new Set<string>();

function snapshot(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(snapshot));
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)])));
  }
  return value;
}

function parse<P extends object>(name: string, schema: ParamSchema<P>, value: unknown): Readonly<P> {
  if (value === undefined) value = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name}: expected a parameter object`);
  const fields: Record<string, Field<unknown>> = schema;
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(fields, key)) throw new Error(`${name}: unknown parameter "${key}"`);
  }
  for (const [key, field] of Object.entries(fields)) {
    const supplied = Object.hasOwn(input, key) ? input[key] : undefined;
    if (supplied === undefined ? field.required : !field.accepts(supplied)) {
      throw new Error(`${name}: parameter "${key}" must be ${field.expected}`);
    }
  }
  return snapshot({...input}) as Readonly<P>;
}

export function defineEffect<P extends object>(def: UnitEffectDef<P>, scope?: Set<string>): UnitBuilder<P>;
export function defineEffect<P extends object>(def: PairTransformDef<P>, scope?: Set<string>): PairBuilder<P>;
export function defineEffect<P extends object>(def: CameraRecipeDef<P>, scope?: Set<string>): CameraBuilder<P>;
export function defineEffect<P extends object>(def: Definition<P>, scope = builtInNames) {
  const {name} = def;
  if (!name.trim() || scope.has(name)) throw new Error(`Effect "${name}" is empty or already defined; use extendEffect for a named variant`);
  if (def.release !== undefined && !(def.release >= 0 && def.release <= 1)) throw new Error(`${name}: invalid release progress`);
  const params = Object.freeze(Object.fromEntries(Object.entries<Field<unknown>>(def.params).map(([key, field]) => [key, Object.freeze({...field})]))) as ParamSchema<P>;
  const frozen = Object.freeze({...def, params});
  scope.add(name);
  return Object.freeze(Object.assign((value?: P) => Object.freeze({name, def: frozen, params: parse(name, params, value)}), {def: frozen}));
}

export function extendEffect<P extends object>(base: UnitBuilder<P>, name: string,
  patch: Partial<Omit<UnitEffectDef<P>, 'name' | 'kind'>>, scope?: Set<string>): UnitBuilder<P>;
export function extendEffect<P extends object>(base: PairBuilder<P>, name: string,
  patch: Partial<Omit<PairTransformDef<P>, 'name' | 'kind'>>, scope?: Set<string>): PairBuilder<P>;
export function extendEffect<P extends object>(base: CameraBuilder<P>, name: string,
  patch: Partial<Omit<CameraRecipeDef<P>, 'name' | 'kind'>>, scope?: Set<string>): CameraBuilder<P>;
export function extendEffect<P extends object>(base: {def: Definition<P>}, name: string,
  patch: object, scope?: Set<string>) {
  const {def} = base;
  if (def.kind === 'camera') return defineEffect({...def, ...patch, name, kind: def.kind}, scope);
  if (def.kind === 'transform') return defineEffect({...def, ...patch, name, kind: def.kind}, scope);
  return defineEffect({...def, ...patch, name, kind: def.kind}, scope);
}

export interface CascadeOptions {
  by: 'glyph' | 'syllable' | 'word' | 'row';
  order?: 'reading' | 'reverse' | 'centreOut' | 'edgesIn';
  gap?: number;
  clock?: 'sung' | number;
}
export function cascade<P extends object>(call: UnitCall<P>, options: CascadeOptions): UnitCall<P> {
  if (call.cascade) throw new Error(`${call.name}: nested cascades need a single resolved unit schedule`);
  const schema: ParamSchema<CascadeOptions> = {
    by: {...oneOf('glyph', 'syllable', 'word', 'row'), required: true},
    order: oneOf('reading', 'reverse', 'centreOut', 'edgesIn'),
    gap: frames(0),
    clock: {accepts: (value) => value === 'sung' || frames(0).accepts(value), expected: 'sung or a non-negative frame gap'},
  };
  return Object.freeze({...call, cascade: parse(`${call.name} cascade`, schema, options)});
}
export function reverse<P extends object>(entrance: UnitCall<P>): UnitCall<P> {
  if (entrance.def.kind !== 'enter' || entrance.reversed) throw new Error(`${entrance.name}: reverse requires an entrance`);
  const name = `reverse(${entrance.name})`;
  const def: UnitEffectDef<P> = {
    ...entrance.def, name, kind: 'exit', holdsSource: false,
    pose: (u, unit, p, env) => entrance.def.pose(1 - u, unit, p, env),
    ink: (u, unit, p, env) => entrance.def.ink(1 - u, unit, p, env),
  };
  return Object.freeze({...entrance, name, def: Object.freeze(def), reversed: true});
}

export interface LegacyCall {
  readonly kind: 'legacy';
  readonly name: string;
  readonly params: Readonly<Record<string, unknown>>;
}
export const legacy = (name: string, params: Record<string, unknown> = {}): LegacyCall =>
  Object.freeze({kind: 'legacy', name, params: Object.freeze({...params})});

export type LegacyResolver = (name: string) => VerbDef | undefined;
