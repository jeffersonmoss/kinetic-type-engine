import {configureEngine, type EngineConfig} from '../engine/config';
import type {FrameFormat, SafeBox} from './formats';
import type {EngineLimits} from './limits';
import type {EngineLook} from './look';

export interface EngineContext {
  readonly format: Readonly<FrameFormat>;
  readonly safeBox: Readonly<SafeBox>;
  readonly fps: number;
  readonly beatFrames: number;
  readonly look: Readonly<Required<EngineLook>>;
  readonly fonts: Readonly<EngineConfig['fonts']>;
  readonly fontMetrics: Readonly<EngineConfig['metrics']>;
  readonly limits: Readonly<EngineLimits>;
}

export type EngineContextOptions = Omit<EngineConfig, 'format' | 'width' | 'height' | 'palette' | 'shadow' | 'metrics'> & {
  format: FrameFormat;
  look: EngineLook;
  fontMetrics: EngineConfig['metrics'];
};

const configurations = new WeakMap<EngineContext, EngineConfig>();

function frozenCopy<T>(value: T): T {
  if (value instanceof RegExp) return new RegExp(value) as T;
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy)) as T;
  if (value === null || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)]))) as T;
}

export function createEngineContext({look, fontMetrics, ...input}: EngineContextOptions): EngineContext {
  const config: EngineConfig = frozenCopy({...input, palette: look.palette, shadow: look.shadow ?? false, metrics: fontMetrics});
  const ctx = configureEngine(config, (derived) => Object.freeze({
    ...derived,
    look: Object.freeze({palette: config.palette, shadow: config.shadow ?? false}),
    fonts: config.fonts,
    fontMetrics: config.metrics,
  }));
  configurations.set(ctx, config);
  return ctx;
}

/** Scope a synchronous layout, validation, or draw call to a single engine context. */
export function withEngine<T>(ctx: EngineContext, fn: () => T): T {
  const config = configurations.get(ctx);
  if (!config) throw new Error('withEngine requires a context from createEngineContext');
  return configureEngine(config, () => {
    const result = fn();
    if (result != null && typeof (result as {then?: unknown}).then === 'function') {
      if (result instanceof Promise) void result.catch(() => {});
      throw new Error('withEngine requires a synchronous callback');
    }
    return result;
  });
}
